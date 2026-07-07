from __future__ import annotations
"""
Centralized configuration — reads from environment variables.
"""
import os
from pathlib import Path
from dataclasses import dataclass, field


@dataclass
class LLMConfig:
    base_url: str = ""
    api_key: str = ""
    vision_model: str = ""      # for receipt OCR
    chat_model: str = ""        # for financial assistant chat
    categorize_model: str = ""  # for CSV merchant categorization (smaller = faster)

    def __post_init__(self):
        self.base_url = os.getenv("LLM_BASE_URL", "http://ollama:11434")
        self.api_key = os.getenv("LLM_API_KEY", "")
        self.vision_model = os.getenv("LLM_VISION_MODEL", "qwen2.5vl:7b")
        self.chat_model = os.getenv("LLM_CHAT_MODEL", "qwen2.5:7b")
        self.categorize_model = os.getenv(
            "LLM_CATEGORIZE_MODEL", self.chat_model
        )

    @property
    def model(self) -> str:
        """Backward-compat alias for vision model (used by VisionEngine)."""
        return self.vision_model


def build_llm_headers(api_key: str = "") -> dict[str, str]:
    """HTTP headers for any LLM call. HTTP-Referer/X-Title are OpenRouter's
    app-attribution headers (https://openrouter.ai/docs) — without them,
    OpenRouter's dashboard groups all usage under "Unknown" in Top Apps.
    Ignored by Ollama, so safe to send unconditionally."""
    headers = {
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Dorusto/life-os",
        "X-Title": "Majordom",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


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
class VehicleManagerConfig:
    url: str = ""

    def __post_init__(self):
        self.url = os.getenv("VEHICLE_MANAGER_URL", "http://vehicle-manager:8010")


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
    actual: ActualBudgetConfig = field(default_factory=ActualBudgetConfig)
    vehicle_manager: VehicleManagerConfig = field(default_factory=VehicleManagerConfig)
    ollama: LLMConfig = field(default_factory=LLMConfig)
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    default_currency: str = "EUR"
    log_level: str = "INFO"
    backup_dir: str = ""

    def __post_init__(self):
        self.default_currency = os.getenv("DEFAULT_CURRENCY", "EUR")
        self.log_level = os.getenv("LOG_LEVEL", "INFO")
        # Mounted read-only from the host's ./backups/ (scripts/backup.sh output) —
        # not created here, just read if present, see get_backup_status.
        self.backup_dir = os.getenv("BACKUP_DIR", "/app/backups")
        # Ensure the DB directory exists
        Path(self.memory.db_path).parent.mkdir(parents=True, exist_ok=True)

    def validate(self) -> list[str]:
        """Check that all critical settings are configured."""
        errors = []
        if not self.actual.password:
            errors.append("ACTUAL_BUDGET_PASSWORD is missing")
        return errors


# Global singleton
settings = Settings()
