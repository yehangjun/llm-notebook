from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Follow, Note, User
from app.schemas import NoteOut

router = APIRouter(prefix='/social', tags=['social'])


@router.post('/follow/{user_id}', status_code=status.HTTP_204_NO_CONTENT)
def follow_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail='Cannot follow yourself')

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail='User not found')

    existing = db.query(Follow).filter(
        Follow.follower_id == current_user.id,
        Follow.following_id == user_id,
    ).first()
    if existing:
        return None

    db.add(Follow(follower_id=current_user.id, following_id=user_id))
    db.commit()
    return None


@router.get('/public-notes/{user_id}', response_model=list[NoteOut])
def public_notes(user_id: UUID, db: Session = Depends(get_db)):
    notes = (
        db.query(Note)
        .filter(Note.user_id == user_id, Note.is_public.is_(True))
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
