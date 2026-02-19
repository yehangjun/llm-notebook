"""add multilingual tag fields

Revision ID: 20260219_0011
Revises: 20260218_0010
Create Date: 2026-02-19 17:10:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260219_0011"
down_revision = "20260218_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("note_ai_summaries", sa.Column("output_tags_zh_json", sa.JSON(), nullable=True))
    op.add_column("aggregate_items", sa.Column("tags_zh_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("aggregate_items", "tags_zh_json")
    op.drop_column("note_ai_summaries", "output_tags_zh_json")
