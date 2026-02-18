from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import GenericMessageResponse
from app.schemas.note import AdminNoteListResponse
from app.schemas.source_creator import (
    AdminCreateSourceCreatorRequest,
    AdminSourceCreatorItem,
    AdminSourceCreatorListResponse,
    AdminUpdateSourceCreatorRequest,
    AggregateRefreshJobAccepted,
    AggregateRefreshJobStatus,
)
from app.schemas.user import AdminUpdateUserRequest, AdminUserItem, AdminUserListResponse
from app.services.aggregation_service import run_aggregation_refresh_job
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


@router.get("/sources", response_model=AdminSourceCreatorListResponse)
def list_sources(
    keyword: str | None = Query(default=None),
    deleted: str | None = Query(default="all"),
    active: str | None = Query(default="all"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    _: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    sources = service.list_sources(
        keyword=keyword,
        deleted_filter=deleted,
        active_filter=active,
        offset=offset,
        limit=limit,
    )
    return AdminSourceCreatorListResponse(sources=[AdminSourceCreatorItem.model_validate(source) for source in sources])


@router.post("/sources", response_model=AdminSourceCreatorItem)
def create_source(
    payload: AdminCreateSourceCreatorRequest,
    _: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    source = service.create_source(payload=payload)
    return AdminSourceCreatorItem.model_validate(source)


@router.patch("/sources/{source_id}", response_model=AdminSourceCreatorItem)
def update_source(
    source_id: UUID,
    payload: AdminUpdateSourceCreatorRequest,
    _: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    source = service.update_source(source_id=source_id, payload=payload)
    return AdminSourceCreatorItem.model_validate(source)


@router.delete("/sources/{source_id}", response_model=GenericMessageResponse)
def delete_source(
    source_id: UUID,
    _: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    return service.delete_source(source_id=source_id)


@router.post("/sources/{source_id}/restore", response_model=GenericMessageResponse)
def restore_source(
    source_id: UUID,
    _: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    return service.restore_source(source_id=source_id)


@router.post("/aggregates/refresh", response_model=AggregateRefreshJobAccepted, status_code=202)
def refresh_aggregates(
    background_tasks: BackgroundTasks,
    source_id: UUID | None = Query(default=None),
    _: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    job = service.enqueue_aggregate_refresh(source_id=source_id)
    background_tasks.add_task(
        run_aggregation_refresh_job,
        job_id=job["job_id"],
        source_id=job["source_id"],
    )
    return AggregateRefreshJobAccepted(
        job_id=job["job_id"],
        status="queued",
        scope="source" if job["source_id"] else "all",
        source_id=job["source_id"],
        source_slug=job["source_slug"],
        message="聚合刷新任务已入队",
    )


@router.get("/aggregates/refresh/{job_id}", response_model=AggregateRefreshJobStatus)
def get_aggregate_refresh_job(
    job_id: str,
    _: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    service = AdminService(db)
    payload = service.get_aggregate_refresh_job(job_id=job_id)
    if not payload:
        return AggregateRefreshJobStatus(job_id=job_id, status="not_found")
    return AggregateRefreshJobStatus.model_validate(payload)
