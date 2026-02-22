from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services.feed_service import FeedService


def _build_service() -> FeedService:
    service = FeedService.__new__(FeedService)
    return service


def test_display_tags_for_note_prefers_user_tags_when_present() -> None:
    service = _build_service()
    note = SimpleNamespace(tags_json=["openai", "agent"])
    latest_summary = SimpleNamespace(
        source_language="non-zh",
        output_tags_json=["openai", "agent"],
        output_tags_zh_json=["开放ai", "智能体"],
    )

    display_tags = service._display_tags_for_note(note=note, latest_summary=latest_summary, prefer_zh=True)

    assert display_tags == ["openai", "agent"]


def test_display_tags_for_note_keeps_user_note_tags_when_different_from_summary() -> None:
    service = _build_service()
    note = SimpleNamespace(tags_json=["manual-tag"])
    latest_summary = SimpleNamespace(
        source_language="non-zh",
        output_tags_json=["openai", "agent"],
        output_tags_zh_json=["开放ai", "智能体"],
    )

    display_tags = service._display_tags_for_note(note=note, latest_summary=latest_summary, prefer_zh=True)

    assert display_tags == ["manual-tag"]


def test_display_tags_for_note_falls_back_to_auto_tags_when_user_tags_absent() -> None:
    service = _build_service()
    note = SimpleNamespace(tags_json=[])
    latest_summary = SimpleNamespace(
        source_language="non-zh",
        output_tags_json=["openai", "agent"],
        output_tags_zh_json=["开放ai", "智能体"],
    )

    display_tags = service._display_tags_for_note(note=note, latest_summary=latest_summary, prefer_zh=True)

    assert display_tags == ["开放ai", "智能体"]


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


def test_get_creator_profile_rejects_empty_creator_id() -> None:
    service = _build_service()
    service.db = MagicMock()
    current_user = SimpleNamespace(id=uuid4())

    with pytest.raises(HTTPException) as exc:
        service.get_creator_profile(user=current_user, creator_kind="user", creator_id="   ")

    assert exc.value.status_code == 400
    assert exc.value.detail == "创作者标识不能为空"


def test_get_creator_profile_returns_user_profile() -> None:
    service = _build_service()
    service.db = MagicMock()
    current_user = SimpleNamespace(id=uuid4())
    target_user = SimpleNamespace(id=uuid4(), user_id="alice", nickname="Alice")
    service.db.scalar.side_effect = [
        target_user,  # target user
        9,  # follower count
        3,  # content count
        object(),  # following row exists
    ]

    profile = service.get_creator_profile(user=current_user, creator_kind="user", creator_id="alice")

    assert profile.creator_kind == "user"
    assert profile.creator_id == "alice"
    assert profile.display_name == "Alice"
    assert profile.follower_count == 9
    assert profile.content_count == 3
    assert profile.following is True
    assert profile.can_follow is True


