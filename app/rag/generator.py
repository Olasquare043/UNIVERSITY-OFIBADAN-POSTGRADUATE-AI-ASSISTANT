"""Calls the configured LLM to turn retrieved context into a final answer.

Any OpenAI-compatible service works (Groq, OpenRouter, a local Ollama server, ...). Which
providers and models exist, and which is the default and the fallback, is set by an admin
(see app/services/settings.py).

Groq's free tier allows roughly 8,000 tokens per minute per model, and one answer uses
about 3,000. A provider can therefore carry a "tokens_per_minute" budget: extra requests
wait (or move to the fallback model, which has its own quota) instead of failing with a
429 error. Providers without a budget, such as a local model, are never held back.
"""
import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable, Iterator
from dataclasses import dataclass

from openai import APIConnectionError, APIStatusError, OpenAI, RateLimitError

from app.services import settings
from app.services.providers import make_http_client, safe_api_key

CHARS_PER_TOKEN = 3
MAX_ATTEMPTS = 6
MAX_WAIT_SECONDS = 30
BUDGET_MARGIN = 0.875  # keep 12.5% below the provider's stated limit

_clients: dict[tuple[str, str], OpenAI] = {}
_lock = threading.Lock()
_usage: dict[str, deque] = defaultdict(deque)  # model -> (timestamp, tokens) in the last minute


@dataclass
class ModelRef:
    id: str
    base_url: str
    api_key: str
    tokens_per_minute: int | None


def resolve_models(requested: str | None = None, use_fallback: bool = True) -> list[ModelRef]:
    """The model to try first (requested or the default), then the fallback."""
    configured = {m["id"]: m for m in settings.get("models")}
    providers = {p["id"]: p for p in settings.get("providers")}
    wanted = [requested or settings.get("default_model")]
    if use_fallback:
        wanted.append(settings.get("fallback_model"))

    refs = []
    for model_id in dict.fromkeys(wanted):
        model = configured.get(model_id)
        if model:
            provider = providers.get(model["provider"])
        else:  # a model named in code (the eval judge) rather than configured: use the first provider
            provider = next(iter(providers.values()), None) if model_id == requested else None
        if provider:
            refs.append(
                ModelRef(
                    id=model_id,
                    base_url=provider["base_url"],
                    api_key=safe_api_key(provider.get("api_key_env") or "") or "not-needed",
                    tokens_per_minute=provider.get("tokens_per_minute"),
                )
            )
    if not refs:
        raise RuntimeError("No usable model is configured. An admin must set a default model.")
    return refs


def _client(ref: ModelRef) -> OpenAI:
    key = (ref.base_url, ref.api_key)
    if key not in _clients:
        _clients[key] = OpenAI(base_url=ref.base_url, api_key=ref.api_key, max_retries=0, http_client=make_http_client())
    return _clients[key]


def generate_answer(
    messages: list[dict],
    model: str | None = None,
    max_tokens: int | None = None,
    reasoning_effort: str = "low",
    use_fallback: bool = True,
) -> str:
    """max_tokens also covers the model's reasoning, so keep it generous but not huge."""
    max_tokens = max_tokens or settings.get("max_tokens")
    models = resolve_models(model, use_fallback)
    needed = sum(len(m["content"]) for m in messages) // CHARS_PER_TOKEN + max_tokens // 2

    for attempt in range(MAX_ATTEMPTS):
        ref = _reserve_model(models, needed)
        try:
            response = _client(ref).chat.completions.create(
                model=ref.id,
                messages=messages,
                temperature=settings.get("temperature"),
                max_tokens=max_tokens,
                **_reasoning_options(ref, reasoning_effort),
            )
        except RateLimitError as error:
            _record(ref, _budget(ref))  # the provider says this model is full right now
            time.sleep(_retry_delay(error, attempt))
            continue
        except (APIConnectionError, APIStatusError) as error:
            if not _can_try_another(models, ref, error):
                raise
            models = [m for m in models if m.id != ref.id]
            continue
        used = response.usage.total_tokens if response.usage else needed
        _record(ref, used - needed)
        return (response.choices[0].message.content or "").strip()

    raise RuntimeError("The model is busy (rate limit). Please try again in a minute.")


