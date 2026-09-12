"""
XTB importer tests.

The real export is an ``.xlsx`` workbook whose Cash Operations header sits four
rows down, so the fixture is built the same way from anonymised sample rows
(plan section 5). ``docs/samples/`` is git-ignored at the repo root (so a real
broker export can never be committed by accident), which means the tracked test
must not depend on it — the rows are embedded here and the on-disk sample is
used only when present.
"""
import csv
import io
from pathlib import Path

from openpyxl import Workbook

from app import csv_import, database

SAMPLES = Path(__file__).resolve().parent.parent / "docs" / "samples"

# Anonymised Cash Operations rows — same header and shape as the sample file
# under docs/samples/, kept inline so the test suite is self-contained.
_CASH_OPERATIONS_ROWS = [
    ["Type", "Instrument", "Ticker", "Category", "Time", "Amount", "ID", "Comment", "Product", "Position ID"],
    ["Stock purchase", "Acme Corp", "ACME.US", "Stock", "2024-01-15 10:30:00", "-1000.00", "OP1001", "OPEN BUY 10 @ 100.00", "", "POS1"],
    ["Transfer", "", "", "", "2024-02-01 09:00:00", "5000.00", "OP1005", "Deposit", "", ""],
    ["Stock purchase", "World Equity ETF", "VWCE.DE", "ETF", "2024-02-01 09:15:00", "-2500.00", "OP1002", "OPEN BUY 25 @ 100.00", "", "POS2"],
    ["Dividend", "Acme Corp", "ACME.US", "Dividend", "2024-03-10 12:00:00", "15.50", "OP1003", "Dividend payment", "", "POS1"],
    ["Stock sell", "Acme Corp", "ACME.US", "Stock", "2024-06-20 14:00:00", "600.00", "OP1004", "CLOSE SELL 5 @ 120.00", "", "POS1"],
    ["Stock purchase", "Acme Corp", "ACME.US", "Stock", "2024-07-01 10:00:00", "-660.00", "OP1006", "OPEN BUY 5 @ 132.00", "", "POS3"],
]


def _build_xtb_xlsx(sample_csv: str, metadata_rows: int = 4) -> bytes:
    """Turn the sample rows into the xlsx shape the real XTB export uses:
    metadata rows, then the header row, then data. Reads the on-disk sample
    when it exists, otherwise uses the embedded rows."""
    sample_path = SAMPLES / sample_csv
    if sample_path.exists():
        with sample_path.open() as handle:
            rows = list(csv.reader(handle))
    else:
        rows = _CASH_OPERATIONS_ROWS

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Cash Operations"
    for i in range(metadata_rows):
        sheet.append([f"metadata {i + 1}"])
    for row in rows:
        sheet.append(row)

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_parse_xtb_maps_types_and_extracts_quantity_price():
    parsed = csv_import.parse_xtb(_build_xtb_xlsx("xtb_cash_operations_sample.csv"))

    # 6 data rows: 1 transfer skipped, 5 transactions.
    assert parsed["transfers_skipped"] == 1
    assert parsed["rows_unparsed"] == 0
    assert len(parsed["transactions"]) == 5

    by_id = {t["external_id"]: t for t in parsed["transactions"]}
    buy = by_id["OP1001"]
    assert buy["type"] == "buy"
    assert buy["ticker"] == "ACME.US"
    assert buy["asset_type"] == "stock"
    assert buy["quantity"] == 10
    assert buy["price_per_unit"] == 100.0
    assert buy["cash_amount"] == -1000.0
    assert buy["date"] == "2024-01-15"
    assert buy["currency"] == "USD"
    assert buy["source"] == "csv_import"

    etf = by_id["OP1002"]
    assert etf["ticker"] == "VWCE.DE"
    assert etf["asset_type"] == "etf"

    dividend = by_id["OP1003"]
    assert dividend["type"] == "dividend"
    assert dividend["quantity"] is None
    assert dividend["cash_amount"] == 15.5

    assert by_id["OP1004"]["type"] == "sell"
    assert by_id["OP1004"]["quantity"] == 5


def test_parse_xtb_rejects_non_xtb_workbook():
    workbook = Workbook()
    workbook.active.title = "Something Else"
    buffer = io.BytesIO()
    workbook.save(buffer)
    try:
        csv_import.parse_xtb(buffer.getvalue())
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_currency_from_ticker():
    assert csv_import.currency_from_ticker("VWCE.DE") == "EUR"
    assert csv_import.currency_from_ticker("AAPL") == "USD"
    assert csv_import.currency_from_ticker("VOD.L") == "GBP"


def test_import_is_idempotent_on_external_id(tmp_path):
    db_path = str(tmp_path / "inv.db")
    database.init_db(db_path)
    security_id = database.upsert_security("ACME.US", "Acme", "stock", "USD", db_path=db_path)

    row = {
        "security_id": security_id, "date": "2024-01-15", "type": "buy",
        "quantity": 10, "price_per_unit": 100.0, "currency": "USD",
        "external_id": "OP1001", "cash_amount": -1000.0,
    }
    _, first = database.insert_transaction(row, db_path=db_path)
    _, second = database.insert_transaction(row, db_path=db_path)
    assert first is True
    assert second is False
    assert len(database.get_transactions(db_path=db_path)) == 1
