# Task: Write Majordom Finance — Self-Hosting page

## Source app / repo path
majordom-financiar

## Target doc file(s)
`../docs-site/src/content/docs/finance/self-hosting/index.md` — relative to `majordom-financiar/`.
Launch Aider from `majordom-financiar/`.

## Context
How this app is deployed: Docker Compose, the optional profiles, the environment variables, and the
Actual Budget setup step.

## Goal
A reader can stand the app up from a clean checkout, and knows which optional services they can skip.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| README.md | Prerequisites, install steps, profiles, troubleshooting |
| .env.example | Every environment variable, grouped and commented |
| docker-compose.yml | Services, profiles, ports, volumes |
| Dockerfile.backend | Backend image build |
| docs/architecture.md | Service layout and internal ports |

## Content required
- Prerequisites: a machine that runs 24/7, Docker + Compose, disk/RAM guidance for the local model.
- Clone and configure: copy `.env.example` to `.env`, and a table of the required variables
  (`USER1_USERNAME`/`USER1_PASSWORD`, `JWT_SECRET`, `ACTUAL_BUDGET_PASSWORD`, `WEB_PORT`) with how to
  generate the secret.
- The LLM choice: local Ollama (`--profile ollama-local`) vs a cloud OpenAI-compatible provider, and
  which command to use for each. Make the "don't add the profile if you're using a cloud API" point
  clearly.
- The optional profiles: `vehicle-manager` and `investment-manager`, and what each adds.
- The Actual Budget setup step: create a budget file, copy the Sync ID, put it in `.env`, and the
  important note that `restart` does not pick up new `.env` values — use `up -d`.
- The secure-context caveat for Actual Budget (https or localhost, otherwise SSH tunnel).
- Ports table: web UI, Actual Budget, sqlite-web, and the optional services' ports.
- A short troubleshooting list: blank web app, slow receipt scanning, "No account found", model
  download, `docker compose ps` health check.
- Keep everything generic — no real hostnames, IPs or domains.

## Style rules
- Starlight/Astro Markdown (.md), frontmatter with `title` and `description`
- Plain English, end-user tone (not developer-facing), matches wealthfolio.app/docs' style: short
  paragraphs, practical, feature-oriented
- No real personal data (names, IPs, hostnames, domains, license plates) — use generic placeholders
- Do not invent features that don't exist in the code

## Do NOT touch
- `docs-site/astro.config.mjs` (sidebar structure, already decided)
- Any other app's doc pages

## Done when
- The target file contains real, accurate content (not the placeholder text), matching what the
  actual code does

## Suggested difficulty tier
Rapid

## Dispatch args
--file ../docs-site/src/content/docs/finance/self-hosting/index.md
--read README.md
--read .env.example
--read docker-compose.yml
--read Dockerfile.backend

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
