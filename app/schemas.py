from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=20)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'


class UserOut(BaseModel):
    id: UUID
    phone: str
    display_name: str


class ArticleOut(BaseModel):
    id: UUID
    source_id: int
    title: str
    summary: str
    url: str
    language: str
    published_at: datetime


class NoteCreate(BaseModel):
    article_id: UUID | None = None
    title: str = Field(min_length=1, max_length=300)
    content: str = Field(min_length=1)
    is_public: bool = False
    tags: list[str] = Field(default_factory=list)


class NoteOut(BaseModel):
    id: UUID
    article_id: UUID | None
    title: str
    content: str
    is_public: bool
    created_at: datetime
    updated_at: datetime
