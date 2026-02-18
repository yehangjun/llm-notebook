import ipaddress
import logging
import re
import urllib.parse
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from redis import Redis
from sqlalchemy.orm import Session

from app.core.published_at import infer_published_at
from app.core.config import settings
from app.core.url_blacklist import CATEGORY_LABELS, match_blacklisted_host
from app.db.session import SessionLocal
from app.infra.openai_compatible_client import (
    OpenAICompatibleAnalysisResult,
    OpenAICompatibleClient,
    OpenAICompatibleClientError,
)
from app.infra.redis_client import get_redis
from app.infra.source_fetcher import fetch_source_for_analysis
from app.models.note import Note
from app.models.note_ai_summary import NoteAISummary
from app.models.user import User
from app.repositories.note_repo import NoteRepository
from app.schemas.auth import GenericMessageResponse
from app.schemas.note import (
    CreateNoteRequest,
    CreateNoteResponse,
    NoteDetail,
    NoteListItem,
    NoteListResponse,
    NoteSummaryPublic,
    PublicNoteDetail,
    UpdateNoteRequest,
)

logger = logging.getLogger(__name__)

ALLOWED_VISIBILITY = {"private", "public"}
ALLOWED_ANALYSIS_STATUS = {"pending", "running", "succeeded", "failed"}
MAX_NOTE_TAGS = 5
MAX_NOTE_TAG_LENGTH = 24
MAX_ANALYSIS_TAGS = 5
WECHAT_HOST = "mp.weixin.qq.com"
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"}
YOUTUBE_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,20}$")
DEFAULT_PORTS = {"http": 80, "https": 443}


