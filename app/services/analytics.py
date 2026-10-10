"""Usage statistics for the admin dashboard, and the question log behind them."""
import csv
import io
from collections import Counter
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db import session_scope
from app.models import Feedback, QueryLog
from app.services import settings


def record_query(question: str, info: dict, latency_ms: int) -> int | None:
    """Save one answered question. Returns its id (used to attach feedback), or None when logging is off."""
    if not settings.get("log_questions"):
        return None
    with session_scope() as session:
        log = QueryLog(
            question=question[:2000],
            model=info.get("model", ""),
            latency_ms=latency_ms,
            answered=info.get("answered", True),
            top_score=float(info.get("top_score", 0.0)),
            cited=sorted({s["document"] for s in info.get("sources", [])}),
        )
        session.add(log)
        session.flush()
        return log.id


def purge_old_logs() -> None:
    days = settings.get("log_retention_days")
    if not days:
        return
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    with session_scope() as session:
        session.execute(delete(QueryLog).where(QueryLog.created_at < cutoff))


def overview(session: Session, days: int) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    logs = session.scalars(select(QueryLog).where(QueryLog.created_at >= since)).all()

    per_day = Counter(log.created_at.date().isoformat() for log in logs)
    series = []
    for offset in range(days - 1, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=offset)).date().isoformat()
        series.append({"date": day, "questions": per_day.get(day, 0)})

    votes = Counter(
        value
        for value in session.scalars(
            select(Feedback.value).join(QueryLog, Feedback.query_log_id == QueryLog.id).where(QueryLog.created_at >= since)
        )
    )
    cited = Counter(name for log in logs for name in log.cited)
    models = Counter(log.model or "unknown" for log in logs if log.answered)
    latencies = [log.latency_ms for log in logs if log.latency_ms]

    return {
        "days": days,
        "questions": len(logs),
        "answer_rate": round(sum(1 for log in logs if log.answered) / len(logs), 3) if logs else None,
        "avg_latency_ms": round(sum(latencies) / len(latencies)) if latencies else None,
        "thumbs_up": votes.get("up", 0),
        "thumbs_down": votes.get("down", 0),
        "per_day": series,
        "top_documents": [{"name": n, "count": c} for n, c in cited.most_common(8)],
        "models": [{"name": n, "count": c} for n, c in models.most_common()],
    }


def unanswered(session: Session, limit: int = 100, include_resolved: bool = False) -> list[dict]:
    query = select(QueryLog).where(QueryLog.answered.is_(False)).order_by(QueryLog.created_at.desc()).limit(limit)
    if not include_resolved:
        query = query.where(QueryLog.resolved.is_(False))
    return [_row(log) for log in session.scalars(query)]


def downvoted(session: Session, limit: int = 100) -> list[dict]:
    rows = session.execute(
        select(QueryLog, Feedback)
        .join(Feedback, Feedback.query_log_id == QueryLog.id)
        .where(Feedback.value == "down")
        .order_by(Feedback.created_at.desc())
        .limit(limit)
    )
    return [{**_row(log), "comment": feedback.comment} for log, feedback in rows]


def questions_csv(session: Session, days: int) -> str:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["time", "question", "answered", "model", "latency_ms", "cited_documents"])
    for log in session.scalars(select(QueryLog).where(QueryLog.created_at >= since).order_by(QueryLog.created_at)):
        writer.writerow(
            [log.created_at.isoformat(), log.question, log.answered, log.model, log.latency_ms, "; ".join(log.cited)]
        )
    return out.getvalue()


def _row(log: QueryLog) -> dict:
    return {
        "id": log.id,
        "time": log.created_at.isoformat(),
        "question": log.question,
        "answered": log.answered,
        "model": log.model,
        "resolved": log.resolved,
    }
