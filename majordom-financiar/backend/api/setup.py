"""
First-launch setup endpoints.

GET  /api/setup/status              — whether setup is complete + AB-connected + on-budget account list
POST /api/setup/complete            — marks setup complete; if path="today", adjusts account
                                       balances in Actual Budget to match user-entered real values
POST /api/setup/ab-test-connection  — live-validates AB url/password/file before saving (#190)
POST /api/setup/ab-credentials      — re-validates, encrypts, and saves AB credentials (#190)

The setup flag lives in SQLite user_preferences (key="setup_complete", value="1").
It is per-server, not per-user — both users share the same Actual Budget file, so
setup only needs to happen once. AB connection credentials (separate concern from
the "enter your account balances" onboarding above) are stored encrypted via
backend.core.config.ab_credential_store, under a different preference key.
"""
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.actual_client.client import _classify_ab_connection_error
from backend.core.config import settings
from backend.core.finance.provider import get_provider
from backend.core.memory.database import MemoryDB

logger = logging.getLogger(__name__)
router = APIRouter()

SETUP_KEY = "setup_complete"


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AccountBalance(BaseModel):
    account_id: str
    real_balance: float


class NewAccount(BaseModel):
    name: str
    balance: float


class SetupCompleteRequest(BaseModel):
    path: str  # "today" | "history"
    balances: list[AccountBalance] = []
    new_accounts: list[NewAccount] = []


class AccountInfo(BaseModel):
    id: str
    name: str
    balance: float


class SetupStatus(BaseModel):
    completed: bool
    ab_connected: bool
    accounts: list[AccountInfo]


class AbBudgetFile(BaseModel):
    id: str
    name: str


class AbTestConnectionRequest(BaseModel):
    base_url: str
    password: str
    file: str | None = None  # budget id or name; omit to just list available budgets


class AbTestConnectionResponse(BaseModel):
    success: bool
    error: str | None = None
    error_type: str | None = None  # "connection" | "auth" | "file_not_found"
    files: list[AbBudgetFile] = []


class AbSaveCredentialsRequest(BaseModel):
    base_url: str
    password: str
    file: str  # required here — must be a concrete budget id/name by save time


class AbSaveCredentialsResponse(BaseModel):
    success: bool
    budget_name: str = ""
    error: str | None = None


class AdjustmentResult(BaseModel):
    account_name: str
    adjustment: float  # positive = deposit added, negative = payment added


class SetupCompleteResponse(BaseModel):
    adjustments: list[AdjustmentResult] = []


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/setup/status", response_model=SetupStatus)
async def setup_status(current_user: str = Depends(get_current_user)):
    db = MemoryDB(db_path=settings.memory.db_path)
    completed = db.get_preference(SETUP_KEY) == "1"

    account_list: list[AccountInfo] = []
    if settings.actual.is_configured:
        client = get_provider()
        try:
            accounts = await client.get_accounts()
            account_list = [AccountInfo(id=a.id, name=a.name, balance=a.balance) for a in accounts]
        except Exception as e:
            logger.warning("Could not fetch accounts for setup status: %s", e)
            account_list = []

    return SetupStatus(
        completed=completed,
        ab_connected=settings.actual.is_configured,
        accounts=account_list,
    )


# ---------------------------------------------------------------------------
# AB setup wizard (#190) — live-validated connection, encrypted storage
# ---------------------------------------------------------------------------

