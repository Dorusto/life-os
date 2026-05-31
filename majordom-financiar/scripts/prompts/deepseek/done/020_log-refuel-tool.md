# DeepSeek Prompt — log_refuel chat tool (M3 Pasul 4)

## Context

Majordom is a personal finance assistant. The user logs refuels via chat. When the LLM detects a refuel (e.g. "just filled up 40L at €72"), it calls `log_refuel`. This triggers a confirmation card. On confirm, two things happen:
1. INSERT into `vehicle_log` (SQLite — operational data)
2. Create an AB transaction via existing `propose_transaction` flow (financial data)

The existing confirmation pattern (from proposals.py):
- Tool stores pending data in memory → returns card JSON → frontend shows card → user confirms → backend endpoint executes

## Files to create/modify

1. **`backend/tools/vehicle_proposals.py`** — new, in-memory pending refuel store
2. **`backend/api/vehicle_proposals.py`** — new, confirm endpoint
3. **`backend/tools/finance/vehicle.py`** — add `log_refuel()` function (file already exists with `get_vehicle_stats`)
4. **`backend/tools/registry.py`** — add `log_refuel` tool + dispatch
5. **`backend/main.py`** — register vehicle_proposals router
6. **`frontend/src/components/FuelLogCard.tsx`** — new card component
7. **`frontend/src/pages/Chat.tsx`** — add `fuel_log` message type + render FuelLogCard

---

## 1. `backend/tools/vehicle_proposals.py`

In-memory store for pending refuel proposals. Same pattern as `proposals.py`.

```python
"""In-memory store for pending refuel proposals."""
import uuid

_refuels: dict[str, dict] = {}

def create(
    vehicle_name: str,
    vehicle_id: int | None,
    liters: float,
    total_eur: float,
    odo_km: float | None,
    location: str,
    full_tank: bool,
    date: str,
    account_id: str,
    account_name: str,
) -> str:
    pid = uuid.uuid4().hex[:8]
    _refuels[pid] = {
        "vehicle_name": vehicle_name,
        "vehicle_id": vehicle_id,
        "liters": liters,
        "total_eur": total_eur,
        "odo_km": odo_km,
        "location": location,
        "full_tank": full_tank,
        "date": date,
        "account_id": account_id,
        "account_name": account_name,
    }
    return pid

def get(pid: str) -> dict | None:
    return _refuels.get(pid)

def delete(pid: str) -> None:
    _refuels.pop(pid, None)
```

---

## 2. `backend/api/vehicle_proposals.py`

Single endpoint: confirm a pending refuel.

```
POST /api/vehicle/proposals/confirm/{proposal_id}
```

On confirm:
1. Get pending refuel from `vehicle_proposals.get(proposal_id)` — 404 if not found
2. INSERT into `vehicle_log` via `MemoryDB.insert_vehicle_log_entries()`
3. Create AB transaction via `ActualBudgetClient.add_transaction()` directly (payee = location or "Fuel", category = Transport, amount = total_eur)
4. Delete the pending proposal
5. Return `{"ok": true, "vehicle_log_id": <id>}`

For step 3, use the existing `add_transaction` from `ActualBudgetClient`:
```python
from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings

actual = ActualBudgetClient(url=settings.actual.url, password=settings.actual.password, sync_id=settings.actual.sync_id)
await actual.add_transaction(
    account_id=refuel["account_id"],
    date=refuel["date"],
    payee=refuel["location"] or "Fuel",
    amount=refuel["total_eur"],
    category_name="Transport",  # fallback; look up Transport or Fuel subcategory
    notes=f"[refuel] {refuel['vehicle_name']} {refuel['liters']:.1f}L",
    is_expense=True,
)
```

For the vehicle_log INSERT, create a list with one entry dict:
```python
db = MemoryDB(db_path=settings.memory.db_path)
entries = [{
    "vehicle_id": refuel["vehicle_id"],
    "date": refuel["date"],
    "odo_km": refuel["odo_km"],
    "entry_type": "fuel",
    "fuel_liters": refuel["liters"],
    "fuel_price_per_liter": round(refuel["total_eur"] / refuel["liters"], 4) if refuel["liters"] else None,
    "fuel_full_tank": 1 if refuel["full_tank"] else 0,
    "fuel_missed": 0,
    "cost_total": refuel["total_eur"],
    "cost_currency": "EUR",
    "location": refuel["location"],
    "source": "manual",
    "fuelio_unique_id": None,
}]
inserted, _ = db.insert_vehicle_log_entries(entries)
```

Auth: `Depends(get_current_user)` (same as other endpoints).

---

## 3. `backend/tools/finance/vehicle.py` — add `log_refuel`

Add this function to the existing file (which already has `get_vehicle_stats`):

