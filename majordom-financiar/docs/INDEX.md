# Majordom — Documentation Index

## For Claude Code — starting a session

| Task type | Read first |
|-----------|-----------|
| Bug in backend/api/ or core/ | `docs/architecture.md#critical-rules` + `docs/sessions/` (grep topic) |
| New feature | `docs/roadmap.md` (current milestone) + `docs/backlog.md` (issue priority) + `docs/architecture.md#main-flows` |
| Refactor | `docs/decisions.md` + `docs/architecture.md` |
| Tool calling / chat | `docs/learn/10-chat-tools.md` + `docs/architecture.md#critical-rules` |
| CSV import | `docs/learn/07-csv-import.md` |
| Actual Budget integration | `docs/learn/04-actual-budget.md` + `docs/architecture.md#critical-rules` |
| Notifications / Web Push | `docs/sessions/2026-W22.md` (Web Push VAPID, APScheduler) |
| Vehicle management | `docs/sessions/2026-W22.md` (M3.x, M4.6 sections) |

**Always start with `CLAUDE.md`** — it has workflow rules, commit protocol, and task-type routing.

---

## For the developer — understanding the code

| I want to understand... | Read |
|------------------------|------|
| Why all code is async | `docs/learn/01-async.md` |
| How AI Vision works (receipt OCR) | `docs/learn/02-ollama-vision.md` |
| How categorization works | `docs/learn/03-categorization.md` |
| How Actual Budget is integrated | `docs/learn/04-actual-budget.md` |
| How Docker services communicate | `docs/learn/05-docker.md` |
| How config/settings work | `docs/learn/06-config.md` |
| How CSV import works | `docs/learn/07-csv-import.md` |
| Why transfers are complex | `docs/learn/08-transfers.md` |
| The v2 web architecture | `docs/learn/09-web-ui-v2.md` |
| How chat tool-calling works | `docs/learn/10-chat-tools.md` |
| The onboarding state machine | `docs/learn/11-onboarding.md` |
| Why the project is structured this way | `docs/learn/12-dev-strategy.md` |
| How to start working on the next task | `docs/learn/13-starting-a-task.md` |

---

## Quick reference

- **What's next to build** → `docs/backlog.md` (issue priority) · `docs/roadmap.md` (milestones)
- **Why was X decided this way** → `docs/decisions.md`
- **What did we fix last week** → `docs/sessions/INDEX.md`
- **Critical rules (never break)** → `docs/architecture.md#critical-technical-rules`
- **Project file structure** → `docs/architecture.md#project-structure`
- **Dev workflow gaps + ops priorities** → `docs/dev-workflow.md`
- **Disaster recovery (LXC rebuild)** → `docs/recovery.md`
- **Backup script** → `scripts/backup.sh`
