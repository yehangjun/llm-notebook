from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import ALLOWED_UI_LANGUAGES
from app.models.user import User
from app.repositories.user_repo import UserRepository
from app.schemas.user import AdminUpdateUserRequest


class AdminService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.user_repo = UserRepository(db)

    def list_users(self, *, keyword: str | None, offset: int, limit: int) -> list[User]:
        return self.user_repo.list_users(keyword=keyword, offset=offset, limit=limit)

    def update_user(self, *, target_user_id: str, payload: AdminUpdateUserRequest, current_admin: User) -> User:
        user = self.user_repo.get_by_user_id(target_user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

        if payload.ui_language is not None and payload.ui_language not in ALLOWED_UI_LANGUAGES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的界面语言")

        if payload.is_admin is False and user.id == current_admin.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能移除当前登录管理员权限")

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
