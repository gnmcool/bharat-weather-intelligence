"""Climatology baseline from NASA POWER (MERRA-2 reanalysis, ~0.5°×0.625°), 1991–2020.

Normals are day-of-year means over a 31-day window centred on each calendar day
(circular), which is the standard way to get a smooth daily normal from 30 years of data.
Results are cached permanently on disk per 0.5° cell.

Production upgrade: IMD gridded rainfall (0.25°, 1901–) and temperature (1°) normals from
IMD Pune — see docs/METHODOLOGY.md §Baselines. The provider interface is the same.
"""
from __future__ import annotations

from datetime import date
from typing import Any

import numpy as np

from .. import http
from ..cache import disk_get, disk_set
from ..config import settings
from ..schemas import Provenance

WINDOW = 15  # ±15 days => 31-day window


def _cell(lat: float, lon: float) -> tuple[float, float]:
    return round(lat * 2) / 2, round(lon / 0.625) * 0.625


async def normals(lat: float, lon: float) -> dict[str, Any]:
    clat, clon = _cell(lat, lon)
    y0, y1 = settings.climatology_start_year, settings.climatology_end_year
    key = f"{clat:.3f}:{clon:.3f}:{y0}-{y1}"
    hit = disk_get("power_normals", key)
    if hit:
        return hit
    r = await http.get(settings.nasa_power_url, {
        "parameters": "T2M_MAX,T2M_MIN,PRECTOTCORR", "community": "AG",
        "latitude": clat, "longitude": clon, "start": f"{y0}0101", "end": f"{y1}1231", "format": "JSON",
    }, timeout=120)
    p = r.json()["properties"]["parameter"]
    out = {"lat": clat, "lon": clon, "period": f"{y0}–{y1}"}
    for name, var in (("tmax", "T2M_MAX"), ("tmin", "T2M_MIN"), ("precip", "PRECTOTCORR")):
        sums = np.zeros(366)
        cnt = np.zeros(366)
        for k, v in p[var].items():
            if v is None or v <= -998:
                continue
            d = date(int(k[:4]), int(k[4:6]), int(k[6:]))
            doy = _doy366(d)
            sums[doy] += v
            cnt[doy] += 1
        daily = np.where(cnt > 0, sums / np.maximum(cnt, 1), np.nan)
        # circular 31-day smoothing
        ext = np.concatenate([daily[-WINDOW:], daily, daily[:WINDOW]])
        kern = np.ones(2 * WINDOW + 1)
        valid = ~np.isnan(ext)
        sm = np.convolve(np.where(valid, ext, 0), kern, "valid") / np.maximum(np.convolve(valid, kern, "valid"), 1)
        out[name] = [round(float(x), 2) for x in sm]
    disk_set("power_normals", key, out)
    return out


def _doy366(d: date) -> int:
    """Day-of-year index on a fixed 366-day calendar (Feb 29 = index 59)."""
    base = date(2000, 1, 1)  # leap year
    return (date(2000, d.month, d.day) - base).days


def normal_for(n: dict[str, Any], var: str, d: date) -> float:
    return float(n[var][_doy366(d)])


def normal_sum(n: dict[str, Any], var: str, days: list[date]) -> float:
    return float(sum(n[var][_doy366(d)] for d in days))


def provenance() -> Provenance:
    return Provenance(
        source="NASA POWER", model="MERRA-2 reanalysis (daily)",
        url="https://power.larc.nasa.gov",
        licence="NASA open data (no restrictions; attribution requested)",
        notes=f"Baseline {settings.climatology_start_year}–{settings.climatology_end_year}, 31-day centred window. "
              "Reanalysis grid (~50 km) — local station normals can differ, especially near coasts and hills.",
    )
