from __future__ import annotations
"""
CSV import wizard — multi-step ConversationHandler.

Full flow:
  1. User sends a .csv file
  2. Bot parses it, detects format (DB or Ollama)
  3. [if new format] → shows proposed mapping → user confirms
  4. User selects account (or creates a new one)
  5. Bot shows preview of first 5 transactions + totals
  6. User confirms → batch import into Actual Budget

State machine:
  CONFIRM_PROFILE  → User confirms Ollama-detected mapping
  SELECT_ACCOUNT   → User selects account
  CREATE_ACCT_NAME → User types new account name
  CREATE_ACCT_BAL  → User types initial balance
  CONFIRM_IMPORT   → User confirms preview and starts import
"""
import hashlib
import json
import logging
import tempfile
from datetime import date

from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import (
    ConversationHandler, MessageHandler, CallbackQueryHandler,
    CommandHandler, ContextTypes, filters,
)

from config import settings
from csv_importer import CsvNormalizer, CsvProfileDetector, CsvProfile
from memory.database import TransactionRecord
from .keyboards import csv_profile_confirm_keyboard, csv_account_keyboard, csv_import_keyboard, category_confirmation_keyboard

logger = logging.getLogger(__name__)

# States
CONFIRM_PROFILE = 20
SELECT_ACCOUNT = 21
CREATE_ACCT_NAME = 22
CREATE_ACCT_BAL = 23
CONFIRM_IMPORT = 24

# Emoji per category
_CAT_EMOJI = {
    "groceries": "🛒", "restaurants": "🍽️", "transport": "🚗",
    "utilities": "💡", "health": "💊", "clothing": "👕",
    "home": "🏠", "entertainment": "🎬", "education": "📚",
    "other": "📦",
}


