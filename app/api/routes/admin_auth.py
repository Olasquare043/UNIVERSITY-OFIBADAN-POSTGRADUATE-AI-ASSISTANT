"""Admin sign-in, sign-out and the signed-in admin's own details."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import config
from app.db import get_session
from app.models import Admin
from app.services import auth

router = APIRouter(prefix="/api/admin")


class LoginRequest(BaseModel):
    email: str
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


def admin_info(admin: Admin) -> dict:
    return {"id": admin.id, "email": admin.email, "name": admin.name, "role": admin.role}


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response, session: Session = Depends(get_session)) -> dict:
    throttle_key = f"{request.client.host if request.client else 'unknown'}|{body.email.strip().lower()}"
    if auth.too_many_failures(throttle_key):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")

    admin = auth.authenticate(session, body.email, body.password)
    if not admin:
        auth.record_failure(throttle_key)
        raise HTTPException(status_code=401, detail="Wrong email or password.")

    auth.clear_failures(throttle_key)
    response.set_cookie(
        auth.COOKIE_NAME,
        auth.make_session_token(admin),
        max_age=auth.SESSION_HOURS * 3600,
        httponly=True,
        secure=request.url.scheme == "https" or config.REQUIRE_DATABASE,
        samesite="strict",
        path="/",
    )
    return admin_info(admin)


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(auth.COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(admin: Admin = Depends(auth.current_admin)) -> dict:
    return admin_info(admin)


@router.post("/me/password")
def change_password(body: PasswordChange, admin: Admin = Depends(auth.current_admin), session: Session = Depends(get_session)) -> dict:
    if not auth.verify_password(body.current_password, admin.password_hash):
        raise HTTPException(status_code=400, detail="The current password is wrong.")
    if len(body.new_password) < 10:
        raise HTTPException(status_code=400, detail="Use at least 10 characters for the new password.")
    admin.password_hash = auth.hash_password(body.new_password)
    auth.audit(session, admin, "changed own password")
    return {"ok": True}
