"""add multilingual analysis fields

Revision ID: 20260218_0010
Revises: 20260218_0009
Create Date: 2026-02-18 22:10:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260218_0010"
down_revision = "20260218_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("note_ai_summaries", sa.Column("source_language", sa.String(length=16), nullable=True))
    op.add_column("note_ai_summaries", sa.Column("output_title_zh", sa.String(length=512), nullable=True))
    op.add_column("note_ai_summaries", sa.Column("output_summary_zh", sa.Text(), nullable=True))

    op.add_column("aggregate_items", sa.Column("source_language", sa.String(length=16), nullable=True))
    op.add_column("aggregate_items", sa.Column("source_title_zh", sa.String(length=512), nullable=True))
    op.add_column("aggregate_items", sa.Column("summary_text_zh", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("aggregate_items", "summary_text_zh")
    op.drop_column("aggregate_items", "source_title_zh")
    op.drop_column("aggregate_items", "source_language")

    op.drop_column("note_ai_summaries", "output_summary_zh")
    op.drop_column("note_ai_summaries", "output_title_zh")
    op.drop_column("note_ai_summaries", "source_language")