def stream_answer(
    messages: list[dict],
    model: str | None = None,
    max_tokens: int | None = None,
    reasoning_effort: str = "low",
    on_model: Callable[[str], None] | None = None,
) -> Iterator[str]:
    """Yield the answer text piece by piece as the model produces it."""
    max_tokens = max_tokens or settings.get("max_tokens")
    models = resolve_models(model)
    prompt_tokens = sum(len(m["content"]) for m in messages) // CHARS_PER_TOKEN
    needed = prompt_tokens + max_tokens // 2

    for attempt in range(MAX_ATTEMPTS):
        ref = _reserve_model(models, needed)
        try:
            stream = _client(ref).chat.completions.create(
                model=ref.id,
                messages=messages,
                temperature=settings.get("temperature"),
                max_tokens=max_tokens,
                stream=True,
                **_reasoning_options(ref, reasoning_effort),
            )
        except RateLimitError as error:
            _record(ref, _budget(ref))
            time.sleep(_retry_delay(error, attempt))
            continue
        except (APIConnectionError, APIStatusError) as error:
            if not _can_try_another(models, ref, error):
                raise
            models = [m for m in models if m.id != ref.id]
            continue

        if on_model:
            on_model(ref.id)
        written_chars = 0
        for chunk in stream:
            text = chunk.choices[0].delta.content if chunk.choices else None
            if text:
                written_chars += len(text)
                yield text
        _record(ref, prompt_tokens + written_chars // CHARS_PER_TOKEN + 300 - needed)
        return

    raise RuntimeError("The model is busy (rate limit). Please try again in a minute.")


def _can_try_another(models: list[ModelRef], failed: ModelRef, error: Exception) -> bool:
    """A model that is down, missing or erroring on the server side can be replaced by the fallback."""
    server_side = isinstance(error, APIConnectionError) or getattr(error, "status_code", 0) in (404, 500, 502, 503)
    return server_side and any(m.id != failed.id for m in models)


def _reasoning_options(ref: ModelRef, effort: str) -> dict:
    if "groq" not in ref.base_url:
        return {}
    if "gpt-oss" in ref.id:
        return {"reasoning_effort": effort}
    if "qwen" in ref.id:
        return {"reasoning_effort": "none"}  # Qwen "thinks" for thousands of hidden tokens otherwise
    return {}


def _budget(ref: ModelRef) -> int:
    return int((ref.tokens_per_minute or 0) * BUDGET_MARGIN)


def _reserve_model(models: list[ModelRef], needed: int) -> ModelRef:
    """Pick the first model with room in its minute budget, waiting if all are full."""
    deadline = time.monotonic() + 90
    while True:
        with _lock:
            for ref in models:
                if not ref.tokens_per_minute:
                    return ref  # no budget to protect
                if _tokens_used(ref.id) + needed <= _budget(ref) or not _usage[ref.id]:
                    _usage[ref.id].append((time.monotonic(), needed))
                    return ref
        if time.monotonic() > deadline:
            return models[0]
        time.sleep(1)


def _tokens_used(model: str) -> int:
    window = _usage[model]
    while window and time.monotonic() - window[0][0] > 60:
        window.popleft()
    return sum(tokens for _, tokens in window)


def _record(ref: ModelRef, correction: int) -> None:
    """Adjust the reservation to the real usage (correction = actual - estimated)."""
    if not ref.tokens_per_minute:
        return
    with _lock:
        if _usage[ref.id]:
            timestamp, tokens = _usage[ref.id].pop()
            _usage[ref.id].append((timestamp, max(tokens + correction, 0)))


def _retry_delay(error: RateLimitError, attempt: int) -> float:
    retry_after = error.response.headers.get("retry-after")
    try:
        return min(float(retry_after), MAX_WAIT_SECONDS)
    except (TypeError, ValueError):
        return min(5 * (attempt + 1), MAX_WAIT_SECONDS)
