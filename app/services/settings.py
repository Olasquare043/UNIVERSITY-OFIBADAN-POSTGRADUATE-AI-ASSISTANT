"""Admin-editable settings, stored in the database and cached in memory.

Every setting has a default here. Values saved by an admin override the default.
API keys are never stored in the database: a provider only names the environment
variable that holds its key.
"""
import copy
import threading

from sqlalchemy import select

from app import config
from app.db import session_scope
from app.models import Setting

DEFAULTS: dict = {
    # What students see
    "app_name": "UI Postgraduate Assistant",
    "tagline": "Answers about postgraduate study at the University of Ibadan, from official documents.",
    "notice": "AI answers can be incomplete or out of date. Confirm fees, deadlines and rules with the Postgraduate College.",
    "contact_email": "informationdesk@pgcollege.ui.edu.ng",
    "contact_website": "https://pgcollege.ui.edu.ng",
    "announcement": "",
    "suggested_topics": [
        {"title": "Admissions", "icon": "user-plus", "questions": [
            "What are the requirements for admission into the MPhil/PhD programme?", "What is the acceptance fee?"]},
        {"title": "Fees", "icon": "wallet", "questions": [
            "How much are the postgraduate school fees?", "Can I pay my school fees in instalments?"]},
        {"title": "Registration", "icon": "clipboard-check", "questions": [
            "How do I register as a new postgraduate student?", "What is the deadline for late registration?"]},
        {"title": "Examinations and regulations", "icon": "scale", "questions": [
            "What is the pass mark for a course?", "What happens in case of examination misconduct?"]},
        {"title": "Thesis and dissertation", "icon": "scroll-text", "questions": [
            "How many copies of my thesis must I submit?", "What is the deadline for thesis submission?"]},
        {"title": "Calendar", "icon": "calendar-days", "questions": [
            "When does the 2025/2026 academic session start?", "What are the key dates in the academic calendar?"]},
        {"title": "Forms and scholarships", "icon": "file-signature", "questions": [
            "How do I request conversion from MPhil to PhD?", "Are there scholarships for postgraduate students?"]},
    ],
    # Models. A provider is any OpenAI-compatible service (Groq, OpenRouter, a local Ollama server, ...).
    "providers": [
        {"id": "groq", "name": "Groq", "base_url": "https://api.groq.com/openai/v1", "api_key_env": "GROQ_API_KEY",
         "tokens_per_minute": 8000},
    ],
    "models": [
        {"id": config.GROQ_MODEL, "provider": "groq", "label": "Balanced", "enabled": True},
        {"id": config.GROQ_FALLBACK_MODEL, "provider": "groq", "label": "Fast", "enabled": True},
    ],
    "default_model": config.GROQ_MODEL,
    "fallback_model": config.GROQ_FALLBACK_MODEL,
    "student_model_choice": False,  # let students pick among the enabled models
    "temperature": 0.2,
    "max_tokens": 1200,
    # Retrieval
    "top_k": config.TOP_K,
    "min_relevance": config.MIN_RELEVANCE_SCORE,
    # Usage
    "rate_limit_count": 20,  # questions per person ...
    "rate_limit_minutes": 10,  # ... in this many minutes
    "log_questions": True,
    "log_retention_days": 180,
}

_cache: dict | None = None
_lock = threading.Lock()


def get_all() -> dict:
    global _cache
    with _lock:
        if _cache is None:
            with session_scope() as session:
                saved = {row.key: row.value for row in session.scalars(select(Setting))}
            _cache = {**copy.deepcopy(DEFAULTS), **{k: v for k, v in saved.items() if k in DEFAULTS}}
        return _cache


def get(key: str):
    return get_all()[key]


def save(changes: dict) -> dict:
    """Save known keys only, then return the new full settings."""
    unknown = set(changes) - set(DEFAULTS)
    if unknown:
        raise ValueError(f"Unknown settings: {', '.join(sorted(unknown))}")
    with session_scope() as session:
        for key, value in changes.items():
            row = session.get(Setting, key)
            if row:
                row.value = value
            else:
                session.add(Setting(key=key, value=value))
    reset_cache()
    return get_all()


def reset_cache() -> None:
    global _cache
    with _lock:
        _cache = None


# Settings every visitor may read. Everything else stays admin-only.
PUBLIC_KEYS = ["app_name", "tagline", "notice", "contact_email", "contact_website", "announcement", "suggested_topics"]
