from __future__ import annotations
"""
Handlere Telegram — logica principală a botului.

Fluxuri:
1. /start → Mesaj de bun venit
2. Poză bon → OCR → Parsare → Categorizare → Confirmare → Actual Budget
3. /add 150 Kaufland → Tranzacție manuală
4. /balance → Sold curent
5. /stats → Statistici luna curentă
6. Callback queries → Confirmare/schimbare categorie
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

from config import settings
from ocr.vision_engine import VisionEngine
from memory import MemoryDB, SmartCategorizer
from actual_client import ActualBudgetClient
from .keyboards import (
    category_confirmation_keyboard,
    category_selection_keyboard,
    transaction_confirm_keyboard,
)

logger = logging.getLogger(__name__)

# Componente globale (inițializate la setup)
db: MemoryDB
categorizer: SmartCategorizer
vision_engine: VisionEngine
actual_client: ActualBudgetClient


def auth_required(func):
    """Decorator — permite doar utilizatorilor autorizați."""
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        user_id = update.effective_user.id
        if user_id not in settings.telegram.allowed_user_ids:
            logger.warning(f"Acces neautorizat de la user {user_id}")
            await update.message.reply_text(
                "⛔ Nu ești autorizat să folosești acest bot."
            )
            return
        return await func(update, context)
    return wrapper


# ============================================================
# COMENZI
# ============================================================

@auth_required
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /start — mesaj de bun venit."""
    await update.message.reply_text(
        "🏛️ *Majordom Financiar* — la dispoziția ta!\n\n"
        "Sunt asistentul tău financiar personal. Iată ce pot face:\n\n"
        "📷 *Trimite o poză cu un bon* → procesez automat\n"
        "💰 `/add 150.50 Kaufland` → adaug tranzacție manuală\n"
        "📊 `/balance` → sold curent\n"
        "📈 `/stats` → statistici luna curentă\n"
        "📂 `/categories` → categoriile disponibile\n"
        "❓ `/help` → ajutor detaliat\n\n"
        "_Toate datele rămân pe serverul tău. Zero cloud._ 🔒",
        parse_mode="Markdown"
    )


@auth_required
async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /help."""
    await update.message.reply_text(
        "📖 *Ghid Majordom Financiar*\n\n"
        "*Procesare bon:*\n"
        "Trimite o poză cu un bon fiscal. Voi extrage automat:\n"
        "- Numele magazinului\n"
        "- Suma totală\n"
        "- Data\n"
        "Apoi te întreb confirmarea categoriei.\n\n"
        "*Tranzacție manuală:*\n"
        "`/add SUMA DESCRIERE`\n"
        "Exemplu: `/add 49.99 Uber taxi aeroport`\n\n"
        "*Comenzi:*\n"
        "`/balance` — sold curent\n"
        "`/stats` — cheltuieli luna curentă\n"
        "`/stats 3 2025` — cheltuieli martie 2025\n"
        "`/categories` — lista categorii\n\n"
        "_Botul învață preferințele tale! Cu cât îl folosești mai mult, "
        "cu atât categorizează mai precis._ 🧠",
        parse_mode="Markdown"
    )


@auth_required
async def cmd_balance(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /balance — afișează soldul."""
    try:
        balance = await actual_client.get_total_balance()
        accounts = await actual_client.get_accounts()

        currency = settings.default_currency
        text = "💰 *Solduri curente:*\n\n"
        for acc in accounts:
            emoji = "🟢" if acc.balance >= 0 else "🔴"
            text += f"{emoji} {acc.name}: *{acc.balance:,.2f} {currency}*\n"

        text += f"\n📊 Total: *{balance:,.2f} {currency}*"

        await update.message.reply_text(text, parse_mode="Markdown")
    except Exception as e:
        logger.error(f"Eroare la balance: {e}")
        await update.message.reply_text(
            f"❌ Eroare la conectarea cu Actual Budget: {e}"
        )


