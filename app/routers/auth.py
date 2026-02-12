from datetime import datetime, timedelta
import hashlib
import hmac
import re
import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import AuthIdentity, EmailOtp, User
from app.schemas import (
    SendEmailCodeRequest,
    SendEmailCodeResponse,
    TokenResponse,
    UserOut,
    VerifyEmailCodeRequest,
)
from app.services.email import EmailDeliveryError, send_login_code_email, smtp_is_configured
from app.services.security import create_access_token
from app.services.sso import SsoPrincipal, SsoProviderError, get_sso_registry
from app.services.sso_state import (
    SsoStateError,
    create_sso_state,
    parse_sso_state,
    validate_redirect_url,
)

router = APIRouter(prefix='/auth', tags=['auth'])

EMAIL_PATTERN = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
sso_registry = get_sso_registry()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _is_valid_email(email: str) -> bool:
    return bool(EMAIL_PATTERN.match(email))


def _generate_otp_code() -> str:
    return f'{secrets.randbelow(1_000_000):06d}'


def _hash_otp(email: str, code: str) -> str:
    message = f'{email}:{code}'.encode('utf-8')
    return hmac.new(settings.secret_key.encode('utf-8'), message, hashlib.sha256).hexdigest()


def _normalize_principal_email(principal: SsoPrincipal) -> SsoPrincipal:
    if not principal.email:
        return principal

    normalized = _normalize_email(principal.email)
    if not _is_valid_email(normalized):
        raise HTTPException(status_code=400, detail='Provider returned invalid email')

    return SsoPrincipal(
        provider=principal.provider,
        provider_user_id=principal.provider_user_id,
        email=normalized,
        display_name=principal.display_name,
    )


def _get_or_create_user_by_sso(principal: SsoPrincipal, db: Session) -> User:
    identity = (
        db.query(AuthIdentity)
        .filter(
            AuthIdentity.provider == principal.provider,
            AuthIdentity.provider_user_id == principal.provider_user_id,
        )
        .first()
    )
    if identity:
        user = db.get(User, identity.user_id)
        if not user:
            raise HTTPException(status_code=500, detail='Identity user missing')
        return user

    user = None
    if principal.email:
        user = db.query(User).filter(User.email == principal.email).first()

    if not user:
        display_name = principal.display_name or f'{principal.provider}_{principal.provider_user_id[-6:]}'
        user = User(
            email=principal.email,
            phone=None,
            email_verified=bool(principal.email),
            display_name=display_name,
        )
        db.add(user)
        db.flush()
    else:
        if principal.email and not user.email:
            user.email = principal.email
        if principal.email and user.email == principal.email:
            user.email_verified = True
        if principal.display_name:
            user.display_name = principal.display_name

    db.add(
        AuthIdentity(
            user_id=user.id,
            provider=principal.provider,
            provider_user_id=principal.provider_user_id,
            email=principal.email,
            display_name=principal.display_name,
        )
    )
    return user


@router.post('/email/send-code', response_model=SendEmailCodeResponse)
def send_email_code(payload: SendEmailCodeRequest, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    if not _is_valid_email(email):
        raise HTTPException(status_code=400, detail='Invalid email format')

    otp_code = _generate_otp_code()
    expires_at = datetime.utcnow() + timedelta(minutes=settings.email_otp_expire_minutes)

    otp = EmailOtp(
        email=email,
        code_hash=_hash_otp(email, otp_code),
        purpose='login',
        expires_at=expires_at,
    )
    db.add(otp)
    db.commit()

    if smtp_is_configured():
        try:
            send_login_code_email(email, otp_code)
        except EmailDeliveryError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
    elif not settings.email_debug_code_enabled:
        raise HTTPException(status_code=500, detail='SMTP is not configured')

    debug_code = otp_code if settings.email_debug_code_enabled else None
    return SendEmailCodeResponse(
        sent=True,
        expires_in_seconds=settings.email_otp_expire_minutes * 60,
        debug_code=debug_code,
    )


@router.post('/email/verify-code', response_model=TokenResponse)
def verify_email_code(payload: VerifyEmailCodeRequest, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    code = payload.code.strip()

    if not _is_valid_email(email):
        raise HTTPException(status_code=400, detail='Invalid email format')

    otp = (
        db.query(EmailOtp)
        .filter(EmailOtp.email == email, EmailOtp.purpose == 'login')
        .order_by(EmailOtp.created_at.desc())
        .first()
    )
    if not otp:
        raise HTTPException(status_code=400, detail='Please request a code first')

    now = datetime.utcnow()
    if otp.used_at is not None:
        raise HTTPException(status_code=400, detail='Code already used')
    if now > otp.expires_at:
        raise HTTPException(status_code=400, detail='Code expired')
    if otp.attempts >= settings.email_otp_max_attempts:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail='Too many attempts')

    expected_hash = _hash_otp(email, code)
    if not hmac.compare_digest(expected_hash, otp.code_hash):
        otp.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail='Invalid code')

    otp.used_at = now

    user = db.query(User).filter(User.email == email).first()
    if not user:
        display_name = (payload.display_name or '').strip() or f'user_{secrets.randbelow(10000):04d}'
        user = User(
            email=email,
            phone=None,
            email_verified=True,
            display_name=display_name,
        )
        db.add(user)
    else:
        user.email_verified = True
        display_name = (payload.display_name or '').strip()
        if display_name:
            user.display_name = display_name

    db.commit()
    db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id))


@router.get('/sso/providers')
def sso_providers():
    return {'providers': sso_registry.names()}


@router.get('/sso/{provider}/start')
def sso_start(provider: str, redirect: str | None = Query(default=None)):
    provider_name = provider.strip().lower()
    sso_provider = sso_registry.get(provider_name)
    if sso_provider is None:
        raise HTTPException(status_code=400, detail='Unsupported provider')

    redirect_url = redirect or settings.sso_success_redirect_url
    try:
        redirect_url = validate_redirect_url(redirect_url)
    except SsoStateError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    state_token = create_sso_state(provider=provider_name, success_redirect_url=redirect_url)

    try:
        auth_url = sso_provider.build_authorize_url(state=state_token)
    except SsoProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        'provider': provider_name,
        'auth_url': auth_url,
    }


@router.get('/sso/{provider}/callback')
def sso_callback(
    provider: str,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    if error:
        detail = error_description or error
        raise HTTPException(status_code=400, detail=f'SSO authorize failed: {detail}')

    if not code or not state:
        raise HTTPException(status_code=400, detail='Missing code/state')

    provider_name = provider.strip().lower()
    sso_provider = sso_registry.get(provider_name)
    if sso_provider is None:
        raise HTTPException(status_code=400, detail='Unsupported provider')

    try:
        parsed_state = parse_sso_state(state)
    except SsoStateError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if parsed_state['provider'] != provider_name:
        raise HTTPException(status_code=400, detail='State provider mismatch')

    try:
        principal = sso_provider.exchange_code(code)
    except SsoProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    principal = _normalize_principal_email(principal)
    user = _get_or_create_user_by_sso(principal=principal, db=db)

    db.commit()
    db.refresh(user)

    access_token = create_access_token(user.id)
    fragment = urlencode({'access_token': access_token, 'token_type': 'bearer'})
    return RedirectResponse(url=f"{parsed_state['redirect']}#{fragment}")


@router.get('/me', response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        phone=current_user.phone,
        display_name=current_user.display_name,
    )
