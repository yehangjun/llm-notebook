"""add is_admin to users

Revision ID: 20260213_0002
Revises: 20260213_0001
Create Date: 2026-02-13 14:45:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260213_0002"
down_revision = "20260213_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("users", "is_admin")
