from __future__ import annotations

"""
Wizard de configurare buget lunar.

Flux:
1. /setup_budget → afișează lista cu limite sugerate
2. User apasă "Confirmă toate" → salvează direct
   User apasă "Ajustează" → intră în mod pas-cu-pas
3. Pentru fiecare categorie: user trimite sumă sau apasă "Păstrează"
4. La final → salvează toate și afișează rezumatul
"""
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ConversationHandler, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, filters,
)

logger = logging.getLogger(__name__)

BUDGET_ITEMS = [
    ("Alimente & Băuturi",      1000.0),
    ("Restaurante & Cafenele",   200.0),
    ("Transport",                350.0),
    ("Sănătate",                 100.0),
    ("Îmbrăcăminte",             150.0),
    ("Casă & Grădină",           150.0),
    ("Divertisment",              80.0),
    ("Educație",                  80.0),
    ("Utilități",                180.0),
    ("Telefoane",                 30.0),
    ("Abonamente",                30.0),
    ("Donații",                   20.0),
    ("Bani personali",           400.0),
    ("Copii",                    200.0),
    ("Altele",                   100.0),
]

CHOOSING = 0  # Asteapta "Confirma" sau "Ajusteaza"
STEP = 1      # Parcurge categoriile una cate una


async def cmd_setup_budget(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Pornește wizard-ul."""
    from memory import MemoryDB
    from config import settings
    db = MemoryDB(settings.memory.db_path)
    current = db.get_budget_limits()

    # Inițializează starea wizard-ului cu limitele curente sau default
    items = [(name, current.get(name, default)) for name, default in BUDGET_ITEMS]
    context.user_data["wizard_items"] = items
    context.user_data["wizard_step"] = 0

    text = "📋 *Configurare buget lunar*\n\n"
    for i, (name, limit) in enumerate(items, 1):
        text += f"{i}. {name}: *{limit:.0f} EUR*\n"
    text += "\nConfirmă limitele de mai sus sau ajustează-le una câte una."

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Confirmă toate", callback_data="bw_confirm_all"),
        InlineKeyboardButton("✏️ Ajustează", callback_data="bw_adjust"),
    ]])

    await update.message.reply_text(text, parse_mode="Markdown", reply_markup=keyboard)
    return CHOOSING


async def handle_confirm_all(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Utilizatorul confirmă toate limitele."""
    query = update.callback_query
    await query.answer()
    await _save_and_show(query, context)
    return ConversationHandler.END


async def handle_adjust(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Utilizatorul vrea să ajusteze — trece la pas-cu-pas."""
    query = update.callback_query
    await query.answer()
    context.user_data["wizard_step"] = 0
    await _show_current_step(query, context, edit=True)
    return STEP


async def handle_step_keep(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Utilizatorul apasă 'Păstrează' pentru categoria curentă."""
    query = update.callback_query
    await query.answer()
    context.user_data["wizard_step"] = context.user_data.get("wizard_step", 0) + 1

    if context.user_data["wizard_step"] >= len(context.user_data["wizard_items"]):
        await _save_and_show(query, context)
        return ConversationHandler.END

    await _show_current_step(query, context, edit=True)
    return STEP


async def handle_step_amount(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Utilizatorul trimite o sumă numerică."""
    text = update.message.text.strip().replace(",", ".")
    try:
        amount = float(text)
        if amount < 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("❌ Trimite un număr pozitiv (ex: 850) sau /skip.")
        return STEP

    step = context.user_data.get("wizard_step", 0)
    items = context.user_data["wizard_items"]
    name, _ = items[step]
    items[step] = (name, amount)
    context.user_data["wizard_step"] = step + 1

    await update.message.reply_text(
        f"✅ *{name}*: {amount:.0f} EUR salvat.", parse_mode="Markdown"
    )

    if context.user_data["wizard_step"] >= len(items):
        await _save_and_show(update.message, context)
        return ConversationHandler.END

    await _show_current_step(update.message, context, edit=False)
    return STEP


async def handle_step_skip(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/skip — păstrează valoarea curentă și merge mai departe."""
    context.user_data["wizard_step"] = context.user_data.get("wizard_step", 0) + 1

    if context.user_data["wizard_step"] >= len(context.user_data["wizard_items"]):
        await _save_and_show(update.message, context)
        return ConversationHandler.END

    await _show_current_step(update.message, context, edit=False)
    return STEP


async def handle_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/cancel — anulează wizard-ul."""
    await update.message.reply_text("❌ Configurare anulată.")
    return ConversationHandler.END


async def _show_current_step(msg_or_query, context: ContextTypes.DEFAULT_TYPE, edit: bool):
    """Afișează pasul curent din wizard."""
    step = context.user_data.get("wizard_step", 0)
    items = context.user_data["wizard_items"]
    total = len(items)
    name, limit = items[step]

    text = (
        f"*Pasul {step + 1}/{total}*\n\n"
        f"📂 *{name}*\n"
        f"Limită curentă: *{limit:.0f} EUR/lună*\n\n"
        f"Trimite noua valoare sau apasă butonul de mai jos."
    )
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton(f"✅ Păstrează {limit:.0f} EUR", callback_data="bw_keep"),
    ]])

    if edit and hasattr(msg_or_query, "edit_message_text"):
        await msg_or_query.edit_message_text(text, parse_mode="Markdown", reply_markup=keyboard)
    else:
        await msg_or_query.reply_text(text, parse_mode="Markdown", reply_markup=keyboard)


async def _save_and_show(msg_or_query, context: ContextTypes.DEFAULT_TYPE):
    """Salvează toate limitele și afișează rezumatul."""
    from memory import MemoryDB
    from config import settings
    db = MemoryDB(settings.memory.db_path)

    items = context.user_data.get("wizard_items", BUDGET_ITEMS)
    for name, limit in items:
        db.set_budget_limit(name, limit)

    currency = settings.default_currency
    text = "✅ *Buget salvat!*\n\n"
    total = 0.0
    for name, limit in items:
        text += f"• {name}: {limit:.0f} {currency}\n"
        total += limit
    text += f"\n📊 *Total monitorizat: {total:.0f} {currency}/lună*\n"
    text += "_Vei fi alertat când depășești o limită._ 🔔"

    if hasattr(msg_or_query, "edit_message_text"):
        await msg_or_query.edit_message_text(text, parse_mode="Markdown")
    else:
        await msg_or_query.reply_text(text, parse_mode="Markdown")


def create_budget_conversation() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[CommandHandler("setup_budget", cmd_setup_budget)],
        states={
            CHOOSING: [
                CallbackQueryHandler(handle_confirm_all, pattern="^bw_confirm_all$"),
                CallbackQueryHandler(handle_adjust, pattern="^bw_adjust$"),
            ],
            STEP: [
                CallbackQueryHandler(handle_step_keep, pattern="^bw_keep$"),
                CommandHandler("skip", handle_step_skip),
                MessageHandler(filters.TEXT & ~filters.COMMAND, handle_step_amount),
            ],
        },
        fallbacks=[CommandHandler("cancel", handle_cancel)],
        per_message=False,
    )
