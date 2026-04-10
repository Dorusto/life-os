from __future__ import annotations
"""
Wizard import CSV — ConversationHandler multi-step.

Fluxul complet:
  1. User trimite fișier .csv
  2. Bot parsează, detectează formatul (DB sau Ollama)
  3. [dacă format nou] → arată mapping-ul propus → user confirmă
  4. User alege contul (sau creează unul nou)
  5. Bot arată preview primele 5 tranzacții + totaluri
  6. User confirmă → import batch în Actual Budget

State machine:
  CONFIRM_PROFILE  → User confirmă mapping-ul detectat de Ollama
  SELECT_ACCOUNT   → User alege contul
  CREATE_ACCT_NAME → User tastează numele contului nou
  CREATE_ACCT_BAL  → User tastează soldul inițial
  CONFIRM_IMPORT   → User confirmă preview și pornește importul
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

# Emojis per categorie (refolosit din categorizer)
_CAT_EMOJI = {
    "groceries": "🛒", "restaurants": "🍽️", "transport": "🚗",
    "utilities": "💡", "health": "💊", "clothing": "👕",
    "home": "🏠", "entertainment": "🎬", "education": "📚",
    "other": "📦",
}


def create_csv_conversation(actual_client, categorizer, db) -> ConversationHandler:
    """
    Creează ConversationHandler-ul pentru import CSV.
    Primește componentele prin parametri (fără import circular).
    """

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    def _is_authorized(update: Update) -> bool:
        return update.effective_user.id in settings.telegram.allowed_user_ids

    async def _send(chat_id: int, context: ContextTypes.DEFAULT_TYPE, text: str, **kwargs):
        await context.bot.send_message(chat_id=chat_id, text=text, **kwargs)

    def _build_preview_text(pending: dict) -> str:
        """Construiește textul de preview pentru confirmare import."""
        transactions = pending.get("transactions", [])
        profile = pending.get("profile")
        account_name = pending.get("account_name", "?")
        total_rows = pending.get("total_rows", 0)

        if not transactions:
            return "⚠️ Nicio cheltuială găsită în CSV."

        sorted_txs = sorted(transactions, key=lambda t: t.date)
        preview = sorted_txs[:5]

        # Categorizare pentru afișare (doar preview, nu se salvează)
        lines = []
        for tx in preview:
            pred = categorizer.predict(merchant=tx.merchant, ocr_text=tx.description)
            emoji = _CAT_EMOJI.get(pred.category_id, "📦")
            date_str = tx.date.strftime("%d.%m")
            merchant = tx.merchant[:22]
            sign = "-" if tx.is_expense else "+"
            lines.append(f"• {date_str}  {merchant:<22}  {sign}{tx.amount:>7.2f} {tx.currency} {emoji}")

        # Total net: cheltuieli positive, refund-uri negative
        total = sum(t.amount if t.is_expense else -t.amount for t in transactions)
        currency = settings.default_currency
        min_date = min(t.date for t in transactions).strftime("%d.%m.%Y")
        max_date = max(t.date for t in transactions).strftime("%d.%m.%Y")
        source = profile.source_name if profile else "?"
        skipped = total_rows - len(transactions)

        text = (
            f"📋 *Previzualizare import*\n\n"
            f"Sursă: *{source}* • Cont: *{account_name}*\n\n"
            f"*Primele {len(preview)} din {len(transactions)}:*\n"
            "```\n" + "\n".join(lines) + "\n```\n\n"
            f"💰 Total: *{total:,.2f} {currency}*\n"
            f"📅 {min_date} – {max_date}\n"
        )
        if skipped > 0:
            text += f"⚡ {skipped} rânduri ignorate (venituri sau zero)\n"
        return text

    # -----------------------------------------------------------------------
    # Entry point: document CSV primit
    # -----------------------------------------------------------------------

    async def handle_csv_document(update: Update, context: ContextTypes.DEFAULT_TYPE):
        if not _is_authorized(update):
            return ConversationHandler.END

        doc = update.message.document
        if not doc.file_name.lower().endswith(".csv"):
            return ConversationHandler.END

        await update.message.reply_text("🔍 Analizez fișierul CSV...")

        # Descarcă fișierul
        file = await doc.get_file()
        raw = bytes(await file.download_as_bytearray())

        # Parsează CSV
        normalizer = CsvNormalizer()
        try:
            enc = normalizer.detect_encoding(raw)
            text_content = raw.decode(enc)
            delimiter = normalizer.detect_delimiter(text_content)
            headers, rows = normalizer.parse_csv(raw, delimiter=delimiter, encoding=enc)
        except Exception as e:
            await update.message.reply_text(
                f"❌ Nu pot citi fișierul CSV: {e}\n"
                "Asigură-te că este un export valid din aplicația băncii."
            )
            return ConversationHandler.END

        if not rows:
            await update.message.reply_text("❌ CSV-ul este gol sau nu are rânduri de date.")
            return ConversationHandler.END

        # Header signature → căutare în DB
        detector = CsvProfileDetector(settings.ollama.url, settings.ollama.model)
        sig = detector.header_signature(headers)
        profile = db.get_csv_profile_by_sig(sig)

        chat_id = update.effective_chat.id

        if profile:
            # Format cunoscut — continuăm direct la selecția contului
            transactions = normalizer.normalize(rows, profile)
            context.user_data["csv_pending"] = {
                "profile": profile,
                "transactions": transactions,
                "total_rows": len(rows),
            }
            logger.info(f"CSV: profil cunoscut '{profile.source_name}', {len(transactions)} cheltuieli")
            await _show_account_selection(chat_id, context, profile.source_name, len(transactions))
            return SELECT_ACCOUNT

        else:
            # Format necunoscut → Ollama
            await update.message.reply_text(
                "🤖 Format CSV necunoscut. Trimit la AI pentru analiză...\n"
                "⏳ Poate dura 30–60 secunde..."
            )
            proposed = await detector.detect_with_ollama(headers, rows[:3], delimiter)

            if not proposed:
                await update.message.reply_text(
                    "❌ Nu am putut identifica structura CSV-ului.\n\n"
                    "Încearcă cu un export fresh din aplicație sau scrie-mi ce coloane are."
                )
                return ConversationHandler.END

            context.user_data["csv_pending"] = {
                "proposed_profile": proposed,
                "raw_rows": rows,
                "total_rows": len(rows),
                "delimiter": delimiter,
            }

            logger.info(f"Profil propus de Ollama: {proposed.source_name}, intrând în CONFIRM_PROFILE")
            await _show_profile_proposal(chat_id, context, proposed, rows[:3], normalizer)
            logger.info("Propunere trimisă utilizatorului, aștept confirmare")
            return CONFIRM_PROFILE

    # -----------------------------------------------------------------------
    # CONFIRM_PROFILE — User confirmă/respinge mapping-ul Ollama
    # -----------------------------------------------------------------------

    async def handle_profile_ok(update: Update, context: ContextTypes.DEFAULT_TYPE):
        logger.info("handle_profile_ok chemat")
        query = update.callback_query
        await query.answer()

        pending = context.user_data.get("csv_pending", {})
        proposed: CsvProfile = pending.get("proposed_profile")
        if not proposed:
            await query.edit_message_text("❌ Date lipsă. Trimite din nou fișierul.")
            return ConversationHandler.END

        proposed.confirmed = True
        db.save_csv_profile(proposed)
        logger.info(f"Profil CSV salvat: {proposed.source_name}")

        normalizer = CsvNormalizer()
        transactions = normalizer.normalize(pending["raw_rows"], proposed)
        pending["profile"] = proposed
        pending["transactions"] = transactions
        context.user_data["csv_pending"] = pending

        await query.edit_message_text(
            f"✅ *Profil {proposed.source_name} salvat!*\n"
            f"Data viitoare detectez automat acest format.",
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
            "❌ Import anulat.\n\n"
            "Dacă vrei să adaugi suport pentru alt format, descrie-mi coloanele "
            "și le configurez manual."
        )
        return ConversationHandler.END

    # -----------------------------------------------------------------------
    # SELECT_ACCOUNT — User alege contul (sau creează unul nou)
    # -----------------------------------------------------------------------

    async def handle_account_select(update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        await query.answer()

        idx = int(query.data.split("_")[2])

        pending = context.user_data.get("csv_pending", {})
        accounts = pending.get("accounts", [])

        if idx >= len(accounts):
            await query.edit_message_text("❌ Cont invalid. Trimite din nou fișierul.")
            return ConversationHandler.END

        acc = accounts[idx]
        pending["account_id"] = acc["id"]
        pending["account_name"] = acc["name"]
        context.user_data["csv_pending"] = pending

        await query.edit_message_text(f"💳 Cont selectat: *{acc['name']}*", parse_mode="Markdown")

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
            "➕ *Cont nou*\n\nCum vrei să numești contul?\n"
            "Exemplu: `crypto.com Card`, `ING Checking`, `Revolut`\n\n"
            "/cancel pentru a anula",
            parse_mode="Markdown",
        )
        return CREATE_ACCT_NAME

    async def handle_account_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        await query.answer()
        context.user_data.pop("csv_pending", None)
        await query.edit_message_text("❌ Import anulat.")
        return ConversationHandler.END

    # -----------------------------------------------------------------------
    # CREATE_ACCT_NAME + CREATE_ACCT_BAL — Creare cont nou
    # -----------------------------------------------------------------------

    async def handle_account_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
        name = update.message.text.strip()
        if not name:
            await update.message.reply_text("❌ Numele nu poate fi gol. Încearcă din nou sau /cancel.")
            return CREATE_ACCT_NAME

        pending = context.user_data.get("csv_pending", {})
        pending["new_account_name"] = name
        context.user_data["csv_pending"] = pending

        await update.message.reply_text(
            f"💰 Sold inițial pentru *{name}*?\n"
            "Scrie suma (ex: `0` sau `1500.50`) sau `0` dacă nu știi.\n\n"
            "/cancel pentru a anula",
            parse_mode="Markdown",
        )
        return CREATE_ACCT_BAL

    async def handle_account_balance(update: Update, context: ContextTypes.DEFAULT_TYPE):
        text = update.message.text.strip().replace(",", ".")
        try:
            balance = float(text)
        except ValueError:
            await update.message.reply_text("❌ Trimite un număr (ex: `0` sau `1500.50`).")
            return CREATE_ACCT_BAL

        pending = context.user_data.get("csv_pending", {})
        name = pending.get("new_account_name", "Cont nou")

        await update.message.reply_text(f"⏳ Creez contul *{name}*...", parse_mode="Markdown")

        try:
            account = await actual_client.create_account(name, balance)
        except Exception as e:
            logger.error(f"Eroare creare cont: {e}")
            await update.message.reply_text(f"❌ Eroare la crearea contului: {e}")
            return ConversationHandler.END

        pending["account_id"] = account.id
        pending["account_name"] = account.name
        context.user_data["csv_pending"] = pending

        await update.message.reply_text(
            f"✅ Cont *{account.name}* creat cu sold inițial *{balance:.2f} EUR*!",
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
    # CONFIRM_IMPORT — User confirmă/anulează importul
    # -----------------------------------------------------------------------

    async def handle_import_ok(update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        await query.answer()

        pending = context.user_data.get("csv_pending", {})
        transactions = pending.get("transactions", [])
        account_id = pending.get("account_id")

        if not transactions or not account_id:
            await query.edit_message_text("❌ Date lipsă. Trimite din nou fișierul.")
            return ConversationHandler.END

        await query.edit_message_text(
            f"⏳ Import în curs... ({len(transactions)} tranzacții)\n"
            "Poate dura câteva secunde."
        )

        try:
            imported, skipped, errors, low_confidence = await actual_client.add_transactions_batch(
                account_id=account_id,
                transactions=transactions,
                categorizer=categorizer,
            )
        except Exception as e:
            logger.error(f"Eroare import batch: {e}", exc_info=True)
            await query.edit_message_text(f"❌ Eroare la import: {str(e)[:200]}")
            return ConversationHandler.END

        currency = settings.default_currency
        expenses = sum(t.amount for t in transactions if t.is_expense)
        refunds = sum(t.amount for t in transactions if not t.is_expense)
        total = expenses - refunds

        result_text = (
            f"✅ *Import finalizat!*\n\n"
            f"📥 Importate: *{imported}*\n"
        )
        if skipped:
            result_text += f"⏭️ Duplicate omise: {skipped}\n"
        if errors:
            result_text += f"⚠️ Erori: {errors}\n"
        result_text += f"💰 Total net: *{total:,.2f} {currency}*\n"
        result_text += f"🏦 Cont: {pending.get('account_name', '?')}"
        if low_confidence:
            result_text += f"\n\n🤔 *{len(low_confidence)} tranzacții* au nevoie de confirmare categorie:"

        await query.edit_message_text(result_text, parse_mode="Markdown")

        # Trimite mesaj de confirmare categorie pentru fiecare tranzacție cu confidență mică
        chat_id = query.message.chat_id
        for tx, pred in low_confidence:
            try:
                sign = "-" if tx.is_expense else "+"
                # Același hash ca în add_transactions_batch — permite legătura cu Actual Budget
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
                cat_name = pred.category_name if pred else "Necunoscut"
                conf_pct = f"{pred.confidence:.0%}" if pred else "0%"

                # HTML în loc de Markdown — merchant poate conține *, _, [ etc.
                merchant_escaped = tx.merchant.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                cat_name_escaped = cat_name.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

                await context.bot.send_message(
                    chat_id=chat_id,
                    text=(
                        f"🤔 <b>Categorie necesară</b>\n\n"
                        f"🏪 {merchant_escaped}\n"
                        f"💰 {sign}{tx.amount:.2f} {tx.currency}  •  {tx.date.strftime('%d.%m.%Y')}\n"
                        f"{conf_bar} Sugestie: <b>{cat_name_escaped}</b> ({conf_pct})\n\n"
                        f"Ești de acord?"
                    ),
                    parse_mode="HTML",
                    reply_markup=category_confirmation_keyboard(tx_id, pred.category_id if pred else "other", pred.confidence if pred else 0.0),
                )
            except Exception as e:
                logger.error(f"Eroare trimitere confirmare categorie pentru '{tx.merchant}': {e}", exc_info=True)

        context.user_data.pop("csv_pending", None)
        return ConversationHandler.END

    async def handle_import_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        await query.answer()
        context.user_data.pop("csv_pending", None)
        await query.edit_message_text("❌ Import anulat.")
        return ConversationHandler.END

    # -----------------------------------------------------------------------
    # Fallback /cancel
    # -----------------------------------------------------------------------

    async def handle_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
        context.user_data.pop("csv_pending", None)
        await update.message.reply_text("❌ Import CSV anulat.")
        return ConversationHandler.END

    # -----------------------------------------------------------------------
    # Helpers interne
    # -----------------------------------------------------------------------

    async def _show_profile_proposal(
        chat_id: int,
        context: ContextTypes.DEFAULT_TYPE,
        profile: CsvProfile,
        sample_rows: list[dict],
        normalizer: CsvNormalizer,
    ):
        """Arată mapping-ul propus de Ollama cu exemple de rânduri normalizate."""
        lines = [
            f"🤖 *Propun interpretarea:*",
            f"",
            f"• Sursă: *{profile.source_name}*",
            f"• Data → `{profile.col_date}`",
            f"• Merchant → `{profile.col_merchant}`",
            f"• Sumă → `{profile.col_amount}`",
        ]
        if profile.col_currency:
            lines.append(f"• Monedă → `{profile.col_currency}`")
        if profile.col_direction:
            lines.append(f"• Direcție → `{profile.col_direction}` (cheltuiala = `{profile.expense_indicator}`)")
        if profile.col_description:
            lines.append(f"• Note → `{profile.col_description}`")

        # Exemple normalizate
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
            lines += ["", "*Exemple:*", "```"] + example_txs + ["```"]

        lines += ["", "Interpretarea e corectă?"]

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
        """Arată lista de conturi din Actual Budget pentru selecție."""
        try:
            accounts = await actual_client.get_accounts()
        except Exception as e:
            await context.bot.send_message(chat_id=chat_id, text=f"❌ Eroare Actual Budget: {e}")
            return

        pending = context.user_data.get("csv_pending", {})
        pending["accounts"] = [{"id": a.id, "name": a.name} for a in accounts]
        context.user_data["csv_pending"] = pending

        currency = settings.default_currency
        txs = pending.get("transactions", [])
        total = sum(t.amount if t.is_expense else -t.amount for t in txs)

        text = (
            f"📊 *{source_name}* — {tx_count} tranzacții\n"
            f"💰 Total: {total:,.2f} {currency}\n\n"
            f"Alege contul pentru import:"
        )
        await context.bot.send_message(
            chat_id=chat_id,
            text=text,
            parse_mode="Markdown",
            reply_markup=csv_account_keyboard(pending["accounts"]),
        )

    # -----------------------------------------------------------------------
    # Construiește și returnează ConversationHandler
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
