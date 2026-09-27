# Run API + web app natively on Windows (PowerShell). Earth2Studio ingest still runs in WSL and
# writes into this same folder (backend\data\grids), which the API reads.
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev-windows.ps1
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { Write-Error "Install uv: powershell -c `"irm https://astral.sh/uv/install.ps1 | iex`""; exit 1 }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Error "Install Node.js 18+ from https://nodejs.org"; exit 1 }
Push-Location "$Root\backend"; uv sync --extra dev; Pop-Location
Push-Location "$Root\frontend"; if (-not (Test-Path node_modules)) { npm install }; Pop-Location
$api = Start-Process -PassThru -NoNewWindow -WorkingDirectory "$Root\backend" uv -ArgumentList "run","uvicorn","app.main:app","--port","8000"
try { Push-Location "$Root\frontend"; npx vite --port 5173 } finally { Pop-Location; Stop-Process -Id $api.Id -ErrorAction SilentlyContinue }
