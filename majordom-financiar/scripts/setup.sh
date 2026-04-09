#!/bin/bash
set -e

echo "=== Setup Majordom Financiar ==="

# Verifică Docker
if ! command -v docker &>/dev/null; then
    echo "❌ Docker nu e instalat. Instalează Docker și încearcă din nou."
    exit 1
fi

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
