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

    def list_users(self, *, keyword: str | None = None, offset: int = 0, limit: int = 50) -> list[User]:
        stmt = select(User).order_by(User.created_at.desc()).offset(offset).limit(limit)
        if keyword:
            like = f"%{keyword}%"
            stmt = (
                select(User)
                .where(or_(User.user_id.ilike(like), User.email.ilike(like), User.nickname.ilike(like)))
                .order_by(User.created_at.desc())
                .offset(offset)
                .limit(limit)
            )
        return list(self.db.scalars(stmt))

    def create(
        self,
        *,
        user_id: str,
        email: str,
        password_hash: str,
        nickname: str | None,
        ui_language: str,
        is_admin: bool = False,
    ) -> User:
        user = User(
            user_id=user_id,
            email=email,
            password_hash=password_hash,
            nickname=nickname,
            ui_language=ui_language,
            is_admin=is_admin,
        )
        self.db.add(user)
        self.db.flush()
        return user
