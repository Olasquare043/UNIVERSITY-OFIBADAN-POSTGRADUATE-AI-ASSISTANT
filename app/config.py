import os
from dotenv import load_dotenv

load_dotenv()


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, default))


def _float(name: str, default: float) -> float:
    return float(os.getenv(name, default))


GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_FALLBACK_MODEL = os.getenv("GROQ_FALLBACK_MODEL", "openai/gpt-oss-20b")

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-base-en-v1.5")

CHUNK_SIZE = _int("CHUNK_SIZE", 900)
CHUNK_OVERLAP = _int("CHUNK_OVERLAP", 150)
CONTEXT_HEADERS = os.getenv("CONTEXT_HEADERS", "true").lower() == "true"

TOP_K = _int("TOP_K", 6)
MIN_RELEVANCE_SCORE = _float("MIN_RELEVANCE_SCORE", 0.35)

RETRIEVAL_MODE = os.getenv("RETRIEVAL_MODE", "hybrid")
CANDIDATES = _int("CANDIDATES", 20)

RAW_DOCS_DIR = os.getenv("RAW_DOCS_DIR", "data/raw_docs")
PROCESSED_DIR = os.getenv("PROCESSED_DIR", "data/processed")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///data/app.db")
REQUIRE_DATABASE = os.getenv("REQUIRE_DATABASE", "false").lower() == "true"  # refuse SQLite on hosts with no disk

SECRET_KEY = os.getenv("SECRET_KEY", "")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

MAX_UPLOAD_MB = _int("MAX_UPLOAD_MB", 10)

# How many reverse proxies sit in front of this server (Render has one; Render sets RENDER=true).
# 0 means do not trust X-Forwarded-For at all. With 1, the visitor's address is the LAST entry of the
# header, which is the one our own proxy added; entries to its left are written by the visitor.
TRUSTED_PROXY_HOPS = _int("TRUSTED_PROXY_HOPS", 1 if os.getenv("RENDER") else 0)

# Lets an admin point a model provider at this computer or a private network (for example an Ollama
# server). Off by default on a hosted server, where it could be abused to probe the internal network.
ALLOW_LOCAL_MODEL_HOSTS = os.getenv("ALLOW_LOCAL_MODEL_HOSTS", "false" if REQUIRE_DATABASE else "true").lower() == "true"
