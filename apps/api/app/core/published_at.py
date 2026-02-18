from __future__ import annotations

import html
import re
import urllib.parse
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

META_DATE_KEYS = {
    "article:published_time",
    "article:published",
    "og:published_time",
    "publishdate",
    "pubdate",
    "date",
    "dc.date",
    "datepublished",
    "datecreated",
}

META_TAG_RE = re.compile(r"(?is)<meta\b[^>]*>")
SCRIPT_DATE_RE = re.compile(r'"(?:datePublished|dateCreated|uploadDate|dateModified)"\s*:\s*"([^"]+)"', re.IGNORECASE)
TIME_TAG_RE = re.compile(r'(?is)<time\b[^>]*\bdatetime\s*=\s*(?:"([^"]+)"|\'([^\']+)\'|([^\s>]+))')
URL_DATE_RE = re.compile(r"(?<!\d)(20\d{2})[-_/](0?[1-9]|1[0-2])[-_/](0?[1-9]|[12]\d|3[01])(?!\d)")
URL_COMPACT_DATE_RE = re.compile(r"(?<!\d)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)")


def parse_datetime(value: str | None) -> datetime | None:
    if value is None:
        return None
    raw = html.unescape(value).strip()
    if not raw:
        return None

    parsed = _parse_datetime_value(raw)
    if not parsed:
        return None

    now_utc = datetime.now(timezone.utc)
    if parsed.year < 1970 or parsed > now_utc + timedelta(days=370):
        return None
    return parsed


def infer_published_at(*, source_url: str, document: str) -> datetime | None:
    for candidate in _iter_document_datetime_candidates(document):
        parsed = parse_datetime(candidate)
        if parsed is not None:
            return parsed
    return _infer_from_url(source_url)


def _iter_document_datetime_candidates(document: str) -> list[str]:
    candidates: list[str] = []

    for raw_tag in META_TAG_RE.findall(document):
        attrs = _parse_html_attrs(raw_tag)
        key = (attrs.get("property") or attrs.get("name") or attrs.get("itemprop") or "").strip().lower()
        if key not in META_DATE_KEYS:
            continue
        content = (attrs.get("content") or "").strip()
        if content:
            candidates.append(content)

    for match in SCRIPT_DATE_RE.finditer(document):
        value = (match.group(1) or "").strip()
        if value:
            candidates.append(value)

    for match in TIME_TAG_RE.finditer(document):
        value = (match.group(1) or match.group(2) or match.group(3) or "").strip()
        if value:
            candidates.append(value)

    return candidates


def _parse_html_attrs(raw_tag: str) -> dict[str, str]:
    attrs: dict[str, str] = {}
    for match in re.finditer(r'(?is)\b([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+))', raw_tag):
        key = match.group(1).strip().lower()
        value = (match.group(2) or match.group(3) or match.group(4) or "").strip()
        attrs[key] = html.unescape(value)
    return attrs


def _parse_datetime_value(value: str) -> datetime | None:
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (TypeError, ValueError, IndexError):
        pass

    normalized = value.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        pass

    for pattern in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M"):
        try:
            dt = datetime.strptime(value, pattern).replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


def _infer_from_url(source_url: str) -> datetime | None:
    parsed = urllib.parse.urlsplit(source_url)
    target = urllib.parse.unquote(f"{parsed.path}?{parsed.query}".strip("?"))

    for match in URL_DATE_RE.finditer(target):
        dt = _build_utc_datetime(match.group(1), match.group(2), match.group(3))
        if dt is not None:
            return dt

    for match in URL_COMPACT_DATE_RE.finditer(target):
        dt = _build_utc_datetime(match.group(1), match.group(2), match.group(3))
        if dt is not None:
            return dt
    return None


def _build_utc_datetime(year: str, month: str, day: str) -> datetime | None:
    try:
        return datetime(int(year), int(month), int(day), tzinfo=timezone.utc)
    except ValueError:
        return None
