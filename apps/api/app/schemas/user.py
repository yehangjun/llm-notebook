from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    email: str
    nickname: str | None
    ui_language: str
    created_at: datetime


class UpdateMeRequest(BaseModel):
    nickname: str | None = None
    ui_language: str | None = None
