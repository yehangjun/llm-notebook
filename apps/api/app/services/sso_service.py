from __future__ import annotations

import base64
import hashlib
import json
import secrets
from datetime import datetime, timezone
import urllib.error
import urllib.parse
import urllib.request

from fastapi import HTTPException, status
from redis import Redis
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import ALLOWED_UI_LANGUAGES, settings
from app.core.security import get_password_hash
from app.infra.network import urlopen_with_optional_proxy
from app.infra.redis_client import get_redis
from app.repositories.user_identity_repo import UserIdentityRepository
from app.repositories.user_repo import UserRepository
from app.schemas.auth import AuthResponse, SSOCompleteRequest
from app.schemas.user import UserPublic
from app.services.auth_service import AuthService

GOOGLE_PROVIDER = "google"
GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_ALLOWED_ISSUERS = {"https://accounts.google.com", "accounts.google.com"}


class _GoogleAuthError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class GoogleSSOService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.redis: Redis = get_redis()
        self.user_repo = UserRepository(db)
        self.identity_repo = UserIdentityRepository(db)
        self.auth_service = AuthService(db)

    def build_start_url(self) -> str:
        try:
            client_id, _, redirect_uri = self._google_config()
        except _GoogleAuthError as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=exc.message) from exc

        state = secrets.token_urlsafe(24)
        nonce = secrets.token_urlsafe(24)
        code_verifier = secrets.token_urlsafe(64)
        code_challenge = self._pkce_s256_challenge(code_verifier)

        state_key = self._state_key(state)
        self.redis.hset(
            state_key,
            mapping={
                "nonce": nonce,
                "code_verifier": code_verifier,
            },
        )
        self.redis.expire(state_key, max(60, settings.google_oauth_state_ttl_seconds))

        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": settings.google_oauth_scope,
            "state": state,
            "nonce": nonce,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        return f"{GOOGLE_AUTH_ENDPOINT}?{urllib.parse.urlencode(params)}"

    def handle_callback(
        self,
        *,
        code: str | None,
        state: str | None,
        error: str | None,
        error_description: str | None,
        ip: str | None,
        user_agent: str | None,
    ) -> str:
        try:
            self._google_config()
        except _GoogleAuthError as exc:
            return self._auth_error_redirect(exc.message)

        if error:
            message = error_description or "Google 授权失败，请重试"
            if error == "access_denied":
                message = "你已取消 Google 授权，请重试"
            return self._auth_error_redirect(message)

        if not code or not state:
            return self._auth_error_redirect("Google 回调参数缺失，请重试")

        state_value = self.redis.hgetall(self._state_key(state))
        self.redis.delete(self._state_key(state))
        if not state_value:
            return self._auth_error_redirect("Google 登录状态已失效，请重试")

        nonce = (state_value.get("nonce") or "").strip()
        code_verifier = (state_value.get("code_verifier") or "").strip()
        if not nonce or not code_verifier:
            return self._auth_error_redirect("Google 登录状态无效，请重试")

        try:
            token_data = self._exchange_code_for_tokens(code=code, code_verifier=code_verifier)
            id_token = (token_data.get("id_token") or "").strip()
            if not id_token:
                raise _GoogleAuthError("Google 登录失败，请重试")
            claims = self._fetch_token_info(id_token)
            self._validate_token_claims(claims=claims, expected_nonce=nonce)
        except _GoogleAuthError as exc:
            return self._auth_error_redirect(exc.message)

        provider_sub = (claims.get("sub") or "").strip()
        email = (claims.get("email") or "").strip().lower()
        display_name = (claims.get("name") or "").strip()
        if not provider_sub or not email:
            return self._auth_error_redirect("Google 账户信息缺失，请重试")

        identity = self.identity_repo.get_by_provider_sub(
            provider=GOOGLE_PROVIDER,
            provider_sub=provider_sub,
        )
        if identity:
            user = self.user_repo.get_by_id(identity.user_id, include_deleted=True)
            if not user or user.is_deleted:
                return self._auth_error_redirect("账号已被删除或不可用，请联系管理员")
            auth_response = self._issue_auth_response(user_id=user.user_id, user_pk=user.id, user=user, ip=ip, user_agent=user_agent)
            self.db.commit()
            return self._callback_success_redirect(auth_response)

        user_by_email = self.user_repo.get_by_email(email, include_deleted=True)
        if user_by_email:
            if user_by_email.is_deleted:
                return self._auth_error_redirect("账号已被删除或不可用，请联系管理员")
            try:
                self.identity_repo.create(
                    user_id=user_by_email.id,
                    provider=GOOGLE_PROVIDER,
                    provider_sub=provider_sub,
                )
                auth_response = self._issue_auth_response(
                    user_id=user_by_email.user_id,
                    user_pk=user_by_email.id,
                    user=user_by_email,
                    ip=ip,
                    user_agent=user_agent,
                )
                self.db.commit()
                return self._callback_success_redirect(auth_response)
            except IntegrityError:
                self.db.rollback()
                existing_identity = self.identity_repo.get_by_provider_sub(
                    provider=GOOGLE_PROVIDER,
                    provider_sub=provider_sub,
                )
                if existing_identity and existing_identity.user_id == user_by_email.id:
                    auth_response = self._issue_auth_response(
                        user_id=user_by_email.user_id,
                        user_pk=user_by_email.id,
                        user=user_by_email,
                        ip=ip,
                        user_agent=user_agent,
                    )
                    self.db.commit()
                    return self._callback_success_redirect(auth_response)
                return self._auth_error_redirect("Google 账号绑定冲突，请重试")

        complete_ticket = secrets.token_urlsafe(32)
        complete_key = self._complete_key(complete_ticket)
        self.redis.hset(
            complete_key,
            mapping={
                "provider_sub": provider_sub,
                "email": email,
                "name": display_name,
            },
        )
        self.redis.expire(complete_key, max(60, settings.google_oauth_complete_ttl_seconds))

        query_params = {
            "ticket": complete_ticket,
            "email": email,
        }
        if display_name:
            query_params["name"] = display_name
        return self._build_web_url("/auth/google/complete", query_params=query_params)

    def complete_signup(
        self,
        payload: SSOCompleteRequest,
        *,
        ip: str | None,
        user_agent: str | None,
    ) -> AuthResponse:
        try:
            self._google_config()
        except _GoogleAuthError as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=exc.message) from exc

        if payload.ui_language not in ALLOWED_UI_LANGUAGES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的界面语言")

        ticket = payload.sso_ticket.strip()
        ticket_key = self._complete_key(ticket)
        ticket_state = self.redis.hgetall(ticket_key)
        if not ticket_state:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google 登录补全信息已过期，请重新登录")

        provider_sub = (ticket_state.get("provider_sub") or "").strip()
        email = (ticket_state.get("email") or "").strip().lower()
        suggested_name = (ticket_state.get("name") or "").strip()
        if not provider_sub or not email:
            self.redis.delete(ticket_key)
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google 登录补全信息无效，请重新登录")

        normalized_user_id = payload.user_id.strip()
        nickname = self._normalize_nickname(payload.nickname) or self._normalize_nickname(suggested_name)

        existing_identity = self.identity_repo.get_by_provider_sub(provider=GOOGLE_PROVIDER, provider_sub=provider_sub)
        if existing_identity:
            user = self.user_repo.get_by_id(existing_identity.user_id, include_deleted=True)
            self.redis.delete(ticket_key)
            if not user or user.is_deleted:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被删除或不可用，请联系管理员")
            auth_response = self._issue_auth_response(
                user_id=user.user_id,
                user_pk=user.id,
                user=user,
                ip=ip,
                user_agent=user_agent,
            )
            self.db.commit()
            return auth_response

        user_by_email = self.user_repo.get_by_email(email, include_deleted=True)
        if user_by_email and user_by_email.is_deleted:
            self.redis.delete(ticket_key)
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被删除或不可用，请联系管理员")

        try:
            if user_by_email:
                user = user_by_email
            else:
                if self.user_repo.get_by_user_id(normalized_user_id):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ID 已存在")
                user = self.user_repo.create(
                    user_id=normalized_user_id,
                    email=email,
                    password_hash=get_password_hash(secrets.token_urlsafe(48)),
                    nickname=nickname,
                    ui_language=payload.ui_language,
                )
            self.identity_repo.create(user_id=user.id, provider=GOOGLE_PROVIDER, provider_sub=provider_sub)
            self.redis.delete(ticket_key)
            auth_response = self._issue_auth_response(
                user_id=user.user_id,
                user_pk=user.id,
                user=user,
                ip=ip,
                user_agent=user_agent,
            )
            self.db.commit()
            return auth_response
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Google 账号绑定冲突，请重试") from exc

    def _issue_auth_response(
        self,
        *,
        user_id: str,
        user_pk,
        user,
        ip: str | None,
        user_agent: str | None,
    ) -> AuthResponse:
        token_payload = self.auth_service._issue_tokens(
            user_pk,
            user_id,
            ip=ip,
            user_agent=user_agent,
        )
        return AuthResponse(user=UserPublic.model_validate(user), token=token_payload)

    def _google_config(self) -> tuple[str, str, str]:
        client_id = (settings.google_oauth_client_id or "").strip()
        client_secret = (settings.google_oauth_client_secret or "").strip()
        redirect_uri = (settings.google_oauth_redirect_uri or "").strip()
        if not client_id or not client_secret or not redirect_uri:
            raise _GoogleAuthError("Google SSO 未配置，请联系管理员")
        return client_id, client_secret, redirect_uri

    def _exchange_code_for_tokens(self, *, code: str, code_verifier: str) -> dict:
        client_id, client_secret, redirect_uri = self._google_config()
        payload = urllib.parse.urlencode(
            {
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": code_verifier,
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            GOOGLE_TOKEN_ENDPOINT,
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        timeout = max(3, settings.google_oauth_timeout_seconds)
        try:
            with urlopen_with_optional_proxy(request, timeout=timeout) as response:
                raw = response.read()
            return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise _GoogleAuthError("Google 授权码换取令牌失败，请重试") from exc
        except urllib.error.URLError as exc:
            raise _GoogleAuthError("Google 登录网络异常，请稍后重试") from exc
        except TimeoutError as exc:
            raise _GoogleAuthError("Google 登录请求超时，请稍后重试") from exc
        except json.JSONDecodeError as exc:
            raise _GoogleAuthError("Google 登录响应异常，请稍后重试") from exc

    def _fetch_token_info(self, id_token: str) -> dict:
        query = urllib.parse.urlencode({"id_token": id_token})
        request = urllib.request.Request(f"{GOOGLE_TOKENINFO_ENDPOINT}?{query}", method="GET")
        timeout = max(3, settings.google_oauth_timeout_seconds)
        try:
            with urlopen_with_optional_proxy(request, timeout=timeout) as response:
                raw = response.read()
            return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise _GoogleAuthError("Google 令牌校验失败，请重试") from exc
        except urllib.error.URLError as exc:
            raise _GoogleAuthError("Google 令牌校验网络异常，请稍后重试") from exc
        except TimeoutError as exc:
            raise _GoogleAuthError("Google 令牌校验超时，请稍后重试") from exc
        except json.JSONDecodeError as exc:
            raise _GoogleAuthError("Google 令牌校验响应异常，请稍后重试") from exc

    def _validate_token_claims(self, *, claims: dict, expected_nonce: str) -> None:
        issuer = (claims.get("iss") or "").strip()
        if issuer not in GOOGLE_ALLOWED_ISSUERS:
            raise _GoogleAuthError("Google 令牌发行方无效，请重试")

        expected_audience = (settings.google_oauth_client_id or "").strip()
        audience = (claims.get("aud") or "").strip()
        if not expected_audience or audience != expected_audience:
            raise _GoogleAuthError("Google 令牌受众不匹配，请重试")

        exp_raw = claims.get("exp")
        try:
            exp = int(str(exp_raw))
        except (TypeError, ValueError) as exc:
            raise _GoogleAuthError("Google 令牌过期时间无效，请重试") from exc
        if exp <= int(datetime.now(timezone.utc).timestamp()):
            raise _GoogleAuthError("Google 令牌已过期，请重试")

        nonce = (claims.get("nonce") or "").strip()
        if not nonce or nonce != expected_nonce:
            raise _GoogleAuthError("Google 登录状态校验失败，请重试")

        provider_sub = (claims.get("sub") or "").strip()
        if not provider_sub:
            raise _GoogleAuthError("Google 账户标识缺失，请重试")

        email_verified = claims.get("email_verified")
        verified = email_verified is True or str(email_verified).lower() == "true"
        if not verified:
            raise _GoogleAuthError("Google 邮箱未验证，暂不支持登录")

    def _callback_success_redirect(self, auth_response: AuthResponse) -> str:
        payload = self._encode_auth_payload(auth_response)
        return self._build_web_url(
            "/auth/google/callback",
            fragment_params={"payload": payload},
        )

    def _auth_error_redirect(self, message: str) -> str:
        return self._build_web_url("/auth", query_params={"error": message})

    def _build_web_url(
        self,
        path: str,
        *,
        query_params: dict[str, str] | None = None,
        fragment_params: dict[str, str] | None = None,
    ) -> str:
        base = settings.web_base_url.rstrip("/")
        normalized_path = path if path.startswith("/") else f"/{path}"
        target = f"{base}{normalized_path}"
        if query_params:
            target = f"{target}?{urllib.parse.urlencode(query_params)}"
        if fragment_params:
            target = f"{target}#{urllib.parse.urlencode(fragment_params)}"
        return target

    def _state_key(self, state: str) -> str:
        return f"auth:sso:google:state:{state}"

    def _complete_key(self, ticket: str) -> str:
        return f"auth:sso:google:complete:{ticket}"

    def _normalize_nickname(self, value: str | None) -> str | None:
        if not value:
            return None
        normalized = value.strip()
        if not normalized:
            return None
        return normalized[:64]

    def _encode_auth_payload(self, auth_response: AuthResponse) -> str:
        raw = json.dumps(auth_response.model_dump(mode="json")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")

    def _pkce_s256_challenge(self, code_verifier: str) -> str:
        digest = hashlib.sha256(code_verifier.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
