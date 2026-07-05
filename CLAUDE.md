# Majordom — Platform Context

Majordom is a personal AI orchestrator — conversational UI + MCP server + proactive digest. It calls specialized services (Sure, Actual Budget, Home Assistant, Immich, Nextcloud) via REST API and exposes its own tools to external agents (OpenClaw, Claude API) via MCP.

The user talks to Majordom in natural language. Majordom calls the right service, executes the action, and asks for confirmation. The user never interacts with the underlying services directly.

**Active development:** `majordom-financiar/` → target: `majordom-finance/` (see #150 — naming convention still being decided, not the old single-`majordom/` target)
**Finance platform:** Actual Budget (current) → Sure (conditional — deferred until Ghostfolio vs Sure evaluation)
**Architecture target:** `life-os/` as modular monorepo and platform brand — each service independent, named `majordom-<domain>` (e.g. `majordom-finance`, `majordom-garage`) — see #150

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

## Current priorities (2026-07-05)

Full prioritized backlog lives on GitHub as Milestones + Labels (`tier-2`, `tier-3`, `intelligence-cluster`, `deferred-local-first`, `deferred-opportunistic`) — not a doc, see `majordom-financiar/CLAUDE.md#priority-tracking`. Example: `gh issue list --label tier-2`.

1. **Just completed** — #99 (`merchant_mappings` SQLite removed, replaced by Actual Budget's native Rules engine), #93 (code audit), [#138](https://github.com/Dorusto/life-os/issues/138) (extract `vehicle-manager` as independent service)
2. **Next up** — check `gh issue list --label tier-2` / `tier-3` for the current ready-to-pick-up backlog (this list drifts — GitHub is the source of truth, see `#priority-tracking` above)
3. **Proactive budget intelligence** (#41, #42, #110-114, #116, #124) — real but medium priority, grouped, picked up once standard-functionality work runs dry
4. **Deferred to local-first LLM switch-back** — #75, #65, #80/#81/#86 (see `decisions.md#llm-provider`), high priority again once local models are back in active use
5. **M2.5 budget calibration** — reframed from "goal proposal", tracked as [#110](https://github.com/Dorusto/life-os/issues/110)/[#111](https://github.com/Dorusto/life-os/issues/111) (see `majordom-financiar/docs/decisions.md#budget-calibration`)
6. **Sure/Ghostfolio evaluation** — migration trigger fired 2026-07-05 (portfolio tracking became an active need); MCP-server evaluation queued next (`majordom-financiar/scripts/prompts/claude/009_m5-sure-mcp-evaluation.md`), not yet a migration decision — user also wants to test Ghostfolio in parallel (see decisions.md#sure-adoption)

## Open fork: after majordom-financiar stabilizes (raised 2026-07-05, not decided)

Two directions compete for what comes after the core (M0-M4) is stable:
1. **Package Majordom for others to install/use** — generic setup instead of hardcoded personal config (`PRIVATE_context.md` assumptions), an installer that doesn't require Docker knowledge.
2. **Keep building new personal capabilities** — e.g. a "digital majordom" that ingests documents (insurance cards, warranties), remembers them via RAG, stores the file in Nextcloud, and retrieves it on request. Also a future wellness domain.

Current leaning: **(1) first** — real usage/adoption matters more right now than additional personal-only features. (2) is also genuinely new, unbuilt territory (RAG) vs. (1) building on ~90%-done work.

**Not a final decision** — revisit in a dedicated planning session once M0-M4 feels stable enough to ask "what's next" for real.
