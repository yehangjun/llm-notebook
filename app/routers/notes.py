from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Article, Note, NoteTag, Tag, User
from app.schemas import NoteCreate, NoteOut

router = APIRouter(prefix='/notes', tags=['notes'])


@router.post('', response_model=NoteOut)
def create_note(
    payload: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.article_id:
        article = db.get(Article, payload.article_id)
        if not article:
            raise HTTPException(status_code=404, detail='Article not found')

    note = Note(
        user_id=current_user.id,
        article_id=payload.article_id,
        title=payload.title,
        content=payload.content,
        is_public=payload.is_public,
    )
    db.add(note)
    db.flush()

    for raw in payload.tags:
        name = raw.strip().lower()
        if not name:
            continue
        tag = db.query(Tag).filter(Tag.user_id == current_user.id, Tag.name == name).first()
        if not tag:
            tag = Tag(user_id=current_user.id, name=name)
            db.add(tag)
            db.flush()
        db.add(NoteTag(note_id=note.id, tag_id=tag.id))

    db.commit()
    db.refresh(note)

    return NoteOut(
        id=note.id,
        article_id=note.article_id,
        title=note.title,
        content=note.content,
        is_public=note.is_public,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.get('/me', response_model=list[NoteOut])
def list_my_notes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notes = (
        db.query(Note)
        .filter(Note.user_id == current_user.id)
        .order_by(Note.updated_at.desc())
        .all()
    )
    return [
        NoteOut(
            id=n.id,
            article_id=n.article_id,
            title=n.title,
            content=n.content,
            is_public=n.is_public,
            created_at=n.created_at,
            updated_at=n.updated_at,
        )
        for n in notes
    ]


@router.patch('/{note_id}', response_model=NoteOut)
def update_note(
    note_id: UUID,
    payload: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = db.get(Note, note_id)
    if not note or note.user_id != current_user.id:
        raise HTTPException(status_code=404, detail='Note not found')

    note.title = payload.title
    note.content = payload.content
    note.is_public = payload.is_public
    note.article_id = payload.article_id
    note.updated_at = datetime.utcnow()

    db.query(NoteTag).filter(NoteTag.note_id == note.id).delete()
    for raw in payload.tags:
        name = raw.strip().lower()
        if not name:
            continue
        tag = db.query(Tag).filter(Tag.user_id == current_user.id, Tag.name == name).first()
        if not tag:
            tag = Tag(user_id=current_user.id, name=name)
            db.add(tag)
            db.flush()
        db.add(NoteTag(note_id=note.id, tag_id=tag.id))

    db.commit()
    db.refresh(note)

    return NoteOut(
        id=note.id,
        article_id=note.article_id,
        title=note.title,
        content=note.content,
        is_public=note.is_public,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )
