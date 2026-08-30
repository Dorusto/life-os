#!/usr/bin/env python3
"""
Pre-commit check: every ActualBudgetClient method actually called through
get_provider() in the LLM tool layer must also exist as a pass-through on
ActualBudgetProvider and be declared on the FinanceProvider Protocol —
otherwise get_provider() raises AttributeError the first time a chat tool
calls it (#126).

Deliberately scoped to every actual call site of get_provider() across
backend/**, NOT every public ActualBudgetClient method — a method that exists
on ActualBudgetClient but is never reached through get_provider() anywhere
can't hit the #126 AttributeError, so checking it would only produce false
positives. A first version of this script checked ALL public
ActualBudgetClient methods and produced exactly that: 14 false positives from
methods that were, at the time, only reachable via backend/api/*.py REST
routes constructing ActualBudgetClient directly instead of going through
get_provider() — narrowed to the get_provider()-only scope below.

That direct-construction bypass was itself a bug, not a design choice — see
architecture.md rule 29's "Superseded 2026-08-30" note. #222 (2026-08-30)
converted all of backend/api/*.py to go through get_provider() too, so this
script's scope now covers them like everywhere else. Note the scope here is
call sites, not files — a file can be fully converted and still correctly
produce zero findings from this script if none of its methods happen to be
new/unwired, which was already normal before #222 for files that only called
already-wired methods.

This gotcha was already written down in plan-feature's known-gotchas list
and is an explicit review item in pre-commit-review.md — neither stopped it
from recurring (the original #126, 2 of 11 methods found by the #174 sweep
and fixed via #148, and 2 fresh misses in one session on 2026-08-28, one
hand-written and one delegated). A documented reminder only helps if someone
remembers to apply it; this script makes the same check mechanical, the same
way check-private-data.sh turned a prose privacy rule into an actual gate.

Exit 0 if every get_provider()-called method is wired through both layers.
Exit 1 and list the gaps otherwise.

To bypass in emergencies: git commit --no-verify
"""
import ast
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

BACKEND_DIR = REPO_ROOT / "backend"

PROVIDER_FILE = REPO_ROOT / "backend/core/finance/actual_budget_provider.py"
PROVIDER_CLASS = "ActualBudgetProvider"

PROTOCOL_FILE = REPO_ROOT / "backend/core/finance/provider.py"
PROTOCOL_CLASS = "FinanceProvider"

CLIENT_FILE = REPO_ROOT / "backend/core/actual_client/client.py"
CLIENT_CLASS = "ActualBudgetClient"


def class_method_names(file: Path, class_name: str) -> set[str]:
    tree = ast.parse(file.read_text(), filename=str(file))
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            return {
                item.name
                for item in node.body
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))
            }
    print(f"ERROR: class {class_name!r} not found in {file}", file=sys.stderr)
    sys.exit(2)


def provider_called_methods(file: Path) -> set[str]:
    """
    Method names called on the result of get_provider() in this file, whether
    assigned to a variable first (`client = get_provider(); client.foo()`)
    or chained directly (`await get_provider().foo()`).
    """
    tree = ast.parse(file.read_text(), filename=str(file))
    provider_vars: set[str] = set()
    called: set[str] = set()

    def is_get_provider_call(node: ast.AST) -> bool:
        return (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "get_provider"
        )

    # Pass 1: find every variable assigned directly from get_provider().
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and is_get_provider_call(node.value):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    provider_vars.add(target.id)

    # Pass 2: find every attribute access on either a provider_vars name or
    # a direct get_provider() call.
    for node in ast.walk(tree):
        if not isinstance(node, ast.Attribute):
            continue
        base = node.value
        if is_get_provider_call(base) or (isinstance(base, ast.Name) and base.id in provider_vars):
            called.add(node.attr)

    return called


def main() -> int:
    provider_methods = class_method_names(PROVIDER_FILE, PROVIDER_CLASS)
    protocol_methods = class_method_names(PROTOCOL_FILE, PROTOCOL_CLASS)
    client_methods = class_method_names(CLIENT_FILE, CLIENT_CLASS)

    all_called: set[str] = set()
    for py_file in BACKEND_DIR.rglob("*.py"):
        all_called |= provider_called_methods(py_file)

    # Only real ActualBudgetClient methods count — filters out unrelated
    # attribute accesses that happen to share a name (dict.get, etc. can't
    # collide since get_provider()'s result is always a FinanceProvider, but
    # keep this as a sanity guard against future refactors).
    all_called &= client_methods

    missing_from_provider = sorted(all_called - provider_methods)
    missing_from_protocol = sorted(all_called - protocol_methods)

    if not missing_from_provider and not missing_from_protocol:
        print(f"✅ FinanceProvider wiring OK — all {len(all_called)} get_provider()-called methods are reachable.")
        return 0

    print("🔍 Checking get_provider()-called methods → ActualBudgetProvider/FinanceProvider wiring...")
    if missing_from_provider:
        print(f"\n🛑 BLOCKED — missing from ActualBudgetProvider pass-through ({PROVIDER_FILE.relative_to(REPO_ROOT)}):")
        for name in missing_from_provider:
            print(f"  - {name}")
    if missing_from_protocol:
        print(f"\n🛑 BLOCKED — missing from FinanceProvider Protocol ({PROTOCOL_FILE.relative_to(REPO_ROOT)}):")
        for name in missing_from_protocol:
            print(f"  - {name}")

    print(
        "\n⚠️  A tool-layer call to get_provider().<method>() that isn't wired through "
        "both layers raises AttributeError the first time it actually runs (#126). "
        "Add the pass-through in ActualBudgetProvider + the declaration in the "
        "FinanceProvider Protocol.\n   Emergency bypass: git commit --no-verify"
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
