# frontend-shared

Source of truth for small pure-utility code shared between the standalone frontend apps in this
monorepo (`majordom-financiar/frontend`, `tools/vehicle-manager/frontend`).

Files in `src/` are the canonical versions. Each consuming app keeps a copy at its own existing
`src/lib/` path (so no import site changes), but those copies are **generated** — never edit them
by hand. Each carries a `GENERATED FILE` banner naming its source.

After changing anything in `src/`, run `scripts/sync-shared-frontend.sh` from the repo root and
commit both the source and the regenerated copies. The pre-commit hook
(`scripts/check_shared_frontend_sync.py`) fails the commit if a generated copy has drifted.

The generated copies are committed like any other source file, so Docker build contexts need no
changes — `docker build` is unaffected by this directory.
