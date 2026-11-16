"""Groq client (OpenAI-compatible REST API) used by every AI feature. Docs: https://console.groq.com/docs"""

import json
import logging
from typing import Any, Literal, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from ..config import get_settings
from ..errors import AppError
from ..retry import with_retry

BASE_URL = "https://api.groq.com/openai/v1"
TIMEOUT = httpx.Timeout(120.0, connect=10.0)

#: gpt-oss-120b has a 131k-token context window; leave room for the response.
MAX_INPUT_CHARS = 320_000

M = TypeVar("M", bound=BaseModel)

logger = logging.getLogger("study_mate.groq")


def _api_key() -> str:
    key = get_settings().groq_api_key
    if not key:
        raise AppError("CONFIGURATION_ERROR", 500, "AI features aren't set up on this server yet.", detail="GROQ_API_KEY is not set")
    return key


def _post(path: str, **kwargs: Any) -> httpx.Response:
    try:
        response = httpx.post(f"{BASE_URL}{path}", headers={"Authorization": f"Bearer {_api_key()}"}, timeout=TIMEOUT, **kwargs)
    except httpx.HTTPError as err:
        raise AppError("AI_FAILED", 502, "Couldn't reach the AI service.", retryable=True, detail=repr(err)) from err

    if response.is_success:
        return response

    status = response.status_code
    detail = f"Groq {status}: {response.text[:500]}"
    logger.warning("%s", detail)
    retry_after = _float(response.headers.get("retry-after"))
    if status == 413:
        # Request exceeds the plan's tokens-per-minute limit (free tier: 8,000).
        raise AppError("INPUT_TOO_LARGE", 413, "This material is too long to process in one go. Try a single chapter or fewer pages.", detail=detail)
    if status == 429:
        raise AppError("BUSY", 429, "The AI is busy right now. Try again in a moment.", retryable=True, retry_after=retry_after, detail=detail)
    raise AppError("AI_FAILED", 502, "The AI service couldn't respond. Please try again.", retryable=status >= 500, detail=detail)


def _float(value: str | None) -> float | None:
    try:
        return float(value) if value else None
    except ValueError:
        return None


def _strict_schema(model: type[BaseModel]) -> dict[str, Any]:
    """Pydantic JSON schema adapted for Groq strict mode (all fields required, no extra keys, no titles)."""

    def clean(node: Any) -> Any:
        if isinstance(node, dict):
            node = {k: clean(v) for k, v in node.items() if k not in ("title", "default")}
            if node.get("type") == "object":
                node["additionalProperties"] = False
                node["required"] = list(node.get("properties", {}).keys())
            return node
        if isinstance(node, list):
            return [clean(v) for v in node]
        return node

    return clean(model.model_json_schema())


#: Smallest response allowance worth sending; below this the answer would be cut off anyway.
MIN_COMPLETION_TOKENS = 1_500


def _completion_budget(system: str, user: str, wanted: int) -> int:
    """Groq counts input + max_completion_tokens against the plan's tokens-per-minute limit for every
    request (free tier: 8,000), so shrink the allowance to fit. GROQ_TPM_LIMIT=0 means no limit."""
    limit = get_settings().groq_tpm_limit
    if not limit:
        return wanted
    # ~3.5 characters per token, plus a margin for message formatting and the JSON schema.
    input_tokens = (len(system) + len(user)) / 3.5 + 300
    available = int(limit - input_tokens)
    if available < MIN_COMPLETION_TOKENS:
        raise AppError(
            "INPUT_TOO_LARGE",
            413,
            "This material is too long to process in one go. Try a single chapter or fewer pages.",
            detail=f"~{int(input_tokens)} input tokens leaves {available} of the {limit}-token limit",
        )
    return min(wanted, available)


def _chat(system: str, user: str, *, max_tokens: int, effort: str, response_format: dict | None = None) -> str:
    schema_chars = len(json.dumps(response_format)) if response_format else 0
    body: dict[str, Any] = {
        "model": get_settings().groq_model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_completion_tokens": _completion_budget(system, user + " " * schema_chars, max_tokens),
        "reasoning_effort": effort,
    }
    if response_format:
        body["response_format"] = response_format

    data = with_retry(lambda: _post("/chat/completions", json=body)).json()
    choice = (data.get("choices") or [None])[0]
    if not choice:
        raise AppError("INVALID_OUTPUT", 502, "The AI returned an empty response. Please try again.")
    if choice.get("finish_reason") == "length":
        raise AppError("TRUNCATED", 502, "The AI's response was cut off. Try a shorter length or fewer pages.")
    return (choice.get("message") or {}).get("content") or ""


Effort = Literal["low", "medium", "high"]


def groq_text(system: str, user: str, *, max_tokens: int = 4_000, effort: Effort = "medium") -> str:
    """Plain-text completion."""
    return _chat(system, user, max_tokens=max_tokens, effort=effort).strip()


def groq_json(system: str, user: str, model: type[M], *, name: str, max_tokens: int = 16_000, effort: Effort = "medium") -> M:
    """Completion constrained to a Pydantic model via Groq strict structured outputs, then validated."""
    content = _chat(
        system,
        user,
        max_tokens=max_tokens,
        effort=effort,
        response_format={"type": "json_schema", "json_schema": {"name": name, "strict": True, "schema": _strict_schema(model)}},
    )
    try:
        return model.model_validate(json.loads(content))
    except (json.JSONDecodeError, ValidationError) as err:
        raise AppError("INVALID_OUTPUT", 502, "The AI's response was incomplete. Please try again.", detail=repr(err)) from err


def groq_transcribe(audio: bytes, filename: str, *, prompt: str | None = None) -> str:
    """Speech to text with Groq Whisper."""
    data = {"model": get_settings().groq_whisper_model, "response_format": "json"}
    if prompt:
        data["prompt"] = prompt[:400]  # Whisper prompts are capped at 224 tokens
    response = with_retry(lambda: _post("/audio/transcriptions", data=data, files={"file": (filename, audio)}), attempts=3)
    text = response.json().get("text")
    return text.strip() if isinstance(text, str) else ""
