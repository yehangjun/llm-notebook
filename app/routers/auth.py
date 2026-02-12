from datetime import datetime, timedelta
import hashlib
import hmac
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import AuthIdentity, EmailOtp, User
from app.schemas import (
    MockSsoLoginRequest,
    SendEmailCodeRequest,
    SendEmailCodeResponse,
    TokenResponse,
    UserOut,
    VerifyEmailCodeRequest,
)
from app.services.security import create_access_token
from app.services.sso import SsoPrincipal, SsoProviderError, get_sso_registry

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

    debug_code = otp_code if settings.app_env != 'prod' else None
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
        display_name = (payload.display_name or '').strip()
        if not display_name:
            display_name = f'user_{secrets.randbelow(10000):04d}'
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


@router.post('/sso/mock-login', response_model=TokenResponse)
def mock_sso_login(payload: MockSsoLoginRequest, db: Session = Depends(get_db)):
    if not settings.mock_sso_enabled:
        raise HTTPException(status_code=403, detail='Mock SSO disabled')

    provider_name = payload.provider.strip().lower()
    provider = sso_registry.get(provider_name)
    if provider is None:
        raise HTTPException(status_code=400, detail='Unsupported provider')

    normalized_email = None
    if payload.email:
        normalized_email = _normalize_email(payload.email)
        if not _is_valid_email(normalized_email):
            raise HTTPException(status_code=400, detail='Invalid email format')

    requested_display_name = (payload.display_name or '').strip() or None
    try:
        principal = provider.authenticate(
            provider_user_id=payload.provider_user_id,
            email=normalized_email,
            display_name=requested_display_name,
        )
    except SsoProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if principal.email:
        principal_email = _normalize_email(principal.email)
        if not _is_valid_email(principal_email):
            raise HTTPException(status_code=400, detail='Provider returned invalid email')
        principal = SsoPrincipal(
            provider=principal.provider,
            provider_user_id=principal.provider_user_id,
            email=principal_email,
            display_name=principal.display_name,
        )

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
        return TokenResponse(access_token=create_access_token(user.id))

    user = None
    if principal.email:
        user = db.query(User).filter(User.email == principal.email).first()

    if not user:
        display_name = principal.display_name or ''
        if not display_name:
            display_name = f'{principal.provider}_{principal.provider_user_id[-6:]}'
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

        display_name = principal.display_name or ''
        if display_name:
            user.display_name = display_name

    identity = AuthIdentity(
        user_id=user.id,
        provider=principal.provider,
        provider_user_id=principal.provider_user_id,
        email=principal.email,
        display_name=principal.display_name,
    )
    db.add(identity)
    db.commit()
    db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id))


@router.get('/me', response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        phone=current_user.phone,
        display_name=current_user.display_name,
    )
