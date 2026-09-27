"""Open-Meteo provider: point forecasts (best-match + per-model), geocoding, coarse grids.

Open-Meteo re-serves national model output (ECMWF IFS 0.25°, NOAA GFS 0.25°, DWD ICON).
Free tier is for non-commercial use (10k calls/day); set BWI_OPENMETEO_API_KEY for commercial.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import numpy as np

from .. import http
from ..cache import cache
from ..config import settings
from ..schemas import Provenance

SOURCE = "Open-Meteo"
LICENCE = "CC BY 4.0 (Open-Meteo); underlying models: ECMWF (CC BY 4.0), NOAA GFS (public domain), DWD ICON"

MODEL_META = {  # Open-Meteo model id -> (meta.json id, display)
    "ecmwf_ifs025": ("ecmwf_ifs025", "ECMWF IFS 0.25°"),
    "gfs_seamless": ("ncep_gfs025", "NOAA GFS 0.25°"),
    "icon_seamless": ("dwd_icon", "DWD ICON"),
}

HOURLY = [
    "temperature_2m", "relative_humidity_2m", "dew_point_2m", "apparent_temperature",
    "precipitation_probability", "precipitation", "weather_code", "pressure_msl", "cloud_cover",
    "visibility", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "cape",
    "soil_moisture_9_to_27cm", "et0_fao_evapotranspiration", "is_day",
]
DAILY = [
    "weather_code", "temperature_2m_max", "temperature_2m_min", "apparent_temperature_max",
    "precipitation_sum", "precipitation_probability_max", "precipitation_hours",
    "wind_speed_10m_max", "wind_gusts_10m_max", "wind_direction_10m_dominant",
    "et0_fao_evapotranspiration", "uv_index_max", "sunrise", "sunset", "shortwave_radiation_sum",
]
CURRENT = [
    "temperature_2m", "relative_humidity_2m", "apparent_temperature", "is_day", "precipitation",
    "weather_code", "cloud_cover", "pressure_msl", "surface_pressure", "wind_speed_10m",
    "wind_direction_10m", "wind_gusts_10m",
]
MODEL_DAILY = ["temperature_2m_max", "temperature_2m_min", "precipitation_sum", "wind_gusts_10m_max"]


def _params(extra: dict[str, Any]) -> dict[str, Any]:
    p = dict(extra)
    if settings.openmeteo_api_key:
        p["apikey"] = settings.openmeteo_api_key
    return p


def _url(base: str) -> str:
    if settings.openmeteo_api_key:
        return base.replace("://api.", "://customer-api.")
    return base


async def model_run_times() -> dict[str, datetime | None]:
    async def load() -> dict[str, datetime | None]:
        out: dict[str, datetime | None] = {}
        for mid, (meta_id, _) in MODEL_META.items():
            try:
                r = await http.get(f"https://api.open-meteo.com/data/{meta_id}/static/meta.json", retries=0)
                out[mid] = datetime.fromtimestamp(r.json()["last_run_initialisation_time"], tz=timezone.utc)
            except Exception:  # noqa: BLE001
                out[mid] = None
        return out

    return await cache.get_or_set("om:runs", 900, load)


async def point_forecast(lat: float, lon: float) -> dict[str, Any]:
    """Best-match forecast with 31 past days (model analysis) for recent-rain & dry-spell."""
    key = f"om:pt:{lat:.3f}:{lon:.3f}"

    async def load() -> dict[str, Any]:
        r = await http.get(_url(settings.openmeteo_forecast_url), _params({
            "latitude": lat, "longitude": lon, "timezone": settings.timezone,
            "current": ",".join(CURRENT), "hourly": ",".join(HOURLY), "daily": ",".join(DAILY),
            "past_days": 31, "forecast_days": 10, "wind_speed_unit": "kmh",
        }))
        return r.json()

    return await cache.get_or_set(key, 900, load)


async def model_daily(lat: float, lon: float) -> dict[str, Any]:
    """Per-model daily fields for ensemble-of-opportunity confidence."""
    key = f"om:md:{lat:.3f}:{lon:.3f}"

    async def load() -> dict[str, Any]:
        r = await http.get(_url(settings.openmeteo_forecast_url), _params({
            "latitude": lat, "longitude": lon, "timezone": settings.timezone,
            "daily": ",".join(MODEL_DAILY), "models": ",".join(settings.openmeteo_models),
            "forecast_days": 10, "wind_speed_unit": "kmh",
        }))
        j = r.json()
        d = j.get("daily", {})
        per_model: dict[str, dict[str, list]] = {}
        for m in settings.openmeteo_models:
            fields = {v: d.get(f"{v}_{m}") for v in MODEL_DAILY}
            if any(x is not None and any(y is not None for y in x) for x in fields.values()):
                per_model[m] = fields
        return {"time": d.get("time", []), "models": per_model}

    return await cache.get_or_set(key, 1800, load)


async def multi_point_daily(points: list[tuple[float, float]], days: int = 7) -> list[dict[str, Any]]:
    """Daily forecast for many points (used for district-level Government view)."""
    out: list[dict[str, Any]] = []
    vars_ = ["temperature_2m_max", "temperature_2m_min", "precipitation_sum", "wind_gusts_10m_max",
             "precipitation_probability_max", "et0_fao_evapotranspiration"]
    for i in range(0, len(points), 100):
        chunk = points[i : i + 100]
        r = await http.get(_url(settings.openmeteo_forecast_url), _params({
            "latitude": ",".join(f"{p[0]:.4f}" for p in chunk),
            "longitude": ",".join(f"{p[1]:.4f}" for p in chunk),
            "daily": ",".join(vars_), "timezone": settings.timezone, "forecast_days": days,
            "past_days": 30, "wind_speed_unit": "kmh",
        }))
        j = r.json()
        out.extend(j if isinstance(j, list) else [j])
    return out


async def geocode(q: str, count: int = 10) -> list[dict[str, Any]]:
    key = f"om:geo:{q.lower()}:{count}"

    async def load() -> list[dict[str, Any]]:
        r = await http.get(settings.openmeteo_geocoding_url, {"name": q, "count": count, "countryCode": "IN", "language": "en"})
        res = r.json().get("results", []) or []
        return [
            {
                "name": x["name"], "lat": x["latitude"], "lon": x["longitude"],
                "state": x.get("admin1"), "district": (x.get("admin2") or "").replace(" District", "") or None,
                "taluka": x.get("admin3"), "locality": x.get("admin4"),
                "elevation_m": x.get("elevation"), "population": x.get("population"),
                "feature_code": x.get("feature_code"),
            }
            for x in res
        ]

    return await cache.get_or_set(key, 86400, load)


GRID_VARS = {
    # api var -> (open-meteo hourly var, unit)
    "t2m": ("temperature_2m", "°C"),
    "tp": ("precipitation", "mm/3h"),
    "rh": ("relative_humidity_2m", "%"),
    "msl": ("pressure_msl", "hPa"),
    "tcc": ("cloud_cover", "%"),
    "gust": ("wind_gusts_10m", "km/h"),
}


async def coarse_grid() -> dict[str, Any]:
    """Coarse India grid from GFS via Open-Meteo, 3-hourly, 5 days. Fallback only."""

    async def load() -> dict[str, Any]:
        w, s, e, n = settings.fallback_grid_bbox
        step = settings.fallback_grid_step_deg
        lats = np.round(np.arange(s, n + 1e-6, step), 3)
        lons = np.round(np.arange(w, e + 1e-6, step), 3)
        pts = [(float(la), float(lo)) for la in lats for lo in lons]
        hourly = [v[0] for v in GRID_VARS.values()] + ["wind_speed_10m", "wind_direction_10m"]
        rows: list[dict[str, Any]] = []
        for i in range(0, len(pts), 100):
            chunk = pts[i : i + 100]
            r = await http.get(_url(settings.openmeteo_forecast_url), _params({
                "latitude": ",".join(f"{p[0]}" for p in chunk),
                "longitude": ",".join(f"{p[1]}" for p in chunk),
                "hourly": ",".join(hourly), "models": "gfs_seamless", "forecast_days": 5,
                "temporal_resolution": "hourly_3", "timezone": "GMT", "wind_speed_unit": "ms",
                "cell_selection": "nearest",
            }))
            j = r.json()
            rows.extend(j if isinstance(j, list) else [j])
            await asyncio.sleep(4)  # stay well inside the free tier's per-minute budget
        times = rows[0]["hourly"]["time"]
        ny, nx, nt = lats.size, lons.size, len(times)
        fields: dict[str, np.ndarray] = {}
        for k, (ov, _) in GRID_VARS.items():
            arr = np.array([[np.nan if v is None else v for v in r["hourly"][ov]] for r in rows], dtype=np.float32)
            fields[k] = arr.T.reshape(nt, ny, nx)
        spd = np.array([[np.nan if v is None else v for v in r["hourly"]["wind_speed_10m"]] for r in rows], dtype=np.float32).T
        dr = np.array([[np.nan if v is None else v for v in r["hourly"]["wind_direction_10m"]] for r in rows], dtype=np.float32).T
        rad = np.deg2rad(dr)
        fields["u10m"] = (-spd * np.sin(rad)).reshape(nt, ny, nx)
        fields["v10m"] = (-spd * np.cos(rad)).reshape(nt, ny, nx)
        runs = await model_run_times()
        return {
            "lats": lats, "lons": lons,
            "times": [datetime.fromisoformat(t).replace(tzinfo=timezone.utc) for t in times],
            "fields": fields, "issue_time": runs.get("gfs_seamless"),
        }

    return await cache.get_or_set("om:grid", 3 * 3600, load)


def provenance(models: list[str] | None = None, issue: datetime | None = None, notes: str | None = None) -> Provenance:
    return Provenance(
        source=SOURCE,
        model=", ".join(MODEL_META.get(m, (m, m))[1] for m in models) if models else "best_match (Open-Meteo blend)",
        issue_time=issue, retrieved_at=datetime.now(timezone.utc), url="https://open-meteo.com",
        licence=LICENCE, notes=notes,
    )
