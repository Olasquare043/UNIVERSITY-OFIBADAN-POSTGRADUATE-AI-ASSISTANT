"""Orchestrates retrieval + generation into a single question-answering call."""
import re
from collections.abc import Iterator

from app import config
from app.rag.generator import generate_answer, stream_answer
from app.rag.prompt import REWRITE_PROMPT, SYSTEM_PROMPT, build_user_prompt
from app.rag.retriever import RetrievedChunk, retrieve

NOT_FOUND_MESSAGE = (
    "I couldn't find this information in the official University of Ibadan postgraduate "
    "documents currently available to me. Please check with the Postgraduate College "
    "directly (informationdesk@pgcollege.ui.edu.ng) or its website."
)

MAX_HISTORY_MESSAGES = 6  # last 3 user/assistant turns, keeps the prompt small
SNIPPET_CHARS = 300

_SMALL_TALK = re.compile(
    r"^\W*(hi|hello|hey|good\s+(morning|afternoon|evening)|thanks?|thank\s+you|bye|goodbye|"
    r"ok(ay)?|cool|great|who\s+are\s+you|what\s+can\s+you\s+(do|help)|how\s+are\s+you)\b[\w\s,!.?']{0,40}$",
    re.IGNORECASE,
)


def answer_question(question: str, history: list[dict] | None = None) -> dict:
    """Blocking version, used by /api/chat and the evaluation."""
    events = answer_question_stream(question, history)
    answer, sources, chunks = "", [], []
    for name, data in events:
        if name == "done":
            answer, sources = data["answer"], data["sources"]
        elif name == "chunks":
            chunks = data
    return {"answer": answer, "sources": sources, "chunks": chunks}


def answer_question_stream(question: str, history: list[dict] | None = None) -> Iterator[tuple[str, object]]:
    """Yield (event, data) pairs: status, retrieved, chunks, token..., done."""
    history = (history or [])[-MAX_HISTORY_MESSAGES:]
    chunks: list[RetrievedChunk] = []

    if not _is_small_talk(question):
        yield "status", {"stage": "searching"}
        chunks = retrieve(_standalone_question(question, history))
        yield "chunks", chunks
        yield "retrieved", {"documents": _distinct_documents(chunks)}

        if not chunks or max(c.score for c in chunks) < config.MIN_RELEVANCE_SCORE:
            yield "token", {"text": NOT_FOUND_MESSAGE}
            yield "done", {"answer": NOT_FOUND_MESSAGE, "sources": []}
            return

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append({"role": "user", "content": build_user_prompt(question, chunks)})

    yield "status", {"stage": "writing"}
    parts = []
    for text in stream_answer(messages):
        text = text.replace("【", "(").replace("】", ")")  # the model sometimes uses 【 】 for citations
        parts.append(text)
        yield "token", {"text": text}

    answer = "".join(parts).strip()
    yield "done", {"answer": answer, "sources": _cited_sources(answer, chunks)}


def _is_small_talk(question: str) -> bool:
    return bool(_SMALL_TALK.match(question.strip()))


def _standalone_question(question: str, history: list[dict]) -> str:
    """Turn a follow-up like "and for part-time?" into a self-contained search query."""
    if not history:
        return question
    conversation = "\n".join(f"{m['role']}: {m['content']}" for m in history)
    messages = [
        {"role": "system", "content": REWRITE_PROMPT},
        {"role": "user", "content": f"Conversation:\n{conversation}\n\nLatest message: {question}"},
    ]
    return generate_answer(messages, max_tokens=300, reasoning_effort="low") or question


def _distinct_documents(chunks: list[RetrievedChunk]) -> list[dict]:
    seen = set()
    documents = []
    for chunk in chunks:
        key = (chunk.source, chunk.page)
        if key not in seen:
            seen.add(key)
            documents.append({"document": chunk.source, "page": chunk.page})
    return documents


def _normalize(text: str) -> str:
    """Lower-case letters and digits only, so "2021-2022" and "2021/2022" compare equal."""
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text.lower()).split())


def _cited_sources(answer: str, chunks: list[RetrievedChunk]) -> list[dict]:
    """Only report chunks the answer actually cites by document name."""
    seen = set()
    sources = []
    for chunk in chunks:
        key = (chunk.source, chunk.page)
        if key in seen or _normalize(chunk.source) not in _normalize(answer):
            continue
        seen.add(key)
        snippet = " ".join(chunk.text.split())[:SNIPPET_CHARS]
        sources.append({"document": chunk.source, "page": chunk.page, "snippet": snippet})
    return sources
