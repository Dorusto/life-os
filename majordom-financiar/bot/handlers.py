from __future__ import annotations
"""
Telegram handlers — main bot logic.

Flows:
1. /start → Welcome message
2. Receipt photo → OCR → Parsing → Categorization → Confirmation → Actual Budget
3. /add 150 Kaufland → Manual transaction
4. /balance → Current balance
5. /stats → Current month statistics
6. Callback queries → Confirm/change category
"""
import json
import tempfile
import logging
from datetime import datetime, date
from pathlib import Path

from telegram import Update, Message
from telegram.ext import (
    Application, CommandHandler, MessageHandler, CallbackQueryHandler,
    ContextTypes, filters
)

from backend.core.config import settings
from backend.core.ocr.vision_engine import VisionEngine
from backend.core.memory import MemoryDB, SmartCategorizer
from backend.core.actual_client import ActualBudgetClient
from .keyboards import (
    account_select_keyboard,
    category_confirmation_keyboard,
    category_selection_keyboard,
    transaction_confirm_keyboard,
)

logger = logging.getLogger(__name__)

# Global components (initialized in setup)
db: MemoryDB
categorizer: SmartCategorizer
vision_engine: VisionEngine
actual_client: ActualBudgetClient


def auth_required(func):
    """Decorator — only allows authorized users."""
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        user_id = update.effective_user.id
        if user_id not in settings.telegram.allowed_user_ids:
            logger.warning(f"Unauthorized access from user {user_id}")
            await update.message.reply_text(
                "⛔ You are not authorized to use this bot."
            )
            return
        return await func(update, context)
    return wrapper


# ============================================================
# COMMANDS
# ============================================================

@auth_required
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /start — welcome message."""
    await update.message.reply_text(
        "🏛️ *Majordom* — at your service!\n\n"
        "I'm your personal finance assistant. Here's what I can do:\n\n"
        "📷 *Send a receipt photo* → I'll process it automatically\n"
        "📎 *Send a .csv file* → import bank transactions\n"
        "💰 `/add 150.50 Kaufland` → add a manual transaction\n"
        "📊 `/balance` → current balance\n"
        "📈 `/stats` → this month's statistics\n"
        "📂 `/categories` → available categories\n"
        "❓ `/help` → detailed help\n\n"
        "_All data stays on your server. Zero cloud._ 🔒",
        parse_mode="Markdown"
    )


@auth_required
async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /help."""
    await update.message.reply_text(
        "📖 *Majordom Help*\n\n"
        "*Receipt scanning:*\n"
        "Send a photo of a receipt. I'll automatically extract:\n"
        "- Merchant name\n"
        "- Total amount\n"
        "- Date\n"
        "Then I'll ask you to confirm the category.\n\n"
        "*Manual transaction:*\n"
        "`/add AMOUNT DESCRIPTION`\n"
        "Example: `/add 49.99 Uber airport taxi`\n\n"
        "*Commands:*\n"
        "`/balance` — current balance\n"
        "`/stats` — this month's spending\n"
        "`/stats 3 2025` — spending for March 2025\n"
        "`/categories` — category list\n\n"
        "*CSV bank import:*\n"
        "Send a `.csv` file exported from ING, crypto\\.com, Revolut etc\\.\n"
        "I auto\\-detect the format and show a preview before importing\\.\n"
        "On first import from a new source, AI analyzes the structure and saves it\\.\n\n"
        "_The bot learns your preferences\\! The more you use it, "
        "the more accurate it gets\\._ 🧠",
        parse_mode="Markdown"
    )


