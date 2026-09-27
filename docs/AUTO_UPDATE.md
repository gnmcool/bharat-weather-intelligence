# Keeping forecasts fresh automatically

GFS publishes a new run every 6 hours. The app picks up the newest Earth2Studio store by itself
(and the browser re-checks every 30 minutes); you only need the ingest to run on a schedule.

## Windows (recommended)
In PowerShell, from the project folder, once:

    powershell -ExecutionPolicy Bypass -File .\scripts\schedule-windows.ps1

* Creates the task **"Bharat Weather Intelligence - GFS update"** at 04:45, 10:45, 16:45, 22:45.
* Runs hidden in WSL, catches up after sleep/shutdown, needs no admin rights.
* Log: `backend\data\ingest.log`. Old stores are pruned automatically (keeps the latest 4).
* See it in *Task Scheduler › Task Scheduler Library*. Remove with `-Remove`.

The map's source badge turns **amber** when the data is more than 12 hours old, and the app
falls back to a coarse grid if it is more than 30 hours old.

## Alternative: keep a WSL window open
    ./scripts/ingest-loop.sh
