import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserLike(Base):
    __tablename__ = "user_likes"
    __table_args__ = (
        CheckConstraint(
            "(note_id IS NOT NULL AND aggregate_item_id IS NULL) "
            "OR (note_id IS NULL AND aggregate_item_id IS NOT NULL)",
            name="ck_user_likes_target_oneof",
        ),
        Index(
            "uq_user_likes_note_target",
            "user_id",
            "note_id",
            unique=True,
            postgresql_where=text("note_id IS NOT NULL"),
        ),
        Index(
            "uq_user_likes_aggregate_target",
            "user_id",
            "aggregate_item_id",
            unique=True,
            postgresql_where=text("aggregate_item_id IS NOT NULL"),
        ),
        Index("ix_user_likes_user_id", "user_id"),
        Index("ix_user_likes_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    note_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        nullable=True,
    )
    aggregate_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("aggregate_items.id", ondelete="CASCADE"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

