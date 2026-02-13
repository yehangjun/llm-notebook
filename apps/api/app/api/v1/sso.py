from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/auth/sso", tags=["sso"])

ALLOWED_PROVIDERS = {"gmail", "wechat"}


@router.get("/{provider}/start")
def sso_start(provider: str):
    if provider not in ALLOWED_PROVIDERS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="provider not found")
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="SSO provider reserved for future")


@router.get("/{provider}/callback")
def sso_callback(provider: str):
    if provider not in ALLOWED_PROVIDERS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="provider not found")
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="SSO provider reserved for future")
