"""Find the chunks most relevant to a question.

Dense (embedding) search matches meaning, while BM25 keyword search catches exact
terms such as "NGN 30,000" or "MPhil/PhD" that embeddings can blur. The two ranked
lists are merged with reciprocal rank fusion.

RETRIEVAL_MODE: "dense" | "hybrid"
"""
import json
import re
from dataclasses import dataclass
from pathlib import Path

from rank_bm25 import BM25Okapi

from app import config
from app.ingest.embed import embed_query
from app.vectorstore import get_collection

RRF_K = 60

_keyword_index: tuple[BM25Okapi, list[dict]] | None = None


@dataclass
class RetrievedChunk:
    id: str
    text: str
    source: str
    page: int | None
    score: float  # dense cosine similarity; 0.0 if only the keyword search found it


def retrieve(query: str, top_k: int | None = None, mode: str | None = None) -> list[RetrievedChunk]:
    top_k = top_k or config.TOP_K
    mode = mode or config.RETRIEVAL_MODE

    dense = _dense_search(query, config.CANDIDATES)
    if mode == "dense":
        return dense[:top_k]

    return _reciprocal_rank_fusion(dense, _keyword_search(query, config.CANDIDATES))[:top_k]


def _dense_search(query: str, n: int) -> list[RetrievedChunk]:
    results = get_collection().query(
        query_embeddings=[embed_query(query)],
        n_results=n,
        include=["documents", "metadatas", "distances"],
    )
    return [
        RetrievedChunk(id=chunk_id, text=text, source=meta["source"], page=meta["page"] or None, score=1 - distance)
        for chunk_id, text, meta, distance in zip(
            results["ids"][0], results["documents"][0], results["metadatas"][0], results["distances"][0]
        )
    ]


def _keyword_search(query: str, n: int) -> list[RetrievedChunk]:
    bm25, records = _get_keyword_index()
    scores = bm25.get_scores(_tokenize(query))
    best = sorted(range(len(records)), key=lambda i: scores[i], reverse=True)[:n]
    return [
        RetrievedChunk(
            id=records[i]["id"],
            text=records[i]["text"],
            source=records[i]["source"],
            page=records[i]["page"] or None,
            score=0.0,
        )
        for i in best
        if scores[i] > 0
    ]


def _reciprocal_rank_fusion(*rankings: list[RetrievedChunk]) -> list[RetrievedChunk]:
    fused_scores: dict[str, float] = {}
    chunks: dict[str, RetrievedChunk] = {}
    for ranking in rankings:
        for rank, chunk in enumerate(ranking):
            fused_scores[chunk.id] = fused_scores.get(chunk.id, 0.0) + 1 / (RRF_K + rank + 1)
            if chunk.id not in chunks or chunk.score > chunks[chunk.id].score:
                chunks[chunk.id] = chunk
    return [chunks[cid] for cid in sorted(fused_scores, key=fused_scores.get, reverse=True)]


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _get_keyword_index() -> tuple[BM25Okapi, list[dict]]:
    global _keyword_index
    if _keyword_index is None:
        lines = (Path(config.PROCESSED_DIR) / "chunks.jsonl").read_text(encoding="utf-8").splitlines()
        records = [json.loads(line) for line in lines]
        _keyword_index = (BM25Okapi([_tokenize(r["search_text"]) for r in records]), records)
    return _keyword_index
