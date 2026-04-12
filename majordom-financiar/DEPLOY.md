# Deploying Majordom

This guide covers deploying Majordom to a self-hosted server. Two paths:

1. **[Coolify](#coolify)** — recommended for most people. GUI-based, handles builds, restarts, and HTTPS.
2. **[Plain Docker Compose](#plain-docker-compose)** — for those who prefer full control via SSH.

Both result in the same running application. The difference is how you manage it.

---

## Coolify

[Coolify](https://coolify.io/) is a self-hosted Heroku alternative that manages Docker Compose deployments through a web UI. If you already have a Coolify instance, deploying Majordom takes about 10 minutes.

### Prerequisites

- A Coolify instance (see [Coolify installation guide](https://coolify.io/docs/installation))
- A server with at least 4 GB RAM and 20 GB disk
- A domain or subdomain pointed at your server (for HTTPS)

### Steps

#### 1. Create a new resource in Coolify

In the Coolify dashboard:
- **New Resource → Docker Compose**
- Source: **Git repository** (point to your fork or the upstream repo)
- **Docker Compose file:** `docker-compose.coolify.yml`

#### 2. Set environment variables

In Coolify's environment variable editor, set all required variables from `.env.example`:

```env
# Required
USER1_USERNAME=yourname
USER1_PASSWORD=a_strong_password
JWT_SECRET=run: python3 -c "import secrets; print(secrets.token_hex(32))"
ACTUAL_BUDGET_PASSWORD=another_strong_password
ACTUAL_BUDGET_SYNC_ID=            # fill after first boot (see step 4)

# Ollama models (defaults are fine)
OLLAMA_VISION_MODEL=qwen2.5vl:7b
OLLAMA_CHAT_MODEL=qwen2.5:7b

# Optional second user
USER2_USERNAME=partner
USER2_PASSWORD=another_password

# Optional Telegram bot
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_IDS=
```

> **Note on GPU:** If your Coolify host has an NVIDIA GPU and the NVIDIA Container Toolkit is installed, uncomment the `deploy.resources` section in `docker-compose.coolify.yml` for faster OCR.

#### 3. Deploy

Click **Deploy**. The first deploy downloads Ollama models (~5-6 GB) and builds the frontend — this takes 5–15 minutes depending on your connection. Subsequent deploys are much faster.

#### 4. Set up Actual Budget

Once the `actual-budget` service is running:

1. Open `https://your-domain/budget` (or the port Coolify exposed it on)
2. Create a new budget file (name doesn't matter)
3. Go to **Settings → Advanced** → copy the **Sync ID**
4. In Coolify, add `ACTUAL_BUDGET_SYNC_ID=<your-sync-id>` to the environment variables
5. Redeploy the `majordom-api` service

#### 5. Access the app

Your web app is available at the domain/port Coolify assigned to the `majordom-web` service.

---

## Plain Docker Compose

### On your server

```bash
# Clone the repository
git clone https://github.com/Dorusto/life-os.git
cd life-os/majordom-financiar

# Configure
cp .env.example .env
nano .env   # fill in required values

# Start
docker compose up -d

# Check health
docker compose ps
```

Wait for all services to report `healthy`. First start takes 5–15 minutes (Ollama model downloads).

Then follow **steps 4–5** from the Coolify guide above (Actual Budget sync ID setup).

### Updates

```bash
git pull
docker compose up -d --build
```

---

## Secure remote access with Tailscale

If you don't want to expose Majordom to the public internet, [Tailscale](https://tailscale.com/) is the cleanest option:

1. Install Tailscale on both your server and your phone/laptop
2. Access Majordom via the Tailscale IP (`http://100.x.x.x:3000`)
3. No port forwarding, no HTTPS certificate needed, no exposure

This is how the author runs it. HTTPS from Coolify is nice too, but Tailscale means zero attack surface.

---

## Backup strategy

Majordom's data lives in two places:

| What | Where | How to back up |
|------|-------|----------------|
| Actual Budget files | Docker volume `majordom-actual-data` | See below |
| Learned categories / CSV profiles | Docker volume via `./data` bind mount | Copy `./data/memory.db` |

### Back up Actual Budget data

```bash
# Export the volume to a tar archive
docker run --rm \
  -v majordom-actual-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/actual-backup-$(date +%Y%m%d).tar.gz -C /data .
```

Restore:

```bash
docker run --rm \
  -v majordom-actual-data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/actual-backup-20251201.tar.gz -C /data
```

### Automate with cron

```bash
# Add to crontab (crontab -e)
0 3 * * * cd /path/to/majordom-financiar && \
  docker run --rm -v majordom-actual-data:/data -v $(pwd)/backups:/backup \
  alpine tar czf /backup/actual-$(date +\%Y\%m\%d).tar.gz -C /data . && \
  cp ./data/memory.db ./backups/memory-$(date +\%Y\%m\%d).db
```

Keep 30 days of backups:

```bash
# Add after the backup command above
find ./backups -name "*.tar.gz" -mtime +30 -delete
find ./backups -name "*.db" -mtime +30 -delete
```

---

## Environment variable reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `USER1_USERNAME` | Yes | — | Web UI login username |
| `USER1_PASSWORD` | Yes | — | Web UI login password |
| `USER2_USERNAME` | No | — | Second user (partner) |
| `USER2_PASSWORD` | No | — | Second user password |
| `JWT_SECRET` | Yes | — | 32-byte hex secret for JWT tokens |
| `ACTUAL_BUDGET_URL` | No | `http://actual-budget:5006` | Internal URL to Actual Budget |
| `ACTUAL_BUDGET_PASSWORD` | Yes | — | Actual Budget file password |
| `ACTUAL_BUDGET_SYNC_ID` | Yes | — | From Actual Budget Settings → Advanced |
| `OLLAMA_URL` | No | `http://ollama:11434` | Internal URL to Ollama |
| `OLLAMA_VISION_MODEL` | No | `qwen2.5vl:7b` | Model for receipt OCR |
| `OLLAMA_CHAT_MODEL` | No | `qwen2.5:7b` | Model for chat assistant |
| `WEB_PORT` | No | `3000` | External port for web UI |
| `TELEGRAM_BOT_TOKEN` | No | — | Required only if using Telegram bot |
| `TELEGRAM_ALLOWED_USER_IDS` | No | — | Comma-separated Telegram user IDs |
