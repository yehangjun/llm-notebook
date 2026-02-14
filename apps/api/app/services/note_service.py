import html
import ipaddress
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException, status
from redis import Redis
from sqlalchemy.orm import Session

from app.core.config import settings
from app.infra.redis_client import get_redis
from app.models.note import Note
from app.models.note_ai_summary import NoteAISummary
from app.models.user import User
from app.repositories.note_repo import NoteRepository
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

ALLOWED_VISIBILITY = {"private", "public"}
ALLOWED_ANALYSIS_STATUS = {"pending", "running", "succeeded", "failed"}
WECHAT_HOST = "mp.weixin.qq.com"
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"}
YOUTUBE_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,20}$")


@dataclass
class SourceAnalysis:
    title: str | None
    summary_text: str
    key_points: list[str]


class NoteService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.note_repo = NoteRepository(db)
        self.redis: Redis = get_redis()

    def create_note(self, *, user: User, payload: CreateNoteRequest) -> CreateNoteResponse:
        self._enforce_create_limit(user.id)
        visibility = self._validate_visibility(payload.visibility)
        note_body_md = self._normalize_note_body(payload.note_body_md)
        source_url, source_url_normalized, source_domain = self._normalize_source_url(payload.source_url)

        existing = self.note_repo.get_by_user_and_normalized_url(
            user_id=user.id,
            normalized_url=source_url_normalized,
        )
        if existing:
            return CreateNoteResponse(
                note=self._build_note_detail(existing),
                created=False,
                message="该链接已存在，已返回已有笔记",
            )

        note = self.note_repo.create(
            user_id=user.id,
            source_url=source_url,
            source_url_normalized=source_url_normalized,
            source_domain=source_domain,
            source_title=None,
            note_body_md=note_body_md,
            visibility=visibility,
        )
        self._run_analysis(note)
        self.db.commit()
        self.db.refresh(note)
        return CreateNoteResponse(note=self._build_note_detail(note), created=True)

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
        return NoteListResponse(notes=[self._build_note_list_item(note) for note in notes])

    def get_note_detail(self, *, user: User, note_id: UUID) -> NoteDetail:
        note = self.note_repo.get_by_id_for_user(note_id=note_id, user_id=user.id)
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
        return self._build_note_detail(note)

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

        if not changed:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="未提供可更新字段")

        self.note_repo.save(note)
        self.db.commit()
        self.db.refresh(note)
        return self._build_note_detail(note)

    def reanalyze(self, *, user: User, note_id: UUID) -> NoteDetail:
        self._enforce_reanalyze_limit(user.id)
        note = self.note_repo.get_by_id_for_user(note_id=note_id, user_id=user.id)
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")

        self._run_analysis(note)
        self.db.commit()
        self.db.refresh(note)
        return self._build_note_detail(note)

    def get_public_note_detail(self, *, note_id: UUID) -> PublicNoteDetail:
        note = self.note_repo.get_public_by_id(note_id)
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")

        latest_summary = self.note_repo.get_latest_summary(note.id)
        return PublicNoteDetail(
            id=note.id,
            source_url=note.source_url,
            source_domain=note.source_domain,
            source_title=note.source_title,
            note_body_md=note.note_body_md,
            analysis_status=note.analysis_status,
            created_at=note.created_at,
            updated_at=note.updated_at,
            latest_summary=self._build_summary_public(latest_summary),
        )

    def _build_note_list_item(self, note: Note) -> NoteListItem:
        return NoteListItem(
            id=note.id,
            source_url=note.source_url,
            source_domain=note.source_domain,
            source_title=note.source_title,
            visibility=note.visibility,
            analysis_status=note.analysis_status,
            updated_at=note.updated_at,
        )

    def _build_note_detail(self, note: Note) -> NoteDetail:
        latest_summary = self.note_repo.get_latest_summary(note.id)
        return NoteDetail(
            id=note.id,
            source_url=note.source_url,
            source_domain=note.source_domain,
            source_title=note.source_title,
            note_body_md=note.note_body_md,
            visibility=note.visibility,
            analysis_status=note.analysis_status,
            analysis_error=note.analysis_error,
            created_at=note.created_at,
            updated_at=note.updated_at,
            latest_summary=self._build_summary_public(latest_summary),
        )

    def _build_summary_public(self, summary: NoteAISummary | None) -> NoteSummaryPublic | None:
        if not summary:
            return None
        return NoteSummaryPublic(
            id=summary.id,
            status=summary.status,
            summary_text=summary.summary_text,
            key_points=summary.key_points_json or [],
            model_provider=summary.model_provider,
            model_name=summary.model_name,
            model_version=summary.model_version,
            analyzed_at=summary.analyzed_at,
            error_message=summary.error_message,
        )

    def _run_analysis(self, note: Note) -> None:
        note.analysis_status = "running"
        note.analysis_error = None
        self.note_repo.save(note)

        try:
            result = self._analyze_source(note.source_url, note.source_domain)
            note.source_title = result.title or note.source_title
            note.analysis_status = "succeeded"
            note.analysis_error = None
            self.note_repo.save(note)
            self.note_repo.create_summary(
                note_id=note.id,
                status="succeeded",
                summary_text=result.summary_text,
                key_points=result.key_points,
                model_provider=settings.note_model_provider,
                model_name=settings.note_model_name,
                model_version=settings.note_model_version,
                error_message=None,
            )
            return
        except Exception as exc:  # noqa: BLE001
            error_message = str(exc).strip() or "分析失败"
            note.analysis_status = "failed"
            note.analysis_error = error_message[:500]
            self.note_repo.save(note)
            self.note_repo.create_summary(
                note_id=note.id,
                status="failed",
                summary_text=None,
                key_points=None,
                model_provider=settings.note_model_provider,
                model_name=settings.note_model_name,
                model_version=settings.note_model_version,
                error_message=note.analysis_error,
            )

    def _analyze_source(self, source_url: str, source_domain: str) -> SourceAnalysis:
        title, content = self._fetch_source_content(source_url)
        if not content:
            raise ValueError("来源内容为空，无法分析")

        summary_core = content[:260].strip()
        summary_text = f"该内容来自 {source_domain}。核心信息：{summary_core}"

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

        return SourceAnalysis(
            title=title,
            summary_text=summary_text,
            key_points=key_points[:3],
        )

    def _fetch_source_content(self, source_url: str) -> tuple[str | None, str]:
        request = urllib.request.Request(
            source_url,
            headers={
                "User-Agent": "PrismNotebookBot/1.0",
                "Accept": "text/html,application/xhtml+xml",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=settings.note_fetch_timeout_seconds) as response:
                raw = response.read(settings.note_fetch_max_bytes)
                encoding = response.headers.get_content_charset() or "utf-8"
        except Exception as exc:  # noqa: BLE001
            raise ValueError("来源链接暂不可访问，请稍后重试") from exc

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
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅支持 http/https 链接")
        if parsed.username or parsed.password:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="链接格式不合法")

        host = (parsed.hostname or "").strip().lower()
        if not host:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="链接格式不合法")
        self._ensure_public_host(host)

        if host == WECHAT_HOST:
            return self._normalize_wechat_url(source_url, parsed)
        if host in YOUTUBE_HOSTS:
            return self._normalize_youtube_url(source_url, parsed)

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前仅支持微信公众号（mp.weixin.qq.com）和 YouTube 链接",
        )

    def _normalize_wechat_url(
        self,
        source_url: str,
        parsed: urllib.parse.SplitResult,
    ) -> tuple[str, str, str]:
        if parsed.path.startswith("/s/"):
            article_key = parsed.path[len("/s/") :].strip("/")
            if not article_key:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="暂仅支持微信公众号文章链接")
            normalized = urllib.parse.urlunsplit(("https", WECHAT_HOST, f"/s/{article_key}", "", ""))
            return source_url, normalized, WECHAT_HOST

        if parsed.path != "/s":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="暂仅支持微信公众号文章链接")

        query_map = dict(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True))
        for key in ("__biz", "mid", "idx"):
            if not query_map.get(key, "").strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"微信公众号链接缺少关键参数：{key}",
                )

        canonical_items: list[tuple[str, str]] = []
        for key in ("__biz", "mid", "idx", "sn"):
            value = query_map.get(key, "").strip()
            if value:
                canonical_items.append((key, value))

        canonical_query = urllib.parse.urlencode(canonical_items)
        normalized = urllib.parse.urlunsplit(("https", WECHAT_HOST, "/s", canonical_query, ""))
        return source_url, normalized, WECHAT_HOST

    def _normalize_youtube_url(
        self,
        source_url: str,
        parsed: urllib.parse.SplitResult,
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
        if not video_id or not YOUTUBE_VIDEO_ID_RE.fullmatch(video_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="暂仅支持 YouTube 视频链接（watch/youtu.be/shorts）",
            )

        normalized = urllib.parse.urlunsplit(("https", "www.youtube.com", "/watch", f"v={video_id}", ""))
        return source_url, normalized, "youtube.com"

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

    def _normalize_note_body(self, value: str | None) -> str:
        note_body = (value or "").strip()
        if len(note_body) > settings.note_body_max_chars:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"学习心得长度不能超过 {settings.note_body_max_chars} 字符",
            )
        return note_body

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
