"""
ChatService — financial assistant powered by a local Ollama chat model.

Uses qwen2.5:7b (text-only, fast) for conversation.
Injects real financial context (accounts, stats, recent transactions) into the
system prompt so the assistant can answer questions about the user's finances.
"""
import json
import logging
from typing import Any

import aiohttp

from backend.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_TEMPLATE = """You are Majordom, a concise and practical personal finance assistant.

## Your user's current financial snapshot
{financial_context}

## Rules
- Answer only financial questions. Politely decline off-topic requests.
- Be concise — 2-4 sentences unless detail is explicitly requested.
- Detect the user's language from their message and respond in the same language (Romanian, Dutch, or English).
- When referencing amounts, always use the € symbol.
- Never invent data — only use the snapshot above.

Today's date: {today}
"""


class ChatService:
    def __init__(self):
        self._base_url = settings.ollama.url
        self._model = settings.ollama.chat_model

    def _build_system_prompt(self, context: dict[str, Any]) -> str:
        """Format financial context into a readable system prompt."""
        lines = []

        accounts = context.get("accounts", [])
        if accounts:
            lines.append("### Accounts")
            for acc in accounts:
                lines.append(f"- {acc['name']}: €{acc['balance']:.2f}")

        stats = context.get("stats")
        if stats:
            lines.append(f"\n### Spending this month ({stats['month']}/{stats['year']})")
            lines.append(f"- Total: €{stats['total']:.2f} across {stats['count']} transactions")
            for cat in stats.get("categories", [])[:5]:
                lines.append(f"  - {cat['name']}: €{cat['total']:.2f} ({cat['percentage']:.0f}%)")

        recent = context.get("recent_transactions", [])
        if recent:
            lines.append("\n### Last 5 transactions")
            for tx in recent[:5]:
                lines.append(f"- {tx['date']} · {tx['merchant']} · €{tx['amount']:.2f} ({tx.get('category') or 'uncategorized'})")

        from datetime import date
        financial_context = "\n".join(lines) if lines else "No financial data available yet."
        return SYSTEM_PROMPT_TEMPLATE.format(
            financial_context=financial_context,
            today=date.today().isoformat(),
        )

    async def chat(
        self,
        message: str,
        history: list[dict[str, str]],
        context: dict[str, Any] | None = None,
    ) -> str:
        """
        Send a message to the local chat model and return the reply.

        Args:
            message: Latest user message.
            history: Previous turns as [{"role": "user"|"assistant", "content": str}].
            context: Financial data dict with keys: accounts, stats, recent_transactions.
        """
        system_prompt = self._build_system_prompt(context or {})

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history)
        messages.append({"role": "user", "content": message})

        payload = {
            "model": self._model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": 0.3,   # low temp = factual, consistent
                "num_predict": 512,   # cap response length
            },
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self._base_url}/api/chat",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=120),
                ) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        raise RuntimeError(f"Ollama error {resp.status}: {body}")
                    data = await resp.json()
                    return data["message"]["content"].strip()

        except aiohttp.ClientConnectorError:
            logger.error("Cannot connect to Ollama at %s", self._base_url)
            raise RuntimeError("AI assistant is unavailable right now. Is Ollama running?")
        except Exception as e:
            logger.error("Chat error: %s", e)
            raise
