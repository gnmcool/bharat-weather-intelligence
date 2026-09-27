# Registers a Windows scheduled task that refreshes the Earth2Studio GFS forecast 4x a day.
# Run ONCE in PowerShell (normal user, no admin needed):
#   powershell -ExecutionPolicy Bypass -File .\scripts\schedule-windows.ps1
# Remove later with:  .\scripts\schedule-windows.ps1 -Remove
#
# Timing: GFS runs at 00/06/12/18 UTC and is complete on AWS ~4.5 h later, i.e. about
# 10:00, 16:00, 22:00 and 04:00 IST. The task runs 45 min after that. Missed runs (PC asleep/off)
# run as soon as the PC is back. The WSL window is hidden; output goes to backend\data\ingest.log.
param([switch]$Remove)
$ErrorActionPreference = "Stop"
$TaskName = "Bharat Weather Intelligence - GFS update"

if ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed scheduled task '$TaskName'."
  exit 0
}

$Root = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { throw "wsl.exe not found — WSL is required for Earth2Studio." }
$WslRoot = (& wsl.exe wslpath -a "$Root").Trim()
if (-not $WslRoot) { throw "Could not translate '$Root' to a WSL path." }

# no double quotes inside: the whole thing is passed as one quoted argument to bash -lc
$bash = "cd '$WslRoot' && mkdir -p backend/data && echo === `$(date -u +%FT%TZ) scheduled ingest === >> backend/data/ingest.log && ./scripts/ingest.sh >> backend/data/ingest.log 2>&1"
# conhost --headless keeps the console window from popping up (Windows 11)
$action = New-ScheduledTaskAction -Execute "conhost.exe" -Argument "--headless wsl.exe -e bash -lc `"$bash`""
$times = @("04:45", "10:45", "16:45", "22:45")
$triggers = $times | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal `
  -Description "Downloads the latest NOAA GFS run through NVIDIA Earth2Studio (WSL) for Bharat Weather Intelligence." -Force | Out-Null

Write-Host "Scheduled '$TaskName' at $($times -join ', ') daily (IST, PC local time)."
Write-Host "Running it once now to test..."
Start-ScheduledTask -TaskName $TaskName
Write-Host "Check progress:  Get-Content '$Root\backend\data\ingest.log' -Tail 20 -Wait"
