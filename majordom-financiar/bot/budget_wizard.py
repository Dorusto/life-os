from __future__ import annotations

"""
Monthly budget setup wizard.

Flow:
1. /setup_budget → shows list with suggested limits
2. User presses "Confirm all" → saves directly
   User presses "Adjust" → enters step-by-step mode
3. For each category: user sends amount or presses "Keep"
4. At the end → saves all and shows summary
"""
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ConversationHandler, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, filters,
)

logger = logging.getLogger(__name__)

BUDGET_ITEMS = [
    ("Groceries",               1200.0),
    ("Restaurants",              100.0),
    ("Transport",                350.0),
    ("Utilities",                200.0),
    ("Health",                   100.0),
    ("Clothing",                 150.0),
    ("Home & Maintenance",       150.0),
    ("Entertainment & Travel",    80.0),
    ("Children",                 200.0),
    ("Personal",                 400.0),
    ("Investments & Savings",    700.0),
    ("Other",                    100.0),
]

CHOOSING = 0  # Waiting for "Confirm" or "Adjust"
STEP = 1      # Stepping through categories one by one


async def cmd_setup_budget(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Start the wizard."""
    from memory import MemoryDB
    from config import settings
    db = MemoryDB(settings.memory.db_path)
    current = db.get_budget_limits()

    # Initialize wizard state with current limits or defaults
    items = [(name, current.get(name, default)) for name, default in BUDGET_ITEMS]
    context.user_data["wizard_items"] = items
    context.user_data["wizard_step"] = 0

    text = "📋 *Monthly budget setup*\n\n"
    for i, (name, limit) in enumerate(items, 1):
        text += f"{i}. {name}: *{limit:.0f} EUR*\n"
    text += "\nConfirm the limits above or adjust them one by one."

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Confirm all", callback_data="bw_confirm_all"),
        InlineKeyboardButton("✏️ Adjust", callback_data="bw_adjust"),
    ]])

    await update.message.reply_text(text, parse_mode="Markdown", reply_markup=keyboard)
    return CHOOSING


async def handle_confirm_all(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """User confirms all limits."""
    query = update.callback_query
    await query.answer()
    await _save_and_show(query, context)
    return ConversationHandler.END


async def handle_adjust(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """User wants to adjust — switch to step-by-step mode."""
    query = update.callback_query
    await query.answer()
    context.user_data["wizard_step"] = 0
    await _show_current_step(query, context, edit=True)
    return STEP


async def handle_step_keep(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """User presses 'Keep' for the current category."""
    query = update.callback_query
    await query.answer()
    context.user_data["wizard_step"] = context.user_data.get("wizard_step", 0) + 1

    if context.user_data["wizard_step"] >= len(context.user_data["wizard_items"]):
        await _save_and_show(query, context)
        return ConversationHandler.END

    await _show_current_step(query, context, edit=True)
    return STEP


async def handle_step_amount(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """User sends a numeric amount."""
    text = update.message.text.strip().replace(",", ".")
    try:
        amount = float(text)
        if amount < 0:
            raise ValueError
    except ValueError:
        await update.message.reply_text("❌ Please enter a positive number (e.g. 850) or /skip.")
        return STEP

    step = context.user_data.get("wizard_step", 0)
    items = context.user_data["wizard_items"]
    name, _ = items[step]
    items[step] = (name, amount)
    context.user_data["wizard_step"] = step + 1

    await update.message.reply_text(
        f"✅ *{name}*: {amount:.0f} EUR saved.", parse_mode="Markdown"
    )

    if context.user_data["wizard_step"] >= len(items):
        await _save_and_show(update.message, context)
        return ConversationHandler.END

    await _show_current_step(update.message, context, edit=False)
    return STEP


async def handle_step_skip(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/skip — keep current value and move on."""
    context.user_data["wizard_step"] = context.user_data.get("wizard_step", 0) + 1

    if context.user_data["wizard_step"] >= len(context.user_data["wizard_items"]):
        await _save_and_show(update.message, context)
        return ConversationHandler.END

    await _show_current_step(update.message, context, edit=False)
    return STEP


async def handle_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/cancel — abort the wizard."""
    await update.message.reply_text("❌ Setup cancelled.")
    return ConversationHandler.END


async def _show_current_step(msg_or_query, context: ContextTypes.DEFAULT_TYPE, edit: bool):
    """Display the current wizard step."""
    step = context.user_data.get("wizard_step", 0)
    items = context.user_data["wizard_items"]
    total = len(items)
    name, limit = items[step]

    text = (
        f"*Step {step + 1}/{total}*\n\n"
        f"📂 *{name}*\n"
        f"Current limit: *{limit:.0f} EUR/month*\n\n"
        f"Send a new value or press the button below."
    )
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton(f"✅ Keep {limit:.0f} EUR", callback_data="bw_keep"),
    ]])

    if edit and hasattr(msg_or_query, "edit_message_text"):
        await msg_or_query.edit_message_text(text, parse_mode="Markdown", reply_markup=keyboard)
    else:
        await msg_or_query.reply_text(text, parse_mode="Markdown", reply_markup=keyboard)


async def _save_and_show(msg_or_query, context: ContextTypes.DEFAULT_TYPE):
    """Save all limits and show summary."""
    from memory import MemoryDB
    from config import settings
    db = MemoryDB(settings.memory.db_path)

    items = context.user_data.get("wizard_items", BUDGET_ITEMS)
    for name, limit in items:
        db.set_budget_limit(name, limit)

    currency = settings.default_currency
    text = "✅ *Budget saved!*\n\n"
    total = 0.0
    for name, limit in items:
        text += f"• {name}: {limit:.0f} {currency}\n"
        total += limit
    text += f"\n📊 *Total monitored: {total:.0f} {currency}/month*\n"
    text += "_You'll be alerted when you exceed a limit._ 🔔"

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
