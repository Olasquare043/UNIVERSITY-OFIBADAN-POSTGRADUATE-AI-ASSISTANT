import os
from dotenv import load_dotenv

load_dotenv()


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, default))


def _float(name: str, default: float) -> float:
    return float(os.getenv(name, default))


GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
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
VECTOR_STORE_DIR = os.getenv("VECTOR_STORE_DIR", "vector_store")
PROCESSED_DIR = os.getenv("PROCESSED_DIR", "data/processed")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "ui_pg_knowledge_base")
