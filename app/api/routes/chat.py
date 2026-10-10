"""Chat endpoints: the streaming one used by the app and a plain one for scripts."""
import json
import logging
import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.rag.pipeline import answer_question, answer_question_stream
from app.services import analytics, ratelimit, settings

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/api")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessage] = []
    model: str | None = None


class Source(BaseModel):
    document: str
    page: int | None
    snippet: str = ""


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]


def _check_request(request: Request, body: ChatRequest) -> None:
    """Apply the per-visitor limit and make sure a chosen model is one the admin allows."""
    window = settings.get("rate_limit_minutes") * 60
    key = f"chat:{request.client.host if request.client else 'unknown'}"
    if not ratelimit.allow(key, settings.get("rate_limit_count"), window):
        wait = ratelimit.retry_after(key, window)
        raise HTTPException(
            status_code=429,
            detail=f"You have asked many questions in a short time. Please try again in about {max(wait // 60, 1)} minute(s).",
            headers={"Retry-After": str(wait)},
        )
    if body.model:
        allowed = {m["id"] for m in settings.get("models") if m["enabled"]}
        if not settings.get("student_model_choice") or body.model not in allowed:
            raise HTTPException(status_code=400, detail="That model is not available.")


@router.post("/chat", response_model=ChatResponse)
def chat(body: ChatRequest, request: Request) -> ChatResponse:
    _check_request(request, body)
    history = [m.model_dump() for m in body.history]
    return ChatResponse(**answer_question(body.message, history=history, model=body.model))


@router.post("/chat/stream")
def chat_stream(body: ChatRequest, request: Request) -> StreamingResponse:
    _check_request(request, body)
    history = [m.model_dump() for m in body.history]

    def events():
        started = time.monotonic()
        try:
            for name, data in answer_question_stream(body.message, history=history, model=body.model):
                if name == "chunks":  # internal event, used only by the evaluation
                    continue
                if name == "done":
                    log_id = analytics.record_query(body.message, data, int((time.monotonic() - started) * 1000))
                    data = {"answer": data["answer"], "sources": data["sources"], "log_id": log_id}
                yield _sse(name, data)
        except Exception:
            logger.exception("Streaming answer failed")
            yield _sse("error", {"message": "Something went wrong while answering. Please try again."})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
