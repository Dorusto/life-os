#!/usr/bin/env python3
"""
Pre-commit check: every generated copy of packages/frontend-shared/src/ must match what
scripts/sync_shared_frontend.py would write. Two hand-maintained copies of the same code drift
(one app gets the fix, the other keeps the bug); generating them makes "don't hand-edit a
generated file" mechanical. The manifest lives in sync_shared_frontend.py — one definition.

To bypass in emergencies: git commit --no-verify
"""
import subprocess
import sys
from pathlib import Path

script = Path(__file__).resolve().parent / "sync_shared_frontend.py"
sys.exit(subprocess.run([sys.executable, str(script), "--check"]).returncode)