@auth_required
async def cmd_balance(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /balance — show current balance."""
    try:
        balance = await actual_client.get_total_balance()
        accounts = await actual_client.get_accounts()

        currency = settings.default_currency
        text = "💰 *Current balances:*\n\n"
        for acc in accounts:
            emoji = "🟢" if acc.balance >= 0 else "🔴"
            text += f"{emoji} {acc.name}: *{acc.balance:,.2f} {currency}*\n"

        text += f"\n📊 Total: *{balance:,.2f} {currency}*"

        await update.message.reply_text(text, parse_mode="Markdown")
    except Exception as e:
        logger.error(f"Balance error: {e}")
        await update.message.reply_text(
            f"❌ Error connecting to Actual Budget: {e}"
        )


@auth_required
async def cmd_add(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /add — manual transaction."""
    if not context.args or len(context.args) < 2:
        await update.message.reply_text(
            "📝 Format: `/add AMOUNT DESCRIPTION`\n"
            "Example: `/add 150.50 Kaufland groceries`",
            parse_mode="Markdown"
        )
        return

    try:
        amount = float(context.args[0])
        description = " ".join(context.args[1:])
    except ValueError:
        await update.message.reply_text("❌ Amount must be a valid number.")
        return

    # Categorize
    prediction = categorizer.predict(description)

    from memory.database import TransactionRecord
    record = TransactionRecord(
        merchant=description,
        amount=amount,
        category_id=prediction.category_id,
        date=date.today().isoformat(),
        confidence=prediction.confidence,
    )

    # Save locally
    tx_id = db.save_transaction(record)

    confidence_bar = "🟢" if prediction.confidence > 0.8 else (
        "🟡" if prediction.confidence > 0.5 else "🔴"
    )

    currency = settings.default_currency
    await update.message.reply_text(
        f"📝 *New transaction*\n\n"
        f"🏪 {description}\n"
        f"💰 {amount:.2f} {currency}\n"
        f"📅 {date.today().strftime('%d.%m.%Y')}\n"
        f"{confidence_bar} Category: *{prediction.category_name}* "
        f"({prediction.confidence:.0%})\n"
        f"💡 _{prediction.reason}_",
        parse_mode="Markdown",
        reply_markup=category_confirmation_keyboard(
            tx_id, prediction.category_id, prediction.confidence
        )
    )


@auth_required
async def cmd_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /stats — monthly statistics."""
    month = None
    year = None

    if context.args:
        try:
            month = int(context.args[0])
            if len(context.args) > 1:
                year = int(context.args[1])
        except ValueError:
            pass

    try:
        stats = await actual_client.get_monthly_stats(month=month, year=year)
    except Exception as e:
        logger.error(f"Stats error: {e}")
        await update.message.reply_text(f"❌ Error connecting to Actual Budget: {e}")
        return

    currency = settings.default_currency
    text = (
        f"📈 *Statistics {stats['month']:02d}/{stats['year']}*\n\n"
        f"Total spending: *{stats['total']:,.2f} {currency}*\n"
        f"Transactions: {stats['count']}\n\n"
    )

    if stats["categories"]:
        text += "*By category:*\n"
        for _, cat_stats in sorted(
            stats["categories"].items(),
            key=lambda x: x[1]["total"],
            reverse=True
        ):
            name = cat_stats["name"]
            pct = (cat_stats["total"] / stats["total"] * 100) if stats["total"] else 0
            text += (
                f"• {name}: {cat_stats['total']:,.2f} {currency} "
                f"({pct:.0f}%) — {cat_stats['count']} transactions\n"
            )
    else:
        text += "_No spending this month._"

    await update.message.reply_text(text, parse_mode="Markdown")


@auth_required
async def cmd_categories(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /categories — list categories from Actual Budget."""
    try:
        cats = await actual_client.get_categories()
    except Exception as e:
        await update.message.reply_text(f"❌ Error connecting to Actual Budget: {e}")
        return

    if not cats:
        await update.message.reply_text(
            "📂 No categories in Actual Budget.\n"
            "Add transactions — categories are created automatically."
        )
        return

    # Group by group_name
    groups: dict[str, list] = {}
    for cat in cats:
        g = cat.group_name or "No group"
        groups.setdefault(g, []).append(cat.name)

    text = "📂 *Categories in Actual Budget:*\n\n"
    for group, names in sorted(groups.items()):
        text += f"*{group}*\n"
        for name in sorted(names):
            text += f"  • {name}\n"
        text += "\n"

    await update.message.reply_text(text, parse_mode="Markdown")


# ============================================================
# PHOTO PROCESSING (main flow)
# ============================================================

@auth_required
async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Main handler — processes a receipt photo with AI vision.

    Flow:
    1. Download image from Telegram
    2. Send to AI vision model (Ollama) → receive structured JSON
    3. Categorize (memory + keywords)
    4. Send result with inline keyboard
    """
    msg = update.message
    image_path = None
    await msg.reply_text("🤖 Analyzing receipt with AI... one moment.")

    try:
        # 1. Download image (highest resolution)
        photo = msg.photo[-1]
        file = await photo.get_file()

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            await file.download_to_drive(tmp.name)
            image_path = tmp.name

        # 2. Extract with AI vision
        receipt = await vision_engine.extract_from_path(image_path)

        if not receipt.is_valid:
            await msg.reply_text(
                "⚠️ Could not identify a valid receipt in the image.\n\n"
                "Try a clearer photo or add manually with `/add AMOUNT MERCHANT`",
                parse_mode="Markdown"
            )
            return

        # 3. Categorize
        prediction = categorizer.predict(
            merchant=receipt.merchant,
            amount=receipt.total
        )

        # 4. Save locally
        from memory.database import TransactionRecord
        record = TransactionRecord(
            merchant=receipt.merchant,
            amount=receipt.total,
            category_id=prediction.category_id,
            date=(receipt.date or date.today()).isoformat(),
            raw_ocr_text=receipt.raw_text,
            confidence=prediction.confidence,
        )
        tx_id = db.save_transaction(record)

        # 5. Send result
        confidence_bar = "🟢" if prediction.confidence > 0.8 else (
            "🟡" if prediction.confidence > 0.5 else "🔴"
        )
        date_str = receipt.date.strftime("%d.%m.%Y") if receipt.date else "today"

        text = (
            f"🧾 *Receipt processed!*\n\n"
            f"🏪 Merchant: *{receipt.merchant}*\n"
            f"💰 Total: *{receipt.total:.2f} {receipt.currency}*\n"
            f"📅 Date: {date_str}\n"
        )

        if receipt.items:
            text += f"📋 Items: {len(receipt.items)}\n"

        text += (
            f"\n{confidence_bar} Category: *{prediction.category_name}* "
            f"({prediction.confidence:.0%})\n"
            f"💡 _{prediction.reason}_"
        )

        if receipt.cui:
            text += f"\n🏢 CUI: {receipt.cui}"

        if prediction.confidence >= settings.memory.auto_threshold:
            await msg.reply_text(
                text,
                parse_mode="Markdown",
                reply_markup=category_confirmation_keyboard(
                    tx_id, prediction.category_id, prediction.confidence
                )
            )
        else:
            await msg.reply_text(text, parse_mode="Markdown")
            await msg.reply_text(
                "🤔 Not sure about the category. Please choose:",
                reply_markup=category_selection_keyboard(
                    tx_id, categorizer.get_all_categories()
                )
            )

    except Exception as e:
        logger.error(f"Photo processing error: {e}", exc_info=True)
        await msg.reply_text(
            f"❌ Processing error: {str(e)[:200]}\n"
            "Try again or add manually with `/add`"
        )
    finally:
        if image_path:
            try:
                Path(image_path).unlink(missing_ok=True)
            except Exception:
                pass


# ============================================================
# CALLBACK QUERIES (inline buttons)
# ============================================================

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler for inline buttons (category confirmation etc.)."""
    query = update.callback_query
    await query.answer()

    # Check authorization
    if query.from_user.id not in settings.telegram.allowed_user_ids:
        return

    try:
        data = json.loads(query.data)
        action = data.get("action", "")

        if action == "confirm_cat":
            await _handle_confirm_category(query, data)

        elif action == "change_cat":
            await _handle_change_category(query, data)

        elif action == "set_cat":
            await _handle_set_category(query, data)

        elif action == "save_actual":
            await _handle_save_to_actual(query, data)

        elif action == "sel_acc":
            await _handle_select_account(query, data)

        elif action == "cancel_tx":
            await query.edit_message_text("🗑️ Transaction cancelled.")

    except json.JSONDecodeError:
        logger.error(f"Invalid callback data: {query.data}")
    except Exception as e:
        logger.error(f"Callback error: {e}", exc_info=True)
        await query.edit_message_text(f"❌ Error: {str(e)[:200]}")


async def _handle_confirm_category(query, data: dict):
    """User confirms the predicted category."""
    tx_id = data["tx_id"]
    category_id = data["cat"]

    # Mark as confirmed
    db.update_transaction_category(tx_id, category_id)

    # Learn from confirmation and propagate category to Actual Budget
    transactions = db.get_transactions(limit=500)
    already_in_actual = False
    for tx in transactions:
        if tx.id == tx_id:
            categorizer.learn(tx.merchant, category_id, tx.raw_ocr_text)
            if tx.actual_budget_id:
                cat_data = categorizer.categories.get(category_id, {})
                cat_name = cat_data.get("name", category_id)
                await actual_client.update_transaction_category(tx.actual_budget_id, cat_name)
                already_in_actual = True
            break

    if already_in_actual:
        await query.edit_message_text("✅ Category confirmed and saved to Actual Budget!")
    else:
        await query.edit_message_text(
            "✅ Category confirmed!",
            reply_markup=transaction_confirm_keyboard(tx_id)
        )


async def _handle_change_category(query, data: dict):
    """User wants to change the category."""
    tx_id = data["tx_id"]
    categories = categorizer.get_all_categories()

    await query.edit_message_text(
        "📂 Choose the correct category:",
        reply_markup=category_selection_keyboard(tx_id, categories)
    )


async def _handle_set_category(query, data: dict):
    """User selects a new category."""
    tx_id = data["tx_id"]
    category_id = data["cat"]

    # Update and learn
    db.update_transaction_category(tx_id, category_id)

    transactions = db.get_transactions(limit=100)
    for tx in transactions:
        if tx.id == tx_id:
            categorizer.learn(tx.merchant, category_id, tx.raw_ocr_text)
            cat_data = categorizer.categories.get(category_id, {})
            cat_name = cat_data.get("name", category_id)
            if tx.actual_budget_id:
                await actual_client.update_transaction_category(tx.actual_budget_id, cat_name)
                await query.edit_message_text(
                    f"✅ Category set: {cat_name}\n"
                    f"🧠 Learned — I'll remember next time!"
                )
            else:
                await query.edit_message_text(
                    f"✅ Category set: {cat_name}\n"
                    f"🧠 Learned — I'll remember next time!",
                    reply_markup=transaction_confirm_keyboard(tx_id)
                )
            return

    await query.edit_message_text("✅ Category updated!")


async def _handle_save_to_actual(query, data: dict):
    """Save transaction to Actual Budget."""
    tx_id = data["tx_id"]

    transactions = db.get_transactions(limit=500)
    tx = None
    for t in transactions:
        if t.id == tx_id:
            tx = t
            break

    if not tx:
        await query.edit_message_text("❌ Transaction not found.")
        return

    try:
        accounts = await actual_client.get_accounts()
        if not accounts:
            await query.edit_message_text("❌ No account found in Actual Budget.")
            return

        # If multiple accounts exist, ask the user
        if len(accounts) > 1:
            acc_list = [{"id": a.id, "name": a.name} for a in accounts]
            await query.edit_message_text(
                "🏦 Which account should I save this transaction to?",
                reply_markup=account_select_keyboard(tx_id, acc_list),
            )
            return

        account = accounts[0]
        await _do_save_transaction(query, tx, account)

    except Exception as e:
        logger.error(f"Actual Budget save error: {e}")
        await query.edit_message_text(
            f"❌ Error saving to Actual Budget:\n{str(e)[:200]}"
        )


async def _handle_select_account(query, data: dict):
    """User selected an account — save the transaction."""
    tx_id = data["tx_id"]
    acc_idx = data["i"]

    transactions = db.get_transactions(limit=500)
    tx = next((t for t in transactions if t.id == tx_id), None)
    if not tx:
        await query.edit_message_text("❌ Transaction not found.")
        return

    try:
        accounts = await actual_client.get_accounts()
        if acc_idx >= len(accounts):
            await query.edit_message_text("❌ Invalid account.")
            return
        await _do_save_transaction(query, tx, accounts[acc_idx])
    except Exception as e:
        logger.error(f"Actual Budget save error: {e}")
        await query.edit_message_text(f"❌ Save error:\n{str(e)[:200]}")


async def _do_save_transaction(query, tx, account):
    """Save transaction to Actual Budget and display result."""
    category_name = categorizer.categories.get(tx.category_id, {}).get("name", "")
    source_notes = "[receipt photo]" if tx.raw_ocr_text else "[/add manual]"
    actual_id = await actual_client.add_transaction(
        account_id=account.id,
        amount=tx.amount,
        payee=tx.merchant,
        category_name=category_name,
        tx_date=date.fromisoformat(tx.date) if tx.date else None,
        notes=source_notes,
    )

    currency = settings.default_currency
    if actual_id is None:
        await query.edit_message_text(
            f"⚠️ Transaction already exists — probably imported from CSV.\n\n"
            f"🏪 {tx.merchant}\n"
            f"💰 {tx.amount:.2f} {currency}\n\n"
            f"Not added again to avoid duplicates."
        )
        return

    await query.edit_message_text(
        f"💾 Saved to Actual Budget!\n\n"
        f"🏪 {tx.merchant}\n"
        f"💰 {tx.amount:.2f} {currency}\n"
        f"🏦 Account: {account.name}"
    )
    await _check_budget_alert(query, category_name, tx.amount)


async def _check_budget_alert(query, category_name: str, new_amount: float):
    """Check budget limit and send alert if exceeded."""
    if not category_name:
        return
    limit = db.get_budget_limit(category_name)
    if not limit:
        return

    try:
        from datetime import date as _date
        today = _date.today()
        stats = await actual_client.get_monthly_stats(month=today.month, year=today.year)
        category_data = next(
            (v for v in stats["categories"].values() if v["name"] == category_name),
            None
        )
        if not category_data:
            return

        spent = category_data["total"]
        currency = settings.default_currency

        if spent > limit:
            overage = spent - limit
            await query.message.reply_text(
                f"⚠️ *Budget exceeded!*\n\n"
                f"📂 {category_name}\n"
                f"💸 Spent: *{spent:.2f} {currency}*\n"
                f"🎯 Limit: {limit:.0f} {currency}\n"
                f"🔴 Over by: *+{overage:.2f} {currency}*",
                parse_mode="Markdown"
            )
        elif spent > limit * 0.85:
            remaining = limit - spent
            await query.message.reply_text(
                f"🟡 *Budget warning!*\n\n"
                f"📂 {category_name}\n"
                f"💸 Spent: *{spent:.2f} {currency}* ({spent/limit*100:.0f}%)\n"
                f"📊 Remaining: *{remaining:.2f} {currency}* of {limit:.0f} {currency}",
                parse_mode="Markdown"
            )
    except Exception as e:
        logger.warning(f"Could not check budget: {e}")


# ============================================================
# SETUP
# ============================================================

def setup_handlers(app: Application) -> Application:
    """Register all handlers on the application."""
    global db, categorizer, vision_engine, actual_client

    # Initialize components
    db = MemoryDB(settings.memory.db_path)
    categorizer = SmartCategorizer(db)
    vision_engine = VisionEngine(
        ollama_url=settings.ollama.url,
        model=settings.ollama.model,
    )
    actual_client = ActualBudgetClient(
        url=settings.actual.url,
        password=settings.actual.password,
        sync_id=settings.actual.sync_id,
    )

    # Budget wizard (must be registered before generic CallbackQueryHandler)
    from bot.budget_wizard import create_budget_conversation
    app.add_handler(create_budget_conversation())

    # CSV import wizard (before generic CallbackQueryHandler)
    from bot.csv_wizard import create_csv_conversation
    app.add_handler(create_csv_conversation(actual_client, categorizer, db))

    # Commands
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("balance", cmd_balance))
    app.add_handler(CommandHandler("add", cmd_add))
    app.add_handler(CommandHandler("stats", cmd_stats))
    app.add_handler(CommandHandler("categories", cmd_categories))

    # Photos
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))

    # Callback queries (inline buttons)
    app.add_handler(CallbackQueryHandler(handle_callback))

    # Global error handler — catches any exception from handlers
    async def _error_handler(update: object, context: ContextTypes.DEFAULT_TYPE):
        logger.error(f"[ERROR] Exception in handler: {context.error}", exc_info=context.error)
    app.add_error_handler(_error_handler)

    # Monthly job — summary on the 1st at 08:00
    if app.job_queue:
        app.job_queue.run_monthly(
            _monthly_summary_job,
            when=datetime.strptime("08:00", "%H:%M").time(),
            day=1,
            chat_id=settings.telegram.allowed_user_ids[0] if settings.telegram.allowed_user_ids else None,
        )
        logger.info("Monthly summary job registered ✓")

    logger.info("Telegram handlers registered ✓")
    return app


