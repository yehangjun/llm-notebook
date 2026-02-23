from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import pytest

from app.core.config import settings
from app.schemas.auth import SSOCompleteRequest
from app.services.sso_service import GoogleSSOService


def _build_service() -> GoogleSSOService:
    service = GoogleSSOService.__new__(GoogleSSOService)
    service.db = MagicMock()
    service.redis = MagicMock()
    service.user_repo = MagicMock()
    service.identity_repo = MagicMock()
    service.auth_service = MagicMock()
    service._google_config = MagicMock(
        return_value=(
            "google-client-id",
            "google-client-secret",
            "http://localhost:8000/api/v1/auth/sso/google/callback",
        )
    )
    return service


def test_build_start_url_contains_required_google_oauth_params(monkeypatch) -> None:
    service = _build_service()
    monkeypatch.setattr(settings, "google_oauth_scope", "openid profile email")
    monkeypatch.setattr(settings, "google_oauth_state_ttl_seconds", 600)

    start_url = service.build_start_url()
    parsed = urlsplit(start_url)
    params = parse_qs(parsed.query)

    assert parsed.netloc == "accounts.google.com"
    assert params["client_id"] == ["google-client-id"]
    assert params["redirect_uri"] == ["http://localhost:8000/api/v1/auth/sso/google/callback"]
    assert params["response_type"] == ["code"]
    assert params["scope"] == ["openid profile email"]
    assert params["code_challenge_method"] == ["S256"]
    assert len(params["state"][0]) >= 16
    assert len(params["nonce"][0]) >= 16
    assert len(params["code_challenge"][0]) >= 16

    service.redis.hset.assert_called_once()
    state_key = service.redis.hset.call_args.args[0]
    assert state_key.startswith("auth:sso:google:state:")
    service.redis.expire.assert_called_once_with(state_key, 600)


def test_validate_token_claims_rejects_nonce_mismatch(monkeypatch) -> None:
    service = _build_service()
    monkeypatch.setattr(settings, "google_oauth_client_id", "google-client-id")
    claims = {
        "iss": "https://accounts.google.com",
        "aud": "google-client-id",
        "exp": str(int((datetime.now(timezone.utc) + timedelta(minutes=10)).timestamp())),
        "nonce": "nonce-from-token",
        "sub": "provider-sub-1",
        "email_verified": "true",
    }

    with pytest.raises(Exception) as exc:
        service._validate_token_claims(claims=claims, expected_nonce="nonce-from-state")

    assert "状态校验失败" in str(exc.value)


def test_complete_signup_creates_user_and_binds_identity() -> None:
    service = _build_service()
    now = datetime.now(timezone.utc)
    created_user = SimpleNamespace(
        id=uuid4(),
        user_id="alice_2026",
        email="alice@example.com",
        nickname="Alice",
        ui_language="zh-CN",
        is_admin=False,
        created_at=now,
    )
    payload = SSOCompleteRequest(
        sso_ticket="ticket-abc-1234567890",
        user_id="alice_2026",
        nickname="Alice",
        ui_language="zh-CN",
    )

    service.redis.hgetall.return_value = {
        "provider_sub": "google-sub-001",
        "email": "alice@example.com",
        "name": "Alice",
    }
    service.identity_repo.get_by_provider_sub.return_value = None
    service.user_repo.get_by_email.return_value = None
    service.user_repo.get_by_user_id.return_value = None
    service.user_repo.create.return_value = created_user
    service.auth_service._issue_tokens.return_value = {
        "access_token": "access-token",
        "refresh_token": "refresh-token",
        "token_type": "bearer",
        "expires_in": 900,
    }

    response = service.complete_signup(payload, ip="127.0.0.1", user_agent="pytest")

    assert response.user.user_id == "alice_2026"
    assert response.user.email == "alice@example.com"
    assert response.token.access_token == "access-token"
    service.user_repo.create.assert_called_once()
    service.identity_repo.create.assert_called_once_with(
        user_id=created_user.id,
        provider="google",
        provider_sub="google-sub-001",
    )
    service.redis.delete.assert_called_once_with("auth:sso:google:complete:ticket-abc-1234567890")
    service.db.commit.assert_called_once()
