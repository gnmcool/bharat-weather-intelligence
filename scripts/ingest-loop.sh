#!/usr/bin/env bash
# WSL started from Windows (e.g. `bash scripts/x.sh` in CMD) skips ~/.bashrc, so add the usual
# user tool locations: uv (~/.local/bin, ~/.cargo/bin) and Node via nvm.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
# Keep the Earth2Studio store fresh: ingest now, then every 6 hours. Ctrl+C to stop.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
while true; do
  date -u +"%F %TZ ingest start"
  "$ROOT/scripts/ingest.sh" "$@" || echo "ingest failed — will retry next cycle"
  sleep 21600
done
