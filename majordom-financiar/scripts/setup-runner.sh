#!/bin/bash
# GitHub Actions self-hosted runner setup for Majordom.
# Run once on a new machine after cloning the repo.
#
# Usage:
#   cd majordom-financiar
#   ./scripts/setup-runner.sh
#
# Optional: set GITHUB_TOKEN env var beforehand, otherwise the script prompts.
# Token: https://github.com/Dorusto/life-os/settings/actions/runners/new

set -euo pipefail

REPO_URL="https://github.com/Dorusto/life-os"
RUNNER_DIR="$HOME/actions-runner"
MAJORDOM_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Detect architecture
case "$(uname -m)" in
  x86_64)  RUNNER_ARCH="x64" ;;
  aarch64) RUNNER_ARCH="arm64" ;;
  armv7l)  RUNNER_ARCH="arm" ;;
  *) echo "Unsupported architecture: $(uname -m)"; exit 1 ;;
esac

# Fetch latest runner version
RUNNER_VERSION=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest \
  | grep '"tag_name"' | sed 's/.*"v\([^"]*\)".*/\1/')

echo "=== Majordom — GitHub Actions Runner Setup ==="
echo "Runner version : v${RUNNER_VERSION} (${RUNNER_ARCH})"
echo "Majordom path  : ${MAJORDOM_PATH}"
echo "Runner dir     : ${RUNNER_DIR}"
echo ""

mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

# Download and extract runner
RUNNER_TAR="actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
echo "Downloading runner..."
curl -fsSL "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_TAR}" \
  -o runner.tar.gz
tar xzf runner.tar.gz
rm runner.tar.gz

# Get registration token
if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "Open https://github.com/Dorusto/life-os/settings/actions/runners/new"
  echo "Copy the registration token and paste it here:"
  read -r GITHUB_TOKEN
fi

# Configure runner
./config.sh \
  --url "$REPO_URL" \
  --token "$GITHUB_TOKEN" \
  --name "majordom-$(hostname)" \
  --labels "self-hosted" \
  --unattended

# Store MAJORDOM_PATH so the deploy workflow can find the repo
echo "MAJORDOM_PATH=${MAJORDOM_PATH}" >> .env

# Install and start as systemd service
sudo ./svc.sh install
sudo ./svc.sh start

echo ""
echo "=== Runner installed and running! ==="
echo "Future pushes to main (majordom-financiar/**) will auto-deploy."
echo "Status: sudo systemctl status actions.runner.*.service"
