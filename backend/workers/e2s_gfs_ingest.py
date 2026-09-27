"""Earth2Studio → Bharat Weather Intelligence GFS ingest worker.

Runs in the WSL2 environment where Earth2Studio is installed (it does NOT need the GPU —
GFS_FX only downloads NOAA GFS 0.25° GRIB2 byte ranges from AWS Open Data). Output is a
compact India NetCDF store that the FastAPI backend serves to the map.

    # inside WSL, in the env where earth2studio works:
    python workers/e2s_gfs_ingest.py                 # latest cycle, 0–240 h (10 days), 3-hourly
    python workers/e2s_gfs_ingest.py --hours 120     # 5 days (faster)
    python workers/e2s_gfs_ingest.py --cycle 2026092700

Output: backend/data/grids/gfs_<YYYYMMDDHH>.nc  (contract in app/providers/gridstore.py)

Notes on GFS precipitation (Earth2Studio 0.17 lexicon: tp = "596::APCP::surface"):
GFS APCP is accumulated in 6-hour buckets: f003 = 0–3 h, f006 = 0–6 h, f009 = 6–9 h,
f012 = 6–12 h … so the 3-hour amount is tp(L) when L % 6 == 3 and tp(L) − tp(L−3) when
L % 6 == 0. Verified against NOAA .idx files: line 596 is the 6-h bucket from f003 to f240.
Tiny negatives from GRIB packing are clipped.
"""
from __future__ import annotations

import argparse
import logging
import os
import pathlib
import sys
import time
from datetime import datetime, timedelta, timezone

import numpy as np
import xarray as xr

log = logging.getLogger("e2s_gfs_ingest")
ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "data" / "grids"
INDIA_BBOX = (58.0, -2.0, 104.0, 42.0)  # W, S, E, N — India + Arabian Sea, Bay of Bengal, Himalaya (edges fade on the map)
VARS = ["t2m", "u10m", "v10m", "msl", "tp", "r2m", "tcwv", "fg10m", "tcc"]


