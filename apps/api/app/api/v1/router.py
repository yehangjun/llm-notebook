from fastapi import APIRouter

from app.api.v1.admin import router as admin_router
from app.api.v1.auth import router as auth_router
from app.api.v1.feed import router as feed_router
from app.api.v1.notes import router as notes_router
from app.api.v1.profile import router as profile_router
from app.api.v1.social import router as social_router
from app.api.v1.sso import router as sso_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(profile_router)
api_router.include_router(sso_router)
api_router.include_router(admin_router)
api_router.include_router(notes_router)
api_router.include_router(feed_router)
api_router.include_router(social_router)
