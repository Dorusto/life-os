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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.api import auth, receipts, transactions, chat

logger = logging.getLogger(__name__)

UPLOADS_DIR = Path("/app/data/uploads")
# Must exist before StaticFiles is mounted below — create eagerly at import time.
# The lifespan function also creates it, but that runs after mounting.
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs once on startup and once on shutdown."""
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Majordom API v2 started — uploads dir: %s", UPLOADS_DIR)
    yield
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

# Serve uploaded receipt images so the frontend can display them in the
# review screen. Path: /uploads/{receipt_id}.jpg
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

app.include_router(auth.router, prefix="/api")
app.include_router(receipts.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(chat.router, prefix="/api")


@app.get("/api/health")
async def health():
    """Used by Docker healthcheck and by Nginx to verify the backend is up."""
    return {"status": "ok", "service": "majordom-api", "version": "2.0.0"}
