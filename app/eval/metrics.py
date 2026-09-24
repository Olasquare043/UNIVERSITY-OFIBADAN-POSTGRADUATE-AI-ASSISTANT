"""Retrieval metrics that don't depend on how the documents were chunked.

Each eval question lists "evidence" groups. A group is a set of phrases that must
all appear together in one retrieved chunk for that fact to count as retrieved.
"""
import re


def normalize(text: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text.lower()).split())


def group_matches(group: list[str], chunk_text: str) -> bool:
    haystack = normalize(chunk_text)
    return all(normalize(phrase) in haystack for phrase in group)


def retrieval_scores(evidence: list[list[str]], chunk_texts: list[str], k: int) -> dict:
    top = chunk_texts[:k]

    first_hit_rank = next(
        (rank for rank, text in enumerate(top, start=1) if any(group_matches(g, text) for g in evidence)),
        None,
    )
    groups_found = sum(1 for g in evidence if any(group_matches(g, text) for text in top))

    return {
        "hit": first_hit_rank is not None,
        "recall": groups_found / len(evidence),
        "reciprocal_rank": 1 / first_hit_rank if first_hit_rank else 0.0,
    }
