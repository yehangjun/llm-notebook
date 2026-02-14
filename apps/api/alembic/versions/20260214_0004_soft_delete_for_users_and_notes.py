"""add soft delete for users and notes

Revision ID: 20260214_0004
Revises: 20260214_0003
Create Date: 2026-02-14 16:40:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260214_0004"
down_revision = "20260214_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("notes", sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("notes", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))

    op.drop_index("ix_users_user_id", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.create_index(
        "ix_users_user_id",
        "users",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
    )
    op.create_index(
        "ix_users_email",
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
    )

    op.drop_constraint("uq_notes_user_url", "notes", type_="unique")
    op.create_index(
        "uq_notes_user_url_active",
        "notes",
        ["user_id", "source_url_normalized"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
    )

    op.create_index("ix_users_is_deleted", "users", ["is_deleted"], unique=False)
    op.create_index("ix_notes_is_deleted", "notes", ["is_deleted"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_notes_is_deleted", table_name="notes")
    op.drop_index("uq_notes_user_url_active", table_name="notes")
    op.create_unique_constraint("uq_notes_user_url", "notes", ["user_id", "source_url_normalized"])

    op.drop_index("ix_users_is_deleted", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_user_id", table_name="users")
    op.create_index("ix_users_user_id", "users", ["user_id"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.drop_column("notes", "deleted_at")
    op.drop_column("notes", "is_deleted")
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "is_deleted")
