#!/usr/bin/env bash
# One-time setup inside WSL2 (Ubuntu). Run from anywhere:
#   bash "/mnt/c/Users/<you>/Downloads/Bharat Weather Intelligence/scripts/setup-wsl.sh"
set -euo pipefail
# WSL started from Windows (e.g. `bash scripts/x.sh` in CMD) skips ~/.bashrc, so add the usual
# user tool locations: uv (~/.local/bin, ~/.cargo/bin) and Node via nvm.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Project: $ROOT"

if ! command -v uv >/dev/null; then
  echo "uv not found in WSL — installing it (user-local, ~/.local/bin)…"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
echo "==> Backend (separate venv; does NOT touch your Earth2Studio environment)"
cd "$ROOT/backend"
uv sync --extra dev
uv run pytest -q

echo "==> Frontend"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "Node.js >= 18 required. Install e.g.: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
  exit 1
fi
cd "$ROOT/frontend"
npm install
echo "Done. Next: scripts/ingest.sh (Earth2Studio) then scripts/dev-wsl.sh"
