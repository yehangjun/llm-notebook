from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import ALLOWED_UI_LANGUAGES
from app.core.config import settings
from app.models.note import Note
from app.models.user import User
from app.repositories.note_repo import NoteRepository
from app.repositories.session_repo import SessionRepository
from app.repositories.user_repo import UserRepository
from app.schemas.auth import GenericMessageResponse
from app.schemas.note import AdminNoteItem
from app.schemas.user import AdminUpdateUserRequest


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

    def list_notes(self, *, keyword: str | None, offset: int, limit: int) -> list[AdminNoteItem]:
        notes = self.note_repo.list_for_admin(keyword=keyword, offset=offset, limit=limit)
        return [self._build_admin_note_item(note) for note in notes]

    def delete_note(self, *, note_id: UUID) -> GenericMessageResponse:
        note = self.note_repo.get_by_id_for_admin(note_id)
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")

        self.note_repo.soft_delete(note)
        self.db.commit()
        return GenericMessageResponse(message="笔记已删除")

    def _build_admin_note_item(self, note: Note) -> AdminNoteItem:
        owner_user_id = note.user.user_id if note.user else ""
        return AdminNoteItem(
            id=note.id,
            owner_user_id=owner_user_id,
            source_url=note.source_url_normalized,
            source_domain=note.source_domain,
            source_title=note.source_title,
            visibility=note.visibility,
            analysis_status=note.analysis_status,
            updated_at=note.updated_at,
        )
