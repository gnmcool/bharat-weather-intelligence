# Bharat Weather Intelligence

*Made by Gaurav Makwana*

**Weather → Impact → Decision** for India. A year-round weather intelligence platform that turns
forecast, historical and official-warning data into location-specific risk, anomaly and
decision information for **citizens, farmers, government and businesses**.

* **My Weather (Citizen):** "What you should know" summary, official warnings, 11 risk tiles
  (heat, cold, heavy rain, wind, thunderstorm, lightning, flood, drought/dry spell, fog, fire
  weather, cyclone), each with rule, period, confidence and sources; 48-hour chart; 10-day
  outlook with normal range and model spread; Weather vs Normal.
* **Farmer:** State → District → Taluka/village → crop → growth stage. The **official Agromet
  advisory** sits in its own block, above and visually separate from the **system-derived
  indicators** (heat/cold stress by stage, spray windows, disease-favourable hours, harvest
  window, dry spell, water balance), which are labelled unvalidated.
* **Government:** India district choropleth (rain, Tmax, Tmin, wind, humidity over 24 h / 72 h /
  5 days) with hotspots → state drill-down: districts with an elevated risk level, warmest vs
  normal, wettest, largest 30-day deficit, sortable district table, official warnings.
* **Map (Windy-style):** animated wind particles over colour fields (wind, temperature, rain,
  gusts, humidity, pressure, precipitable water, **forecast clouds**), a 10-day timeline with playback, click-anywhere
  meteogram, official alert overlay, **GFS vs Earth2Studio AI** source toggle.

* **11 Indian languages + voice:** हिन्दी, ગુજરાતી, मराठी, ਪੰਜਾਬੀ, বাংলা, தமிழ், తెలుగు, ಕನ್ನಡ, മലയാളം, ଓଡ଼ିଆ.
  Farmer mode has a picture-first view with a 🔊 *Listen* button (see `docs/LANGUAGES.md`).
* **Live satellite clouds:** EUMETSAT Meteosat (Indian Ocean) every 15 min: infrared, visible,
  storm RGB, plus a 3-hour loop.
* **NASA satellite data (free, no key):** rain now (GPM IMERG, 30 min), flood water (VIIRS daily),
  root-zone soil moisture (SMAP L4), crop greenness (VIIRS NDVI 8-day), true-colour daily photo,
  and active fires from NASA FIRMS (last 24 h) — in the Map layer panel under *NASA satellite data*.
* **Official alerts panel:** all active IMD / CWC / SDMA alerts, filterable, "show on map".
* **Government exports:** per-state Excel workbook and a print-ready briefing (Save as PDF).
* **Auto-update:** `scripts/schedule-windows.ps1` refreshes GFS 4× a day (`docs/AUTO_UPDATE.md`).

Every number carries provenance (source, model, run time, licence). Official CAP alerts are
shown verbatim; system output is always labelled system-derived.

## What powers it

| Layer | Source | Notes |
|---|---|---|
| Map fields, India district stats | **NOAA GFS 0.25° via NVIDIA Earth2Studio** (`GFS_FX`) | Local worker in WSL, 3-hourly, 5–10 days |
| AI forecast (experimental) | **Earth2Studio FourCastNet** from GFS analysis | Comparison only; never used for risks |
| Point forecasts & confidence | Open-Meteo: **ECMWF IFS 0.25°, NOAA GFS, DWD ICON** | Per-model agreement = confidence |
| Normals (1991–2020) | **NASA POWER** (MERRA-2) | Upgrade path: IMD Pune gridded normals |
| Official warnings | **NDMA SACHET CAP** — IMD regional centres, CWC flood, SDMAs | Verbatim; mapped to districts |
| Satellite observations | **NASA GIBS** (IMERG, VIIRS flood/NDVI/true colour, SMAP) + **NASA FIRMS** fires | Tiles load straight from NASA; lags: IMERG ~4 h, SMAP ~3 days |
| Basemap | **MapLibre GL + OpenFreeMap** (OpenStreetMap data) | No API key |
| Boundaries | 724 districts / 36 States-UTs (pilot data) | Replace with Survey of India/LGD before government use |

## Get the code

```bash
git clone https://github.com/gnmcool/bharat-weather-intelligence.git
```

On Windows, after the one-time setup below, double-click **Start Bharat Weather.bat** to run the app
and **Update Forecast.bat** to pull a fresh Earth2Studio forecast.

## Online version

| Part | Where | Updates |
|---|---|---|
| Website | GitHub Pages — https://gnmcool.github.io/bharat-weather-intelligence/ | `.github/workflows/pages.yml`, on every push to `frontend/` |
| API (FastAPI) | Vercel, project root `backend/` (`backend/vercel.json`, Mumbai region) | Vercel builds on every push |
| Forecast grids | GitHub Actions runs the Earth2Studio GFS worker every 6 h (`.github/workflows/forecast.yml`) and publishes `gfs_latest.nc` to the `forecast` release; the API downloads it | 4× a day |

The experimental FourCastNet AI layer needs a GPU and stays on the local (WSL) setup.
If the API address changes, set the repository variable `BWI_API_BASE` (e.g. `https://<project>.vercel.app/api/v1`).

