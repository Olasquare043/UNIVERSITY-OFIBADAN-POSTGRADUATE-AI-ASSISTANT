"""Admin: which language models the assistant may use."""
import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import Admin
from app.rag.generator import generate_answer
from app.services import auth, settings
from app.services.providers import make_http_client, safe_api_key, validate_provider

# Providers decide where requests and API keys are sent, so only super admins may manage them.
router = APIRouter(prefix="/api/admin/models", dependencies=[Depends(auth.super_admin)])

logger = logging.getLogger("uvicorn.error")

_AVAILABLE_TTL = 600
_available_cache: dict[str, tuple[float, list[str], str]] = {}  # provider id -> (time, model ids, error)


class Provider(BaseModel):
    id: str
    name: str
    base_url: str
    api_key_env: str = ""
    tokens_per_minute: int | None = None


class ModelEntry(BaseModel):
    id: str
    provider: str
    label: str
    enabled: bool = True


class ModelSettings(BaseModel):
    providers: list[Provider]
    models: list[ModelEntry]
    default_model: str
    fallback_model: str
    student_model_choice: bool = False


@router.get("")
def get_models(refresh: bool = False) -> dict:
    values = settings.get_all()
    return {
        **{key: values[key] for key in ("providers", "models", "default_model", "fallback_model", "student_model_choice")},
        "available": {p["id"]: _available_models(p, refresh) for p in values["providers"]},
    }


@router.put("")
def save_models(body: ModelSettings, admin: Admin = Depends(auth.super_admin), session: Session = Depends(get_session)) -> dict:
    provider_ids = {p.id for p in body.providers}
    if len(provider_ids) != len(body.providers):
        raise HTTPException(status_code=400, detail="Each provider needs a different id.")
    enabled = {m.id for m in body.models if m.enabled}
    if any(m.provider not in provider_ids for m in body.models):
        raise HTTPException(status_code=400, detail="A model uses a provider that does not exist.")
    if body.default_model not in enabled or body.fallback_model not in enabled:
        raise HTTPException(status_code=400, detail="The default and fallback models must be in the list and enabled.")

    current = {p["id"]: p for p in settings.get("providers")}
    for provider in body.providers:
        changed = current.get(provider.id) != provider.model_dump()
        try:  # every provider is checked on every save, so an old entry cannot stay unsafe
            validate_provider(provider.model_dump(), tolerate_unresolved=not changed)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=f"{provider.name or provider.id}: {error}")

    settings.save(
        {
            "providers": [p.model_dump() for p in body.providers],
            "models": [m.model_dump() for m in body.models],
            "default_model": body.default_model,
            "fallback_model": body.fallback_model,
            "student_model_choice": body.student_model_choice,
        }
    )
    _available_cache.clear()
    auth.audit(session, admin, "changed models", f"default {body.default_model}, fallback {body.fallback_model}")
    return {"ok": True}


class TestRequest(BaseModel):
    model: str


@router.post("/test")
def test_model(body: TestRequest) -> dict:
    """Send one short question to exactly this model (no fallback) and report how it went."""
    started = time.monotonic()
    try:
        reply = generate_answer(
            [{"role": "user", "content": "Reply with the single word: ready"}],
            model=body.model,
            max_tokens=200,
            use_fallback=False,
        )
    except Exception as error:
        logger.warning("Model test failed for %s: %s", body.model, error)
        return {"ok": False, "error": _explain(error)}
    return {"ok": True, "reply": reply[:100], "latency_ms": int((time.monotonic() - started) * 1000)}


def _available_models(provider: dict, refresh: bool) -> dict:
    """The models a provider says it offers (cached, because listing them is a network call)."""
    cached = _available_cache.get(provider["id"])
    if cached and not refresh and time.monotonic() - cached[0] < _AVAILABLE_TTL:
        return {"models": cached[1], "error": cached[2]}
    try:
        key = safe_api_key(provider.get("api_key_env") or "") or "not-needed"
        client = OpenAI(base_url=provider["base_url"], api_key=key, max_retries=0, http_client=make_http_client())
        found, error = sorted(m.id for m in client.models.list().data), ""
    except Exception as exc:
        logger.warning("Listing models for %s failed: %s", provider["id"], exc)
        found, error = [], "Could not list models: " + _explain(exc)
    _available_cache[provider["id"]] = (time.monotonic(), found, error)
    return {"models": found, "error": error}


def _explain(error: Exception) -> str:
    """A short, generic reason for the admin. The full detail goes to the server log, never to the browser."""
    status = getattr(error, "status_code", None)
    if status in (401, 403):
        return "The provider refused the key. Check the key setting name and that the key is set on the server."
    if status == 404:
        return "The provider does not know this model or address."
    if status == 429:
        return "The provider is busy or the limit was reached. Try again in a minute."
    if status:
        return f"The provider answered with an error (status {status})."
    if isinstance(error, RuntimeError):
        return "No usable model is configured, or the model is busy. Try again in a minute."
    return "Could not connect to the provider. Check the address and that it is reachable from this server."
