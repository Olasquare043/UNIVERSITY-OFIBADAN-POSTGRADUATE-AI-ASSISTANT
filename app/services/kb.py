"""Knowledge base operations: import from files, process uploads, re-index a document.

A document goes through: upload -> extract pages -> clean -> store page text -> chunk -> embed -> ready.
Page text is stored so an admin can correct it (for example a scanned page) and re-index.
"""
import logging
import mimetypes
import tempfile
import threading
from pathlib import Path

import numpy as np
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import config
from app.db import init_db, session_scope
from app.ingest.chunk import chunk_document
from app.ingest.clean import clean_text
from app.ingest.embed import embed_passages
from app.ingest.extract import Page, extract_pages
from app.ingest.naming import category_for, display_name, embeddings_path, search_text
from app.models import Chunk, Document, PageText
from app.vectorstore import reset_index

logger = logging.getLogger("uvicorn.error")

SUPPORTED_SUFFIXES = {".pdf", ".docx", ".html", ".htm", ".md", ".txt"}
_seed_lock = threading.Lock()


class UploadError(ValueError):
    """The uploaded file cannot be accepted; the message is safe to show to the admin."""


def seed_if_empty() -> None:
    """First run: load the documents built by build_index so the assistant starts with a knowledge base."""
    init_db()
    with _seed_lock:
        with session_scope() as session:
            if session.scalar(select(func.count()).select_from(Document)):
                return
        import_from_files()


def import_from_files(replace: bool = False) -> int:
    """Import chunks.jsonl and the embeddings file written by build_index. Returns documents added."""
    import json

    chunks_file = Path(config.PROCESSED_DIR) / "chunks.jsonl"
    if not chunks_file.exists() or not embeddings_path().exists():
        return 0

    records = [json.loads(line) for line in chunks_file.read_text(encoding="utf-8").splitlines()]
    vectors = np.load(embeddings_path())
    if len(records) != len(vectors):
        raise RuntimeError("chunks.jsonl and the embeddings file are out of sync. Rebuild the index.")

    by_source: dict[str, list[int]] = {}
    for i, record in enumerate(records):
        by_source.setdefault(record["source"], []).append(i)

    added = 0
    with session_scope() as session:
        for source, positions in by_source.items():
            existing = session.scalar(select(Document).where(Document.name == source))
            if existing and not replace:
                continue
            if existing:
                session.delete(existing)
                session.flush()

            stem = records[positions[0]]["id"].split("::")[0]
            raw = next(Path(config.RAW_DOCS_DIR).glob(f"{stem}.*"), None)
            small = raw is not None and raw.stat().st_size <= config.MAX_UPLOAD_MB * 1024 * 1024
            document = Document(
                name=source,
                filename=raw.name if raw else stem,
                category=category_for(source),
                status="ready",
                pages=max(records[i]["page"] for i in positions) or None,
                chunk_count=len(positions),
                original=raw.read_bytes() if small else None,
                content_type=(mimetypes.guess_type(raw.name)[0] if raw else None) or "",
                uploaded_by="initial import",
            )
            session.add(document)
            session.flush()
            for n, i in enumerate(positions):
                session.add(
                    Chunk(
                        document_id=document.id,
                        idx=n,
                        page=records[i]["page"],
                        text=records[i]["text"],
                        search_text=records[i]["search_text"],
                        embedding=vectors[i].tobytes(),
                        embedding_model=config.EMBEDDING_MODEL,
                    )
                )
            added += 1
    reset_index()
    return added


def create_upload(session: Session, filename: str, data: bytes, uploaded_by: str, category: str | None = None) -> Document:
    """Validate an uploaded file and store it with status "processing". Call process_document next."""
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise UploadError(f"{filename}: only PDF, Word, HTML, Markdown and text files are supported.")
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise UploadError(f"{filename}: files can be at most {config.MAX_UPLOAD_MB} MB.")

    name = display_name(Path(filename))
    if not name:
        raise UploadError(f"{filename}: the file name is empty.")
    if session.scalar(select(Document).where(Document.name == name)):
        raise UploadError(f'A document named "{name}" already exists. Replace it instead.')

    document = Document(
        name=name,
        filename=filename,
        category=category or category_for(name),
        status="processing",
        original=data,
        content_type=mimetypes.guess_type(filename)[0] or "",
        uploaded_by=uploaded_by,
    )
    session.add(document)
    session.flush()
    return document


def process_document_in_background(document_id: int) -> None:
    threading.Thread(target=process_document, args=(document_id,), daemon=True).start()


def process_document(document_id: int) -> None:
    """Extract, clean, chunk and embed an uploaded document. Never raises: failures are saved on the document."""
    try:
        with session_scope() as session:
            document = session.get(Document, document_id)
            filename, data = document.filename, document.original

        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / f"upload{Path(filename).suffix.lower()}"
            path.write_bytes(data)
            extracted = extract_pages(path)
        pages = [Page(text=clean_text(p.text), page_number=p.page_number, scanned=p.scanned) for p in extracted]

        with session_scope() as session:
            document = session.get(Document, document_id)
            session.query(PageText).filter_by(document_id=document_id).delete()
            for page in pages:
                session.add(PageText(document_id=document_id, page_number=page.page_number or 0, text=page.text))
            session.flush()
            _build_chunks(session, document, pages)
    except Exception as error:
        logger.exception("Processing document %s failed", document_id)
        _mark_failed(document_id, f"Could not read this file: {error}")
    reset_index()


def reindex_document(document_id: int) -> None:
    """Rebuild a document's chunks from its stored (possibly edited) page text."""
    with session_scope() as session:
        document = session.get(Document, document_id)
        rows = session.scalars(select(PageText).where(PageText.document_id == document_id).order_by(PageText.page_number))
        pages = [Page(text=row.text, page_number=row.page_number or None) for row in rows]
        _build_chunks(session, document, pages)
    reset_index()


def _build_chunks(session: Session, document: Document, pages: list[Page]) -> None:
    session.query(Chunk).filter_by(document_id=document.id).delete()
    readable = [p for p in pages if p.text.strip()]
    chunks = chunk_document(readable, document.name, config.CHUNK_SIZE, config.CHUNK_OVERLAP)

    document.pages = max((p.page_number or 0 for p in pages), default=0) or None
    document.needs_ocr_pages = sum(1 for p in pages if not p.text.strip())
    document.chunk_count = len(chunks)

    if not chunks:
        document.status = "failed"
        document.error = (
            "No readable text was found. If this is a scanned document, read it with OCR on a computer "
            "(python -m app.ingest.push) or type the text of each page in the page editor."
        )
        return

    vectors = embed_passages([search_text(document.name, c.text) for c in chunks])
    for chunk, vector in zip(chunks, vectors):
        session.add(
            Chunk(
                document_id=document.id,
                idx=chunk.chunk_index,
                page=chunk.page or 0,
                text=chunk.text,
                search_text=search_text(document.name, chunk.text),
                embedding=vector.tobytes(),
                embedding_model=config.EMBEDDING_MODEL,
            )
        )
    document.status = "ready"
    document.error = ""


def _mark_failed(document_id: int, message: str) -> None:
    with session_scope() as session:
        document = session.get(Document, document_id)
        if document:
            document.status = "failed"
            document.error = message[:500]


def fail_stale_processing() -> None:
    """A restart interrupts background work, so documents still "processing" will never finish."""
    with session_scope() as session:
        for document in session.scalars(select(Document).where(Document.status == "processing")):
            document.status = "failed"
            document.error = "Processing was interrupted by a restart. Upload the file again."
