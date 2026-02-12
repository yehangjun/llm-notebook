from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.routers import auth, bookmarks, feed, notes, social

app = FastAPI(title=settings.app_name)
static_dir = Path(__file__).parent / 'static'


@app.get('/health')
def health():
    return {'status': 'ok'}


@app.get('/', include_in_schema=False)
def index():
    return FileResponse(static_dir / 'index.html')


app.mount('/static', StaticFiles(directory=static_dir), name='static')

app.include_router(auth.router)
app.include_router(feed.router)
app.include_router(bookmarks.router)
app.include_router(notes.router)
app.include_router(social.router)
