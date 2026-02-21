from __future__ import annotations

import ipaddress
import json
import logging
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4
from xml.etree import ElementTree as ET

from redis import Redis
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.published_at import infer_published_at, parse_datetime
from app.core.config import settings
from app.core.tag_utils import normalize_hashtag
from app.db.session import SessionLocal
from app.infra.network import urlopen_with_optional_proxy
from app.infra.llm_client import LLMClient, LLMClientError
from app.infra.redis_client import get_redis
from app.infra.source_fetcher import fetch_source_for_analysis
from app.models.aggregate_item import AggregateItem
from app.models.source_creator import SourceCreator
from app.schemas.feed import RefreshAggregatesResponse

DEFAULT_PORTS = {"http": 80, "https": 443}
MAX_ANALYSIS_TAGS = 5
MAX_KEY_POINTS = 3
AGGREGATION_SOURCES_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "aggregation_sources.json"
SKIP_LINK_PREFIXES = ("javascript:", "mailto:", "tel:", "#")
SKIP_FILE_SUFFIXES = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".pdf",
    ".xml",
    ".json",
    ".zip",
    ".mp4",
    ".mp3",
}
TRACKING_QUERY_KEYS = {"ref", "source", "spm", "from", "fbclid", "gclid"}
REFRESH_JOB_KEY_PREFIX = "aggregation:refresh:job:"
REFRESH_JOB_MAX_FAILURE_EVENTS = 120
logger = logging.getLogger(__name__)


@dataclass(slots=True)
class AggregateAnalysisResult:
    source_language: str
    title: str | None
    title_zh: str | None
    published_at: datetime | None
    summary_text: str
    summary_text_zh: str | None
    tags: list[str]
    tags_zh: list[str]
    model_provider: str | None
    model_name: str | None
    model_version: str | None


@dataclass(slots=True)
class FeedEntryCandidate:
    source_url: str
    source_title: str | None
    published_at: datetime | None


class AggregationStageError(ValueError):
    def __init__(self, message: str, *, stage: str, retryable: bool, error_class: str | None = None) -> None:
        super().__init__(message)
        self.stage = stage
        self.retryable = retryable
        self.error_class = (error_class or self.__class__.__name__)[:96]


class AggregationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.llm_client = LLMClient()
        self._refresh_failures: list[dict[str, Any]] = []
        self._latest_analysis_failure: dict[str, Any] | None = None

    def ensure_preset_sources(self) -> None:
        preset_sources = _load_preset_source_configs()
        if not preset_sources:
            return

        existing_sources = list(self.db.scalars(select(SourceCreator)))
        existing_by_slug: dict[str, SourceCreator] = {source.slug: source for source in existing_sources}
        existing_by_domain: dict[str, SourceCreator] = {
            source.source_domain: source for source in existing_sources if source.source_domain
        }

        changed = False
        for item in preset_sources:
            current = existing_by_slug.get(item["slug"]) or existing_by_domain.get(item["source_domain"])
            if current:
                next_slug = item["slug"]
                next_display = item["display_name"]
                next_domain = item["source_domain"]
                next_feed_url = item["feed_url"]
                next_homepage_url = item["homepage_url"]
                source_changed = False

                if current.slug != next_slug:
                    conflict = existing_by_slug.get(next_slug)
                    if not conflict or conflict.id == current.id:
                        existing_by_slug.pop(current.slug, None)
                        current.slug = next_slug
                        existing_by_slug[next_slug] = current
                        source_changed = True
                if current.display_name != next_display:
                    current.display_name = next_display
                    source_changed = True
                if current.source_domain != next_domain:
                    existing_by_domain.pop(current.source_domain, None)
                    current.source_domain = next_domain
                    existing_by_domain[next_domain] = current
                    source_changed = True
                if current.feed_url != next_feed_url:
                    current.feed_url = next_feed_url
                    source_changed = True
                if current.homepage_url != next_homepage_url:
                    current.homepage_url = next_homepage_url
                    source_changed = True

                if source_changed:
                    self.db.add(current)
                    changed = True
                continue

            creator = SourceCreator(
                slug=item["slug"],
                display_name=item["display_name"],
                source_domain=item["source_domain"],
                feed_url=item["feed_url"],
                homepage_url=item["homepage_url"],
                is_active=item["is_active"],
                is_deleted=False,
                deleted_at=None,
            )
            self.db.add(creator)
            existing_by_slug[creator.slug] = creator
            existing_by_domain[creator.source_domain] = creator
            changed = True

        if changed:
            self.db.commit()

    def refresh_active_items(self) -> RefreshAggregatesResponse:
        sources = list(
            self.db.scalars(
                select(SourceCreator)
                .where(
                    SourceCreator.is_active.is_(True),
                    SourceCreator.is_deleted.is_(False),
                )
                .order_by(SourceCreator.slug.asc())
            )
        )
        return self._refresh_sources(sources)

    def refresh_single_source(self, *, source_id: UUID) -> RefreshAggregatesResponse:
        source = self.db.scalar(
            select(SourceCreator).where(
                SourceCreator.id == source_id,
                SourceCreator.is_deleted.is_(False),
            )
        )
        if not source:
            raise ValueError("信息源不存在")
        return self._refresh_sources([source])

    def reanalyze_single_item(self, *, item_id: UUID) -> bool:
        item = self.db.scalar(
            select(AggregateItem)
            .join(SourceCreator, SourceCreator.id == AggregateItem.source_creator_id)
            .options(joinedload(AggregateItem.source_creator))
            .where(
                AggregateItem.id == item_id,
                SourceCreator.is_deleted.is_(False),
            )
        )
        if not item or not item.source_creator:
            raise ValueError("聚合条目不存在")

        if item.analysis_status == "running":
            return False

        item.analysis_status = "pending"
        item.analysis_error = None
        self.db.add(item)
        self.db.flush()

        self._run_analysis(item=item, source=item.source_creator)
        self.db.commit()
        return True

    def _refresh_sources(self, sources: list[SourceCreator]) -> RefreshAggregatesResponse:
        refreshed = 0
        failed = 0
        self._refresh_failures = []

        for source in sources:
            source_started_at = datetime.now(timezone.utc)
            try:
                feed_entries = self._collect_feed_entries(source)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                self._record_refresh_failure(
                    source_id=str(source.id),
                    source_slug=source.slug,
                    item_id=None,
                    source_url=source.feed_url,
                    stage=self._classify_feed_error_stage(exc),
                    error_class=self._extract_error_class(exc),
                    error_message=self._extract_error_message(exc, fallback="抓取信息源失败"),
                    elapsed_ms=self._elapsed_ms(source_started_at),
                    retryable=self._is_retryable_error(exc),
                )
                continue

            items = self._ensure_items_for_source(source=source, feed_entries=feed_entries)
            if not items:
                failed += 1
                self._record_refresh_failure(
                    source_id=str(source.id),
                    source_slug=source.slug,
                    item_id=None,
                    source_url=source.feed_url,
                    stage="feed_parse",
                    error_class="ValueError",
                    error_message="信息源没有产出可分析条目",
                    elapsed_ms=self._elapsed_ms(source_started_at),
                    retryable=False,
                )
                continue

            for item in items:
                if not self._should_run_analysis(item):
                    continue
                if self._run_analysis(item=item, source=source):
                    refreshed += 1
                else:
                    failed += 1
                    if self._latest_analysis_failure:
                        self._record_refresh_failure(**self._latest_analysis_failure)
                    else:
                        self._record_refresh_failure(
                            source_id=str(source.id),
                            source_slug=source.slug,
                            item_id=str(item.id),
                            source_url=item.source_url_normalized,
                            stage="unknown",
                            error_class="ValueError",
                            error_message=(item.analysis_error or "聚合分析失败")[:500],
                            elapsed_ms=None,
                            retryable=False,
                        )

        self.db.commit()
        return RefreshAggregatesResponse(
            total_sources=len(sources),
            refreshed_items=refreshed,
            failed_items=failed,
        )

    def _collect_feed_entries(self, source: SourceCreator) -> list[FeedEntryCandidate]:
        feed_xml = self._fetch_feed_xml(source.feed_url)
        raw_entries = self._parse_feed_entries(feed_xml)

        max_items = max(1, settings.aggregation_max_items_per_source)
        entries: list[FeedEntryCandidate] = []
        seen_urls: set[str] = set()

        for raw_entry in raw_entries:
            source_url = (raw_entry.get("link") or "").strip()
            if not source_url:
                continue
            if source_url.lower().startswith(SKIP_LINK_PREFIXES):
                continue

            try:
                _, normalized_url, host = self._normalize_source_url(source_url)
            except ValueError:
                continue

            if not self._domain_matches(host, source.source_domain):
                continue
            if self._looks_like_asset_url(normalized_url):
                continue
            if normalized_url in seen_urls:
                continue

            seen_urls.add(normalized_url)
            entries.append(
                FeedEntryCandidate(
                    source_url=normalized_url,
                    source_title=self._normalize_title(raw_entry.get("title")),
                    published_at=self._parse_datetime(raw_entry.get("published")),
                )
            )
            if len(entries) >= max_items:
                break

        if not entries:
            raise ValueError("未解析到可用的 RSS/Atom 条目")

        return entries

    def _ensure_items_for_source(
        self,
        *,
        source: SourceCreator,
        feed_entries: list[FeedEntryCandidate],
    ) -> list[AggregateItem]:
        items: list[AggregateItem] = []

        for entry in feed_entries:
            try:
                item = self._ensure_item_for_source_url(
                    source=source,
                    source_url=entry.source_url,
                    source_title=entry.source_title,
                    published_at=entry.published_at,
                )
            except ValueError:
                continue
            items.append(item)

        return items

    def _ensure_item_for_source_url(
        self,
        *,
        source: SourceCreator,
        source_url: str,
        source_title: str | None,
        published_at: datetime | None,
    ) -> AggregateItem:
        source_url_raw, source_url_normalized, source_domain = self._normalize_source_url(source_url)
        if not self._domain_matches(source_domain, source.source_domain):
            raise ValueError("来源域名不匹配")

        item = self.db.scalar(select(AggregateItem).where(AggregateItem.source_url_normalized == source_url_normalized))
        if item:
            item.source_creator_id = source.id
            item.source_url = source_url_raw
            item.source_domain = source_domain
            if source_title:
                item.source_title = source_title[:512]
            if published_at and (item.published_at is None or published_at > item.published_at):
                item.published_at = published_at
            item.tags_json = self._merge_tags(item.tags_json or [], source.slug)
            self.db.add(item)
            self.db.flush()
            return item

        item = AggregateItem(
            source_creator_id=source.id,
            source_url=source_url_raw,
            source_url_normalized=source_url_normalized,
            source_domain=source_domain,
            source_language=None,
            source_title=(source_title or "")[:512] or None,
            source_title_zh=None,
            tags_json=[source.slug],
            tags_zh_json=[source.slug],
            analysis_status="pending",
            analysis_error=None,
            summary_text=None,
            summary_text_zh=None,
            key_points_json=[],
            model_provider=self._analysis_model_provider(),
            model_name=self._analysis_model_name(),
            model_version=self._analysis_model_version(),
            published_at=published_at,
        )
        self.db.add(item)
        self.db.flush()
        return item

    def _should_run_analysis(self, item: AggregateItem) -> bool:
        if item.analysis_status in {"pending", "failed"}:
            return True
        if item.analysis_status == "running":
            return False
        return not bool((item.summary_text or "").strip())

    def _run_analysis(self, *, item: AggregateItem, source: SourceCreator) -> bool:
        started_at = datetime.now(timezone.utc)
        self._latest_analysis_failure = None
        item.analysis_status = "running"
        item.analysis_error = None
        self.db.add(item)
        self.db.flush()

        try:
            try:
                title, content, _, inferred_published_at = self._fetch_source_document(item.source_url)
            except Exception as exc:  # noqa: BLE001
                raise AggregationStageError(
                    self._extract_error_message(exc, fallback="获取来源内容失败"),
                    stage="content_fetch",
                    retryable=self._is_retryable_error(exc),
                    error_class=self._extract_error_class(exc),
                ) from exc
            if not content:
                raise AggregationStageError(
                    "来源内容为空，无法分析",
                    stage="content_fetch",
                    retryable=False,
                    error_class="ValueError",
                )

            try:
                result = self._analyze_with_model(
                    source_url=item.source_url,
                    source_domain=item.source_domain,
                    source_title=title,
                    source_slug=source.slug,
                    content=content,
                    inferred_published_at=inferred_published_at,
                )
            except AggregationStageError:
                raise
            except Exception as exc:  # noqa: BLE001
                raise AggregationStageError(
                    self._extract_error_message(exc, fallback="模型分析失败"),
                    stage="llm_request",
                    retryable=self._is_retryable_error(exc),
                    error_class=self._extract_error_class(exc),
                ) from exc

            item.source_title = (result.title or item.source_title or "")[:512] or None
            item.source_title_zh = (result.title_zh or "")[:512] or None
            item.source_language = result.source_language
            if item.published_at is None and result.published_at is not None:
                item.published_at = result.published_at
            item.summary_text = result.summary_text
            item.summary_text_zh = result.summary_text_zh
            item.tags_json = result.tags
            item.tags_zh_json = result.tags_zh
            item.key_points_json = self._extract_key_points(content=content, summary_text=result.summary_text)
            item.analysis_status = "succeeded"
            item.analysis_error = None
            item.model_provider = result.model_provider
            item.model_name = result.model_name
            item.model_version = result.model_version
            self.db.add(item)
            self.db.flush()
            return True
        except Exception as exc:  # noqa: BLE001
            item.analysis_status = "failed"
            item.analysis_error = self._extract_error_message(exc, fallback="聚合分析失败")
            self.db.add(item)
            self.db.flush()
            if isinstance(exc, AggregationStageError):
                stage = exc.stage
                retryable = exc.retryable
                error_class = exc.error_class
            else:
                stage = "unknown"
                retryable = self._is_retryable_error(exc)
                error_class = self._extract_error_class(exc)
            self._latest_analysis_failure = {
                "source_id": str(source.id),
                "source_slug": source.slug,
                "item_id": str(item.id),
                "source_url": item.source_url_normalized,
                "stage": stage,
                "error_class": error_class,
                "error_message": item.analysis_error,
                "elapsed_ms": self._elapsed_ms(started_at),
                "retryable": retryable,
            }
            return False

    def _analyze_with_model(
        self,
        *,
        source_url: str,
        source_domain: str,
        source_title: str | None,
        source_slug: str,
        content: str,
        inferred_published_at: datetime | None,
    ) -> AggregateAnalysisResult:
        try:
            result = self.llm_client.analyze(
                source_url=source_url,
                source_domain=source_domain,
                source_title=source_title,
                content=content,
                repair_mode=False,
            )
        except LLMClientError as exc:
            if exc.code != "invalid_output":
                raise AggregationStageError(
                    exc.message,
                    stage="llm_request",
                    retryable=self._is_retryable_error(exc, message=exc.message),
                    error_class="LLMClientError",
                ) from exc
            try:
                result = self.llm_client.analyze(
                    source_url=source_url,
                    source_domain=source_domain,
                    source_title=source_title,
                    content=content,
                    repair_mode=True,
                )
            except LLMClientError as second_exc:
                raise AggregationStageError(
                    second_exc.message,
                    stage="llm_parse",
                    retryable=False,
                    error_class="LLMClientError",
                ) from second_exc

        summary_text = (result.summary or "").strip()[:400]
        if not summary_text:
            raise AggregationStageError(
                "模型未返回有效摘要",
                stage="llm_parse",
                retryable=False,
                error_class="ValueError",
            )

        tags = self._merge_tags(result.tags, source_slug)
        if not tags:
            tags = [source_slug]
        tags_zh = self._merge_tags(result.tags_zh or result.tags, source_slug)
        if not tags_zh:
            tags_zh = list(tags)
        title = (result.title or source_title or "")[:512] or None
        if result.source_language == "zh":
            title_zh = (result.title_zh or title or "")[:512] or None
            summary_text_zh = (result.summary_zh or summary_text)[:400]
        else:
            title_zh = (result.title_zh or "")[:512] or None
            summary_text_zh = (result.summary_zh or "").strip()[:400] or None

        return AggregateAnalysisResult(
            source_language=result.source_language,
            title=title,
            title_zh=title_zh,
            published_at=result.published_at or inferred_published_at,
            summary_text=summary_text,
            summary_text_zh=summary_text_zh,
            tags=tags,
            tags_zh=tags_zh,
            model_provider=settings.llm_provider_name,
            model_name=result.model_name or settings.llm_model_name,
            model_version=None,
        )

    def _extract_key_points(self, *, content: str, summary_text: str) -> list[str]:
        key_points: list[str] = []
        for piece in re.split(r"[。！？.!?]", content):
            line = piece.strip()
            if len(line) < 12:
                continue
            key_points.append(line[:96])
            if len(key_points) >= MAX_KEY_POINTS:
                break
        if not key_points:
            key_points = [summary_text[:96]]
        while len(key_points) < MAX_KEY_POINTS:
            key_points.append("建议结合原文阅读全文，避免断章取义。")
        return key_points[:MAX_KEY_POINTS]

    def _merge_tags(self, *groups: Any) -> list[str]:
        merged: list[str] = []
        seen: set[str] = set()

        for group in groups:
            values: list[Any]
            if isinstance(group, str):
                values = [group]
            elif isinstance(group, list):
                values = group
            else:
                continue
            for raw in values:
                if not isinstance(raw, str):
                    continue
                tag = normalize_hashtag(raw)
                if not tag or tag in seen:
                    continue
                seen.add(tag)
                merged.append(tag)
                if len(merged) >= MAX_ANALYSIS_TAGS:
                    return merged

        return merged

    def get_refresh_failures(self) -> list[dict[str, Any]]:
        return [dict(item) for item in self._refresh_failures]

    def _record_refresh_failure(
        self,
        *,
        source_id: str | None,
        source_slug: str | None,
        item_id: str | None,
        source_url: str | None,
        stage: str,
        error_class: str,
        error_message: str,
        elapsed_ms: int | None,
        retryable: bool,
    ) -> None:
        if len(self._refresh_failures) >= REFRESH_JOB_MAX_FAILURE_EVENTS:
            return
        self._refresh_failures.append(
            {
                "source_id": source_id,
                "source_slug": source_slug,
                "item_id": item_id,
                "source_url": source_url,
                "stage": self._normalize_stage(stage),
                "error_class": (error_class or "Exception")[:96],
                "error_message": (error_message or "未知错误")[:500],
                "elapsed_ms": elapsed_ms,
                "retryable": bool(retryable),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    def _classify_feed_error_stage(self, exc: Exception) -> str:
        if isinstance(exc, AggregationStageError):
            return self._normalize_stage(exc.stage)
        message = self._extract_error_message(exc, fallback="")
        lowered = message.lower()
        if "解析" in message or "xml" in lowered or "atom" in lowered or "rss" in lowered:
            return "feed_parse"
        return "feed_fetch"

    def _normalize_stage(self, stage: str) -> str:
        allowed = {"feed_fetch", "feed_parse", "content_fetch", "llm_request", "llm_parse", "db_write"}
        normalized = (stage or "").strip().lower()
        if normalized in allowed:
            return normalized
        return "unknown"

    def _extract_error_class(self, exc: BaseException) -> str:
        if isinstance(exc, AggregationStageError):
            return exc.error_class
        return exc.__class__.__name__

    def _extract_error_message(self, exc: BaseException, *, fallback: str) -> str:
        message = str(exc).strip()
        return (message or fallback)[:500]

    def _elapsed_ms(self, started_at: datetime) -> int:
        return max(0, int((datetime.now(timezone.utc) - started_at).total_seconds() * 1000))

    def _is_retryable_error(self, exc: BaseException, *, message: str | None = None) -> bool:
        lowered = (message or str(exc) or "").strip().lower()
        if not lowered:
            lowered = exc.__class__.__name__.lower()

        retryable_hints = (
            "timed out",
            "timeout",
            "temporarily unavailable",
            "connection reset",
            "connection aborted",
            "connection refused",
            "name or service not known",
            "temporary failure",
            "try again",
            "429",
            "502",
            "503",
            "504",
            "rate limit",
            "overloaded",
        )
        return any(hint in lowered for hint in retryable_hints)

    def _analysis_model_provider(self) -> str:
        return settings.llm_provider_name

    def _analysis_model_name(self) -> str:
        return settings.llm_model_name

    def _analysis_model_version(self) -> str | None:
        return None

    def _fetch_feed_xml(self, feed_url: str) -> str:
        request = urllib.request.Request(
            feed_url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
                ),
                "Accept": "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
            },
        )
        try:
            with urlopen_with_optional_proxy(request, timeout=settings.note_fetch_timeout_seconds) as response:
                raw = response.read(settings.note_fetch_max_bytes)
                encoding = response.headers.get_content_charset() or "utf-8"
        except Exception as exc:  # noqa: BLE001
            raise AggregationStageError(
                self._extract_error_message(exc, fallback="抓取 RSS/Atom 失败"),
                stage="feed_fetch",
                retryable=self._is_retryable_error(exc),
                error_class=self._extract_error_class(exc),
            ) from exc

        return raw.decode(encoding, errors="ignore")

    def _parse_feed_entries(self, xml_text: str) -> list[dict[str, str | None]]:
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as exc:
            raise AggregationStageError(
                "RSS/Atom 解析失败",
                stage="feed_parse",
                retryable=False,
                error_class="ParseError",
            ) from exc

        root_name = _local_name(root.tag)
        if root_name in {"rss", "rdf", "rdf:rdf"}:
            return self._parse_rss_entries(root)
        if root_name == "feed":
            return self._parse_atom_entries(root)

        # fallback detection
        if any(_local_name(child.tag) == "item" for child in root.iter()):
            return self._parse_rss_entries(root)
        if any(_local_name(child.tag) == "entry" for child in root.iter()):
            return self._parse_atom_entries(root)
        return []

    def _parse_rss_entries(self, root: ET.Element) -> list[dict[str, str | None]]:
        channel = None
        for child in root:
            if _local_name(child.tag) == "channel":
                channel = child
                break
        if channel is None:
            channel = root

        entries: list[dict[str, str | None]] = []
        for item in channel:
            if _local_name(item.tag) != "item":
                continue
            link = _first_child_text(item, "link")
            if not link:
                continue
            title = _first_child_text(item, "title")
            published = _first_child_text(item, "pubDate") or _first_child_text(item, "date")
            entries.append({"link": link, "title": title, "published": published})
        return entries

    def _parse_atom_entries(self, root: ET.Element) -> list[dict[str, str | None]]:
        entries: list[dict[str, str | None]] = []
        for entry in root:
            if _local_name(entry.tag) != "entry":
                continue

            link = None
            for child in entry:
                if _local_name(child.tag) != "link":
                    continue
                href = (child.attrib.get("href") or "").strip()
                rel = (child.attrib.get("rel") or "").strip().lower()
                if not href:
                    continue
                if not rel or rel == "alternate":
                    link = href
                    break
                if link is None:
                    link = href

            if not link:
                continue

            title = _first_child_text(entry, "title")
            published = _first_child_text(entry, "published") or _first_child_text(entry, "updated")
            entries.append({"link": link, "title": title, "published": published})

        return entries

    def _fetch_source_document(self, source_url: str) -> tuple[str | None, str, str, datetime | None]:
        fetched = fetch_source_for_analysis(
            source_url=source_url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
            },
        )
        published_at = fetched.published_at_hint or infer_published_at(
            source_url=fetched.resolved_source_url or source_url,
            document=fetched.document,
        )
        return fetched.title, fetched.content, fetched.resolved_source_url, published_at

    def _normalize_source_url(self, raw_url: str) -> tuple[str, str, str]:
        source_url = raw_url.strip()
        parsed = urllib.parse.urlsplit(source_url)
        scheme = parsed.scheme.lower()
        if scheme not in {"http", "https"}:
            raise ValueError("仅支持 http/https 链接")
        if parsed.username or parsed.password:
            raise ValueError("链接格式不合法")
        try:
            port = parsed.port
        except ValueError as exc:
            raise ValueError("链接格式不合法") from exc

        host = (parsed.hostname or "").strip().lower()
        if not host:
            raise ValueError("链接格式不合法")
        self._ensure_public_host(host)

        normalized = self._normalize_generic_url(parsed=parsed, host=host, port=port)
        return source_url, normalized, host

    def _normalize_generic_url(self, *, parsed: urllib.parse.SplitResult, host: str, port: int | None) -> str:
        scheme = parsed.scheme.lower()
        host_for_netloc = f"[{host}]" if ":" in host else host
        netloc = host_for_netloc
        if port and port != DEFAULT_PORTS.get(scheme):
            netloc = f"{host_for_netloc}:{port}"
        path = parsed.path or "/"
        if not path.startswith("/"):
            path = f"/{path}"
        query = self._strip_tracking_query(parsed.query)
        return urllib.parse.urlunsplit((scheme, netloc, path, query, ""))

    def _strip_tracking_query(self, query: str) -> str:
        if not query:
            return ""
        pairs = urllib.parse.parse_qsl(query, keep_blank_values=True)
        kept: list[tuple[str, str]] = []
        for key, value in pairs:
            normalized_key = key.strip().lower()
            if not normalized_key:
                continue
            if normalized_key.startswith("utm_") or normalized_key in TRACKING_QUERY_KEYS:
                continue
            kept.append((key, value))
        return urllib.parse.urlencode(kept, doseq=True)

    def _looks_like_asset_url(self, url: str) -> bool:
        parsed = urllib.parse.urlsplit(url)
        path = (parsed.path or "").strip().lower()
        if not path:
            return False
        return any(path.endswith(ext) for ext in SKIP_FILE_SUFFIXES)

    def _ensure_public_host(self, host: str) -> None:
        if host == "localhost" or host.endswith(".local"):
            raise ValueError("不支持内网或本地链接")
        try:
            ip = ipaddress.ip_address(host)
        except ValueError:
            return
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise ValueError("不支持内网或本地链接")

    def _domain_matches(self, host: str, source_domain: str) -> bool:
        normalized_host = host.strip().lower().strip(".")
        normalized_domain = source_domain.strip().lower().strip(".")
        if not normalized_host or not normalized_domain:
            return False
        return normalized_host == normalized_domain or normalized_host.endswith(f".{normalized_domain}")

    def _parse_datetime(self, raw: str | None) -> datetime | None:
        return parse_datetime(raw)

    def _normalize_title(self, raw: str | None) -> str | None:
        if raw is None:
            return None
        title = raw.strip()
        if not title:
            return None
        return title[:512]


