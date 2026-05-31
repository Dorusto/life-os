"""
Fuelio CSV import endpoint.

POST /api/import/fuelio
  Upload a Fuelio sync CSV, parse it section by section, upsert the vehicle,
  and batch-insert log + cost entries into vehicle_log.

Fuelio CSV sections are separated by "## SectionName" lines.
  - Vehicle  → upsert_vehicle()
  - Log      → insert_vehicle_log_entries(entry_type="fuel")
  - CostCategories → ignored (schema reference only)
  - Costs    → insert_vehicle_log_entries(entry_type based on CostTypeID)
  - FavStations, Pictures, TripLog, Routes, Category → ignored

Zero AB transactions — historical data goes to vehicle_log only.
"""
import csv
import io
import logging
from io import StringIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.config import settings
from backend.core.memory.database import MemoryDB

logger = logging.getLogger(__name__)
router = APIRouter()

# CostTypeID → entry_type mapping
COST_TYPE_MAP = {
    "1": "service",
    "2": "maintenance",
    "4": "other",
    "5": "other",
    "6": "other",
    "7": "other",
    "8": "other",
    "9": "maintenance",
    "31": "insurance",
}

IGNORED_SECTIONS = {"FavStations", "Pictures", "Category", "TripLog", "Routes"}


# ---------------------------------------------------------------------------
# Response model
# ---------------------------------------------------------------------------

class FuelioImportResult(BaseModel):
    vehicle_name: str
    fuel_entries: int
    fuel_skipped: int
    cost_entries: int
    cost_skipped: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_remind_date(val: str) -> str | None:
    """'2011-01-01' is Fuelio's placeholder for 'no reminder' → None."""
    if not val or val.strip() == "2011-01-01":
        return None
    return val.strip()[:10]  # keep YYYY-MM-DD only


def _parse_odo(val: str) -> float | None:
    """Parse odometer; 0 and empty → None."""
    val = val.strip()
    if not val:
        return None
    try:
        v = float(val)
        return v if v != 0 else None
    except (ValueError, TypeError):
        return None


def _parse_cost(val: str) -> float | None:
    """Parse cost; empty → None."""
    val = val.strip()
    if not val:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _parse_int(val: str) -> int | None:
    """Parse integer; empty or 0 → None."""
    val = val.strip()
    if not val:
        return None
    try:
        v = int(val)
        return v if v != 0 else None
    except (ValueError, TypeError):
        return None


def _parse_section_rows(lines: list[str], start: int) -> tuple[list[str], list[list[str]], int]:
    """
    Parse rows starting at `start` until the next section header or EOF.

    Returns (csv_headers, parsed_rows, next_line_index).
    """
    if start >= len(lines):
        return [], [], start

    # First data line after the section header = CSV header row
    raw_header = lines[start].strip()
    if not raw_header:
        return [], [], start + 1

    reader = csv.reader(StringIO(raw_header))
    try:
        csv_headers = next(reader)
    except StopIteration:
        return [], [], start + 1

    parsed = []
    i = start + 1
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        # Check if this line starts a new section (including quoted lines)
        stripped_line = line.strip('"').strip()
        if stripped_line.startswith("## "):
            break
        row_reader = csv.reader(StringIO(line))
        try:
            row = next(row_reader)
            parsed.append(row)
        except StopIteration:
            pass
        i += 1

    return csv_headers, parsed, i


# ---------------------------------------------------------------------------
# Section parsers
# ---------------------------------------------------------------------------

def _parse_vehicle_section(headers: list[str], rows: list[list[str]]) -> dict:
    """Parse Vehicle section → data dict for upsert_vehicle()."""
    if not rows:
        raise HTTPException(status_code=400, detail="Vehicle section is empty")

    row = rows[0]  # Fuelio sync file has exactly one vehicle row
    col_map = {h: idx for idx, h in enumerate(headers)}

    def _field(col_name: str) -> str:
        idx = col_map.get(col_name)
        if idx is not None and idx < len(row):
            return row[idx].strip()
        return ""

    data = {
        "name": _field("Name") or "Unknown Vehicle",
        "make": _field("Make"),
        "model": _field("Model"),
        "year": _parse_int(_field("Year")),
        "plate": _field("Plate"),
        "tank_capacity": _parse_cost(_field("Tank1Capacity")),
        "fuel_type": "petrol",  # FuelType 100/110/111 are all petrol variants
        "active": 1,
    }
    return data


def _parse_log_section(headers: list[str], rows: list[list[str]], vehicle_id: int) -> list[dict]:
    """Parse Log section → list of entry dicts for insert_vehicle_log_entries()."""
    entries = []
    col_map = {h: idx for idx, h in enumerate(headers)}

    for row in rows:
        def _field(col_name: str) -> str:
            idx = col_map.get(col_name)
            if idx is not None and idx < len(row):
                return row[idx].strip()
            return ""

        odo = _parse_odo(_field("Odo (km)"))
        fuel_liters = _parse_cost(_field("Fuel (litres)"))
        cost_total = _parse_cost(_field("Price (optional)"))
        fuel_price_per_liter = _parse_cost(_field("VolumePrice"))
        date_val = _field("Data")  # Romanian locale — "Data" not "Date"

        entries.append({
            "vehicle_id": vehicle_id,
            "date": date_val,
            "odo_km": odo,
            "entry_type": "fuel",
            "fuel_liters": fuel_liters,
            "fuel_price_per_liter": fuel_price_per_liter,
            "fuel_full_tank": int(_field("Full")) if _field("Full") in ("0", "1") else 0,
            "fuel_missed": int(_field("Missed")) if _field("Missed") in ("0", "1") else 0,
            "cost_total": cost_total,
            "cost_currency": "EUR",
            "remind_odo": None,
            "remind_date": None,
            "repeat_odo": None,
            "repeat_months": None,
            "location": _field("City (optional)") or None,
            "notes": _field("Notes (optional)") or None,
            "source": "fuelio_import",
            "fuelio_unique_id": _field("UniqueId"),
        })

    return entries