def test_list_feed_orders_notes_by_updated_at_and_aggregates_by_published_at() -> None:
    service = _build_service()
    service.db = MagicMock()
    service.note_repo = MagicMock()

    current_user = SimpleNamespace(id=uuid4(), ui_language="zh-CN")
    note_creator = SimpleNamespace(user_id="alice", nickname="Alice")
    source_creator = SimpleNamespace(slug="openai", display_name="OpenAI")

    note_with_old_published = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        user=note_creator,
        source_title="old published",
        source_url_normalized="https://example.com/old",
        source_domain="example.com",
        note_body_md="",
        updated_at=datetime(2026, 2, 22, 0, 0, tzinfo=timezone.utc),
    )
    note_without_published = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        user=note_creator,
        source_title="fallback updated",
        source_url_normalized="https://example.com/fallback",
        source_domain="example.com",
        note_body_md="",
        updated_at=datetime(2026, 2, 21, 0, 0, tzinfo=timezone.utc),
    )
    aggregate = SimpleNamespace(
        id=uuid4(),
        source_creator_id=uuid4(),
        source_creator=source_creator,
        source_url_normalized="https://openai.com/research",
        source_domain="openai.com",
        source_title="aggregate item",
        source_title_zh=None,
        source_language="non-zh",
        tags_json=[],
        tags_zh_json=[],
        analysis_status="succeeded",
        summary_text="summary",
        summary_text_zh=None,
        published_at=datetime(2026, 2, 20, 0, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 2, 19, 0, 0, tzinfo=timezone.utc),
    )

    service._load_following_sets = MagicMock(return_value=(set(), set()))
    service._load_public_notes = MagicMock(return_value=[note_with_old_published, note_without_published])
    service._load_latest_note_summaries = MagicMock(
        return_value={
            note_with_old_published.id: SimpleNamespace(
                published_at=datetime(2026, 2, 10, 0, 0, tzinfo=timezone.utc),
            )
        }
    )
    service._load_aggregate_items = MagicMock(return_value=[aggregate])
    service._build_items_for_records = MagicMock(return_value=[])

    service.list_feed(
        user=current_user,
        scope="all",
        tag=None,
        keyword=None,
        offset=0,
        limit=10,
    )

    records = service._build_items_for_records.call_args.kwargs["records"]

    assert [(kind, item.id) for kind, item in records] == [
        ("note", note_with_old_published.id),
        ("note", note_without_published.id),
        ("aggregate", aggregate.id),
    ]


def test_list_feed_deduplicates_items_by_normalized_source_url() -> None:
    service = _build_service()
    service.db = MagicMock()
    service.note_repo = MagicMock()

    current_user = SimpleNamespace(id=uuid4(), ui_language="zh-CN")
    note_creator = SimpleNamespace(user_id="alice", nickname="Alice")
    source_creator = SimpleNamespace(slug="openai", display_name="OpenAI")
    shared_url = "https://example.com/shared"

    note = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        user=note_creator,
        source_title="note",
        source_url_normalized=shared_url,
        source_domain="example.com",
        note_body_md="",
        updated_at=datetime(2026, 2, 22, 0, 0, tzinfo=timezone.utc),
    )
    aggregate_same_url = SimpleNamespace(
        id=uuid4(),
        source_creator_id=uuid4(),
        source_creator=source_creator,
        source_url_normalized=shared_url,
        source_domain="example.com",
        source_title="aggregate",
        source_title_zh=None,
        source_language="non-zh",
        tags_json=[],
        tags_zh_json=[],
        analysis_status="succeeded",
        summary_text="summary",
        summary_text_zh=None,
        published_at=datetime(2026, 2, 21, 0, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 2, 21, 0, 0, tzinfo=timezone.utc),
    )
    aggregate_other_url = SimpleNamespace(
        id=uuid4(),
        source_creator_id=uuid4(),
        source_creator=source_creator,
        source_url_normalized="https://example.com/other",
        source_domain="example.com",
        source_title="aggregate other",
        source_title_zh=None,
        source_language="non-zh",
        tags_json=[],
        tags_zh_json=[],
        analysis_status="succeeded",
        summary_text="summary",
        summary_text_zh=None,
        published_at=datetime(2026, 2, 20, 0, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 2, 20, 0, 0, tzinfo=timezone.utc),
    )

    service._load_following_sets = MagicMock(return_value=(set(), set()))
    service._load_public_notes = MagicMock(return_value=[note])
    service._load_latest_note_summaries = MagicMock(return_value={note.id: None})
    service._load_aggregate_items = MagicMock(return_value=[aggregate_same_url, aggregate_other_url])
    service._build_items_for_records = MagicMock(return_value=[])

    service.list_feed(
        user=current_user,
        scope="all",
        tag=None,
        keyword=None,
        offset=0,
        limit=10,
    )

    records = service._build_items_for_records.call_args.kwargs["records"]

    assert [(kind, item.id) for kind, item in records] == [
        ("note", note.id),
        ("aggregate", aggregate_other_url.id),
    ]
