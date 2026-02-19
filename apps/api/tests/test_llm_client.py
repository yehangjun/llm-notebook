import json

import pytest

from app.core.config import settings
from app.infra.llm_client import LLMClient, LLMClientError


@pytest.fixture
def llm_client() -> LLMClient:
    return LLMClient()


@pytest.mark.parametrize(
    ("provider_name", "expected"),
    [
        ("openai", "openai"),
        ("google-gemini", "gemini"),
        ("anthropic", "claude"),
    ],
)
def test_provider_style_aliases(
    llm_client: LLMClient,
    monkeypatch: pytest.MonkeyPatch,
    provider_name: str,
    expected: str,
) -> None:
    monkeypatch.setattr(settings, "llm_provider_name", provider_name)

    assert llm_client._provider_style() == expected


def test_provider_style_rejects_unknown_provider(
    llm_client: LLMClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "llm_provider_name", "unknown-provider")

    with pytest.raises(LLMClientError) as exc:
        llm_client._provider_style()

    assert exc.value.code == "llm_provider_not_supported"


@pytest.mark.parametrize(
    ("provider_style", "base_url", "model_name", "expected"),
    [
        ("openai", None, "gpt-4o-mini", "https://api.openai.com/v1/chat/completions"),
        ("openai", "https://proxy.example.com/v1", "gpt-4o-mini", "https://proxy.example.com/v1/chat/completions"),
        (
            "gemini",
            "https://generativelanguage.googleapis.com/v1beta",
            "gemini-2.0-flash",
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        ),
        (
            "claude",
            "https://api.anthropic.com/v1",
            "claude-sonnet-4-20250514",
            "https://api.anthropic.com/v1/messages",
        ),
    ],
)
def test_chat_endpoint_for_each_provider(
    llm_client: LLMClient,
    monkeypatch: pytest.MonkeyPatch,
    provider_style: str,
    base_url: str | None,
    model_name: str,
    expected: str,
) -> None:
    monkeypatch.setattr(settings, "llm_base_url", base_url)
    monkeypatch.setattr(settings, "llm_model_name", model_name)

    assert llm_client._chat_endpoint(provider_style=provider_style) == expected


@pytest.mark.parametrize(
    ("provider_style", "expected_header_key"),
    [
        ("openai", "Authorization"),
        ("gemini", "x-goog-api-key"),
        ("claude", "x-api-key"),
    ],
)
def test_request_headers_use_provider_specific_auth(
    llm_client: LLMClient,
    provider_style: str,
    expected_header_key: str,
) -> None:
    headers = llm_client._request_headers(provider_style=provider_style, api_key="k-test")

    assert headers[expected_header_key]
    assert headers["Content-Type"] == "application/json"


def test_parse_result_for_zh_falls_back_to_zh_fields(
    llm_client: LLMClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "llm_model_name", "gpt-4o-mini")
    response_data = {
        "choices": [
            {
                "message": {
                    "content": json.dumps(
                        {
                            "source_language": "zh",
                            "title": "中文标题",
                            "summary": "中文摘要",
                            "tags": ["大模型", "智能体"],
                        },
                        ensure_ascii=False,
                    )
                }
            }
        ],
        "model": "gpt-4o-mini",
        "usage": {"prompt_tokens": 12, "completion_tokens": 6},
    }

    result = llm_client._parse_result(provider_style="openai", response_data=response_data)

    assert result.source_language == "zh"
    assert result.summary_zh == "中文摘要"
    assert result.tags_zh == ["大模型", "智能体"]


def test_parse_result_for_non_zh_requires_zh_tags(
    llm_client: LLMClient,
) -> None:
    response_data = {
        "choices": [
            {
                "message": {
                    "content": json.dumps(
                        {
                            "source_language": "non-zh",
                            "title": "OpenAI update",
                            "summary": "A short summary",
                            "summary_zh": "中文摘要",
                            "tags": ["openai", "agent"],
                        }
                    )
                }
            }
        ],
        "usage": {"prompt_tokens": 12, "completion_tokens": 6},
    }

    with pytest.raises(LLMClientError) as exc:
        llm_client._parse_result(provider_style="openai", response_data=response_data)

    assert exc.value.code == "invalid_output"
    assert "中文标签" in exc.value.message


def test_parse_json_content_supports_markdown_fenced_json(llm_client: LLMClient) -> None:
    text = """
    Here is the result:
    ```json
    {"summary": "ok", "tags": ["openai"]}
    ```
    """

    parsed = llm_client._parse_json_content(text)

    assert parsed == {"summary": "ok", "tags": ["openai"]}
