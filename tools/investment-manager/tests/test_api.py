"""
End-to-end route tests through FastAPI's TestClient.

Auth is exercised the same way majordom-financiar will call this service —
the shared ``X-Service-Token`` header — so no user login is needed. Market data
is monkeypatched: these tests are about the API wiring, not Twelve Data.
"""
import os

os.environ.setdefault("INVESTMENT_MANAGER_SERVICE_TOKEN", "test-service-token")
os.environ.setdefault("INVESTMENT_MANAGER_JWT_SECRET", "test-jwt-secret")

from fastapi.testclient import TestClient  # noqa: E402

from app import database, market_data, main  # noqa: E402

HEADERS = {"X-Service-Token": "test-service-token"}


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("INVESTMENT_DB_PATH", str(tmp_path / "api.db"))
    monkeypatch.setattr(market_data, "get_price",
                        lambda ticker, currency=None, force=False: 130.0)
    monkeypatch.setattr(market_data, "get_fx_rate",
                        lambda frm, to, force=False: 0.9 if frm != to else 1.0)
    monkeypatch.setattr(market_data, "get_price_history",
                        lambda ticker, start, end=None, force=False: [
                            {"date": "2024-01-15", "close": 100.0},
                            {"date": "2024-12-31", "close": 130.0},
                        ])
    monkeypatch.setattr(market_data, "get_security_metadata", lambda ticker: {})
    return TestClient(main.app)


def test_health_is_unauthenticated(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        assert client.get("/health").json() == {"status": "ok"}


def test_protected_route_requires_auth(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        assert client.get("/securities").status_code == 401


def test_full_portfolio_flow(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        created = client.post("/securities", headers=HEADERS, json={
            "ticker": "ACME.US", "name": "Acme", "asset_type": "stock", "currency": "USD",
        })
        assert created.status_code == 200, created.text
        security_id = created.json()["id"]

        txn = client.post("/transactions", headers=HEADERS, json={
            "security_id": security_id, "date": "2024-01-15", "type": "buy",
            "quantity": 10, "price_per_unit": 100.0, "fees": 0.0,
        })
        assert txn.status_code == 200, txn.text

        summary = client.get("/portfolio/summary", headers=HEADERS).json()
        assert summary["total_value_eur"] == 1170.0   # 10 * 130 * 0.9
        assert summary["has_holdings"] is True

        allocation = client.get("/portfolio/allocation", headers=HEADERS).json()
        assert allocation["by_currency"][0]["key"] == "USD"

        holdings = client.get("/holdings", headers=HEADERS).json()
        assert len(holdings) == 1
        assert holdings[0]["shares"] == 10
        assert holdings[0]["market_value_eur"] == 1170.0
        assert holdings[0]["cost_basis_eur"] == 900.0

        assert client.post("/target-allocation", headers=HEADERS, json={
            "targets": [{"target_key": "ACME.US", "target_percentage": 100.0}],
        }).status_code == 200
        rebalance = client.get("/rebalancing", headers=HEADERS).json()
        assert rebalance["rows"][0]["suggested_eur"] == 0.0

        goal = client.post("/goals", headers=HEADERS, json={
            "name": "Retire", "target_amount": 2000.0, "target_date": "2030-01-01",
        }).json()
        projection = client.get(f"/goals/{goal['id']}/projection", headers=HEADERS).json()
        assert projection["current_value_eur"] == 1170.0
        assert len(projection["points"]) > 1

        income = client.get("/income", headers=HEADERS).json()
        assert income["total_eur"] == 0.0

        value = client.get("/portfolio/value", headers=HEADERS).json()
        assert value["total_value_eur"] == 1170.0
        assert value["positions"] == 1


def test_settings_roundtrip(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        initial = client.get("/settings", headers=HEADERS).json()
        assert initial["benchmark_ticker"] == "VWCE.DE"
        assert "market_data_configured" in initial

        updated = client.put("/settings", headers=HEADERS, json={
            "benchmark_ticker": "SPY",
            "assumed_annual_return": 0.05,
        }).json()
        assert updated["benchmark_ticker"] == "SPY"
        assert updated["assumed_annual_return"] == "0.05"
        assert "market_data_configured" in updated


def test_import_xtb_endpoint(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        # Rebuild the anonymous sample as an xlsx the endpoint can accept. The
        # sample file is git-ignored, so the builder falls back to embedded
        # rows when it isn't present (see tests/test_csv_import.py).
        from tests.test_csv_import import _build_xtb_xlsx
        payload = _build_xtb_xlsx("xtb_cash_operations_sample.csv")

        first = client.post("/import/xtb", headers=HEADERS,
                            files={"file": ("report.xlsx", payload,
                                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        assert first.status_code == 200, first.text
        body = first.json()
        assert body["transactions_inserted"] == 5
        assert body["transfers_skipped"] == 1

        second = client.post("/import/xtb", headers=HEADERS,
                             files={"file": ("report.xlsx", payload,
                                             "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        assert second.json()["transactions_inserted"] == 0
        assert second.json()["transactions_skipped"] == 5
