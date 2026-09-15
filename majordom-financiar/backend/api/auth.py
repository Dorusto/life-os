"""
Authentication: username + password → JWT token.

Why this approach (not OAuth, not a user database):
- This is a 2-person household tool on a private network.
- Users are defined in .env: USER1_USERNAME / USER1_PASSWORD, USER2_USERNAME / USER2_PASSWORD.
- Passwords are read as plaintext from .env and hashed in memory at startup —
  no pre-hashing step needed, making first-time setup simple.
- JWT tokens are stateless: no sessions table, no Redis, no state to manage.
  A 7-day token means you stay logged in across app restarts.

If you want to add a third user in the future, add USER3_USERNAME / USER3_PASSWORD to .env
and restart the container.
"""
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from backend.core.config import settings
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Configuration ---

# The old hardcoded default. Kept ONLY as a sentinel so deployments that never
# set JWT_SECRET keep working (with a loud warning) instead of hard-failing —
# this is a single-user, Tailscale-only deployment. Never a recommended value.
_INSECURE_FALLBACK_SECRET = "change-me-this-is-not-secure"


def _resolve_jwt_secret() -> str:
    """
    Read the JWT signing secret from the settings singleton (architecture rule 4).

    Empty or legacy-fallback value → sign with the fallback anyway, but log ONE
    loud warning: tokens signed with a known constant are forgeable by anyone
    who has ever read this repo. The secret value itself is never logged.
    """
    secret = settings.jwt_secret
    if not secret or secret == _INSECURE_FALLBACK_SECRET:
        logger.warning(
            "JWT_SECRET is not set (or is the built-in fallback): tokens are "
            "being signed with the built-in fallback secret, which is unsafe — "
            "anyone who knows it can forge valid login tokens. Set a real "
            "JWT_SECRET in .env (e.g. `openssl rand -hex 32`)."
        )
        return _INSECURE_FALLBACK_SECRET
    return secret


JWT_SECRET: str = _resolve_jwt_secret()
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 7

# passlib handles bcrypt hashing. We use bcrypt because it's slow by design —
# brute-forcing a stolen .env file is expensive.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Bearer token scheme: client sends "Authorization: Bearer <token>" header.
# auto_error=False means we return 401 ourselves with a clearer message.
security = HTTPBearer(auto_error=False)


# --- User registry ---

def _load_users() -> dict[str, str]:
    """
    Build {username: hashed_password} from environment variables at startup.
    Supports USER1_*, USER2_*, ..., USER9_*.
    """
    users: dict[str, str] = {}
    for i in range(1, 10):
        username = os.getenv(f"USER{i}_USERNAME", "").strip()
        password = os.getenv(f"USER{i}_PASSWORD", "").strip()
        if username and password:
            users[username] = pwd_context.hash(password)
            logger.info("Loaded user: %s", username)

    if not users:
        logger.warning(
            "No users configured! Set USER1_USERNAME and USER1_PASSWORD in .env"
        )
    return users


# Loaded once at module import time (i.e., at container startup).
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


# --- FastAPI dependency ---

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    """
    FastAPI dependency — add to any route that requires authentication:

        @router.get("/something")
        async def my_route(user: str = Depends(get_current_user)):
            ...

    Returns the username string on success, raises HTTP 401 on failure.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    username = _decode_token(credentials.credentials)
    if not username or username not in USERS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return username


# --- Request/Response models ---

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


# --- Routes ---

@router.post("/auth/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """
    Exchange username + password for a JWT token.
    The token must be included in all subsequent requests:
        Authorization: Bearer <token>
    """
    hashed = USERS.get(request.username)

    # Verify password — wrapped in try/except because passlib raises on malformed
    # hashes (shouldn't happen with real users, but defensive is better here).
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
