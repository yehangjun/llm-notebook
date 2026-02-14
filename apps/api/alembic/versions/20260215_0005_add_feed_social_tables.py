"""add feed and social tables

Revision ID: 20260215_0005
Revises: 20260214_0004
Create Date: 2026-02-15 01:00:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260215_0005"
down_revision = "20260214_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("tags_json", sa.JSON(), nullable=False, server_default="[]"))

    op.create_table(
        "source_creators",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=128), nullable=False),
        sa.Column("source_domain", sa.String(length=255), nullable=False),
        sa.Column("homepage_url", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_source_creators_slug", "source_creators", ["slug"], unique=True)
    op.create_index("ix_source_creators_source_domain", "source_creators", ["source_domain"], unique=True)
    op.create_index("ix_source_creators_is_active", "source_creators", ["is_active"], unique=False)

    op.create_table(
        "aggregate_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_creator_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("source_url_normalized", sa.Text(), nullable=False),
        sa.Column("source_domain", sa.String(length=255), nullable=False),
        sa.Column("source_title", sa.String(length=512), nullable=True),
        sa.Column("tags_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("analysis_status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("analysis_error", sa.Text(), nullable=True),
        sa.Column("summary_text", sa.Text(), nullable=True),
        sa.Column("key_points_json", sa.JSON(), nullable=True),
        sa.Column("model_provider", sa.String(length=64), nullable=True),
        sa.Column("model_name", sa.String(length=128), nullable=True),
        sa.Column("model_version", sa.String(length=128), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "analysis_status IN ('pending', 'running', 'succeeded', 'failed')",
            name="ck_aggregate_items_analysis_status",
        ),
        sa.ForeignKeyConstraint(["source_creator_id"], ["source_creators.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_aggregate_items_source_url_normalized",
        "aggregate_items",
        ["source_url_normalized"],
        unique=True,
    )
    op.create_index("ix_aggregate_items_source_creator_id", "aggregate_items", ["source_creator_id"], unique=False)
    op.create_index("ix_aggregate_items_source_domain", "aggregate_items", ["source_domain"], unique=False)
    op.create_index("ix_aggregate_items_analysis_status", "aggregate_items", ["analysis_status"], unique=False)
    op.create_index("ix_aggregate_items_updated_at", "aggregate_items", ["updated_at"], unique=False)

    op.create_table(
        "user_follows",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("follower_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("target_source_creator_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "(target_user_id IS NOT NULL AND target_source_creator_id IS NULL) "
            "OR (target_user_id IS NULL AND target_source_creator_id IS NOT NULL)",
            name="ck_user_follows_target_oneof",
        ),
        sa.ForeignKeyConstraint(["follower_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_source_creator_id"], ["source_creators.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_follows_follower_user_id", "user_follows", ["follower_user_id"], unique=False)
    op.create_index(
        "uq_user_follows_user_target",
        "user_follows",
        ["follower_user_id", "target_user_id"],
        unique=True,
        postgresql_where=sa.text("target_user_id IS NOT NULL"),
    )
    op.create_index(
        "uq_user_follows_source_target",
        "user_follows",
        ["follower_user_id", "target_source_creator_id"],
        unique=True,
        postgresql_where=sa.text("target_source_creator_id IS NOT NULL"),
    )

    op.create_table(
        "user_bookmarks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("note_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("aggregate_item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "(note_id IS NOT NULL AND aggregate_item_id IS NULL) "
            "OR (note_id IS NULL AND aggregate_item_id IS NOT NULL)",
            name="ck_user_bookmarks_target_oneof",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["aggregate_item_id"], ["aggregate_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_bookmarks_user_id", "user_bookmarks", ["user_id"], unique=False)
    op.create_index("ix_user_bookmarks_created_at", "user_bookmarks", ["created_at"], unique=False)
    op.create_index(
        "uq_user_bookmarks_note_target",
        "user_bookmarks",
        ["user_id", "note_id"],
        unique=True,
        postgresql_where=sa.text("note_id IS NOT NULL"),
    )
    op.create_index(
        "uq_user_bookmarks_aggregate_target",
        "user_bookmarks",
        ["user_id", "aggregate_item_id"],
        unique=True,
        postgresql_where=sa.text("aggregate_item_id IS NOT NULL"),
    )

    op.create_table(
        "user_likes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("note_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("aggregate_item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "(note_id IS NOT NULL AND aggregate_item_id IS NULL) "
            "OR (note_id IS NULL AND aggregate_item_id IS NOT NULL)",
            name="ck_user_likes_target_oneof",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["aggregate_item_id"], ["aggregate_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_likes_user_id", "user_likes", ["user_id"], unique=False)
    op.create_index("ix_user_likes_created_at", "user_likes", ["created_at"], unique=False)
    op.create_index(
        "uq_user_likes_note_target",
        "user_likes",
        ["user_id", "note_id"],
        unique=True,
        postgresql_where=sa.text("note_id IS NOT NULL"),
    )
    op.create_index(
        "uq_user_likes_aggregate_target",
        "user_likes",
        ["user_id", "aggregate_item_id"],
        unique=True,
        postgresql_where=sa.text("aggregate_item_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_user_likes_aggregate_target", table_name="user_likes")
    op.drop_index("uq_user_likes_note_target", table_name="user_likes")
    op.drop_index("ix_user_likes_created_at", table_name="user_likes")
    op.drop_index("ix_user_likes_user_id", table_name="user_likes")
    op.drop_table("user_likes")

    op.drop_index("uq_user_bookmarks_aggregate_target", table_name="user_bookmarks")
    op.drop_index("uq_user_bookmarks_note_target", table_name="user_bookmarks")
    op.drop_index("ix_user_bookmarks_created_at", table_name="user_bookmarks")
    op.drop_index("ix_user_bookmarks_user_id", table_name="user_bookmarks")
    op.drop_table("user_bookmarks")

    op.drop_index("uq_user_follows_source_target", table_name="user_follows")
    op.drop_index("uq_user_follows_user_target", table_name="user_follows")
    op.drop_index("ix_user_follows_follower_user_id", table_name="user_follows")
    op.drop_table("user_follows")

    op.drop_index("ix_aggregate_items_updated_at", table_name="aggregate_items")
    op.drop_index("ix_aggregate_items_analysis_status", table_name="aggregate_items")
    op.drop_index("ix_aggregate_items_source_domain", table_name="aggregate_items")
    op.drop_index("ix_aggregate_items_source_creator_id", table_name="aggregate_items")
    op.drop_index("uq_aggregate_items_source_url_normalized", table_name="aggregate_items")
    op.drop_table("aggregate_items")

    op.drop_index("ix_source_creators_is_active", table_name="source_creators")
    op.drop_index("ix_source_creators_source_domain", table_name="source_creators")
    op.drop_index("ix_source_creators_slug", table_name="source_creators")
    op.drop_table("source_creators")

    op.drop_column("notes", "tags_json")
