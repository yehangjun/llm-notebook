"""set notes visibility default to public

Revision ID: 20260215_0006
Revises: 20260215_0005
Create Date: 2026-02-15 02:10:00

"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260215_0006"
down_revision = "20260215_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("notes", "visibility", server_default="public")


def downgrade() -> None:
    op.alter_column("notes", "visibility", server_default="private")

