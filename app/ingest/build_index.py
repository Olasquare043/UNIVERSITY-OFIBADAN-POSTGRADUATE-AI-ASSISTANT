"""Build the vector store from every document in data/raw_docs.

Run whenever the source documents change (stop the API server first):
    python -m app.ingest.build_index

data/processed/ holds what this script produces:
  - <document>.pages.json      : cleaned text per page, cached so slow OCR only runs once
  - chunks.jsonl               : every chunk that was indexed, used for keyword search
                                 and handy for inspecting exactly what the assistant knows
  - embeddings_<model>.npy     : one embedding per chunk (same order as chunks.jsonl), so a
                                 fresh server can rebuild its vector store without the model
"""
import json
import re
from pathlib import Path

import numpy as np

from app import config
from app.ingest.chunk import chunk_document
from app.ingest.clean import clean_text
from app.ingest.embed import embed_passages
from app.ingest.extract import Page, extract_pages
from app.vectorstore import embeddings_path, get_collection, reset_collection

SUPPORTED_SUFFIXES = {".pdf", ".docx", ".html", ".htm", ".md", ".txt"}
PROCESSED_DIR = Path(config.PROCESSED_DIR)
CHUNKS_FILE = PROCESSED_DIR / "chunks.jsonl"
CORRECTIONS_FILE = Path("data/ocr_corrections.json")


def display_name(file_path: Path) -> str:
    stem = re.sub(r"^\d+[_\-]+", "", file_path.stem)  # drop a leading "01_" ordering prefix
    name = stem.replace("_", " ").strip()
    return re.sub(r"\b(20\d\d) (20\d\d)\b", r"\1/\2", name)  # "2024 2025" -> "2024/2025"


def search_text(source: str, text: str) -> str:
    """Prefix the document name so a chunk like "Second Semester ..." still says which calendar it is from."""
    return f"{source}\n{text}" if config.CONTEXT_HEADERS else text


def apply_ocr_corrections(file_path: Path, pages: list[Page]) -> list[Page]:
    """Fix known OCR misreads, listed per file in data/ocr_corrections.json."""
    if not CORRECTIONS_FILE.exists():
        return pages
    fixes = json.loads(CORRECTIONS_FILE.read_text(encoding="utf-8")).get(file_path.name, [])
    for page in pages:
        for wrong, right in fixes:
            page.text = page.text.replace(wrong, right)
    return pages


def load_clean_pages(file_path: Path) -> list[Page]:
    cache_path = PROCESSED_DIR / f"{file_path.stem}.pages.json"
    stat = file_path.stat()
    signature = [stat.st_size, int(stat.st_mtime)]

    if cache_path.exists():
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        if cached["signature"] == signature:
            return apply_ocr_corrections(file_path, [Page(**p) for p in cached["pages"]])

    pages = [Page(text=clean_text(p.text), page_number=p.page_number) for p in extract_pages(file_path)]
    pages = [p for p in pages if p.text]
    cache_path.write_text(
        json.dumps({"signature": signature, "pages": [vars(p) for p in pages]}, ensure_ascii=False),
        encoding="utf-8",
    )
    return apply_ocr_corrections(file_path, pages)


def build_index() -> None:
    raw_docs_dir = Path(config.RAW_DOCS_DIR)
    files = sorted(f for f in raw_docs_dir.iterdir() if f.suffix.lower() in SUPPORTED_SUFFIXES)
    if not files:
        raise SystemExit(f"No documents found in {raw_docs_dir}")

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    records = []
    for file_path in files:
        source_name = display_name(file_path)
        pages = load_clean_pages(file_path)
        chunks = chunk_document(pages, source_name, config.CHUNK_SIZE, config.CHUNK_OVERLAP)

        if not chunks:
            print(f"  skipped {file_path.name}: no extractable text")
            continue

        for c in chunks:
            records.append(
                {
                    "id": f"{file_path.stem}::{c.chunk_index}",
                    "source": c.source,
                    "page": c.page or 0,
                    "text": c.text,
                    "search_text": search_text(c.source, c.text),
                }
            )
        print(f"  {file_path.name}: {len(pages)} pages -> {len(chunks)} chunks")

    CHUNKS_FILE.write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records), encoding="utf-8"
    )
    print(f"Embedding {len(records)} chunks with {config.EMBEDDING_MODEL} ...")
    np.save(embeddings_path(), embed_passages([r["search_text"] for r in records]))

    reset_collection()
    get_collection()  # rebuilds the vector store from the files just written
    print(f"\nIndexed {len(records)} chunks from {len(files)} documents into '{config.COLLECTION_NAME}'.")


if __name__ == "__main__":
    build_index()
