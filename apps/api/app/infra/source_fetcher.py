from __future__ import annotations

import html
import re
import urllib.request
from dataclasses import dataclass
from datetime import datetime

from app.core.config import settings
from app.core.published_at import parse_datetime
from app.infra.network import urlopen_with_optional_proxy

WHITESPACE_RE = re.compile(r"\s+")
TITLE_RE = re.compile(r"(?is)<title[^>]*>(.*?)</title>")
SCRIPT_STYLE_RE = re.compile(r"(?is)<(script|style|noscript).*?>.*?</\1>")
HTML_TAG_RE = re.compile(r"(?is)<[^>]+>")


@dataclass(slots=True)
class SourceFetchResult:
    title: str | None
    content: str
    resolved_source_url: str
    document: str
    published_at_hint: datetime | None


@dataclass(slots=True)
class JinaPayload:
    title: str | None
    source_url: str
    published_at: datetime | None
    content: str


def fetch_source_for_analysis(*, source_url: str, headers: dict[str, str]) -> SourceFetchResult:
    if settings.content_fetch_use_jina_reader:
        return _fetch_via_jina_reader(source_url=source_url, headers=headers)
    return _fetch_direct(source_url=source_url, headers=headers)


def _fetch_direct(*, source_url: str, headers: dict[str, str]) -> SourceFetchResult:
    request = urllib.request.Request(source_url, headers=headers)
    with urlopen_with_optional_proxy(request, timeout=settings.note_fetch_timeout_seconds) as response:
        raw = response.read(settings.note_fetch_max_bytes)
        encoding = response.headers.get_content_charset() or "utf-8"
        resolved_url = response.geturl() or source_url

    document = raw.decode(encoding, errors="ignore")
    title = _extract_html_title(document)
    content = _extract_html_text(document)
    return SourceFetchResult(
        title=title,
        content=content,
        resolved_source_url=resolved_url,
        document=document,
        published_at_hint=None,
    )


def _fetch_via_jina_reader(*, source_url: str, headers: dict[str, str]) -> SourceFetchResult:
    request_headers = {
        "User-Agent": headers.get("User-Agent", "PrismNotebookBot/1.0"),
        "Accept": "text/plain,text/markdown,*/*;q=0.8",
    }
    jina_token = (settings.jina_reader_token or "").strip()
    if jina_token:
        request_headers["Authorization"] = f"Bearer {jina_token}"

    request = urllib.request.Request(
        _build_jina_reader_url(source_url),
        headers=request_headers,
    )
    with urlopen_with_optional_proxy(request, timeout=settings.note_fetch_timeout_seconds) as response:
        raw = response.read(settings.note_fetch_max_bytes)
        encoding = response.headers.get_content_charset() or "utf-8"

    document = raw.decode(encoding, errors="ignore")
    jina_payload = _parse_jina_payload(document=document, fallback_source_url=source_url)
    content = _normalize_plain_text(jina_payload.content)
    return SourceFetchResult(
        title=jina_payload.title,
        content=_trim_content(content),
        resolved_source_url=jina_payload.source_url or source_url,
        document=document,
        published_at_hint=jina_payload.published_at,
    )


def _build_jina_reader_url(source_url: str) -> str:
    base_url = (settings.jina_reader_base_url or "").strip() or "https://r.jina.ai/"
    if not base_url.endswith("/"):
        base_url = f"{base_url}/"
    return f"{base_url}{source_url}"


def _parse_jina_payload(*, document: str, fallback_source_url: str) -> JinaPayload:
    title: str | None = None
    source_url = fallback_source_url
    published_at: datetime | None = None

    lines = document.splitlines()
    content = document.strip()
    metadata_started = False

    for index, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            continue

        lowered = line.lower()
        if lowered.startswith("title:"):
            metadata_started = True
            parsed = _after_colon(line)
            if parsed:
                title = parsed
            continue
        if lowered.startswith("url source:"):
            metadata_started = True
            parsed = _after_colon(line)
            if parsed:
                source_url = parsed
            continue
        if lowered.startswith("published time:"):
            metadata_started = True
            parsed = _after_colon(line)
            if parsed:
                published_at = parse_datetime(parsed)
            continue
        if lowered.startswith("warning:"):
            metadata_started = True
            continue
        if lowered.startswith("markdown content:"):
            metadata_started = True
            content = "\n".join(lines[index + 1 :]).strip()
            break
        if metadata_started:
            content = "\n".join(lines[index:]).strip()
            break
        break

    return JinaPayload(
        title=title,
        source_url=source_url,
        published_at=published_at,
        content=content,
    )


def _after_colon(value: str) -> str | None:
    _, _, remain = value.partition(":")
    parsed = html.unescape(remain.strip())
    if not parsed:
        return None
    return parsed


def _extract_html_title(document: str) -> str | None:
    match = TITLE_RE.search(document)
    if not match:
        return None
    title = _normalize_plain_text(match.group(1))
    if not title:
        return None
    return title


def _extract_html_text(document: str) -> str:
    cleaned = SCRIPT_STYLE_RE.sub(" ", document)
    plain = HTML_TAG_RE.sub(" ", cleaned)
    normalized = _normalize_plain_text(plain)
    return _trim_content(normalized)


def _normalize_plain_text(value: str) -> str:
    return WHITESPACE_RE.sub(" ", html.unescape(value)).strip()


def _trim_content(value: str) -> str:
    if len(value) <= settings.note_body_max_chars:
        return value
    return value[: settings.note_body_max_chars]
