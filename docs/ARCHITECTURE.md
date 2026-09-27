# Architecture — Bharat Weather Intelligence

```
                ┌─────────────────────────── WSL2 (Ubuntu) ───────────────────────────┐
 NOAA GFS  ───► │ workers/e2s_gfs_ingest.py   (Earth2Studio GFS_FX, CPU only)          │
 (AWS open data)│ workers/e2s_ai_forecast.py  (Earth2Studio FCN, GPU/CPU, experimental)│
                └───────────────┬──────────────────────────────────────────────────────┘
                                │ NetCDF stores (India 0.25°, 3-hourly)
                                ▼
                     backend/data/grids/gfs_YYYYMMDDHH.nc, ai_fcn_*.nc
                                │
 Open-Meteo (ECMWF/GFS/ICON) ─┐ │         ┌──────────── FastAPI (backend/app) ────────────┐
 NASA POWER 1991–2020 ────────┼─┼───────► │ providers/ → engines/ (risk, anomaly, farmer)  │
 NDMA SACHET CAP (IMD, CWC) ──┘ │         │ geo (district polygons, point-in-polygon)      │
 PostGIS (optional) ◄───────────┴──────── │ /api/v1/*  (every value carries provenance)    │
                                          └──────────────────────┬─────────────────────────┘
                                                                 │ JSON
                                          ┌──────────────────────▼─────────────────────────┐
                                          │ React + TypeScript + Vite + Tailwind           │
                                          │ MapLibre GL (OpenFreeMap / OSM basemap)        │
                                          │ field raster (Mercator-resampled) + wind       │
                                          │ particles, choropleths, Recharts               │
                                          └────────────────────────────────────────────────┘
```

## Principles

1. **Weather → Impact → Decision.** Engines turn fields into risk items with a rule, a period,
   a confidence and sources; the UI leads with "What you should know".
2. **Provider-agnostic.** `providers/` hide sources behind small async functions. Every response
   carries `Provenance` (source, model, issue_time, licence) or `DataPoint`
   (source, model, issue_time, valid_time, lat, lon, variable, unit, confidence).
3. **Official ≠ derived.** CAP alerts are shown verbatim with an "Official" badge; system output
   is labelled system-derived; farmer indicators sit below the official advisory block.
4. **Earth2Studio is an engine, not a frontend.** It runs in WSL as batch workers that write a
   documented NetCDF contract; the API serves whatever is newest and falls back gracefully.
5. **Not hard-coded to Gujarat.** All geography comes from India-wide district polygons; Gujarat
   is only the default place and the pilot for farmer thresholds.

## Components

| Path | Role |
|---|---|
| `backend/app/main.py` | FastAPI routes (`/api/v1`) |
| `backend/app/services.py` | Orchestration, graceful degradation, regional aggregation |
| `backend/app/providers/openmeteo.py` | Point forecasts (best-match + per-model), geocoding, fallback grid |
| `backend/app/providers/gridstore.py` | Reads Earth2Studio NetCDF stores (`gfs`, `ai`) |
| `backend/app/providers/nasa_power.py` | 1991–2020 climatology (disk-cached per cell) |
| `backend/app/providers/sachet.py` | CAP alerts (IMD, CWC, SDMAs), district matching, polygons |
| `backend/app/engines/*` | Risk rules, anomaly, farmer indicators, thresholds, terrain |
| `backend/app/geo.py` | District polygons, STRtree point lookup, grid masks |
| `backend/workers/` | Earth2Studio GFS ingest; experimental AI forecast |
| `backend/db/schema.sql` | PostGIS schema (admin units, runs, values, normals, warnings, risks, advisories) |
| `backend/scripts/` | Boundary build, PostGIS loader |
| `frontend/src/map/` | MapLibre view, field renderer, wind particles, timeline/legend |
| `frontend/src/modes/` | Citizen, Farmer, Government panels |

## API (all GET, `/api/v1`)

