# Dev Workflow Audit
> Last updated: June 2026

A snapshot of what works, what's missing, and what to do next — in priority order.

---

## What's working well

- **Stack** — FastAPI + React PWA + Actual Budget + SQLite: clear separation of concerns
- **Code rules enforced** — `CLAUDE.md` keeps Claude Code and DeepSeek consistent
- **Data separation** — financial data in Actual Budget, conversational memory in SQLite, never mixed
- **Documentation** — architecture, decisions, sessions, roadmap, deploy guide all exist and are maintained
- **Auto-deploy** — push to `main` → GitHub Actions → self-hosted runner → `docker compose up` (no exposed ports, no external credentials)
- **Healthchecks** — all containers have healthchecks, correct startup order, `restart: unless-stopped`

---

## Gaps and priorities

### P0 — Backup not active (data at risk) — issue #95

Backup commands exist in `DEPLOY.md` but are not running. Data in `majordom-actual-data` volume and `memory.db` is unrecovered if the LXC corrupts.

**Fix:** activate cron job on server. See issue #95 for exact command.
**Also related to:** #61 (future: automate during installation)

---

### P1 — Working directly on `main` — issue #96

Every push to `main` deploys immediately. A broken commit goes live with no buffer.

**Fix:** create `dev` branch, merge to `main` only when verified. No workflow changes needed.

---

### P2 — Deploy workflow destroys Actual Budget container — issue #97

`.github/workflows/deploy.yml` runs `docker compose rm -sf actual-budget` on every deploy — unnecessary downtime and needless risk.

**Fix:** remove that line. `docker compose up -d` skips unchanged containers automatically.

---

### P3 — No tests (acceptable for now)

Single user, fast iteration, low cost of a bug. Not worth the maintenance overhead yet.
**When to add:** before distributing to other users.

---

### P4 — No monitoring (acceptable for now)

No uptime alerts. Works fine for personal use.
**When to add:** when running for others or going on a long trip.

---

### P5–P7 — Distribution features (future)

Watchtower + Docker Hub, interactive setup script, smoke test suite — only relevant when distributing to other users.

---

## Action summary

| Priority | What | GitHub issue | When |
|----------|------|-------------|------|
| P0 | Activate daily backup cron | #95 | This week |
| P1 | Create `dev` branch | #96 | 1–2 weeks |
| P2 | Remove `rm actual-budget` from deploy | #97 | With P1 |
| P3 | Smoke tests | — | At distribution |
| P4 | Uptime Kuma monitoring | — | At distribution |
| P5+ | Watchtower, setup script | — | At distribution |
