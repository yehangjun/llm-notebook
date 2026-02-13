import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, user_pk: uuid.UUID) -> User | None:
        return self.db.get(User, user_pk)

    def get_by_user_id(self, user_id: str) -> User | None:
        return self.db.scalar(select(User).where(User.user_id == user_id))

    def get_by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(User.email == email))

    def get_by_principal(self, principal: str) -> User | None:
        stmt = select(User).where(or_(User.user_id == principal, User.email == principal))
        return self.db.scalar(stmt)

    def create(self, *, user_id: str, email: str, password_hash: str, nickname: str | None, ui_language: str) -> User:
        user = User(
            user_id=user_id,
            email=email,
            password_hash=password_hash,
            nickname=nickname,
            ui_language=ui_language,
        )
        self.db.add(user)
        self.db.flush()
        return user
