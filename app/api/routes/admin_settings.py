"""Admin: branding and notice text, usage limits, admin accounts and the audit log."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import Admin, AuditLog
from app.services import auth, settings

router = APIRouter(prefix="/api/admin")

# What the Settings page may change. Models are changed on their own page.
EDITABLE = [
    "app_name", "tagline", "notice", "contact_email", "contact_website", "announcement", "suggested_topics",
    "top_k", "min_relevance", "rate_limit_count", "rate_limit_minutes", "log_questions", "log_retention_days",
    "temperature", "max_tokens",
]


class Topic(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    icon: str = "file-text"
    questions: list[str] = Field(max_length=6)


class SettingsUpdate(BaseModel):
    app_name: str | None = Field(default=None, min_length=1, max_length=80)
    tagline: str | None = Field(default=None, max_length=300)
    notice: str | None = Field(default=None, max_length=1000)
    contact_email: str | None = Field(default=None, max_length=200)
    contact_website: str | None = Field(default=None, max_length=200)
    announcement: str | None = Field(default=None, max_length=500)
    suggested_topics: list[Topic] | None = Field(default=None, max_length=12)
    top_k: int | None = Field(default=None, ge=1, le=15)
    min_relevance: float | None = Field(default=None, ge=0, le=1)
    rate_limit_count: int | None = Field(default=None, ge=0, le=1000)
    rate_limit_minutes: int | None = Field(default=None, ge=1, le=1440)
    log_questions: bool | None = None
    log_retention_days: int | None = Field(default=None, ge=0, le=3650)
    temperature: float | None = Field(default=None, ge=0, le=1)
    max_tokens: int | None = Field(default=None, ge=200, le=4000)


@router.get("/settings")
def get_settings(admin: Admin = Depends(auth.current_admin)) -> dict:
    values = settings.get_all()
    return {key: values[key] for key in EDITABLE}


@router.put("/settings")
def update_settings(
    body: SettingsUpdate, admin: Admin = Depends(auth.current_admin), session: Session = Depends(get_session)
) -> dict:
    changes = body.model_dump(exclude_none=True)
    settings.save(changes)
    auth.audit(session, admin, "changed settings", ", ".join(sorted(changes)))
    return get_settings(admin)


# ---------- Admin accounts (super admin only) ----------


class NewAdmin(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    name: str = Field(default="", max_length=200)
    password: str = Field(min_length=10, max_length=200)
    role: str = "editor"


class AdminUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    active: bool | None = None
    password: str | None = Field(default=None, min_length=10, max_length=200)


def _admin_row(admin: Admin) -> dict:
    return {
        "id": admin.id,
        "email": admin.email,
        "name": admin.name,
        "role": admin.role,
        "active": admin.active,
        "last_login": admin.last_login.isoformat() if admin.last_login else None,
    }


@router.get("/users")
def list_admins(admin: Admin = Depends(auth.super_admin), session: Session = Depends(get_session)) -> dict:
    return {"users": [_admin_row(a) for a in session.scalars(select(Admin).order_by(Admin.email))]}


@router.post("/users")
def create_admin(body: NewAdmin, admin: Admin = Depends(auth.super_admin), session: Session = Depends(get_session)) -> dict:
    email = body.email.strip().lower()
    if body.role not in auth.ROLES:
        raise HTTPException(status_code=400, detail="Unknown role.")
    if session.scalar(select(Admin).where(func.lower(Admin.email) == email)):
        raise HTTPException(status_code=400, detail="An admin with this email already exists.")
    created = Admin(email=email, name=body.name, password_hash=auth.hash_password(body.password), role=body.role)
    session.add(created)
    session.flush()
    auth.audit(session, admin, "created admin", email)
    return _admin_row(created)


@router.patch("/users/{admin_id}")
def update_admin(
    admin_id: int, body: AdminUpdate, admin: Admin = Depends(auth.super_admin), session: Session = Depends(get_session)
) -> dict:
    target = session.get(Admin, admin_id)
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found.")
    if body.role is not None and body.role not in auth.ROLES:
        raise HTTPException(status_code=400, detail="Unknown role.")

    losing_super = target.role == "super_admin" and (body.role == "editor" or body.active is False)
    if losing_super and session.scalar(
        select(func.count()).select_from(Admin).where(Admin.role == "super_admin", Admin.active.is_(True), Admin.id != target.id)
    ) == 0:
        raise HTTPException(status_code=400, detail="There must always be at least one active super admin.")

    if body.name is not None:
        target.name = body.name
    if body.role is not None:
        target.role = body.role
    if body.active is not None:
        target.active = body.active
    if body.password is not None:
        target.password_hash = auth.hash_password(body.password)
    auth.audit(session, admin, "updated admin", target.email)
    return _admin_row(target)


@router.get("/audit")
def audit_log(
    limit: int = 100, admin: Admin = Depends(auth.super_admin), session: Session = Depends(get_session)
) -> dict:
    rows = session.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(min(limit, 500)))
    return {"entries": [{"time": r.created_at.isoformat(), "admin": r.admin, "action": r.action, "target": r.target} for r in rows]}
