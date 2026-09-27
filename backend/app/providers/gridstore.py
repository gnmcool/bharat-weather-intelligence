"""Gridded forecast fields for the map.

Primary: NetCDF stores written by the Earth2Studio worker (workers/e2s_gfs_ingest.py) —
NOAA GFS 0.25° over India, 3-hourly. Fallback: coarse GFS grid from Open-Meteo so the map
still works before the worker has ever run.

Store contract (one file per GFS cycle, data/grids/gfs_<YYYYMMDDHH>.nc):
  dims  time, lat (ascending), lon (ascending)
  vars  t2m [°C], u10m/v10m [m/s], msl [hPa], tp [mm per step], r2m [%], tcwv [kg m-2],
        fg10m [m/s] (optional; any extra var is exposed automatically)
  attrs source, model, issue_time (ISO, UTC), step_hours
"""
from __future__ import annotations

import logging
import pathlib
import time
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

import numpy as np
import xarray as xr

from ..config import settings
from ..schemas import GridMeta
from .. import http
from . import openmeteo

log = logging.getLogger("bwi.grid")

VAR_INFO: dict[str, dict[str, Any]] = {
    "t2m": {"label": "Temperature", "unit": "°C"},
    "tp": {"label": "Rain (per step)", "unit": "mm"},
    "r2m": {"label": "Humidity", "unit": "%"},
    "rh": {"label": "Humidity", "unit": "%"},
    "msl": {"label": "Pressure (MSL)", "unit": "hPa"},
    "tcwv": {"label": "Precipitable water", "unit": "kg/m²"},
    "tcc": {"label": "Clouds (forecast)", "unit": "%"},
    "gust": {"label": "Wind gust", "unit": "km/h"},
    "fg10m": {"label": "Wind gust", "unit": "km/h"},
    "wind": {"label": "Wind speed", "unit": "km/h"},
}


SOURCES = {"gfs": "gfs_*.nc", "ai": "ai_*.nc"}


def available_sources() -> list[str]:
    return [k for k in SOURCES if latest_store(k) is not None]


def latest_store(kind: str = "gfs") -> pathlib.Path | None:
    d = settings.grid_store_dir
    if not d.exists():
        return None
    files = sorted(d.glob(SOURCES.get(kind, "gfs_*.nc")), key=lambda f: f.stem.split("_")[-1])
    if not files:
        return None
    f = files[-1]
    try:
        issue = datetime.strptime(f.stem.split("_")[-1], "%Y%m%d%H").replace(tzinfo=timezone.utc)
    except (IndexError, ValueError):
        return f
    age_h = (datetime.now(timezone.utc) - issue).total_seconds() / 3600
    if age_h > settings.grid_store_max_age_h:
        log.warning("Earth2Studio store %s is %.1f h old — using fallback", f.name, age_h)
        return None
    return f


@lru_cache(maxsize=4)
def _open(path: str, mtime: float) -> xr.Dataset:  # mtime busts cache on rewrite
    return xr.open_dataset(path).load()


class Grid:
    """Uniform in-memory view over either source."""

    def __init__(self, lats, lons, times, fields: dict[str, np.ndarray], source: str, model: str,
                 issue: datetime | None, note: str, notices: list[str]):
        self.lats, self.lons, self.times = np.asarray(lats), np.asarray(lons), list(times)
        self.fields, self.source, self.model, self.issue, self.note, self.notices = fields, source, model, issue, note, notices

    def meta(self) -> GridMeta:
        vars_ = {k: VAR_INFO.get(k, {"label": k, "unit": ""}) for k in self.fields if k not in ("u10m", "v10m")}
        if "u10m" in self.fields:
            vars_["wind"] = VAR_INFO["wind"]
        dx = float(self.lons[1] - self.lons[0]) if self.lons.size > 1 else 0.25
        dy = float(self.lats[1] - self.lats[0]) if self.lats.size > 1 else 0.25
        return GridMeta(
            source=self.source, model=self.model, issue_time=self.issue, times=self.times, variables=vars_,
            bbox=(float(self.lons[0]), float(self.lats[0]), float(self.lons[-1]), float(self.lats[-1])),
            nx=int(self.lons.size), ny=int(self.lats.size), dx=dx, dy=dy, resolution_note=self.note,
            notices=self.notices,
        )

    def field(self, var: str, ti: int) -> np.ndarray:
        if var == "wind":
            u, v = self.fields["u10m"][ti], self.fields["v10m"][ti]
            return np.hypot(u, v) * 3.6
        a = self.fields[var][ti]
        if var in ("fg10m",):
            return a * 3.6
        return a


_remote = {"checked": 0.0, "etag": None}