def _load_preset_source_configs() -> tuple[dict[str, Any], ...]:
    raw_items = _load_source_config_json(AGGREGATION_SOURCES_CONFIG_PATH)

    normalized_items: list[dict[str, Any]] = []
    seen_slugs: set[str] = set()
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            continue

        slug = str(raw_item.get("slug", "")).strip().lower()
        display_name = str(raw_item.get("display_name", "")).strip()
        source_domain = str(raw_item.get("source_domain", "")).strip().lower().strip(".")
        feed_url = str(raw_item.get("feed_url", "")).strip()
        homepage_url = str(raw_item.get("homepage_url", "")).strip()
        is_active = _normalize_bool(raw_item.get("is_active"), default=True)

        if not slug or slug in seen_slugs:
            continue
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{1,63}", slug):
            continue
        if not display_name or not source_domain or not feed_url or not homepage_url:
            continue
        parsed_feed = urllib.parse.urlsplit(feed_url)
        parsed_home = urllib.parse.urlsplit(homepage_url)
        if parsed_feed.scheme.lower() not in {"http", "https"}:
            continue
        if parsed_home.scheme.lower() not in {"http", "https"}:
            continue

        seen_slugs.add(slug)
        normalized_items.append(
            {
                "slug": slug,
                "display_name": display_name,
                "source_domain": source_domain,
                "feed_url": feed_url,
                "homepage_url": homepage_url,
                "is_active": is_active,
            }
        )

    return tuple(normalized_items)


