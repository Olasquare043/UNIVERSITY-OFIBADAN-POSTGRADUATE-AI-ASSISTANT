"""Split cleaned page text into overlapping, citation-friendly chunks.

Splitting prefers paragraph boundaries, falls back to sentence boundaries for
paragraphs bigger than one chunk, and only hard-cuts as a last resort. A small
overlap is carried from the end of one page into the start of the next so
that ideas split across a page break aren't lost from the retriever's view.
"""
import re
from dataclasses import dataclass

from app.ingest.extract import Page

_SENTENCE_BREAKS = [". ", "? ", "! ", "\n"]


@dataclass
class Chunk:
    text: str
    source: str
    page: int | None
    chunk_index: int


def chunk_document(pages: list[Page], source: str, chunk_size: int, overlap: int) -> list[Chunk]:
    chunks: list[Chunk] = []
    carry_over = ""

    for page in pages:
        text = f"{carry_over}\n\n{page.text}" if carry_over else page.text
        pieces = _split_text(text, chunk_size, overlap)

        for piece in pieces:
            chunks.append(Chunk(text=piece, source=source, page=page.page_number, chunk_index=len(chunks)))

        carry_over = pieces[-1][-overlap:] if pieces and overlap else ""

    return chunks


def _split_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    paragraphs = [p for p in re.split(r"\n\n+", text) if p.strip()]
    chunks: list[str] = []
    current = ""

    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}" if current else paragraph
        if len(candidate) <= chunk_size:
            current = candidate
            continue

        if current:
            chunks.append(current)
            current = f"{current[-overlap:]}\n\n{paragraph}" if overlap else paragraph
        else:
            current = paragraph

        while len(current) > chunk_size:
            cut = _find_cut_point(current, chunk_size)
            piece = current[:cut]
            chunks.append(piece)
            tail = piece[-overlap:] if overlap else ""
            current = tail + current[cut:]

    if current:
        chunks.append(current)

    return chunks


def _find_cut_point(text: str, limit: int) -> int:
    window = text[:limit]
    for separator in _SENTENCE_BREAKS:
        idx = window.rfind(separator)
        if idx > limit * 0.5:
            return idx + len(separator)
    return limit
