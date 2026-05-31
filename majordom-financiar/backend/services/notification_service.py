"""
Daily digest notification service.

One job runs at the user-configured time (default 20:00 Europe/Amsterdam).
All checks run together; results are bundled into a single Web Push notification.

Architecture:
  _check_*() functions → return str | None (no push sent, no side effects)
  _log_*()  functions  → persist anti-spam state after the push is sent
  run_daily_digest()   → orchestrates everything, sends ONE push
"""

import json
import logging
import sqlite3
from datetime import date, datetime, timedelta

import httpx

from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings
from backend.core.memory.database import MemoryDB
from backend.services.push_service import get_push_service

logger = logging.getLogger(__name__)

_FINANCIAL_SYSTEM_PROMPT = (
    "You are Majordom, a personal finance assistant. "
    "Write a short daily financial summary — max 2 sentences, friendly tone.\n"
    "- If no transactions today: ask if everything is ok or if the user bought something.\n"
    "- If transactions exist: summarize the day and add a useful budget observation.\n"
    "- Do not repeat raw numbers — interpret and provide context.\n"
    "- If a category exceeds 80% of its budget: mention it.\n"
    "- Always respond in English."
)


def _build_headers() -> dict[str, str]:
    """Build HTTP headers with optional Authorization for cloud APIs."""
    headers = {"Content-Type": "application/json"}
    if settings.ollama.api_key:
        headers["Authorization"] = f"Bearer {settings.ollama.api_key}"
    return headers


# ---------------------------------------------------------------------------
# Private checkers — return a short alert string or None (no side effects)
# ---------------------------------------------------------------------------