| Endpoint | Purpose |
|---|---|
| `/dashboard?lat&lon[&name&taluka]` | Current, 48 h, 10 days, anomalies, 11 risks, official warnings, sources |
| `/farmer?lat&lon&crop&stage` · `/farmer/crops` | Official advisory block + system-derived crop indicators |
| `/region/india?metric&hours` | District zonal stats from the grid (rain, tmax, tmin, gust, rh) |
| `/region/state/{slug}` | Per-district 7-day table with IMD-rule levels and anomalies |
| `/grid/meta` · `/grid/field` · `/grid/wind` · `/grid/point` (`source=gfs|ai`) | Map layers |
| `/warnings` · `/warnings/polygon` | CAP alerts (verbatim) |
| `/geo/states` · `/geo/states/{slug}/districts` · `/geo/search` · `/geo/locate` | Hierarchy |
| `/sources` · `/health` | Provider status |

Interactive docs: `http://localhost:8000/docs`.

## Geography: India → State → District → Taluka → Village → lat/lon

* **State & district**: polygons (724 districts, 36 States/UTs) in `backend/data/geo`.
* **Taluka & village**: gazetteer search (GeoNames via Open-Meteo geocoding returns
  `admin3` = taluka). Search can be restricted to the selected state/district.
* **Production path**: import the Ministry of Panchayati Raj **Local Government Directory (LGD)**
  sub-district and village lists (and Survey of India / Bhuvan boundaries) into `admin_unit`
  (levels 3–4) — the schema already supports it.

> **Boundaries notice.** The pilot district polygons are community-curated (Census 2011 based,
> `udit-001/india-maps-data`). Before any government deployment replace them with Survey of India
> / LGD-aligned boundaries; the loader only needs `st_nm, st_code, district, dt_code` properties.
> The OSM basemap's own boundary lines are hidden; India's boundaries are drawn from this layer.

## Background jobs

Now: cron/loop in WSL (`scripts/ingest-loop.sh`) — GFS cycles are published every 6 h,
~4–5 h after 00/06/12/18 UTC. Suggested cron (WSL):

```
20 4,10,16,22 * * *  cd "/mnt/c/Users/<you>/Downloads/Bharat Weather Intelligence" && ./scripts/ingest.sh >> backend/data/ingest.log 2>&1
```

Next: move to a job runner (Arq/Celery + Redis or Prefect) with tasks: `ingest_gfs`,
`run_ai_model`, `archive_warnings` (every 10 min), `compute_district_risks` (per cycle → table
`risk_assessment`), `refresh_normals` (yearly).

## Scaling to all of India

* Point dashboards are on-demand and cached (15 min forecast, permanent normals).
* District views: India choropleth comes from the local grid (no API quota); state tables call
  Open-Meteo once per state (≤ 76 points) and NASA POWER once per district ever.
* For production volume: precompute per-cycle district risks into PostGIS, serve vector tiles
  (Martin / pg_tileserv), put the API behind a CDN, and replace Open-Meteo free tier with a
  commercial key or self-hosted Open-Meteo.

## Integrations roadmap

| Source | Status | What's needed |
|---|---|---|
| IMD district warnings / nowcast / AWS / radar APIs | planned | IMD API access (IP whitelisting). Add `providers/imd.py` returning `OfficialWarning` / `DataPoint` |
| ISRO MOSDAC (INSAT-3D/3DR imagery, rainfall, LST) | planned | MOSDAC account + SFTP/API; serve as raster tiles layer |
| IMD Pune gridded normals | planned | Download binaries (imdlib), build normals per cell → `climatology_normal` |
| IMD Agromet (district AAS bulletins) | planned | Data access; store in `agro_advisory` (official = true) |
| Radar mosaic | planned | IMD radar access |
| Earth2Studio ensembles / downscaling (e.g. CorrDiff) | research | Larger GPU; keep experimental |

## Earth2Studio on RTX 3050 6 GB

* `e2s_gfs_ingest.py` uses no GPU — only data access. Safe to run on schedule.
* `e2s_ai_forecast.py` (FourCastNet v1) checks free VRAM (≥ 5 GB) and uses fp16 autocast on
  CUDA; tested here on CPU (~15 s/step). Larger models (GraphCast, Pangu, FuXi, SFNO 73-ch,
  AIFS) generally need more memory than a 6 GB card — do not enable them on this machine.
* AI output is labelled experimental, never feeds risk rules or warnings.
