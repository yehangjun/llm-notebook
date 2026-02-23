from pydantic import BaseModel, EmailStr, Field

from app.schemas.user import UserPublic


class RegisterRequest(BaseModel):
    user_id: str = Field(min_length=4, max_length=32, pattern=r"^[a-zA-Z0-9_]{4,32}$")
    email: EmailStr
    email_code: str = Field(min_length=4, max_length=16)
    password: str = Field(min_length=8, max_length=128)
    password_confirm: str
    nickname: str | None = Field(default=None, max_length=64)
    ui_language: str = Field(default="zh-CN")


class LoginRequest(BaseModel):
    principal: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=16)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class SendRegisterEmailCodeRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=16)
    new_password: str = Field(min_length=8, max_length=128)
    new_password_confirm: str


class SSOCompleteRequest(BaseModel):
    sso_ticket: str = Field(min_length=16, max_length=256)
    user_id: str = Field(min_length=4, max_length=32, pattern=r"^[a-zA-Z0-9_]{4,32}$")
    nickname: str | None = Field(default=None, max_length=64)
    ui_language: str = Field(default="zh-CN")


class TokenPayload(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class AuthResponse(BaseModel):
    user: UserPublic
    token: TokenPayload


class GenericMessageResponse(BaseModel):
    message: str
