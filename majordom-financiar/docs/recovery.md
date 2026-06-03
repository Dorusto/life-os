# Majordom — Disaster Recovery Runbook

> Rebuild the entire stack from zero after an LXC failure or hardware replacement.
> Estimated time: **~20 minutes** (with a recent backup).

---

## What you need before you start

| Item | Where to get it |
|------|----------------|
| Backup archive (`majordom-YYYYMMDD.tar.gz`) | Wherever `backup.sh` uploaded it |
| GitHub access | `github.com/Dorusto/life-os` (public repo) |
| Proxmox web UI | Your Proxmox host |
| Tailscale account | `login.tailscale.com` |

If you have no backup: `.env` must be reconstructed manually (see [Lost .env](#lost-env-no-backup)).

---

## Step 1 — Create LXC on Proxmox (5 min)

In Proxmox web UI → Create CT:

| Setting | Value |
|---------|-------|
| Template | Ubuntu 24.04 |
| RAM | 4096 MB minimum (8192 recommended) |
| Disk | 30 GB minimum |
| CPU | 4 cores minimum |

**Before starting the container**, open the LXC config (`/etc/pve/lxc/<ID>.conf`) and add:

```
features: nesting=1
```

Without this, Docker won't work inside the LXC.

Start the container (`pct start <ID>`) and open a shell.

---

## Step 2 — Create user + install Docker (3 min)

```bash
# Create non-root user
adduser majordom
usermod -aG sudo majordom

# Install Docker
apt update && apt install -y curl
curl -fsSL https://get.docker.com | sh
usermod -aG docker majordom

# Enable Docker autostart
systemctl enable docker

# Switch to majordom user for everything that follows
su - majordom
```

Verify Docker works:

```bash
docker run --rm hello-world
```

---

## Step 3 — Clone repository (1 min)

```bash
git clone https://github.com/Dorusto/life-os.git
cd life-os/majordom-financiar
mkdir -p backups
```

---

## Step 4 — Restore from backup (5 min)

### 4a. Get the archive

Copy the archive to the server. From your PC:

```bash
# If you have SSH access to the new LXC:
scp majordom-YYYYMMDD-HHMMSS.tar.gz majordom@<LXC-IP>:~/life-os/majordom-financiar/backups/

# If restoring from another LXC:
rsync -az backup-user@<backup-lxc-ip>:/backups/majordom/majordom-YYYYMMDD-HHMMSS.tar.gz \
  ~/life-os/majordom-financiar/backups/
```

### 4b. Extract the archive

```bash
cd ~/life-os/majordom-financiar
ARCHIVE="backups/majordom-YYYYMMDD-HHMMSS.tar.gz"   # ← replace with actual filename

TMPDIR=$(mktemp -d)
tar xzf "$ARCHIVE" -C "$TMPDIR"
echo "Extracted to: $TMPDIR"
ls "$TMPDIR"
```

You should see: `.env`, `data/`, `actual-volume/`

### 4c. Restore .env

```bash
cp "$TMPDIR/.env" .env
echo "Verify .env contents:"
grep -v PASSWORD .env | grep -v SECRET | grep -v KEY   # shows non-sensitive lines
```

### 4d. Restore data/ (SQLite, VAPID keys, uploads)

```bash
cp -r "$TMPDIR/data/." data/
echo "data/ restored:"
ls -la data/
```

> **VAPID keys** (`vapid_private.pem` + `vapid_public.txt`) are inside `data/`. If restored correctly, existing push subscriptions keep working — users don't need to re-subscribe.

### 4e. Restore Actual Budget volume

```bash
# Create the Docker volume
docker volume create majordom-actual-data

# Restore data from archive
docker run --rm \
  -v majordom-actual-data:/actual-data \
  -v "$TMPDIR":/backup \
  alpine sh -c "cp -a /backup/actual-volume/. /actual-data/"

# Verify
docker run --rm -v majordom-actual-data:/data alpine ls /data
```

### 4f. Cleanup

```bash
rm -rf "$TMPDIR"
```

---

## Step 5 — Start services (2 min)

```bash
cd ~/life-os/majordom-financiar
docker compose up -d
```

Check status (wait ~30 seconds for healthchecks):

```bash
docker compose ps
```

All services should show `healthy` or `running`. If `actual-budget` is unhealthy after 2 minutes:

```bash
docker compose logs actual-budget --tail=30
```

---

## Step 6 — Restore Tailscale (2 min)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
```

Note the new Tailscale IP. Update your phone/browser bookmarks if needed.

> If you had Tailscale auth set up with a key (non-interactive): `tailscale up --auth-key=<key>`.
> Reusable auth keys are in the Tailscale admin panel.

---

## Step 7 — Verify (2 min)

1. Open `http://<LXC-Tailscale-IP>:3000` → log in
2. Check Home screen — accounts and budget data should be present
3. Open `http://<LXC-Tailscale-IP>:5006` → Actual Budget UI should show your budget
4. Send a test chat message: "What's my balance?" → Majordom should respond with real data
5. Check push notifications: if they stopped working, users need to re-subscribe from the browser

---

## Step 8 — Setup cron backup on new server (1 min)

```bash
chmod +x ~/life-os/majordom-financiar/scripts/backup.sh

crontab -e
```

Add:

```
0 3 * * * /home/majordom/life-os/majordom-financiar/scripts/backup.sh >> /var/log/majordom-backup.log 2>&1
```

---

## Lost .env (no backup)

If `.env` is lost, reconstruct manually:

```bash
cp .env.example .env
nano .env
```

Required values to regenerate:

| Variable | How to get it |
|----------|--------------|
| `JWT_SECRET` | `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `ACTUAL_BUDGET_SYNC_ID` | Start AB, open `http://<IP>:5006` → Settings → Advanced → Sync ID |
| `ACTUAL_BUDGET_PASSWORD` | Choose a new one; AB will ask for it on first open |
| Usernames / passwords | Choose new ones |
| `LLM_BASE_URL` / `LLM_API_KEY` | From OpenRouter account or your Ollama server IP |

After filling `.env`, restart the API to pick up the new values:

```bash
docker compose up -d majordom-api
```

> Changing `JWT_SECRET` logs out all users immediately — expected behavior.

---

## Notes

- **VAPID keys lost** → all push subscriptions become invalid. Users need to open the app, allow notifications again, and re-subscribe. No data loss — just UX friction.
- **AB volume only, no data/** → budgets are intact but merchant memory, vehicle log, chat history, and CSV profiles are gone.
- **data/ only, no AB volume** → preferences and vehicle log restored, but all financial data (transactions, budgets, accounts) must be re-imported from CSVs.
- **SSH setup for backup offsite** → tracked in GitHub issue #16.

---

*Last updated: 2026-06-03*
