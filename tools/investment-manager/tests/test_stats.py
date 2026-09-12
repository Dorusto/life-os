"""Unit tests for the portfolio math — the part where mistakes cost trust."""
import datetime as dt

import pytest

from app import database, market_data, stats


def _seed_security(db_path, ticker="ACME.US", currency="USD", asset_type="stock", name="Acme"):
    return database.upsert_security(ticker, name, asset_type, currency, db_path=db_path)


def test_compute_position_average_cost():
    txns = [
        {"type": "buy", "quantity": 10, "price_per_unit": 100.0, "fees": 0.0, "cash_amount": -1000.0},
        {"type": "sell", "quantity": 5, "price_per_unit": 120.0, "fees": 0.0, "cash_amount": 600.0},
        {"type": "dividend", "quantity": None, "price_per_unit": None, "fees": 0.0, "cash_amount": 15.5},
    ]
    position = stats.compute_position(txns)
    assert position["shares"] == 5
    assert position["cost_basis_native"] == 500
    assert position["avg_cost_native"] == 100.0
    assert position["realized_gain_native"] == 100.0
    assert position["dividends_native"] == 15.5


def test_build_holdings_enriches_with_price_and_fx(tmp_path, monkeypatch):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    security_id = _seed_security(db_path)
    database.insert_transaction({
        "security_id": security_id, "date": "2024-01-15", "type": "buy",
        "quantity": 10, "price_per_unit": 100.0, "fees": 0.0, "currency": "USD",
    }, db_path=db_path)
    database.insert_transaction({
        "security_id": security_id, "date": "2024-06-20", "type": "sell",
        "quantity": 5, "price_per_unit": 120.0, "fees": 0.0, "currency": "USD",
    }, db_path=db_path)
    database.insert_transaction({
        "security_id": security_id, "date": "2024-03-10", "type": "dividend",
        "quantity": None, "price_per_unit": None, "fees": 0.0, "currency": "USD",
        "cash_amount": 15.5,
    }, db_path=db_path)

    monkeypatch.setattr(market_data, "get_price", lambda ticker, currency=None, force=False: 130.0)
    monkeypatch.setattr(market_data, "get_fx_rate", lambda frm, to, force=False: 0.9)

    holdings = stats.build_holdings(db_path=db_path)
    assert len(holdings) == 1
    h = holdings[0]
    assert h["shares"] == 5
    assert h["cost_basis_native"] == 500
    assert h["market_value_native"] == 650  # 5 * 130
    assert h["market_value_eur"] == 585      # 650 * 0.9
    assert h["unrealized_gain_eur"] == 135   # 585 - 450
    assert h["realized_gain_native"] == 100
    assert h["dividends_native"] == 15.5
    assert h["weight_pct"] == 100.0


def test_xirr_simple_annual_return():
    flows = [
        {"date": "2024-01-01", "amount": -1000.0},
        {"date": "2025-01-01", "amount": 1100.0},
    ]
    rate = stats.xirr(flows)
    assert rate is not None
    assert rate == pytest.approx(0.10, abs=0.005)


def test_xirr_requires_both_signs():
    assert stats.xirr([{"date": "2024-01-01", "amount": -100.0}]) is None
    assert stats.xirr([
        {"date": "2024-01-01", "amount": 100.0},
        {"date": "2024-02-01", "amount": 200.0},
    ]) is None


def test_twr_and_xirr_differ_on_timed_flows():
    """The whole point of showing both: a big gain before a late contribution
    lifts TWR far above the money-weighted XIRR."""
    value_by_date = {
        "2024-01-01": 1000.0,
        "2024-07-01": 3000.0,
        "2025-01-01": 3000.0,
    }
    flows_by_date = {"2024-07-01": 1000.0}
    twr = stats.compute_twr(value_by_date, flows_by_date, "2025-01-01")
    assert twr == pytest.approx(1.0, abs=1e-9)

    xirr_flows = [
        {"date": "2024-01-01", "amount": -1000.0},
        {"date": "2024-07-01", "amount": -1000.0},
        {"date": "2025-01-01", "amount": 3000.0},
    ]
    x = stats.xirr(xirr_flows)
    assert x is not None
    assert 0.6 < x < 0.8
    assert abs(twr - x) > 0.15


def test_rebalancing_suggests_trade_amounts(tmp_path, monkeypatch):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    a = database.upsert_security("AAA.US", "A", "stock", "USD", db_path=db_path)
    b = database.upsert_security("BBB.US", "B", "stock", "USD", db_path=db_path)
    database.insert_transaction({"security_id": a, "date": "2024-01-01", "type": "buy",
                                 "quantity": 7, "price_per_unit": 100.0, "currency": "USD"},
                                db_path=db_path)
    database.insert_transaction({"security_id": b, "date": "2024-01-01", "type": "buy",
                                 "quantity": 3, "price_per_unit": 100.0, "currency": "USD"},
                                db_path=db_path)
    monkeypatch.setattr(market_data, "get_price", lambda ticker, currency=None, force=False: 100.0)
    monkeypatch.setattr(market_data, "get_fx_rate", lambda frm, to, force=False: 1.0)
    database.replace_target_allocation([
        {"target_key": "AAA.US", "target_percentage": 50.0},
        {"target_key": "BBB.US", "target_percentage": 50.0},
    ], db_path=db_path)

    result = stats.build_rebalancing(db_path=db_path)
    rows = {r["key"]: r for r in result["rows"]}
    assert result["total_value_eur"] == 1000.0
    assert rows["AAA.US"]["current_percentage"] == 70.0
    assert rows["AAA.US"]["suggested_eur"] == -200.0
    assert rows["BBB.US"]["suggested_eur"] == 200.0


def test_goal_projection_uses_assumed_rate(tmp_path, monkeypatch):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    # Force the assumed-rate branch: no finite historical XIRR.
    monkeypatch.setattr(stats, "build_holdings", lambda db_path=None: [
        {"market_value_eur": 10000.0, "cost_basis_eur": 10000.0,
         "unrealized_gain_eur": 0.0, "unrealized_gain_pct": 0.0}
    ])
    monkeypatch.setattr(stats, "_all_cash_flows", lambda db_path, start_date=None: [])
    database.set_setting("assumed_annual_return", "0.07", db_path=db_path)

    target = (dt.date.today() + dt.timedelta(days=365)).isoformat()
    result = stats.build_goal_projection(
        {"id": 1, "name": "Retire", "target_amount": 10500.0, "target_date": target},
        db_path=db_path,
    )
    assert result["rate_source"] == "assumed_return"
    assert result["projected_value_eur"] == pytest.approx(10700.0, abs=5.0)
    assert result["on_track"] is True
    assert result["points"][0]["value"] == 10000.0
    assert len(result["points"]) > 2


def test_period_start_never_before_first_transaction():
    assert stats.period_start("all", "2020-01-01") == "2020-01-01"
    assert stats.period_start("1m", "2020-01-01") > "2020-01-01"
    assert stats.period_start("1y", "2999-01-01") == "2999-01-01"
