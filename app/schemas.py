from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SendEmailCodeRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)


class SendEmailCodeResponse(BaseModel):
    sent: bool
    expires_in_seconds: int
    debug_code: str | None = None


class VerifyEmailCodeRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    code: str = Field(min_length=4, max_length=12)
    display_name: str | None = Field(default=None, max_length=100)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'


class UserOut(BaseModel):
    id: UUID
    email: str | None
    phone: str | None
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
