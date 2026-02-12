from abc import ABC, abstractmethod
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.core.config import settings


class SsoProviderError(ValueError):
    pass


@dataclass(frozen=True)
class SsoPrincipal:
    provider: str
    provider_user_id: str
    email: str | None = None
    display_name: str | None = None


class SsoProvider(ABC):
    name: str

    @abstractmethod
    def build_authorize_url(self, state: str) -> str:
        pass

    @abstractmethod
    def exchange_code(self, code: str) -> SsoPrincipal:
        pass


class GmailSsoProvider(SsoProvider):
    name = 'gmail'

    def __init__(self, client_id: str, client_secret: str, redirect_uri: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri

    def build_authorize_url(self, state: str) -> str:
        params = {
            'client_id': self.client_id,
            'redirect_uri': self.redirect_uri,
            'response_type': 'code',
            'scope': 'openid email profile',
            'state': state,
            'access_type': 'online',
            'prompt': 'consent',
        }
        return f'https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}'

    def exchange_code(self, code: str) -> SsoPrincipal:
        with httpx.Client(timeout=20) as client:
            token_res = client.post(
                'https://oauth2.googleapis.com/token',
                data={
                    'code': code,
                    'client_id': self.client_id,
                    'client_secret': self.client_secret,
                    'redirect_uri': self.redirect_uri,
                    'grant_type': 'authorization_code',
                },
            )
            if token_res.status_code != 200:
                raise SsoProviderError(f'Gmail token exchange failed: {token_res.text}')
            token_payload = token_res.json()
            access_token = token_payload.get('access_token')
            if not access_token:
                raise SsoProviderError('Gmail token exchange returned no access_token')

            user_res = client.get(
                'https://openidconnect.googleapis.com/v1/userinfo',
                headers={'Authorization': f'Bearer {access_token}'},
            )
            if user_res.status_code != 200:
                raise SsoProviderError(f'Gmail userinfo fetch failed: {user_res.text}')
            user = user_res.json()

        subject = str(user.get('sub') or '').strip()
        if not subject:
            raise SsoProviderError('Gmail userinfo missing subject')

        return SsoPrincipal(
            provider=self.name,
            provider_user_id=subject,
            email=(user.get('email') or '').strip() or None,
            display_name=(user.get('name') or '').strip() or None,
        )


class WechatSsoProvider(SsoProvider):
    name = 'wechat'

    def __init__(self, app_id: str, app_secret: str, redirect_uri: str):
        self.app_id = app_id
        self.app_secret = app_secret
        self.redirect_uri = redirect_uri

    def build_authorize_url(self, state: str) -> str:
        params = {
            'appid': self.app_id,
            'redirect_uri': self.redirect_uri,
            'response_type': 'code',
            'scope': 'snsapi_login',
            'state': state,
        }
        return f'https://open.weixin.qq.com/connect/qrconnect?{urlencode(params)}#wechat_redirect'

    def exchange_code(self, code: str) -> SsoPrincipal:
        with httpx.Client(timeout=20) as client:
            token_res = client.get(
                'https://api.weixin.qq.com/sns/oauth2/access_token',
                params={
                    'appid': self.app_id,
                    'secret': self.app_secret,
                    'code': code,
                    'grant_type': 'authorization_code',
                },
            )
            if token_res.status_code != 200:
                raise SsoProviderError(f'WeChat token exchange failed: {token_res.text}')
            token_payload = token_res.json()
            if token_payload.get('errcode'):
                raise SsoProviderError(
                    f"WeChat token exchange error: {token_payload.get('errmsg', token_payload.get('errcode'))}"
                )

            access_token = token_payload.get('access_token')
            openid = token_payload.get('openid')
            if not access_token or not openid:
                raise SsoProviderError('WeChat token exchange returned missing access_token/openid')

            user_res = client.get(
                'https://api.weixin.qq.com/sns/userinfo',
                params={
                    'access_token': access_token,
                    'openid': openid,
                    'lang': 'zh_CN',
                },
            )
            if user_res.status_code != 200:
                raise SsoProviderError(f'WeChat userinfo fetch failed: {user_res.text}')
            user = user_res.json()
            if user.get('errcode'):
                raise SsoProviderError(
                    f"WeChat userinfo error: {user.get('errmsg', user.get('errcode'))}"
                )

        provider_user_id = str(user.get('unionid') or openid).strip()
        if not provider_user_id:
            raise SsoProviderError('WeChat userinfo missing identity')

        return SsoPrincipal(
            provider=self.name,
            provider_user_id=provider_user_id,
            email=None,
            display_name=(user.get('nickname') or '').strip() or None,
        )


class SsoProviderRegistry:
    def __init__(self):
        self._providers: dict[str, SsoProvider] = {}

    def register(self, provider: SsoProvider):
        key = provider.name.strip().lower()
        if not key:
            raise SsoProviderError('provider.name is required')
        self._providers[key] = provider

    def get(self, provider_name: str) -> SsoProvider | None:
        return self._providers.get(provider_name.strip().lower())

    def names(self) -> list[str]:
        return sorted(self._providers.keys())


def build_default_registry() -> SsoProviderRegistry:
    registry = SsoProviderRegistry()

    if settings.gmail_oauth_client_id and settings.gmail_oauth_client_secret:
        registry.register(
            GmailSsoProvider(
                client_id=settings.gmail_oauth_client_id,
                client_secret=settings.gmail_oauth_client_secret,
                redirect_uri=settings.gmail_oauth_redirect_uri,
            )
        )

    if settings.wechat_oauth_app_id and settings.wechat_oauth_app_secret:
        registry.register(
            WechatSsoProvider(
                app_id=settings.wechat_oauth_app_id,
                app_secret=settings.wechat_oauth_app_secret,
                redirect_uri=settings.wechat_oauth_redirect_uri,
            )
        )

    return registry


_default_registry: SsoProviderRegistry | None = None


def get_sso_registry() -> SsoProviderRegistry:
    global _default_registry
    if _default_registry is None:
        _default_registry = build_default_registry()
    return _default_registry
