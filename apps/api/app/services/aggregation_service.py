import html
import ipaddress
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.aggregate_item import AggregateItem
from app.models.source_creator import SourceCreator
from app.schemas.feed import RefreshAggregatesResponse

ALLOWED_ANALYSIS_STATUS = {"pending", "running", "succeeded", "failed"}
DEFAULT_PORTS = {"http": 80, "https": 443}
PRESET_SOURCE_CREATORS = [
    {
        "slug": "openai",
        "display_name": "OpenAI",
        "source_domain": "openai.com",
        "homepage_url": "https://openai.com/news/",
    },
    {
        "slug": "anthropic",
        "display_name": "Anthropic",
        "source_domain": "anthropic.com",
        "homepage_url": "https://www.anthropic.com/news",
    },
    {
        "slug": "google-deepmind",
        "display_name": "Google DeepMind",
        "source_domain": "deepmind.google",
        "homepage_url": "https://deepmind.google/discover/blog/",
    },
]


class AggregationService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def ensure_preset_sources(self) -> None:
        existing = {
            source.slug: source
            for source in self.db.scalars(
                select(SourceCreator).where(SourceCreator.slug.in_([item["slug"] for item in PRESET_SOURCE_CREATORS]))
            )
        }

        changed = False
        for item in PRESET_SOURCE_CREATORS:
            current = existing.get(item["slug"])
            if current:
                next_display = item["display_name"].strip()
                next_domain = item["source_domain"].strip().lower()
                next_url = item["homepage_url"].strip()
                if (
                    current.display_name != next_display
                    or current.source_domain != next_domain
                    or current.homepage_url != next_url
                ):
                    current.display_name = next_display
                    current.source_domain = next_domain
                    current.homepage_url = next_url
                    self.db.add(current)
                    changed = True
                continue

            creator = SourceCreator(
                slug=item["slug"].strip(),
                display_name=item["display_name"].strip(),
                source_domain=item["source_domain"].strip().lower(),
                homepage_url=item["homepage_url"].strip(),
                is_active=True,
            )
            self.db.add(creator)
            changed = True

        if changed:
            self.db.commit()

    def refresh_active_items(self) -> RefreshAggregatesResponse:
        sources = list(
            self.db.scalars(
                select(SourceCreator).where(SourceCreator.is_active.is_(True)).order_by(SourceCreator.slug.asc())
            )
        )
        refreshed = 0
        failed = 0

        for source in sources:
            aggregate_item: AggregateItem | None = None
            try:
                aggregate_item = self._ensure_item_for_source(source)
                if self._run_analysis(aggregate_item):
                    refreshed += 1
                else:
                    failed += 1
            except Exception as exc:  # noqa: BLE001
                failed += 1
                try:
                    if aggregate_item is None:
                        aggregate_item = self._get_item_for_source(source)
                    if aggregate_item:
                        aggregate_item.analysis_status = "failed"
                        aggregate_item.analysis_error = (str(exc).strip() or "聚合分析失败")[:500]
                        aggregate_item.updated_at = datetime.now(timezone.utc)
                        self.db.add(aggregate_item)
                except Exception:  # noqa: BLE001
                    pass

        self.db.commit()
        return RefreshAggregatesResponse(
            total_sources=len(sources),
            refreshed_items=refreshed,
            failed_items=failed,
        )

    def _get_item_for_source(self, source: SourceCreator) -> AggregateItem | None:
        stmt = (
            select(AggregateItem)
            .where(AggregateItem.source_creator_id == source.id)
            .order_by(AggregateItem.updated_at.desc())
            .limit(1)
        )
        return self.db.scalar(stmt)

    def _ensure_item_for_source(self, source: SourceCreator) -> AggregateItem:
        source_url = source.homepage_url.strip()
        source_url_raw, source_url_normalized, source_domain = self._normalize_source_url(source_url)
        item = self.db.scalar(select(AggregateItem).where(AggregateItem.source_url_normalized == source_url_normalized))
        if item:
            item.source_creator_id = source.id
            item.source_url = source_url_raw
            item.source_domain = source_domain
            item.tags_json = sorted(set(item.tags_json or []) | {source.slug})
            self.db.add(item)
            self.db.flush()
            return item

        item = AggregateItem(
            source_creator_id=source.id,
            source_url=source_url_raw,
            source_url_normalized=source_url_normalized,
            source_domain=source_domain,
            source_title=None,
            tags_json=[source.slug],
            analysis_status="pending",
            analysis_error=None,
            summary_text=None,
            key_points_json=[],
            model_provider=settings.note_model_provider,
            model_name=settings.note_model_name,
            model_version=settings.note_model_version,
        )
        self.db.add(item)
        self.db.flush()
        return item

    def _run_analysis(self, item: AggregateItem) -> bool:
        item.analysis_status = "running"
        item.analysis_error = None
        self.db.add(item)
        self.db.flush()

        try:
            title, content = self._fetch_source_content(item.source_url)
            if not content:
                raise ValueError("来源内容为空，无法分析")

            summary_core = content[:260].strip()
            summary_text = f"该内容来自 {item.source_domain}。核心信息：{summary_core}"
            key_points: list[str] = []
            for piece in re.split(r"[。！？.!?]", content):
                line = piece.strip()
                if len(line) < 12:
                    continue
                key_points.append(line[:96])
                if len(key_points) >= 3:
                    break
            if not key_points:
                key_points = [summary_core[:96]]
            while len(key_points) < 3:
                key_points.append("建议结合原文阅读全文，避免断章取义。")

            item.source_title = title or item.source_title
            item.summary_text = summary_text
            item.key_points_json = key_points[:3]
            item.analysis_status = "succeeded"
            item.analysis_error = None
            item.model_provider = settings.note_model_provider
            item.model_name = settings.note_model_name
            item.model_version = settings.note_model_version
            self.db.add(item)
            self.db.flush()
            return True
        except Exception as exc:  # noqa: BLE001
            error_message = str(exc).strip() or "分析失败"
            item.analysis_status = "failed"
            item.analysis_error = error_message[:500]
            self.db.add(item)
            self.db.flush()
            return False

    def _fetch_source_content(self, source_url: str) -> tuple[str | None, str]:
        request = urllib.request.Request(
            source_url,
            headers={
                "User-Agent": "PrismAggregatorBot/1.0",
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        with urllib.request.urlopen(request, timeout=settings.note_fetch_timeout_seconds) as response:
            raw = response.read(settings.note_fetch_max_bytes)
            encoding = response.headers.get_content_charset() or "utf-8"

        text = raw.decode(encoding, errors="ignore")
        title_match = re.search(r"(?is)<title[^>]*>(.*?)</title>", text)
        title = html.unescape(title_match.group(1).strip()) if title_match else None

        cleaned = re.sub(r"(?is)<(script|style|noscript).*?>.*?</\\1>", " ", text)
        plain = re.sub(r"(?is)<[^>]+>", " ", cleaned)
        plain = html.unescape(plain)
        plain = re.sub(r"\s+", " ", plain).strip()
        if len(plain) > settings.note_body_max_chars:
            plain = plain[: settings.note_body_max_chars]
        return title, plain

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
        return urllib.parse.urlunsplit((scheme, netloc, path, parsed.query, ""))

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
