from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.auth import AuthResponse, SSOCompleteRequest
from app.services.sso_service import GoogleSSOService

router = APIRouter(prefix="/auth/sso", tags=["sso"])


@router.get("/google/start")
def google_sso_start(db: Session = Depends(get_db)):
    service = GoogleSSOService(db)
    return RedirectResponse(url=service.build_start_url(), status_code=302)


@router.get("/google/callback")
def google_sso_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: Session = Depends(get_db),
):
    service = GoogleSSOService(db)
    redirect_url = service.handle_callback(
        code=code,
        state=state,
        error=error,
        error_description=error_description,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return RedirectResponse(url=redirect_url, status_code=302)


@router.post("/google/complete", response_model=AuthResponse)
def google_sso_complete(payload: SSOCompleteRequest, request: Request, db: Session = Depends(get_db)):
    service = GoogleSSOService(db)
    return service.complete_signup(
        payload,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
