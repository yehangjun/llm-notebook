import logging

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_password_hash
from app.db import base as _db_models  # noqa: F401
from app.repositories.user_repo import UserRepository
from app.services.aggregation_service import AggregationService

logger = logging.getLogger(__name__)


class BootstrapService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.user_repo = UserRepository(db)

    def ensure_admin_account(self) -> None:
        admin_user_id = settings.admin_user_id.strip()
        admin_email = settings.admin_email.lower().strip()

        user_by_id = self.user_repo.get_by_user_id(admin_user_id)
        user_by_email = self.user_repo.get_by_email(admin_email)

        if user_by_id and user_by_email and user_by_id.id != user_by_email.id:
            logger.warning(
                "admin bootstrap conflict: ADMIN_USER_ID and ADMIN_EMAIL belong to different users",
                extra={"admin_user_id": admin_user_id, "admin_email": admin_email},
            )
            if not user_by_id.is_admin:
                user_by_id.is_admin = True
                self.db.add(user_by_id)
                self.db.commit()
            return

        existing_user = user_by_id or user_by_email
        if existing_user:
            if not existing_user.is_admin:
                existing_user.is_admin = True
                self.db.add(existing_user)
                self.db.commit()
                logger.info("bootstrap elevated existing user to admin", extra={"user_id": existing_user.user_id})
            return

        user = self.user_repo.create(
            user_id=admin_user_id,
            email=admin_email,
            password_hash=get_password_hash(settings.admin_password),
            nickname=settings.admin_nickname,
            ui_language="zh-CN",
            is_admin=True,
        )
        self.db.commit()
        logger.info("bootstrap created admin account", extra={"user_id": user.user_id, "email": user.email})

    def ensure_preset_sources(self) -> None:
        AggregationService(self.db).ensure_preset_sources()
