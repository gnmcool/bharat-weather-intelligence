#!/usr/bin/env bash
# Run API (port 8000) + web app (port 5173) and, unless BWI_TUNNEL=0, a free Cloudflare quick
# tunnel that gives a public https link (works on any phone/PC while this PC runs the app).
set -euo pipefail
# WSL started from Windows (e.g. `bash scripts/x.sh` in CMD) skips ~/.bashrc, so add the usual
# user tool locations: uv (~/.local/bin, ~/.cargo/bin) and Node via nvm.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LINKFILE="$ROOT/PUBLIC LINK.txt"
# Stop servers left over from an earlier start (closing the Windows window doesn't always stop them)
pkill -f "uvicorn app.main:app" 2>/dev/null || true
pkill -f "vite --host 0.0.0.0" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1
rm -f "$LINKFILE"

cd "$ROOT/backend"
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 &
PIDS="$!"
trap 'kill $PIDS 2>/dev/null' EXIT

# ---- public link (Cloudflare quick tunnel: free, no account) ----
start_tunnel() {
  local CF="$HOME/.local/bin/cloudflared"
  if ! command -v cloudflared >/dev/null 2>&1 && [ ! -x "$CF" ]; then
    echo "  Downloading cloudflared (one time, ~40 MB) ..."
    mkdir -p "$HOME/.local/bin"
    local ARCH=amd64; [ "$(uname -m)" = "aarch64" ] && ARCH=arm64
    curl -fsSL -o "$CF.tmp" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$ARCH" \
      && chmod +x "$CF.tmp" && mv "$CF.tmp" "$CF" || { echo "  (cloudflared download failed - no public link this time)"; return 0; }
  fi
  command -v cloudflared >/dev/null 2>&1 && CF="$(command -v cloudflared)"
  local LOG=/tmp/bwi-tunnel.log
  "$CF" tunnel --no-autoupdate --url http://localhost:5173 >"$LOG" 2>&1 &
  PIDS="$PIDS $!"
  # print the link once cloudflared reports it (in the background, so Vite starts meanwhile)
  (
    for _ in $(seq 1 60); do
      URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
      if [ -n "$URL" ]; then
        printf '%s\r\n\r\nOpen this link on any phone or computer while the app is running on this PC.\r\nIt changes every time the app is restarted.\r\n' "$URL" >"$LINKFILE"
        echo ""
        echo "  ================================================================"
        echo "   PUBLIC LINK (any device):  $URL"
        echo "   (also saved in 'PUBLIC LINK.txt'; changes on every restart)"
        echo "  ================================================================"
        echo ""
        exit 0
      fi
      sleep 1
    done
    echo "  (public link not ready - see $LOG)"
  ) &
}
[ "${BWI_TUNNEL:-1}" = "1" ] && start_tunnel

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "  Open on this PC:  http://localhost:5173   (if that doesn't load: http://$IP:5173 )"
echo ""
cd "$ROOT/frontend"
npx vite --host 0.0.0.0 --port 5173 --strictPort
