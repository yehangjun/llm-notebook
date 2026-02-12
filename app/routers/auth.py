from datetime import datetime, timedelta
import hashlib
import hmac
import re
import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
import redis
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import AuthIdentity, EmailOtp, PasswordResetToken, User
from app.schemas import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SendEmailCodeRequest,
    SendEmailCodeResponse,
    TokenResponse,
    UpdateProfileRequest,
    UserOut,
    VerifyEmailCodeRequest,
)
from app.services.email import (
    EmailDeliveryError,
    send_login_code_email,
    send_password_reset_email,
    smtp_is_configured,
)
from app.services.security import create_access_token, hash_password, verify_password
from app.services.sso import SsoPrincipal, SsoProviderError, get_sso_registry
from app.services.sso_state import (
    SsoStateError,
    create_sso_state,
    parse_sso_state,
    validate_redirect_url,
)

router = APIRouter(prefix='/auth', tags=['auth'])

EMAIL_PATTERN = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
PUBLIC_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_]{3,50}$')
sso_registry = get_sso_registry()
redis_client = redis.Redis.from_url(settings.redis_url, decode_responses=True)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _is_valid_email(email: str) -> bool:
    return bool(EMAIL_PATTERN.match(email))


def _generate_otp_code() -> str:
    return f'{secrets.randbelow(1_000_000):06d}'


def _hash_otp(email: str, code: str) -> str:
    message = f'{email}:{code}'.encode('utf-8')
    return hmac.new(settings.secret_key.encode('utf-8'), message, hashlib.sha256).hexdigest()


def _email_exists(db: Session, email: str) -> bool:
    return db.query(User.id).filter(User.email == email).first() is not None


def _normalize_public_id(value: str) -> str:
    return value.strip().lower()


def _is_valid_public_id(value: str) -> bool:
    return bool(PUBLIC_ID_PATTERN.match(value))


def _normalize_ui_language(value: str | None) -> str:
    return (value or 'zh').strip().lower() or 'zh'


def _is_valid_ui_language(value: str) -> bool:
    return value in {'en', 'zh'}


def _generate_unique_public_id(db: Session, prefix: str = 'user') -> str:
    base = re.sub(r'[^a-zA-Z0-9_]', '_', prefix.strip().lower()) or 'user'
    base = base[:30]
    for _ in range(20):
        candidate = f'{base}_{secrets.randbelow(1_000_000):06d}'
        if not db.query(User.id).filter(User.public_id == candidate).first():
            return candidate
    return f'user_{secrets.randbelow(10**10):010d}'


def _login_fail_count_key(identifier: str) -> str:
    return f'auth:login_fail_count:{identifier}'


def _login_lock_key(identifier: str) -> str:
    return f'auth:login_lock:{identifier}'


def _check_login_lock(identifier: str) -> None:
    lock_ttl = redis_client.ttl(_login_lock_key(identifier))
    if lock_ttl and lock_ttl > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f'Too many failed attempts, try again in {lock_ttl} seconds',
        )


def _record_login_failure(identifier: str) -> None:
    key = _login_fail_count_key(identifier)
    failures = redis_client.incr(key)
    if failures == 1:
        redis_client.expire(key, settings.login_failure_window_minutes * 60)

    if failures >= settings.login_max_failures:
        redis_client.setex(_login_lock_key(identifier), settings.login_lock_minutes * 60, '1')
        redis_client.delete(key)


def _clear_login_failures(identifier: str) -> None:
    redis_client.delete(_login_fail_count_key(identifier))
    redis_client.delete(_login_lock_key(identifier))


def _hash_reset_token(token: str) -> str:
    return hmac.new(settings.secret_key.encode('utf-8'), token.encode('utf-8'), hashlib.sha256).hexdigest()


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
            public_id=_generate_unique_public_id(db, principal.provider),
            password_hash=None,
            ui_language='zh',
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
    purpose = payload.purpose
    if not _is_valid_email(email):
        raise HTTPException(status_code=400, detail='Invalid email format')
    if purpose == 'register' and _email_exists(db, email):
        raise HTTPException(status_code=400, detail='Email already registered')
    if purpose == 'login' and not _email_exists(db, email):
        raise HTTPException(status_code=400, detail='Email not registered')

    otp_code = _generate_otp_code()
    expires_at = datetime.utcnow() + timedelta(minutes=settings.email_otp_expire_minutes)

    otp = EmailOtp(
        email=email,
        code_hash=_hash_otp(email, otp_code),
        purpose=purpose,
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
    purpose = payload.purpose

    if not _is_valid_email(email):
        raise HTTPException(status_code=400, detail='Invalid email format')

    otp = (
        db.query(EmailOtp)
        .filter(EmailOtp.email == email, EmailOtp.purpose == purpose)
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

    user = db.query(User).filter(User.email == email).first()
    if purpose == 'register' and user:
        raise HTTPException(status_code=400, detail='Email already registered')
    if purpose == 'login' and not user:
        raise HTTPException(status_code=400, detail='Email not registered')

    otp.used_at = now

    if not user:
        display_name = (payload.display_name or '').strip() or f'user_{secrets.randbelow(10000):04d}'
        user = User(
            email=email,
            phone=None,
            public_id=_generate_unique_public_id(db),
            password_hash=None,
            ui_language='zh',
            email_verified=True,
            display_name=display_name,
        )
        db.add(user)
    else:
        user.email_verified = True
        display_name = (payload.display_name or '').strip()
        if display_name and purpose == 'register':
            user.display_name = display_name

    db.commit()
    db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id))


