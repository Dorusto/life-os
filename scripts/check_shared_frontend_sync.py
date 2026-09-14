#!/usr/bin/env python3
"""
Pre-commit check: the per-app copies of the shared frontend utilities must match, byte for byte,
what scripts/sync-shared-frontend.sh would generate from the source of truth in
packages/frontend-shared/src/.

Why this exists: tools/vehicle-manager's formatCurrency.ts/formatDate.ts started life as a
verbatim copy of majordom-financiar's files (2026-09-12). Two copies of the same code drift —
someone fixes a formatting bug in one app and the other silently keeps the old behaviour, which
is exactly the class of defect majordom-financiar's formatCurrency.ts header already documents
(four competing number conventions on one screen). The copies now stay generated, and this makes
the "don't hand-edit a generated file" rule mechanical instead of a code-review reminder.

The copies keep their existing src/lib/ paths so no import site has to change — only their
content is generated (shared source + a GENERATED FILE banner).

To bypass in emergencies: git commit --no-verify
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

SHARED_DIR = REPO_ROOT / "packages/frontend-shared/src"
SYNC_SCRIPT = "scripts/sync-shared-frontend.sh"

FILES = ("formatCurrency.ts", "formatDate.ts")

# Deliberately excludes tools/investment-manager — its format.ts is a separate, independently
# shaped module, not a generated copy of anything here.
TARGET_APPS = ("majordom-financiar/frontend", "tools/vehicle-manager/frontend")


def banner_for(filename: str) -> bytes:
    """The exact banner scripts/sync-shared-frontend.sh prepends, as raw bytes."""
    return (
        f"// GENERATED FILE — do not edit directly. Source: packages/frontend-shared/src/{filename}.\n"
        f"// Run {SYNC_SCRIPT} after editing the source, then commit both.\n"
        "\n"
    ).encode("utf-8")


def expected_bytes(filename: str) -> bytes:
    """What the sync script would write for *filename* — computed, never written."""
    return banner_for(filename) + (SHARED_DIR / filename).read_bytes()


def main() -> int:
    stale: list[str] = []

    for filename in FILES:
        expected = expected_bytes(filename)
        for app in TARGET_APPS:
            target = REPO_ROOT / app / "src/lib" / filename
            actual = target.read_bytes() if target.exists() else None
            if actual != expected:
                stale.append(str(target.relative_to(REPO_ROOT)))

    if not stale:
        return 0

    print("🛑 BLOCKED — generated frontend utility copies have drifted from their source:")
    for path in stale:
        print(f"  - {path}")
    print(
        "\nThese files are generated from packages/frontend-shared/src/ — never edit them\n"
        "directly. Run scripts/sync-shared-frontend.sh, then git add and commit the result.\n"
        "   Emergency bypass: git commit --no-verify"
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
