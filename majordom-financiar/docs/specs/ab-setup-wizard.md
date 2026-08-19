# AB Setup Wizard — spec

> Draft, not yet scheduled.

## The problem

`actual_budget.py` (via `actualpy`) needs three values to connect to AB: `base_url`, `password`, `file` (budget ID/name). Today these are entered manually (editing `.env` or a config file directly) — error-prone (URL typo, confusing the AB server password with a bank account), with no clear feedback on success or failure.

## What this is not

Not the M2-NEW proactive-onboarding flow (how Majordom infers context from real data once connected). This is the step *before* that — the one-time technical connection to AB at first install.

## Flow

### Step 1 — Auto-detect on first run
On first `docker-compose up`, if Majordom finds no saved AB credentials, it shows the setup screen instead of an empty Home/Chat. The user doesn't need to know where to look for the setting.

### Step 2 — Form with live validation, not blind save
Three fields (`base_url`, `password`, `file`), with two differences from a plain form:
- "Test connection" button before "Save" — calls AB immediately with the entered values, confirms or shows a specific error (server not found, wrong password, budget file doesn't exist), not a generic failure message
- If the user doesn't know the exact `file`, list the budgets available on that server once `base_url`+`password` validate (AB supports listing budget files per server) — removes the guesswork

### Step 3 — Encrypted storage, once
On success, credentials are encrypted (key derived locally, not hardcoded) and saved to `memory.db` or a dedicated table. Never asked again unless the user explicitly changes them from a Settings screen.

### Step 4 — Clear visual confirmation
Explicit success screen ("Connected to AB — [budget name]"), then auto-redirect to Home. Not a silently disappearing form.

## Fallback screen — reconnect

If AB becomes unreachable on a later run (server down, password changed directly on AB), Majordom shows a clear banner on Home ("AB connection lost — Reconnect") that reopens this wizard, instead of silent chat errors.

## Explicitly out of scope

Multiple simultaneous AB accounts (one active budget per Majordom install, as today). Automatic credential migration between installs — each install is configured separately.

## Next step

Basis for a DeepSeek prompt — React component `AbSetupWizard.jsx` + backend endpoint `POST /api/setup/ab-credentials` with live validation via `actualpy` before writing to `memory.db`.
