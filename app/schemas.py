from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class SendEmailCodeRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    purpose: Literal['register', 'login'] = 'login'


class SendEmailCodeResponse(BaseModel):
    sent: bool
    expires_in_seconds: int
    debug_code: str | None = None


class VerifyEmailCodeRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    code: str = Field(min_length=4, max_length=12)
    purpose: Literal['register', 'login'] = 'login'
    display_name: str | None = Field(default=None, max_length=100)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'


class UserOut(BaseModel):
    id: UUID
    public_id: str
    email: str | None
    phone: str | None
    display_name: str
    ui_language: str


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    public_id: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=200)
    display_name: str | None = Field(default=None, max_length=100)
    ui_language: str | None = Field(default='zh', max_length=10)


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=200)


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=100)
    password: str | None = Field(default=None, min_length=8, max_length=200)
    ui_language: str | None = Field(default=None, max_length=10)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)


class ForgotPasswordResponse(BaseModel):
    sent: bool


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


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