class AnalysisError(Exception):
    def __init__(self, *, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(slots=True)
class SourceAnalysis:
    source_language: str
    title: str | None
    title_zh: str | None
    published_at: datetime | None
    summary_text: str
    summary_text_zh: str | None
    tags: list[str]
    model_provider: str | None
    model_name: str | None
    model_version: str | None
    prompt_version: str | None
    input_tokens: int | None
    output_tokens: int | None
    raw_response_json: dict | None


def run_note_analysis_job(note_id: UUID) -> None:
    db = SessionLocal()
    try:
        service = NoteService(db)
        service.run_analysis_job(note_id=note_id)
    except Exception:  # noqa: BLE001
        logger.exception("note analysis background job crashed", extra={"note_id": str(note_id)})
    finally:
        db.close()


class NoteService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.note_repo = NoteRepository(db)
        self.redis: Redis = get_redis()
        self.llm_client = OpenAICompatibleClient()

    def create_note(self, *, user: User, payload: CreateNoteRequest) -> CreateNoteResponse:
        self._enforce_create_limit(user.id)
        visibility = self._validate_visibility(payload.visibility)
        note_body_md = self._normalize_note_body(payload.note_body_md)
        tags = self._normalize_tags(payload.tags)
        source_url, source_url_normalized, source_domain = self._normalize_source_url(payload.source_url)

        existing = self.note_repo.get_by_user_and_normalized_url(
            user_id=user.id,
            normalized_url=source_url_normalized,
        )
        if existing:
            return CreateNoteResponse(
                note=self._build_note_detail(existing, ui_language=user.ui_language),
                created=False,
                message="该链接已存在，已返回已有笔记",
            )

        note = self.note_repo.create(
            user_id=user.id,
            source_url=source_url,
            source_url_normalized=source_url_normalized,
            source_domain=source_domain,
            source_title=None,
            tags=tags,
            note_body_md=note_body_md,
            visibility=visibility,
        )
        note.analysis_status = "pending"
        note.analysis_error = None
        self.note_repo.save(note)
        self.db.commit()
        self.db.refresh(note)
        return CreateNoteResponse(note=self._build_note_detail(note, ui_language=user.ui_language), created=True)

    def list_notes(
        self,
        *,
        user: User,
        status_filter: str | None,
        visibility_filter: str | None,
        keyword: str | None,
        offset: int,
        limit: int,
    ) -> NoteListResponse:
        status_filter = self._validate_status(status_filter)
        visibility_filter = self._validate_visibility_optional(visibility_filter)
        notes = self.note_repo.list_for_user(
            user_id=user.id,
            status=status_filter,
            visibility=visibility_filter,
            keyword=keyword.strip() if keyword else None,
            offset=offset,
            limit=limit,
        )
        note_items: list[NoteListItem] = []
        for note in notes:
            latest_summary = self.note_repo.get_latest_summary(note.id)
            note_items.append(
                self._build_note_list_item(
                    note=note,
                    latest_summary=latest_summary,
                    ui_language=user.ui_language,
                )
            )
        return NoteListResponse(notes=note_items)

    def get_note_detail(self, *, user: User, note_id: UUID) -> NoteDetail:
        note = self.note_repo.get_by_id_for_user(note_id=note_id, user_id=user.id)
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
        return self._build_note_detail(note, ui_language=user.ui_language)

    def update_note(self, *, user: User, note_id: UUID, payload: UpdateNoteRequest) -> NoteDetail:
        note = self.note_repo.get_by_id_for_user(note_id=note_id, user_id=user.id)
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")

        changed = False
        if payload.note_body_md is not None:
            note.note_body_md = self._normalize_note_body(payload.note_body_md)
            changed = True
        if payload.visibility is not None:
            note.visibility = self._validate_visibility(payload.visibility)
            changed = True
        if payload.tags is not None:
            note.tags_json = self._normalize_tags(payload.tags)
            changed = True

        if not changed:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="未提供可更新字段")

        self.note_repo.save(note)
        self.db.commit()
        self.db.refresh(note)
        return self._build_note_detail(note, ui_language=user.ui_language)

    def reanalyze(self, *, user: User, note_id: UUID) -> NoteDetail:
        self._enforce_reanalyze_limit(user.id)
        note = self.note_repo.get_by_id_for_user(note_id=note_id, user_id=user.id)
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")

        if note.analysis_status not in {"pending", "running"}:
            note.analysis_status = "pending"
            note.analysis_error = None
            self.note_repo.save(note)
            self.db.commit()
            self.db.refresh(note)

        return self._build_note_detail(note, ui_language=user.ui_language)

    def run_analysis_job(self, *, note_id: UUID) -> None:
        note = self.note_repo.get_by_id(note_id)
        if not note:
            return

        if note.analysis_status != "pending":
            return

        note.analysis_status = "running"
        note.analysis_error = None
        self.note_repo.save(note)
        self.db.commit()

        try:
            result = self._analyze_source(note)
        except AnalysisError as exc:
            self._mark_analysis_failed(note_id=note.id, error_code=exc.code, error_message=exc.message)
            return
        except Exception as exc:  # noqa: BLE001
            self._mark_analysis_failed(
                note_id=note.id,
                error_code="analysis_error",
                error_message=str(exc).strip() or "分析失败",
            )
            return

        note = self.note_repo.get_by_id(note.id)
        if not note:
            return

        note.source_title = (result.title or note.source_title or "")[:512] or None
        if not note.tags_json and result.tags:
            note.tags_json = result.tags
        note.analysis_status = "succeeded"
        note.analysis_error = None
        self.note_repo.save(note)
        self.note_repo.create_summary(
            note_id=note.id,
            status="succeeded",
            source_language=result.source_language,
            output_title=result.title,
            output_title_zh=result.title_zh,
            published_at=result.published_at,
            output_summary=result.summary_text,
            output_summary_zh=result.summary_text_zh,
            output_tags=result.tags,
            summary_text=result.summary_text,
            key_points=result.tags,
            model_provider=result.model_provider,
            model_name=result.model_name,
            model_version=result.model_version,
            prompt_version=result.prompt_version,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            estimated_cost_usd=None,
            raw_response_json=result.raw_response_json,
            error_code=None,
            error_message=None,
        )
        self.db.commit()

    def _mark_analysis_failed(self, *, note_id: UUID, error_code: str, error_message: str) -> None:
        self.db.rollback()
        note = self.note_repo.get_by_id(note_id)
        if not note:
            return

        message = (error_message or "分析失败").strip()[:500]
        note.analysis_status = "failed"
        note.analysis_error = message
        self.note_repo.save(note)
        self.note_repo.create_summary(
            note_id=note.id,
            status="failed",
            source_language=None,
            output_title=None,
            output_title_zh=None,
            published_at=None,
            output_summary=None,
            output_summary_zh=None,
            output_tags=None,
            summary_text=None,
            key_points=None,
            model_provider=self._analysis_model_provider(),
            model_name=self._analysis_model_name(),
            model_version=self._analysis_model_version(),
            prompt_version=settings.llm_prompt_version,
            input_tokens=None,
            output_tokens=None,
            estimated_cost_usd=None,
            raw_response_json=None,
            error_code=error_code,
            error_message=message,
        )
        self.db.commit()

    def delete_note(self, *, user: User, note_id: UUID) -> GenericMessageResponse:
        note = self.note_repo.get_by_id_for_user(note_id=note_id, user_id=user.id)
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")

        self.note_repo.soft_delete(note)
        self.db.commit()
        return GenericMessageResponse(message="笔记已删除")

    def get_public_note_detail(self, *, note_id: UUID, ui_language: str | None = None) -> PublicNoteDetail:
        note = self.note_repo.get_public_by_id(note_id)
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")

        latest_summary = self.note_repo.get_latest_summary(note.id)
        return PublicNoteDetail(
            id=note.id,
            source_url=note.source_url_normalized,
            source_domain=note.source_domain,
            source_title=note.source_title,
            tags=note.tags_json or [],
            note_body_md=note.note_body_md,
            analysis_status=note.analysis_status,
            created_at=note.created_at,
            updated_at=note.updated_at,
            latest_summary=self._build_summary_public(latest_summary, ui_language=ui_language),
        )

    def _build_note_list_item(
        self,
        *,
        note: Note,
        latest_summary: NoteAISummary | None,
        ui_language: str | None = None,
    ) -> NoteListItem:
        prefer_zh = self._prefer_zh_ui(ui_language)
        title_original = (latest_summary.output_title if latest_summary else None) or note.source_title
        title_zh = latest_summary.output_title_zh if latest_summary else None
        if latest_summary and latest_summary.source_language == "zh":
            title_zh = title_zh or title_original
        return NoteListItem(
            id=note.id,
            source_url=note.source_url_normalized,
            source_domain=note.source_domain,
            source_title=self._pick_display_text(prefer_zh=prefer_zh, original=title_original, zh=title_zh),
            published_at=latest_summary.published_at if latest_summary else None,
            tags=note.tags_json or [],
            visibility=note.visibility,
            analysis_status=note.analysis_status,
            updated_at=note.updated_at,
        )

    def _build_note_detail(self, note: Note, *, ui_language: str | None = None) -> NoteDetail:
        latest_summary = self.note_repo.get_latest_summary(note.id)
        return NoteDetail(
            id=note.id,
            source_url=note.source_url_normalized,
            source_domain=note.source_domain,
            source_title=note.source_title,
            tags=note.tags_json or [],
            note_body_md=note.note_body_md,
            visibility=note.visibility,
            analysis_status=note.analysis_status,
            analysis_error=note.analysis_error,
            created_at=note.created_at,
            updated_at=note.updated_at,
            latest_summary=self._build_summary_public(latest_summary, ui_language=ui_language),
        )

    def _build_summary_public(
        self,
        summary: NoteAISummary | None,
        *,
        ui_language: str | None = None,
    ) -> NoteSummaryPublic | None:
        if not summary:
            return None

        prefer_zh = self._prefer_zh_ui(ui_language)
        original_title = summary.output_title
        translated_title = summary.output_title_zh
        merged_summary = summary.output_summary or summary.summary_text
        translated_summary = summary.output_summary_zh
        if summary.source_language == "zh":
            translated_title = translated_title or original_title
            translated_summary = translated_summary or merged_summary

        merged_tags = summary.output_tags_json or summary.key_points_json or []

        return NoteSummaryPublic(
            id=summary.id,
            status=summary.status,
            source_language=summary.source_language,
            title=self._pick_display_text(prefer_zh=prefer_zh, original=original_title, zh=translated_title),
            published_at=summary.published_at,
            summary_text=self._pick_display_text(prefer_zh=prefer_zh, original=merged_summary, zh=translated_summary),
            tags=merged_tags,
            model_provider=summary.model_provider,
            model_name=summary.model_name,
            model_version=summary.model_version,
            analyzed_at=summary.analyzed_at,
            error_code=summary.error_code,
            error_message=summary.error_message,
        )

    def _analyze_source(self, note: Note) -> SourceAnalysis:
        source_title, content, inferred_published_at = self._fetch_source_content(note.source_url)
        if not content:
            raise AnalysisError(code="empty_content", message="来源内容为空，无法分析")

        if not (settings.llm_api_key or "").strip():
            raise AnalysisError(code="llm_not_configured", message="模型 API Key 未配置，无法执行内容分析")

        return self._analyze_source_with_llm(
            source_url=note.source_url,
            source_domain=note.source_domain,
            source_title=source_title,
            content=content,
            inferred_published_at=inferred_published_at,
        )

    def _analyze_source_with_llm(
        self,
        *,
        source_url: str,
        source_domain: str,
        source_title: str | None,
        content: str,
        inferred_published_at: datetime | None,
    ) -> SourceAnalysis:
        try:
            result = self.llm_client.analyze(
                source_url=source_url,
                source_domain=source_domain,
                source_title=source_title,
                content=content,
                repair_mode=False,
            )
        except OpenAICompatibleClientError as exc:
            if exc.code != "invalid_output":
                raise AnalysisError(code=exc.code, message=exc.message) from exc
            try:
                result = self.llm_client.analyze(
                    source_url=source_url,
                    source_domain=source_domain,
                    source_title=source_title,
                    content=content,
                    repair_mode=True,
                )
            except OpenAICompatibleClientError as second_exc:
                raise AnalysisError(code=second_exc.code, message=second_exc.message) from second_exc

        return self._build_source_analysis(
            result=result,
            fallback_title=source_title,
            fallback_published_at=inferred_published_at,
            model_provider=settings.llm_provider_name,
            model_version=None,
        )

    def _build_source_analysis(
        self,
        *,
        result: OpenAICompatibleAnalysisResult,
        fallback_title: str | None,
        fallback_published_at: datetime | None,
        model_provider: str,
        model_version: str | None,
    ) -> SourceAnalysis:
        tags = result.tags[:MAX_ANALYSIS_TAGS]
        if not tags:
            raise AnalysisError(code="invalid_output", message="模型未返回有效标签")

        summary_text = result.summary.strip()[:400]
        if not summary_text:
            raise AnalysisError(code="invalid_output", message="模型未返回有效摘要")

        return SourceAnalysis(
            source_language=result.source_language,
            title=(result.title or fallback_title or "")[:512] or None,
            title_zh=(
                (result.title_zh or result.title or fallback_title or "")[:512] or None
                if result.source_language == "zh"
                else ((result.title_zh or "")[:512] or None)
            ),
            published_at=result.published_at or fallback_published_at,
            summary_text=summary_text,
            summary_text_zh=(
                (result.summary_zh or summary_text)[:400]
                if result.source_language == "zh"
                else ((result.summary_zh or "").strip()[:400] or None)
            ),
            tags=tags,
            model_provider=model_provider,
            model_name=result.model_name,
            model_version=model_version,
            prompt_version=settings.llm_prompt_version,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            raw_response_json=result.raw_response,
        )

    def _analysis_model_provider(self) -> str:
        return settings.llm_provider_name

    def _analysis_model_name(self) -> str:
        return settings.llm_model_name

    def _analysis_model_version(self) -> str | None:
        return None

    def _prefer_zh_ui(self, ui_language: str | None) -> bool:
        normalized = (ui_language or "").strip().lower()
        return normalized.startswith("zh")

    def _pick_display_text(self, *, prefer_zh: bool, original: str | None, zh: str | None) -> str | None:
        primary = zh if prefer_zh else original
        fallback = original if prefer_zh else zh
        if primary and primary.strip():
            return primary
        if fallback and fallback.strip():
            return fallback
        return None

    def _fetch_source_content(self, source_url: str) -> tuple[str | None, str, datetime | None]:
        try:
            fetched = fetch_source_for_analysis(
                source_url=source_url,
                headers={
                    "User-Agent": "PrismNotebookBot/1.0",
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "note source fetch failed",
                extra={
                    "source_url": source_url,
                    "error_type": type(exc).__name__,
                    "error_message": str(exc),
                    "proxy_enabled": bool((settings.network_proxy_url or "").strip()),
                    "fetch_strategy": "jina-reader" if settings.content_fetch_use_jina_reader else "direct",
                },
                exc_info=True,
            )
            raise AnalysisError(code="source_unreachable", message="来源链接暂不可访问，请稍后重试") from exc

        published_at = fetched.published_at_hint or infer_published_at(
            source_url=fetched.resolved_source_url or source_url,
            document=fetched.document,
        )
        return fetched.title, fetched.content, published_at

    def _normalize_source_url(self, raw_url: str) -> tuple[str, str, str]:
        source_url = raw_url.strip()
        parsed = urllib.parse.urlsplit(source_url)
        scheme = parsed.scheme.lower()
        if scheme not in {"http", "https"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅支持 http/https 链接")
        if parsed.username or parsed.password:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="链接格式不合法")
        try:
            port = parsed.port
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="链接格式不合法") from exc

        host = (parsed.hostname or "").strip().lower()
        if not host:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="链接格式不合法")
        self._ensure_public_host(host)
        self._ensure_supported_host(host)

        if host == WECHAT_HOST:
            return self._normalize_wechat_url(source_url, parsed, port)
        if host in YOUTUBE_HOSTS:
            return self._normalize_youtube_url(source_url, parsed, port)

        normalized = self._normalize_generic_url(parsed=parsed, host=host, port=port)
        return source_url, normalized, host

    def _normalize_wechat_url(
        self,
        source_url: str,
        parsed: urllib.parse.SplitResult,
        port: int | None,
    ) -> tuple[str, str, str]:
        if parsed.path.startswith("/s/"):
            article_key = parsed.path[len("/s/") :].strip("/")
            if article_key:
                normalized = urllib.parse.urlunsplit(("https", WECHAT_HOST, f"/s/{article_key}", "", ""))
                return source_url, normalized, WECHAT_HOST

        if parsed.path == "/s":
            query_map = dict(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True))
            has_required_params = all(query_map.get(key, "").strip() for key in ("__biz", "mid", "idx"))
            if has_required_params:
                canonical_items: list[tuple[str, str]] = []
                for key in ("__biz", "mid", "idx", "sn"):
                    value = query_map.get(key, "").strip()
                    if value:
                        canonical_items.append((key, value))

                canonical_query = urllib.parse.urlencode(canonical_items)
                normalized = urllib.parse.urlunsplit(("https", WECHAT_HOST, "/s", canonical_query, ""))
                return source_url, normalized, WECHAT_HOST

        normalized = self._normalize_generic_url(parsed=parsed, host=WECHAT_HOST, port=port)
        return source_url, normalized, WECHAT_HOST

    def _normalize_youtube_url(
        self,
        source_url: str,
        parsed: urllib.parse.SplitResult,
        port: int | None,
    ) -> tuple[str, str, str]:
        host = (parsed.hostname or "").strip().lower()
        video_id = ""

        if host in {"youtu.be", "www.youtu.be"}:
            path = parsed.path.strip("/")
            if path:
                video_id = path.split("/", 1)[0]
        else:
            if parsed.path == "/watch":
                query_map = dict(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True))
                video_id = query_map.get("v", "").strip()
            elif parsed.path.startswith("/shorts/") or parsed.path.startswith("/live/") or parsed.path.startswith("/embed/"):
                parts = [segment for segment in parsed.path.split("/") if segment]
                if len(parts) >= 2:
                    video_id = parts[1]

        video_id = urllib.parse.unquote(video_id).strip()
        if video_id and YOUTUBE_VIDEO_ID_RE.fullmatch(video_id):
            normalized = urllib.parse.urlunsplit(("https", "www.youtube.com", "/watch", f"v={video_id}", ""))
            return source_url, normalized, "youtube.com"

        normalized = self._normalize_generic_url(parsed=parsed, host=host, port=port)
        return source_url, normalized, "youtube.com"

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
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持内网或本地链接")

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
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持内网或本地链接")

    def _ensure_supported_host(self, host: str) -> None:
        match = match_blacklisted_host(host)
        if not match:
            return

        category_label = CATEGORY_LABELS.get(match.category, "受限网站")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"暂不支持该网站链接（{category_label}）：{match.matched_rule}",
        )

    def _normalize_note_body(self, value: str | None) -> str:
        note_body = (value or "").strip()
        if len(note_body) > settings.note_body_max_chars:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"学习心得长度不能超过 {settings.note_body_max_chars} 字符",
            )
        return note_body

    def _normalize_tags(self, values: list[str] | None) -> list[str]:
        if not values:
            return []
        tags: list[str] = []
        seen: set[str] = set()
        for value in values:
            tag = value.strip().lower()
            if not tag:
                continue
            if len(tag) > MAX_NOTE_TAG_LENGTH:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"标签长度不能超过 {MAX_NOTE_TAG_LENGTH} 字符",
                )
            if not re.fullmatch(r"[a-z0-9_-]+", tag):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="标签仅支持字母数字下划线和中划线")
            if tag in seen:
                continue
            seen.add(tag)
            tags.append(tag)
            if len(tags) > MAX_NOTE_TAGS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"标签数量不能超过 {MAX_NOTE_TAGS} 个",
                )
        return tags

    def _validate_visibility(self, value: str) -> str:
        visibility = value.strip().lower()
        if visibility not in ALLOWED_VISIBILITY:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的可见性")
        return visibility

    def _validate_visibility_optional(self, value: str | None) -> str | None:
        if value is None:
            return None
        return self._validate_visibility(value)

    def _validate_status(self, value: str | None) -> str | None:
        if value is None:
            return None
        status_value = value.strip().lower()
        if status_value not in ALLOWED_ANALYSIS_STATUS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的分析状态")
        return status_value

    def _enforce_create_limit(self, user_pk: UUID) -> None:
        key = f"note:create:user:{user_pk}"
        self._enforce_rate_limit(
            key=key,
            limit=settings.note_create_limit_per_hour,
            ttl_seconds=3600,
            detail="创建笔记过于频繁，请稍后再试",
        )

    def _enforce_reanalyze_limit(self, user_pk: UUID) -> None:
        key = f"note:reanalyze:user:{user_pk}"
        self._enforce_rate_limit(
            key=key,
            limit=settings.note_reanalyze_limit_per_10m,
            ttl_seconds=600,
            detail="重试分析过于频繁，请稍后再试",
        )

    def _enforce_rate_limit(self, *, key: str, limit: int, ttl_seconds: int, detail: str) -> None:
        count = self.redis.incr(key)
        if count == 1:
            self.redis.expire(key, ttl_seconds)
        if count > limit:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail)
