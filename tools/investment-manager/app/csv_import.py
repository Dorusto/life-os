"""
XTB broker report import.

XTB exports an ``.xlsx`` workbook with three sheets (plan section 5):
``Cash Operations`` (the per-event ledger, the actual import source),
``Closed Positions`` and ``Open Positions`` (both derived aggregates, useful
only as cross-checks — deliberately not imported). The real Cash Operations
header is not on row 1 (four metadata rows precede it), so the header row is
located by content rather than assumed to be first.

Two things worth knowing before reading the code:

* **Only ``Cash Operations`` is imported.** Its ``Type`` values seen in a real
  export are ``Stock sell``, ``Stock purchase``, ``Transfer`` (cash in/out of
  the brokerage account — skipped, this app tracks holdings not a cash balance)
  and dividend rows. The mapping is substring-based because XTB localises the
  label.
* **A buy/sell row carries only a signed ``Amount``, no quantity or per-unit
  price.** The quantity/price pair is recovered from the operation comment when
  XTB includes it (e.g. ``... 10 @ 182.50 ...``); if only one side is present
  the other is derived from the amount. When neither is present the row is still
  imported with ``cash_amount`` set, so cash-flow returns stay correct, but it
  contributes no units to holdings — surfaced to the user as a warning rather
  than guessed at.
"""
import io
import logging
import re
from datetime import date, datetime

from openpyxl import load_workbook

logger = logging.getLogger(__name__)

CASH_OPERATIONS_SHEET = "cash operations"

# Header names as they appear in the real export.
COL_TYPE = "Type"
COL_INSTRUMENT = "Instrument"
COL_TICKER = "Ticker"
COL_CATEGORY = "Category"
COL_TIME = "Time"
COL_AMOUNT = "Amount"
COL_ID = "ID"
COL_COMMENT = "Comment"

# "10 @ 182.50" / "10,5 @ 182,50" — XTB's operation comments put quantity,
# an at-sign, then execution price.
_QTY_PRICE_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*@\s*(\d+(?:[.,]\d+)?)")

# Ticker suffix → listing currency. A fallback only: the route layer prefers
# Twelve Data's own reported currency and only falls back to this when the
# metadata call is unavailable (no API key, offline).
_SUFFIX_CURRENCY = {
    ".DE": "EUR", ".F": "EUR", ".PA": "EUR", ".AS": "EUR", ".MI": "EUR",
    ".MC": "EUR", ".LS": "EUR", ".VI": "EUR", ".ST": "EUR", ".BE": "EUR",
    ".L": "GBP", ".SW": "CHF", ".TO": "CAD", ".V": "CAD", ".AX": "AUD",
}


def currency_from_ticker(ticker: str) -> str:
    """Best-effort listing currency from a Twelve-Data-style ticker."""
    upper = (ticker or "").upper()
    for suffix, currency in _SUFFIX_CURRENCY.items():
        if upper.endswith(suffix):
            return currency
    # US listings are usually bare ("AAPL") or ".US".
    return "USD"


# XTB's ``Category`` column values → this app's asset_type vocabulary
# (models.AssetType). Only used on first import of a ticker; a user can still
# correct it afterwards. Anything unrecognised falls back to "stock", matching
# the pre-existing behaviour.
_CATEGORY_ASSET_TYPE = {
    "stock": "stock",
    "etf": "etf",
    "crypto": "crypto",
    "bond": "bond",
    "fund": "fund",
    "etf/etn": "etf",
}


def asset_type_from_category(category: str) -> str:
    """Map XTB's Category label to this app's asset_type, defaulting to stock."""
    return _CATEGORY_ASSET_TYPE.get(_norm(category).lower(), "stock")


def _norm(value) -> str:
    return str(value).strip() if value is not None else ""