def latest_cycle(now: datetime | None = None, lag_h: int = 5) -> datetime:
    """GFS 0.25° is complete on AWS roughly 4–5 h after cycle time."""
    now = now or datetime.now(timezone.utc)
    t = now - timedelta(hours=lag_h)
    return t.replace(hour=(t.hour // 6) * 6, minute=0, second=0, microsecond=0, tzinfo=None)


def crop(da: xr.DataArray, bbox) -> xr.DataArray:
    w, s, e, n = bbox
    da = da.sortby("lat")
    return da.sel(lat=slice(s, n), lon=slice(w, e))


def fetch(ds, cycle: datetime, leads: list[int], variables: list[str], bbox, batch: int) -> xr.DataArray:
    parts = []
    for i in range(0, len(leads), batch):
        chunk = [timedelta(hours=h) for h in leads[i : i + batch]]
        t0 = time.time()
        da = ds(cycle, chunk, variables)  # dims: time, lead_time, variable, lat, lon (global)
        da = crop(da.isel(time=0), bbox).astype("float32").load()
        parts.append(da)
        log.info("fetched leads %s–%s h (%d vars) in %.1fs", leads[i], leads[min(i + batch, len(leads)) - 1], len(variables), time.time() - t0)
    return xr.concat(parts, dim="lead_time")


def to_store(da: xr.DataArray, cycle: datetime, leads: list[int]) -> xr.Dataset:
    v = {name: da.sel(variable=name).values for name in da["variable"].values.tolist()}
    out: dict[str, np.ndarray] = {}
    if "t2m" in v:
        out["t2m"] = v["t2m"] - 273.15 if np.nanmean(v["t2m"]) > 150 else v["t2m"]
    for k in ("u10m", "v10m", "r2m", "tcwv", "fg10m", "tcc"):
        if k in v:
            out[k] = v[k]
    if "msl" in v:
        out["msl"] = v["msl"] / 100.0 if np.nanmean(v["msl"]) > 5000 else v["msl"]
    if "tp" in v:
        raw = v["tp"]
        # Earth2Studio converts kg m-2 → m; convert to mm
        scale = 1000.0 if np.nanmax(raw) < 5 else 1.0
        acc = raw * scale
        tp3 = np.zeros_like(acc)
        step = leads[1] - leads[0] if len(leads) > 1 else 3
        for i, L in enumerate(leads):
            if step == 6 or L % 6 == 3:
                tp3[i] = acc[i]  # 6-hourly steps: bucket == step amount; L%6==3: 0–3 h of bucket
            else:  # L % 6 == 0 → bucket covers L−6..L, subtract the L−3 part
                j = leads.index(L - 3) if (L - 3) in leads else None
                tp3[i] = acc[i] - acc[j] if j is not None else acc[i]
        out["tp"] = np.clip(tp3, 0, None)
    lat = da["lat"].values
    lon = da["lon"].values
    times = [np.datetime64(cycle + timedelta(hours=L), "s") for L in leads]
    ds = xr.Dataset(
        {k: (("time", "lat", "lon"), a.astype("float32")) for k, a in out.items()},
        coords={"time": times, "lat": lat.astype("float32"), "lon": lon.astype("float32")},
        attrs={
            "source": "NOAA GFS via Earth2Studio",
            "model": "GFS 0.25° (GFS_FX)",
            "issue_time": cycle.replace(tzinfo=timezone.utc).isoformat(),
            "step_hours": int(leads[1] - leads[0]) if len(leads) > 1 else 3,
            "created": datetime.now(timezone.utc).isoformat(),
            "units": "t2m degC; u10m,v10m,fg10m m/s; msl hPa; tp mm per step; r2m %; tcwv kg m-2; tcc %",
            "licence": "NOAA GFS — public domain",
        },
    )
    for k, u in {"t2m": "degC", "u10m": "m s-1", "v10m": "m s-1", "fg10m": "m s-1", "msl": "hPa", "tp": "mm", "r2m": "%", "tcwv": "kg m-2", "tcc": "%"}.items():
        if k in ds:
            ds[k].attrs["units"] = u
    return ds


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cycle", help="YYYYMMDDHH (UTC); default = latest complete cycle")
    ap.add_argument("--hours", type=int, default=240, help="forecast length (240 = 10 days)")
    ap.add_argument("--step", type=int, default=3, choices=[3, 6])
    ap.add_argument("--vars", default=",".join(VARS))
    ap.add_argument("--bbox", default=",".join(map(str, INDIA_BBOX)), help="W,S,E,N")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--batch", type=int, default=8, help="lead times per request (memory control)")
    ap.add_argument("--keep", type=int, default=4, help="stores to retain")
    ap.add_argument("--source", default="aws", choices=["aws", "ncep"])
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    try:
        from loguru import logger as _lg  # earth2studio logs every byte-range at DEBUG

        _lg.remove()
        _lg.add(sys.stderr, level="WARNING")
    except ImportError:
        pass
    try:
        from earth2studio.data import GFS_FX
        from earth2studio.lexicon.gfs import GFSLexicon

        # Total cloud cover is published by GFS but not in the 0.17 lexicon. Instantaneous TCDC is
        # the first "TCDC:entire atmosphere" entry in every .idx file (f003–f240), and Earth2Studio
        # takes the first matching key — so this selects the instantaneous field, not the average.
        GFSLexicon.VOCAB.setdefault("tcc", "TCDC::entire atmosphere")
    except ImportError:
        log.error("earth2studio is not importable in this Python. Activate the env where it is installed.")
        return 2

    cycle = datetime.strptime(a.cycle, "%Y%m%d%H") if a.cycle else latest_cycle()
    bbox = tuple(float(x) for x in a.bbox.split(","))
    variables = [v.strip() for v in a.vars.split(",") if v.strip()]
    leads = list(range(a.step, a.hours + 1, a.step))
    out_dir = pathlib.Path(a.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"gfs_{cycle:%Y%m%d%H}.nc"
    log.info("GFS cycle %s, leads %d–%d h every %d h, vars %s → %s", cycle, leads[0], leads[-1], a.step, variables, target)

    ds_src = GFS_FX(source=a.source, cache=True, verbose=False)
    try:
        da = fetch(ds_src, cycle, leads, variables, bbox, a.batch)
    except Exception as e:  # noqa: BLE001
        if a.cycle:
            raise
        prev = cycle - timedelta(hours=6)
        log.warning("cycle %s not available (%s) — trying %s", cycle, e, prev)
        cycle = prev
        target = out_dir / f"gfs_{cycle:%Y%m%d%H}.nc"
        da = fetch(ds_src, cycle, leads, variables, bbox, a.batch)

    ds = to_store(da, cycle, leads)
    tmp = target.with_suffix(".tmp.nc")
    enc = {k: {"zlib": True, "complevel": 4} for k in ds.data_vars}
    ds.to_netcdf(tmp, encoding=enc)
    os.replace(tmp, target)
    log.info("wrote %s (%.1f MB): %s, grid %dx%d, %d steps", target.name, target.stat().st_size / 1e6,
             list(ds.data_vars), ds.lat.size, ds.lon.size, ds.time.size)
    for k in ds.data_vars:
        a_ = ds[k].values
        log.info("  %-5s min %8.2f  mean %8.2f  max %8.2f %s", k, np.nanmin(a_), np.nanmean(a_), np.nanmax(a_), ds[k].attrs.get("units", ""))

    olds = sorted(out_dir.glob("gfs_*.nc"))[: -a.keep]
    for f in olds:
        f.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
