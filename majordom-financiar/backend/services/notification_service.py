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
