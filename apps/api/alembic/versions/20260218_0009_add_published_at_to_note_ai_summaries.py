"""add published_at to note_ai_summaries

Revision ID: 20260218_0009
Revises: 20260218_0008
Create Date: 2026-02-18 16:20:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260218_0009"
down_revision = "20260218_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("note_ai_summaries", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("note_ai_summaries", "published_at")
