#!/usr/bin/env bash
# Regenerates the per-app copies of the small pure utilities whose source of truth lives in
# packages/frontend-shared/src/. Each consuming app keeps its copy at its existing
# src/lib/ path (so no import site has to change), but the copy is generated: the shared source
# prefixed with a "GENERATED FILE" banner.
#
# Run from anywhere (the cd below anchors it to the repo root) after editing a file in
# packages/frontend-shared/src/, then commit both the source and the regenerated copies.
# scripts/check_shared_frontend_sync.py (wired into the pre-commit hook) fails the commit if you
# forget.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

SHARED_DIR="packages/frontend-shared/src"
FILES=(formatCurrency.ts formatDate.ts)
# tools/investment-manager is deliberately NOT here — its format.ts is a separate, independently
# shaped module, not a copy of these.
TARGET_APPS=(majordom-financiar/frontend tools/vehicle-manager/frontend)

for filename in "${FILES[@]}"; do
    source_file="$SHARED_DIR/$filename"
    for app in "${TARGET_APPS[@]}"; do
        target="$app/src/lib/$filename"
        {
            echo "// GENERATED FILE — do not edit directly. Source: $source_file."
            echo "// Run scripts/sync-shared-frontend.sh after editing the source, then commit both."
            echo
            cat "$source_file"
        } > "$target"
        echo "synced -> $target"
    done
done
