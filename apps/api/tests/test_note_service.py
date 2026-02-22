from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import MagicMock

from app.core.config import settings
from app.services.note_service import AnalysisError, NoteService, SourceAnalysis


def _build_service() -> NoteService:
    service = NoteService.__new__(NoteService)
    service.db = MagicMock()
    service.note_repo = MagicMock()
    return service


def test_run_analysis_job_success_updates_note_and_creates_summary() -> None:
    service = _build_service()
    note_id = uuid4()
    note = SimpleNamespace(
        id=note_id,
        analysis_status="pending",
        analysis_error="old error",
        source_title=None,
        source_url="https://example.com/post",
        source_domain="example.com",
        tags_json=[],
    )
    service.note_repo.get_by_id.side_effect = [note, note]
    service._analyze_source = MagicMock(
        return_value=SourceAnalysis(
            source_language="non-zh",
            title="OpenAI update",
            title_zh="OpenAI 更新",
            published_at=datetime(2026, 2, 19, tzinfo=timezone.utc),
            summary_short_text="short summary",
            summary_short_text_zh="中文短摘要",
            summary_long_text="long summary",
            summary_long_text_zh="中文长摘要",
            tags=["openai", "agent"],
            tags_zh=["开放ai", "智能体"],
            model_provider="openai",
            model_name="gpt-4o-mini",
            model_version=None,
            prompt_version="v1",
            input_tokens=20,
            output_tokens=10,
            raw_response_json={"ok": True},
        )
    )

    service.run_analysis_job(note_id=note_id)

    assert note.analysis_status == "succeeded"
    assert note.analysis_error is None
    assert note.source_title == "OpenAI update"
    assert note.tags_json == ["openai", "agent"]
    assert service.db.commit.call_count == 2
    service.note_repo.create_summary.assert_called_once()
    kwargs = service.note_repo.create_summary.call_args.kwargs
    assert kwargs["status"] == "succeeded"
    assert kwargs["output_summary"] == "short summary"
    assert kwargs["summary_text"] == "long summary"
    assert kwargs["output_tags_zh"] == ["开放ai", "智能体"]


def test_run_analysis_job_routes_analysis_error_to_failed_marker() -> None:
    service = _build_service()
    note_id = uuid4()
    note = SimpleNamespace(id=note_id, analysis_status="pending", analysis_error=None)
    service.note_repo.get_by_id.return_value = note
    service._analyze_source = MagicMock(side_effect=AnalysisError(code="empty_content", message="来源内容为空"))
    service._mark_analysis_failed = MagicMock()

    service.run_analysis_job(note_id=note_id)

    service._mark_analysis_failed.assert_called_once_with(
        note_id=note_id,
        error_code="empty_content",
        error_message="来源内容为空",
        error_stage="content_fetch",
        error_class="AnalysisError",
        retryable=False,
        elapsed_ms=0,
    )


def test_mark_analysis_failed_rolls_back_and_writes_failed_summary() -> None:
    service = _build_service()
    note_id = uuid4()
    note = SimpleNamespace(id=note_id, analysis_status="running", analysis_error=None)
    service.note_repo.get_by_id.return_value = note

    service._mark_analysis_failed(
        note_id=note_id,
        error_code="analysis_error",
        error_message="x" * 600,
        error_stage="unknown",
        error_class="RuntimeError",
        retryable=True,
        elapsed_ms=1234,
    )

    service.db.rollback.assert_called_once()
    service.db.commit.assert_called_once()
    assert note.analysis_status == "failed"
    assert len(note.analysis_error) == 500
    summary_kwargs = service.note_repo.create_summary.call_args.kwargs
    assert summary_kwargs["status"] == "failed"
    assert summary_kwargs["error_code"] == "analysis_error"
    assert summary_kwargs["error_message"] == note.analysis_error
    assert summary_kwargs["error_stage"] == "unknown"
    assert summary_kwargs["error_class"] == "RuntimeError"
    assert summary_kwargs["retryable"] is True
    assert summary_kwargs["elapsed_ms"] == 1234
    assert summary_kwargs["prompt_version"] == settings.llm_prompt_version


def test_run_analysis_job_skips_non_pending_note() -> None:
    service = _build_service()
    note_id = uuid4()
    note = SimpleNamespace(id=note_id, analysis_status="running", analysis_error=None)
    service.note_repo.get_by_id.return_value = note
    service._analyze_source = MagicMock()

    service.run_analysis_job(note_id=note_id)

    service._analyze_source.assert_not_called()
    service.db.commit.assert_not_called()


def test_build_note_summary_excerpt_combines_ai_and_note_text() -> None:
    service = _build_service()
    excerpt = service._build_note_summary_excerpt(
        auto_summary_excerpt="AI 总结",
        note_body_excerpt="用户学习心得",
    )

    assert excerpt == "AI: AI 总结 | 心得: 用户学习心得"


def test_build_note_summary_excerpt_returns_none_when_empty() -> None:
    service = _build_service()
    excerpt = service._build_note_summary_excerpt(
        auto_summary_excerpt=None,
        note_body_excerpt=None,
    )

    assert excerpt is None
