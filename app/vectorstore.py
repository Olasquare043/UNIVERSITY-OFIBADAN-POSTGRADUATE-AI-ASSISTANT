"""Persistent Chroma collection shared by ingest and rag.

build_index saves every chunk's embedding next to chunks.jsonl. If the Chroma store
is empty or missing (a fresh server, a new deployment, a corrupted index), it is
rebuilt from those two files in seconds, with no embedding model and no OCR needed.
"""
import json
from pathlib import Path

import chromadb
import numpy as np

from app import config

_client: chromadb.ClientAPI | None = None
_BATCH = 500


def _get_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=config.VECTOR_STORE_DIR)
    return _client


def _model_slug() -> str:
    return config.EMBEDDING_MODEL.split("/")[-1]


def embeddings_path() -> Path:
    return Path(config.PROCESSED_DIR) / f"embeddings_{_model_slug()}.npy"


def _create_collection():
    # One collection per embedding model, because vectors from different models can't be mixed
    return _get_client().get_or_create_collection(
        name=f"{config.COLLECTION_NAME}__{_model_slug()}",
        metadata={"hnsw:space": "cosine"},
    )


def reset_collection():
    """Drop and recreate the collection so a rebuild always starts from a clean index."""
    client = _get_client()
    name = f"{config.COLLECTION_NAME}__{_model_slug()}"
    if name in [c.name for c in client.list_collections()]:
        client.delete_collection(name)
    return _create_collection()


def get_collection():
    collection = _create_collection()
    if collection.count() == 0:
        _restore_from_disk(collection)
    return collection


def _restore_from_disk(collection) -> None:
    chunks_file = Path(config.PROCESSED_DIR) / "chunks.jsonl"
    if not chunks_file.exists() or not embeddings_path().exists():
        raise RuntimeError("The knowledge base is empty. Run: python -m app.ingest.build_index")

    records = [json.loads(line) for line in chunks_file.read_text(encoding="utf-8").splitlines()]
    vectors = np.load(embeddings_path())
    if len(records) != len(vectors):
        raise RuntimeError("chunks.jsonl and the embeddings file are out of sync. Rebuild the index.")

    for start in range(0, len(records), _BATCH):
        batch = records[start : start + _BATCH]
        collection.add(
            ids=[r["id"] for r in batch],
            embeddings=vectors[start : start + _BATCH].tolist(),
            documents=[r["text"] for r in batch],
            metadatas=[{"source": r["source"], "page": r["page"]} for r in batch],
        )
