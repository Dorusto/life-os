#!/usr/bin/env bash
# Minimal pass/fail check for the local dev stack — not a test suite.
# Gives Claude (and delegated Aider diffs) one command that returns a real
# signal instead of "looks done". Runs against the local docker-compose
# stack on fixture data; never point it at the real-data LXC.
#
# Usage: scripts/smoke-test.sh [--no-frontend]
# Exit code 0 = all checks passed.

set -uo pipefail
cd "$(dirname "$0")/.."

API="${SMOKE_API_URL:-http://localhost:3000/api}"
FAILED=0
pass() { printf '  \033[0;32mPASS\033[0m %s\n' "$1"; }
fail() { printf '  \033[0;31mFAIL\033[0m %s\n' "$1"; FAILED=$((FAILED + 1)); }

echo "== Static checks"
# Syntax-only compile, no .pyc writes (backend/__pycache__ is owned by the container user).
if python3 -c 'import pathlib,sys; [compile(f.read_text(), str(f), "exec") for f in pathlib.Path("backend").rglob("*.py")]'; then pass "backend compiles"; else fail "backend compiles"; fi
if python3 scripts/check_provider_wiring.py >/dev/null 2>&1; then pass "provider wiring"; else fail "provider wiring (run scripts/check_provider_wiring.py)"; fi
if [[ "${1:-}" != "--no-frontend" ]]; then
    if (cd frontend && ./node_modules/.bin/tsc --noEmit -p . >/dev/null 2>&1); then pass "frontend typecheck"; else fail "frontend typecheck (cd frontend && npx tsc --noEmit)"; fi
fi

echo "== Local stack ($API)"
# Credentials come from the gitignored .env — never hardcode them here.
env_get() { grep -m1 "^$1=" .env 2>/dev/null | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
AB_URL=$(env_get ACTUAL_BUDGET_URL)
if [[ -n "$AB_URL" && "$AB_URL" != *actual-budget* ]]; then
    fail "ACTUAL_BUDGET_URL does not point at the local container — refusing to run API checks"
    exit 1
fi

if ! curl -sf -o /dev/null "$API/health"; then
    fail "health endpoint unreachable — is the stack up? (docker compose up -d)"
    echo "$FAILED check(s) failed"; exit 1
fi
pass "health"

USER=$(env_get USER1_USERNAME); PASS=$(env_get USER1_PASSWORD)
TOKEN=$(curl -sf -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"username":sys.argv[1],"password":sys.argv[2]}))' "$USER" "$PASS")" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null)
if [[ -z "$TOKEN" ]]; then fail "login"; echo "$FAILED check(s) failed"; exit 1; fi
pass "login"

# Read-only endpoints that exercise the Actual Budget path end to end.
for path in home home/budget-period?period=month home/budget-period?period=3m accounts categories transactions schedules budget-pacing/status setup/status; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 -H "Authorization: Bearer $TOKEN" "$API/$path")
    if [[ "$code" == 200 ]]; then pass "GET /$path"; else fail "GET /$path -> $code"; fi
done

echo
if [[ $FAILED -eq 0 ]]; then echo "All smoke checks passed."; else echo "$FAILED check(s) failed."; fi
exit $((FAILED > 0))
