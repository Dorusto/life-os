"""
Portfolio math for investment-manager: cost basis, returns, allocation,
rebalancing and goal projections.

Design notes worth keeping in view (plan section 7):

* **Cost basis is average cost, not FIFO/LIFO.** This is a personal tracking /
  coaching tool, not a tax-reporting tool — average cost is simpler and
  sufficient, and matches the project's ``coach-not-consultant`` precedent.
  Do not treat any figure produced here as tax-accurate.
* **XIRR and TWR answer different questions** and are both shown on purpose.
  XIRR is money-weighted ("how did investing the way I actually invested
  perform"), TWR is time-weighted ("how did the underlying investments
  perform, independent of when money moved"). They can legitimately differ
  whenever cash flows happen at different times.
* **All EUR conversion uses the latest available FX rate**, including for
  historical values. Per-transaction historical FX is not tracked, so a
  multi-currency gain/loss figure carries that approximation. It is exact for
  a EUR-only portfolio.
* **Sector/geography allocation is deliberately absent.** Twelve Data's free
  price endpoints don't include sector metadata cheaply (plan section 7's note),
  so this app groups by security, asset type and currency instead of inventing
  sector labels.

The pure functions (``compute_position``, ``xirr``, ``compute_twr``) take plain
arguments and no I/O, so they can be unit-tested without an API key; the
``build_*`` functions are the DB/market-data-facing wrappers.
"""
import logging
from datetime import date, datetime, timedelta

from app import database, market_data

logger = logging.getLogger(__name__)

