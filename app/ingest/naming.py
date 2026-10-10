"""How a document is named in citations and how a chunk is prepared for search."""
import re
from pathlib import Path

from app import config


def display_name(file_path: Path) -> str:
    stem = re.sub(r"^\d+[_\-]+", "", file_path.stem)  # drop a leading "01_" ordering prefix
    name = stem.replace("_", " ").strip()
    return re.sub(r"\b(20\d\d) (20\d\d)\b", r"\1/\2", name)  # "2024 2025" -> "2024/2025"


def search_text(source: str, text: str) -> str:
    """Prefix the document name so a chunk like "Second Semester ..." still says which calendar it is from."""
    return f"{source}\n{text}" if config.CONTEXT_HEADERS else text


def embeddings_path() -> Path:
    slug = config.EMBEDDING_MODEL.split("/")[-1]
    return Path(config.PROCESSED_DIR) / f"embeddings_{slug}.npy"


# First match wins, so more specific patterns come first.
_CATEGORIES = [
    (r"\bform\b", "Form"),
    (r"calendar", "Calendar"),
    (r"\bfee", "Fee schedule"),
    (r"thesis|dissertation|manual of style", "Thesis guide"),
    (r"handbook", "Handbook"),
    (r"admission|orientation", "Admission guide"),
    (r"scholarship|bursary", "Scholarship"),
    (r"policy|policies|regulation", "Policy and regulations"),
    (r"guideline|workshop|material", "Guidelines"),
]
CATEGORY_NAMES = [name for _, name in _CATEGORIES] + ["Document"]


def category_for(name: str) -> str:
    return next((label for pattern, label in _CATEGORIES if re.search(pattern, name, re.IGNORECASE)), "Document")
