from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class FeedItem(BaseModel):
    id: UUID
    item_type: Literal["note", "aggregate"]
    creator_kind: Literal["user", "source"]
    creator_id: str
    creator_name: str
    source_url: str
    source_domain: str
    source_title: str | None
    tags: list[str] = Field(default_factory=list)
    analysis_status: str
    summary_excerpt: str | None
    auto_summary_excerpt: str | None
    note_body_excerpt: str | None
    published_at: datetime | None
    updated_at: datetime
    like_count: int
    bookmark_count: int
    liked: bool
    bookmarked: bool
    following: bool


class FeedListResponse(BaseModel):
    items: list[FeedItem]


class CreatorProfileResponse(BaseModel):
    creator_kind: Literal["user", "source"]
    creator_id: str
    display_name: str
    source_domain: str | None
    homepage_url: str | None
    follower_count: int
    content_count: int
    following: bool
    can_follow: bool


class FeedDetailResponse(BaseModel):
    item: FeedItem
    summary_text: str | None
    note_body_md: str | None
    analysis_error: str | None
    model_provider: str | None
    model_name: str | None
    model_version: str | None
    analyzed_at: datetime | None


class RefreshAggregatesResponse(BaseModel):
    total_sources: int
    refreshed_items: int
    failed_items: int
