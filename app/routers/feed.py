from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Article
from app.schemas import ArticleOut

router = APIRouter(prefix='/feed', tags=['feed'])


@router.get('', response_model=list[ArticleOut])
def get_feed(
    db: Session = Depends(get_db),
    language: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    q = db.query(Article)
    if language:
        q = q.filter(Article.language == language)

    articles = q.order_by(Article.published_at.desc()).offset(offset).limit(limit).all()
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
        for a in articles
    ]
