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
import time as time_module
from datetime import date, datetime, timedelta

import httpx

from backend.core.config import settings
from backend.core.finance.provider import get_provider
from backend.core.memory.database import MemoryDB
from backend.services.push_service import get_push_service

logger = logging.getLogger(__name__)


async def _save_to_chat_history(body: str, db: MemoryDB) -> None:
    """Save notification text to chat history for all active users.

    Collects user_ids from both push_subscriptions and recently active
    chat_history rows (covers legacy 'default' subscriptions and users
    without push enabled). Skips 'default' placeholder IDs.
    """
    conn = sqlite3.connect(db.db_path)
    try:
        thirty_days_ago = int((time_module.time() - 30 * 86400) * 1000)
        push_rows = conn.execute(
            "SELECT DISTINCT user_id FROM push_subscriptions"
        ).fetchall()
        chat_rows = conn.execute(
            "SELECT DISTINCT user_id FROM chat_history WHERE ts > ?",
            (thirty_days_ago,),
        ).fetchall()
        user_ids = {r[0] for r in push_rows + chat_rows if r[0] and r[0] != "default"}
        if not user_ids:
            return
        ts = int(time_module.time() * 1000)
        conn.executemany(
            "INSERT INTO chat_history (user_id, role, content, ts) VALUES (?, ?, ?, ?)",
            [(uid, "assistant", body, ts) for uid in user_ids],
        )
        conn.commit()
    except Exception as e:
        logger.warning("Could not save notification to chat history: %s", e)
    finally:
        conn.close()