def _load_source_config_json(path: Path) -> list[Any]:
    try:
        raw_text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise RuntimeError(f"无法读取聚合信息源配置文件: {path}") from exc

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"聚合信息源配置文件 JSON 格式不合法: {path}") from exc

    if not isinstance(data, list):
        raise RuntimeError(f"聚合信息源配置文件格式错误，根节点必须是数组: {path}")

    return data


def _normalize_bool(raw: Any, *, default: bool) -> bool:
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        value = raw.strip().lower()
        if value in {"1", "true", "yes", "y", "on"}:
            return True
        if value in {"0", "false", "no", "n", "off"}:
            return False
    if isinstance(raw, int):
        return raw != 0
    return default


def _local_name(tag: str) -> str:
    if not tag:
        return ""
    if tag.startswith("{") and "}" in tag:
        return tag.split("}", 1)[1].lower()
    return tag.lower()


def _first_child_text(node: ET.Element, child_name: str) -> str | None:
    target = child_name.lower()
    for child in node:
        if _local_name(child.tag) != target:
            continue
        text = "".join(child.itertext()).strip()
        if text:
            return text
    return None


def _refresh_job_key(job_id: str) -> str:
    return f"{REFRESH_JOB_KEY_PREFIX}{job_id}"


def _save_refresh_job(redis: Redis, payload: dict[str, Any]) -> None:
    ttl = max(60, settings.aggregation_refresh_job_ttl_seconds)
    redis.setex(_refresh_job_key(payload["job_id"]), ttl, json.dumps(payload, ensure_ascii=False))


