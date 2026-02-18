"""add feed url and soft delete fields for source creators

Revision ID: 20260218_0008
Revises: 20260215_0007
Create Date: 2026-02-18 01:10:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260218_0008"
down_revision = "20260215_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("source_creators", sa.Column("feed_url", sa.Text(), nullable=True))
    op.add_column("source_creators", sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("source_creators", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))

    op.execute("UPDATE source_creators SET feed_url = homepage_url WHERE feed_url IS NULL")
    op.alter_column("source_creators", "feed_url", nullable=False)
    op.create_index("ix_source_creators_is_deleted", "source_creators", ["is_deleted"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_source_creators_is_deleted", table_name="source_creators")
    op.drop_column("source_creators", "deleted_at")
    op.drop_column("source_creators", "is_deleted")
    op.drop_column("source_creators", "feed_url")
