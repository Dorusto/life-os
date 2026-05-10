from __future__ import annotations

"""
Monthly budget setup wizard — DEPRECATED.

Budget limits were previously stored in SQLite (`budget_limits` table).
That table is now removed — financial data belongs in Actual Budget.

Actual Budget handles its own budget tracking. This wizard is preserved
as a placeholder so that the ConversationHandler registration in
bot/handlers.py does not break. It informs users that budget management
is now handled by Actual Budget directly.
"""
import logging
from telegram import Update
from telegram.ext import (
    ConversationHandler, CommandHandler, ContextTypes,
)

logger = logging.getLogger(__name__)

CHOOSING = 0
STEP = 1


async def cmd_setup_budget(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Start the wizard — DEPRECATED."""
    await update.message.reply_text(
        "📋 *Budget setup* — *Deprecated*\n\n"
        "Budget limits are now managed directly in Actual Budget.\n"
        "Please use Actual Budget's own budgeting features.\n\n"
        "_This command is kept for compatibility and will be removed in a future release._",
        parse_mode="Markdown",
    )
    return ConversationHandler.END


async def handle_confirm_all(update, context):
    return ConversationHandler.END


async def handle_adjust(update, context):
    return ConversationHandler.END


async def handle_step_keep(update, context):
    return ConversationHandler.END


async def handle_step_amount(update, context):
    return ConversationHandler.END


async def handle_step_skip(update, context):
    return ConversationHandler.END


async def handle_cancel(update, context):
    return ConversationHandler.END


def create_budget_conversation() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[CommandHandler("setup_budget", cmd_setup_budget)],
        states={
            CHOOSING: [],
            STEP: [],
        },
        fallbacks=[CommandHandler("cancel", handle_cancel)],
        per_message=False,
    )
