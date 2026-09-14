# Task: Write Majordom Finance — User Guide: Accounts

## Source app / repo path
majordom-financiar

## Target doc file(s)
`../docs-site/src/content/docs/finance/user-guide/accounts.md` — relative to `majordom-financiar/`.
Launch Aider from `majordom-financiar/`.

## Context
The Accounts tab lists every Actual Budget account, groups them, and drills down into a single
account.

## Goal
A reader can find an account, understand the grouping, link a vehicle-tagged account to a vehicle
profile, and read the account detail page.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Accounts.tsx | Account list, grouping, vehicle section, add/link vehicle |
| frontend/src/pages/AccountDetail.tsx | Single-account page: balance, Details/Transactions tabs, type editing |
| frontend/src/components/vehicles/EditVehicleModal.tsx | Add-vehicle modal |
| frontend/src/components/vehicles/LinkVehicleSheet.tsx | Link an account to an existing vehicle profile |
| frontend/src/lib/vehicleValueApi.ts | Vehicle list used to match accounts to vehicles |

## Content required
- The total across all accounts, and the three groups: Vehicles, On budget, Off budget.
- The account row: icon by account type, name, balance; tapping opens the account detail page.
- The Vehicles section: the vehicle subtotal, the "Add vehicle" button, and the vehicle row showing
  make/model/year when linked, or "Not linked to a vehicle profile — tap to link" when not.
- The link flow: what the LinkVehicleSheet does and what happens when there are no unlinked vehicles.
- The account detail page: the balance header, the Details tab (budget on/off, category/account type
  with inline editing and the list of available types), and the Transactions tab (that account's
  transactions grouped by month with a net total per month, and the empty state).
- A note that account data comes from Actual Budget and is not edited here beyond the account type.

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
--file ../docs-site/src/content/docs/finance/user-guide/accounts.md
--read frontend/src/pages/Accounts.tsx
--read frontend/src/pages/AccountDetail.tsx
--read frontend/src/components/vehicles/EditVehicleModal.tsx
--read frontend/src/components/vehicles/LinkVehicleSheet.tsx
--read frontend/src/lib/vehicleValueApi.ts

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
