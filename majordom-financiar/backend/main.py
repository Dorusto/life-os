"""
FastAPI application entry point.

Architecture note: this file only wires things together — middleware, routers,
static files. Business logic lives in backend/services/, data access in
backend/core/. If you want to understand what the app *does*, start with
backend/api/ and follow the calls into backend/services/.
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import aiohttp
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from backend.api import auth, receipts, transactions, chat, csv_import, proposals, budget, accounts, onboarding, setup, balance_adjustments, push, income_sources

from backend.core.config import settings
from backend.core.scheduler import scheduler

logger = logging.getLogger(__name__)

UPLOADS_DIR = Path("/app/data/uploads")
# Must exist before StaticFiles is mounted below — create eagerly at import time.
# The lifespan function also creates it, but that runs after mounting.
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs once on startup and once on shutdown."""
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        from backend.core.memory.database import MemoryDB
        from backend.core.config import settings as _settings
        db = MemoryDB(_settings.memory.db_path)
        db.seed_builtin_profiles()
        logger.info("Built-in CSV profiles seeded")
        if not db.get_notification_rule("daily_summary"):
            db.upsert_notification_rule(
                rule_type="daily_summary",
                enabled=True,
                config={"time": "20:00"},
            )
            logger.info("Default notification rule seeded: daily_summary at 20:00")
    except Exception as _e:
        logger.warning("Could not seed built-in CSV profiles: %s", _e)
    try:
        from backend.services.push_service import get_push_service
        get_push_service()  # generates VAPID keys on first run if missing
    except Exception as _e:
        logger.warning("Could not initialize push service: %s", _e)
    scheduler.start()
    logger.info("APScheduler started")

    try:
        from backend.services.notification_service import run_daily_summary
        from backend.core.memory.database import MemoryDB as _MemoryDB
        from backend.core.config import settings as _settings

        # Read time from notification_rules (default 20:00)
        _rule = _MemoryDB(_settings.memory.db_path).get_notification_rule("daily_summary")
        _time = (_rule or {}).get("config", {}).get("time", "20:00")
        _hour, _minute = map(int, _time.split(":"))

        scheduler.add_job(
            run_daily_summary,
            trigger="cron",
            hour=_hour,
            minute=_minute,
            id="daily_summary",
            replace_existing=True,
        )
        logger.info("Daily summary job scheduled at %s", _time)
    except Exception as _e:
        logger.warning("Could not schedule daily summary job: %s", _e)

    logger.info("Majordom API v2 started — uploads dir: %s", UPLOADS_DIR)
    yield
    scheduler.shutdown(wait=False)
    logger.info("APScheduler stopped")
    logger.info("Majordom API stopped")


app = FastAPI(
    title="Majordom Financiar API",
    version="2.0.0",
    # Docs available at /api/docs — useful during development, harmless on a
    # private network (Tailscale only), so we leave it on.
    docs_url="/api/docs",
    redoc_url=None,
    lifespan=lifespan,
)

# CORS is only needed when the frontend dev server (Vite, port 5173) talks
# directly to the API during local development. In production, Nginx proxies
# /api/ to this service, so both are on the same origin — no CORS needed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_cache_api(request: Request, call_next) -> Response:
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response

# Serve uploaded receipt images so the frontend can display them in the
# review screen. Path: /uploads/{receipt_id}.jpg
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

app.include_router(auth.router, prefix="/api")
app.include_router(receipts.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(csv_import.router, prefix="/api")
app.include_router(proposals.router, prefix="/api")
app.include_router(budget.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(onboarding.router, prefix="/api")
app.include_router(setup.router, prefix="/api")
app.include_router(balance_adjustments.router, prefix="/api")
app.include_router(push.router, prefix="/api")
app.include_router(income_sources.router, prefix="/api")


@app.get("/api/health")

async def health():
    """Used by Docker healthcheck and by Nginx to verify the backend is up.

    Also verifies Actual Budget is reachable so Docker won't start majordom-web
    until the full stack is operational.
    """
    url = settings.actual.url.rstrip("/") + "/"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=3)) as resp:
                if resp.status >= 500:
                    raise HTTPException(status_code=503, detail="Actual Budget returning errors")
    except aiohttp.ClientError as exc:
        raise HTTPException(status_code=503, detail=f"Cannot reach Actual Budget: {exc}")
    return {"status": "ok", "service": "majordom-api", "version": "2.0.0"}