def _parse_costs_section(headers: list[str], rows: list[list[str]], vehicle_id: int) -> list[dict]:
    """Parse Costs section → list of entry dicts for insert_vehicle_log_entries()."""
    entries = []
    col_map = {h: idx for idx, h in enumerate(headers)}

    for row in rows:
        def _field(col_name: str) -> str:
            idx = col_map.get(col_name)
            if idx is not None and idx < len(row):
                return row[idx].strip()
            return ""

        cost_type_id = _field("CostTypeID")
        entry_type = COST_TYPE_MAP.get(cost_type_id, "other")

        odo = _parse_odo(_field("Odo"))
        cost_total = _parse_cost(_field("Cost"))
        remind_odo = _parse_odo(_field("RemindOdo"))
        remind_date = _parse_remind_date(_field("RemindDate"))
        repeat_odo = _parse_odo(_field("RepeatOdo"))
        repeat_months = _parse_int(_field("RepeatMonths"))

        entries.append({
            "vehicle_id": vehicle_id,
            "date": _field("Date"),
            "odo_km": odo if odo else (0.0 if _field("Odo") == "0" else odo),
            "entry_type": entry_type,
            "fuel_liters": None,
            "fuel_price_per_liter": None,
            "fuel_full_tank": 0,
            "fuel_missed": 0,
            "cost_total": cost_total,
            "cost_currency": "EUR",
            "remind_odo": remind_odo,
            "remind_date": remind_date,
            "repeat_odo": repeat_odo,
            "repeat_months": repeat_months,
            "location": None,
            "notes": _field("CostTitle") or None,
            "source": "fuelio_import",
            "fuelio_unique_id": _field("UniqueId"),
        })

    return entries


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/import/fuelio", response_model=FuelioImportResult)
async def import_fuelio(
    file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
):
    """
    Import a Fuelio sync CSV file.

    Parses section-by-section:
      - Vehicle  → upsert vehicle in local DB
      - Log      → insert fuel entries into vehicle_log
      - Costs    → insert cost entries into vehicle_log

    No AB transactions are created — historical data stays in vehicle_log.
    """
    raw = await file.read()
    if len(raw) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 2MB)")

    text = raw.decode("utf-8-sig", errors="replace")  # handle BOM
    lines = text.splitlines()

    if not lines or lines[0].strip().strip('"') != "## Vehicle":
        raise HTTPException(status_code=400, detail="Not a Fuelio sync file")

    db = MemoryDB(db_path=settings.memory.db_path)
    vehicle_data = None
    vehicle_id = None
    log_entries: list[dict] = []
    cost_entries: list[dict] = []

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        # Detect section headers (may be quoted)
        stripped = line.strip('"').strip()
        if not stripped.startswith("## "):
            i += 1
            continue

        section_name = stripped[3:].strip()  # remove "## " prefix

        if section_name in IGNORED_SECTIONS:
            # Skip until next section header
            i += 1
            while i < len(lines):
                if lines[i].strip().strip('"').strip().startswith("## "):
                    break
                i += 1
            continue

        if section_name == "Vehicle":
            headers, rows, i = _parse_section_rows(lines, i + 1)
            if rows:
                vehicle_data = _parse_vehicle_section(headers, rows)
                vehicle_id = db.upsert_vehicle(vehicle_data)
                logger.info(
                    "Fuelio import [%s]: vehicle '%s' (id=%d)",
                    current_user, vehicle_data.get("name", "?"), vehicle_id,
                )
            continue

        if section_name == "Log":
            if vehicle_id is None:
                raise HTTPException(status_code=400, detail="Vehicle section must appear before Log")
            headers, rows, i = _parse_section_rows(lines, i + 1)
            if rows:
                log_entries = _parse_log_section(headers, rows, vehicle_id)
            continue

        if section_name == "CostCategories":
            # Ignored — schema reference only
            i += 1
            while i < len(lines):
                if lines[i].strip().strip('"').strip().startswith("## "):
                    break
                i += 1
            continue

        if section_name == "Costs":
            if vehicle_id is None:
                raise HTTPException(status_code=400, detail="Vehicle section must appear before Costs")
            headers, rows, i = _parse_section_rows(lines, i + 1)
            if rows:
                cost_entries = _parse_costs_section(headers, rows, vehicle_id)
            continue

        # Unknown section — skip
        i += 1
        while i < len(lines):
            if lines[i].strip().strip('"').strip().startswith("## "):
                break
            i += 1

    if vehicle_id is None:
        raise HTTPException(status_code=400, detail="No vehicle section found in file")

    fuel_inserted, fuel_skipped = (0, 0)
    cost_inserted, cost_skipped = (0, 0)

    if log_entries:
        fuel_inserted, fuel_skipped = db.insert_vehicle_log_entries(log_entries)
        logger.info(
            "Fuelio import [%s]: %d fuel entries (%d skipped)",
            current_user, fuel_inserted, fuel_skipped,
        )

    if cost_entries:
        cost_inserted, cost_skipped = db.insert_vehicle_log_entries(cost_entries)
        logger.info(
            "Fuelio import [%s]: %d cost entries (%d skipped)",
            current_user, cost_inserted, cost_skipped,
        )

    return FuelioImportResult(
        vehicle_name=vehicle_data.get("name", "Unknown") if vehicle_data else "Unknown",
        fuel_entries=fuel_inserted,
        fuel_skipped=fuel_skipped,
        cost_entries=cost_inserted,
        cost_skipped=cost_skipped,
    )
