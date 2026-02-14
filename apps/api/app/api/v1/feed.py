from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.feed import FeedDetailResponse, FeedListResponse
from app.services.feed_service import FeedService

router = APIRouter(prefix="/feed", tags=["feed"])


@router.get("", response_model=FeedListResponse)
def list_feed(
    scope: str | None = Query(default="all"),
    tag: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return FeedService(db).list_feed(
        user=current_user,
        scope=scope,
        tag=tag,
        keyword=keyword,
        offset=offset,
        limit=limit,
    )


@router.get("/bookmarks", response_model=FeedListResponse)
def list_bookmarks(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return FeedService(db).list_bookmarks(user=current_user, offset=offset, limit=limit)


@router.get("/items/{item_type}/{item_id}", response_model=FeedDetailResponse)
def get_feed_item_detail(
    item_type: str,
    item_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return FeedService(db).get_item_detail(
        user=current_user,
        item_type=item_type,
        item_id=item_id,
    )
