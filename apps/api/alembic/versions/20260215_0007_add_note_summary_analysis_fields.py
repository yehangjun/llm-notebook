"""add structured analysis fields to note_ai_summaries

Revision ID: 20260215_0007
Revises: 20260215_0006
Create Date: 2026-02-15 21:30:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260215_0007"
down_revision = "20260215_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("note_ai_summaries", sa.Column("output_title", sa.String(length=512), nullable=True))
    op.add_column("note_ai_summaries", sa.Column("output_summary", sa.Text(), nullable=True))
    op.add_column("note_ai_summaries", sa.Column("output_tags_json", sa.JSON(), nullable=True))
    op.add_column("note_ai_summaries", sa.Column("prompt_version", sa.String(length=32), nullable=True))
    op.add_column("note_ai_summaries", sa.Column("input_tokens", sa.Integer(), nullable=True))
    op.add_column("note_ai_summaries", sa.Column("output_tokens", sa.Integer(), nullable=True))
    op.add_column("note_ai_summaries", sa.Column("estimated_cost_usd", sa.Numeric(10, 6), nullable=True))
    op.add_column("note_ai_summaries", sa.Column("raw_response_json", sa.JSON(), nullable=True))
    op.add_column("note_ai_summaries", sa.Column("error_code", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("note_ai_summaries", "error_code")
    op.drop_column("note_ai_summaries", "raw_response_json")
    op.drop_column("note_ai_summaries", "estimated_cost_usd")
    op.drop_column("note_ai_summaries", "output_tokens")
    op.drop_column("note_ai_summaries", "input_tokens")
    op.drop_column("note_ai_summaries", "prompt_version")
    op.drop_column("note_ai_summaries", "output_tags_json")
    op.drop_column("note_ai_summaries", "output_summary")
    op.drop_column("note_ai_summaries", "output_title")
