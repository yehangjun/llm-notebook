import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user_identity import UserIdentity


class UserIdentityRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_provider_sub(self, *, provider: str, provider_sub: str) -> UserIdentity | None:
        stmt = select(UserIdentity).where(
            UserIdentity.provider == provider,
            UserIdentity.provider_sub == provider_sub,
        )
        return self.db.scalar(stmt)

    def create(self, *, user_id: uuid.UUID, provider: str, provider_sub: str) -> UserIdentity:
        identity = UserIdentity(
            user_id=user_id,
            provider=provider,
            provider_sub=provider_sub,
        )
        self.db.add(identity)
        self.db.flush()
        return identity
