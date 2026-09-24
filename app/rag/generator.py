"""Calls the Groq-hosted LLM to turn retrieved context into a final answer.

Groq's free tier allows roughly 8,000 tokens per minute per model, and one answer
uses about 3,000. A small token budget per model makes extra requests wait (or move
to the fallback model, which has its own quota) instead of failing with a 429 error.
"""
import threading
import time
from collections import defaultdict, deque
from collections.abc import Iterator

from groq import Groq, RateLimitError

from app import config

TOKENS_PER_MINUTE = 7000  # Groq allows 8000; keep a margin
CHARS_PER_TOKEN = 3
MAX_ATTEMPTS = 6
MAX_WAIT_SECONDS = 30

_client: Groq | None = None
_lock = threading.Lock()
_usage: dict[str, deque] = defaultdict(deque)  # model -> (timestamp, tokens) in the last minute


def _get_client() -> Groq:
    global _client
    if _client is None:
        if not config.GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not set. Add it to your .env file.")
        _client = Groq(api_key=config.GROQ_API_KEY)
    return _client


def generate_answer(
    messages: list[dict],
    model: str | None = None,
    max_tokens: int = 1200,
    reasoning_effort: str = "low",
) -> str:
    """max_tokens also covers the model's reasoning, so keep it generous but not huge."""
    models = [model] if model else [config.GROQ_MODEL, config.GROQ_FALLBACK_MODEL]
    needed = sum(len(m["content"]) for m in messages) // CHARS_PER_TOKEN + max_tokens // 2

    for attempt in range(MAX_ATTEMPTS):
        model_name = _reserve_model(models, needed)
        options = _reasoning_options(model_name, reasoning_effort)
        try:
            response = _get_client().chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.2,
                max_tokens=max_tokens,
                **options,
            )
        except RateLimitError as error:
            _record(model_name, TOKENS_PER_MINUTE)  # Groq says this model is full right now
            time.sleep(_retry_delay(error, attempt))
            continue
        _record(model_name, response.usage.total_tokens - needed)
        return (response.choices[0].message.content or "").strip()

    raise RuntimeError("Groq rate limit exceeded after several retries")


def stream_answer(
    messages: list[dict],
    max_tokens: int = 1200,
    reasoning_effort: str = "low",
) -> Iterator[str]:
    """Yield the answer text piece by piece as the model produces it."""
    models = [config.GROQ_MODEL, config.GROQ_FALLBACK_MODEL]
    prompt_tokens = sum(len(m["content"]) for m in messages) // CHARS_PER_TOKEN
    needed = prompt_tokens + max_tokens // 2

    for attempt in range(MAX_ATTEMPTS):
        model_name = _reserve_model(models, needed)
        options = _reasoning_options(model_name, reasoning_effort)
        try:
            stream = _get_client().chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.2,
                max_tokens=max_tokens,
                stream=True,
                **options,
            )
        except RateLimitError as error:
            _record(model_name, TOKENS_PER_MINUTE)
            time.sleep(_retry_delay(error, attempt))
            continue

        written_chars = 0
        for chunk in stream:
            text = chunk.choices[0].delta.content if chunk.choices else None
            if text:
                written_chars += len(text)
                yield text
        _record(model_name, prompt_tokens + written_chars // CHARS_PER_TOKEN + 300 - needed)
        return

    raise RuntimeError("Groq rate limit exceeded after several retries")


def _reasoning_options(model_name: str, effort: str) -> dict:
    if "gpt-oss" in model_name:
        return {"reasoning_effort": effort}
    if "qwen" in model_name:
        return {"reasoning_effort": "none"}  # Qwen "thinks" for thousands of hidden tokens otherwise
    return {}


def _reserve_model(models: list[str], needed: int) -> str:
    """Pick the first model with room in its minute budget, waiting if all are full."""
    deadline = time.monotonic() + 90
    while True:
        with _lock:
            for name in models:
                if _tokens_used(name) + needed <= TOKENS_PER_MINUTE or not _usage[name]:
                    _usage[name].append((time.monotonic(), needed))
                    return name
        if time.monotonic() > deadline:
            return models[0]
        time.sleep(1)


def _tokens_used(model: str) -> int:
    window = _usage[model]
    while window and time.monotonic() - window[0][0] > 60:
        window.popleft()
    return sum(tokens for _, tokens in window)


def _record(model: str, correction: int) -> None:
    """Adjust the reservation to the real usage (correction = actual - estimated)."""
    with _lock:
        if _usage[model]:
            timestamp, tokens = _usage[model].pop()
            _usage[model].append((timestamp, max(tokens + correction, 0)))


def _retry_delay(error: RateLimitError, attempt: int) -> float:
    retry_after = error.response.headers.get("retry-after")
    try:
        return min(float(retry_after), MAX_WAIT_SECONDS)
    except (TypeError, ValueError):
        return min(5 * (attempt + 1), MAX_WAIT_SECONDS)
