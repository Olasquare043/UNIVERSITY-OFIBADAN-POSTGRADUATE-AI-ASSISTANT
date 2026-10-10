"""Endpoints the student app uses, apart from chat."""
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import Document, Feedback, QueryLog
from app.services import settings

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/config")
def public_config() -> dict:
    """Everything the student app needs to brand itself and offer models, and nothing admin-only."""
    values = settings.get_all()
    models = [{"id": m["id"], "label": m["label"]} for m in values["models"] if m["enabled"]]
    return {
        **{key: values[key] for key in settings.PUBLIC_KEYS},
        "model_choice": bool(values["student_model_choice"]) and len(models) > 1,
        "models": models if values["student_model_choice"] else [],
        "default_model": values["default_model"],
    }


@router.get("/documents")
def documents(session: Session = Depends(get_session)) -> dict:
    rows = session.scalars(
        select(Document).where(Document.active.is_(True), Document.status == "ready").order_by(Document.name)
    )
    return {
        "documents": [
            {
                "id": d.id,
                "name": d.name,
                "category": d.category,
                "updated": d.updated_at.date().isoformat(),
                "has_file": d.original is not None,
                "pages": d.pages,
            }
            for d in rows
        ]
    }


@router.get("/documents/{document_id}/file")
def document_file(document_id: int, session: Session = Depends(get_session)) -> Response:
    """The original upload. Only PDFs and plain text may display in the browser; any other type (HTML above all)
    is sent as a download, so an uploaded file can never run as a page on this site."""
    document = session.get(Document, document_id)
    if not document or not document.active or document.status != "ready" or document.original is None:
        raise HTTPException(status_code=404, detail="This document is not available.")

    suffix = Path(document.filename).suffix.lower()
    if suffix == ".pdf":
        media_type, disposition, extra = "application/pdf", "inline", {}
    elif suffix in (".txt", ".md"):
        media_type, disposition = "text/plain; charset=utf-8", "inline"
        extra = {"Content-Security-Policy": "sandbox; default-src 'none'"}
    else:
        media_type, disposition = "application/octet-stream", "attachment"
        extra = {"Content-Security-Policy": "sandbox; default-src 'none'"}

    return Response(
        content=document.original,
        media_type=media_type,
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(document.filename)}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "public, max-age=3600",
            **extra,
        },
    )


class FeedbackRequest(BaseModel):
    log_id: int
    value: str = Field(pattern="^(up|down)$")
    comment: str = Field(default="", max_length=1000)


@router.post("/feedback")
def feedback(request: FeedbackRequest, session: Session = Depends(get_session)) -> dict:
    if not session.get(QueryLog, request.log_id):
        raise HTTPException(status_code=404, detail="Unknown answer.")
    existing = session.scalar(select(Feedback).where(Feedback.query_log_id == request.log_id))
    if existing:
        existing.value, existing.comment = request.value, request.comment
    else:
        session.add(Feedback(query_log_id=request.log_id, value=request.value, comment=request.comment))
    return {"ok": True}
