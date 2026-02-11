from fastapi import FastAPI

from app.core.config import settings
from app.routers import auth, bookmarks, feed, notes, social

app = FastAPI(title=settings.app_name)


@app.get('/health')
def health():
    return {'status': 'ok'}


app.include_router(auth.router)
app.include_router(feed.router)
app.include_router(bookmarks.router)
app.include_router(notes.router)
app.include_router(social.router)