async def sync_remote_store() -> None:
    """Cloud mode: fetch the newest Earth2Studio store published by the GitHub Actions ingest
    (settings.grid_store_url). Checked at most every grid_store_refresh_min; ETag avoids
    re-downloading an unchanged file."""
    url = settings.grid_store_url
    if not url or time.time() - _remote["checked"] < settings.grid_store_refresh_min * 60:
        return
    async with http.semaphore("grid-sync", 1):
        if time.time() - _remote["checked"] < settings.grid_store_refresh_min * 60:
            return
        _remote["checked"] = time.time()
        d = settings.grid_store_dir
        d.mkdir(parents=True, exist_ok=True)
        tmp = d / "download.part"
        headers = {"If-None-Match": _remote["etag"]} if _remote["etag"] and any(d.glob("gfs_*.nc")) else {}
        try:
            async with http.client().stream("GET", url, headers=headers, timeout=180) as r:
                if r.status_code == 304:
                    return
                r.raise_for_status()
                with open(tmp, "wb") as f:
                    async for chunk in r.aiter_bytes(1 << 20):
                        f.write(chunk)
                _remote["etag"] = r.headers.get("etag")
            with xr.open_dataset(tmp) as ds:
                issue = datetime.fromisoformat(str(ds.attrs["issue_time"]).replace("Z", "+00:00"))
            name = f"gfs_{issue:%Y%m%d%H}.nc"
            tmp.replace(d / name)
            for old in d.glob("gfs_*.nc"):
                if old.name != name:
                    old.unlink(missing_ok=True)
            log.info("Downloaded Earth2Studio store %s", name)
        except Exception as e:  # noqa: BLE001 — keep serving the old store / fallback
            log.warning("Remote grid store unavailable: %s", e)
            tmp.unlink(missing_ok=True)


async def get_grid(source: str = "gfs") -> Grid:
    if source == "gfs":
        await sync_remote_store()
    path = latest_store(source)
    if path is None and source == "ai":
        raise FileNotFoundError("No Earth2Studio AI store — run workers/e2s_ai_forecast.py")
    if path is not None:
        ds = _open(str(path), path.stat().st_mtime)
        times = [datetime.fromisoformat(str(np.datetime_as_string(t, unit="s"))).replace(tzinfo=timezone.utc) for t in ds.time.values]
        fields = {k: ds[k].values.astype(np.float32) for k in ds.data_vars}
        issue = ds.attrs.get("issue_time")
        return Grid(ds.lat.values, ds.lon.values, times, fields,
                    source=ds.attrs.get("source", "NOAA GFS via Earth2Studio"), model=ds.attrs.get("model", "GFS 0.25°"),
                    issue=datetime.fromisoformat(issue) if issue else None,
                    note=(f"0.25° AI forecast (experimental) from Earth2Studio ({path.name})" if source == "ai"
                          else f"0.25° (~27 km) GFS grid processed by Earth2Studio ({path.name})"),
                    notices=(["EXPERIMENTAL AI forecast (FourCastNet). Not used for risk or warnings — compare with GFS."] if source == "ai" else []))
    g = await openmeteo.coarse_grid()
    return Grid(g["lats"], g["lons"], g["times"], g["fields"], source="Open-Meteo (fallback)", model="NOAA GFS 0.25° sampled",
                issue=g["issue_time"],
                note=f"Coarse {settings.fallback_grid_step_deg}° sampling — run the Earth2Studio worker for full 0.25° fields",
                notices=["Map fields are a coarse fallback. Run `workers/e2s_gfs_ingest.py` in WSL for 0.25° Earth2Studio fields."])


def time_index(g: Grid, t: str | None) -> int:
    if not t:
        now = datetime.now(timezone.utc)
        return int(np.argmin([abs((x - now).total_seconds()) for x in g.times]))
    tt = datetime.fromisoformat(t.replace("Z", "+00:00"))
    if tt.tzinfo is None:
        tt = tt.replace(tzinfo=timezone.utc)
    return int(np.argmin([abs((x - tt).total_seconds()) for x in g.times]))


def encode(a: np.ndarray, nd: int = 1) -> list[float | None]:
    flat = np.round(a.astype(np.float64).ravel(), nd)
    return [None if np.isnan(x) else float(x) for x in flat]


def sample(g: Grid, var: str, lat: float, lon: float) -> list[float | None]:
    """Bilinear time series at a point."""
    la, lo = g.lats, g.lons
    if not (la[0] <= lat <= la[-1] and lo[0] <= lon <= lo[-1]):
        return [None] * len(g.times)
    y = np.interp(lat, la, np.arange(la.size))
    x = np.interp(lon, lo, np.arange(lo.size))
    y0, x0 = int(np.floor(y)), int(np.floor(x))
    y1, x1 = min(y0 + 1, la.size - 1), min(x0 + 1, lo.size - 1)
    fy, fx = y - y0, x - x0
    out = []
    for ti in range(len(g.times)):
        a = g.field(var, ti)
        v = (a[y0, x0] * (1 - fx) * (1 - fy) + a[y0, x1] * fx * (1 - fy) + a[y1, x0] * (1 - fx) * fy + a[y1, x1] * fx * fy)
        out.append(None if np.isnan(v) else round(float(v), 2))
    return out
