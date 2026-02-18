from __future__ import annotations

from functools import lru_cache
from typing import Any
import urllib.request

from app.core.config import settings


@lru_cache(maxsize=4)
def _build_opener(proxy_url: str) -> urllib.request.OpenerDirector:
    if not proxy_url:
        return urllib.request.build_opener()
    return urllib.request.build_opener(
        urllib.request.ProxyHandler(
            {
                "http": proxy_url,
                "https": proxy_url,
            }
        )
    )


def urlopen_with_optional_proxy(request: Any, *, timeout: int) -> Any:
    proxy_url = (settings.network_proxy_url or "").strip()
    if not proxy_url:
        return urllib.request.urlopen(request, timeout=timeout)
    return _build_opener(proxy_url).open(request, timeout=timeout)
