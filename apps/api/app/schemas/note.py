from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class NoteSummaryPublic(BaseModel):
    id: UUID
    status: str
    source_language: str | None
    title: str | None
    published_at: datetime | None
    summary_short_text: str | None
    summary_long_text: str | None
    summary_text: str | None
    tags: list[str] = Field(default_factory=list)
    model_provider: str | None
    model_name: str | None
    model_version: str | None
    analyzed_at: datetime
    error_code: str | None
    error_message: str | None


class NoteListItem(BaseModel):
    id: UUID
    source_url: str
    source_domain: str
    source_title: str | None
    published_at: datetime | None
    tags: list[str] = Field(default_factory=list)
    summary_excerpt: str | None
    auto_summary_excerpt: str | None
    note_body_excerpt: str | None
    like_count: int
    bookmark_count: int
    visibility: str
    analysis_status: str
    updated_at: datetime


class NoteDetail(BaseModel):
    id: UUID
    source_url: str
    source_domain: str
    source_title: str | None
    tags: list[str] = Field(default_factory=list)
    note_body_md: str
    visibility: str
    analysis_status: str
    analysis_error: str | None
    created_at: datetime
    updated_at: datetime
    latest_summary: NoteSummaryPublic | None


class PublicNoteDetail(BaseModel):
    id: UUID
    source_url: str
    source_domain: str
    source_title: str | None
    tags: list[str] = Field(default_factory=list)
    note_body_md: str
    analysis_status: str
    created_at: datetime
    updated_at: datetime
    latest_summary: NoteSummaryPublic | None


class NoteListResponse(BaseModel):
    notes: list[NoteListItem]


class AdminNoteItem(BaseModel):
    id: UUID
    owner_user_id: str
    owner_is_deleted: bool
    source_url: str
    source_domain: str
    source_title: str | None
    visibility: str
    analysis_status: str
    analysis_error: str | None
    failure_error_code: str | None
    failure_error_message: str | None
    failure_error_stage: Literal["content_fetch", "llm_request", "llm_parse", "unknown"] | None
    failure_error_class: str | None
    failure_retryable: bool | None
    failure_elapsed_ms: int | None
    failure_analyzed_at: datetime | None
    is_deleted: bool
    deleted_at: datetime | None
    updated_at: datetime


class AdminNoteListResponse(BaseModel):
    notes: list[AdminNoteItem]


class CreateNoteRequest(BaseModel):
    source_url: str = Field(min_length=8, max_length=2048)
    visibility: str = Field(default="public")
    note_body_md: str | None = None
    tags: list[str] | None = None


class UpdateNoteRequest(BaseModel):
    note_body_md: str | None = None
    visibility: str | None = None
    tags: list[str] | None = None


class CreateNoteResponse(BaseModel):
    note: NoteDetail
    created: bool
    message: str | None = None