@auth_required
async def cmd_add(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /add — tranzacție manuală."""
    if not context.args or len(context.args) < 2:
        await update.message.reply_text(
            "📝 Format: `/add SUMA DESCRIERE`\n"
            "Exemplu: `/add 150.50 Kaufland cumpărături`",
            parse_mode="Markdown"
        )
        return

    try:
        amount = float(context.args[0])
        description = " ".join(context.args[1:])
    except ValueError:
        await update.message.reply_text("❌ Suma trebuie să fie un număr valid.")
        return

    # Categorizare
    prediction = categorizer.predict(description)

    from memory.database import TransactionRecord
    record = TransactionRecord(
        merchant=description,
        amount=amount,
        category_id=prediction.category_id,
        date=date.today().isoformat(),
        confidence=prediction.confidence,
    )

    # Salvează local
    tx_id = db.save_transaction(record)

    # Mesaj cu predicție
    confidence_bar = "🟢" if prediction.confidence > 0.8 else (
        "🟡" if prediction.confidence > 0.5 else "🔴"
    )

    currency = settings.default_currency
    await update.message.reply_text(
        f"📝 *Tranzacție nouă*\n\n"
        f"🏪 {description}\n"
        f"💰 {amount:.2f} {currency}\n"
        f"📅 {date.today().strftime('%d.%m.%Y')}\n"
        f"{confidence_bar} Categorie: *{prediction.category_name}* "
        f"({prediction.confidence:.0%})\n"
        f"💡 _{prediction.reason}_",
        parse_mode="Markdown",
        reply_markup=category_confirmation_keyboard(
            tx_id, prediction.category_id, prediction.confidence
        )
    )


@auth_required
async def cmd_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /stats — statistici lunare."""
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
        logger.error(f"Eroare stats: {e}")
        await update.message.reply_text(f"❌ Eroare la conectarea cu Actual Budget: {e}")
        return

    currency = settings.default_currency
    text = (
        f"📈 *Statistici {stats['month']:02d}/{stats['year']}*\n\n"
        f"Total cheltuieli: *{stats['total']:,.2f} {currency}*\n"
        f"Tranzacții: {stats['count']}\n\n"
    )

    if stats["categories"]:
        text += "*Pe categorii:*\n"
        for _, cat_stats in sorted(
            stats["categories"].items(),
            key=lambda x: x[1]["total"],
            reverse=True
        ):
            name = cat_stats["name"]
            pct = (cat_stats["total"] / stats["total"] * 100) if stats["total"] else 0
            text += (
                f"• {name}: {cat_stats['total']:,.2f} {currency} "
                f"({pct:.0f}%) — {cat_stats['count']} tranzacții\n"
            )
    else:
        text += "_Nicio cheltuială în această lună._"

    await update.message.reply_text(text, parse_mode="Markdown")


@auth_required
async def cmd_categories(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /categories — listează categoriile din Actual Budget."""
    try:
        cats = await actual_client.get_categories()
    except Exception as e:
        await update.message.reply_text(f"❌ Eroare la conectarea cu Actual Budget: {e}")
        return

    if not cats:
        await update.message.reply_text(
            "📂 Nu există categorii în Actual Budget.\n"
            "Adaugă tranzacții — categoriile se creează automat."
        )
        return

    # Grupează pe group_name
    groups: dict[str, list] = {}
    for cat in cats:
        g = cat.group_name or "Fără grup"
        groups.setdefault(g, []).append(cat.name)

    text = "📂 *Categorii în Actual Budget:*\n\n"
    for group, names in sorted(groups.items()):
        text += f"*{group}*\n"
        for name in sorted(names):
            text += f"  • {name}\n"
        text += "\n"

    await update.message.reply_text(text, parse_mode="Markdown")


# ============================================================
# PROCESARE POZE (flux principal)
# ============================================================

@auth_required
async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Handler principal — procesează o poză de bon cu AI vision.

    Flux:
    1. Descarcă imaginea de la Telegram
    2. Trimite la modelul AI vision (Ollama) → primește JSON structurat
    3. Categorizează (memorie + keywords)
    4. Trimite rezultatul cu inline keyboard
    """
    msg = update.message
    image_path = None
    await msg.reply_text("🤖 Analizez bonul cu AI... un moment.")

    try:
        # 1. Descarcă imaginea (cea mai mare rezoluție)
        photo = msg.photo[-1]
        file = await photo.get_file()

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            await file.download_to_drive(tmp.name)
            image_path = tmp.name

        # 2. Extragere cu AI vision
        receipt = await vision_engine.extract_from_path(image_path)

        if not receipt.is_valid:
            await msg.reply_text(
                "⚠️ Nu am reușit să identific un bon valid în imagine.\n\n"
                "Încearcă o poză mai clară sau adaugă manual cu `/add SUMA MAGAZIN`",
                parse_mode="Markdown"
            )
            return

        # 3. Categorizare
        prediction = categorizer.predict(
            merchant=receipt.merchant,
            amount=receipt.total
        )

        # 4. Salvează local
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

        # 5. Răspuns cu detalii
        confidence_bar = "🟢" if prediction.confidence > 0.8 else (
            "🟡" if prediction.confidence > 0.5 else "🔴"
        )
        date_str = receipt.date.strftime("%d.%m.%Y") if receipt.date else "azi"

        text = (
            f"🧾 *Bon procesat!*\n\n"
            f"🏪 Magazin: *{receipt.merchant}*\n"
            f"💰 Total: *{receipt.total:.2f} {receipt.currency}*\n"
            f"📅 Data: {date_str}\n"
        )

        if receipt.items:
            text += f"📋 Articole: {len(receipt.items)}\n"

        text += (
            f"\n{confidence_bar} Categorie: *{prediction.category_name}* "
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
                "🤔 Nu sunt sigur de categorie. Te rog alege:",
                reply_markup=category_selection_keyboard(
                    tx_id, categorizer.get_all_categories()
                )
            )

    except Exception as e:
        logger.error(f"Eroare procesare poză: {e}", exc_info=True)
        await msg.reply_text(
            f"❌ Eroare la procesare: {str(e)[:200]}\n"
            "Încearcă din nou sau adaugă manual cu `/add`"
        )
    finally:
        if image_path:
            try:
                Path(image_path).unlink(missing_ok=True)
            except Exception:
                pass


# ============================================================
# CALLBACK QUERIES (butoane inline)
# ============================================================

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler pentru butoane inline (confirmare categorie etc.)."""
    query = update.callback_query
    await query.answer()

    # Verifică autorizare
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

        elif action == "cancel_tx":
            await query.edit_message_text("🗑️ Tranzacție anulată.")

    except json.JSONDecodeError:
        logger.error(f"Callback data invalid: {query.data}")
    except Exception as e:
        logger.error(f"Eroare callback: {e}", exc_info=True)
        await query.edit_message_text(f"❌ Eroare: {str(e)[:200]}")


async def _handle_confirm_category(query, data: dict):
    """Utilizatorul confirmă categoria prezisă."""
    tx_id = data["tx_id"]
    category_id = data["cat"]

    # Marchează ca confirmat
    db.update_transaction_category(tx_id, category_id)

    # Învață din confirmare
    transactions = db.get_transactions(limit=500)
    for tx in transactions:
        if tx.id == tx_id:
            categorizer.learn(tx.merchant, category_id, tx.raw_ocr_text)
            break

    await query.edit_message_text(
        query.message.text + "\n\n✅ *Categorie confirmată!*",
        parse_mode="Markdown",
        reply_markup=transaction_confirm_keyboard(tx_id)
    )


async def _handle_change_category(query, data: dict):
    """Utilizatorul vrea să schimbe categoria."""
    tx_id = data["tx_id"]
    categories = categorizer.get_all_categories()

    await query.edit_message_text(
        "📂 Alege categoria corectă:",
        reply_markup=category_selection_keyboard(tx_id, categories)
    )


async def _handle_set_category(query, data: dict):
    """Utilizatorul selectează o categorie nouă."""
    tx_id = data["tx_id"]
    category_id = data["cat"]

    # Actualizează și învață
    db.update_transaction_category(tx_id, category_id)

    transactions = db.get_transactions(limit=100)
    for tx in transactions:
        if tx.id == tx_id:
            categorizer.learn(tx.merchant, category_id, tx.raw_ocr_text)
            cat_data = categorizer.categories.get(category_id, {})
            cat_name = cat_data.get("name", category_id)

            await query.edit_message_text(
                f"✅ Categorie actualizată: *{cat_name}*\n"
                f"🧠 Am învățat — data viitoare voi ști!",
                parse_mode="Markdown",
                reply_markup=transaction_confirm_keyboard(tx_id)
            )
            return

    await query.edit_message_text("✅ Categorie actualizată!")


async def _handle_save_to_actual(query, data: dict):
    """Salvează tranzacția în Actual Budget."""
    tx_id = data["tx_id"]

    transactions = db.get_transactions(limit=500)
    tx = None
    for t in transactions:
        if t.id == tx_id:
            tx = t
            break

    if not tx:
        await query.edit_message_text("❌ Tranzacție negăsită.")
        return

    try:
        # Găsește contul implicit
        account = await actual_client.get_default_account()
        if not account:
            await query.edit_message_text(
                "❌ Nu am găsit niciun cont în Actual Budget."
            )
            return

        # Adaugă tranzacția (categoria e creată automat în Actual dacă nu există)
        category_name = categorizer.categories.get(tx.category_id, {}).get("name", "")
        actual_id = await actual_client.add_transaction(
            account_id=account.id,
            amount=tx.amount,
            payee=tx.merchant,
            category_name=category_name,
            tx_date=date.fromisoformat(tx.date) if tx.date else None,
            notes="[Majordom] Categorizat automat",
        )

        currency = settings.default_currency
        await query.edit_message_text(
            f"💾 *Salvat în Actual Budget!*\n\n"
            f"🏪 {tx.merchant}\n"
            f"💰 {tx.amount:.2f} {currency}\n"
            f"🏦 Cont: {account.name}\n"
            f"✅ ID: `{actual_id}`",
            parse_mode="Markdown"
        )

        # Verifică dacă s-a depășit limita de buget
        await _check_budget_alert(query, category_name, tx.amount)

    except Exception as e:
        logger.error(f"Eroare salvare Actual: {e}")
        await query.edit_message_text(
            f"❌ Eroare la salvare în Actual Budget:\n{str(e)[:200]}"
        )


async def _check_budget_alert(query, category_name: str, new_amount: float):
    """Verifică limita de buget și trimite alertă dacă e depășită."""
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
                f"⚠️ *Depășire buget!*\n\n"
                f"📂 {category_name}\n"
                f"💸 Cheltuit: *{spent:.2f} {currency}*\n"
                f"🎯 Limită: {limit:.0f} {currency}\n"
                f"🔴 Depășire: *+{overage:.2f} {currency}*",
                parse_mode="Markdown"
            )
        elif spent > limit * 0.85:
            remaining = limit - spent
            await query.message.reply_text(
                f"🟡 *Atenție buget!*\n\n"
                f"📂 {category_name}\n"
                f"💸 Cheltuit: *{spent:.2f} {currency}* ({spent/limit*100:.0f}%)\n"
                f"📊 Mai ai: *{remaining:.2f} {currency}* din {limit:.0f} {currency}",
                parse_mode="Markdown"
            )
    except Exception as e:
        logger.warning(f"Nu am putut verifica bugetul: {e}")


# ============================================================
# SETUP
# ============================================================

def setup_handlers(app: Application) -> Application:
    """Înregistrează toate handlerele pe aplicație."""
    global db, categorizer, vision_engine, actual_client

    # Inițializează componentele
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

    # Wizard buget (trebuie înregistrat înainte de CallbackQueryHandler generic)
    from bot.budget_wizard import create_budget_conversation
    app.add_handler(create_budget_conversation())

    # Comenzi
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("balance", cmd_balance))
    app.add_handler(CommandHandler("add", cmd_add))
    app.add_handler(CommandHandler("stats", cmd_stats))
    app.add_handler(CommandHandler("categories", cmd_categories))

    # Poze
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))

    # Callback queries (butoane inline)
    app.add_handler(CallbackQueryHandler(handle_callback))

    # Job lunar — rezumat la 1 ale lunii ora 8:00
    if app.job_queue:
        app.job_queue.run_monthly(
            _monthly_summary_job,
            when=datetime.strptime("08:00", "%H:%M").time(),
            day=1,
            chat_id=settings.telegram.allowed_user_ids[0] if settings.telegram.allowed_user_ids else None,
        )
        logger.info("Job lunar înregistrat ✓")

    logger.info("Handlere Telegram înregistrate ✓")
    return app


async def _monthly_summary_job(context: ContextTypes.DEFAULT_TYPE):
    """Trimite rezumatul lunar la 1 ale lunii."""
    from datetime import date as _date
    import calendar

    today = _date.today()
    # Luna precedentă
    first_of_month = today.replace(day=1)
    last_month = first_of_month - __import__("datetime").timedelta(days=1)
    month, year = last_month.month, last_month.year

    try:
        stats = await actual_client.get_monthly_stats(month=month, year=year)
        limits = db.get_budget_limits()
        currency = settings.default_currency

        text = f"📅 *Rezumat {calendar.month_name[month]} {year}*\n\n"
        text += f"Total cheltuieli: *{stats['total']:,.2f} {currency}*\n"
        text += f"Tranzacții: {stats['count']}\n\n"

        if stats["categories"]:
            text += "*Pe categorii:*\n"
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
        logger.error(f"Eroare job lunar: {e}")