async def _monthly_summary_job(context: ContextTypes.DEFAULT_TYPE):
    """Send monthly summary on the 1st of each month."""
    from datetime import date as _date
    import calendar

    today = _date.today()
    # Previous month
    first_of_month = today.replace(day=1)
    last_month = first_of_month - __import__("datetime").timedelta(days=1)
    month, year = last_month.month, last_month.year

    try:
        stats = await actual_client.get_monthly_stats(month=month, year=year)
        limits = db.get_budget_limits()
        currency = settings.default_currency

        text = f"📅 *Summary for {calendar.month_name[month]} {year}*\n\n"
        text += f"Total spending: *{stats['total']:,.2f} {currency}*\n"
        text += f"Transactions: {stats['count']}\n\n"

        if stats["categories"]:
            text += "*By category:*\n"
            for _, cat_stats in sorted(
                stats["categories"].items(),
                key=lambda x: x[1]["total"],
                reverse=True
            ):
                name = cat_stats["name"]
                spent = cat_stats["total"]
                limit = limits.get(name)
                if limit:
                    pct = spent / limit * 100
                    status = "🔴" if pct > 100 else ("🟡" if pct > 85 else "🟢")
                    text += f"{status} {name}: {spent:.0f}/{limit:.0f} {currency} ({pct:.0f}%)\n"
                else:
                    text += f"• {name}: {spent:.0f} {currency}\n"

        for chat_id in settings.telegram.allowed_user_ids:
            await context.bot.send_message(
                chat_id=chat_id,
                text=text,
                parse_mode="Markdown"
            )
    except Exception as e:
        logger.error(f"Monthly summary job error: {e}")
