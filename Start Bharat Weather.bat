@echo off
title Bharat Weather Intelligence (keep this window open)
cd /d "%~dp0"
echo Starting Bharat Weather Intelligence ... the browser opens in about 20 seconds.
echo Close this window to stop the app.
for /f "tokens=1" %%i in ('wsl.exe hostname -I') do set WSLIP=%%i
start "" /min cmd /c "timeout /t 20 /nobreak >nul & start http://%WSLIP%:5173"
wsl.exe --cd "%~dp0." -e bash -lc "./scripts/dev-wsl.sh"
pause
