from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from redis import Redis
from sqlalchemy.orm import Session

from app.core.config import ALLOWED_UI_LANGUAGES, settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    create_reset_token,
    get_password_hash,
    hash_token,
    verify_password,
)
from app.infra.email_sender import EmailSender
from app.infra.redis_client import get_redis
from app.repositories.reset_token_repo import ResetTokenRepository
from app.repositories.session_repo import SessionRepository
from app.repositories.user_repo import UserRepository
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    GenericMessageResponse,
    LoginRequest,
    LogoutRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenPayload,
)
from app.schemas.user import UserPublic


GENERIC_LOGIN_ERROR = "账号或密码错误"
GENERIC_FORGOT_RESPONSE = "如果邮箱存在，我们已发送重置邮件"


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.user_repo = UserRepository(db)
        self.session_repo = SessionRepository(db)
        self.reset_repo = ResetTokenRepository(db)
        self.redis: Redis = get_redis()
        self.mailer = EmailSender()

    def register(self, payload: RegisterRequest, *, ip: str | None, user_agent: str | None) -> AuthResponse:
        self._enforce_register_limit(ip)

        user_id = payload.user_id.strip()
        email = payload.email.lower().strip()

        if payload.password != payload.password_confirm:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="两次密码输入不一致")

        if payload.ui_language not in ALLOWED_UI_LANGUAGES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的界面语言")

        if self.user_repo.get_by_user_id(user_id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ID 已存在")
        if self.user_repo.get_by_email(email):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="邮箱已存在")

        user = self.user_repo.create(
            user_id=user_id,
            email=email,
            password_hash=get_password_hash(payload.password),
            nickname=payload.nickname.strip() if payload.nickname else None,
            ui_language=payload.ui_language,
        )
        token_payload = self._issue_tokens(user.id, user.user_id, ip=ip, user_agent=user_agent)
        self.db.commit()
        self.db.refresh(user)

        return AuthResponse(user=UserPublic.model_validate(user), token=token_payload)

    def login(self, payload: LoginRequest, *, ip: str | None, user_agent: str | None) -> AuthResponse:
        principal = payload.principal.strip()
        principal_lookup = principal.lower() if "@" in principal else principal
        self._ensure_login_not_locked(principal_lookup, ip)

        user = self.user_repo.get_by_principal(principal_lookup)
        if not user or not verify_password(payload.password, user.password_hash):
            self._record_login_failure(principal_lookup, ip)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

        self._clear_login_failure(principal_lookup, ip)

        token_payload = self._issue_tokens(user.id, user.user_id, ip=ip, user_agent=user_agent)
        self.db.commit()

        return AuthResponse(user=UserPublic.model_validate(user), token=token_payload)

    def logout(self, payload: LogoutRequest) -> GenericMessageResponse:
        refresh_hash = hash_token(payload.refresh_token)
        session = self.session_repo.get_active_by_refresh_hash(refresh_hash)
        if session:
            self.session_repo.revoke(session)
            self.db.commit()
        return GenericMessageResponse(message="已退出登录")

    def forgot_password(self, payload: ForgotPasswordRequest) -> GenericMessageResponse:
        email = payload.email.lower().strip()
        cooldown_key = f"auth:pwd_reset:cooldown:{email}"

        allowed = self.redis.set(cooldown_key, "1", nx=True, ex=settings.forgot_password_cooldown_seconds)
        if not allowed:
            return GenericMessageResponse(message=GENERIC_FORGOT_RESPONSE)

        user = self.user_repo.get_by_email(email)
        if not user:
            return GenericMessageResponse(message=GENERIC_FORGOT_RESPONSE)

        raw_token = create_reset_token()
        token_hash = hash_token(raw_token)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.reset_token_expire_minutes)

        self.reset_repo.create(user_id=user.id, token_hash=token_hash, expires_at=expires_at)
        self.db.commit()

        self.mailer.send_password_reset(user.email, raw_token)
        return GenericMessageResponse(message=GENERIC_FORGOT_RESPONSE)

    def reset_password(self, payload: ResetPasswordRequest) -> GenericMessageResponse:
        if payload.new_password != payload.new_password_confirm:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="两次密码输入不一致")

        token_hash = hash_token(payload.token)
        reset_token = self.reset_repo.get_valid_token(token_hash)
        if not reset_token:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效或已过期的重置链接")

        user = self.user_repo.get_by_id(reset_token.user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

        user.password_hash = get_password_hash(payload.new_password)
        self.reset_repo.mark_used(reset_token)
        self.session_repo.revoke_all_for_user(user.id)
        self.db.add(user)
        self.db.commit()

        return GenericMessageResponse(message="密码重置成功")

    def _issue_tokens(self, user_pk, user_id: str, *, ip: str | None, user_agent: str | None) -> TokenPayload:
        access_token, expires_in = create_access_token(subject=str(user_pk), user_id=user_id)
        refresh_token = create_refresh_token()
        refresh_token_hash = hash_token(refresh_token)
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)

        self.session_repo.create(
            user_id=user_pk,
            refresh_token_hash=refresh_token_hash,
            expires_at=expires_at,
            ip=ip,
            user_agent=user_agent,
        )
        return TokenPayload(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
        )

    def _risk_key(self, principal: str, ip: str | None) -> str:
        risk_ip = ip or "unknown"
        return f"{principal.lower()}:{risk_ip}"

    def _ensure_login_not_locked(self, principal: str, ip: str | None) -> None:
        lock_key = f"auth:login:lock:{self._risk_key(principal, ip)}"
        if self.redis.exists(lock_key):
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="登录失败次数过多，请稍后再试")

    def _record_login_failure(self, principal: str, ip: str | None) -> None:
        risk = self._risk_key(principal, ip)
        fail_key = f"auth:login:fail:{risk}"
        lock_key = f"auth:login:lock:{risk}"

        failures = self.redis.incr(fail_key)
        if failures == 1:
            self.redis.expire(fail_key, settings.login_fail_ttl_seconds)

        if failures >= settings.login_fail_threshold:
            self.redis.set(lock_key, "1", ex=settings.login_lock_ttl_seconds)

    def _clear_login_failure(self, principal: str, ip: str | None) -> None:
        risk = self._risk_key(principal, ip)
        self.redis.delete(f"auth:login:fail:{risk}")
        self.redis.delete(f"auth:login:lock:{risk}")

    def _enforce_register_limit(self, ip: str | None) -> None:
        register_ip = ip or "unknown"
        key = f"auth:register:ip:{register_ip}"
        count = self.redis.incr(key)
        if count == 1:
            self.redis.expire(key, 3600)

        if count > settings.register_limit_per_hour:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="注册过于频繁，请稍后再试")
