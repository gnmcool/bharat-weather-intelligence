@echo off
title Bharat Weather Intelligence - updating forecast
echo Downloading the latest 10-day GFS forecast through Earth2Studio (about 1-2 minutes)...
wsl.exe --cd "%~dp0." -e bash -lc "./scripts/ingest.sh"
echo.
echo Done. Refresh the app in your browser (F5).
pause
