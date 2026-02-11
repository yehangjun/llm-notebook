from datetime import datetime
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=20)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'


class UserOut(BaseModel):
    id: str
    phone: str
    display_name: str


class ArticleOut(BaseModel):
    id: str
    source_id: int
    title: str
    summary: str
    url: str
    language: str
    published_at: datetime


class NoteCreate(BaseModel):
    article_id: str | None = None
    title: str = Field(min_length=1, max_length=300)
    content: str = Field(min_length=1)
    is_public: bool = False
    tags: list[str] = Field(default_factory=list)


class NoteOut(BaseModel):
    id: str
    article_id: str | None
    title: str
    content: str
    is_public: bool
    created_at: datetime
    updated_at: datetime
