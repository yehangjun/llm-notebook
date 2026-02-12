from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import jwt

from app.core.config import settings


class SsoStateError(ValueError):
    pass


def _allowed_redirect_hosts() -> set[str]:
    hosts = {item.strip().lower() for item in settings.sso_allowed_redirect_hosts.split(',') if item.strip()}
    return hosts or {'localhost', '127.0.0.1'}


def validate_redirect_url(redirect_url: str) -> str:
    parsed = urlparse(redirect_url)
    if parsed.scheme not in {'http', 'https'}:
        raise SsoStateError('redirect url must use http/https')

    host = (parsed.hostname or '').lower()
    if host not in _allowed_redirect_hosts():
        raise SsoStateError('redirect host is not allowed')

    return redirect_url


def create_sso_state(provider: str, success_redirect_url: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.sso_state_expire_minutes)
    payload = {
        'provider': provider,
        'redirect': success_redirect_url,
        'exp': expires_at,
    }
    return jwt.encode(payload, settings.secret_key, algorithm='HS256')


def parse_sso_state(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=['HS256'])
    except Exception as exc:  # noqa: BLE001
        raise SsoStateError('invalid state') from exc

    provider = str(payload.get('provider') or '').strip().lower()
    redirect = str(payload.get('redirect') or '').strip()
    if not provider or not redirect:
        raise SsoStateError('state payload is invalid')

    validate_redirect_url(redirect)
    return {'provider': provider, 'redirect': redirect}
