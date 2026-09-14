# Task: Write Majordom Transport — Self-Hosting page

## Source app / repo path
tools/vehicle-manager

## Target doc file(s)
`../../docs-site/src/content/docs/transport/self-hosting/index.md` — relative to
`tools/vehicle-manager/`. Launch Aider from `tools/vehicle-manager/`.

## Context
How this service is deployed: standalone with uvicorn, or through the monorepo's Docker Compose
profile.

## Goal
A reader can run the service either way and knows which environment variables it needs.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| README.md | Standalone and Docker run instructions, endpoints, migration script |
| .env.example | Login, JWT secret, service token, callback URL |
| Dockerfile | The image build |
| app/auth.py | How JWT and `X-Service-Token` authentication work |
| app/database.py | The database path and `VEHICLE_DB_PATH` |

## Content required
- The two ways to run it: standalone with `uvicorn` (and the venv/requirements step), or via the
  monorepo's Docker Compose `vehicle-manager` profile.
- The environment variables: this service's own login credentials, its JWT secret, the shared service
  token, and the Majordom callback URL. Explain that the service token must match the value in
  Majordom Finance's `.env`.
- Authentication in one paragraph: every route except `/health` needs either a user JWT or the
  service token.
- The database: SQLite at the configured path, persisted via a Docker volume; how to point it
  elsewhere with `VEHICLE_DB_PATH`.
- The migration script: how to copy existing vehicle data out of Majordom's `memory.db` into this
  service's database, including the "copy the live database first" warning.
- Ports: the backend port and the standalone frontend port.
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
--file ../../docs-site/src/content/docs/transport/self-hosting/index.md
--read README.md
--read .env.example
--read Dockerfile
--read app/auth.py
--read app/database.py

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
