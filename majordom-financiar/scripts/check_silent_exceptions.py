#!/usr/bin/env python3
"""
Pre-commit check: an `except` handler whose body reduces to just `pass`,
`continue`, or `return None` — with no log call anywhere in the handler —
swallows the exception without leaving any trace (#217).

This project's documented bug pattern is overwhelmingly "failed silently"
(architecture.md rules 12/14/15/17/21/22 all document a silent failure that
was found and fixed after the fact). #217 fixed the 12 instances found by
the 2026-08-29 audit (which had, by the time of the fix, drifted to 32 —
more had been added since, and the audit's own line numbers had shifted).
Fixing instances by hand has not stopped new ones appearing (see
decisions.md#174-code-audit, commit 091f6c8, and #217 itself) — this script
is the mechanism that was missing: every future PR gets checked, not just
whichever files happen to get audited next.

A handler counts as silent only if it swallows AND has no log call — a
handler that logs (at any level) before its `pass`/`continue`/`return None`
is fine; the log is the trace #217 is about. A handler with real fallback
logic (an assignment, a second try, a raise) doesn't count either — #217's
scope was specifically "no handling on the following line", not every broad
`except Exception`.

To silence a genuine false positive (the log call itself would be wrong —
e.g. a hot per-row loop where even debug-level logging has a real cost),
add `# silent-ok: <reason>` as a comment on the `except` line itself.

Known scope limits (deliberate, not oversights — flagged by pre-commit-review
during #217): a handler whose body is an `if/else` with `pass` in both
branches, or that does `return False`/`return <non-None literal>` with no
logging, is NOT flagged — only a body that reduces to a bare
`pass`/`continue`/`return None` (or `return` with no value) counts as a
trivial swallow. Widening this would need real control-flow analysis inside
the handler body, not just a body-length check.
"""
import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG_METHODS = {"debug", "info", "warning", "warn", "error", "exception", "critical"}


def _is_log_call(stmt: ast.stmt) -> bool:
    if not isinstance(stmt, ast.Expr) or not isinstance(stmt.value, ast.Call):
        return False
    func = stmt.value.func
    return isinstance(func, ast.Attribute) and func.attr in LOG_METHODS


def _is_trivial_swallow(stmt: ast.stmt) -> bool:
    if isinstance(stmt, (ast.Pass, ast.Continue)):
        return True
    if isinstance(stmt, ast.Return):
        return stmt.value is None or (isinstance(stmt.value, ast.Constant) and stmt.value.value is None)
    return False


def find_silent_handlers(path: Path) -> list[int]:
    try:
        tree = ast.parse(path.read_text(), filename=str(path))
    except SyntaxError:
        return []
    source_lines = path.read_text().splitlines()

    findings = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.ExceptHandler):
            continue
        if any(_is_log_call(s) for s in node.body):
            continue
        if not all(_is_trivial_swallow(s) for s in node.body):
            continue
        except_line = source_lines[node.lineno - 1] if node.lineno <= len(source_lines) else ""
        if "silent-ok:" in except_line:
            continue
        findings.append(node.lineno)
    return findings


def main() -> int:
    all_findings: dict[str, list[int]] = {}
    for path in sorted((ROOT / "backend").rglob("*.py")):
        lines = find_silent_handlers(path)
        if lines:
            all_findings[str(path.relative_to(ROOT))] = lines

    if not all_findings:
        print("✅ No silent exception swallows found.")
        return 0

    total = sum(len(v) for v in all_findings.values())
    print(f"⚠️  {total} silent exception swallow(s) found (#217) — log at debug with the reason it's safe to ignore, or add '# silent-ok: <reason>' on the except line:")
    for path, lines in all_findings.items():
        print(f"  {path}: lines {', '.join(str(l) for l in lines)}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
