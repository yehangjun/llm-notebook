from app.core.tag_utils import normalize_hashtag, normalize_hashtag_list, pick_localized_tags


def test_normalize_hashtag_supports_hash_prefix_and_cjk() -> None:
    assert normalize_hashtag("#OpenAI") == "openai"
    assert normalize_hashtag(" #大模型 ") == "大模型"


def test_normalize_hashtag_rejects_invalid_chars() -> None:
    assert normalize_hashtag("open ai") is None
    assert normalize_hashtag("openai!") is None


def test_normalize_hashtag_list_dedup_and_limit() -> None:
    values = ["#OpenAI", "openai", "大模型", "AI_2026", "abc-xyz", "extra_tag"]
    assert normalize_hashtag_list(values, max_count=5) == ["openai", "大模型", "ai_2026", "abc-xyz", "extra_tag"]


def test_pick_localized_tags_prefers_zh_when_requested() -> None:
    tags = pick_localized_tags(
        prefer_zh=True,
        source_language="non-zh",
        original_tags=["openai", "agent"],
        zh_tags=["开放ai", "智能体"],
    )
    assert tags == ["开放ai", "智能体"]


def test_pick_localized_tags_falls_back_to_original_for_zh_source() -> None:
    tags = pick_localized_tags(
        prefer_zh=True,
        source_language="zh",
        original_tags=["大模型", "智能体"],
        zh_tags=[],
    )
    assert tags == ["大模型", "智能体"]


def test_pick_localized_tags_falls_back_when_preferred_missing() -> None:
    tags = pick_localized_tags(
        prefer_zh=False,
        source_language="non-zh",
        original_tags=[],
        zh_tags=["开放ai"],
    )
    assert tags == ["开放ai"]