@router.get('/sso/providers')
def sso_providers():
    return {'providers': sso_registry.names()}


@router.post('/register', response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    public_id = _normalize_public_id(payload.public_id)
    ui_language = _normalize_ui_language(payload.ui_language)
    display_name = (payload.display_name or '').strip()

    if not _is_valid_email(email):
        raise HTTPException(status_code=400, detail='Invalid email format')
    if not _is_valid_public_id(public_id):
        raise HTTPException(
            status_code=400,
            detail='Invalid ID format: use 3-50 chars of letters, numbers, underscore',
        )
    if not _is_valid_ui_language(ui_language):
        raise HTTPException(status_code=400, detail='Unsupported UI language')
    if db.query(User.id).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail='Email already registered')
    if db.query(User.id).filter(User.public_id == public_id).first():
        raise HTTPException(status_code=400, detail='ID already taken')

    user = User(
        email=email,
        phone=None,
        public_id=public_id,
        password_hash=hash_password(payload.password),
        ui_language=ui_language,
        email_verified=False,
        display_name=display_name or public_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(user.id))


@router.post('/login', response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    identifier = payload.identifier.strip()
    if not identifier:
        raise HTTPException(status_code=400, detail='Identifier is required')

    normalized_identifier = _normalize_email(identifier) if '@' in identifier else _normalize_public_id(identifier)
    _check_login_lock(normalized_identifier)

    if '@' in normalized_identifier:
        user = db.query(User).filter(User.email == normalized_identifier).first()
    else:
        user = db.query(User).filter(User.public_id == normalized_identifier).first()

    if not user or not user.password_hash:
        _record_login_failure(normalized_identifier)
        raise HTTPException(status_code=400, detail='Invalid credentials')
    if not verify_password(payload.password, user.password_hash):
        _record_login_failure(normalized_identifier)
        raise HTTPException(status_code=400, detail='Invalid credentials')

    _clear_login_failures(normalized_identifier)
    return TokenResponse(access_token=create_access_token(user.id))


@router.post('/password/forgot', response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    if not _is_valid_email(email):
        return ForgotPasswordResponse(sent=True)

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return ForgotPasswordResponse(sent=True)

    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_reset_token(raw_token)
    expires_at = datetime.utcnow() + timedelta(minutes=settings.password_reset_expire_minutes)
    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(reset_token)
    db.commit()

    base = settings.password_reset_url_base.rstrip('/')
    reset_url = f'{base}/?view=reset&token={raw_token}'

    if smtp_is_configured():
        try:
            send_password_reset_email(email, reset_url)
        except EmailDeliveryError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ForgotPasswordResponse(sent=True)


@router.post('/password/reset')
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    token_hash = _hash_reset_token(payload.token.strip())
    token = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hash).first()
    if not token:
        raise HTTPException(status_code=400, detail='Invalid reset token')
    if token.used_at is not None:
        raise HTTPException(status_code=400, detail='Reset token already used')
    if datetime.utcnow() > token.expires_at:
        raise HTTPException(status_code=400, detail='Reset token expired')

    user = db.get(User, token.user_id)
    if not user:
        raise HTTPException(status_code=400, detail='User not found')

    user.password_hash = hash_password(payload.new_password)
    token.used_at = datetime.utcnow()
    db.commit()
    return {'reset': True}


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
        public_id=current_user.public_id,
        email=current_user.email,
        phone=current_user.phone,
        display_name=current_user.display_name,
        ui_language=current_user.ui_language,
    )


@router.patch('/me/profile', response_model=UserOut)
def update_profile(payload: UpdateProfileRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    changed = False

    if payload.display_name is not None:
        display_name = payload.display_name.strip()
        current_user.display_name = display_name or current_user.public_id
        changed = True

    if payload.password is not None:
        current_user.password_hash = hash_password(payload.password)
        changed = True

    if payload.ui_language is not None:
        ui_language = _normalize_ui_language(payload.ui_language)
        if not _is_valid_ui_language(ui_language):
            raise HTTPException(status_code=400, detail='Unsupported UI language')
        current_user.ui_language = ui_language
        changed = True

    if not changed:
        raise HTTPException(status_code=400, detail='No changes provided')

    db.commit()
    db.refresh(current_user)

    return UserOut(
        id=current_user.id,
        public_id=current_user.public_id,
        email=current_user.email,
        phone=current_user.phone,
        display_name=current_user.display_name,
        ui_language=current_user.ui_language,
    )