EPSILON = 1e-9


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _to_float(value, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _fx_to_eur(currency: str, cache: dict) -> float:
    """Latest currency → EUR rate, memoised per call."""
    currency = (currency or "EUR").upper()
    if currency not in cache:
        try:
            cache[currency] = market_data.get_fx_rate(currency, "EUR")
        except market_data.MarketDataError as exc:
            logger.warning("No FX rate %s→EUR (%s); treating as 1.0", currency, exc)
            cache[currency] = 1.0
    return cache[currency]


def _transaction_cash_native(txn: dict) -> float:
    """Signed cash value of a transaction in its own currency.

    Positive = money received (sell/dividend), negative = money paid
    (buy/fee). Prefers a stored ``cash_amount`` (imports), falls back to
    quantity × price ± fees for manually-entered rows.
    """
    if txn.get("cash_amount") is not None:
        return _to_float(txn["cash_amount"])
    qty = _to_float(txn.get("quantity"))
    price = _to_float(txn.get("price_per_unit"))
    fees = _to_float(txn.get("fees"))
    txn_type = txn.get("type")
    if txn_type == "buy":
        return -(qty * price + fees)
    if txn_type == "sell":
        return qty * price - fees
    if txn_type in ("dividend",):
        return 0.0
    if txn_type == "fee":
        return -fees
    return 0.0


# ---------------------------------------------------------------------------
# Position / cost basis (average cost)
# ---------------------------------------------------------------------------

def compute_position(transactions: list[dict]) -> dict:
    """Average-cost position from one security's transactions (oldest first).

    Returns ``shares``, ``cost_basis_native`` (cost of the shares still held),
    ``avg_cost_native``, ``realized_gain_native`` and ``dividends_native``.

    A sell without a known share count (possible for an imported cash-only row)
    is ignored for the share ledger — it still contributes to cash-flow returns
    via ``cash_amount`` elsewhere, but inventing a share reduction would corrupt
    the basis of the remaining position.
    """
    shares = 0.0
    cost_native = 0.0
    realized = 0.0
    dividends = 0.0

    for txn in transactions:
        txn_type = txn.get("type")
        qty = _to_float(txn.get("quantity"))
        price = _to_float(txn.get("price_per_unit"))
        fees = _to_float(txn.get("fees"))

        if txn_type == "buy":
            if qty <= 0:
                continue
            shares += qty
            cost_native += qty * price + fees
        elif txn_type == "sell":
            if shares <= EPSILON or qty <= 0:
                continue
            avg = cost_native / shares
            sold = min(qty, shares)
            cost_native -= sold * avg
            shares -= sold
            realized += sold * price - fees - sold * avg
            if shares <= EPSILON:
                shares = 0.0
                cost_native = 0.0
        elif txn_type == "dividend":
            dividends += _transaction_cash_native(txn)
        elif txn_type == "fee":
            # A standalone fee (e.g. account/custody fee) is treated as an
            # increase in cost basis when there is a position to attach it to.
            if shares > EPSILON:
                cost_native += _to_float(txn.get("fees")) or abs(
                    _transaction_cash_native(txn)
                )

    avg_cost = (cost_native / shares) if shares > EPSILON else None
    return {
        "shares": round(shares, 8),
        "cost_basis_native": round(cost_native, 8),
        "avg_cost_native": avg_cost,
        "realized_gain_native": round(realized, 8),
        "dividends_native": round(dividends, 8),
    }


def _transactions_by_security(db_path: str | None) -> dict[int, list[dict]]:
    grouped: dict[int, list[dict]] = {}
    for txn in database.get_transactions(db_path=db_path):
        grouped.setdefault(txn["security_id"], []).append(txn)
    # get_transactions returns newest first; positions must run oldest first.
    for group in grouped.values():
        group.sort(key=lambda t: (t["date"], t["id"]))
    return grouped


def build_holdings(db_path: str | None = None, include_closed: bool = False) -> list[dict]:
    """Current open positions with market value and gain/loss, in native and EUR."""
    securities = {s["id"]: s for s in database.get_securities(db_path=db_path)}
    grouped = _transactions_by_security(db_path)
    fx_cache: dict[str, float] = {}
    price_cache: dict[str, float | None] = {}

    holdings: list[dict] = []
    for security_id, txns in grouped.items():
        security = securities.get(security_id)
        if security is None:
            continue
        position = compute_position(txns)
        if position["shares"] <= EPSILON and not include_closed:
            continue

        ticker = security["ticker"]
        currency = security["currency"] or "EUR"
        if ticker not in price_cache:
            try:
                price_cache[ticker] = market_data.get_price(ticker, currency)
            except market_data.MarketDataError as exc:
                logger.warning("No live price for %s: %s", ticker, exc)
                price_cache[ticker] = None
        price = price_cache[ticker]

        fx = _fx_to_eur(currency, fx_cache)
        shares = position["shares"]
        market_value_native = shares * price if price is not None else None
        market_value_eur = market_value_native * fx if market_value_native is not None else None
        cost_eur = position["cost_basis_native"] * fx
        unrealized = (market_value_eur - cost_eur) if market_value_eur is not None else None
        unrealized_pct = (unrealized / cost_eur) if (unrealized is not None and cost_eur > EPSILON) else None

        holdings.append({
            "security_id": security_id,
            "ticker": ticker,
            "name": security["name"],
            "asset_type": security["asset_type"] or "other",
            "currency": currency,
            "shares": shares,
            "avg_cost_native": position["avg_cost_native"],
            "cost_basis_native": position["cost_basis_native"],
            "cost_basis_eur": round(cost_eur, 2),
            "price_native": price,
            "market_value_native": round(market_value_native, 2) if market_value_native is not None else None,
            "market_value_eur": round(market_value_eur, 2) if market_value_eur is not None else None,
            "unrealized_gain_eur": round(unrealized, 2) if unrealized is not None else None,
            "unrealized_gain_pct": unrealized_pct,
            "realized_gain_native": position["realized_gain_native"],
            "dividends_native": position["dividends_native"],
        })

    total_value = sum(h["market_value_eur"] or 0.0 for h in holdings)
    for h in holdings:
        h["weight_pct"] = (
            (h["market_value_eur"] / total_value * 100.0)
            if (h["market_value_eur"] is not None and total_value > EPSILON)
            else None
        )
    holdings.sort(key=lambda h: h["market_value_eur"] or 0.0, reverse=True)
    return holdings


# ---------------------------------------------------------------------------
# Returns
# ---------------------------------------------------------------------------

def _all_cash_flows(db_path: str | None, start_date: str | None = None) -> list[dict]:
    """Signed cash flows from transactions, in EUR, oldest first."""
    fx_cache: dict[str, float] = {}
    flows: list[dict] = []
    for txn in sorted(database.get_transactions(db_path=db_path), key=lambda t: (t["date"], t["id"])):
        if start_date and txn["date"] < start_date:
            continue
        native = _transaction_cash_native(txn)
        if native == 0:
            continue
        fx = _fx_to_eur(txn["currency"], fx_cache)
        flows.append({"date": txn["date"], "amount": native * fx, "native_amount": native})
    return flows


def xirr(flows: list[dict], guess: float = 0.1) -> float | None:
    """Money-weighted annualised return over dated cash flows.

    Cash-flow sign convention (the part that is easy to get backwards):
    money paid *into* the investment is **negative**, money received *from* it
    is **positive**. The current portfolio value is added by the caller as a
    final positive flow dated today, so solving NPV(rate) = 0 treats today's
    value as the last "receipt".

    Solves with bisection over a rate grid, which is slower than Newton but
    cannot diverge on awkward flows. Returns ``None`` when a solution can't be
    bracketed (e.g. all flows share a sign) or fewer than two flows exist.
    """
    if len(flows) < 2:
        return None
    amounts = [f["amount"] for f in flows]
    if not (any(a > 0 for a in amounts) and any(a < 0 for a in amounts)):
        return None

    dated = [(date.fromisoformat(f["date"]), f["amount"]) for f in flows]
    t0 = min(d for d, _ in dated)

    def npv(rate: float) -> float:
        if rate <= -1.0:
            rate = -0.999999
        return sum(
            amount / (1.0 + rate) ** ((d - t0).days / 365.0)
            for d, amount in dated
        )

    grid = [-0.9999, -0.99, -0.9, -0.75, -0.5, -0.25, -0.1, 0.0, 0.05,
            0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0]
    low = high = None
    previous_value = None
    previous_rate = None
    for candidate in grid:
        value = npv(candidate)
        if previous_value is not None and (
            (previous_value < 0 < value) or (value < 0 < previous_value)
        ):
            low, high = previous_rate, candidate
            break
        previous_value = value
        previous_rate = candidate
    if low is None:
        return None

    f_low = npv(low)
    for _ in range(200):
        mid = (low + high) / 2.0
        f_mid = npv(mid)
        if abs(f_mid) < 1e-9:
            return mid
        if (f_low < 0 < f_mid) or (f_mid < 0 < f_low):
            high = mid
        else:
            low, f_low = mid, f_mid
    return (low + high) / 2.0


def compute_twr(value_by_date: dict[str, float], flows_by_date: dict[str, float],
                period_end: str) -> float | None:
    """Time-weighted return over the dates in ``value_by_date``.

    TWR removes the effect of deposit/withdrawal timing by chaining the return
    of each sub-period between consecutive cash-flow events: a buy or sell is
    treated as an external flow that closes one sub-period and opens the next.
    For each sub-period the factor is ``(end_value - cash_flow) / start_value``,
    all factors are multiplied, and 1 is subtracted.

    Treating buys/sells as external flows is this app's deliberate convention:
    it tracks holdings, not a brokerage cash balance, so "money paid for a
    security" is the contribution that TWR should neutralise.
    """
    # The chain has to start at the period's first valued date (the initial
    # investment), then step through every cash-flow date to the period end.
    # Starting at the first *flow* instead would silently drop the first
    # sub-period's return.
    event_dates = set(flows_by_date) | {period_end}
    if value_by_date:
        event_dates.add(min(value_by_date))
    event_dates = sorted(event_dates)
    if len(event_dates) < 2:
        return None

    factor = 1.0
    periods = 0
    for previous_date, event_date in zip(event_dates, event_dates[1:]):
        start_value = value_by_date.get(previous_date)
        end_value = value_by_date.get(event_date)
        if not start_value or start_value <= EPSILON or end_value is None:
            continue
        flow = flows_by_date.get(event_date, 0.0)
        factor *= (end_value - flow) / start_value
        periods += 1

    if periods == 0:
        return None
    return factor - 1.0


def _resolve_price_at(history: list[dict], target_date: str, fallback: float | None) -> float | None:
    """Close on or before ``target_date`` (forward-fill), else the fallback."""
    price = None
    for point in history:
        if point["date"] <= target_date:
            price = point["close"]
        else:
            break
    if price is None:
        if history:
            price = history[0]["close"]
        else:
            price = fallback
    return price


def build_value_series(db_path: str | None = None, start_date: str | None = None,
                       end_date: str | None = None) -> dict:
    """Daily EUR portfolio value, plus signed external flows per date.

    Historical prices come from Twelve Data's daily series, fetched once and
    cached. If a ticker has no history, its cached current price (or last known
    transaction price) is held flat — the line is then approximate, but the
    app degrades to a usable dashboard instead of an error.

    Returns ``{"dates": [...], "values": [...], "flows": {date: eur}}``.
    """
    securities = {s["id"]: s for s in database.get_securities(db_path=db_path)}
    grouped = _transactions_by_security(db_path)
    if not grouped:
        return {"dates": [], "values": [], "flows": {}}

    earliest = min(t["date"] for txns in grouped.values() for t in txns)
    start = start_date or earliest
    end = end_date or date.today().isoformat()
    if start < earliest:
        start = earliest
    if start > end:
        return {"dates": [], "values": [], "flows": {}}

    fx_cache: dict[str, float] = {}
    # Build each security's data once: price history + a daily share ledger.
    security_data: dict[int, dict] = {}
    for security_id, txns in grouped.items():
        security = securities.get(security_id)
        if security is None:
            continue
        ticker = security["ticker"]
        currency = security["currency"] or "EUR"
        try:
            history = market_data.get_price_history(ticker, start, end)
        except market_data.MarketDataError as exc:
            logger.warning("No price history for %s: %s", ticker, exc)
            history = []
        fallback = None
        try:
            fallback = market_data.get_price(ticker, currency)
        except market_data.MarketDataError:
            fallback = None

        ledger = sorted(
            ((t["date"], t) for t in txns if t["type"] in ("buy", "sell") and t.get("quantity")),
            key=lambda item: item[0],
        )
        security_data[security_id] = {
            "currency": currency,
            "fx": _fx_to_eur(currency, fx_cache),
            "history": history,
            "fallback": fallback,
            "ledger": ledger,
        }

    # Calendar of business-relevant dates: every price-history date plus every
    # transaction date, so flow dates always resolve.
    date_set = {p["date"] for d in security_data.values() for p in d["history"]}
    date_set.update(t["date"] for txns in grouped.values() for t in txns)
    date_set = {d for d in date_set if start <= d <= end}
    date_set.add(end)
    dates = sorted(date_set)
    if not dates:
        return {"dates": [], "values": [], "flows": {}}

    # Precompute cumulative share counts per security at each calendar date.
    values: list[float] = []
    for current_date in dates:
        total = 0.0
        for security_id, data in security_data.items():
            shares = 0.0
            for txn_date, txn in data["ledger"]:
                if txn_date <= current_date:
                    qty = _to_float(txn.get("quantity"))
                    shares += qty if txn["type"] == "buy" else -qty
                else:
                    break
            if shares <= EPSILON:
                continue
            price = _resolve_price_at(data["history"], current_date, data["fallback"])
            if price is None:
                continue
            total += shares * price * data["fx"]
        values.append(round(total, 2))

    flows: dict[str, float] = {}
    for flow in _all_cash_flows(db_path, start_date=start):
        if flow["date"] > end:
            continue
        flows[flow["date"]] = flows.get(flow["date"], 0.0) + flow["amount"]

    return {"dates": dates, "values": values, "flows": flows}


PERIOD_DAYS = {
    "1m": 31, "3m": 92, "6m": 183, "1y": 365, "2y": 730, "5y": 1826,
}


def period_start(period: str, earliest: str) -> str:
    """Resolve a period key to a start date, never before the first transaction."""
    if not period or period == "all":
        return earliest
    if period == "ytd":
        return f"{date.today().year}-01-01"
    days = PERIOD_DAYS.get(period)
    if days is None:
        return earliest
    candidate = (date.today() - timedelta(days=days)).isoformat()
    return max(candidate, earliest)


def build_summary(period: str = "1y", db_path: str | None = None) -> dict:
    """Dashboard headline: value, period change, XIRR, TWR and benchmark."""
    holdings = build_holdings(db_path=db_path)
    total_value = round(sum(h["market_value_eur"] or 0.0 for h in holdings), 2)

    all_txns = database.get_transactions(db_path=db_path)
    if not all_txns:
        return {
            "total_value_eur": 0.0,
            "total_cost_eur": 0.0,
            "total_unrealized_gain_eur": 0.0,
            "total_unrealized_gain_pct": None,
            "period": period,
            "period_start": None,
            "period_end": date.today().isoformat(),
            "period_change_eur": None,
            "period_change_pct": None,
            "xirr": None,
            "twr": None,
            "benchmark_ticker": database.get_setting("benchmark_ticker", db_path=db_path),
            "benchmark_return": None,
            "top_movers": [],
            "has_holdings": False,
        }

    earliest = min(t["date"] for t in all_txns)
    start = period_start(period, earliest)
    end = date.today().isoformat()

    series = build_value_series(db_path=db_path, start_date=start, end_date=end)
    period_change_eur = None
    period_change_pct = None
    twr = None
    if series["dates"]:
        first_value = series["values"][0]
        # Value series starts after the first flow, so compare against value at
        # period start; only meaningful once there is more than one point.
        if len(series["values"]) > 1:
            period_change_eur = round(total_value - first_value, 2)
            if first_value > EPSILON:
                period_change_pct = (total_value - first_value) / first_value
        # `series["flows"]` uses `_all_cash_flows`'s XIRR-native sign convention
        # (buy = negative, "cash left the investor's pocket") — see that
        # function's own docstring. `compute_twr`'s formula needs the opposite
        # convention (buy = positive contribution *into* the portfolio, sell =
        # negative withdrawal *out of* it — see its own docstring). Flipping
        # the sign only for this call, not inside `build_value_series` itself,
        # keeps that function's public contract (and any other consumer of its
        # `flows` return value) on the XIRR-native convention it documents.
        twr = compute_twr(
            dict(zip(series["dates"], series["values"])),
            {flow_date: -amount for flow_date, amount in series["flows"].items()},
            end,
        )

    # XIRR uses the full history (money-weighted returns need every flow); the
    # current value is the final positive flow.
    flows = _all_cash_flows(db_path)
    if total_value > EPSILON:
        flows.append({"date": end, "amount": total_value, "native_amount": total_value})
    xirr_value = xirr(flows)

    # Benchmark: same period, a single-holding index has no external flows so
    # its TWR is simply the price return over that window.
    benchmark_ticker = database.get_setting("benchmark_ticker", db_path=db_path)
    benchmark_return = None
    if benchmark_ticker:
        history = market_data.get_price_history(benchmark_ticker, start, end)
        history = [p for p in history if p["date"] >= start]
        if len(history) >= 2 and history[0]["close"] > EPSILON:
            benchmark_return = history[-1]["close"] / history[0]["close"] - 1.0

    return {
        "total_value_eur": total_value,
        "total_cost_eur": round(sum(h["cost_basis_eur"] for h in holdings), 2),
        "total_unrealized_gain_eur": round(
            sum(h["unrealized_gain_eur"] or 0.0 for h in holdings), 2
        ),
        "total_unrealized_gain_pct": _safe_pct(
            sum(h["unrealized_gain_eur"] or 0.0 for h in holdings),
            sum(h["cost_basis_eur"] for h in holdings),
        ),
        "period": period,
        "period_start": start,
        "period_end": end,
        "period_change_eur": period_change_eur,
        "period_change_pct": period_change_pct,
        "xirr": xirr_value,
        "twr": twr,
        "benchmark_ticker": benchmark_ticker,
        "benchmark_return": benchmark_return,
        "top_movers": _build_top_movers(holdings),
        "has_holdings": bool(holdings),
    }


def _safe_pct(numerator: float, denominator: float) -> float | None:
    if abs(denominator) <= EPSILON:
        return None
    return numerator / denominator


def _build_top_movers(holdings: list[dict]) -> list[dict]:
    """Best/worst unrealized performers, for the Dashboard's movers list."""
    ranked = [h for h in holdings if h.get("unrealized_gain_pct") is not None]
    ranked.sort(key=lambda h: h["unrealized_gain_pct"], reverse=True)
    top = ranked[:3]
    bottom = [h for h in reversed(ranked) if h not in top][:3]
    return [
        {
            "ticker": h["ticker"],
            "name": h["name"],
            "change_pct": h["unrealized_gain_pct"],
            "change_eur": h["unrealized_gain_eur"],
        }
        for h in top + bottom
    ]


# ---------------------------------------------------------------------------
# Allocation
# ---------------------------------------------------------------------------

def allocation_by_key(holdings: list[dict], key: str) -> list[dict]:
    """Group EUR market value by a holding field ('asset_type' or 'currency')."""
    buckets: dict[str, float] = {}
    for h in holdings:
        value = h["market_value_eur"] or 0.0
        label = h.get(key) or "other"
        buckets[label] = buckets.get(label, 0.0) + value
    return _buckets_to_list(buckets)


def _buckets_to_list(buckets: dict[str, float]) -> list[dict]:
    total = sum(buckets.values())
    result = [
        {
            "key": key,
            "label": key,
            "value_eur": round(value, 2),
            "percentage": (value / total * 100.0) if total > EPSILON else 0.0,
        }
        for key, value in buckets.items()
    ]
    result.sort(key=lambda item: item["value_eur"], reverse=True)
    return result


def build_allocation(db_path: str | None = None) -> dict:
    """Allocation by security, asset type and currency."""
    holdings = build_holdings(db_path=db_path)
    by_security = [
        {
            "key": h["ticker"],
            "label": h["name"] or h["ticker"],
            "value_eur": h["market_value_eur"] or 0.0,
            "percentage": h["weight_pct"] or 0.0,
        }
        for h in holdings
    ]
    return {
        "total_value_eur": round(sum(h["market_value_eur"] or 0.0 for h in holdings), 2),
        "by_security": by_security,
        "by_asset_type": allocation_by_key(holdings, "asset_type"),
        "by_currency": allocation_by_key(holdings, "currency"),
    }


# ---------------------------------------------------------------------------
# Rebalancing
# ---------------------------------------------------------------------------

def build_rebalancing(db_path: str | None = None) -> dict:
    """Target vs current allocation with the EUR trade needed to close each gap.

    A ``target_key`` is matched against a held ticker first, then against an
    ``asset_type``. ``suggested_eur`` is positive to buy, negative to sell:
    ``(target_pct - current_pct) / 100 * total_value``.
    """
    holdings = build_holdings(db_path=db_path)
    total_value = sum(h["market_value_eur"] or 0.0 for h in holdings)
    targets = database.get_target_allocation(db_path=db_path)

    ticker_values: dict[str, float] = {}
    asset_values: dict[str, float] = {}
    for h in holdings:
        value = h["market_value_eur"] or 0.0
        ticker_values[h["ticker"]] = ticker_values.get(h["ticker"], 0.0) + value
        asset_values[h["asset_type"]] = asset_values.get(h["asset_type"], 0.0) + value

    def current_value(key: str) -> float:
        if key in ticker_values:
            return ticker_values[key]
        return asset_values.get(key, 0.0)

    rows = []
    targeted: set[str] = set()
    for target in targets:
        key = target["target_key"]
        targeted.add(key)
        current_eur = current_value(key)
        current_pct = (current_eur / total_value * 100.0) if total_value > EPSILON else 0.0
        target_pct = float(target["target_percentage"])
        rows.append({
            "key": key,
            "target_percentage": target_pct,
            "current_percentage": round(current_pct, 2),
            "current_value_eur": round(current_eur, 2),
            "target_value_eur": round(total_value * target_pct / 100.0, 2),
            "suggested_eur": round(total_value * (target_pct - current_pct) / 100.0, 2),
        })

    # Held positions with no target get a 0% target, so the page surfaces a
    # concrete sell suggestion instead of silently hiding the drift.
    for key, value in sorted(ticker_values.items(), key=lambda kv: kv[1], reverse=True):
        if key in targeted:
            continue
        current_pct = (value / total_value * 100.0) if total_value > EPSILON else 0.0
        rows.append({
            "key": key,
            "target_percentage": 0.0,
            "current_percentage": round(current_pct, 2),
            "current_value_eur": round(value, 2),
            "target_value_eur": 0.0,
            "suggested_eur": round(-value, 2),
        })

    return {
        "total_value_eur": round(total_value, 2),
        "targets_sum": round(sum(t["target_percentage"] for t in targets), 2),
        "rows": rows,
    }


# ---------------------------------------------------------------------------
# Goals / projections
# ---------------------------------------------------------------------------

def build_goal_projection(goal: dict, db_path: str | None = None) -> dict:
    """CAGR-based projection line for one goal.

    Deliberately not Monte Carlo (plan section 7): a single line is enough at
    this stage. The rate used is the portfolio's own all-time XIRR when it is
    finite, otherwise the user's ``assumed_annual_return`` setting — a short
    history can give a wild XIRR, and the user can override it in Settings.
    """
    holdings = build_holdings(db_path=db_path)
    current_value = sum(h["market_value_eur"] or 0.0 for h in holdings)

    flows = _all_cash_flows(db_path)
    today = date.today().isoformat()
    if current_value > EPSILON:
        flows.append({"date": today, "amount": current_value, "native_amount": current_value})
    historical_xirr = xirr(flows)

    assumed = _to_float(database.get_setting("assumed_annual_return", db_path=db_path), 0.07)
    rate = historical_xirr if historical_xirr is not None else assumed
    rate_source = "historical_xirr" if historical_xirr is not None else "assumed_return"

    try:
        target_date = date.fromisoformat(goal["target_date"])
    except ValueError:
        target_date = date.today()
    years = max((target_date - date.today()).days / 365.25, 0.0)
    projected = current_value * (1.0 + rate) ** years

    # Monthly points for the projection line (capped so a distant goal doesn't
    # produce thousands of SVG points).
    points = [{"date": today, "value": round(current_value, 2)}]
    steps = min(int(round(years * 12)), 480)
    for step in range(1, steps + 1):
        fraction = step / steps if steps else 1.0
        point_date = date.today() + timedelta(days=round(years * 365.25 * fraction))
        value = current_value * (1.0 + rate) ** (years * fraction)
        points.append({"date": point_date.isoformat(), "value": round(value, 2)})

    return {
        "goal": goal,
        "current_value_eur": round(current_value, 2),
        "rate": rate,
        "rate_source": rate_source,
        "assumed_return": assumed,
        "years_to_target": round(years, 2),
        "projected_value_eur": round(projected, 2),
        "on_track": projected >= goal["target_amount"],
        "gap_eur": round(projected - goal["target_amount"], 2),
        "points": points,
    }


# ---------------------------------------------------------------------------
# Income / dividends
# ---------------------------------------------------------------------------

def build_income(db_path: str | None = None) -> dict:
    """Dividend history and totals, grouped by year and by security."""
    securities = {s["id"]: s for s in database.get_securities(db_path=db_path)}
    fx_cache: dict[str, float] = {}
    dividends = database.get_transactions(type="dividend", db_path=db_path)
    dividends.sort(key=lambda t: t["date"])

    events = []
    by_year: dict[str, float] = {}
    by_security: dict[str, float] = {}
    total_eur = 0.0
    for txn in dividends:
        security = securities.get(txn["security_id"], {})
        fx = _fx_to_eur(txn["currency"], fx_cache)
        amount_native = _transaction_cash_native(txn)
        amount_eur = amount_native * fx
        total_eur += amount_eur
        year = (txn["date"] or "")[:4]
        by_year[year] = by_year.get(year, 0.0) + amount_eur
        ticker = security.get("ticker", "?")
        by_security[ticker] = by_security.get(ticker, 0.0) + amount_eur
        events.append({
            "id": txn["id"],
            "date": txn["date"],
            "ticker": ticker,
            "name": security.get("name"),
            "amount_native": round(amount_native, 2),
            "currency": txn["currency"],
            "amount_eur": round(amount_eur, 2),
            "notes": txn.get("notes"),
        })

    return {
        "total_eur": round(total_eur, 2),
        "events": list(reversed(events)),
        "by_year": [
            {"year": year, "amount_eur": round(value, 2)}
            for year, value in sorted(by_year.items())
        ],
        "by_security": sorted(
            [{"ticker": ticker, "amount_eur": round(value, 2)}
             for ticker, value in by_security.items()],
            key=lambda item: item["amount_eur"], reverse=True,
        ),
    }
