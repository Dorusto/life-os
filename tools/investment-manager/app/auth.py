"""
Authentication for investment-manager's own frontend, plus a service-token
path for majordom-financiar's internal server-to-server calls.

Copied and adapted from tools/vehicle-manager/app/auth.py (same shape, own
prefix/secrets) — see that file's own docstring for the full reasoning; not
repeated here. Two ways to authenticate a request, either is sufficient:

1. A user JWT (``Authorization: Bearer <token>``) — issued by ``/auth/login``,
   its own separate secret and user registry (``INVESTMENT_MANAGER_``-
   prefixed env vars) — never shared with majordom-financiar or
   vehicle-manager's own logins, even if the same username/password is set
   in more than one ``.env`` for convenience.
2. A service token (``X-Service-Token`` header) — a single shared secret
   (``INVESTMENT_MANAGER_SERVICE_TOKEN``), configured identically here and
   in majordom-financiar's own ``.env``, used only by majordom-financiar's
   internal proxy calls for coaching (#167/#177) and notifications.

Per tools/standalone-app-playbook.md section 2 and 4: this module is
security-sensitive and was written directly, not delegated — do not have
DeepSeek/Aider regenerate or "improve" it. Copy it in as-is.
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

JWT_SECRET = os.getenv("INVESTMENT_MANAGER_JWT_SECRET", "change-me-this-is-not-secure")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 7

# The shared secret majordom-financiar's InvestmentClient sends on every request.
# Deliberately never defaults to a non-empty placeholder — an unconfigured
# service token must never accidentally validate.
SERVICE_TOKEN = os.getenv("INVESTMENT_MANAGER_SERVICE_TOKEN", "")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

security = HTTPBearer(auto_error=False)


# --- User registry ---

def _load_users() -> dict[str, str]:
    """
    Build {username: hashed_password} from environment variables at startup.
    Supports INVESTMENT_MANAGER_USER1_*, ..., INVESTMENT_MANAGER_USER9_* — a
    separate prefix from every other app's own USER1_*/USER2_* vars so they
    never collide even if read from a shared place.
    """
    users: dict[str, str] = {}
    for i in range(1, 10):
        username = os.getenv(f"INVESTMENT_MANAGER_USER{i}_USERNAME", "").strip()
        password = os.getenv(f"INVESTMENT_MANAGER_USER{i}_PASSWORD", "").strip()
        if username and password:
            users[username] = pwd_context.hash(password)
            logger.info("Loaded investment-manager user: %s", username)

    if not users:
        logger.warning(
            "No investment-manager users configured! Set INVESTMENT_MANAGER_USER1_USERNAME "
            "and INVESTMENT_MANAGER_USER1_PASSWORD in .env"
        )
    if not SERVICE_TOKEN:
        logger.warning(
            "INVESTMENT_MANAGER_SERVICE_TOKEN is not set — majordom-financiar's own "
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

    - If SERVICE_TOKEN is unset (empty string), this always returns False —
      an unset secret must fail closed, not open.
    - hmac.compare_digest instead of `==` to avoid a timing side-channel on a
      long-lived shared secret.
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
    and valid.
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


# --- Login route (registered directly on the app in main.py, not its own
# router, to match vehicle-manager's own convention for this module) ---

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