def create_csv_conversation(actual_client, categorizer, db) -> ConversationHandler:
    """
    Creates the ConversationHandler for CSV import.
    Receives components as parameters (avoids circular imports).
    """

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    def _is_authorized(update: Update) -> bool:
        return update.effective_user.id in settings.telegram.allowed_user_ids

    async def _send(chat_id: int, context: ContextTypes.DEFAULT_TYPE, text: str, **kwargs):
        await context.bot.send_message(chat_id=chat_id, text=text, **kwargs)

    def _build_preview_text(pending: dict) -> str:
        """Build preview text for import confirmation."""
        transactions = pending.get("transactions", [])
        profile = pending.get("profile")
        account_name = pending.get("account_name", "?")
        total_rows = pending.get("total_rows", 0)

        if not transactions:
            return "⚠️ No expenses found in CSV."

        sorted_txs = sorted(transactions, key=lambda t: t.date)
        preview = sorted_txs[:5]

        # Categorize for display only (not saved)
        lines = []
        for tx in preview:
            pred = categorizer.predict(merchant=tx.merchant, ocr_text=tx.description)
            emoji = _CAT_EMOJI.get(pred.category_id, "📦")
            date_str = tx.date.strftime("%d.%m")
            merchant = tx.merchant[:22]
            sign = "-" if tx.is_expense else "+"
            lines.append(f"• {date_str}  {merchant:<22}  {sign}{tx.amount:>7.2f} {tx.currency} {emoji}")

        # Net total: expenses positive, refunds negative
        total = sum(t.amount if t.is_expense else -t.amount for t in transactions)
        currency = settings.default_currency
        min_date = min(t.date for t in transactions).strftime("%d.%m.%Y")
        max_date = max(t.date for t in transactions).strftime("%d.%m.%Y")
        source = profile.source_name if profile else "?"
        skipped = total_rows - len(transactions)

        text = (
            f"📋 *Import preview*\n\n"
            f"Source: *{source}* • Account: *{account_name}*\n\n"
            f"*First {len(preview)} of {len(transactions)}:*\n"
            "```\n" + "\n".join(lines) + "\n```\n\n"
            f"💰 Total: *{total:,.2f} {currency}*\n"
            f"📅 {min_date} – {max_date}\n"
        )
        if skipped > 0:
            text += f"⚡ {skipped} rows skipped (income or zero)\n"
        return text

    # -----------------------------------------------------------------------
    # Entry point: CSV document received
    # -----------------------------------------------------------------------

    async def handle_csv_document(update: Update, context: ContextTypes.DEFAULT_TYPE):
        if not _is_authorized(update):
            return ConversationHandler.END

        doc = update.message.document
        if not doc.file_name.lower().endswith(".csv"):
            return ConversationHandler.END

        await update.message.reply_text("🔍 Analyzing CSV file...")

        # Download file
        file = await doc.get_file()
        raw = bytes(await file.download_as_bytearray())

        # Parse CSV
        normalizer = CsvNormalizer()
        try:
            enc = normalizer.detect_encoding(raw)
            text_content = raw.decode(enc)
            delimiter = normalizer.detect_delimiter(text_content)
            headers, rows = normalizer.parse_csv(raw, delimiter=delimiter, encoding=enc)
        except Exception as e:
            await update.message.reply_text(
                f"❌ Cannot read CSV file: {e}\n"
                "Make sure it is a valid export from your banking app."
            )
            return ConversationHandler.END

        if not rows:
            await update.message.reply_text("❌ CSV is empty or has no data rows.")
            return ConversationHandler.END

        # Header signature → look up in DB
        detector = CsvProfileDetector(settings.ollama.url, settings.ollama.model)
        sig = detector.header_signature(headers)
        profile = db.get_csv_profile_by_sig(sig)

        chat_id = update.effective_chat.id

        if profile:
            # Known format — proceed directly to account selection
            transactions = normalizer.normalize(rows, profile)
            context.user_data["csv_pending"] = {
                "profile": profile,
                "transactions": transactions,
                "total_rows": len(rows),
            }
            logger.info(f"CSV: known profile '{profile.source_name}', {len(transactions)} transactions")
            await _show_account_selection(chat_id, context, profile.source_name, len(transactions))
            return SELECT_ACCOUNT

        else:
            # Unknown format → Ollama
            await update.message.reply_text(
                "🤖 Unknown CSV format. Sending to AI for analysis...\n"
                "⏳ This may take 30–60 seconds..."
            )
            proposed = await detector.detect_with_ollama(headers, rows[:3], delimiter)

            if not proposed:
                await update.message.reply_text(
                    "❌ Could not identify the CSV structure.\n\n"
                    "Try a fresh export from your bank app or describe the columns to me."
                )
                return ConversationHandler.END

            context.user_data["csv_pending"] = {
                "proposed_profile": proposed,
                "raw_rows": rows,
                "total_rows": len(rows),
                "delimiter": delimiter,
            }

            logger.info(f"Ollama proposed profile: {proposed.source_name}, entering CONFIRM_PROFILE")
            await _show_profile_proposal(chat_id, context, proposed, rows[:3], normalizer)
            logger.info("Proposal sent to user, waiting for confirmation")
            return CONFIRM_PROFILE

    # -----------------------------------------------------------------------
    # CONFIRM_PROFILE — User confirms/rejects Ollama mapping
    # -----------------------------------------------------------------------

    async def handle_profile_ok(update: Update, context: ContextTypes.DEFAULT_TYPE):
        logger.info("handle_profile_ok called")
        query = update.callback_query
        await query.answer()

        pending = context.user_data.get("csv_pending", {})
        proposed: CsvProfile = pending.get("proposed_profile")
        if not proposed:
            await query.edit_message_text("❌ Missing data. Please send the file again.")
            return ConversationHandler.END

        proposed.confirmed = True
        db.save_csv_profile(proposed)
        logger.info(f"CSV profile saved: {proposed.source_name}")

        normalizer = CsvNormalizer()
        transactions = normalizer.normalize(pending["raw_rows"], proposed)
        pending["profile"] = proposed
        pending["transactions"] = transactions
        context.user_data["csv_pending"] = pending

        await query.edit_message_text(
            f"✅ *{proposed.source_name} profile saved!*\n"
            f"Next time I'll detect this format automatically.",
            parse_mode="Markdown",
        )

        chat_id = query.message.chat_id
        await _show_account_selection(chat_id, context, proposed.source_name, len(transactions))
        return SELECT_ACCOUNT

    async def handle_profile_no(update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        await query.answer()
        context.user_data.pop("csv_pending", None)
        await query.edit_message_text(
            "❌ Import cancelled.\n\n"
            "If you want to add support for another format, describe the columns to me."
        )
        return ConversationHandler.END

    # -----------------------------------------------------------------------
    # SELECT_ACCOUNT — User selects account (or creates a new one)
    # -----------------------------------------------------------------------

    async def handle_account_select(update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        await query.answer()

        idx = int(query.data.split("_")[2])

        pending = context.user_data.get("csv_pending", {})
        accounts = pending.get("accounts", [])

        if idx >= len(accounts):
            await query.edit_message_text("❌ Invalid account. Please send the file again.")
            return ConversationHandler.END

        acc = accounts[idx]
        pending["account_id"] = acc["id"]
        pending["account_name"] = acc["name"]
        context.user_data["csv_pending"] = pending

        await query.edit_message_text(f"💳 Account selected: *{acc['name']}*", parse_mode="Markdown")

        preview_text = _build_preview_text(pending)
        transactions = pending.get("transactions", [])
        await context.bot.send_message(
            chat_id=query.message.chat_id,
            text=preview_text,
            parse_mode="Markdown",
            reply_markup=csv_import_keyboard(len(transactions)),
        )
        return CONFIRM_IMPORT

    async def handle_account_new(update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        await query.answer()
        await query.edit_message_text(
            "➕ *New account*\n\nWhat would you like to name it?\n"
            "Example: `crypto.com Card`, `ING Checking`, `Revolut`\n\n"
            "/cancel to abort",
            parse_mode="Markdown",
        )
        return CREATE_ACCT_NAME

    async def handle_account_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        await query.answer()
        context.user_data.pop("csv_pending", None)
        await query.edit_message_text("❌ Import cancelled.")
        return ConversationHandler.END

    # -----------------------------------------------------------------------
    # CREATE_ACCT_NAME + CREATE_ACCT_BAL — Create new account
    # -----------------------------------------------------------------------

    async def handle_account_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
        name = update.message.text.strip()
        if not name:
            await update.message.reply_text("❌ Name cannot be empty. Try again or /cancel.")
            return CREATE_ACCT_NAME

        pending = context.user_data.get("csv_pending", {})
        pending["new_account_name"] = name
        context.user_data["csv_pending"] = pending

        await update.message.reply_text(
            f"💰 Initial balance for *{name}*?\n"
            "Enter an amount (e.g. `0` or `1500.50`) or `0` if unsure.\n\n"
            "/cancel to abort",
            parse_mode="Markdown",
        )
        return CREATE_ACCT_BAL

    async def handle_account_balance(update: Update, context: ContextTypes.DEFAULT_TYPE):
        text = update.message.text.strip().replace(",", ".")
        try:
            balance = float(text)
        except ValueError:
            await update.message.reply_text("❌ Please enter a number (e.g. `0` or `1500.50`).")
            return CREATE_ACCT_BAL

        pending = context.user_data.get("csv_pending", {})
        name = pending.get("new_account_name", "New account")

        await update.message.reply_text(f"⏳ Creating account *{name}*...", parse_mode="Markdown")

        try:
            account = await actual_client.create_account(name, balance)
        except Exception as e:
            logger.error(f"Account creation error: {e}")
            await update.message.reply_text(f"❌ Error creating account: {e}")
            return ConversationHandler.END

        pending["account_id"] = account.id
        pending["account_name"] = account.name
        context.user_data["csv_pending"] = pending

        await update.message.reply_text(
            f"✅ Account *{account.name}* created with initial balance *{balance:.2f} EUR*!",
            parse_mode="Markdown",
        )

        preview_text = _build_preview_text(pending)
        transactions = pending.get("transactions", [])
        await update.message.reply_text(
            preview_text,
            parse_mode="Markdown",
            reply_markup=csv_import_keyboard(len(transactions)),
        )
        return CONFIRM_IMPORT

    # -----------------------------------------------------------------------
    # CONFIRM_IMPORT — User confirms/cancels the import
    # -----------------------------------------------------------------------

    async def handle_import_ok(update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        await query.answer()

        pending = context.user_data.get("csv_pending", {})
        transactions = pending.get("transactions", [])
        account_id = pending.get("account_id")

        if not transactions or not account_id:
            await query.edit_message_text("❌ Missing data. Please send the file again.")
            return ConversationHandler.END

        await query.edit_message_text(
            f"⏳ Importing... ({len(transactions)} transactions)\n"
            "This may take a few seconds."
        )

        try:
            imported, skipped, errors, low_confidence = await actual_client.add_transactions_batch(
                account_id=account_id,
                transactions=transactions,
                categorizer=categorizer,
            )
        except Exception as e:
            logger.error(f"Batch import error: {e}", exc_info=True)
            await query.edit_message_text(f"❌ Import error: {str(e)[:200]}")
            return ConversationHandler.END

        currency = settings.default_currency
        expenses = sum(t.amount for t in transactions if t.is_expense)
        refunds = sum(t.amount for t in transactions if not t.is_expense)
        total = expenses - refunds

        result_text = (
            f"✅ *Import complete!*\n\n"
            f"📥 Imported: *{imported}*\n"
        )
        if skipped:
            result_text += f"⏭️ Duplicates skipped: {skipped}\n"
        if errors:
            result_text += f"⚠️ Errors: {errors}\n"
        result_text += f"💰 Net total: *{total:,.2f} {currency}*\n"
        result_text += f"🏦 Account: {pending.get('account_name', '?')}"
        if low_confidence:
            result_text += f"\n\n🤔 *{len(low_confidence)} transactions* need category confirmation:"

        await query.edit_message_text(result_text, parse_mode="Markdown")

        # Send category confirmation for each low-confidence transaction
        chat_id = query.message.chat_id
        for tx, pred in low_confidence:
            try:
                sign = "-" if tx.is_expense else "+"
                # Same hash as in add_transactions_batch — links to Actual Budget
                actual_budget_id = hashlib.sha256(
                    f"{tx.date.isoformat()}{tx.merchant}{tx.amount:.4f}".encode()
                ).hexdigest()[:16]
                record = TransactionRecord(
                    merchant=tx.merchant,
                    amount=tx.amount,
                    category_id=pred.category_id if pred else "other",
                    date=tx.date.isoformat(),
                    confidence=pred.confidence if pred else 0.0,
                    actual_budget_id=actual_budget_id,
                )
                tx_id = db.save_transaction(record)

                conf_bar = "🟡" if (pred and pred.confidence > 0.4) else "🔴"
                cat_name = pred.category_name if pred else "Unknown"
                conf_pct = f"{pred.confidence:.0%}" if pred else "0%"

                # HTML instead of Markdown — merchant names may contain *, _, [ etc.
                merchant_escaped = tx.merchant.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                cat_name_escaped = cat_name.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

                await context.bot.send_message(
                    chat_id=chat_id,
                    text=(
                        f"🤔 <b>Category needed</b>\n\n"
                        f"🏪 {merchant_escaped}\n"
                        f"💰 {sign}{tx.amount:.2f} {tx.currency}  •  {tx.date.strftime('%d.%m.%Y')}\n"
                        f"{conf_bar} Suggestion: <b>{cat_name_escaped}</b> ({conf_pct})\n\n"
                        f"Does this look right?"
                    ),
                    parse_mode="HTML",
                    reply_markup=category_confirmation_keyboard(tx_id, pred.category_id if pred else "other", pred.confidence if pred else 0.0),
                )
            except Exception as e:
                logger.error(f"Error sending category confirmation for '{tx.merchant}': {e}", exc_info=True)

        context.user_data.pop("csv_pending", None)
        return ConversationHandler.END

    async def handle_import_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        await query.answer()
        context.user_data.pop("csv_pending", None)
        await query.edit_message_text("❌ Import cancelled.")
        return ConversationHandler.END

    # -----------------------------------------------------------------------
    # Fallback /cancel
    # -----------------------------------------------------------------------

    async def handle_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
        context.user_data.pop("csv_pending", None)
        await update.message.reply_text("❌ CSV import cancelled.")
        return ConversationHandler.END

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    async def _show_profile_proposal(
        chat_id: int,
        context: ContextTypes.DEFAULT_TYPE,
        profile: CsvProfile,
        sample_rows: list[dict],
        normalizer: CsvNormalizer,
    ):
        """Show the Ollama-proposed mapping with normalized row examples."""
        lines = [
            f"🤖 *Proposed mapping:*",
            f"",
            f"• Source: *{profile.source_name}*",
            f"• Date → `{profile.col_date}`",
            f"• Merchant → `{profile.col_merchant}`",
            f"• Amount → `{profile.col_amount}`",
        ]
        if profile.col_currency:
            lines.append(f"• Currency → `{profile.col_currency}`")
        if profile.col_direction:
            lines.append(f"• Direction → `{profile.col_direction}` (expense = `{profile.expense_indicator}`)")
        if profile.col_description:
            lines.append(f"• Notes → `{profile.col_description}`")

        # Normalized examples
        example_txs = []
        for row in sample_rows[:3]:
            try:
                tx = normalizer._normalize_row(row, profile)
                if tx:
                    example_txs.append(
                        f"  {tx.date.strftime('%d.%m')} | {tx.merchant[:20]} | "
                        f"{tx.amount:.2f} {tx.currency}"
                    )
            except Exception:
                pass

        if example_txs:
            lines += ["", "*Examples:*", "```"] + example_txs + ["```"]

        lines += ["", "Is this mapping correct?"]

        await context.bot.send_message(
            chat_id=chat_id,
            text="\n".join(lines),
            parse_mode="Markdown",
            reply_markup=csv_profile_confirm_keyboard(),
        )

    async def _show_account_selection(
        chat_id: int,
        context: ContextTypes.DEFAULT_TYPE,
        source_name: str,
        tx_count: int,
    ):
        """Show the list of Actual Budget accounts for selection."""
        try:
            accounts = await actual_client.get_accounts()
        except Exception as e:
            await context.bot.send_message(chat_id=chat_id, text=f"❌ Actual Budget error: {e}")
            return

        pending = context.user_data.get("csv_pending", {})
        pending["accounts"] = [{"id": a.id, "name": a.name} for a in accounts]
        context.user_data["csv_pending"] = pending

        currency = settings.default_currency
        txs = pending.get("transactions", [])
        total = sum(t.amount if t.is_expense else -t.amount for t in txs)

        text = (
            f"📊 *{source_name}* — {tx_count} transactions\n"
            f"💰 Total: {total:,.2f} {currency}\n\n"
            f"Select account for import:"
        )
        await context.bot.send_message(
            chat_id=chat_id,
            text=text,
            parse_mode="Markdown",
            reply_markup=csv_account_keyboard(pending["accounts"]),
        )

    # -----------------------------------------------------------------------
    # Build and return ConversationHandler
    # -----------------------------------------------------------------------

    return ConversationHandler(
        entry_points=[
            MessageHandler(
                filters.Document.FileExtension("csv"),
                handle_csv_document,
            )
        ],
        states={
            CONFIRM_PROFILE: [
                CallbackQueryHandler(handle_profile_ok, pattern="^csv_pok$"),
                CallbackQueryHandler(handle_profile_no, pattern="^csv_pno$"),
            ],
            SELECT_ACCOUNT: [
                CallbackQueryHandler(handle_account_select, pattern=r"^csv_asel_\d+$"),
                CallbackQueryHandler(handle_account_new, pattern="^csv_anew$"),
                CallbackQueryHandler(handle_account_cancel, pattern="^csv_acancel$"),
            ],
            CREATE_ACCT_NAME: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, handle_account_name),
            ],
            CREATE_ACCT_BAL: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, handle_account_balance),
            ],
            CONFIRM_IMPORT: [
                CallbackQueryHandler(handle_import_ok, pattern="^csv_iok$"),
                CallbackQueryHandler(handle_import_cancel, pattern="^csv_icancel$"),
            ],
        },
        fallbacks=[CommandHandler("cancel", handle_cancel)],
        per_message=False,
    )
