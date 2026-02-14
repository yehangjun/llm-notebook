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
    updated_at: datetime
    like_count: int
    bookmark_count: int
    liked: bool
    bookmarked: bool
    following: bool


class FeedListResponse(BaseModel):
    items: list[FeedItem]


class FeedDetailResponse(BaseModel):
    item: FeedItem
    summary_text: str | None
    key_points: list[str] = Field(default_factory=list)
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
