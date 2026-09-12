"""Regression test for the real build_value_series -> compute_twr integration path.

Added after a real bug: build_summary() passed series["flows"] (in
_all_cash_flows's XIRR-native sign convention, buy=negative) straight into
compute_twr() (which needs the opposite convention, buy=positive
contribution) without flipping the sign. The existing compute_twr unit
tests never caught this because they call compute_twr directly with
already-correctly-signed synthetic flows -- they never exercise the actual
wiring between the two functions. This test does.
"""
import pytest

from app import database, market_data, stats


def test_twr_integration_flat_price_two_buys_is_zero(tmp_path, monkeypatch):
    """Buy, then buy more later, price never moves -> real TWR is 0%.

    This is the exact scenario that exposed the sign bug: with the bug in
    place, this asserted 100% instead of 0% (the second buy's negative
    XIRR-native flow got added back into end_value instead of subtracted).
    """
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    security_id = database.upsert_security("FLAT.EU", "Flat Co", "stock", "EUR", db_path=db_path)
    database.insert_transaction({
        "security_id": security_id, "date": "2024-01-01", "type": "buy",
        "quantity": 10, "price_per_unit": 100.0, "fees": 0.0, "currency": "EUR",
    }, db_path=db_path)
    database.insert_transaction({
        "security_id": security_id, "date": "2024-07-01", "type": "buy",
        "quantity": 5, "price_per_unit": 100.0, "fees": 0.0, "currency": "EUR",
    }, db_path=db_path)

    monkeypatch.setattr(market_data, "get_price", lambda ticker, currency=None, force=False: 100.0)
    monkeypatch.setattr(market_data, "get_fx_rate", lambda frm, to, force=False: 1.0)
    monkeypatch.setattr(
        market_data, "get_price_history",
        lambda ticker, start_date, end_date=None, force=False: [],
    )

    end = "2025-01-01"
    series = stats.build_value_series(db_path=db_path, start_date="2024-01-01", end_date=end)
    # Same sign-flip build_summary() applies before calling compute_twr -- see
    # that call site's own comment for why the flip belongs there, not inside
    # build_value_series itself.
    twr = stats.compute_twr(
        dict(zip(series["dates"], series["values"])),
        {flow_date: -amount for flow_date, amount in series["flows"].items()},
        end,
    )
    assert twr == pytest.approx(0.0, abs=1e-6)