_FINANCIAL_SYSTEM_PROMPT = (
    "You are Majordom, a personal finance assistant. "
    "Write a short daily financial summary — max 2 sentences, friendly tone.\n"
    "- If no transactions today: congratulate the user for a spend-free day and note that all categories are on track.\n"
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
        client = get_provider()
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


async def _check_uncategorized_transactions(db: MemoryDB) -> str | None:
    """Return nudge text if there are uncategorized transactions in AB. None if disabled or zero."""
    rule = db.get_notification_rule("uncategorized_alert")
    if not rule or not rule["enabled"]:
        return None

    last = db.get_last_notification("uncategorized_alert")
    if last and last["sent_at"][:10] == date.today().isoformat():
        return None

    try:
        client = get_provider()
        count = await client.count_uncategorized()
    except Exception as e:
        logger.error("Uncategorized transactions check failed: %s", e)
        return None

    if count == 0:
        return None

    return (
        f"You have {count} uncategorized transaction{'s' if count > 1 else ''}. "
        f"Say 'review uncategorized transactions' to categorize them."
    )


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
            icon = "🏍️" if v.get("vehicle_type") == "motorcycle" else "🚗"
            if days < 0:
                text = f"⚠️ {v['name']} {label} expired {abs(days)} days ago — renew now."
            elif days == 0:
                text = f"⚠️ {v['name']} {label} expires today."
            else:
                text = f"{icon} {v['name']} {label} expires in {days} days ({due_str})."

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
        icon = "🏍️" if v.get("vehicle_type") == "motorcycle" else "🚗"
        text = (
            f"{icon} {v['name']} has no {missing_str} date set — "
            f"tell me the expiry date{'s' if len(missing) > 1 else ''} so I can remind you."
        )
        alerts.append((text, nudge_key, {"vehicle": v["name"], "missing": missing}))

    return alerts


# ---------------------------------------------------------------------------
# check_budget_alert — M4.2 immediate post-transaction alert (standalone,
# not a _check_* function — sends its own push and logs itself)
# ---------------------------------------------------------------------------

async def check_budget_alert(category_name: str, db: MemoryDB) -> None:
    """Check if a category is over budget after adding a transaction.
    
    This is called from the tool layer (fire-and-forget). It sends its own
    push notification and logs itself — it does NOT participate in the digest.
    Never raises (errors are logged and swallowed).
    """
    try:
        rule = db.get_notification_rule("budget_alert")
        if not rule or not rule["enabled"]:
            return

        # Anti-spam: max one alert per category per day
        spam_key = f"budget_alert_{category_name}"
        last = db.get_last_notification(spam_key)
        if last and last["sent_at"][:10] == date.today().isoformat():
            return

        client = get_provider()
        budget_status = await client.get_budget_status()

        # Find matching category (case-insensitive)
        entry = None
        for b in budget_status:
            if b["category_name"].lower() == category_name.lower():
                entry = b
                break
        if not entry or entry["budgeted"] == 0:
            return

        spent = entry["spent"]
        budgeted = entry["budgeted"]
        percentage = round(spent / budgeted * 100, 1) if budgeted > 0 else 0.0

        if spent < budgeted:
            return  # not over budget

        # Build text with escalating severity
        if percentage >= 110:
            prefix = "⚠️⚠️"
        else:
            prefix = "⚠️"

        text = (
            f"{prefix} Budget alert: {category_name} is at "
            f"{percentage:.0f}% ({spent:.2f} / {budgeted:.2f} €). "
            f"Budget exceeded."
        )

        push_svc = get_push_service()
        await push_svc.broadcast(title="Majordom", body=text, url="/chat")
        db.log_notification(spam_key, {"category": category_name, "percentage": percentage})

    except Exception as e:
        logger.error("Budget alert check failed: %s", e)


# ---------------------------------------------------------------------------
# _check_income_variance — M4.3 daily digest checker
# ---------------------------------------------------------------------------

async def _check_income_variance(db: MemoryDB) -> str | None:
    """Warn if current month income is significantly lower than 3-month avg."""
    rule = db.get_notification_rule("income_variance")
    if not rule or not rule["enabled"]:
        return None

    last = db.get_last_notification("income_variance")
    if last and last["sent_at"][:10] == date.today().isoformat():
        return None

    today = date.today()

    # Build historical list: last 3 calendar months (excluding current)
    historical_incomes = []
    for i in range(1, 4):
        m = today.month - i
        y = today.year
        if m <= 0:
            m += 12
            y -= 1
        try:
            stats = await get_provider().get_monthly_stats(month=m, year=y)
            historical_incomes.append(stats["income"])
        except Exception as e:
            logger.warning("Could not fetch monthly stats for %d-%02d: %s", y, m, e)
            continue

    # Need at least 2 months with income > 0
    valid = [inc for inc in historical_incomes if inc > 0]
    if len(valid) < 2:
        return None

    # Get current month stats
    try:
        current_stats = await get_provider().get_monthly_stats()
    except Exception as e:
        logger.warning("Could not fetch current monthly stats: %s", e)
        return None

    current_income = current_stats["income"]

    # Too early in the month to judge
    if today.day < 10:
        return None

    historical_avg = sum(valid) / len(valid)
    threshold = rule["config"].get("threshold", 0.8)

    if current_income < historical_avg * threshold:
        return (
            f"⚠️ Income alert: only €{current_income:.2f} recorded this month "
            f"vs average €{historical_avg:.2f}. Is this expected?"
        )

    return None


# ---------------------------------------------------------------------------
# _check_goal_risk — M4.4 daily digest checker
# ---------------------------------------------------------------------------

async def _check_goal_risk(db: MemoryDB) -> str | None:
    """Warn if a savings goal is at risk of missing its deadline (max weekly per goal)."""
    rule = db.get_notification_rule("goal_risk")
    if not rule or not rule["enabled"]:
        return None

    try:
        goals = await get_provider().get_goals()
    except Exception as e:
        logger.warning("Could not fetch goals: %s", e)
        return None

    # Filter: only goals with deadline, months_remaining > 0
    at_risk: list[str] = []

    # Anti-spam: entire goal_risk block, max once per 7 days
    last_global = db.get_last_notification("goal_risk")
    if last_global:
        days_since_global = (datetime.now() - datetime.fromisoformat(last_global["sent_at"])).days
        if days_since_global < 7:
            return None

    for goal in goals:
        deadline = goal.get("deadline")
        months_remaining = goal.get("months_remaining")
        if not deadline or months_remaining is None or months_remaining <= 0:
            continue

        percentage = goal.get("percentage", 0) or 0

        # Determine risk
        is_urgent = months_remaining <= 3 and percentage < 90
        is_at_risk = months_remaining <= 6 and percentage < 60

        if not is_urgent and not is_at_risk:
            continue

        monthly_needed = goal.get("monthly_needed") or 0
        prefix = "⚠️ " if months_remaining <= 3 else ""
        text = (
            f"🎯 Goal '{goal['name']}': {percentage:.0f}% done, "
            f"deadline {deadline} ({months_remaining} months left). "
            f"Need €{monthly_needed:.0f}/month."
        )
        at_risk.append(prefix + text)

    if not at_risk:
        return None

    return "\n".join(at_risk)


async def _check_budget_copy_nudge(db: MemoryDB) -> str | None:
    """
    Early in the month, nudge to copy last month's budget if the current
    month's budget looks unset (issue #87's proactive variant — the base
    tool is request-only by design, this is a separate opt-in nudge).
    """
    rule = db.get_notification_rule("budget_copy_nudge")
    if not rule or not rule["enabled"]:
        return None

    today = date.today()
    if today.day > 5:
        return None

    last = db.get_last_notification("budget_copy_nudge")
    if last and last["sent_at"][:7] == today.isoformat()[:7]:
        return None

    try:
        client = get_provider()
        if today.month == 1:
            prev_year, prev_month = today.year - 1, 12
        else:
            prev_year, prev_month = today.year, today.month - 1

        prev_source = await client.get_budget_copy_source(prev_month, prev_year)
        prev_total = sum(c["amount"] for c in prev_source["categories"])
        if prev_total == 0:
            return None  # nothing to copy anyway

        current_source = await client.get_budget_copy_source(today.month, today.year)
        current_total = sum(c["amount"] for c in current_source["categories"])
        if current_total > 0:
            return None  # already set up
    except Exception as e:
        logger.warning("Budget copy nudge check failed: %s", e)
        return None

    return "New month, budget looks empty — say 'copy last month's budget' to carry over last month's amounts."


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
        # Each part is prefixed with a type-specific emoji and blank-line
        # separated so distinct alert types are visually scannable instead of
        # blending into one text block (issue #129) — important nudges like
        # categorization were getting lost among budget/goal alerts.
        parts: list[str] = []

        financial_text = await _check_financial_summary(db)
        if financial_text:
            parts.append(financial_text)

        import_text = _check_import_nudge(db)
        if import_text:
            parts.append(f"📥 {import_text}")

        review_text, pending_ids = _check_pending_review(db)
        if review_text:
            parts.append(f"🏷️ {review_text}")

        uncategorized_text = await _check_uncategorized_transactions(db)
        if uncategorized_text:
            parts.append(f"🏷️ {uncategorized_text}")

        # Vehicle/income-variance/goal-risk texts already carry their own
        # per-line emoji (⚠️/🚗/🏍️/🎯) — no external prefix, would double up.
        vehicle_alerts = _check_vehicle_reminders(db)
        for text, _, _ in vehicle_alerts:
            parts.append(text)

        income_variance_text = await _check_income_variance(db)
        if income_variance_text:
            parts.append(income_variance_text)

        goal_risk_text = await _check_goal_risk(db)
        if goal_risk_text:
            parts.append(goal_risk_text)

        budget_copy_nudge_text = await _check_budget_copy_nudge(db)
        if budget_copy_nudge_text:
            parts.append(f"📋 {budget_copy_nudge_text}")

        if not parts:
            logger.debug("No content for daily digest today")
            return

        # --- Build push body ---
        # Financial summary (if present) is the first sentence, unprefixed.
        # Alerts follow, each on its own paragraph so the type-emoji prefix
        # and text stay visually grouped and distinct from neighboring alerts.
        body = "\n\n".join(parts)

        push_svc = get_push_service()
        await push_svc.broadcast(
            title="Majordom",
            body=body,
            url="/chat",
        )

        # Also save to chat history so it appears in the conversation
        await _save_to_chat_history(body, db)

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

        if uncategorized_text:
            db.log_notification("uncategorized_alert", {})

        for _, log_key, log_payload in vehicle_alerts:
            db.log_notification(log_key, log_payload)

        if income_variance_text:
            db.log_notification("income_variance", {})

        if goal_risk_text:
            db.log_notification("goal_risk", {})

        if budget_copy_nudge_text:
            db.log_notification("budget_copy_nudge", {})

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


# ---------------------------------------------------------------------------
# get_pending_items — live "needs resolving" list for the Home widget
# ---------------------------------------------------------------------------

async def get_pending_items() -> list[dict]:
    """
    Everything currently needing attention, computed live — unlike the daily
    digest, NOT gated by "already sent today/this week" anti-spam (Home
    should always reflect current state, not just what hasn't been pushed
    yet). Each item: {type, text, prompt} — `prompt` is a starting chat
    message the Home widget pre-fills (not auto-sends) when tapped.

    Deliberately reimplements the condition checks rather than calling the
    digest's _check_*() functions directly, since those have anti-spam
    baked in and would go silent here right after a digest fires.
    """
    items: list[dict] = []
    client = get_provider()

    # Uncategorized transactions
    try:
        count = await client.count_uncategorized()
        if count > 0:
            items.append({
                "type": "uncategorized",
                "text": f"{count} uncategorized transaction{'s' if count != 1 else ''}",
                "prompt": "review uncategorized transactions",
            })
    except Exception as e:
        logger.warning("get_pending_items: uncategorized check failed: %s", e)

    # Unreconciled transactions
    try:
        count = await client.count_unreconciled()
        if count > 0:
            items.append({
                "type": "unreconciled",
                "text": f"{count} unreconciled transaction{'s' if count != 1 else ''}",
                "prompt": "show me unreconciled transactions",
            })
    except Exception as e:
        logger.warning("get_pending_items: unreconciled check failed: %s", e)

    # Over-budget categories this month
    try:
        budget_status = await client.get_budget_status()
        for b in budget_status:
            if b["budgeted"] > 0 and b["percentage"] > 100:
                over_by = b["spent"] - b["budgeted"]
                items.append({
                    "type": "over_budget",
                    "text": f"{b['category_name']} is €{over_by:.0f} over budget",
                    "prompt": f"help me with {b['category_name']} being over budget this month",
                })
    except Exception as e:
        logger.warning("get_pending_items: budget status check failed: %s", e)

    # Goals at risk of missing their deadline (same thresholds as _check_goal_risk)
    try:
        goals = await client.get_goals()
        for goal in goals:
            deadline = goal.get("deadline")
            months_remaining = goal.get("months_remaining")
            if not deadline or months_remaining is None or months_remaining <= 0:
                continue
            percentage = goal.get("percentage", 0) or 0
            is_urgent = months_remaining <= 3 and percentage < 90
            is_at_risk = months_remaining <= 6 and percentage < 60
            if not is_urgent and not is_at_risk:
                continue
            items.append({
                "type": "goal_risk",
                "text": f"Goal '{goal['name']}' at {percentage:.0f}%, {months_remaining} months left",
                "prompt": f"how is my {goal['name']} goal doing?",
            })
    except Exception as e:
        logger.warning("get_pending_items: goal risk check failed: %s", e)

    # Vehicle reminders — reuses the digest check as-is. Known limitation:
    # its own anti-spam (max once per 7 days per alert) means an alert
    # pushed earlier today/this week won't reappear here until it expires,
    # even though Home is meant to show live state. Acceptable for now —
    # revisit if this turns out to hide real overdue reminders in practice.
    try:
        db = MemoryDB(settings.memory.db_path)
        vehicle_alerts = _check_vehicle_reminders(db)
        for text, _, payload in vehicle_alerts:
            vehicle_name = payload.get("vehicle", "")
            items.append({
                "type": "vehicle_reminder",
                "text": text,
                "prompt": f"tell me about {vehicle_name}'s upcoming reminder",
            })
    except Exception as e:
        logger.warning("get_pending_items: vehicle reminders check failed: %s", e)

    # Account staleness — split by account type. Bank-linked accounts should
    # sync automatically; if last_sync is >24h old something's actually
    # wrong and a manual resync helps. Manual/CSV-only accounts have no
    # auto-sync at all, so the bar is a week without a fresh import instead.
    try:
        client = get_provider()
        accounts = await client.get_account_sync_status()
        now = datetime.now()
        for acc in accounts:
            if acc["sync_source"]:
                last_sync = acc.get("last_sync")
                stale = True
                if last_sync:
                    try:
                        last_sync_dt = datetime.fromisoformat(last_sync)
                        stale = (now - last_sync_dt) > timedelta(hours=24)
                    except ValueError:
                        stale = True
                if stale:
                    items.append({
                        "type": "bank_sync_stale",
                        "text": f"{acc['name']} hasn't synced in over 24h",
                        "prompt": f"resync {acc['name']}",
                    })
            else:
                most_recent = acc.get("most_recent_transaction_date")
                if most_recent:
                    try:
                        days_since = (date.today() - date.fromisoformat(most_recent)).days
                        if days_since >= 7:
                            items.append({
                                "type": "csv_stale",
                                "text": f"{acc['name']} — no new transactions imported in {days_since} days",
                                "prompt": f"let's import recent transactions for {acc['name']}",
                            })
                    except ValueError:
                        pass
    except Exception as e:
        logger.warning("get_pending_items: account staleness check failed: %s", e)

    return items
