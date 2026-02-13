from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import ALLOWED_UI_LANGUAGES
from app.models.user import User
from app.schemas.user import UpdateMeRequest


class UserService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def update_me(self, user: User, payload: UpdateMeRequest) -> User:
        if payload.ui_language is not None and payload.ui_language not in ALLOWED_UI_LANGUAGES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的界面语言")

        if payload.nickname is not None:
            user.nickname = payload.nickname.strip() or None
        if payload.ui_language is not None:
            user.ui_language = payload.ui_language

        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
