from abc import ABC, abstractmethod
from dataclasses import dataclass

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
    def authenticate(
        self,
        provider_user_id: str,
        email: str | None = None,
        display_name: str | None = None,
    ) -> SsoPrincipal:
        pass


class MockPassthroughSsoProvider(SsoProvider):
    def __init__(self, name: str):
        self.name = name.strip().lower()

    def authenticate(
        self,
        provider_user_id: str,
        email: str | None = None,
        display_name: str | None = None,
    ) -> SsoPrincipal:
        subject = provider_user_id.strip()
        if not subject:
            raise SsoProviderError('provider_user_id is required')

        return SsoPrincipal(
            provider=self.name,
            provider_user_id=subject,
            email=email,
            display_name=display_name,
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


def _parse_provider_list(raw: str) -> list[str]:
    names = [item.strip().lower() for item in raw.split(',') if item.strip()]
    return list(dict.fromkeys(names))


def build_default_registry() -> SsoProviderRegistry:
    registry = SsoProviderRegistry()
    provider_names = _parse_provider_list(settings.mock_sso_providers)
    if not provider_names:
        provider_names = ['google', 'github', 'apple', 'wechat']

    for name in provider_names:
        registry.register(MockPassthroughSsoProvider(name=name))
    return registry


_default_registry: SsoProviderRegistry | None = None


def get_sso_registry() -> SsoProviderRegistry:
    global _default_registry
    if _default_registry is None:
        _default_registry = build_default_registry()
    return _default_registry