def enqueue_aggregation_refresh_job(*, source_id: UUID | None, source_slug: str | None) -> dict[str, Any]:
    redis = get_redis()
    job_id = uuid4().hex
    payload: dict[str, Any] = {
        "job_id": job_id,
        "status": "queued",
        "scope": "source" if source_id else "all",
        "source_id": str(source_id) if source_id else None,
        "source_slug": source_slug,
        "total_sources": None,
        "refreshed_items": None,
        "failed_items": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "started_at": None,
        "finished_at": None,
        "error_message": None,
        "failures": [],
    }
    _save_refresh_job(redis, payload)
    return payload


def get_aggregation_refresh_job(job_id: str) -> dict[str, Any] | None:
    redis = get_redis()
    raw = redis.get(_refresh_job_key(job_id))
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    failures = payload.get("failures")
    if not isinstance(failures, list):
        payload["failures"] = []
    return payload


def run_aggregation_refresh_job(*, job_id: str, source_id: str | None) -> None:
    redis = get_redis()
    payload = get_aggregation_refresh_job(job_id) or {
        "job_id": job_id,
        "status": "queued",
        "scope": "source" if source_id else "all",
        "source_id": source_id,
        "source_slug": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    payload["status"] = "running"
    payload["started_at"] = datetime.now(timezone.utc).isoformat()
    payload["finished_at"] = None
    payload["error_message"] = None
    payload["failures"] = []
    _save_refresh_job(redis, payload)

    db = SessionLocal()
    try:
        service = AggregationService(db)
        service.ensure_preset_sources()
        if source_id:
            result = service.refresh_single_source(source_id=UUID(source_id))
        else:
            result = service.refresh_active_items()
        all_items_failed = result.refreshed_items == 0 and result.failed_items > 0
        payload["status"] = "failed" if all_items_failed else "succeeded"
        payload["total_sources"] = result.total_sources
        payload["refreshed_items"] = result.refreshed_items
        payload["failed_items"] = result.failed_items
        payload["error_message"] = "聚合刷新已完成，但全部条目处理失败" if all_items_failed else None
        payload["failures"] = service.get_refresh_failures()
        payload["finished_at"] = datetime.now(timezone.utc).isoformat()
        _save_refresh_job(redis, payload)
    except Exception as exc:  # noqa: BLE001
        payload["status"] = "failed"
        payload["error_message"] = (str(exc).strip() or "聚合刷新失败")[:500]
        payload["finished_at"] = datetime.now(timezone.utc).isoformat()
        _save_refresh_job(redis, payload)
    finally:
        db.close()


def run_aggregation_item_reanalysis_job(*, aggregate_id: str) -> None:
    db = SessionLocal()
    try:
        service = AggregationService(db)
        service.reanalyze_single_item(item_id=UUID(aggregate_id))
    except Exception:  # noqa: BLE001
        logger.exception("aggregate item reanalysis background job crashed", extra={"aggregate_id": aggregate_id})
    finally:
        db.close()
