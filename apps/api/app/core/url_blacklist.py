from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any


@dataclass(frozen=True, slots=True)
class UrlBlacklistMatch:
    category: str
    matched_rule: str


BLACKLIST_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "url_blacklist.json"

CATEGORY_LABELS: dict[str, str] = {
    "video": "视频网站",
    "anti_crawl": "反抓取网站",
}


def match_blacklisted_host(host: str) -> UrlBlacklistMatch | None:
    normalized_host = host.strip().lower().strip(".")
    if not normalized_host:
        return None

    rules = _load_blacklist_rules()

    for rule in rules["video"]:
        if _domain_matches(normalized_host, rule):
            return UrlBlacklistMatch(category="video", matched_rule=rule)

    for rule in rules["anti_crawl"]:
        if _domain_matches(normalized_host, rule):
            return UrlBlacklistMatch(category="anti_crawl", matched_rule=rule)

    return None


@lru_cache(maxsize=1)
def _load_blacklist_rules() -> dict[str, tuple[str, ...]]:
    config_data = _load_config_json(BLACKLIST_CONFIG_PATH)
    return {
        "video": _normalize_rule_list(config_data.get("video")),
        "anti_crawl": _normalize_rule_list(config_data.get("anti_crawl")),
    }


def _load_config_json(path: Path) -> dict[str, Any]:
    try:
        raw_text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise RuntimeError(f"无法读取 URL 黑名单配置文件: {path}") from exc

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"URL 黑名单配置文件 JSON 格式不合法: {path}") from exc

    if not isinstance(data, dict):
        raise RuntimeError(f"URL 黑名单配置文件格式错误，根节点必须是对象: {path}")

    return data


def _normalize_rule_list(raw_rules: Any) -> tuple[str, ...]:
    if not isinstance(raw_rules, list):
        return ()

    rules: list[str] = []
    seen: set[str] = set()
    for item in raw_rules:
        if not isinstance(item, str):
            continue
        rule = item.strip().lower().strip(".")
        if not rule or rule in seen:
            continue
        seen.add(rule)
        rules.append(rule)

    return tuple(rules)


def _domain_matches(host: str, rule: str) -> bool:
    normalized_rule = rule.strip().lower().strip(".")
    if not normalized_rule:
        return False
    return host == normalized_rule or host.endswith(f".{normalized_rule}")
