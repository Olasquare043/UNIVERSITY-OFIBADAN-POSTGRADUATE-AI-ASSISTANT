import json
import logging
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import config
from app.rag.pipeline import answer_question, answer_question_stream

logger = logging.getLogger("uvicorn.error")

app = FastAPI(title="University of Ibadan Postgraduate AI Assistant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class Source(BaseModel):
    document: str
    page: int | None
    snippet: str = ""


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    history = [m.model_dump() for m in request.history]
    return ChatResponse(**answer_question(request.message, history=history))


@app.post("/api/chat/stream")
def chat_stream(request: ChatRequest) -> StreamingResponse:
    history = [m.model_dump() for m in request.history]

    def events():
        try:
            for name, data in answer_question_stream(request.message, history=history):
                if name != "chunks":  # internal event, used only by the evaluation
                    yield _sse(name, data)
        except Exception:
            logger.exception("Streaming answer failed")
            yield _sse("error", {"message": "Something went wrong while answering. Please try again."})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/documents")
def documents() -> dict:
    return _document_summary()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


def _sse(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@lru_cache
def _document_summary() -> dict:
    chunks_file = Path(config.PROCESSED_DIR) / "chunks.jsonl"
    summary: dict[str, dict] = {}
    total_chunks = 0

    for line in chunks_file.read_text(encoding="utf-8").splitlines():
        record = json.loads(line)
        entry = summary.setdefault(record["source"], {"name": record["source"], "pages": 0, "chunks": 0})
        entry["pages"] = max(entry["pages"], record["page"])
        entry["chunks"] += 1
        total_chunks += 1

    documents = [{**d, "pages": d["pages"] or None} for d in summary.values()]
    return {"documents": documents, "total_chunks": total_chunks}


app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="frontend")
