import urllib.parse
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import ALLOWED_UI_LANGUAGES
from app.core.config import settings
from app.models.note import Note
from app.models.source_creator import SourceCreator
from app.models.user import User
from app.repositories.note_repo import NoteRepository
from app.repositories.session_repo import SessionRepository
from app.repositories.user_repo import UserRepository
from app.schemas.auth import GenericMessageResponse
from app.schemas.note import AdminNoteItem
from app.schemas.source_creator import AdminCreateSourceCreatorRequest, AdminUpdateSourceCreatorRequest
from app.schemas.user import AdminUpdateUserRequest
from app.services.aggregation_service import (
    AggregationService,
    enqueue_aggregation_refresh_job,
    get_aggregation_refresh_job,
)


class AdminService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.user_repo = UserRepository(db)
        self.note_repo = NoteRepository(db)
        self.session_repo = SessionRepository(db)

    def list_users(self, *, keyword: str | None, offset: int, limit: int) -> list[User]:
        return self.user_repo.list_users(keyword=keyword, offset=offset, limit=limit)

    def update_user(self, *, target_user_id: str, payload: AdminUpdateUserRequest, current_admin: User) -> User:
        user = self.user_repo.get_by_user_id(target_user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
        bootstrap_user_id = settings.admin_user_id.strip()

        if payload.ui_language is not None and payload.ui_language not in ALLOWED_UI_LANGUAGES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的界面语言")

        if payload.is_admin is False and user.id == current_admin.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能移除当前登录管理员权限")
        if payload.is_admin is False and user.user_id == bootstrap_user_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="系统初始化管理员账号不能被移除管理员权限")

        if payload.nickname is not None:
            user.nickname = payload.nickname.strip() or None
        if payload.ui_language is not None:
            user.ui_language = payload.ui_language
        if payload.is_admin is not None:
            user.is_admin = payload.is_admin

        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def delete_user(self, *, target_user_id: str, current_admin: User) -> GenericMessageResponse:
        user = self.user_repo.get_by_user_id(target_user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
        bootstrap_user_id = settings.admin_user_id.strip()

        if user.id == current_admin.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能删除当前登录管理员账号")
        if user.user_id == bootstrap_user_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="系统初始化管理员账号不能被删除")

        now = datetime.now(timezone.utc)
        self.note_repo.soft_delete_for_user(user.id)
        self.session_repo.revoke_all_for_user(user.id)
        user.is_deleted = True
        user.deleted_at = now
        self.db.add(user)
        self.db.commit()
        return GenericMessageResponse(message="用户已删除")

    def list_notes(
        self,
        *,
        status_filter: str | None,
        visibility_filter: str | None,
        deleted_filter: str | None,
        owner_user_id: str | None,
        keyword: str | None,
        offset: int,
        limit: int,
    ) -> list[AdminNoteItem]:
        status_value = self._validate_note_status(status_filter)
        visibility_value = self._validate_note_visibility(visibility_filter)
        deleted_value = self._validate_deleted_filter(deleted_filter)
        owner_value = owner_user_id.strip() if owner_user_id else None
        keyword_value = keyword.strip() if keyword else None
        notes = self.note_repo.list_for_admin(
            status=status_value,
            visibility=visibility_value,
            deleted=deleted_value,
            owner_user_id=owner_value,
            keyword=keyword_value,
            offset=offset,
            limit=limit,
        )
        return [self._build_admin_note_item(note) for note in notes]

    def delete_note(self, *, note_id: UUID) -> GenericMessageResponse:
        note = self.note_repo.get_by_id_for_admin(note_id, include_deleted=True)
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
        if note.is_deleted:
            return GenericMessageResponse(message="笔记已删除")

        self.note_repo.soft_delete(note)
        self.db.commit()
        return GenericMessageResponse(message="笔记已删除")

    def restore_note(self, *, note_id: UUID) -> GenericMessageResponse:
        note = self.note_repo.get_by_id_for_admin(note_id, include_deleted=True)
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
        if not note.is_deleted:
            return GenericMessageResponse(message="笔记已恢复")
        if note.user and note.user.is_deleted:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="所属用户已删除，无法恢复笔记")

        try:
            self.note_repo.restore(note)
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="该用户已存在同一归一化链接的有效笔记，无法恢复",
            ) from exc
        return GenericMessageResponse(message="笔记已恢复")

    def list_sources(
        self,
        *,
        keyword: str | None,
        deleted_filter: str | None,
        active_filter: str | None,
        offset: int,
        limit: int,
    ) -> list[SourceCreator]:
        deleted_value = self._validate_deleted_filter(deleted_filter)
        active_value = self._validate_active_filter(active_filter)
        keyword_value = keyword.strip() if keyword else None

        stmt = select(SourceCreator)
        if deleted_value is not None:
            stmt = stmt.where(SourceCreator.is_deleted.is_(deleted_value))
        if active_value is not None:
            stmt = stmt.where(SourceCreator.is_active.is_(active_value))
        if keyword_value:
            like = f"%{keyword_value}%"
            stmt = stmt.where(
                or_(
                    SourceCreator.slug.ilike(like),
                    SourceCreator.display_name.ilike(like),
                    SourceCreator.source_domain.ilike(like),
                    SourceCreator.feed_url.ilike(like),
                    SourceCreator.homepage_url.ilike(like),
                )
            )

        stmt = stmt.order_by(SourceCreator.updated_at.desc(), SourceCreator.slug.asc()).offset(offset).limit(limit)
        return list(self.db.scalars(stmt))

    def create_source(self, *, payload: AdminCreateSourceCreatorRequest) -> SourceCreator:
        slug = self._normalize_slug(payload.slug)
        display_name = self._normalize_display_name(payload.display_name)
        source_domain = self._normalize_source_domain(payload.source_domain)
        feed_url = self._normalize_http_url(payload.feed_url)
        homepage_url = self._normalize_http_url(payload.homepage_url)
        self._ensure_domain_matches_url(source_domain=source_domain, url=feed_url, field_label="feed_url")
        self._ensure_domain_matches_url(source_domain=source_domain, url=homepage_url, field_label="homepage_url")

        existing_by_slug = self.db.scalar(select(SourceCreator).where(SourceCreator.slug == slug))
        if existing_by_slug:
            if existing_by_slug.is_deleted:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该 slug 已存在（已删除），请恢复后再使用")
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该 slug 已存在")

        existing_by_domain = self.db.scalar(select(SourceCreator).where(SourceCreator.source_domain == source_domain))
        if existing_by_domain:
            if existing_by_domain.is_deleted:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="该 source_domain 已存在（已删除），请恢复后再使用",
                )
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该 source_domain 已存在")

        source = SourceCreator(
            slug=slug,
            display_name=display_name,
            source_domain=source_domain,
            feed_url=feed_url,
            homepage_url=homepage_url,
            is_active=payload.is_active,
            is_deleted=False,
            deleted_at=None,
        )
        self.db.add(source)
        self.db.commit()
        self.db.refresh(source)
        return source

    def update_source(self, *, source_id: UUID, payload: AdminUpdateSourceCreatorRequest) -> SourceCreator:
        source = self.db.scalar(select(SourceCreator).where(SourceCreator.id == source_id))
        if not source:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="信息源不存在")
        if source.is_deleted:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="信息源已删除，请先恢复")

        changed = False
        if payload.display_name is not None:
            source.display_name = self._normalize_display_name(payload.display_name)
            changed = True
        if payload.source_domain is not None:
            source.source_domain = self._normalize_source_domain(payload.source_domain)
            changed = True
        if payload.feed_url is not None:
            source.feed_url = self._normalize_http_url(payload.feed_url)
            changed = True
        if payload.homepage_url is not None:
            source.homepage_url = self._normalize_http_url(payload.homepage_url)
            changed = True
        if payload.is_active is not None:
            source.is_active = payload.is_active
            changed = True

        self._ensure_domain_matches_url(source_domain=source.source_domain, url=source.feed_url, field_label="feed_url")
        self._ensure_domain_matches_url(
            source_domain=source.source_domain,
            url=source.homepage_url,
            field_label="homepage_url",
        )

        if not changed:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="未提供可更新字段")

        self.db.add(source)
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="slug 或 source_domain 与现有信息源冲突") from exc
        self.db.refresh(source)
        return source

    def delete_source(self, *, source_id: UUID) -> GenericMessageResponse:
        source = self.db.scalar(select(SourceCreator).where(SourceCreator.id == source_id))
        if not source:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="信息源不存在")
        if source.is_deleted:
            return GenericMessageResponse(message="信息源已删除")

        source.is_deleted = True
        source.deleted_at = datetime.now(timezone.utc)
        source.is_active = False
        self.db.add(source)
        self.db.commit()
        return GenericMessageResponse(message="信息源已删除")

    def restore_source(self, *, source_id: UUID) -> GenericMessageResponse:
        source = self.db.scalar(select(SourceCreator).where(SourceCreator.id == source_id))
        if not source:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="信息源不存在")
        if not source.is_deleted:
            return GenericMessageResponse(message="信息源已恢复")

        source.is_deleted = False
        source.deleted_at = None
        self.db.add(source)
        self.db.commit()
        return GenericMessageResponse(message="信息源已恢复")

    def enqueue_aggregate_refresh(self, *, source_id: UUID | None) -> dict[str, str | None]:
        # Keep preset config and DB sources in sync before running refresh jobs.
        AggregationService(self.db).ensure_preset_sources()

        source: SourceCreator | None = None
        if source_id is not None:
            source = self.db.scalar(
                select(SourceCreator).where(
                    SourceCreator.id == source_id,
                    SourceCreator.is_deleted.is_(False),
                )
            )
            if not source:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="信息源不存在")

        payload = enqueue_aggregation_refresh_job(
            source_id=source.id if source else None,
            source_slug=source.slug if source else None,
        )
        return {
            "job_id": str(payload["job_id"]),
            "status": str(payload["status"]),
            "source_id": str(payload["source_id"]) if payload.get("source_id") else None,
            "source_slug": str(payload["source_slug"]) if payload.get("source_slug") else None,
        }

    def get_aggregate_refresh_job(self, *, job_id: str) -> dict | None:
        return get_aggregation_refresh_job(job_id)

    def _build_admin_note_item(self, note: Note) -> AdminNoteItem:
        owner_user_id = note.user.user_id if note.user else ""
        owner_is_deleted = bool(note.user.is_deleted) if note.user else False
        return AdminNoteItem(
            id=note.id,
            owner_user_id=owner_user_id,
            owner_is_deleted=owner_is_deleted,
            source_url=note.source_url_normalized,
            source_domain=note.source_domain,
            source_title=note.source_title,
            visibility=note.visibility,
            analysis_status=note.analysis_status,
            is_deleted=note.is_deleted,
            deleted_at=note.deleted_at,
            updated_at=note.updated_at,
        )

    def _validate_note_status(self, value: str | None) -> str | None:
        if value is None:
            return None
        status_value = value.strip().lower()
        allowed = {"pending", "running", "succeeded", "failed"}
        if status_value not in allowed:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的分析状态")
        return status_value

    def _validate_note_visibility(self, value: str | None) -> str | None:
        if value is None:
            return None
        visibility = value.strip().lower()
        if visibility not in {"private", "public"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的可见性")
        return visibility

    def _validate_deleted_filter(self, value: str | None) -> bool | None:
        if value is None:
            return None
        raw = value.strip().lower()
        if raw == "all" or raw == "":
            return None
        if raw == "active":
            return False
        if raw == "deleted":
            return True
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的删除状态过滤条件")

    def _validate_active_filter(self, value: str | None) -> bool | None:
        if value is None:
            return None
        raw = value.strip().lower()
        if raw in {"", "all"}:
            return None
        if raw in {"active", "true", "1"}:
            return True
        if raw in {"inactive", "false", "0"}:
            return False
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的启用状态过滤条件")

    def _normalize_slug(self, raw: str) -> str:
        value = raw.strip().lower()
        if not value or not value.replace("_", "-").replace("-", "").isalnum():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="slug 仅支持字母数字下划线和中划线")
        if len(value) > 64:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="slug 长度不能超过 64")
        return value

    def _normalize_display_name(self, raw: str) -> str:
        value = raw.strip()
        if not value:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="display_name 不能为空")
        return value

    def _normalize_source_domain(self, raw: str) -> str:
        value = raw.strip().lower().strip(".")
        if not value or "." not in value:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="source_domain 格式不合法")
        return value

    def _normalize_http_url(self, raw: str) -> str:
        value = raw.strip()
        parsed = urllib.parse.urlsplit(value)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="URL 仅支持 http/https")
        return value

    def _ensure_domain_matches_url(self, *, source_domain: str, url: str, field_label: str) -> None:
        host = (urllib.parse.urlsplit(url).hostname or "").strip().lower()
        if not host:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_label} 格式不合法")
        if host == source_domain or host.endswith(f".{source_domain}"):
            return
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_label} 域名与 source_domain 不匹配",
        )
