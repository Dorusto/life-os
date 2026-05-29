# Majordom — Deployment Guide

## First-time setup on a new machine

```bash
git clone https://github.com/Dorusto/life-os
cd life-os/majordom-financiar
cp .env.example .env
# edit .env with your credentials
nano .env
./scripts/setup.sh
```

---

## Auto-deploy (GitHub Actions self-hosted runner)

Every push to `main` that touches `majordom-financiar/**` automatically rebuilds
and restarts `majordom-api`, `majordom-web`, and `majordom-bot`.

The runner makes outbound connections to GitHub — no exposed ports needed.

### Install the runner (once per machine)

```bash
./scripts/setup-runner.sh
```

When prompted, open the link shown, copy the registration token, paste it in the terminal.

Or pass the token directly:

```bash
GITHUB_TOKEN=<token> ./scripts/setup-runner.sh
```

Token source: https://github.com/Dorusto/life-os/settings/actions/runners/new

### After the runner is installed

Push to `main` → GitHub notifies the runner → `git pull` + `docker compose up --build -d`.

Check runner status:

```bash
sudo systemctl status actions.runner.*.service
```

---

## Manual deploy (without runner)

```bash
git pull
docker compose up --build -d majordom-api majordom-web majordom-bot
```

---

## Services

| Container        | Restart policy  | Notes                        |
|------------------|-----------------|------------------------------|
| `actual-budget`  | unless-stopped  | Actual Budget server         |
| `majordom-ollama`| unless-stopped  | Local LLM (qwen3:8b)         |
| `majordom-api`   | unless-stopped  | FastAPI backend               |
| `majordom-web`   | unless-stopped  | React PWA (nginx)            |
| `majordom-bot`   | unless-stopped  | Telegram bot (maintenance)   |
