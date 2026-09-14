---
title: Self-Hosting
description: Deploy Majordom Financiar on your own server with Docker Compose.
---

## Prerequisites

- A machine that runs 24/7 (Linux recommended)
- [Docker](https://docs.docker.com/get-docker/) + [Docker Compose](https://docs.docker.com/compose/install/)
- ~7 GB disk for the AI model (if using local Ollama)
- 16 GB RAM recommended if running the local model on CPU (8 GB can be tight)
- NVIDIA GPU is optional but speeds up receipt scanning (~3s vs ~60s on CPU)

## Clone and configure

```bash
git clone https://github.com/Dorusto/life-os.git
cd life-os/majordom-financiar
cp .env.example .env
```

Edit `.env` and fill in the required variables:

| Variable | What to set |
|----------|-------------|
| `USER1_USERNAME` / `USER1_PASSWORD` | Your web UI login credentials |
| `JWT_SECRET` | Run `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `ACTUAL_BUDGET_PASSWORD` | Choose any password for Actual Budget |
| `WEB_PORT` | Port for the web UI (default: `3000`) |

## Choose your LLM

- **Local Ollama** (runs on your server, no API key, needs ~7 GB model download): leave `LLM_BASE_URL` as the default `http://ollama:11434` and start with `--profile ollama-local`.
- **Cloud API** (OpenRouter, DeepSeek, or any OpenAI-compatible provider): set `LLM_BASE_URL` and `LLM_API_KEY` in `.env`, and start **without** the `ollama-local` profile.

```bash
# Local Ollama:
docker compose --profile ollama-local up -d

# Cloud API:
docker compose up -d
```

> **Important:** If you're using a cloud API, do **not** add `--profile ollama-local` — it would download and start Ollama unnecessarily.

## Optional profiles

- `--profile vehicle-manager` — adds fuel/vehicle tracking (Fuelio replacement) with its own standalone frontend ("Majordom Transport") on port 3010.
- `--profile investment-manager` — adds portfolio tracking with its own frontend on port 3020.

Both are optional; Majordom works fully without them.

## Set up Actual Budget

1. Open `http://your-server:5006` (see the secure-context note below if this shows a Fatal Error).
2. Create a new budget file (name doesn't matter).
3. Go to **Settings → Advanced** → copy the **Sync ID**.
4. Add it to `.env`:
   ```
   ACTUAL_BUDGET_SYNC_ID=paste-your-sync-id-here
   ```
5. Apply the change — **`restart` does NOT pick up new `.env` values**, only `up -d` recreates the container:
   ```bash
   docker compose up -d majordom-api
   ```

### Secure-context caveat

Actual Budget runs a full SQLite engine in-browser (WebAssembly), which only works in a *secure context* — `https://` or `localhost`. Opening it via a plain `http://` LAN/server IP (e.g. `http://192.168.1.50:5006`) shows a **"Fatal Error: SharedArrayBuffer"** screen. If you're not already accessing your server over HTTPS or Tailscale, use an SSH tunnel for this step:

```bash
ssh -L 5006:localhost:5006 your-server
```

Then open `http://localhost:5006`.

## Ports

| Service | Port | Notes |
|---------|------|-------|
| Web UI | `3000` (or `WEB_PORT`) | Main app |
| Actual Budget | `5006` | Internal, not exposed by default |
| sqlite-web | `8888` | Database viewer (loopback only) |
| Vehicle Manager web | `3010` (or `VEHICLE_MANAGER_WEB_PORT`) | Optional |
| Investment Manager web | `3020` (or `INVESTMENT_MANAGER_WEB_PORT`) | Optional |

## Troubleshooting

**Web app shows blank or "Cannot connect"**
```bash
docker compose logs majordom-api --tail=50
docker compose logs majordom-web --tail=20
```

**Receipt scanning is slow (~60s)**
Normal on CPU. If you have an NVIDIA GPU, add GPU access to the `ollama` service in `docker-compose.yml`.

**"No account found" error**
Complete Actual Budget setup and verify `ACTUAL_BUDGET_SYNC_ID` is set in `.env`.

**Ollama models not downloading**
```bash
docker compose logs ollama --tail=50
```
First start downloads ~7 GB. Check disk space and internet connection. Ensure the container has enough RAM (16 GB recommended).

**Check service health:**
```bash
docker compose ps
```
All services should show `healthy` before the app works correctly.

---

That's it. Open `http://your-server:3000` and log in with the credentials from `.env`.
