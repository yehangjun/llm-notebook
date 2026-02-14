from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import GenericMessageResponse
from app.services.social_service import SocialService

router = APIRouter(prefix="/social", tags=["social"])


@router.post("/follows/users/{target_user_id}", response_model=GenericMessageResponse)
def follow_user(
    target_user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return SocialService(db).follow_user(user=current_user, target_user_id=target_user_id)


@router.delete("/follows/users/{target_user_id}", response_model=GenericMessageResponse)
def unfollow_user(
    target_user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return SocialService(db).unfollow_user(user=current_user, target_user_id=target_user_id)


@router.post("/follows/sources/{source_slug}", response_model=GenericMessageResponse)
def follow_source(
    source_slug: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return SocialService(db).follow_source(user=current_user, source_slug=source_slug)


@router.delete("/follows/sources/{source_slug}", response_model=GenericMessageResponse)
def unfollow_source(
    source_slug: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return SocialService(db).unfollow_source(user=current_user, source_slug=source_slug)


@router.post("/bookmarks/notes/{note_id}", response_model=GenericMessageResponse)
def bookmark_note(
    note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return SocialService(db).bookmark_note(user=current_user, note_id=note_id)


@router.delete("/bookmarks/notes/{note_id}", response_model=GenericMessageResponse)
def unbookmark_note(
    note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return SocialService(db).unbookmark_note(user=current_user, note_id=note_id)


@router.post("/bookmarks/aggregates/{aggregate_id}", response_model=GenericMessageResponse)
def bookmark_aggregate(
    aggregate_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return SocialService(db).bookmark_aggregate(user=current_user, aggregate_id=aggregate_id)


@router.delete("/bookmarks/aggregates/{aggregate_id}", response_model=GenericMessageResponse)
def unbookmark_aggregate(
    aggregate_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return SocialService(db).unbookmark_aggregate(user=current_user, aggregate_id=aggregate_id)


@router.post("/likes/notes/{note_id}", response_model=GenericMessageResponse)
def like_note(
    note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return SocialService(db).like_note(user=current_user, note_id=note_id)


@router.delete("/likes/notes/{note_id}", response_model=GenericMessageResponse)
def unlike_note(
    note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return SocialService(db).unlike_note(user=current_user, note_id=note_id)


@router.post("/likes/aggregates/{aggregate_id}", response_model=GenericMessageResponse)
def like_aggregate(
    aggregate_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return SocialService(db).like_aggregate(user=current_user, aggregate_id=aggregate_id)


@router.delete("/likes/aggregates/{aggregate_id}", response_model=GenericMessageResponse)
def unlike_aggregate(
    aggregate_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return SocialService(db).unlike_aggregate(user=current_user, aggregate_id=aggregate_id)

