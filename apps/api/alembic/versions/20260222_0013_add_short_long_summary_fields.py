"""add short/long summary fields

Revision ID: 20260222_0013
Revises: 20260221_0012
Create Date: 2026-02-22 19:10:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260222_0013"
down_revision = "20260221_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("note_ai_summaries", sa.Column("summary_text_zh", sa.Text(), nullable=True))
    op.add_column("aggregate_items", sa.Column("summary_short_text", sa.Text(), nullable=True))
    op.add_column("aggregate_items", sa.Column("summary_short_text_zh", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("aggregate_items", "summary_short_text_zh")
    op.drop_column("aggregate_items", "summary_short_text")
    op.drop_column("note_ai_summaries", "summary_text_zh")
