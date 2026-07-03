# Majordom — Platform Context

Majordom is a personal AI orchestrator — conversational UI + MCP server + proactive digest. It calls specialized services (Sure, Actual Budget, Home Assistant, Immich, Nextcloud) via REST API and exposes its own tools to external agents (OpenClaw, Claude API) via MCP.

The user talks to Majordom in natural language. Majordom calls the right service, executes the action, and asks for confirmation. The user never interacts with the underlying services directly.

**Active development:** `majordom-financiar/` → target: `majordom/` (incremental rename)
**Finance platform:** Actual Budget (current) → Sure (conditional — deferred until Ghostfolio vs Sure evaluation)
**Architecture target:** `life-os/` as modular monorepo — each service independent

Full architecture + target structure: `majordom-financiar/docs/architecture.md`
Full roadmap (milestones): `majordom-financiar/docs/roadmap.md`
Issue priority: GitHub Milestones + Labels, not a doc — see `majordom-financiar/CLAUDE.md#priority-tracking`

---

## Rules

- **Language:** discussions in Romanian, all code/docs/commits/issues in English
- **Before any code:** read `ARCHITECTURE.md` and `ROADMAP.md`
- **Implementation order:** follow the steps in ARCHITECTURE.md — do not skip the architecture audit (Step 1)
- **One feature at a time**
- **Do not store financial data in SQLite** — Actual Budget is the source of truth
- **GitHub issues, commit messages, code comments** → English only
- **No real names, license plates, Telegram IDs, or personal locations** in any public file

---

## Collaboration workflow

**Claude** = senior/architect: reads the code, designs the solution, writes the spec and DeepSeek prompt.
**DeepSeek** = engineer: receives the prompt, implements.

DeepSeek prompts are saved in `majordom-financiar/scripts/prompts/` — one `.md` file per task.
If Claude is not available (credit exhausted): open the relevant prompt file and paste it directly into DeepSeek.

When the user asks only to note a bug or idea → create a GitHub issue and stop. Do not implement.

---

## Financial profile

See `majordom-financiar/PRIVATE_context.md` (gitignored, private) for the complete family financial profile, budget breakdown, and personal context. (`majordom-financiar/CLAUDE.md` itself is tracked/public — dev workflow guide only, no financial data.)

---

## Current priorities (2026-07-03)

Full prioritized backlog lives on GitHub as Milestones + Labels (`tier-2`, `tier-3`, `intelligence-cluster`, `deferred-local-first`, `deferred-opportunistic`) — not a doc, see `majordom-financiar/CLAUDE.md#priority-tracking`. Example: `gh issue list --label tier-2`.

1. **Just completed** — M5.0 tool domain routing (#98), #137 (chat history bug), #99 audit (found + fixed an unrelated SQLite violation in `pending_review`)
2. **Next up** — #93 (code audit) → [#138](https://github.com/Dorusto/life-os/issues/138) (extract `vehicle-manager` as independent service) → #79/#134 as its consumers
3. **Proactive budget intelligence** (#41, #42, #110-114, #116, #124) — real but medium priority, grouped, picked up once standard-functionality work runs dry
4. **Deferred to local-first LLM switch-back** — #75, #65, #80/#81/#86 (see `decisions.md#llm-provider`), high priority again once local models are back in active use
5. **M2.5 goal proposal** — `propose_budget_calibration` tool (budget calibration after 2+ months of data)
6. **Sure/Ghostfolio evaluation** — deferred until portfolio tracking becomes a real need (see decisions.md#sure-adoption)
