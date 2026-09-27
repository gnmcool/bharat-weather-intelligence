"""Orchestration: assembles dashboards, farmer reports and regional views from providers
and engines. Provider failures degrade gracefully and are reported in `notices`."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np

from .engines import anomaly as anomaly_engine
from .engines import farmer as farmer_engine
from .engines import risk as risk_engine
from .engines import thresholds as T
from .engines.series import daily, hourly, nz, today_local
from .engines.terrain import classify
from .geo import boundaries
from .providers import gridstore, nasa_power, openmeteo, sachet
from .schemas import Dashboard, Location, Provenance

log = logging.getLogger("bwi.services")


async def _safe(coro, notices: list[str], what: str):
    try:
        return await coro
    except Exception as e:  # noqa: BLE001
        log.warning("%s failed: %s", what, e)
        notices.append(f"{what} unavailable right now ({type(e).__name__}). Showing what is available.")
        return None


def locate(lat: float, lon: float, name: str | None = None, taluka: str | None = None) -> Location:
    d = boundaries().locate(lat, lon)
    return Location(
        name=name or (d.district if d else f"{lat:.3f}, {lon:.3f}"), lat=lat, lon=lon,
        state=d.state if d else None, district=d.district if d else None, district_id=d.id if d else None,
        taluka=taluka,
    )


async def dashboard(lat: float, lon: float, name: str | None = None, taluka: str | None = None) -> Dashboard:
    notices: list[str] = []
    loc = locate(lat, lon, name, taluka)
    fc_t = asyncio.create_task(openmeteo.point_forecast(lat, lon))
    md_t = asyncio.create_task(_safe(openmeteo.model_daily(lat, lon), notices, "Per-model forecasts (confidence)"))
    nm_t = asyncio.create_task(_safe(nasa_power.normals(lat, lon), notices, "Climatology baseline (NASA POWER)"))
    wr_t = asyncio.create_task(_safe(sachet.warnings(loc.state, loc.district, district_id=loc.district_id), notices, "Official warnings (SACHET)"))
    rn_t = asyncio.create_task(_safe(openmeteo.model_run_times(), notices, "Model run times"))
    fc = await fc_t
    md, normals, warns, runs = await md_t, await nm_t, await wr_t, await rn_t
    warns = warns or []
    runs = runs or {}
    loc.elevation_m = fc.get("elevation")
    terrain = classify(lat, lon, loc.elevation_m)
    d, h = daily(fc), hourly(fc)

    risks = risk_engine.assess(d, h, md, normals, terrain, warns)
    anom = anomaly_engine.compute(d, normals)

    cur = fc.get("current", {})
    units = fc.get("current_units", {})
    current = {
        "time": cur.get("time"),
        "values": {k: {"value": v, "unit": units.get(k, "")} for k, v in cur.items() if k not in ("time", "interval")},
        "visibility_m": (h.v.get("visibility") or [None])[h.i0] if h.v.get("visibility") else None,
        "dew_point": (h.v.get("dew_point_2m") or [None])[h.i0] if h.v.get("dew_point_2m") else None,
        "terrain": terrain,
        "source": "Open-Meteo best-match (model analysis, not a station observation)",
    }
    H = 48
    hourly_out = {"time": [t.isoformat() for t in h.fut_times(H)]}
    for k in ("temperature_2m", "apparent_temperature", "precipitation", "precipitation_probability", "relative_humidity_2m",
              "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m", "weather_code", "cloud_cover", "pressure_msl", "is_day"):
        hourly_out[k] = h.fut(k, H)
    hourly_out["units"] = fc.get("hourly_units", {})

    daily_out: list[dict[str, Any]] = []
    mdi = {t: i for i, t in enumerate(md["time"])} if md else {}
    for i, dd in enumerate(d.fut_dates(10)):
        row = {"date": dd.isoformat()}
        for k in ("weather_code", "temperature_2m_max", "temperature_2m_min", "apparent_temperature_max", "precipitation_sum",
                  "precipitation_probability_max", "wind_speed_10m_max", "wind_gusts_10m_max", "wind_direction_10m_dominant",
                  "uv_index_max", "sunrise", "sunset", "et0_fao_evapotranspiration"):
            arr = d.fut(k, 10)
            row[k] = arr[i] if i < len(arr) else None
        if normals:
            row["normal_tmax"] = round(nasa_power.normal_for(normals, "tmax", dd), 1)
            row["normal_tmin"] = round(nasa_power.normal_for(normals, "tmin", dd), 1)
            row["normal_precip"] = round(nasa_power.normal_for(normals, "precip", dd), 1)
        if md and dd.isoformat() in mdi:
            j = mdi[dd.isoformat()]
            row["models"] = {m: {"tmax": f["temperature_2m_max"][j] if f.get("temperature_2m_max") else None,
                                 "tmin": f["temperature_2m_min"][j] if f.get("temperature_2m_min") else None,
                                 "precip": f["precipitation_sum"][j] if f.get("precipitation_sum") else None}
                             for m, f in md["models"].items()}
            tx = [v["tmax"] for v in row["models"].values() if v["tmax"] is not None]
            row["tmax_spread"] = round(max(tx) - min(tx), 1) if len(tx) > 1 else None
        daily_out.append(row)

    sources: list[Provenance] = [openmeteo.provenance(None, notes="Best-match blend for current/hourly/daily")]
    if md:
        ms = list(md["models"])
        latest = max((runs.get(m) for m in ms if runs.get(m)), default=None)
        sources.append(openmeteo.provenance(ms, issue=latest, notes="Per-model runs used for confidence (" +
                                            ", ".join(f"{openmeteo.MODEL_META[m][1]} {runs[m]:%d %b %H}Z" for m in ms if runs.get(m)) + ")"))
    if normals:
        sources.append(nasa_power.provenance())
    sources.append(Provenance(source="NDMA SACHET", model="CAP 1.2 feed (IMD, CWC, SDMAs)", url="https://sachet.ndma.gov.in",
                              retrieved_at=datetime.now(timezone.utc), licence="Government of India public alerts"))
    return Dashboard(location=loc, generated_at=datetime.now(timezone.utc), timezone=fc.get("timezone", "Asia/Kolkata"),
                     current=current, hourly=hourly_out, daily=daily_out, anomaly=anom, risks=risks, warnings=warns,
                     sources=sources, notices=notices)


async def farmer(lat: float, lon: float, crop: str, stage: str, name: str | None = None, taluka: str | None = None) -> dict[str, Any]:
    loc = locate(lat, lon, name, taluka)
    fc = await openmeteo.point_forecast(lat, lon)
    notices: list[str] = []
    warns = await _safe(sachet.warnings(loc.state, loc.district, district_id=loc.district_id), notices, "Official warnings (SACHET)") or []
    rep = farmer_engine.assess(daily(fc), hourly(fc), crop, stage)
    rep["location"] = loc.model_dump()
    rep["warnings"] = [w.model_dump(mode="json") for w in warns]
    rep["sources"] = [openmeteo.provenance(None).model_dump(mode="json")]
    rep["notices"] = notices
    return rep


# ---------------- Government / regional ----------------
_mask_cache: dict[tuple, dict[str, np.ndarray]] = {}


def _masks(g: gridstore.Grid) -> dict[str, np.ndarray]:
    key = (g.lats.size, g.lons.size, float(g.lats[0]), float(g.lons[0]), float(g.lats[-1]))
    if key not in _mask_cache:
        b = boundaries()
        _mask_cache.clear()
        _mask_cache[key] = {d.id: b.grid_mask(d, g.lats, g.lons) for d in b.districts}
    return _mask_cache[key]


def _window(g: gridstore.Grid, hours: int) -> list[int]:
    now = datetime.now(timezone.utc)
    end = now + timedelta(hours=hours)
    idx = [i for i, t in enumerate(g.times) if now - timedelta(hours=3) <= t <= end]
    return idx or [0]


METRICS = {
    "tmax": {"label": "Max temperature", "unit": "°C"},
    "tmin": {"label": "Min temperature", "unit": "°C"},
    "rain": {"label": "Rainfall total", "unit": "mm"},
    "gust": {"label": "Max wind", "unit": "km/h"},
    "rh": {"label": "Mean humidity", "unit": "%"},
}


async def india_districts(metric: str, hours: int) -> dict[str, Any]:
    """District zonal statistics from the gridded forecast (Earth2Studio store or fallback)."""
    g = await gridstore.get_grid()
    masks = await asyncio.to_thread(_masks, g)
    idx = _window(g, hours)
    if metric in ("tmax", "tmin"):
        stack = np.stack([g.field("t2m", i) for i in idx])
        agg = np.nanmax(stack, 0) if metric == "tmax" else np.nanmin(stack, 0)
    elif metric == "rain":
        agg = np.nansum(np.stack([g.fields["tp"][i] for i in idx]), 0)
    elif metric == "gust":
        var = "gust" if "gust" in g.fields else "fg10m" if "fg10m" in g.fields else "wind"
        agg = np.nanmax(np.stack([g.field(var, i) for i in idx]), 0)
    elif metric == "rh":
        var = "r2m" if "r2m" in g.fields else "rh"
        agg = np.nanmean(np.stack([g.field(var, i) for i in idx]), 0)
    else:
        raise KeyError(metric)
    b = boundaries()
    vals: dict[str, float | None] = {}
    for d in b.districts:
        m = masks.get(d.id)
        if m is not None and m.any():
            cell = agg[m]
            v = float(np.nanmax(cell) if metric in ("tmax", "gust", "rain") else np.nanmin(cell) if metric == "tmin" else np.nanmean(cell))
        else:
            y = int(np.clip(np.searchsorted(g.lats, d.lat), 1, g.lats.size - 1))
            x = int(np.clip(np.searchsorted(g.lons, d.lon), 1, g.lons.size - 1))
            y = y if abs(g.lats[y] - d.lat) < abs(g.lats[y - 1] - d.lat) else y - 1
            x = x if abs(g.lons[x] - d.lon) < abs(g.lons[x - 1] - d.lon) else x - 1
            v = float(agg[y, x])
        vals[d.id] = None if np.isnan(v) else round(v, 1)
    return {"metric": metric, **METRICS[metric], "hours": hours, "values": vals,
            "window": [g.times[idx[0]].isoformat(), g.times[idx[-1]].isoformat()],
            "aggregation": "district max of grid cells" if metric in ("tmax", "gust", "rain") else "district min" if metric == "tmin" else "district mean",
            "meta": g.meta().model_dump(mode="json", exclude={"times"})}


async def state_districts(state_slug: str) -> dict[str, Any]:
    """Per-district 7-day forecast + anomaly + IMD-rule risk levels for one state.
    Cached 20 min: the view, Excel and PDF exports share one upstream fetch (Open-Meteo quota)."""
    from .cache import cache

    if not boundaries().districts_of(state_slug):
        raise KeyError(state_slug)
    return await cache.get_or_set(f"state:{state_slug}", 1200, lambda: _state_districts(state_slug))


async def _state_districts(state_slug: str) -> dict[str, Any]:
    ds = boundaries().districts_of(state_slug)
    if not ds:
        raise KeyError(state_slug)
    pts = [(d.lat, d.lon) for d in ds]
    try:
        rows = await openmeteo.multi_point_daily(pts)
    except Exception:  # noqa: BLE001 — one retry after a short pause (transient network / rate limit)
        await asyncio.sleep(3)
        rows = await openmeteo.multi_point_daily(pts)
    sem = asyncio.Semaphore(6)

    async def norm(d):
        async with sem:
            try:
                return await nasa_power.normals(d.lat, d.lon)
            except Exception:  # noqa: BLE001
                return None

    normals = await asyncio.gather(*(norm(d) for d in ds))
    notices: list[str] = []
    try:
        warns = await sachet.warnings(ds[0].state)
    except Exception:  # noqa: BLE001
        warns = []
        notices.append("Official warnings unavailable right now.")
    out = []
    t0 = today_local()
    for d, r, n in zip(ds, rows, normals):
        dl = r.get("daily", {})
        dates = dl.get("time", [])
        i0 = next((i for i, x in enumerate(dates) if x >= t0.isoformat()), 0)
        tmax, tmin = dl.get("temperature_2m_max", [])[i0 : i0 + 7], dl.get("temperature_2m_min", [])[i0 : i0 + 7]
        rain, gust = dl.get("precipitation_sum", [])[i0 : i0 + 7], dl.get("wind_gusts_10m_max", [])[i0 : i0 + 7]
        past = dl.get("precipitation_sum", [])[max(0, i0 - 30) : i0]
        fdates = [datetime.fromisoformat(x).date() for x in dates[i0 : i0 + 7]]
        pdates = [datetime.fromisoformat(x).date() for x in dates[max(0, i0 - 30) : i0]]
        terrain = classify(d.lat, d.lon, r.get("elevation"))
        heat = max((risk_engine.heat_level(x, nasa_power.normal_for(n, "tmax", dd) if n else None, terrain)[0] for x, dd in zip(tmax, fdates)), default=0)
        cold = max((risk_engine.cold_level(x, nasa_power.normal_for(n, "tmin", dd) if n else None, terrain)[0] for x, dd in zip(tmin, fdates)), default=0)
        rainl = max((risk_engine.rain_level(x) for x in rain), default=0)
        windl = max((risk_engine.wind_level(x) for x in gust), default=0)
        tmax_anom = None
        if n and nz(tmax):
            tmax_anom = round(sum(x - nasa_power.normal_for(n, "tmax", dd) for x, dd in zip(tmax, fdates) if x is not None) / len(nz(tmax)), 1)
        r30 = sum(nz(past))
        n30 = nasa_power.normal_sum(n, "precip", pdates) if n else None
        pct = round((r30 - n30) / n30 * 100) if n30 and n30 >= T.DROUGHT["min_normal_30d_mm"] else None
        n7 = nasa_power.normal_sum(n, "precip", fdates) if n else None
        dw = [w for w in warns if d.id in w.district_ids]
        out.append({
            "id": d.id, "district": d.district, "lat": d.lat, "lon": d.lon, "terrain": terrain,
            "tmax_7d_max": max(nz(tmax) or [None]) if nz(tmax) else None, "tmin_7d_min": min(nz(tmin)) if nz(tmin) else None,
            "tmax_anom_7d": tmax_anom, "rain_7d": round(sum(nz(rain)), 1), "rain_7d_normal": round(n7, 1) if n7 is not None else None,
            "rain_max_day": max(nz(rain) or [0]), "gust_max": max(nz(gust) or [0]),
            "rain_30d": round(r30, 1), "rain_30d_normal": round(n30, 1) if n30 is not None else None, "rain_30d_pct": pct,
            "rain_30d_cat": T.rain_departure_category(pct) if pct is not None else ("Dry season" if n30 is not None else None),
            "levels": {"heat": heat, "cold": cold, "rain": rainl, "wind": windl}, "max_level": max(heat, cold, rainl, windl),
            "official_warnings": len(dw),
        })
    out.sort(key=lambda x: (-x["max_level"], -(x["rain_7d"] or 0)))
    return {"state": ds[0].state, "state_slug": state_slug, "generated_at": datetime.now(timezone.utc).isoformat(),
            "districts": out, "warnings": [w.model_dump(mode="json") for w in warns if w.match != "national"],
            "sources": [openmeteo.provenance(None).model_dump(mode="json"), nasa_power.provenance().model_dump(mode="json")],
            "method": "Forecast at each district's representative interior point; IMD heat/cold/rain criteria; Beaufort gusts.",
            "notices": notices}
