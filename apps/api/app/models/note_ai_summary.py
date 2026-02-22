import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class NoteAISummary(Base):
    __tablename__ = "note_ai_summaries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    note_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("notes.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    source_language: Mapped[str | None] = mapped_column(String(16), nullable=True)
    output_title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    output_title_zh: Mapped[str | None] = mapped_column(String(512), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    output_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_summary_zh: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_tags_json: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    output_tags_zh_json: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_text_zh: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(128), nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estimated_cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    raw_response_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_stage: Mapped[str | None] = mapped_column(String(32), nullable=True)
    error_class: Mapped[str | None] = mapped_column(String(96), nullable=True)
    retryable: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    elapsed_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    analyzed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    note = relationship("Note", back_populates="ai_summaries")