```python
async def log_refuel(
    vehicle_name: str,
    liters: float,
    total_eur: float,
    odo_km: float | None = None,
    location: str = "",
    full_tank: bool = True,
) -> str:
    """
    Propose a refuel entry. Returns a card JSON for frontend confirmation.
    Does NOT write to DB yet — only creates a pending proposal.
    """
    import json
    from datetime import date as _date
    from backend.tools import vehicle_proposals
    from backend.core.memory.database import MemoryDB
    from backend.core.config import settings
    from backend.tools.finance.actual_budget import _get_client, _looks_like_uuid

    today = _date.today().isoformat()

    # Resolve vehicle_id
    db = MemoryDB(db_path=settings.memory.db_path)
    vehicles = db.get_vehicles()
    matched = next((v for v in vehicles if vehicle_name.lower() in v["name"].lower()), None)
    vehicle_id = matched["id"] if matched else None
    display_name = matched["name"] if matched else vehicle_name

    # Resolve account
    account_id = ""
    account_name = ""
    try:
        accounts = await _get_client().get_accounts()
        if accounts:
            account_id = accounts[0].id
            account_name = accounts[0].name
    except Exception:
        pass

    proposal_id = vehicle_proposals.create(
        vehicle_name=display_name,
        vehicle_id=vehicle_id,
        liters=liters,
        total_eur=total_eur,
        odo_km=odo_km,
        location=location,
        full_tank=full_tank,
        date=today,
        account_id=account_id,
        account_name=account_name,
    )

    price_per_liter = round(total_eur / liters, 3) if liters else None

    return json.dumps({
        "type": "fuel_log",
        "id": proposal_id,
        "vehicle_name": display_name,
        "liters": liters,
        "total_eur": total_eur,
        "price_per_liter": price_per_liter,
        "odo_km": odo_km,
        "location": location,
        "full_tank": full_tank,
        "date": today,
        "account_id": account_id,
        "account_name": account_name,
    })
```

---

## 4. `backend/tools/registry.py` — add log_refuel

Add to `TOOLS` list:

```python
{
    "type": "function",
    "function": {
        "name": "log_refuel",
        "description": (
            "Log a vehicle refuel. Use when the user says they filled up, added fuel, "
            "refueled their car or motorcycle. "
            "The user will see a confirmation card before anything is saved."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "vehicle_name": {
                    "type": "string",
                    "description": "Vehicle name, e.g. 'kia', 'suzuki'. Leave empty if user has one vehicle.",
                },
                "liters": {
                    "type": "number",
                    "description": "Liters of fuel added, e.g. 40.5",
                },
                "total_eur": {
                    "type": "number",
                    "description": "Total amount paid in EUR, e.g. 72.50",
                },
                "odo_km": {
                    "type": "number",
                    "description": "Odometer reading in km at time of refuel. Omit if not mentioned.",
                },
                "location": {
                    "type": "string",
                    "description": "Gas station name or city. Omit if not mentioned.",
                },
                "full_tank": {
                    "type": "boolean",
                    "description": "True if filled to full tank (default), False for partial fill.",
                },
            },
            "required": ["liters", "total_eur"],
        },
    },
},
```

Add to `execute_tool()`:
```python
if name == "log_refuel":
    from backend.tools.finance.vehicle import log_refuel
    return await log_refuel(**arguments)
```

---

## 5. `backend/main.py`

```python
from backend.api import vehicle_proposals
app.include_router(vehicle_proposals.router, prefix="/api")
```

---

## 6. `frontend/src/components/FuelLogCard.tsx` — new component

A confirmation card for a pending refuel. Fields are editable before confirm.

```
┌──────────────────────────────────────────────────┐
│ ⛽ Log Refuel — KIA                               │
│                                                  │
│  Liters:    [40.5          ]                     │
│  Total:     [€ 72.50       ]  (€1.789/L)         │
│  Odometer:  [260 269 km    ]  (optional)         │
│  Location:  [Shell Zaandam ]  (optional)         │
│  Full tank: [✓]                                  │
│  Date:      [2026-05-31    ]                     │
│  Account:   [ING current   ]                     │
│                                                  │
│  [Cancel]               [Confirm & Save]         │
└──────────────────────────────────────────────────┘
```

**Props:**

```typescript
export interface FuelLogProposal {
  type: 'fuel_log'
  id: string
  vehicle_name: string
  liters: number
  total_eur: number
  price_per_liter: number | null
  odo_km: number | null
  location: string
  full_tank: boolean
  date: string
  account_id: string
  account_name: string
}

interface FuelLogCardProps {
  data: FuelLogProposal
  onConfirmed: () => void
  onCancelled: () => void
}
```

**On confirm:**
- `POST /api/vehicle/proposals/confirm/{data.id}` with no body (or body with editable field overrides if you allow editing)
- On success: call `onConfirmed()`
- On error: show error message

**Tailwind styling:** follow ProposalCard style — `bg-surface rounded-xl p-4 shadow-sm`.

---

## 7. `frontend/src/pages/Chat.tsx`

Add `'fuel_log'` to the role union. The tool response JSON with `"type": "fuel_log"` is handled in the chat streaming logic the same way as `"type": "proposal"`. Check where `proposal` type is detected in `handleChatChunk()` and add a branch for `fuel_log`:

```typescript
} else if (parsed.type === 'fuel_log') {
  setMessages(prev => [...prev, {
    role: 'fuel_log' as const,
    content: '',
    fuelLog: parsed as FuelLogProposal,
  }])
```

In the message render section:
```tsx
} : msg.role === 'fuel_log' && msg.fuelLog ? (
  <FuelLogCard
    data={msg.fuelLog}
    onConfirmed={() => { /* optional: show success message */ }}
    onCancelled={() => { /* remove card or show cancelled */ }}
  />
```

Import `FuelLogCard` from `'../components/FuelLogCard'` and `FuelLogProposal` from the same.

---

## Notes

- The `log_refuel` tool does NOT write to DB — only creates a pending proposal. The write happens on `/api/vehicle/proposals/confirm/{id}`.
- The confirm endpoint does TWO writes: vehicle_log (SQLite) + AB transaction (via ActualBudgetClient).
- `fuelio_unique_id` is NULL for manual refuels — no dedup needed for them.
- The UNIQUE constraint on vehicle_log is `(vehicle_id, fuelio_unique_id, entry_type)` — since manual entries have NULL fuelio_unique_id, they never conflict with Fuelio-imported entries.
