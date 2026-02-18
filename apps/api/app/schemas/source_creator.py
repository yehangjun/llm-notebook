from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AdminSourceCreatorItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    display_name: str
    source_domain: str
    feed_url: str
    homepage_url: str
    is_active: bool
    is_deleted: bool
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AdminSourceCreatorListResponse(BaseModel):
    sources: list[AdminSourceCreatorItem]


class AdminCreateSourceCreatorRequest(BaseModel):
    slug: str = Field(min_length=2, max_length=64)
    display_name: str = Field(min_length=1, max_length=128)
    source_domain: str = Field(min_length=3, max_length=255)
    feed_url: str = Field(min_length=8, max_length=2048)
    homepage_url: str = Field(min_length=8, max_length=2048)
    is_active: bool = True


class AdminUpdateSourceCreatorRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=128)
    source_domain: str | None = Field(default=None, min_length=3, max_length=255)
    feed_url: str | None = Field(default=None, min_length=8, max_length=2048)
    homepage_url: str | None = Field(default=None, min_length=8, max_length=2048)
    is_active: bool | None = None


class AggregateRefreshJobAccepted(BaseModel):
    job_id: str
    status: Literal["queued"]
    scope: Literal["all", "source"]
    source_id: str | None = None
    source_slug: str | None = None
    message: str


class AggregateRefreshJobStatus(BaseModel):
    job_id: str
    status: Literal["queued", "running", "succeeded", "failed", "not_found"]
    scope: Literal["all", "source"] | None = None
    source_id: str | None = None
    source_slug: str | None = None
    total_sources: int | None = None
    refreshed_items: int | None = None
    failed_items: int | None = None
    created_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error_message: str | None = None
