#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=========================================================="
echo "  LAUNCH1500 · PERMANENT 24/7 LAUNCHER & WATCHDOG        "
echo "  Policy: NEVER OFF · Auto-Restarting Persistent Mode     "
echo "=========================================================="

PORT="${PORT:-8085}"
export PORT

# Check if node is available
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required but not found."
  exit 1
fi

# Trap signals for graceful manual termination only
trap "echo '[Launch1500] Supervisor stopped by user.'; exit 0" SIGINT SIGTERM

while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Launching Launch1500 server & tunnel..."
  node tunnel.js || true
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Process exited. Respawning in 2 seconds to keep it live forever..."
  sleep 2
done
