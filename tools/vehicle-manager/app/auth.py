"""
Authentication for vehicle-manager's own frontend, plus a service-token path
for majordom-financiar's internal server-to-server calls.

Two ways to authenticate a request — either is sufficient:

1. A user JWT (``Authorization: Bearer <token>``) — issued by ``/auth/login``,
   same shape as majordom-financiar's own ``backend/api/auth.py``, but with
   its own separate secret and its own user registry (``VEHICLE_MANAGER_``-
   prefixed env vars) — not shared with majordom-financiar, even if Doru
   sets the same username/password in both ``.env`` files so there's only
   one password to remember. The two apps' tokens are never interchangeable.
2. A service token (``X-Service-Token`` header) — a single shared secret
   (``VEHICLE_MANAGER_SERVICE_TOKEN``), configured identically in both this
   service's and majordom-financiar's ``.env``, used only by
   majordom-financiar's ``VehicleClient`` for its own internal proxy calls.
   Distinct from the per-user JWT so majordom-financiar never needs to log
   in as a "user" of vehicle-manager just to relay chat/dashboard requests.

Decided 2026-09-12 — see tools/vehicle-manager/docs/standalone-app-plan.md,
Phase 2: every endpoint requires one of the two, including calls that used
to be exempt as "internal Docker network only" — that assumption doesn't
hold once vehicle-manager is reachable more broadly (e.g. Tailscale/HTTPS
for the new standalone frontend), so it's not worth building the auth model
around it.
"""
import hmac
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# --- Configuration ---

JWT_SECRET = os.getenv("VEHICLE_MANAGER_JWT_SECRET", "change-me-this-is-not-secure")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 7

# The shared secret majordom-financiar's VehicleClient sends on every request.
# Deliberately never defaults to a non-empty placeholder — an unconfigured
# service token must never accidentally validate. See SERVICE_TOKEN_HEADER
# comparison in get_current_user_or_service() below.
SERVICE_TOKEN = os.getenv("VEHICLE_MANAGER_SERVICE_TOKEN", "")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

security = HTTPBearer(auto_error=False)


# --- User registry ---

def _load_users() -> dict[str, str]:
    """
    Build {username: hashed_password} from environment variables at startup.
    Supports VEHICLE_MANAGER_USER1_*, ..., VEHICLE_MANAGER_USER9_* — a
    separate prefix from majordom-financiar's USER1_*/USER2_* so the two
    apps' env vars never collide if they ever end up read from a shared
    place, even though each runs from its own .env file today.
    """
    users: dict[str, str] = {}
    for i in range(1, 10):
        username = os.getenv(f"VEHICLE_MANAGER_USER{i}_USERNAME", "").strip()
        password = os.getenv(f"VEHICLE_MANAGER_USER{i}_PASSWORD", "").strip()
        if username and password:
            users[username] = pwd_context.hash(password)
            logger.info("Loaded vehicle-manager user: %s", username)

    if not users:
        logger.warning(
            "No vehicle-manager users configured! Set VEHICLE_MANAGER_USER1_USERNAME "
            "and VEHICLE_MANAGER_USER1_PASSWORD in .env"
        )
    if not SERVICE_TOKEN:
        logger.warning(
            "VEHICLE_MANAGER_SERVICE_TOKEN is not set — majordom-financiar's own "
            "requests to this service will be rejected until it is configured "
            "identically in both .env files."
        )
    return users


USERS: dict[str, str] = _load_users()


# --- Token helpers ---

def create_token(username: str) -> str:
    """Create a signed JWT token valid for JWT_EXPIRY_DAYS days."""
    payload = {
        "sub": username,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_token(token: str) -> Optional[str]:
    """Return username if token is valid and not expired, otherwise None."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except JWTError as e:
        logger.debug("JWT decode failed (invalid or expired token): %s", e)
        return None


def _service_token_matches(provided: str | None) -> bool:
    """
    Constant-time comparison against the configured service token.

    Two deliberate safety properties:
    - If SERVICE_TOKEN is unset (empty string), this always returns False —
      never treat "nothing configured" as "anything goes." An unset secret
      must fail closed, not open.
    - hmac.compare_digest instead of `==` — a plain string comparison leaks
      timing information proportional to how many leading characters match,
      which is a real (if narrow) attack surface for a long-lived shared
      secret. Negligible cost here, no reason not to do it right.
    """
    if not SERVICE_TOKEN or not provided:
        return False
    return hmac.compare_digest(provided, SERVICE_TOKEN)


# --- FastAPI dependency ---

async def get_current_user_or_service(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    """
    FastAPI dependency — add to every route that requires authentication:

        @app.get("/something")
        async def my_route(caller: str = Depends(get_current_user_or_service)):
            ...

    Returns "__service__" for a valid service-token request, or the
    username for a valid user JWT. Raises HTTP 401 if neither is present
    and valid. Checked in this order (service token first) since
    majordom-financiar's proxy calls are the higher-volume caller and a
    header lookup is cheaper than a JWT decode.
    """
    service_token = request.headers.get("X-Service-Token")
    if _service_token_matches(service_token):
        return "__service__"

    if credentials is not None:
        username = _decode_token(credentials.credentials)
        if username and username in USERS:
            return username

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )


# --- Request/Response models ---

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


# --- Login route (registered directly on the app in main.py, not its own router,
# to match this module's small scope — see main.py for where it's mounted) ---

async def login(request: LoginRequest) -> TokenResponse:
    """
    Exchange username + password for a JWT token.
    The token must be included in all subsequent requests:
        Authorization: Bearer <token>
    """
    # Stripped: mobile keyboards/autocomplete commonly append a trailing
    # space after accepting a suggestion, which would otherwise silently
    # fail this exact dict-key lookup against the (also-stripped) stored
    # username. See _load_users()'s own .strip() for the matching side.
    hashed = USERS.get(request.username.strip())

    is_valid = False
    if hashed:
        try:
            is_valid = pwd_context.verify(request.password, hashed)
        except Exception:
            is_valid = False

    if not is_valid:
        logger.warning("Failed login attempt for username: %s", request.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = create_token(request.username)
    logger.info("User logged in: %s", request.username)
    return TokenResponse(access_token=token, username=request.username)
