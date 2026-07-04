"""
Fuelio CSV parser — moved from majordom-financiar/backend/api/fuelio_import.py.
Behaviorally identical: same column names, same edge-case handling, same section parsers.
"""
import csv
import logging
from io import StringIO

logger = logging.getLogger(__name__)

# CostTypeID to entry_type mapping
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
# Helpers
# ---------------------------------------------------------------------------

def _parse_remind_date(val: str) -> str | None:
    """'2011-01-01' is Fuelio's placeholder for 'no reminder' -> None."""
    if not val or val.strip() == "2011-01-01":
        return None
    return val.strip()[:10]


def _parse_odo(val: str) -> float | None:
    """Parse odometer; 0 and empty -> None."""
    val = val.strip()
    if not val:
        return None
    try:
        v = float(val)
        return v if v != 0 else None
    except (ValueError, TypeError):
        return None


def _parse_cost(val: str) -> float | None:
    """Parse cost; empty -> None."""
    val = val.strip()
    if not val:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _parse_int(val: str) -> int | None:
    """Parse integer; empty or 0 -> None."""
    val = val.strip()
    if not val:
        return None
    try:
        v = int(val)
        return v if v != 0 else None
    except (ValueError, TypeError):
        return None


def _parse_section_rows(lines: list[str], start: int) -> tuple[list[str], list[list[str]], int]:
    """Parse rows starting at `start` until the next section header or EOF.
    Returns (csv_headers, parsed_rows, next_line_index)."""
    if start >= len(lines):
        return [], [], start

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

def parse_vehicle_section(headers: list[str], rows: list[list[str]]) -> dict:
    """Parse Vehicle section -> data dict for upsert_vehicle()."""
    if not rows:
        raise ValueError("Vehicle section is empty")

    row = rows[0]
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
        "fuel_type": "petrol",
        # Always active on import — Fuelio's own "Active" flag tracks which
        # vehicle was selected in ITS app, not whether the user still wants
        # to track it here. Importing a vehicle is an explicit request to
        # track it, so it must show up regardless of that flag's value.
        "active": 1,
    }
    return data


def parse_log_section(headers: list[str], rows: list[list[str]], vehicle_id: int) -> list[dict]:
    """Parse Log section -> list of entry dicts for insert_vehicle_log_entries()."""
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
        date_val = _field("Data")  # Romanian locale - "Data" not "Date"

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


def parse_costs_section(headers: list[str], rows: list[list[str]], vehicle_id: int) -> list[dict]:
    """Parse Costs section -> list of entry dicts for insert_vehicle_log_entries()."""
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


def derive_vehicle_reminder_fields(entries: list[dict]) -> dict:
    """Derive vehicle-profile fields (apk_due, insurance_due, service interval/last-service)
    from a list of Costs-section entries (freshly parsed or already stored in vehicle_log —
    both share the same entry_type/remind_date/repeat_odo/repeat_months/odo_km/date shape).

    A renewal always pushes reminder dates further into the future, so the latest
    remind_date among same-type entries is the current one. For maintenance, the entry
    with the latest date is the most recent service performed.
    """
    fields: dict = {}

    def _latest_value(candidates: list[dict], key: str):
        values = [e[key] for e in candidates if e.get(key)]
        return max(values) if values else None

    apk_due = _latest_value([e for e in entries if e.get("entry_type") == "service"], "remind_date")
    if apk_due:
        fields["apk_due"] = apk_due

    insurance_due = _latest_value([e for e in entries if e.get("entry_type") == "insurance"], "remind_date")
    if insurance_due:
        fields["insurance_due"] = insurance_due

    maintenance_entries = [e for e in entries if e.get("entry_type") == "maintenance"]
    if maintenance_entries:
        latest = max(maintenance_entries, key=lambda e: e.get("date") or "")
        if latest.get("repeat_odo"):
            fields["service_interval_km"] = latest["repeat_odo"]
        if latest.get("repeat_months"):
            fields["service_interval_months"] = latest["repeat_months"]
        if latest.get("odo_km"):
            fields["last_service_km"] = latest["odo_km"]
        if latest.get("date"):
            fields["last_service_date"] = latest["date"][:10]

    return fields


def parse_csv(file_bytes: bytes) -> tuple[dict | None, list[dict], list[dict]]:
    """Parse a Fuelio sync CSV file.

    Args:
        file_bytes: Raw bytes of the CSV file.

    Returns:
        (vehicle_data, log_entries, cost_entries)

    Raises:
        ValueError: If the file is not a valid Fuelio sync file or is too large.
    """
    if len(file_bytes) > 2 * 1024 * 1024:
        raise ValueError("File too large (max 2MB)")

    text = file_bytes.decode("utf-8-sig", errors="replace")
    lines = text.splitlines()

    if not lines or lines[0].strip().strip('"') != "## Vehicle":
        raise ValueError("Not a Fuelio sync file")

    vehicle_data = None
    log_entries: list[dict] = []
    cost_entries: list[dict] = []

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        stripped = line.strip('"').strip()
        if not stripped.startswith("## "):
            i += 1
            continue

        section_name = stripped[3:].strip()

        if section_name in IGNORED_SECTIONS:
            i += 1
            while i < len(lines):
                if lines[i].strip().strip('"').strip().startswith("## "):
                    break
                i += 1
            continue

        if section_name == "Vehicle":
            headers, rows, i = _parse_section_rows(lines, i + 1)
            if rows:
                vehicle_data = parse_vehicle_section(headers, rows)
            continue

        if section_name == "Log":
            if vehicle_data is None:
                raise ValueError("Vehicle section must appear before Log")
            headers, rows, i = _parse_section_rows(lines, i + 1)
            if rows:
                log_entries = parse_log_section(headers, rows, 0)
            continue

        if section_name == "CostCategories":
            i += 1
            while i < len(lines):
                if lines[i].strip().strip('"').strip().startswith("## "):
                    break
                i += 1
            continue

        if section_name == "Costs":
            if vehicle_data is None:
                raise ValueError("Vehicle section must appear before Costs")
            headers, rows, i = _parse_section_rows(lines, i + 1)
            if rows:
                cost_entries = parse_costs_section(headers, rows, 0)
            continue

        # Unknown section - skip
        i += 1
        while i < len(lines):
            if lines[i].strip().strip('"').strip().startswith("## "):
                break
            i += 1

    if vehicle_data is None:
        raise ValueError("No vehicle section found in file")

    return vehicle_data, log_entries, cost_entries
