from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import GenericMessageResponse
from app.schemas.note import (
    CreateNoteRequest,
    CreateNoteResponse,
    NoteDetail,
    NoteListResponse,
    PublicNoteDetail,
    UpdateNoteRequest,
)
from app.services.note_service import NoteService

router = APIRouter(prefix="/notes", tags=["notes"])


@router.post("", response_model=CreateNoteResponse)
def create_note(
    payload: CreateNoteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = NoteService(db)
    return service.create_note(user=current_user, payload=payload)


@router.get("", response_model=NoteListResponse)
def list_notes(
    status: str | None = Query(default=None),
    visibility: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = NoteService(db)
    return service.list_notes(
        user=current_user,
        status_filter=status,
        visibility_filter=visibility,
        keyword=keyword,
        offset=offset,
        limit=limit,
    )


@router.get("/public/{note_id}", response_model=PublicNoteDetail)
def get_public_note(note_id: UUID, db: Session = Depends(get_db)):
    service = NoteService(db)
    return service.get_public_note_detail(note_id=note_id)


@router.get("/{note_id}", response_model=NoteDetail)
def get_note(
    note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = NoteService(db)
    return service.get_note_detail(user=current_user, note_id=note_id)


@router.patch("/{note_id}", response_model=NoteDetail)
def update_note(
    note_id: UUID,
    payload: UpdateNoteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = NoteService(db)
    return service.update_note(user=current_user, note_id=note_id, payload=payload)


@router.post("/{note_id}/reanalyze", response_model=NoteDetail)
def reanalyze_note(
    note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = NoteService(db)
    return service.reanalyze(user=current_user, note_id=note_id)


@router.delete("/{note_id}", response_model=GenericMessageResponse)
def delete_note(
    note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = NoteService(db)
    return service.delete_note(user=current_user, note_id=note_id)
