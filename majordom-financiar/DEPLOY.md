# Deploying Majordom

Three deployment paths — pick the one that matches your setup:

1. **[Proxmox LXC](#proxmox-lxc)** — for self-hosters running Proxmox. Docker inside an unprivileged LXC.
2. **[Plain Docker Compose](#plain-docker-compose)** — any Linux machine with Docker installed.
3. **[Coolify](#coolify)** — GUI-based, handles builds and HTTPS automatically.

---

## Proxmox LXC

### 0. Create a dedicated user

Before anything else, create a non-root user. Ubuntu 24.04 disables root SSH by default, and cloning the repo as root causes permission issues when switching users later.

```bash
adduser majordom
usermod -aG sudo,docker majordom
```

Work as this user for everything that follows. Log in with `su - majordom` or via SSH.

### 1. Create the LXC container

In the Proxmox web UI:

- **Template:** Ubuntu 24.04
- **RAM:** 8192 MB minimum (16384 recommended for larger models)
- **Disk:** 40 GB minimum
- **CPU:** 6 cores minimum (10+ recommended for acceptable inference speed)

After creation, **before starting**, open the LXC config and add:

```
# /etc/pve/lxc/<ID>.conf
features: nesting=1
```

Without `nesting=1`, Docker will not work inside the LXC.

Start the container and open a shell (`pct enter <ID>` or the Proxmox console).

### 2. Install Docker

```bash
apt update && apt install -y curl
curl -fsSL https://get.docker.com | sh
```

**Enable Docker autostart on boot** — required, otherwise containers won't start after a reboot:

```bash
sudo systemctl enable docker
```

Verify:

```bash
docker run --rm hello-world
```

### 3. Clone the repository

```bash
git clone https://github.com/Dorusto/life-os.git
cd life-os/majordom-financiar
```

### 4. Configure

```bash
cp .env.example .env
nano .env
```

Minimum required values:

```env
USER1_USERNAME=yourname
USER1_PASSWORD=a_strong_password
JWT_SECRET=                        # generate: python3 -c "import secrets; print(secrets.token_hex(32))"
ACTUAL_BUDGET_PASSWORD=another_strong_password
ACTUAL_BUDGET_SYNC_ID=             # fill after first boot — see step 6

# Ollama — point to your external server (the machine with your GPU):
OLLAMA_URL=http://192.168.x.x:11434
OLLAMA_VISION_MODEL=qwen2.5vl:7b
OLLAMA_CHAT_MODEL=qwen2.5:7b
```

> **No GPU in the LXC?** That's fine — set `OLLAMA_URL` to an external machine that runs Ollama (e.g. your desktop with a GPU). Start Majordom without the ollama profile and it will use the remote server.
>
> **GPU available on this host?** Use `--profile ollama-local` in step 5 to start Ollama inside Docker.

### 5. Start

**With external Ollama (most common — Ollama runs on another machine with GPU):**

```bash
docker compose up -d
```

**With Ollama running locally in Docker (CPU only, slower):**

```bash
docker compose --profile ollama-local up -d
```

**With Ollama locally + NVIDIA GPU:**

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile ollama-local up -d
```

> **Important:** only use one Ollama option. If `OLLAMA_URL` points to an external server, do not use `--profile ollama-local`. See `.env.example` for details.

Check status:

```bash
docker compose ps
```

All services should reach `healthy` within 1–2 minutes. The `majordom-web` and `majordom-api` services start quickly; `actual-budget` takes ~20 seconds.

### 6. Set up Tailscale (required before Actual Budget)

Actual Budget requires a secure context (HTTPS or localhost) to open in a browser. The easiest solution is Tailscale — it creates an encrypted tunnel and gives your LXC an IP accessible from anywhere without certificates.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
```

After connecting, note the Tailscale IP of the LXC (e.g. `100.x.x.x`) or use your local network IP if Tailscale is configured as a subnet router.

> **No Tailscale?** Use an SSH tunnel from your PC instead:
> ```bash
> ssh -L 5007:localhost:5006 majordom@<LXC-IP>
> ```
> Leave the terminal open and open `http://localhost:5007` — localhost counts as a secure context.

### 7. Set up Actual Budget

1. Open `http://<LXC-Tailscale-IP>:5006` in your browser
2. Create a new budget (name doesn't matter)
3. Go to **Settings → Advanced** → copy the **Sync ID**
4. Edit `.env`: set `ACTUAL_BUDGET_SYNC_ID=<your-sync-id>`
5. Apply the change: `docker compose up -d majordom-api` (not `restart` — that doesn't re-read `.env`)

### 8. Access the app

Open `http://<LXC-Tailscale-IP>:3000` in your browser. Log in with the username and password from `.env`.

---

## Plain Docker Compose

Same as Proxmox LXC from step 3 onwards. Install Docker with:

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable docker
```

Then follow steps 3–8 above.

### Updates

```bash
git pull
docker compose up -d --build
```

---

## Coolify

[Coolify](https://coolify.io/) manages Docker Compose deployments through a web UI with automatic HTTPS.

### Prerequisites

- A Coolify instance (see [Coolify installation guide](https://coolify.io/docs/installation))
- A domain or subdomain pointed at your server

### Steps

1. **New Resource → Docker Compose**
   - Source: Git repository (your fork or the upstream repo)
   - Docker Compose file: `docker-compose.coolify.yml`

2. **Set environment variables** in Coolify's editor (same values as `.env.example`)

3. **Deploy** — first deploy takes 5–15 minutes (model downloads + frontend build)

4. **Set up Actual Budget** — follow step 6 from the Proxmox guide above

> **GPU note:** If your Coolify host has an NVIDIA GPU, uncomment the `deploy.resources` section in `docker-compose.coolify.yml`.

---

## Backup

Majordom's persistent data:

| What | Where | How to back up |
|------|-------|----------------|
| Actual Budget files | Docker volume `majordom-actual-data` | See below |
| Merchant memory / CSV profiles | `./data/memory.db` (bind mount) | Copy the file |

### Back up Actual Budget

```bash
docker run --rm \
  -v majordom-actual-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/actual-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### Restore

```bash
docker run --rm \
  -v majordom-actual-data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/actual-backup-20260510.tar.gz -C /data
```

### Automate with cron

```bash
# crontab -e
0 3 * * * cd /path/to/majordom-financiar && \
  docker run --rm -v majordom-actual-data:/data -v $(pwd)/backups:/backup \
  alpine tar czf /backup/actual-$(date +\%Y\%m\%d).tar.gz -C /data . && \
  cp ./data/memory.db ./backups/memory-$(date +\%Y\%m\%d).db && \
  find ./backups -name "*.tar.gz" -mtime +30 -delete && \
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
| `ACTUAL_BUDGET_SYNC_ID` | Yes | — | From Actual Budget → Settings → Advanced |
| `OLLAMA_URL` | No | `http://ollama:11434` | Ollama server URL (local or external) |
| `OLLAMA_VISION_MODEL` | No | `qwen2.5vl:7b` | Model for receipt OCR |
| `OLLAMA_CHAT_MODEL` | No | `qwen2.5:7b` | Model for chat assistant |
| `WEB_PORT` | No | `3000` | External port for the web UI |
| `TELEGRAM_BOT_TOKEN` | No | — | Required only with `--profile telegram` |
| `TELEGRAM_ALLOWED_USER_IDS` | No | — | Comma-separated Telegram user IDs |
