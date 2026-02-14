from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import GenericMessageResponse
from app.schemas.feed import RefreshAggregatesResponse
from app.schemas.note import AdminNoteListResponse
from app.schemas.user import AdminUpdateUserRequest, AdminUserItem, AdminUserListResponse
from app.services.admin_service import AdminService

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=AdminUserListResponse)
def list_users(
    keyword: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    _: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    users = service.list_users(keyword=keyword, offset=offset, limit=limit)
    return AdminUserListResponse(users=[AdminUserItem.model_validate(user) for user in users])


@router.patch("/users/{target_user_id}", response_model=AdminUserItem)
def update_user(
    target_user_id: str,
    payload: AdminUpdateUserRequest,
    current_admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    user = service.update_user(target_user_id=target_user_id, payload=payload, current_admin=current_admin)
    return AdminUserItem.model_validate(user)


@router.delete("/users/{target_user_id}", response_model=GenericMessageResponse)
def delete_user(
    target_user_id: str,
    current_admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    return service.delete_user(target_user_id=target_user_id, current_admin=current_admin)


@router.get("/notes", response_model=AdminNoteListResponse)
def list_notes(
    status: str | None = Query(default=None),
    visibility: str | None = Query(default=None),
    deleted: str | None = Query(default="all"),
    owner_user_id: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    _: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    notes = service.list_notes(
        status_filter=status,
        visibility_filter=visibility,
        deleted_filter=deleted,
        owner_user_id=owner_user_id,
        keyword=keyword,
        offset=offset,
        limit=limit,
    )
    return AdminNoteListResponse(notes=notes)


@router.delete("/notes/{note_id}", response_model=GenericMessageResponse)
def delete_note(
    note_id: UUID,
    _: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    return service.delete_note(note_id=note_id)


@router.post("/notes/{note_id}/restore", response_model=GenericMessageResponse)
def restore_note(
    note_id: UUID,
    _: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    return service.restore_note(note_id=note_id)


@router.post("/aggregates/refresh", response_model=RefreshAggregatesResponse)
def refresh_aggregates(
    _: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    return service.refresh_aggregates()
