import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user_session import UserSession


class SessionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self,
        *,
        user_id: uuid.UUID,
        refresh_token_hash: str,
        expires_at: datetime,
        ip: str | None,
        user_agent: str | None,
    ) -> UserSession:
        session = UserSession(
            user_id=user_id,
            refresh_token_hash=refresh_token_hash,
            expires_at=expires_at,
            ip=ip,
            user_agent=user_agent,
        )
        self.db.add(session)
        self.db.flush()
        return session

    def get_active_by_refresh_hash(self, refresh_token_hash: str) -> UserSession | None:
        now = datetime.now(timezone.utc)
        stmt = select(UserSession).where(
            UserSession.refresh_token_hash == refresh_token_hash,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
        )
        return self.db.scalar(stmt)

    def revoke(self, session: UserSession) -> None:
        session.revoked_at = datetime.now(timezone.utc)
        self.db.add(session)

    def revoke_all_for_user(self, user_id: uuid.UUID) -> None:
        now = datetime.now(timezone.utc)
        stmt = select(UserSession).where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        for session in self.db.scalars(stmt):
            session.revoked_at = now
            self.db.add(session)
