from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any
import urllib.error
import urllib.request

from app.core.config import settings
from app.core.published_at import parse_datetime
from app.core.tag_utils import normalize_hashtag_list
from app.infra.network import urlopen_with_optional_proxy

TRANSIENT_HTTP_STATUS = {429, 500, 502, 503, 504}
CJK_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF]")
MAX_OUTPUT_TAGS = 5
MAX_TITLE_LENGTH = 120
MAX_SUMMARY_SHORT_LENGTH_ZH = 100
MAX_SUMMARY_LONG_LENGTH_ZH = 300
MAX_SUMMARY_SHORT_LENGTH_NON_ZH = 200
MAX_SUMMARY_LONG_LENGTH_NON_ZH = 600
ANTHROPIC_VERSION = "2023-06-01"

PROVIDER_STYLE_ALIASES = {
    "openai": "openai",
    "gemini": "gemini",
    "google": "gemini",
    "google-gemini": "gemini",
    "claude": "claude",
    "anthropic": "claude",
}

DEFAULT_BASE_URLS = {
    "openai": "https://api.openai.com",
    "gemini": "https://generativelanguage.googleapis.com",
    "claude": "https://api.anthropic.com",
}


class LLMClientError(Exception):
    def __init__(self, *, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(slots=True)
class LLMAnalysisResult:
    source_language: str
    title: str | None
    title_zh: str | None
    published_at: datetime | None
    summary_short: str
    summary_short_zh: str | None
    summary_long: str
    summary_long_zh: str | None
    tags: list[str]
    tags_zh: list[str] | None
    model_name: str | None
    input_tokens: int | None
    output_tokens: int | None
    raw_response: dict[str, Any]


class LLMClient:
    def analyze(
        self,
        *,
        source_url: str,
        source_domain: str,
        source_title: str | None,
        content: str,
        repair_mode: bool = False,
    ) -> LLMAnalysisResult:
        api_key = (settings.llm_api_key or "").strip()
        if not api_key:
            raise LLMClientError(code="llm_not_configured", message="模型 API Key 未配置")

        provider_style = self._provider_style()
        payload = self._build_payload(
            provider_style=provider_style,
            source_url=source_url,
            source_domain=source_domain,
            source_title=source_title,
            content=content,
            repair_mode=repair_mode,
        )
        response_data = self._request_with_retry(
            provider_style=provider_style,
            payload=payload,
            api_key=api_key,
        )
        return self._parse_result(provider_style=provider_style, response_data=response_data)

    def _provider_style(self) -> str:
        raw = (settings.llm_provider_name or "").strip().lower()
        normalized = raw.replace("_", "-")
        provider_style = PROVIDER_STYLE_ALIASES.get(normalized)
        if provider_style:
            return provider_style
        raise LLMClientError(
            code="llm_provider_not_supported",
            message=f"不支持的模型接口风格：{settings.llm_provider_name}",
        )

    def _build_payload(
        self,
        *,
        provider_style: str,
        source_url: str,
        source_domain: str,
        source_title: str | None,
        content: str,
        repair_mode: bool,
    ) -> dict[str, Any]:
        system_prompt = (
            "你是 Prism 的内容分析助手。"
            "请严格返回 JSON 对象，字段必须是 source_language, title, published_at, summary_short, summary_long, tags。"
            "如果 source_language=non-zh，必须同时返回 title_zh、summary_short_zh、summary_long_zh 和 tags_zh。"
            "如果 source_language=zh，title_zh、summary_short_zh、summary_long_zh、tags_zh 可选。"
            "source_language 只能是 zh 或 non-zh。"
            "summary_short: 中文不超过 100 字，英文不超过 200 字。"
            "summary_long: 中文不超过 300 字，英文不超过 600 字。"
            "published_at 可为空，格式优先使用 ISO8601。"
            "tags/tags_zh 必须是 1 到 5 个 hashtag 风格标签，输出时不要带 #，允许中文、英文、数字、下划线和中划线。"
            "不要输出 JSON 之外的任何文字。"
        )
        if repair_mode:
            system_prompt += "上一轮输出格式不合法，这一轮必须严格遵守 JSON 结构。"

        user_payload = {
            "task": "analyze_external_content",
            "source_url": source_url,
            "source_domain": source_domain,
            "source_title": source_title,
            "prompt_version": settings.llm_prompt_version,
            "content": content,
            "output_schema": {
                "source_language": "string, required, enum: zh | non-zh",
                "title": "string, optional, <=120 chars",
                "title_zh": "string, optional when zh, required when non-zh, <=120 chars",
                "published_at": "string, optional, datetime",
                "summary_short": "string, required, <=100 Chinese chars or <=200 English chars",
                "summary_long": "string, required, <=300 Chinese chars or <=600 English chars",
                "summary_short_zh": "string, optional when zh, required when non-zh, <=100 Chinese chars",
                "summary_long_zh": "string, optional when zh, required when non-zh, <=300 Chinese chars",
                "tags": "string[], required, 1~5, original-language hashtags without #",
                "tags_zh": "string[], optional when zh, required when non-zh, Chinese hashtags without #",
            },
        }

        user_payload_text = json.dumps(user_payload, ensure_ascii=False)
        if provider_style == "openai":
            return {
                "model": settings.llm_model_name,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_payload_text},
                ],
            }

        if provider_style == "gemini":
            return {
                "systemInstruction": {
                    "parts": [
                        {
                            "text": system_prompt,
                        }
                    ]
                },
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {
                                "text": user_payload_text,
                            }
                        ],
                    }
                ],
                "generationConfig": {
                    "temperature": 0.2,
                    "responseMimeType": "application/json",
                },
            }

        if provider_style == "claude":
            return {
                "model": settings.llm_model_name,
                "max_tokens": 1024,
                "temperature": 0.2,
                "system": system_prompt,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": user_payload_text,
                            }
                        ],
                    }
                ],
            }

        raise LLMClientError(code="llm_provider_not_supported", message="不支持的模型接口风格")

    def _request_with_retry(self, *, provider_style: str, payload: dict[str, Any], api_key: str) -> dict[str, Any]:
        retries = max(1, settings.llm_max_retries)
        timeout = max(1, settings.llm_timeout_seconds)
        endpoint = self._chat_endpoint(provider_style=provider_style)
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = self._request_headers(provider_style=provider_style, api_key=api_key)

        for attempt in range(1, retries + 1):
            try:
                req = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
                with urlopen_with_optional_proxy(req, timeout=timeout) as response:
                    raw = response.read()
                return json.loads(raw.decode("utf-8"))
            except urllib.error.HTTPError as exc:
                if exc.code in TRANSIENT_HTTP_STATUS and attempt < retries:
                    self._backoff(attempt)
                    continue
                raise LLMClientError(
                    code="llm_http_error",
                    message=f"模型服务请求失败（HTTP {exc.code}）",
                ) from exc
            except urllib.error.URLError as exc:
                if attempt < retries:
                    self._backoff(attempt)
                    continue
                raise LLMClientError(code="llm_network_error", message="模型服务网络异常，请稍后重试") from exc
            except TimeoutError as exc:
                if attempt < retries:
                    self._backoff(attempt)
                    continue
                raise LLMClientError(code="llm_timeout", message="模型服务请求超时，请稍后重试") from exc
            except json.JSONDecodeError as exc:
                raise LLMClientError(code="llm_invalid_response", message="模型服务响应解析失败") from exc

        raise LLMClientError(code="llm_request_failed", message="模型服务请求失败")

    def _parse_result(self, *, provider_style: str, response_data: dict[str, Any]) -> LLMAnalysisResult:
        text_content = self._extract_response_text(provider_style=provider_style, response_data=response_data)
        output = self._parse_json_content(text_content)

        source_language = self._normalize_language(
            output.get("source_language") or output.get("language"),
            fallback_text=(
                f"{output.get('title') or ''}\n"
                f"{output.get('summary_long') or output.get('summary') or output.get('summary_short') or ''}"
            ),
        )
        title = self._normalize_title(output.get("title"))
        title_zh = self._normalize_title(output.get("title_zh") or output.get("titleZh") or output.get("translated_title"))
        summary_short_max, summary_long_max = self._summary_limits_for_language(source_language)
        published_at = parse_datetime(
            self._normalize_optional_string(
                output.get("published_at") or output.get("publishedAt") or output.get("publish_time")
            )
        )
        summary_short, summary_long = self._resolve_summary_pair(
            short_text=self._normalize_summary_optional(
                output.get("summary_short")
                or output.get("summaryShort")
                or output.get("short_summary")
                or output.get("summary"),
                max_length=summary_short_max,
            ),
            long_text=self._normalize_summary_optional(
                output.get("summary_long")
                or output.get("summaryLong")
                or output.get("long_summary")
                or output.get("summary_detail")
                or output.get("summary"),
                max_length=summary_long_max,
            ),
            short_max_length=summary_short_max,
            long_max_length=summary_long_max,
        )
        summary_short_zh, summary_long_zh = self._resolve_summary_pair(
            short_text=self._normalize_summary_optional(
                output.get("summary_short_zh")
                or output.get("summaryShortZh")
                or output.get("short_summary_zh")
                or output.get("summary_zh")
                or output.get("summaryZh")
                or output.get("translated_summary"),
                max_length=MAX_SUMMARY_SHORT_LENGTH_ZH,
            ),
            long_text=self._normalize_summary_optional(
                output.get("summary_long_zh")
                or output.get("summaryLongZh")
                or output.get("long_summary_zh")
                or output.get("summary_zh")
                or output.get("summaryZh")
                or output.get("translated_summary"),
                max_length=MAX_SUMMARY_LONG_LENGTH_ZH,
            ),
            short_max_length=MAX_SUMMARY_SHORT_LENGTH_ZH,
            long_max_length=MAX_SUMMARY_LONG_LENGTH_ZH,
        )
        tags = self._normalize_tags(output.get("tags"))
        tags_zh = self._normalize_tags(
            output.get("tags_zh")
            or output.get("tagsZh")
            or output.get("translated_tags")
            or output.get("translatedTags")
        )
        if not summary_short or not summary_long:
            raise LLMClientError(code="invalid_output", message="模型输出缺少有效摘要")
        if source_language == "non-zh" and (not summary_short_zh or not summary_long_zh):
            raise LLMClientError(code="invalid_output", message="非中文内容缺少中文摘要")
        if not tags:
            raise LLMClientError(code="invalid_output", message="模型输出缺少有效标签")
        if source_language == "non-zh" and not tags_zh:
            raise LLMClientError(code="invalid_output", message="非中文内容缺少中文标签")
        if source_language == "zh":
            summary_short_zh = summary_short_zh or summary_short
            summary_long_zh = summary_long_zh or summary_long
            title_zh = title_zh or title
            tags_zh = tags_zh or tags

        model_name, input_tokens, output_tokens = self._extract_usage(
            provider_style=provider_style,
            response_data=response_data,
        )

        return LLMAnalysisResult(
            source_language=source_language,
            title=title,
            title_zh=title_zh,
            published_at=published_at,
            summary_short=summary_short,
            summary_short_zh=summary_short_zh,
            summary_long=summary_long,
            summary_long_zh=summary_long_zh,
            tags=tags,
            tags_zh=tags_zh,
            model_name=model_name,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            raw_response=response_data,
        )

    def _extract_response_text(self, *, provider_style: str, response_data: dict[str, Any]) -> str:
        if provider_style == "openai":
            choices = response_data.get("choices")
            if not isinstance(choices, list) or not choices:
                raise LLMClientError(code="invalid_output", message="模型输出为空")
            message = choices[0].get("message") if isinstance(choices[0], dict) else None
            content = message.get("content") if isinstance(message, dict) else None
            return self._extract_text_content(content)

        if provider_style == "gemini":
            candidates = response_data.get("candidates")
            if not isinstance(candidates, list) or not candidates:
                raise LLMClientError(code="invalid_output", message="模型输出为空")
            candidate = candidates[0] if isinstance(candidates[0], dict) else {}
            content = candidate.get("content") if isinstance(candidate, dict) else None
            parts = content.get("parts") if isinstance(content, dict) else None
            return self._extract_text_content(parts)

        if provider_style == "claude":
            content = response_data.get("content")
            return self._extract_text_content(content)

        raise LLMClientError(code="llm_provider_not_supported", message="不支持的模型接口风格")

    def _extract_usage(
        self,
        *,
        provider_style: str,
        response_data: dict[str, Any],
    ) -> tuple[str | None, int | None, int | None]:
        if provider_style == "openai":
            usage = response_data.get("usage", {})
            model_name = response_data.get("model")
            return (
                self._normalize_optional_string(model_name) or settings.llm_model_name,
                self._safe_int(usage.get("prompt_tokens")),
                self._safe_int(usage.get("completion_tokens")),
            )

        if provider_style == "gemini":
            usage = response_data.get("usageMetadata", {})
            model_name = self._normalize_optional_string(response_data.get("modelVersion"))
            return (
                model_name or settings.llm_model_name,
                self._safe_int(usage.get("promptTokenCount")),
                self._safe_int(usage.get("candidatesTokenCount")),
            )

        if provider_style == "claude":
            usage = response_data.get("usage", {})
            model_name = self._normalize_optional_string(response_data.get("model"))
            return (
                model_name or settings.llm_model_name,
                self._safe_int(usage.get("input_tokens")),
                self._safe_int(usage.get("output_tokens")),
            )

        return settings.llm_model_name, None, None

    def _request_headers(self, *, provider_style: str, api_key: str) -> dict[str, str]:
        if provider_style == "openai":
            return {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }

        if provider_style == "gemini":
            return {
                "x-goog-api-key": api_key,
                "Content-Type": "application/json",
            }

        if provider_style == "claude":
            return {
                "x-api-key": api_key,
                "anthropic-version": ANTHROPIC_VERSION,
                "Content-Type": "application/json",
            }

        raise LLMClientError(code="llm_provider_not_supported", message="不支持的模型接口风格")

    def _chat_endpoint(self, *, provider_style: str) -> str:
        base = (settings.llm_base_url or "").strip().rstrip("/")
        if not base:
            base = DEFAULT_BASE_URLS.get(provider_style, "")
        if not base:
            raise LLMClientError(code="llm_base_url_not_configured", message="模型服务 Base URL 未配置")

        if provider_style == "openai":
            if base.endswith("/chat/completions"):
                return base
            if base.endswith("/v1"):
                return f"{base}/chat/completions"
            return f"{base}/v1/chat/completions"

        if provider_style == "gemini":
            model_name = (settings.llm_model_name or "").strip()
            if not model_name:
                raise LLMClientError(code="llm_model_not_configured", message="模型名称未配置")
            model_path = model_name if model_name.startswith("models/") else f"models/{model_name}"
            if base.endswith("/v1") or base.endswith("/v1beta"):
                return f"{base}/{model_path}:generateContent"
            return f"{base}/v1beta/{model_path}:generateContent"

        if provider_style == "claude":
            if base.endswith("/messages"):
                return base
            if base.endswith("/v1"):
                return f"{base}/messages"
            return f"{base}/v1/messages"

        raise LLMClientError(code="llm_provider_not_supported", message="不支持的模型接口风格")

    def _extract_text_content(self, content: Any) -> str:
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            chunks: list[str] = []
            for item in content:
                if not isinstance(item, dict):
                    continue
                text = item.get("text")
                if isinstance(text, str):
                    chunks.append(text)
            return "".join(chunks).strip()
        return ""

    def _parse_json_content(self, text_content: str) -> dict[str, Any]:
        if not text_content:
            raise LLMClientError(code="invalid_output", message="模型输出为空")

        parsed = self._try_load_json(text_content)
        if parsed is not None:
            return parsed

        fenced_match = re.search(r"```(?:json)?\s*(\{[\s\S]*\})\s*```", text_content)
        if fenced_match:
            parsed = self._try_load_json(fenced_match.group(1))
            if parsed is not None:
                return parsed

        obj_match = re.search(r"\{[\s\S]*\}", text_content)
        if obj_match:
            parsed = self._try_load_json(obj_match.group(0))
            if parsed is not None:
                return parsed

        raise LLMClientError(code="invalid_output", message="模型输出不是有效 JSON")

    def _try_load_json(self, raw: str) -> dict[str, Any] | None:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(data, dict):
            return None
        return data

    def _normalize_title(self, raw: Any) -> str | None:
        if not isinstance(raw, str):
            return None
        title = raw.strip()
        if not title:
            return None
        return title[:MAX_TITLE_LENGTH]

    def _normalize_summary_optional(self, raw: Any, *, max_length: int) -> str | None:
        if not isinstance(raw, str):
            return None
        normalized = raw.strip()[:max_length]
        return normalized or None

    def _resolve_summary_pair(
        self,
        *,
        short_text: str | None,
        long_text: str | None,
        short_max_length: int,
        long_max_length: int,
    ) -> tuple[str | None, str | None]:
        short_value = self._normalize_summary_optional(short_text, max_length=short_max_length)
        long_value = self._normalize_summary_optional(long_text, max_length=long_max_length)

        if not short_value and not long_value:
            return None, None
        if not long_value:
            long_value = short_value
        if not short_value and long_value:
            short_value = self._truncate_summary_for_short(long_value, max_length=short_max_length)
        return short_value, long_value

    def _truncate_summary_for_short(self, text: str, *, max_length: int) -> str:
        normalized = text.strip()
        if len(normalized) <= max_length:
            return normalized
        return normalized[:max_length].rstrip()

    def _summary_limits_for_language(self, source_language: str) -> tuple[int, int]:
        if source_language == "zh":
            return MAX_SUMMARY_SHORT_LENGTH_ZH, MAX_SUMMARY_LONG_LENGTH_ZH
        return MAX_SUMMARY_SHORT_LENGTH_NON_ZH, MAX_SUMMARY_LONG_LENGTH_NON_ZH

    def _normalize_optional_string(self, raw: Any) -> str | None:
        if not isinstance(raw, str):
            return None
        normalized = raw.strip()
        return normalized or None

    def _normalize_language(self, raw: Any, *, fallback_text: str) -> str:
        if isinstance(raw, str):
            value = raw.strip().lower()
            if value in {"zh", "zh-cn", "zh-hans", "chinese", "cn"}:
                return "zh"
            if value in {"non-zh", "en", "en-us", "english", "other"}:
                return "non-zh"
        return self._detect_source_language(fallback_text)

    def _detect_source_language(self, text: str) -> str:
        if not text:
            return "non-zh"
        cjk_count = len(CJK_RE.findall(text))
        if cjk_count >= 8:
            return "zh"
        return "non-zh"

    def _normalize_tags(self, raw: Any) -> list[str]:
        if not isinstance(raw, list):
            return []
        return normalize_hashtag_list(raw, max_count=MAX_OUTPUT_TAGS)

    def _safe_int(self, value: Any) -> int | None:
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _backoff(self, attempt: int) -> None:
        # Backoff sequence: 1s, 2s, 4s...
        time.sleep(min(8, 2 ** max(0, attempt - 1)))
