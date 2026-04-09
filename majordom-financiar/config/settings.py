from __future__ import annotations
"""
Configurare centralizată — citește din variabile de mediu.
"""
import os
from pathlib import Path
from dataclasses import dataclass, field


@dataclass
class TelegramConfig:
    bot_token: str = ""
    allowed_user_ids: list[int] = field(default_factory=list)

    def __post_init__(self):
        self.bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        raw_ids = os.getenv("TELEGRAM_ALLOWED_USER_IDS", "")
        self.allowed_user_ids = [
            int(uid.strip()) for uid in raw_ids.split(",") if uid.strip()
        ]


@dataclass
class ActualBudgetConfig:
    url: str = ""
    password: str = ""
    sync_id: str = ""

    def __post_init__(self):
        self.url = os.getenv("ACTUAL_BUDGET_URL", "http://actual-budget:5006")
        self.password = os.getenv("ACTUAL_BUDGET_PASSWORD", "")
        self.sync_id = os.getenv("ACTUAL_BUDGET_SYNC_ID", "")


@dataclass
class OllamaConfig:
    url: str = ""
    model: str = ""

    def __post_init__(self):
        self.url = os.getenv("OLLAMA_URL", "http://ollama:11434")
        self.model = os.getenv("OLLAMA_MODEL", "qwen2.5vl:7b")


@dataclass
class MemoryConfig:
    db_path: str = ""
    auto_threshold: float = 0.8

    def __post_init__(self):
        self.db_path = os.getenv("MEMORY_DB_PATH", "/app/data/memory.db")
        self.auto_threshold = float(
            os.getenv("CATEGORIZE_AUTO_THRESHOLD", "0.8")
        )


@dataclass
class Settings:
    telegram: TelegramConfig = field(default_factory=TelegramConfig)
    actual: ActualBudgetConfig = field(default_factory=ActualBudgetConfig)
    ollama: OllamaConfig = field(default_factory=OllamaConfig)
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    default_currency: str = "EUR"
    log_level: str = "INFO"

    def __post_init__(self):
        self.default_currency = os.getenv("DEFAULT_CURRENCY", "EUR")
        self.log_level = os.getenv("LOG_LEVEL", "INFO")
        # Asigură că directorul pentru DB există
        Path(self.memory.db_path).parent.mkdir(parents=True, exist_ok=True)

    def validate(self) -> list[str]:
        """Verifică că toate configurările critice sunt setate."""
        errors = []
        if not self.telegram.bot_token:
            errors.append("TELEGRAM_BOT_TOKEN lipsește")
        if not self.telegram.allowed_user_ids:
            errors.append("TELEGRAM_ALLOWED_USER_IDS lipsește")
        if not self.actual.password:
            errors.append("ACTUAL_BUDGET_PASSWORD lipsește")
        return errors


# Singleton global
settings = Settings()
