# 05 — Docker Compose — services and networking

## The 3 main services

```yaml
actual-budget:    # Actual Budget UI + DB, port 127.0.0.1:5006:5006
    image: actualbudget/actual-server
    # data persisted in ./data/actual

ollama:           # Local AI inference, port 11434
    image: ollama/ollama
    # models stored in ollama_data volume (persistent)
    # optional: CPU only, or with GPU override via docker-compose.gpu.yml

majordom:         # FastAPI backend + React frontend via Nginx
    build: .
    ports: 3000:3000  # Nginx serves React + proxies /api/ to FastAPI
    depends_on:
      - actual-budget
```

## Service communication

In Docker Compose, services see each other by **service name** as hostname (within `majordom-net` network):
- Backend accesses Actual Budget at `http://actual-budget:5006` (not `localhost:5006`)
- Backend accesses Ollama at `http://ollama:11434` (or external IP if Ollama runs outside Docker)

**Important:** `actual-budget` port is bound to `127.0.0.1:5006`, not `0.0.0.0:5006` — to avoid conflicts with Tailscale which may already use that port on the host.

## Common commands

```bash
# Start all services (web UI only)
docker compose up -d

# Start with local Ollama
docker compose --profile ollama-local up -d

# Rebuild after code changes (backend or frontend)
docker compose build majordom && docker compose up -d majordom

# View logs
docker compose logs majordom --tail=50 -f

# Restart without rebuild (env vars NOT re-read)
docker compose restart majordom

# Force re-read of .env changes
docker compose up -d majordom   # recreates the container
```

## `restart` vs `up -d` — CRITICAL DIFFERENCE

`docker compose restart` restarts the container with the **saved config** — does NOT re-read `.env`. If you changed env vars, use `docker compose up -d <service>` which recreates the container.

If you changed code, `restart` also does NOT apply changes — images are baked at build time. Always use `docker compose build <service>` first.

## Debugging in containers

```bash
# Run Python in the backend container
docker compose exec majordom-api python3 -c "import sqlite3; ..."

# Important: add PYTHONPATH for imports to work
docker compose exec -e PYTHONPATH=/app majordom-api python3 -c "from backend.core.config import settings; print(settings.llm.base_url)"

# Check SQLite content
docker compose exec majordom-api python3 -c "
import sqlite3
conn = sqlite3.connect('/app/data/memory.db')
for r in conn.execute('SELECT * FROM csv_profiles').fetchall():
    print(r)
"
```

## HTTPS for PWA features

Web Push and camera access require HTTPS. Options:
1. **Tailscale Serve** — `tailscale serve --bg http://localhost:3000` → automatic Let's Encrypt cert
2. **Custom domain + Caddy** — for users with their own domain
3. **Development** — `localhost` works without HTTPS

For Web Push on Android: use Chrome (not Brave — it blocks certificates without CT logs).

## Proxmox LXC note

If running in an unprivileged LXC container and using Tailscale, add to `/etc/pve/lxc/<ID>.conf`:
```
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
```
Then restart the container.
