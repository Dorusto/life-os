"""
Pydantic request/response models for the investment-manager REST API.

Kept deliberately thin: these describe the REST boundary only. All persistence
lives in ``database.py`` and all portfolio math lives in ``stats.py`` — a route
handler validates with one of these models, delegates, and returns.
"""
from typing import Literal

from pydantic import BaseModel, Field, field_validator

AssetType = Literal["stock", "etf", "crypto", "bond", "fund", "other"]
TransactionType = Literal["buy", "sell", "dividend", "fee"]


# ---------------------------------------------------------------------------
# Securities
# ---------------------------------------------------------------------------

class SecurityCreate(BaseModel):
    ticker: str = Field(..., min_length=1, description="Twelve Data symbol, e.g. VWCE.DE")
    name: str | None = None
    asset_type: AssetType = "stock"
    # Omitted → resolved from Twelve Data metadata, then from the ticker suffix.
    currency: str | None = Field(None, min_length=1, max_length=8)

    @field_validator("ticker")
    @classmethod
    def _upper_ticker(cls, v: str) -> str:
        # Twelve Data symbols are case-sensitive in principle, but for a
        # personal tracker a single canonical casing avoids duplicate
        # securities differing only by case on manual entry.
        return v.strip()


class Security(BaseModel):
    id: int
    ticker: str
    name: str | None = None
    asset_type: str | None = None
    currency: str


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

class TransactionCreate(BaseModel):
    security_id: int
    date: str
    type: TransactionType
    quantity: float | None = None
    price_per_unit: float | None = None
    fees: float = 0.0
    currency: str | None = None
    notes: str | None = None
    source: str = "manual"
    external_id: str | None = None
    # Signed cash value of the event in its own currency (negative = money out).
    # Optional for manually-entered buys/sells (derivable from quantity*price);
    # required to preserve cash flows for broker imports that don't carry a
    # per-unit price. See database.py's transactions schema comment.
    cash_amount: float | None = None


class Transaction(BaseModel):
    id: int
    security_id: int
    ticker: str | None = None
    security_name: str | None = None
    date: str
    type: str
    quantity: float | None = None
    price_per_unit: float | None = None
    fees: float = 0.0
    currency: str
    notes: str | None = None
    source: str
    external_id: str | None = None
    cash_amount: float | None = None


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

class XtbImportResult(BaseModel):
    securities_created: int
    transactions_inserted: int
    transactions_skipped: int
    transfers_skipped: int
    rows_unparsed: int
    warnings: list[str] = []


# ---------------------------------------------------------------------------
# Target allocation / rebalancing
# ---------------------------------------------------------------------------

class TargetAllocationItem(BaseModel):
    target_key: str
    target_percentage: float = Field(..., ge=0, le=100)


class TargetAllocationRequest(BaseModel):
    targets: list[TargetAllocationItem]


# ---------------------------------------------------------------------------
# Goals
# ---------------------------------------------------------------------------

class GoalCreate(BaseModel):
    name: str = Field(..., min_length=1)
    target_amount: float = Field(..., gt=0)
    target_date: str


class Goal(BaseModel):
    id: int
    name: str
    target_amount: float
    target_date: str


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class SettingsUpdate(BaseModel):
    benchmark_ticker: str | None = None
    assumed_annual_return: float | None = Field(None, ge=-1, le=1)


# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------

class DeleteResult(BaseModel):
    deleted: bool


class HealthResponse(BaseModel):
    status: str
