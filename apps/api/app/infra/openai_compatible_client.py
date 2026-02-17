from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from app.core.config import settings

TRANSIENT_HTTP_STATUS = {429, 500, 502, 503, 504}
ALLOWED_TAG_RE = re.compile(r"^[a-z0-9_-]+$")
MAX_OUTPUT_TAGS = 5
MAX_TITLE_LENGTH = 120
MAX_SUMMARY_LENGTH = 400


class OpenAICompatibleClientError(Exception):
    def __init__(self, *, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(slots=True)
class OpenAICompatibleAnalysisResult:
    title: str | None
    summary: str
    tags: list[str]
    model_name: str | None
    input_tokens: int | None
    output_tokens: int | None
    raw_response: dict[str, Any]


class OpenAICompatibleClient:
    def analyze(
        self,
        *,
        source_url: str,
        source_domain: str,
        source_title: str | None,
        content: str,
        repair_mode: bool = False,
    ) -> OpenAICompatibleAnalysisResult:
        api_key = (settings.llm_api_key or "").strip()
        if not api_key:
            raise OpenAICompatibleClientError(code="llm_not_configured", message="模型 API Key 未配置")

        payload = self._build_payload(
            source_url=source_url,
            source_domain=source_domain,
            source_title=source_title,
            content=content,
            repair_mode=repair_mode,
        )
        response_data = self._request_with_retry(payload=payload, api_key=api_key)
        return self._parse_result(response_data)

    def _build_payload(
        self,
        *,
        source_url: str,
        source_domain: str,
        source_title: str | None,
        content: str,
        repair_mode: bool,
    ) -> dict[str, Any]:
        system_prompt = (
            "你是 Prism 的内容分析助手。"
            "请严格返回 JSON 对象，字段必须是 title, summary, tags。"
            "tags 必须是 1 到 5 个英文小写标签，仅允许 a-z 0-9 _ -。"
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
                "title": "string, optional, <=120 chars",
                "summary": "string, required, <=400 chars",
                "tags": "string[], required, 1~5, lowercase english tags only",
            },
        }

        return {
            "model": settings.llm_model_name,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
        }

    def _request_with_retry(self, *, payload: dict[str, Any], api_key: str) -> dict[str, Any]:
        retries = max(1, settings.llm_max_retries)
        timeout = max(1, settings.llm_timeout_seconds)
        endpoint = self._chat_endpoint()
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        for attempt in range(1, retries + 1):
            try:
                req = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=timeout) as response:
                    raw = response.read()
                return json.loads(raw.decode("utf-8"))
            except urllib.error.HTTPError as exc:
                if exc.code in TRANSIENT_HTTP_STATUS and attempt < retries:
                    self._backoff(attempt)
                    continue
                raise OpenAICompatibleClientError(
                    code="llm_http_error",
                    message=f"模型服务请求失败（HTTP {exc.code}）",
                ) from exc
            except urllib.error.URLError as exc:
                if attempt < retries:
                    self._backoff(attempt)
                    continue
                raise OpenAICompatibleClientError(code="llm_network_error", message="模型服务网络异常，请稍后重试") from exc
            except TimeoutError as exc:
                if attempt < retries:
                    self._backoff(attempt)
                    continue
                raise OpenAICompatibleClientError(code="llm_timeout", message="模型服务请求超时，请稍后重试") from exc
            except json.JSONDecodeError as exc:
                raise OpenAICompatibleClientError(code="llm_invalid_response", message="模型服务响应解析失败") from exc

        raise OpenAICompatibleClientError(code="llm_request_failed", message="模型服务请求失败")

    def _parse_result(self, response_data: dict[str, Any]) -> OpenAICompatibleAnalysisResult:
        choices = response_data.get("choices")
        if not isinstance(choices, list) or not choices:
            raise OpenAICompatibleClientError(code="invalid_output", message="模型输出为空")

        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        text_content = self._extract_text_content(content)
        output = self._parse_json_content(text_content)

        title = self._normalize_title(output.get("title"))
        summary = self._normalize_summary(output.get("summary"))
        tags = self._normalize_tags(output.get("tags"))
        if not summary:
            raise OpenAICompatibleClientError(code="invalid_output", message="模型输出缺少有效摘要")
        if not tags:
            raise OpenAICompatibleClientError(code="invalid_output", message="模型输出缺少有效标签")

        usage = response_data.get("usage", {})
        input_tokens = self._safe_int(usage.get("prompt_tokens"))
        output_tokens = self._safe_int(usage.get("completion_tokens"))
        model_name = response_data.get("model")
        if not isinstance(model_name, str) or not model_name.strip():
            model_name = settings.llm_model_name

        return OpenAICompatibleAnalysisResult(
            title=title,
            summary=summary,
            tags=tags,
            model_name=model_name,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            raw_response=response_data,
        )

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
            raise OpenAICompatibleClientError(code="invalid_output", message="模型输出为空")

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

        raise OpenAICompatibleClientError(code="invalid_output", message="模型输出不是有效 JSON")

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

    def _normalize_summary(self, raw: Any) -> str:
        if not isinstance(raw, str):
            return ""
        return raw.strip()[:MAX_SUMMARY_LENGTH]

    def _normalize_tags(self, raw: Any) -> list[str]:
        if not isinstance(raw, list):
            return []
        tags: list[str] = []
        seen: set[str] = set()
        for item in raw:
            if not isinstance(item, str):
                continue
            tag = item.strip().lower()
            if not tag or tag in seen:
                continue
            if not ALLOWED_TAG_RE.fullmatch(tag):
                continue
            seen.add(tag)
            tags.append(tag)
            if len(tags) >= MAX_OUTPUT_TAGS:
                break
        return tags

    def _safe_int(self, value: Any) -> int | None:
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _chat_endpoint(self) -> str:
        base = (settings.llm_base_url or "").strip().rstrip("/")
        if not base:
            raise OpenAICompatibleClientError(code="llm_base_url_not_configured", message="模型服务 Base URL 未配置")
        if base.endswith("/v1"):
            return f"{base}/chat/completions"
        return f"{base}/v1/chat/completions"

    def _backoff(self, attempt: int) -> None:
        # Backoff sequence: 1s, 2s, 4s...
        time.sleep(min(8, 2 ** max(0, attempt - 1)))
