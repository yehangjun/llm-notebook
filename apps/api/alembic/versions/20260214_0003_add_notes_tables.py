"""add notes tables

Revision ID: 20260214_0003
Revises: 20260213_0002
Create Date: 2026-02-14 13:00:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260214_0003"
down_revision = "20260213_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("source_url_normalized", sa.Text(), nullable=False),
        sa.Column("source_domain", sa.String(length=255), nullable=False),
        sa.Column("source_title", sa.String(length=512), nullable=True),
        sa.Column("note_body_md", sa.Text(), nullable=False, server_default=""),
        sa.Column("visibility", sa.String(length=16), nullable=False, server_default="private"),
        sa.Column("analysis_status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("analysis_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("visibility IN ('private', 'public')", name="ck_notes_visibility"),
        sa.CheckConstraint(
            "analysis_status IN ('pending', 'running', 'succeeded', 'failed')",
            name="ck_notes_analysis_status",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "source_url_normalized", name="uq_notes_user_url"),
    )
    op.create_index("ix_notes_user_id", "notes", ["user_id"], unique=False)
    op.create_index("ix_notes_source_domain", "notes", ["source_domain"], unique=False)
    op.create_index("ix_notes_visibility", "notes", ["visibility"], unique=False)
    op.create_index("ix_notes_analysis_status", "notes", ["analysis_status"], unique=False)
    op.create_index("ix_notes_updated_at", "notes", ["updated_at"], unique=False)

    op.create_table(
        "note_ai_summaries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("note_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("summary_text", sa.Text(), nullable=True),
        sa.Column("key_points_json", sa.JSON(), nullable=True),
        sa.Column("model_provider", sa.String(length=64), nullable=True),
        sa.Column("model_name", sa.String(length=128), nullable=True),
        sa.Column("model_version", sa.String(length=128), nullable=True),
        sa.Column("analyzed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("status IN ('succeeded', 'failed')", name="ck_note_ai_summaries_status"),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_note_ai_summaries_note_id", "note_ai_summaries", ["note_id"], unique=False)
    op.create_index("ix_note_ai_summaries_analyzed_at", "note_ai_summaries", ["analyzed_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_note_ai_summaries_analyzed_at", table_name="note_ai_summaries")
    op.drop_index("ix_note_ai_summaries_note_id", table_name="note_ai_summaries")
    op.drop_table("note_ai_summaries")

    op.drop_index("ix_notes_updated_at", table_name="notes")
    op.drop_index("ix_notes_analysis_status", table_name="notes")
    op.drop_index("ix_notes_visibility", table_name="notes")
    op.drop_index("ix_notes_source_domain", table_name="notes")
    op.drop_index("ix_notes_user_id", table_name="notes")
    op.drop_table("notes")
