"""Admin accounts: password hashing, signed login cookies, and who may do what."""
import hashlib
import hmac
import logging
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import config
from app.db import get_session, session_scope
from app.models import Admin, AuditLog

logger = logging.getLogger("uvicorn.error")

COOKIE_NAME = "ui_pg_admin"
SESSION_HOURS = 12
MAX_FAILED_LOGINS = 5
LOCKOUT_SECONDS = 15 * 60

ROLES = ("super_admin", "editor")

_secret: str | None = None
_failures: dict[str, deque] = defaultdict(deque)  # login key -> timestamps of recent failures


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
        candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
        return hmac.compare_digest(candidate.hex(), digest)
    except ValueError:
        return False


def _signing_secret() -> str:
    global _secret
    if _secret is None:
        if config.SECRET_KEY:
            _secret = config.SECRET_KEY
        elif config.REQUIRE_DATABASE:
            raise RuntimeError("SECRET_KEY is not set. Set it to a long random string.")
        else:
            logger.warning("SECRET_KEY is not set: admin logins will not survive a restart.")
            _secret = secrets.token_hex(32)
    return _secret


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(_signing_secret(), salt="admin-session")


def make_session_token(admin: Admin) -> str:
    return _serializer().dumps({"id": admin.id})


def read_session_token(token: str) -> int | None:
    try:
        return _serializer().loads(token, max_age=SESSION_HOURS * 3600)["id"]
    except (BadSignature, KeyError):
        return None


def too_many_failures(key: str) -> bool:
    window = _failures[key]
    while window and time.monotonic() - window[0] > LOCKOUT_SECONDS:
        window.popleft()
    return len(window) >= MAX_FAILED_LOGINS


def record_failure(key: str) -> None:
    _failures[key].append(time.monotonic())


def clear_failures(key: str) -> None:
    _failures.pop(key, None)


def authenticate(session: Session, email: str, password: str) -> Admin | None:
    admin = session.scalar(select(Admin).where(func.lower(Admin.email) == email.strip().lower()))
    if admin and admin.active and verify_password(password, admin.password_hash):
        admin.last_login = datetime.now(timezone.utc)
        return admin
    return None


def ensure_first_admin() -> None:
    """Create the first super admin from ADMIN_EMAIL and ADMIN_PASSWORD when there are no admins."""
    if not (config.ADMIN_EMAIL and config.ADMIN_PASSWORD):
        return
    with session_scope() as session:
        if session.scalar(select(func.count()).select_from(Admin)):
            return
        session.add(
            Admin(
                email=config.ADMIN_EMAIL.strip().lower(),
                name="Administrator",
                password_hash=hash_password(config.ADMIN_PASSWORD),
                role="super_admin",
            )
        )
        logger.info("Created the first admin account for %s", config.ADMIN_EMAIL)


def current_admin(request: Request, session: Session = Depends(get_session)) -> Admin:
    token = request.cookies.get(COOKIE_NAME)
    admin_id = read_session_token(token) if token else None
    admin = session.get(Admin, admin_id) if admin_id else None
    if not admin or not admin.active:
        raise HTTPException(status_code=401, detail="Please sign in.")
    return admin


def super_admin(admin: Admin = Depends(current_admin)) -> Admin:
    if admin.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only a super admin can do this.")
    return admin


def audit(session: Session, admin: Admin, action: str, target: str = "") -> None:
    session.add(AuditLog(admin=admin.email, action=action, target=target[:300]))
