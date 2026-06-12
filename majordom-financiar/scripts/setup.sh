#!/bin/bash
set -e

echo "=== Setup Majordom Financiar ==="

# Verifică Docker
if ! command -v docker &>/dev/null; then
    echo "❌ Docker nu e instalat. Instalează Docker și încearcă din nou."
    exit 1
fi

# --- Docker Build Cache GC ---
# Docker caches intermediate build layers to speed up rebuilds. Without limits,
# this cache can silently grow to 30-40GB over months of normal use — wasted disk
# space that also inflates VM backups. This section caps it at 2GB and enables
# automatic garbage collection so Docker cleans up without manual intervention.
#
# Requires root. Safe to skip on a dev machine (answer N when prompted).
configure_docker_gc() {
    local DAEMON_JSON="/etc/docker/daemon.json"
    local GC_CONFIG='{
  "builder": {
    "gc": {
      "enabled": true,
      "defaultKeepStorage": "2GB"
    }
  }
}'

    if [ -f "$DAEMON_JSON" ]; then
        # Don't overwrite an existing daemon.json — it may contain other settings
        echo "⚠️  $DAEMON_JSON already exists. Verify it contains the builder.gc section:"
        echo "$GC_CONFIG"
        return
    fi

    echo "$GC_CONFIG" > "$DAEMON_JSON"
    echo "✅ Docker GC configured — build cache capped at 2GB."

    if systemctl is-active --quiet docker; then
        systemctl reload-or-restart docker
        echo "✅ Docker restarted with new config."
    fi
}

if [ "$(id -u)" -eq 0 ]; then
    configure_docker_gc
else
    echo "ℹ️  Run as root to configure Docker GC (build cache limit)."
    echo "   sudo bash scripts/setup.sh"
    echo "   Skipping for now — build cache will grow unbounded over time."
fi
# --- End Docker Build Cache GC ---

# Creează .env dacă nu există
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Fișier .env creat. Editează-l cu datele tale înainte de a continua."
    echo "   nano .env"
    exit 0
fi

# Creează directorul de date
mkdir -p data

echo "✅ Pornesc containerele..."
docker compose up -d --build

echo ""
echo "=== Majordom pornit! ==="
echo "📊 Actual Budget: http://localhost:5006"
echo "📋 Logs bot: docker compose logs -f majordom-bot"
