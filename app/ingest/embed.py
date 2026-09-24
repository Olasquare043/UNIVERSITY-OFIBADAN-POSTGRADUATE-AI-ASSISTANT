"""Local embedding model wrapper (no API key, no PyTorch): runs on ONNX via fastembed."""
import numpy as np
from fastembed import TextEmbedding

from app import config

# BGE models are trained to expect this instruction prefixed to search queries
# (not to the passages/chunks being indexed) for best retrieval accuracy.
_BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

_model: TextEmbedding | None = None


def _get_model() -> TextEmbedding:
    global _model
    if _model is None:
        _model = TextEmbedding(config.EMBEDDING_MODEL)
    return _model


def embed_passages(texts: list[str]) -> np.ndarray:
    return _normalize(np.array(list(_get_model().embed(texts, batch_size=32))))


def embed_query(text: str) -> list[float]:
    prefixed = _BGE_QUERY_PREFIX + text if "bge" in config.EMBEDDING_MODEL.lower() else text
    return _normalize(np.array(list(_get_model().embed([prefixed]))))[0].tolist()


def _normalize(vectors: np.ndarray) -> np.ndarray:
    return (vectors / np.linalg.norm(vectors, axis=1, keepdims=True)).astype(np.float32)
