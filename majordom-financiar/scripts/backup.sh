#!/bin/bash
# Majordom — daily backup script
#
# Archives: .env + data/ + Actual Budget Docker volume → single .tar.gz
# Schedule via cron (run as majordom user):
#   0 3 * * * /home/majordom/life-os/majordom-financiar/scripts/backup.sh >> /var/log/majordom-backup.log 2>&1
#
# For remote upload: uncomment ONE section at the bottom of this script.
# Recovery instructions: docs/recovery.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_DIR}/backups"
DATE=$(date +%Y%m%d-%H%M%S)
ARCHIVE_NAME="majordom-${DATE}.tar.gz"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"
KEEP_DAYS=30

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

mkdir -p "$BACKUP_DIR"
log "Starting backup → ${ARCHIVE_NAME}"

# ── 1. Dump Actual Budget Docker volume ─────────────────────────────────────

TMPDIR=$(mktemp -d)
# The alpine container below copies the volume as root, so files under
# $TMPDIR end up root-owned on the host — a plain `rm -rf` as this script's
# (non-root) user fails with "Permission denied" and leaks the tmpdir on
# every run. Clean up via a root container too, same as the copy step.
cleanup() {
  docker run --rm -v "$TMPDIR":/backup alpine rm -rf /backup 2>/dev/null || true
  rm -rf "$TMPDIR" 2>/dev/null || true
}
trap cleanup EXIT

log "Dumping Actual Budget volume (majordom-actual-data)..."
docker run --rm \
  -v majordom-actual-data:/actual-data:ro \
  -v "$TMPDIR":/backup \
  alpine sh -c "cp -a /actual-data/. /backup/actual-volume/"

# ── 2. Create archive ────────────────────────────────────────────────────────

log "Creating archive..."
tar czf "$ARCHIVE_PATH" \
  -C "$PROJECT_DIR" \
  .env \
  data/ \
  -C "$TMPDIR" \
  actual-volume/

SIZE=$(du -sh "$ARCHIVE_PATH" | cut -f1)
log "Archive created: ${ARCHIVE_PATH} (${SIZE})"

# ── 3. Local rotation ────────────────────────────────────────────────────────

find "$BACKUP_DIR" -name "majordom-*.tar.gz" -mtime +${KEEP_DAYS} -delete
REMAINING=$(find "$BACKUP_DIR" -name "majordom-*.tar.gz" | wc -l)
log "Local rotation: kept last ${KEEP_DAYS} days (${REMAINING} archives)"

# ── 4. Remote upload — uncomment ONE option ──────────────────────────────────

# ┌─ Option A: Google Drive via rclone ───────────────────────────────────────┐
# │ Setup:                                                                     │
# │   apt install rclone                                                       │
# │   rclone config   ← follow prompts, create remote named "gdrive"          │
# │   rclone lsd gdrive:   ← verify access                                    │
# └───────────────────────────────────────────────────────────────────────────┘
# GDRIVE_REMOTE="gdrive:majordom-backups"
# rclone copy "$ARCHIVE_PATH" "$GDRIVE_REMOTE/"
# rclone delete --min-age ${KEEP_DAYS}d "$GDRIVE_REMOTE/"  # rotate remote too
# log "Uploaded to Google Drive (${GDRIVE_REMOTE})"

# ┌─ Option B: Nextcloud via rclone (WebDAV) ─────────────────────────────────┐
# │ Setup:                                                                     │
# │   rclone config  ← type: WebDAV, URL: https://<nextcloud>/remote.php/dav  │
# │   Remote name: "nextcloud"                                                 │
# └───────────────────────────────────────────────────────────────────────────┘
# NC_REMOTE="nextcloud:majordom-backups"
# rclone copy "$ARCHIVE_PATH" "$NC_REMOTE/"
# rclone delete --min-age ${KEEP_DAYS}d "$NC_REMOTE/"
# log "Uploaded to Nextcloud (${NC_REMOTE})"

# ┌─ Option C: Another LXC on Proxmox via rsync + SSH ────────────────────────┐
# │ Setup (from majordom user on this LXC):                                   │
# │   ssh-keygen -t ed25519 -C "majordom-backup"                              │
# │   ssh-copy-id backup-user@<backup-lxc-ip>                                 │
# └───────────────────────────────────────────────────────────────────────────┘
# BACKUP_HOST="10.10.1.XX"
# BACKUP_USER="backup"
# BACKUP_PATH="/backups/majordom/"
# ssh "${BACKUP_USER}@${BACKUP_HOST}" "mkdir -p ${BACKUP_PATH}"
# rsync -az "$ARCHIVE_PATH" "${BACKUP_USER}@${BACKUP_HOST}:${BACKUP_PATH}"
# log "Uploaded to backup LXC (${BACKUP_HOST}:${BACKUP_PATH})"

# ┌─ Option D: Hetzner Storage Box via rsync + SSH ───────────────────────────┐
# │ Setup: add SSH key in Hetzner Robot → Storage Box → SSH Keys              │
# └───────────────────────────────────────────────────────────────────────────┘
# HETZNER_USER="uXXXXXX"
# HETZNER_HOST="${HETZNER_USER}.your-storagebox.de"
# ssh "${HETZNER_USER}@${HETZNER_HOST}" "mkdir -p backup/majordom"
# rsync -az "$ARCHIVE_PATH" "${HETZNER_USER}@${HETZNER_HOST}::backup/majordom/"
# log "Uploaded to Hetzner Storage Box"

log "Backup complete."
