# Proposal: unified shell + single login across Majordom apps

**Status:** open — exploratory, not a closed decision
**Date:** 2026-09-24
**Related:** #150 (naming), #261 (vehicle-manager), #262 (investment app), `tools/standalone-app-playbook.md` §2.2

## Problem

Finance, vehicle-manager and the upcoming investment app are independent services, each with its own frontend and its own login (per-app JWT, playbook §2.2). In daily use this feels like switching between three applications.

## Goal

One experience: log in once, move between modules as if they were add-ons of a single app. Services stay independent and separately deployable.

## Proposed changes

1. **Single JWT issuer.** Login lives in one place (majordom-finance or a small auth service). Other apps only validate the token (shared key, or RS256 with a distributed public key). `X-Service-Token` for internal service-to-service calls stays unchanged.
2. **Same origin via a gateway Nginx.**
   - Frontends: `/finance`, `/garage`, `/invest`
   - APIs: `/api/finance/`, `/api/garage/`, `/api/invest/` (extends the existing `/api/` prefix rule)
   - Same origin → shared token storage, no re-login, no CORS.
3. **Shared shell in `packages/frontend-shared`:** header, app switcher, theme, `AuthContext` — identical in every app.
4. **One PWA manifest at root scope**, so the phone installs one app, not three.

Optional later: merge into a single SPA bundle with modules loaded as add-ons. Not required for the unified feel.

## Timing

- Before #262 starts, so the investment app does not build its own login only to remove it later; or
- As part of sequencing step 3 ("visual polish across all apps").

## Decisions needed

- [ ] Replace playbook §2.2 (per-app login) with the single-issuer model → log in `decisions.md` if accepted
- [ ] Auth issuer: majordom-finance vs dedicated auth service
- [ ] Token signing: shared secret (HS256) vs RS256 public key
- [ ] Path names depend on #150
