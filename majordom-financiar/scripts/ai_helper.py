#!/usr/bin/env python3
"""
ai_helper.py — calls DeepSeek API for simple code generation tasks.

Usage:
  python scripts/ai_helper.py --task "description" [--context "extra context"]
  echo "prompt" | python scripts/ai_helper.py

The script reads DEEPSEEK_API_KEY from the environment (set in .env or shell).
Output is the raw generated text, ready to pipe or capture.

Called by Claude Code for self-contained tasks (UI components, simple endpoints)
so the main Claude context window stays focused on complex integration work.
"""

import argparse
import os
import sys

try:
    from openai import OpenAI
except ImportError:
    print("ERROR: openai package not installed. Run: pip install openai", file=sys.stderr)
    sys.exit(1)

# Project context injected into every request so DeepSeek knows the codebase
PROJECT_CONTEXT = """
You are generating code for **Majordom Financiar** — a self-hosted personal finance PWA.

Stack:
- Frontend: React 18 + TypeScript + Tailwind CSS (dark theme)
  - Colors: background=#0F0F0F, surface=#1A1A1A, accent=#6366F1, muted=#71717A, success=#22C55E, border=#2A2A2A
  - Icons: lucide-react
  - Animation: framer-motion
  - Routing: react-router-dom (useNavigate, NavLink)
  - API calls: functions from ../lib/api.ts using JWT auth
- Backend: FastAPI + Python 3.11
  - Imports: from backend.core.xxx import ...
  - Auth dependency: get_current_user from backend.api.auth
  - Config: from backend.core.config import settings

Rules:
- Match the existing dark UI style exactly — no light colors, no new color names
- TypeScript, no `any` types unless unavoidable
- Functional React components only
- Python: async def, Pydantic models, no os.getenv() (use settings)
- Return ONLY the file content — no explanation, no markdown fences
"""


def call_deepseek(task: str, context: str = "", model: str = "deepseek-coder") -> str:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        print("ERROR: DEEPSEEK_API_KEY not set in environment.", file=sys.stderr)
        sys.exit(1)

    client = OpenAI(
        api_key=api_key,
        base_url="https://api.deepseek.com",
    )

    messages = [
        {"role": "system", "content": PROJECT_CONTEXT},
    ]
    if context:
        messages.append({"role": "user", "content": f"Additional context:\n{context}"})
        messages.append({"role": "assistant", "content": "Understood. What should I implement?"})

    messages.append({"role": "user", "content": task})

    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.2,
        max_tokens=4096,
    )
    return response.choices[0].message.content.strip()


def main():
    parser = argparse.ArgumentParser(description="Call DeepSeek for code generation tasks")
    parser.add_argument("--task", "-t", help="Task description / prompt")
    parser.add_argument("--context", "-c", default="", help="Extra context (file contents, types, etc.)")
    parser.add_argument("--model", "-m", default="deepseek-coder", help="Model to use (default: deepseek-coder)")
    args = parser.parse_args()

    # Accept task from --task flag or stdin
    if args.task:
        task = args.task
    elif not sys.stdin.isatty():
        task = sys.stdin.read().strip()
    else:
        parser.print_help()
        sys.exit(1)

    result = call_deepseek(task, context=args.context, model=args.model)
    print(result)


if __name__ == "__main__":
    main()
