import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class AggregateItem(Base):
    __tablename__ = "aggregate_items"
    __table_args__ = (
        CheckConstraint(
            "analysis_status IN ('pending', 'running', 'succeeded', 'failed')",
            name="ck_aggregate_items_analysis_status",
        ),
        Index("uq_aggregate_items_source_url_normalized", "source_url_normalized", unique=True),
        Index("ix_aggregate_items_source_creator_id", "source_creator_id"),
        Index("ix_aggregate_items_source_domain", "source_domain"),
        Index("ix_aggregate_items_analysis_status", "analysis_status"),
        Index("ix_aggregate_items_updated_at", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_creator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("source_creators.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    source_url_normalized: Mapped[str] = mapped_column(Text, nullable=False)
    source_domain: Mapped[str] = mapped_column(String(255), nullable=False)
    source_language: Mapped[str | None] = mapped_column(String(16), nullable=True)
    source_title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source_title_zh: Mapped[str | None] = mapped_column(String(512), nullable=True)
    tags_json: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    tags_zh_json: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    analysis_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    analysis_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_short_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_short_text_zh: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_text_zh: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(128), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    source_creator = relationship("SourceCreator", back_populates="aggregate_items")
