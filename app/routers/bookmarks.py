from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Article, Bookmark, User
from app.schemas import ArticleOut

router = APIRouter(prefix='/bookmarks', tags=['bookmarks'])


@router.post('/{article_id}', status_code=status.HTTP_204_NO_CONTENT)
def add_bookmark(
    article_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    article = db.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail='Article not found')

    existing = db.query(Bookmark).filter(
        Bookmark.user_id == current_user.id,
        Bookmark.article_id == article_id,
    ).first()
    if existing:
        return None

    db.add(Bookmark(user_id=current_user.id, article_id=article_id))
    db.commit()
    return None


@router.get('', response_model=list[ArticleOut])
def list_bookmarks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(Article)
        .join(Bookmark, Bookmark.article_id == Article.id)
        .filter(Bookmark.user_id == current_user.id)
        .order_by(Bookmark.created_at.desc())
        .all()
    )
    return [
        ArticleOut(
            id=a.id,
            source_id=a.source_id,
            title=a.title,
            summary=a.summary,
            url=a.url,
            language=a.language,
            published_at=a.published_at,
        )
        for a in rows
    ]
