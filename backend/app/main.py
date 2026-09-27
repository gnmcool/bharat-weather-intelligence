"""Bharat Weather Intelligence API (FastAPI).

Run:  uv run uvicorn app.main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import numpy as np
from fastapi import APIRouter, FastAPI, HTTPException, Query, Response
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from . import http, reports, services
from .config import settings
from .engines import farmer as farmer_engine
from .geo import boundaries
from .providers import earthobs, gridstore, openmeteo, sachet, satellite
from .schemas import Dashboard

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    boundaries()  # warm
    yield
    await http.aclose()


app = FastAPI(title="Bharat Weather Intelligence API", version="0.1.0", lifespan=lifespan,
              description="Weather → Impact → Decision for India. Every value carries provenance.")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=2048)
api = APIRouter(prefix="/api/v1")

Lat = Query(..., ge=5.0, le=38.0, description="Latitude (India bounding box)")
Lon = Query(..., ge=66.0, le=99.0, description="Longitude (India bounding box)")


@api.get("/health")
async def health():
    store, ai = gridstore.latest_store("gfs"), gridstore.latest_store("ai")
    return {"status": "ok", "time": datetime.now(timezone.utc), "earth2studio_store": store.name if store else None,
            "earth2studio_ai_store": ai.name if ai else None}


@api.get("/sources")
async def sources():
    store = gridstore.latest_store()
    runs = {}
    try:
        runs = await openmeteo.model_run_times()
    except Exception:  # noqa: BLE001
        pass
    return {
        "providers": [
            {"id": "openmeteo", "role": "Point forecasts (ECMWF IFS, NOAA GFS, DWD ICON), geocoding", "status": "active",
             "runs": {openmeteo.MODEL_META[k][1]: v for k, v in runs.items()}},
            {"id": "earth2studio", "role": "NOAA GFS 0.25° gridded fields for maps & regional stats (local worker)",
             "status": "active" if store else "not run yet", "store": store.name if store else None},
            {"id": "earth2studio_ai", "role": "EXPERIMENTAL AI forecast (FourCastNet) for comparison only",
             "status": "active" if gridstore.latest_store("ai") else "optional — not run"},
            {"id": "nasa_power", "role": "1991–2020 climatology baseline (MERRA-2)", "status": "active"},
            {"id": "sachet", "role": "Official warnings — IMD, CWC, SDMA CAP alerts", "status": "active"},
            {"id": "imd_api", "role": "IMD district warnings / nowcast / AWS (needs IP whitelisting)", "status": "planned"},
            {"id": "mosdac", "role": "ISRO INSAT-3D/3DR satellite products (needs MOSDAC account)", "status": "planned"},
            {"id": "imd_gridded", "role": "IMD Pune 0.25° rainfall & 1° temperature normals", "status": "planned"},
        ]
    }


# ---------- Geography ----------
@api.get("/geo/states")
async def states():
    return boundaries().states()


@api.get("/geo/states/{state_slug}/districts")
async def districts(state_slug: str):
    ds = boundaries().districts_of(state_slug)
    if not ds:
        raise HTTPException(404, "Unknown state")
    return [{"id": d.id, "district": d.district, "lat": d.lat, "lon": d.lon, "area_km2": d.area_km2} for d in ds]


@api.get("/geo/search")
async def search(q: str = Query(..., min_length=2), state: str | None = None, district: str | None = None, count: int = 10):
    res = await openmeteo.geocode(q, 30 if (state or district) else count)
    if state:
        res = [r for r in res if sachet.norm(r.get("state")) == sachet.norm(state)]
    if district:
        res = [r for r in res if sachet.norm(district) in sachet.norm(r.get("district"))]
    for r in res:
        d = boundaries().locate(r["lat"], r["lon"])
        r["district_id"] = d.id if d else None
        if d:
            r["district"] = d.district
            r["state"] = d.state
    return res[:count]


@api.get("/geo/locate")
async def locate(lat: float = Lat, lon: float = Lon):
    return services.locate(lat, lon)


# ---------- Intelligence ----------
@api.get("/dashboard", response_model=Dashboard)
async def dashboard(lat: float = Lat, lon: float = Lon, name: str | None = None, taluka: str | None = None):
    return await services.dashboard(lat, lon, name, taluka)


@api.get("/farmer/crops")
async def crops():
    c = farmer_engine.crops()
    return {"validation_status": c["validation_status"],
            "crops": [{"id": k, "label": v["label"], "season": v["season"], "stages": v["stages"]} for k, v in c["crops"].items()]}


@api.get("/farmer")
async def farmer(crop: str, stage: str, lat: float = Lat, lon: float = Lon, name: str | None = None, taluka: str | None = None):
    try:
        return await services.farmer(lat, lon, crop, stage, name, taluka)
    except KeyError:
        raise HTTPException(404, "Unknown crop") from None


@api.get("/warnings")
async def warnings(state: str | None = None, district: str | None = None, national: bool = True):
    return await sachet.warnings(state, district, include_national=national)


@api.get("/warnings/polygon")
async def warning_polygon(url: str):
    gj = await sachet.polygon(url)
    if gj is None:
        raise HTTPException(404, "Polygon unavailable (not provided or SACHET throttling) — use district_ids")
    return gj


@api.get("/region/india")
async def region_india(metric: str = "rain", hours: int = Query(72, ge=3, le=240)):
    try:
        return await services.india_districts(metric, hours)
    except KeyError:
        raise HTTPException(400, f"metric must be one of {list(services.METRICS)}") from None


@api.get("/region/state/{state_slug}")
async def region_state(state_slug: str):
    try:
        return await services.state_districts(state_slug)
    except KeyError:
        raise HTTPException(404, "Unknown state") from None


@api.get("/region/state/{state_slug}/export.xlsx")
async def region_state_xlsx(state_slug: str):
    try:
        data = await services.state_districts(state_slug)
    except KeyError:
        raise HTTPException(404, "Unknown state") from None
    fname = f"{state_slug}-weather-risk-{datetime.now(timezone.utc):%Y%m%d}.xlsx"
    return Response(reports.xlsx(data), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})


@api.get("/region/state/{state_slug}/report.html", response_class=HTMLResponse)
async def region_state_report(state_slug: str):
    try:
        data = await services.state_districts(state_slug)
    except KeyError:
        raise HTTPException(404, "Unknown state") from None
    return HTMLResponse(reports.html_report(data))


# ---------- Grids (map layers) ----------
Src = Query("gfs", pattern="^(gfs|ai)$", description="gfs = NOAA GFS via Earth2Studio; ai = experimental Earth2Studio AI model")


async def _grid(source: str) -> gridstore.Grid:
    try:
        return await gridstore.get_grid(source)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from None


@api.get("/grid/meta")
async def grid_meta(source: str = Src):
    m = (await _grid(source)).meta()
    m.grid_source = source
    m.sources_available = gridstore.available_sources()
    return m


@api.get("/grid/field")
async def grid_field(var: str, time: str | None = None, source: str = Src):
    g = await _grid(source)
    if var != "wind" and var not in g.fields:
        raise HTTPException(404, f"Variable not in store: {list(g.meta().variables)}")
    ti = gridstore.time_index(g, time)
    a = g.field(var, ti)
    return {"var": var, "time": g.times[ti], "ti": ti, "nx": int(g.lons.size), "ny": int(g.lats.size),
            "bbox": g.meta().bbox, "min": float(np.nanmin(a)), "max": float(np.nanmax(a)),
            "values": gridstore.encode(a), "source": g.source, "model": g.model, "issue_time": g.issue}


@api.get("/grid/wind")
async def grid_wind(time: str | None = None, source: str = Src):
    g = await _grid(source)
    ti = gridstore.time_index(g, time)
    return {"time": g.times[ti], "ti": ti, "nx": int(g.lons.size), "ny": int(g.lats.size), "bbox": g.meta().bbox,
            "u": gridstore.encode(g.fields["u10m"][ti], 2), "v": gridstore.encode(g.fields["v10m"][ti], 2), "unit": "m/s",
            "source": g.source, "model": g.model, "issue_time": g.issue}


@api.get("/grid/point")
async def grid_point(lat: float = Lat, lon: float = Lon, source: str = Src):
    g = await _grid(source)
    vars_ = [v for v in g.meta().variables]
    return {"time": g.times, "source": g.source, "model": g.model, "issue_time": g.issue,
            "series": {v: gridstore.sample(g, v, lat, lon) for v in vars_}}


# ---------- NASA Earth observation (GIBS tiles, FIRMS fires) ----------
@api.get("/earthobs/layers")
async def earthobs_layers():
    return await earthobs.layers()


@api.get("/earthobs/fires")
async def earthobs_fires():
    return await earthobs.fires()


# ---------- Satellite (cloud imagery) ----------
@api.get("/sat/meta")
async def sat_meta():
    return {"products": {k: v["label"] for k, v in satellite.PRODUCTS.items()},
            "latest": {k: await satellite.latest_time(k) for k in ("ir",)},
            "attribution": satellite.ATTRIBUTION, "satellite": "Meteosat IODC (45.5°E), 15-minute images"}


@api.get("/sat/frames")
async def sat_frames(product: str = "ir", hours: float = Query(3.0, ge=0.5, le=12), step: int = Query(30, ge=15, le=60)):
    if product not in satellite.PRODUCTS:
        raise HTTPException(404, "Unknown product")
    return {"product": product, "times": await satellite.frames(product, hours, step)}


@api.get("/sat/tile/{product}/{z}/{x}/{y}.png")
async def sat_tile(product: str, z: int, x: int, y: int, time: str | None = None):
    if product not in satellite.PRODUCTS or not (0 <= z <= 9) or not (0 <= x < 2**z) or not (0 <= y < 2**z):
        raise HTTPException(404, "Unknown product or tile")
    try:
        png = await satellite.tile(product, z, x, y, time)
    except Exception:  # noqa: BLE001
        return Response(status_code=204)  # map skips empty tiles quietly
    return Response(png, media_type="image/png", headers={"Cache-Control": f"public, max-age={86400 if time else 600}"})


app.include_router(api)
