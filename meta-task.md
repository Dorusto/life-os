# Meta-task: turn 3 codebases into a set of ready-to-dispatch documentation-writing task specs

You are NOT writing any documentation yourself in this task. Your only job is to read the codebases
listed below plus `docs-site/astro.config.mjs` (the sidebar structure already decided — do not
change it), and WRITE ONE FILE: `generated-tasks/docs-specs.md` — containing one complete,
ready-to-dispatch task spec per doc page/group, in the exact format below, separated by the
literal line `===TASK-BREAK===` between specs.

## What this is for

We're building a Starlight (Astro) documentation site, modeled on wealthfolio.app/docs — an
end-user-facing guide (not a developer/API reference; `docs/architecture.md` etc. already cover
that internally, this is different and additive). Audience: the user themselves, using his own apps,
wants a navigable "how does this work / how do I use this" reference, in English.

There are 3 independent apps in this monorepo, each with its OWN source of truth for its own data
— this is a deliberate architecture decision, not an oversight, and every "Concepts" page you spec
must state this accurately, per app:
- **Majordom Finance** (`majordom-financiar/`) — Actual Budget is the source of truth for budget
  categories, accounts, and transactions. Majordom Finance is a conversational layer on top of it.
- **Majordom Transport** (`tools/vehicle-manager/`) — its own database is the source of truth for
  vehicle fuel logs, mileage, reminders, and depreciation data. NOT stored in Actual Budget.
- **Majordom Invest** (`tools/investment-manager/`) — its own database is the source of truth for
  investment holdings, transactions (buys/sells/dividends), and portfolio performance. NOT stored
  in Actual Budget.
A future cross-app "net worth" view may eventually aggregate all three for a combined picture, but
that doesn't exist yet — don't describe it as if it does, just don't contradict that it's a
possible future direction if a Concepts page naturally mentions net worth.

## Codebases to read (this is a big read — budget your attention: skim broadly first via
directory listing / file names, then read deeply only the files clearly relevant to the section
you're specifying)

- `majordom-financiar/` — `frontend/src/pages/`, `frontend/src/components/`, `docs/architecture.md`,
  `docs/product-plan.md` (if present), `README.md`
- `tools/vehicle-manager/` — `frontend/src/pages/`, `frontend/src/components/`, `docs/`, `README.md`
- `tools/investment-manager/` — `frontend/src/pages/`, `frontend/src/components/`, `docs/`,
  `README.md`, `frontend/DESIGN.md` (if present)
- `docs-site/astro.config.mjs` — the sidebar structure (5 sections x 3 apps) already scaffolded;
  each section currently has an empty `index.md` placeholder under
  `docs-site/src/content/docs/<app-slug>/<section-slug>/index.md` (app-slug is `finance`,
  `transport`, or `invest`)

## What goes in each of the 5 sections (per app)

- **Getting Started** — what the app is for, in one paragraph; how the user actually opens/uses it
  today (real URL/port if discoverable from code/docker-compose, not invented); first-run basics.
- **Concepts** — the core mental model: what data it tracks, where that data actually lives (see
  source-of-truth note above), and any non-obvious terms/flows a user needs to understand before
  using the features (e.g. Finance's budget-category model, Invest's XIRR/TWR metrics, Transport's
  fuel-economy calculation).
- **User Guide** — feature-by-feature walkthrough of the actual pages/features that exist in the
  code TODAY (do not document planned/aspirational features from a roadmap doc as if they exist —
  check the actual page components).
- **Self-Hosting** — how this specific app is deployed/run (check `Dockerfile`, `docker-compose`
  references, `.env.example`, `README.md`, `DEPLOY.md` if present at the monorepo root) — keep this
  generic/non-personal (no real hostnames, IPs, personal domains — same privacy rule as the rest of
  this monorepo, see `majordom-financiar/CLAUDE.md`'s "No real names/IPs/domains" rule, it applies
  here too even though this is a different directory).
- **Reference** — FAQ-style short entries + a glossary of the app-specific terms used elsewhere in
  its docs.

## Exact spec format (repeat exactly this structure per spec)

```
# Task: <short title, e.g. "Write Majordom Finance — Getting Started page">

## Source app / repo path
<one of: majordom-financiar | tools/vehicle-manager | tools/investment-manager — the directory
Aider must be launched FROM>

## Target doc file(s)
<path(s) relative to repo root, e.g. docs-site/src/content/docs/finance/getting-started/index.md
— note this path is NOT inside the app's own directory, it's in the sibling docs-site/ folder at
the monorepo root; the executor will need --file pointing at a path with a `../` prefix relative
to its launch directory, OR should be launched from the monorepo root instead — decide and state
which, and give exact relative paths for that choice>

## Context
<1-2 sentences: what this page needs to cover>

## Goal
<what a reader understands/can do after reading this page>

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| path/to/file.tsx | one-line description |

## Content required
<bullet list of the actual sections/topics this page must cover, based on what you found reading
the real code — be specific, not generic ("document the Dashboard's Balance Trend widget and what
its date-range selector does" not "document the Dashboard")>

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
- The target file(s) contain real, accurate content (not the placeholder text), matching what the
  actual code does

## Suggested difficulty tier
Rapid (this is a pure-text/documentation task; if you believe a specific page needs deeper code
archaeology than a single dispatch can reasonably do, split it into two specs instead of upgrading
the tier)

## Dispatch args
--file <target doc file path>
--read <source file 1>
--read <source file 2>

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in
decisions.md/architecture.md, stop and describe the situation in your response instead of
silently picking an undecided option yourself.
```

## Splitting rule

One spec per (app, section) pair is the default — 15 total (3 apps x 5 sections). If a section for
a given app is naturally large (e.g. Finance's User Guide covering many pages: Dashboard, Accounts,
Transactions, Analytics, Chat, Settings), split THAT section into multiple specs (one per page or
logical group), each targeting its own file under that section's directory (e.g.
`finance/user-guide/dashboard.md`, `finance/user-guide/accounts.md`, etc. — Starlight
autogenerates the sidebar from whatever files exist in the directory, so multiple files per section
is fine and expected for the bigger apps).

## Output

Write ONLY to `generated-tasks/docs-specs.md`. Do not write any actual documentation content
yourself, do not modify docs-site/ or any app's source code — that is explicitly out of scope for
this task.
