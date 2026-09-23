# Majordom — Platform Context

Majordom is a personal AI orchestrator — conversational UI + MCP server + proactive digest. It calls specialized services (Sure, Actual Budget, Home Assistant, Immich, Nextcloud) via REST API and exposes its own tools to external agents (OpenClaw, Claude API) via MCP.

The user talks to Majordom in natural language. Majordom calls the right service, executes the action, and asks for confirmation. The user never interacts with the underlying services directly.

**Active development:** `majordom-financiar/` → target: `majordom-finance/` (see #150 — naming convention still being decided, not the old single-`majordom/` target)
**Finance platform:** Actual Budget (budgeting, stays) + portfolio data source open/undecided — Ghostfolio dropped 2026-08-28, never deployed or integrated, see `majordom-financiar/docs/decisions.md#ghostfolio-dropped`. Sure migration for AB itself remains conditional. The monthly `sure-migration-trigger-check` cloud routine that watched for a re-evaluation tripwire was stopped 2026-08-30 (Sure's own trial deployment was also deleted, see `majordom-financiar/docs/sessions/2026-W35.md`) — re-evaluate manually if it becomes relevant again.
**Architecture target:** `life-os/` as modular monorepo and platform brand — each service independent, named `majordom-<domain>` (e.g. `majordom-finance`, `majordom-garage`) — see #150

Full architecture + target structure: `majordom-financiar/docs/architecture.md`
Full roadmap (milestones): `majordom-financiar/docs/roadmap.md`
Issue priority: GitHub Milestones + Labels, not a doc — see `majordom-financiar/CLAUDE.md#priority-tracking`

---

## Rules

- **Language:** discussions in Romanian; all code, docs, commits, issues, comments in English
- **Before any code:** `majordom-financiar/docs/architecture.md` + `docs/roadmap.md` (via that project's `CLAUDE.md` routing table)
- **One task per session**; Actual Budget is the source of truth — no financial data in SQLite
- **No personal data in any tracked file or GitHub text** — the repo is public. No real names
  (write "the user"), account names, license plates, Telegram IDs, locations, personal
  domains/hostnames/IPs, personal filesystem paths. Examples must be generic. When in doubt,
  genericize ("the personal domain", "the home LXC"). Real data lives in Actual Budget,
  `memory.db`, `PRIVATE_context.md` and `CLAUDE.local.md` — never duplicate it into docs.
  - Enforced by `scripts/check-private-data.sh` (one regex per category — add a `check` line for a
    new category, don't write a separate checker), run by the pre-commit hook
    (`git config core.hooksPath scripts/hooks`) and by a `PostToolUse` hook after every file edit
    (`majordom-financiar/.claude/settings.json`). History: #213.

---

## Collaboration workflow

Claude = architect, DeepSeek (via Aider, `delegate-by-complexity` skill) = engineer. The full
rules live in `majordom-financiar/CLAUDE.md#collaboration-rules` — not repeated here.
When the user asks only to note a bug or idea → create a GitHub issue and stop.

`opencode-61` as a coordination system was tried 2026-09-13 and reverted 2026-09-14 — see
`~/.claude/skills/delegate-by-complexity/references/decisions.md`.

---

## Financial profile

`majordom-financiar/PRIVATE_context.md` (gitignored). Never copy its content into tracked files.

---

## Priorities

GitHub Milestones + Labels are the only source of truth (`gh issue list --label tier-2`), see
`majordom-financiar/.claude/rules/priority-tracking.md`. Do not keep a priority list in this file.

**Platform sequencing (decided 2026-09-12)** — personal completeness first, packaging last:
1. `vehicle-manager` as a standalone app — ✅ built 2026-09-12 (#261), awaiting the user's review
2. Separate investment/portfolio app (#262) — supersedes Phase D's "portfolio inside Majordom";
   read `tools/standalone-app-playbook.md` first
3. Visual polish across all apps (MoneyMatter as reference)
4. Only then: package for others (generic setup, installer)

Naming/location of new services is still pending #150. History of this decision and of the
Sure/Ghostfolio evaluation: `majordom-financiar/docs/decisions.md` and
`majordom-financiar/docs/sessions/claude-md-archive.md`.
