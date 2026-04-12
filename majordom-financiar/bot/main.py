"""
Entry point — starts the Telegram bot.
"""
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv
from telegram.ext import Application

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

load_dotenv()

from backend.core.config import settings
from bot.handlers import setup_handlers


def setup_logging():
    logging.basicConfig(
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        level=getattr(logging, settings.log_level, logging.INFO),
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler("/app/data/majordom.log", encoding="utf-8"),
        ],
    )


def main():
    setup_logging()
    logger = logging.getLogger(__name__)

    # Validate configuration
    errors = settings.validate()
    if errors:
        for err in errors:
            logger.error(f"Missing configuration: {err}")
        sys.exit(1)

    logger.info("Starting Majordom...")

    app = Application.builder().token(settings.telegram.bot_token).build()
    app = setup_handlers(app)

    logger.info("Bot started. Waiting for messages...")
    from telegram import Update
    app.run_polling(
        drop_pending_updates=True,
        allowed_updates=Update.ALL_TYPES,
    )


if __name__ == "__main__":
    main()
