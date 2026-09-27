#!/usr/bin/env bash
# Run API (port 8000) + web app (port 5173). Open http://localhost:5173 in Windows.
set -euo pipefail
# WSL started from Windows (e.g. `bash scripts/x.sh` in CMD) skips ~/.bashrc, so add the usual
# user tool locations: uv (~/.local/bin, ~/.cargo/bin) and Node via nvm.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Stop servers left over from an earlier start (closing the Windows window doesn't always stop them)
pkill -f "uvicorn app.main:app" 2>/dev/null || true
pkill -f "vite --host 0.0.0.0" 2>/dev/null || true
sleep 1
cd "$ROOT/backend"
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 &
API=$!
trap 'kill $API 2>/dev/null' EXIT
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "  Open in Windows:  http://localhost:5173   (if that doesn't load: http://$IP:5173 )"
echo ""
cd "$ROOT/frontend"
npx vite --host 0.0.0.0 --port 5173 --strictPort