def _parse_date(value) -> str | None:
    """Normalise XTB's date cell to an ISO date string."""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = _norm(value)
    if not text:
        return None
    candidate = text.replace("T", " ").split(" ")[0]
    try:
        return date.fromisoformat(candidate).isoformat()
    except ValueError:
        pass
    for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(candidate, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _to_float(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = _norm(value).replace(" ", "")
    # XTB can localise decimal commas.
    if "," in text and "." not in text:
        text = text.replace(",", ".")
    text = text.replace(",", "")
    try:
        return float(text)
    except ValueError:
        return None


def _classify(type_text: str) -> str | None:
    """Map an XTB ``Type`` string to this app's transaction type.

    Returns ``None`` for rows this importer deliberately skips, and
    ``"__unknown__"`` for a type it doesn't recognise (reported as unparsed).
    """
    lowered = type_text.lower()
    if "transfer" in lowered or "deposit" in lowered or "withdraw" in lowered:
        return None
    if "dividend" in lowered:
        return "dividend"
    if "sell" in lowered:
        return "sell"
    if "purchase" in lowered or "buy" in lowered:
        return "buy"
    if "fee" in lowered or "commission" in lowered:
        return "fee"
    return "__unknown__"


def _find_sheet(workbook):
    for name in workbook.sheetnames:
        if name.strip().lower() == CASH_OPERATIONS_SHEET:
            return workbook[name]
    for name in workbook.sheetnames:
        if "cash" in name.strip().lower():
            return workbook[name]
    return None


def _find_header_row(rows: list[list]) -> int | None:
    """Locate the header row by content, case-insensitively.

    XTB's own exports have been observed with inconsistent header casing
    across accounts/export dates (e.g. "TYPE" vs "Type") — matching
    case-sensitively made a real, valid export fail to import. Comparison is
    case-insensitive; the header text itself (used for the column-name -> index
    map below) is still taken verbatim from the file, only lowercased for the
    lookup key.
    """
    type_key = COL_TYPE.lower()
    id_key = COL_ID.lower()
    ticker_key = COL_TICKER.lower()
    for idx, row in enumerate(rows):
        cells = {_norm(c).lower() for c in row}
        if type_key in cells and (id_key in cells or ticker_key in cells):
            return idx
    return None


def _describe_rows_for_diagnostics(rows: list[list], limit: int = 6) -> str:
    """First few non-empty rows' cell text, for a header-not-found error.

    Shown only to the user who uploaded the file, in their own browser — never
    logged server-side or persisted anywhere. Lets them (or a future support
    conversation) see exactly what the parser saw without needing the raw
    file shared anywhere.
    """
    lines = []
    shown = 0
    for row in rows:
        cells = [_norm(c) for c in row if _norm(c)]
        if not cells:
            continue
        lines.append(" | ".join(cells[:10]))
        shown += 1
        if shown >= limit:
            break
    return "\n".join(lines) if lines else "(sheet appears empty)"


def parse_xtb(file_bytes: bytes) -> dict:
    """Parse an XTB ``.xlsx`` export into transaction dicts.

    Returns ``{"transactions": [...], "transfers_skipped": n, "rows_unparsed":
    n, "warnings": [...]}``. The route layer creates securities and inserts the
    transactions (deduplicating on ``external_id``).
    """
    try:
        # NOT read_only: that mode trusts the worksheet XML's <dimension> tag
        # for row/column bounds, and third-party exporters (XTB's included,
        # confirmed live 2026-09-13) can leave it wrong/stale, silently
        # truncating iter_rows() to a couple of rows instead of raising. These
        # exports are at most a few thousand rows — full in-memory load is
        # fine, and it reads the real row count regardless of a bad dimension
        # hint.
        workbook = load_workbook(io.BytesIO(file_bytes), data_only=True)
    except Exception as exc:  # openpyxl raises several unrelated types
        raise ValueError(f"Could not read the workbook — is it a valid .xlsx file? ({exc})")

    try:
        sheet = _find_sheet(workbook)
        if sheet is None:
            raise ValueError(
                "No 'Cash Operations' sheet found — is this an XTB account report?"
            )

        rows = [list(r) for r in sheet.iter_rows(values_only=True)]
    finally:
        workbook.close()

    header_idx = _find_header_row(rows)
    if header_idx is None:
        raise ValueError(
            "Could not find the Cash Operations header row. Expected a row containing "
            f"'{COL_TYPE}' and either '{COL_ID}' or '{COL_TICKER}' (case-insensitive). "
            f"First rows found in the sheet:\n{_describe_rows_for_diagnostics(rows)}"
        )

    header = [_norm(c) for c in rows[header_idx]]
    # Lowercased keys — column lookups below are case-insensitive to match
    # _find_header_row's own tolerance (see its docstring).
    col = {name.lower(): i for i, name in enumerate(header)}

    def cell(row: list, name: str):
        idx = col.get(name.lower())
        if idx is None or idx >= len(row):
            return None
        return row[idx]

    transactions: list[dict] = []
    warnings: list[str] = []
    transfers_skipped = 0
    rows_unparsed = 0

    for row in rows[header_idx + 1:]:
        type_text = _norm(cell(row, COL_TYPE))
        ticker = _norm(cell(row, COL_TICKER))
        if not type_text and not ticker:
            continue

        txn_type = _classify(type_text)
        if txn_type is None:
            transfers_skipped += 1
            continue
        if txn_type == "__unknown__":
            rows_unparsed += 1
            continue

        if not ticker:
            rows_unparsed += 1
            continue

        iso_date = _parse_date(cell(row, COL_TIME))
        if not iso_date:
            rows_unparsed += 1
            continue

        amount = _to_float(cell(row, COL_AMOUNT))
        comment = _norm(cell(row, COL_COMMENT))
        external_id = _norm(cell(row, COL_ID)) or None

        quantity: float | None = None
        price: float | None = None
        match = _QTY_PRICE_RE.search(comment)
        if match:
            quantity = _to_float(match.group(1))
            price = _to_float(match.group(2))

        if txn_type in ("buy", "sell"):
            # Fill whichever side of quantity/price the comment omitted, using
            # the absolute cash amount. Fees aren't separable from Amount here.
            if amount is not None and amount != 0:
                if quantity is None and price:
                    quantity = abs(amount) / price
                elif price is None and quantity:
                    price = abs(amount) / quantity
            if quantity is None or price is None:
                warnings.append(
                    f"{iso_date} {ticker}: no quantity/price in comment — "
                    "recorded as a cash flow only, excluded from holdings"
                )

        transactions.append({
            "ticker": ticker,
            "name": _norm(cell(row, COL_INSTRUMENT)) or None,
            "asset_type": asset_type_from_category(_norm(cell(row, COL_CATEGORY))),
            "date": iso_date,
            "type": txn_type,
            "quantity": quantity,
            "price_per_unit": price,
            "fees": 0.0,
            "cash_amount": amount,
            "currency": currency_from_ticker(ticker),
            "notes": comment or None,
            "external_id": external_id,
            "source": "csv_import",
        })

    logger.info(
        "XTB parse: %d transactions, %d transfers skipped, %d unparsed",
        len(transactions), transfers_skipped, rows_unparsed,
    )
    return {
        "transactions": transactions,
        "transfers_skipped": transfers_skipped,
        "rows_unparsed": rows_unparsed,
        "warnings": warnings,
    }
