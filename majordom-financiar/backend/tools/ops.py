"""Operational/self-hosting tools (backup visibility, not financial data)."""
from datetime import datetime
from pathlib import Path

from backend.core.config import settings


async def get_backup_status() -> str:
    """
    Report on the daily backup archives produced by scripts/backup.sh
    (read-only mount of ./backups/ into the API container — see settings.backup_dir).
    Read-only: never triggers, modifies, or deletes a backup.
    """
    backup_dir = Path(settings.backup_dir)
    if not backup_dir.is_dir():
        return (
            "No backup directory found — the daily backup cron job may not be set up yet. "
            "See DEPLOY.md's Backup & Recovery section."
        )

    archives = sorted(
        backup_dir.glob("majordom-*.tar.gz"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not archives:
        return (
            "Backup directory exists but has no archives yet — the daily backup cron job "
            "may not be set up yet, or hasn't run for the first time. See DEPLOY.md."
        )

    latest = archives[0]
    latest_mtime = datetime.fromtimestamp(latest.stat().st_mtime)
    latest_size_mb = latest.stat().st_size / (1024 * 1024)
    age = datetime.now() - latest_mtime

    total_size_mb = sum(a.stat().st_size for a in archives) / (1024 * 1024)

    lines = [
        f"**Latest backup:** {latest_mtime.strftime('%Y-%m-%d %H:%M')} ({_format_age(age)} ago), {latest_size_mb:.1f} MB",
        f"**Archives kept:** {len(archives)} (total {total_size_mb:.1f} MB)",
    ]
    if age.days >= 2:
        lines.append(f"⚠️ Last backup was {age.days} days ago — check the cron job on the server.")
    return "\n".join(lines)


def _format_age(age) -> str:
    hours = age.total_seconds() / 3600
    if hours < 1:
        return f"{int(age.total_seconds() / 60)} minutes"
    if hours < 48:
        return f"{hours:.0f} hours"
    return f"{age.days} days"
