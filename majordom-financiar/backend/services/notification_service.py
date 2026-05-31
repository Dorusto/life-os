"""
Daily summary notification service.

Called by APScheduler at the configured time (default 20:00 Europe/Amsterdam).
Fetches today's financial data from Actual Budget, generates a personalized
Romanian message via Ollama LLM, and sends it as a Web Push notification.
"""

import json
import logging
from datetime import date

import httpx

from backend.core.actual_client import ActualBudgetClient
from backend.core.config import settings
from backend.core.memory.database import MemoryDB
from backend.services.push_service import get_push_service

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are Majordom, a personal finance assistant. "
    "Send a short, relevant daily message.\n\n"
    "Rules:\n"
    "- Maximum 2 sentences\n"
    "- Friendly tone, not formal\n"
    "- If no transactions today: ask if everything is ok or if the user bought something\n"
    "- If transactions exist: summarize the day and add a useful budget observation\n"
    "- Do not repeat raw numbers — interpret and provide context\n"
    "- If a category exceeds 80% of its budget: mention it\n"
    "- Always respond in English"
)


async def run_daily_summary():
    """Called by APScheduler. Fetches data, generates message, sends push."""
    try:
        # --- Step 1: Check if enabled and not already sent today ---
        db = MemoryDB(settings.memory.db_path)
        rule = db.get_notification_rule("daily_summary")
        if not rule or not rule["enabled"]:
            logger.debug("daily_summary rule not enabled, skipping")
            return

        last = db.get_last_notification("daily_summary")
        if last:
            last_date = last["sent_at"][:10]  # "YYYY-MM-DD"
            if last_date == date.today().isoformat():
                logger.debug("daily_summary already sent today, skipping")
                return  # already sent today

        # --- Step 2: Fetch financial data from Actual Budget ---
        client = ActualBudgetClient(
            url=settings.actual.url,
            password=settings.actual.password,
            sync_id=settings.actual.sync_id,
        )
        accounts = await client.get_accounts()
        today_transactions = await client.get_today_transactions()
        budget_status = await client.get_budget_status()

        # --- Step 3: Build LLM prompt and call Ollama ---
        # Account balances are already in EUR (get_accounts divides by 100)
        summary = {
            "date": date.today().strftime("%d %B %Y"),
            "transactions_today": [
                {
                    "payee": t.payee or "Unknown",
                    "amount": t.amount / 100,
                    "category": t.category or "",
                }
                for t in today_transactions
            ],
            "budget_overview": [
                {
                    "category": b["category_name"],
                    "spent": b["spent"],
                    "budgeted": b["budgeted"],
                    "percentage": b["percentage"],
                }
                for b in budget_status if b["budgeted"] > 0
            ][:5],  # top 5 categories
            "total_balance": sum(a.balance for a in accounts),
        }

        payload = {
            "model": settings.ollama.chat_model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(summary, ensure_ascii=False)},
            ],
            "stream": False,
            "think": False,
            "options": {"temperature": 0.7, "num_predict": 150},
        }
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as http_client:
            resp = await http_client.post(
                f"{settings.ollama.url}/api/chat", json=payload
            )
            resp.raise_for_status()
            message_text = resp.json()["message"]["content"].strip()

        # --- Step 4: Send push + log ---
        push_svc = get_push_service()
        await push_svc.send_to_all(
            user_id="default",
            title="Majordom",
            body=message_text,
            url="/chat",
        )

        db.log_notification("daily_summary", {
            "message": message_text,
            "transactions_count": len(today_transactions),
        })

        logger.info("Daily summary sent — %d transactions today", len(today_transactions))

    except Exception as e:
        logger.error("Daily summary job failed: %s", e, exc_info=True)
        # Job must never crash APScheduler


async def run_import_nudge():
    """Send a push nudge if no CSV import has happened in the last N days.

    Only fires if there has been at least one previous import — never nudges
    a brand new user who hasn't imported anything yet.
    """
    try:
        from datetime import datetime, timedelta

        db = MemoryDB(settings.memory.db_path)
        rule = db.get_notification_rule("import_nudge")
        if not rule or not rule["enabled"]:
            return

        days_threshold = rule["config"].get("days", 7)

        last_import = db.get_last_notification("csv_import")
        if not last_import:
            return  # never imported — no nudge

        last_import_dt = datetime.fromisoformat(last_import["sent_at"])
        days_since = (datetime.now() - last_import_dt).days
        if days_since < days_threshold:
            return  # imported recently enough

        # Anti-spam: don't nudge more than once per day
        last_nudge = db.get_last_notification("import_nudge")
        if last_nudge and last_nudge["sent_at"][:10] == date.today().isoformat():
            return

        push_svc = get_push_service()
        await push_svc.send_to_all(
            user_id="default",
            title="Majordom",
            body=f"It's been {days_since} days since your last import. Want to add recent transactions?",
            url="/chat",
        )

        db.log_notification("import_nudge", {"days_since": days_since})
        logger.info("Import nudge sent — %d days since last import", days_since)

    except Exception as e:
        logger.error("Import nudge job failed: %s", e, exc_info=True)


async def run_pending_review_nudge():
    """Send a push if there are low-confidence categorizations older than 48h.

    Only fires once per batch — marks records as notified so the user isn't
    nudged again for the same transactions.
    """
    try:
        db = MemoryDB(settings.memory.db_path)
        rule = db.get_notification_rule("pending_review")
        if not rule or not rule["enabled"]:
            return

        min_age_hours = rule["config"].get("min_age_hours", 48)
        pending = db.get_unnotified_pending_reviews(min_age_hours=min_age_hours)
        if not pending:
            return

        # Anti-spam: don't send more than once per day
        last_nudge = db.get_last_notification("pending_review")
        if last_nudge and last_nudge["sent_at"][:10] == date.today().isoformat():
            return

        count = len(pending)
        financial_ids = [p["financial_id"] for p in pending]

        push_svc = get_push_service()
        body = (
            f"I categorized {count} transaction{'s' if count > 1 else ''} automatically. "
            "Want to review them?"
        )
        await push_svc.send_to_all(
            user_id="default",
            title="Majordom",
            body=body,
            url="/chat",
        )

        db.mark_pending_reviews_notified(financial_ids)
        db.cleanup_old_pending_reviews()
        db.log_notification("pending_review", {"count": count})
        logger.info("Pending review nudge sent — %d transactions", count)

    except Exception as e:
        logger.error("Pending review nudge job failed: %s", e, exc_info=True)