## Run it (Windows 11 + WSL2)

Your Earth2Studio environment stays untouched; the app uses its own venv.

```bash
# 1) In WSL (Ubuntu) — one-time setup (needs uv and Node.js ≥ 18 in WSL)
cd "/mnt/c/Users/gnmco/Downloads/Bharat Weather Intelligence"
bash scripts/setup-wsl.sh

# 2) Pull the latest GFS through Earth2Studio (≈ 30 s, no GPU needed)
export E2S_PYTHON=/path/to/your/earth2studio/.venv/bin/python   # the python where earth2studio imports
./scripts/ingest.sh                 # 10 days (≈75 s);  --hours 120 for 5 days;  --ai adds FourCastNet
#   keep it fresh:  ./scripts/ingest-loop.sh   (or the cron line in docs/ARCHITECTURE.md)

# 3) Start API + web app
./scripts/dev-wsl.sh
```

Open **http://localhost:5173** in Windows (API docs: http://localhost:8000/docs).

Prefer running the app natively on Windows? `powershell -ExecutionPolicy Bypass -File .\scripts\dev-windows.ps1`
(needs `uv` and Node.js for Windows). The WSL ingest writes into the same folder, so the Windows
API picks the stores up.

Without any ingest the map still works on a coarse 2° GFS fallback (labelled as such).

## Earth2Studio on the RTX 3050 (6 GB)

* `workers/e2s_gfs_ingest.py` — data access only (`GFS_FX`), no GPU. Verified against
  Earth2Studio **0.17.0**: fetch, India crop, K→°C, Pa→hPa, GFS 6-hour bucket precipitation →
  3-hourly mm (checked against NOAA `.idx` files to f240 and unit-tested).
* `workers/e2s_ai_forecast.py` — **experimental** FourCastNet v1 (needs `earth2studio[fcn]`).
  Refuses to start on GPU with < 5 GB free VRAM, uses fp16 autocast on CUDA; `--device cpu`
  works (≈ 15 s/step). Large models (GraphCast, Pangu, FuXi, SFNO-73, AIFS) are not
  suitable for 6 GB.

## Project layout

```
backend/
  app/            FastAPI app: providers/, engines/, geo.py, services.py, main.py
  workers/        Earth2Studio GFS ingest, experimental AI forecast
  db/schema.sql   PostGIS schema (admin hierarchy, runs, values, normals, warnings, risks, advisories)
  scripts/        build_boundaries.py, load_postgis.py
  data/geo/       districts, states, coastline
  data/grids/     Earth2Studio NetCDF stores (generated)
  tests/          rule tests (pytest)
frontend/         React + TypeScript + Vite + Tailwind + MapLibre + Recharts
docs/             ARCHITECTURE.md, METHODOLOGY.md
scripts/          setup / dev / ingest helpers
docker-compose.yml  optional PostGIS
```

## Optional: PostGIS

```bash
docker compose up -d db          # or any PostgreSQL 14+ with PostGIS 3
export BWI_DATABASE_URL=postgresql://bwi:bwi@localhost:5432/bwi
cd backend && uv run --extra db python scripts/load_postgis.py --warnings
```

Loads India → State → District polygons and archives current official alerts (linked to
districts spatially). The live app does not require the database yet.

## Honest limits (read before showing this to anyone official)

* **Risks are indicators, not declarations.** IMD rules are applied to model forecasts at a
  point; IMD declares heat/cold waves from station observations with spatial and temporal
  persistence. See `docs/METHODOLOGY.md`.
* **Current conditions are model analysis**, not station readings (IMD AWS integration needs
  IMD API access).
* **Farmer thresholds are unvalidated** until reviewed by a State Agricultural University.
* **Open-Meteo free tier is non-commercial** (10k calls/day). Set `BWI_OPENMETEO_API_KEY` or
  self-host before commercial/production use.
* **SACHET** throttles bursts (the polygon endpoint returns 403 under load). The app fetches
  politely and falls back to district-name matching.
* **Boundaries** are pilot-grade. Replace with Survey of India / LGD data for government use.
* **Not yet integrated:** IMD APIs (warnings, nowcast, AWS, radar), ISRO MOSDAC satellite
  imagery, IMD gridded normals, IMD Agromet bulletins. Each has a slot in
  the architecture (`docs/ARCHITECTURE.md` → Integrations roadmap).

## Tests

```bash
cd backend && uv run pytest -q          # 12 rule tests
cd frontend && npx tsc -b && npx vite build
```

## Licences & attribution

NOAA GFS: public domain · ECMWF open data: CC BY 4.0 · DWD ICON via Open-Meteo: CC BY 4.0 ·
Open-Meteo: CC BY 4.0 · NASA POWER: NASA open data · SACHET CAP: Government of India public
alerts · OpenStreetMap: ODbL (© OpenStreetMap contributors) · OpenFreeMap / OpenMapTiles ·
NASA GIBS / FIRMS: NASA open data · Natural Earth: public domain · FourCastNet weights: NVIDIA model licence.