@router.post("/setup/ab-test-connection", response_model=AbTestConnectionResponse)
async def ab_test_connection(
    body: AbTestConnectionRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Live-validates base_url/password/file against a real Actual Budget server
    before anything is saved. Confirmed by reading actualpy's own source
    (`ActualServer.__init__` / `.login()` / `.validate()`): constructing
    `Actual(base_url=..., password=...)` *without* entering it as a context
    manager already performs the login/auth round-trip — `.login()` raises
    `actual.exceptions.AuthorizationError` on a rejected password, and a
    connection failure (unreachable host, DNS, timeout) surfaces as an
    `httpx.HTTPError` subclass from the same call, before any status-code
    check runs. `file` is deliberately NOT passed to `Actual(...)` here —
    doing so would call `set_file()`/require a valid file, but at this point
    the caller may not know the exact file yet and wants the budget list.
    """
    from actual import Actual

    server = None
    try:
        server = Actual(base_url=body.base_url, password=body.password)
    except Exception as e:
        error_type, message = _classify_ab_connection_error(e)
        logger.info("AB test-connection failed (%s): %s", error_type, e)
        return AbTestConnectionResponse(success=False, error=message, error_type=error_type)

    try:
        files_response = server.list_user_files()
        files = [
            AbBudgetFile(id=f.file_id, name=f.name)
            for f in files_response.data
            if not f.deleted
        ]
        if body.file:
            match = next((f for f in files if f.id == body.file or f.name == body.file), None)
            if not match:
                return AbTestConnectionResponse(
                    success=False,
                    error=f"No budget file matching '{body.file}' found on this server.",
                    error_type="file_not_found",
                    files=files,
                )
        return AbTestConnectionResponse(success=True, files=files)
    except Exception as e:
        error_type, message = _classify_ab_connection_error(e)
        logger.info("AB test-connection failed listing budgets (%s): %s", error_type, e)
        return AbTestConnectionResponse(success=False, error=message, error_type=error_type)
    finally:
        # Not used as a context manager (see docstring above) — close the
        # underlying HTTP client explicitly instead of leaking a connection.
        server._requests_session.close()


@router.post("/setup/ab-credentials", response_model=AbSaveCredentialsResponse)
async def save_ab_credentials(
    body: AbSaveCredentialsRequest,
    current_user: str = Depends(get_current_user),
):
    """Re-validates (never trusts an earlier /ab-test-connection call blindly),
    then encrypts and saves the credentials, then reloads the live `settings`
    singleton so the connection works immediately, no restart needed."""
    test_result = await ab_test_connection(
        AbTestConnectionRequest(base_url=body.base_url, password=body.password, file=body.file),
        current_user=current_user,
    )
    if not test_result.success:
        return AbSaveCredentialsResponse(success=False, error=test_result.error)

    budget = next((f for f in test_result.files if f.id == body.file or f.name == body.file), None)
    sync_id = budget.id if budget else body.file

    from backend.core.config.ab_credential_store import save_credentials

    save_credentials(settings.memory.db_path, body.base_url, body.password, sync_id)
    settings.actual.reload_from_db()

    logger.info("AB credentials saved by %s (budget=%s)", current_user, budget.name if budget else sync_id)
    return AbSaveCredentialsResponse(success=True, budget_name=budget.name if budget else sync_id)


@router.post("/setup/complete", response_model=SetupCompleteResponse)
async def setup_complete(
    body: SetupCompleteRequest,
    current_user: str = Depends(get_current_user),
):
    db = MemoryDB(db_path=settings.memory.db_path)
    adjustments: list[AdjustmentResult] = []

    client = get_provider()

    if body.path == "today" and (body.balances or body.new_accounts):
        # Create new accounts first, then adjust their balance
        for new_acc in body.new_accounts:
            if not new_acc.name.strip():
                continue
            try:
                created = await client.create_account(new_acc.name.strip(), initial_balance=0.0)
                diff = await client.adjust_account_balance(created.id, new_acc.balance)
                if abs(diff) >= 0.01:
                    adjustments.append(AdjustmentResult(
                        account_name=created.name,
                        adjustment=round(diff, 2),
                    ))
            except Exception as e:
                logger.warning("New account creation failed for %s: %s", new_acc.name, e)

        if body.balances:
            accounts = await client.get_accounts()
            account_name_map = {a.id: a.name for a in accounts}

            for entry in body.balances:
                try:
                    diff = await client.adjust_account_balance(entry.account_id, entry.real_balance)
                    if abs(diff) >= 0.01:
                        adjustments.append(AdjustmentResult(
                            account_name=account_name_map.get(entry.account_id, entry.account_id),
                            adjustment=round(diff, 2),
                        ))
                except Exception as e:
                    logger.warning("Balance adjustment failed for %s: %s", entry.account_id, e)

    # Auto-create default category groups if AB has none
    try:
        await _ensure_default_categories(client)
    except Exception as e:
        logger.warning("Default category creation failed (non-fatal): %s", e)

    db.set_preference(SETUP_KEY, "1")
    logger.info("Setup completed by %s (path=%s, adjustments=%d)", current_user, body.path, len(adjustments))
    return SetupCompleteResponse(adjustments=adjustments)


# Groups and their subcategories from categories.json
_DEFAULT_GROUPS: list[tuple[str, list[str]]] = [
    ("Housing",      ["Home & Maintenance", "Utilities"]),
    ("Daily Living", ["Groceries & Drinks", "Clothing", "Children"]),
    ("Transport",    ["Transport"]),
    ("Health",       ["Health"]),
    ("Lifestyle",    ["Restaurants & Cafes", "Entertainment & Vacation", "Personal"]),
    ("Finance",      ["Investments & Savings"]),
    ("Unexpected",   ["Other"]),
]


async def _ensure_default_categories(client) -> None:
    # Checking "any categories exist" isn't enough — Actual Budget seeds its own
    # default template (Food/General/Bills/Bills (Flexible)/Savings) on every new
    # budget created via its UI, so `existing` is never empty on a fresh install
    # and Majordom's own 12-category template never got created (#154). Check for
    # Majordom's own group names specifically instead; leaves AB's defaults in
    # place if present rather than deleting them.
    existing_groups = await client.get_category_groups()
    if any(group_name in existing_groups for group_name, _ in _DEFAULT_GROUPS):
        return
    logger.info("Majordom category groups not found — creating default 7 groups")
    for group_name, sub_names in _DEFAULT_GROUPS:
        try:
            await client.create_category_group(group_name)
        except Exception as e:
            logger.warning("Could not create group %s: %s", group_name, e)
            continue
        for sub_name in sub_names:
            try:
                await client.create_category(sub_name, group_name)
            except Exception as e:
                logger.warning("Could not create category %s in %s: %s", sub_name, group_name, e)
