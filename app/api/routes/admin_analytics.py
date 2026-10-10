"""Admin: usage statistics and the questions that show gaps in the knowledge base."""
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db import get_engine, get_session
from app.models import QueryLog
from app.services import analytics, auth

router = APIRouter(prefix="/api/admin/analytics", dependencies=[Depends(auth.current_admin)])


@router.get("/overview")
def overview(days: int = 30, session: Session = Depends(get_session)) -> dict:
    result = analytics.overview(session, max(1, min(days, 365)))
    # On a host whose disk is wiped at every restart (Render), SQLite means uploads and statistics will be lost.
    result["temporary_storage"] = get_engine().dialect.name == "sqlite" and bool(os.getenv("RENDER"))
    return result


@router.get("/unanswered")
def unanswered(include_resolved: bool = False, session: Session = Depends(get_session)) -> dict:
    return {"questions": analytics.unanswered(session, include_resolved=include_resolved)}


@router.get("/downvoted")
def downvoted(session: Session = Depends(get_session)) -> dict:
    return {"questions": analytics.downvoted(session)}


@router.post("/questions/{log_id}/resolve")
def resolve(log_id: int, resolved: bool = True, session: Session = Depends(get_session)) -> dict:
    log = session.get(QueryLog, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Question not found.")
    log.resolved = resolved
    return {"ok": True}


@router.get("/export.csv")
def export(days: int = 30, session: Session = Depends(get_session)) -> Response:
    return Response(
        analytics.questions_csv(session, max(1, min(days, 365))),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="questions.csv"'},
    )
