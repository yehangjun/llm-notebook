from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.feed_service import FeedService


def _build_service() -> FeedService:
    service = FeedService.__new__(FeedService)
    return service


def test_display_tags_for_note_prefers_translated_tags_when_source_matches_note_tags() -> None:
    service = _build_service()
    note = SimpleNamespace(tags_json=["openai", "agent"])
    latest_summary = SimpleNamespace(
        source_language="non-zh",
        output_tags_json=["openai", "agent"],
        key_points_json=[],
        output_tags_zh_json=["开放ai", "智能体"],
    )

    display_tags = service._display_tags_for_note(note=note, latest_summary=latest_summary, prefer_zh=True)

    assert display_tags == ["开放ai", "智能体"]


def test_display_tags_for_note_keeps_user_note_tags_when_different_from_summary() -> None:
    service = _build_service()
    note = SimpleNamespace(tags_json=["manual-tag"])
    latest_summary = SimpleNamespace(
        source_language="non-zh",
        output_tags_json=["openai", "agent"],
        key_points_json=[],
        output_tags_zh_json=["开放ai", "智能体"],
    )

    display_tags = service._display_tags_for_note(note=note, latest_summary=latest_summary, prefer_zh=True)

    assert display_tags == ["manual-tag"]


def test_matches_aggregate_tag_checks_both_original_and_translated_tags() -> None:
    service = _build_service()
    aggregate = SimpleNamespace(
        source_language="non-zh",
        tags_json=["openai"],
        tags_zh_json=["开放ai"],
    )

    assert service._matches_aggregate_tag(aggregate=aggregate, tag="openai", prefer_zh=False) is True
    assert service._matches_aggregate_tag(aggregate=aggregate, tag="开放ai", prefer_zh=False) is True
    assert service._matches_aggregate_tag(aggregate=aggregate, tag="missing", prefer_zh=False) is False


def test_normalize_tag_rejects_invalid_input() -> None:
    service = _build_service()

    with pytest.raises(HTTPException) as exc:
        service._normalize_tag("bad tag!")

    assert exc.value.status_code == 400
    assert exc.value.detail == "标签筛选格式不合法"
