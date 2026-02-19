from __future__ import annotations

import re

MAX_TAGS_DEFAULT = 5
TAG_PATTERN_RE = re.compile(r"^[a-z0-9_\-\u3400-\u4dbf\u4e00-\u9fff]+$")


def normalize_hashtag(raw: str | None) -> str | None:
    if not isinstance(raw, str):
        return None
    value = raw.strip()
    if not value:
        return None
    value = value.lstrip("#").strip().lower()
    if not value:
        return None
    if not TAG_PATTERN_RE.fullmatch(value):
        return None
    return value


def normalize_hashtag_list(values: list[str] | None, *, max_count: int = MAX_TAGS_DEFAULT) -> list[str]:
    if not values:
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in values:
        tag = normalize_hashtag(raw)
        if not tag or tag in seen:
            continue
        seen.add(tag)
        normalized.append(tag)
        if len(normalized) >= max_count:
            break
    return normalized


def pick_localized_tags(
    *,
    prefer_zh: bool,
    source_language: str | None,
    original_tags: list[str] | None,
    zh_tags: list[str] | None,
    max_count: int = MAX_TAGS_DEFAULT,
) -> list[str]:
    original = normalize_hashtag_list(original_tags, max_count=max_count)
    zh = normalize_hashtag_list(zh_tags, max_count=max_count)
    if source_language == "zh" and not zh:
        zh = list(original)
    primary = zh if prefer_zh else original
    fallback = original if prefer_zh else zh
    return primary or fallback