async def _check_financial_summary(db: MemoryDB) -> str | None:
    """Generate LLM financial summary. Returns None if already sent today."""
    rule = db.get_notification_rule("daily_summary")
    if not rule or not rule["enabled"]:
        return None

    last = db.get_last_notification("daily_summary")
    if last and last["sent_at"][:10] == date.today().isoformat():
        return None

    try:
        client = ActualBudgetClient(
            url=settings.actual.url,
            password=settings.actual.password,
            sync_id=settings.actual.sync_id,
        )
        accounts = await client.get_accounts()
        today_transactions = await client.get_today_transactions()
        budget_status = await client.get_budget_status()

        summary = {
            "date": date.today().strftime("%d %B %Y"),
            "transactions_today": [
                {"payee": t.payee or "Unknown", "amount": t.amount / 100, "category": t.category or ""}
                for t in today_transactions
            ],
            "budget_overview": [
                {"category": b["category_name"], "spent": b["spent"], "budgeted": b["budgeted"], "percentage": b["percentage"]}
                for b in budget_status if b["budgeted"] > 0
            ][:5],
            "total_balance": sum(a.balance for a in accounts),
        }

        payload = {
            "model": settings.ollama.chat_model,
            "messages": [
                {"role": "system", "content": _FINANCIAL_SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(summary, ensure_ascii=False)},
            ],
            "stream": False,
            "options": {"temperature": 0.7, "num_predict": 150},
        }
        headers = _build_headers()
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as http_client:
            resp = await http_client.post(
                f"{settings.ollama.base_url}/v1/chat/completions",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
            text = data["choices"][0]["message"]["content"].strip()

        # Store transaction count for logging after push is sent
        _check_financial_summary._tx_count = len(today_transactions)
        return text

    except Exception as e:
        logger.error("Financial summary check failed: %s", e)
        return None


def _check_import_nudge(db: MemoryDB) -> str | None:
    """Return nudge text if no import in N days. None if not due."""
    rule = db.get_notification_rule("import_nudge")
    if not rule or not rule["enabled"]:
        return None

    days_threshold = rule["config"].get("days", 7)
    last_import = db.get_last_notification("csv_import")
    if not last_import:
        return None  # never imported — don't nudge

    days_since = (datetime.now() - datetime.fromisoformat(last_import["sent_at"])).days
    if days_since < days_threshold:
        return None

    last_nudge = db.get_last_notification("import_nudge")
    if last_nudge and last_nudge["sent_at"][:10] == date.today().isoformat():
        return None

    return f"No import in {days_since} days — want to add recent transactions?"


def _check_pending_review(db: MemoryDB) -> tuple[str | None, list]:
    """Return nudge text + financial_ids if uncategorized transactions need review."""
    rule = db.get_notification_rule("pending_review")
    if not rule or not rule["enabled"]:
        return None, []

    min_age_hours = rule["config"].get("min_age_hours", 48)
    pending = db.get_unnotified_pending_reviews(min_age_hours=min_age_hours)
    if not pending:
        return None, []

    last_nudge = db.get_last_notification("pending_review")
    if last_nudge and last_nudge["sent_at"][:10] == date.today().isoformat():
        return None, []

    count = len(pending)
    financial_ids = [p["financial_id"] for p in pending]
    text = f"{count} transaction{'s' if count > 1 else ''} need{'s' if count == 1 else ''} category review."
    return text, financial_ids


def _check_vehicle_reminders(db: MemoryDB) -> list[tuple[str, str, dict]]:
    """Return list of (alert_text, log_key, log_payload) for vehicle alerts due today.

    Covers:
    - APK/insurance expiring within warn_days
    - Missing APK or insurance dates (nudge every 30 days)
    """
    rule = db.get_notification_rule("vehicle_reminders")
    if not rule or not rule["enabled"]:
        return []

    warn_days = rule["config"].get("warn_days", 30)
    today = date.today()
    alerts: list[tuple[str, str, dict]] = []

    conn = sqlite3.connect(settings.memory.db_path)
    conn.row_factory = sqlite3.Row
    try:
        vehicles = [dict(r) for r in conn.execute(
            "SELECT id, name, apk_due, insurance_due, "
            "service_interval_km, service_interval_months, last_service_km, last_service_date "
            "FROM vehicles WHERE active=1"
        ).fetchall()]
        # Current ODO per vehicle (max from vehicle_log)
        odo_rows = {r["vehicle_id"]: r["current_odo"] for r in conn.execute(
            "SELECT vehicle_id, MAX(odo_km) as current_odo FROM vehicle_log GROUP BY vehicle_id"
        ).fetchall()}
    finally:
        conn.close()

    for v in vehicles:
        # Expiry reminders
        for reminder_type, field in [("apk", "apk_due"), ("insurance", "insurance_due")]:
            due_str = v.get(field)
            if not due_str:
                continue
            try:
                due = date.fromisoformat(due_str)
            except ValueError:
                continue

            days = (due - today).days
            if days > warn_days:
                continue

            spam_key = f"vehicle_reminder_{v['id']}_{reminder_type}"
            last = db.get_last_notification(spam_key)
            if last and (datetime.now() - datetime.fromisoformat(last["sent_at"])).days < 7:
                continue

            label = "APK/ITP" if reminder_type == "apk" else "insurance"
            if days < 0:
                text = f"⚠️ {v['name']} {label} expired {abs(days)} days ago — renew now."
            elif days == 0:
                text = f"⚠️ {v['name']} {label} expires today."
            else:
                text = f"🚗 {v['name']} {label} expires in {days} days ({due_str})."

            alerts.append((text, spam_key, {"vehicle": v["name"], "type": reminder_type, "days": days}))

        # Service reminder (by km or by date)
        interval_km = v.get("service_interval_km")
        interval_months = v.get("service_interval_months")
        last_service_km = v.get("last_service_km")
        last_service_date_str = v.get("last_service_date")
        current_odo = odo_rows.get(v["id"])

        if interval_km and last_service_km and current_odo:
            next_service_km = last_service_km + interval_km
            remaining_km = next_service_km - current_odo
            warn_km = rule["config"].get("warn_km", 2000)
            if 0 < remaining_km <= warn_km:
                spam_key = f"vehicle_service_km_{v['id']}"
                last = db.get_last_notification(spam_key)
                if not last or (datetime.now() - datetime.fromisoformat(last["sent_at"])).days >= 7:
                    text = (
                        f"🔧 {v['name']} service due in {remaining_km:.0f} km "
                        f"(at {next_service_km:.0f} km). Book your appointment soon."
                    )
                    alerts.append((text, spam_key, {"vehicle": v["name"], "remaining_km": remaining_km}))
            elif remaining_km <= 0:
                spam_key = f"vehicle_service_km_{v['id']}"
                last = db.get_last_notification(spam_key)
                if not last or (datetime.now() - datetime.fromisoformat(last["sent_at"])).days >= 7:
                    text = f"⚠️ {v['name']} is {abs(remaining_km):.0f} km overdue for service."
                    alerts.append((text, spam_key, {"vehicle": v["name"], "overdue_km": abs(remaining_km)}))

        if interval_months and last_service_date_str:
            try:
                last_service_date = date.fromisoformat(last_service_date_str)
                next_service_date = date(
                    last_service_date.year + (last_service_date.month + interval_months - 1) // 12,
                    (last_service_date.month + interval_months - 1) % 12 + 1,
                    last_service_date.day,
                )
                days_to_service = (next_service_date - today).days
                if 0 < days_to_service <= warn_days:
                    spam_key = f"vehicle_service_date_{v['id']}"
                    last = db.get_last_notification(spam_key)
                    if not last or (datetime.now() - datetime.fromisoformat(last["sent_at"])).days >= 7:
                        text = (
                            f"🔧 {v['name']} service due in {days_to_service} days "
                            f"({next_service_date.isoformat()}) — {interval_months} months since last service."
                        )
                        alerts.append((text, spam_key, {"vehicle": v["name"], "days": days_to_service}))
                elif days_to_service <= 0:
                    spam_key = f"vehicle_service_date_{v['id']}"
                    last = db.get_last_notification(spam_key)
                    if not last or (datetime.now() - datetime.fromisoformat(last["sent_at"])).days >= 7:
                        text = f"⚠️ {v['name']} is {abs(days_to_service)} days overdue for service."
                        alerts.append((text, spam_key, {"vehicle": v["name"], "overdue_days": abs(days_to_service)}))
            except (ValueError, OverflowError):
                pass

        # Setup nudge for missing APK/insurance dates
        missing = []
        if not v.get("apk_due"):
            missing.append("APK/ITP")
        if not v.get("insurance_due"):
            missing.append("insurance")

        if not missing:
            continue

        nudge_key = f"vehicle_setup_nudge_{v['id']}"
        last_nudge = db.get_last_notification(nudge_key)
        if last_nudge and (datetime.now() - datetime.fromisoformat(last_nudge["sent_at"])).days < 30:
            continue

        missing_str = " and ".join(missing)
        text = (
            f"🚗 {v['name']} has no {missing_str} date set — "
            f"tell me the expiry date{'s' if len(missing) > 1 else ''} so I can remind you."
        )
        alerts.append((text, nudge_key, {"vehicle": v["name"], "missing": missing}))

    return alerts


# ---------------------------------------------------------------------------
# Main orchestrator — one push per day with everything bundled
# ---------------------------------------------------------------------------

async def run_daily_digest():
    """Single daily job: collect all alerts, send one bundled Web Push."""
    try:
        db = MemoryDB(settings.memory.db_path)
        today = date.today().isoformat()

        # Guard: never send more than one digest per day
        last_digest = db.get_last_notification("daily_digest")
        if last_digest and last_digest["sent_at"][:10] == today:
            logger.debug("Daily digest already sent today, skipping")
            return

        # --- Collect all alert texts ---
        parts: list[str] = []

        financial_text = await _check_financial_summary(db)
        if financial_text:
            parts.append(financial_text)

        import_text = _check_import_nudge(db)
        if import_text:
            parts.append(import_text)

        review_text, pending_ids = _check_pending_review(db)
        if review_text:
            parts.append(review_text)

        vehicle_alerts = _check_vehicle_reminders(db)
        for text, _, _ in vehicle_alerts:
            parts.append(text)

        if not parts:
            logger.debug("No content for daily digest today")
            return

        # --- Build push body ---
        # Financial summary (if present) is the first sentence.
        # Alerts follow, separated by " · "
        body = " · ".join(parts)

        push_svc = get_push_service()
        await push_svc.send_to_all(
            user_id="default",
            title="Majordom",
            body=body,
            url="/chat",
        )

        # --- Log everything (anti-spam state) ---
        db.log_notification("daily_digest", {"parts_count": len(parts)})

        if financial_text:
            db.log_notification("daily_summary", {
                "message": financial_text,
                "transactions_count": getattr(_check_financial_summary, "_tx_count", 0),
            })

        if import_text:
            db.log_notification("import_nudge", {})

        if review_text and pending_ids:
            db.mark_pending_reviews_notified(pending_ids)
            db.cleanup_old_pending_reviews()
            db.log_notification("pending_review", {"count": len(pending_ids)})

        for _, log_key, log_payload in vehicle_alerts:
            db.log_notification(log_key, log_payload)

        logger.info("Daily digest sent — %d part(s): %s", len(parts), " | ".join(p[:40] for p in parts))

    except Exception as e:
        logger.error("Daily digest job failed: %s", e, exc_info=True)


# ---------------------------------------------------------------------------
# Legacy aliases — kept so existing scheduler references don't break during
# transition. All delegate to run_daily_digest().
# ---------------------------------------------------------------------------

async def run_daily_summary():
    await run_daily_digest()


async def run_import_nudge():
    pass  # now handled inside run_daily_digest


async def run_pending_review_nudge():
    pass  # now handled inside run_daily_digest


async def run_vehicle_reminders():
    pass  # now handled inside run_daily_digest
