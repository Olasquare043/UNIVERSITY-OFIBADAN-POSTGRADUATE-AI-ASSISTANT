import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import admin_analytics, admin_auth, admin_kb, admin_models, admin_settings, chat, public
from app.db import init_db
from app.services import analytics, auth, kb

logger = logging.getLogger("uvicorn.error")

FRONTEND_DIR = Path("frontend/dist")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    kb.seed_if_empty()
    auth.ensure_first_admin()
    kb.fail_stale_processing()
    analytics.purge_old_logs()
    yield


app = FastAPI(title="University of Ibadan Postgraduate AI Assistant", lifespan=lifespan)

# The app and the API share one origin, so CORS is only needed for a separately hosted frontend.
allowed_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
if allowed_origins:
    app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def add_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("Permissions-Policy", "microphone=(self), camera=(), geolocation=()")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
        "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
    )
    path = request.url.path
    if path.startswith("/api/admin"):
        response.headers["Cache-Control"] = "no-store"
    elif path.startswith("/assets/"):
        response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
    elif not path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache"  # the app shell and service worker must always be revalidated
    return response


for router in (
    public.router,
    chat.router,
    admin_auth.router,
    admin_kb.router,
    admin_models.router,
    admin_settings.router,
    admin_analytics.router,
):
    app.include_router(router)


class SinglePageApp(StaticFiles):
    """Serve the built frontend, and index.html for app routes such as /admin/knowledge so a refresh works."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as error:
            if error.status_code == 404 and not path.startswith("api/"):
                return await super().get_response("index.html", scope)
            raise


if FRONTEND_DIR.exists():
    app.mount("/", SinglePageApp(directory=FRONTEND_DIR, html=True), name="frontend")
else:
    logger.warning("frontend/dist not found: serving the API only. Run 'npm run build' in frontend/.")
