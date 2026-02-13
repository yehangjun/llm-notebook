from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    email: str
    nickname: str | None
    ui_language: str
    is_admin: bool
    created_at: datetime


class UpdateMeRequest(BaseModel):
    nickname: str | None = None
    ui_language: str | None = None


class AdminUserItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    email: str
    nickname: str | None
    ui_language: str
    is_admin: bool
    created_at: datetime


class AdminUserListResponse(BaseModel):
    users: list[AdminUserItem]


class AdminUpdateUserRequest(BaseModel):
    nickname: str | None = None
    ui_language: str | None = None
    is_admin: bool | None = None
