"""In-memory vector index built from the knowledge base in the database.

The knowledge base is small (about a thousand chunks), so an exact cosine search over one
numpy matrix is fast and needs no vector database. Only chunks of documents that are ready
and switched on are searchable. After any change to the knowledge base call reset_index()
and the next search reloads it.
"""
import threading
from dataclasses import dataclass

import numpy as np
from sqlalchemy import select

from app import config
from app.db import session_scope
from app.models import Chunk, Document


@dataclass
class VectorIndex:
    records: list[dict]
    vectors: np.ndarray  # one L2-normalised row per record, same order

    def search(self, query_vector: list[float], n: int) -> list[tuple[dict, float]]:
        """Return the n most similar records with their cosine similarity, best first."""
        if not self.records:
            return []
        scores = self.vectors @ np.asarray(query_vector, dtype=np.float32)
        best = np.argsort(-scores)[:n]
        return [(self.records[i], float(scores[i])) for i in best]


_index: VectorIndex | None = None
_lock = threading.Lock()


def get_index() -> VectorIndex:
    global _index
    if _index is None:
        with _lock:
            if _index is None:
                _index = _load_from_database()
    return _index


def reset_index() -> None:
    """Forget the loaded index so the next search reads the database again."""
    global _index
    _index = None


def _load_from_database() -> VectorIndex:
    from app.services.kb import seed_if_empty  # imported here: kb imports this module

    seed_if_empty()
    query = (
        select(Chunk, Document.name)
        .join(Document)
        .where(Document.active.is_(True), Document.status == "ready", Chunk.embedding_model == config.EMBEDDING_MODEL)
        .order_by(Document.id, Chunk.idx)
    )
    records, vectors = [], []
    with session_scope() as session:
        for chunk, source in session.execute(query):
            records.append(
                {
                    "id": f"{chunk.document_id}::{chunk.idx}",
                    "source": source,
                    "page": chunk.page,
                    "text": chunk.text,
                    "search_text": chunk.search_text,
                }
            )
            vectors.append(np.frombuffer(chunk.embedding, dtype=np.float32))
    matrix = np.vstack(vectors) if vectors else np.zeros((0, 1), dtype=np.float32)
    return VectorIndex(records=records, vectors=matrix)
