#!/usr/bin/env bash
# Kept for muscle memory; the implementation lives in scripts/sync_shared_frontend.py.
exec python3 "$(dirname "${BASH_SOURCE[0]}")/sync_shared_frontend.py" "$@"
