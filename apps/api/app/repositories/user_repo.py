import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _with_active_filter(self, stmt, *, include_deleted: bool):
        if include_deleted:
            return stmt
        return stmt.where(User.is_deleted.is_(False))

    def get_by_id(self, user_pk: uuid.UUID, *, include_deleted: bool = False) -> User | None:
        stmt = select(User).where(User.id == user_pk)
        stmt = self._with_active_filter(stmt, include_deleted=include_deleted)
        return self.db.scalar(stmt)

    def get_by_user_id(self, user_id: str, *, include_deleted: bool = False) -> User | None:
        stmt = select(User).where(User.user_id == user_id)
        stmt = self._with_active_filter(stmt, include_deleted=include_deleted)
        return self.db.scalar(stmt)

    def get_by_email(self, email: str, *, include_deleted: bool = False) -> User | None:
        stmt = select(User).where(User.email == email)
        stmt = self._with_active_filter(stmt, include_deleted=include_deleted)
        return self.db.scalar(stmt)

    def get_by_principal(self, principal: str, *, include_deleted: bool = False) -> User | None:
        stmt = select(User).where(or_(User.user_id == principal, User.email == principal))
        stmt = self._with_active_filter(stmt, include_deleted=include_deleted)
        return self.db.scalar(stmt)

    def list_users(
        self,
        *,
        keyword: str | None = None,
        offset: int = 0,
        limit: int = 50,
        include_deleted: bool = False,
    ) -> list[User]:
        stmt = select(User)
        if keyword:
            like = f"%{keyword}%"
            stmt = stmt.where(or_(User.user_id.ilike(like), User.email.ilike(like), User.nickname.ilike(like)))
        stmt = self._with_active_filter(stmt, include_deleted=include_deleted)
        stmt = stmt.order_by(User.created_at.desc()).offset(offset).limit(limit)
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
