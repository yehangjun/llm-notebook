"""add note failure diagnostics fields

Revision ID: 20260221_0012
Revises: 20260219_0011
Create Date: 2026-02-21 20:25:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260221_0012"
down_revision = "20260219_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("note_ai_summaries", sa.Column("error_stage", sa.String(length=32), nullable=True))
    op.add_column("note_ai_summaries", sa.Column("error_class", sa.String(length=96), nullable=True))
    op.add_column("note_ai_summaries", sa.Column("retryable", sa.Boolean(), nullable=True))
    op.add_column("note_ai_summaries", sa.Column("elapsed_ms", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("note_ai_summaries", "elapsed_ms")
    op.drop_column("note_ai_summaries", "retryable")
    op.drop_column("note_ai_summaries", "error_class")
    op.drop_column("note_ai_summaries", "error_stage")
