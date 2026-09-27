#!/usr/bin/env bash
# Pull the latest NOAA GFS cycle through Earth2Studio and write the India 0.25° store.
# Uses the Python where earth2studio is installed:
#   E2S_PYTHON=~/earth2studio/.venv/bin/python ./scripts/ingest.sh [--hours 240]
# Add --ai to also run the experimental FourCastNet model (GPU recommended).
set -euo pipefail
# WSL started from Windows (e.g. `bash scripts/x.sh` in CMD) skips ~/.bashrc, so add the usual
# user tool locations: uv (~/.local/bin, ~/.cargo/bin) and Node via nvm.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${E2S_PYTHON:-}"
if [ -z "$PY" ]; then
  # auto-detect: first python (venvs under home, then system) that can import earth2studio
  for c in "$HOME"/*/.venv/bin/python "$HOME"/*/*/.venv/bin/python "$HOME"/.venv/bin/python python3; do
    { [ -x "$c" ] || command -v "$c" >/dev/null 2>&1; } || continue
    if "$c" -c "import earth2studio" >/dev/null 2>&1; then PY="$c"; break; fi
  done
  PY="${PY:-python3}"
fi
echo "Earth2Studio python: $PY"
"$PY" -c "import earth2studio" 2>/dev/null || {
  echo "earth2studio not importable with '$PY'. Set E2S_PYTHON to your Earth2Studio venv python,"
  echo "e.g. export E2S_PYTHON=\$HOME/earth2studio-project/.venv/bin/python"; exit 2; }
AI=0; ARGS=()
for a in "$@"; do [ "$a" = "--ai" ] && AI=1 || ARGS+=("$a"); done
export LOGURU_LEVEL="${LOGURU_LEVEL:-WARNING}"  # quiet earth2studio per-file DEBUG logs
cd "$ROOT/backend"
"$PY" workers/e2s_gfs_ingest.py "${ARGS[@]}"
if [ "$AI" = 1 ]; then "$PY" workers/e2s_ai_forecast.py --steps 20 || echo "AI forecast failed (see message above) — GFS store is still valid."; fi
