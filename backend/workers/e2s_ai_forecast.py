"""EXPERIMENTAL — Earth2Studio AI forecast worker (FourCastNet v1, "FCN").

Runs an NVIDIA Earth2Studio prognostic AI model initialised from the NOAA GFS analysis and
writes an India store in the same contract as the GFS store (source = "Earth2Studio AI").
The API exposes it as a second map source (`?source=ai`) for side-by-side comparison.

Why FCN: it is the smallest 0.25° global Earth2Studio model that forecasts 10 m wind,
2 m temperature and MSL pressure. On an RTX 3050 (6 GB) run it in half precision; if CUDA
reports < 5 GB free the worker refuses to start on GPU (use --device cpu, ~1–2 min per step).
It does NOT forecast precipitation; GFS remains the operational source. AI forecasts are
research output — never feed them into warnings without verification against IMD.

    python workers/e2s_ai_forecast.py --steps 20            # 5 days, 6-hourly
    python workers/e2s_ai_forecast.py --device cpu --steps 4
"""
from __future__ import annotations

import argparse
import logging
import os
import pathlib
import sys
import time
from collections import OrderedDict
from datetime import timedelta, timezone

import numpy as np
import xarray as xr

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from e2s_gfs_ingest import INDIA_BBOX, latest_cycle  # noqa: E402

log = logging.getLogger("e2s_ai_forecast")
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT_VARS = ["t2m", "u10m", "v10m", "msl", "tcwv"]
MIN_FREE_GB = 5.0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cycle", help="YYYYMMDDHH initial time (UTC); default latest GFS cycle")
    ap.add_argument("--steps", type=int, default=20, help="6-hour steps (20 = 5 days)")
    ap.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    ap.add_argument("--out", default=str(ROOT / "data" / "grids"))
    ap.add_argument("--keep", type=int, default=2)
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        from loguru import logger as _lg

        _lg.remove()
        _lg.add(sys.stderr, level="WARNING")
    except ImportError:
        pass

    import torch
    from earth2studio.data import GFS
    from earth2studio.io import XarrayBackend
    from earth2studio.models.px import FCN
    from earth2studio.run import deterministic

    dev = a.device
    if dev == "auto":
        dev = "cuda" if torch.cuda.is_available() else "cpu"
    if dev == "cuda":
        free, total = torch.cuda.mem_get_info()
        log.info("GPU %s: %.1f / %.1f GB free", torch.cuda.get_device_name(0), free / 1e9, total / 1e9)
        if free / 1e9 < MIN_FREE_GB:
            log.error("Less than %.1f GB free VRAM — close other GPU apps or use --device cpu.", MIN_FREE_GB)
            return 3
    device = torch.device(dev)

    cycle = latest_cycle() if not a.cycle else __import__("datetime").datetime.strptime(a.cycle, "%Y%m%d%H")
    log.info("Loading FCN weights (first run downloads from Hugging Face; cached afterwards)")
    t0 = time.time()
    model = FCN.load_model(FCN.load_default_package()).to(device)
    model.eval()
    log.info("model ready in %.0fs on %s", time.time() - t0, device)

    w, s, e, n = INDIA_BBOX
    lat = np.arange(90, -90.25, -0.25)
    lat = lat[(lat >= s) & (lat <= n)]
    lon = np.arange(0, 360, 0.25)
    lon = lon[(lon >= w) & (lon <= e)]
    out_coords = OrderedDict({"variable": np.array(OUT_VARS), "lat": lat, "lon": lon})
    io = XarrayBackend()
    ctx = torch.autocast(device_type="cuda", dtype=torch.float16) if dev == "cuda" else torch.no_grad()
    t0 = time.time()
    with torch.no_grad(), ctx:
        deterministic([np.datetime64(cycle)], a.steps, model, GFS(), io, output_coords=out_coords, device=device, verbose=True)
    log.info("inference %d steps in %.0fs", a.steps, time.time() - t0)

    ds_in = io.root.isel(time=0)
    leads = [int(x / np.timedelta64(1, "h")) for x in ds_in.lead_time.values]
    times = [np.datetime64(cycle + timedelta(hours=L), "s") for L in leads]
    ds = xr.Dataset(coords={"time": times, "lat": np.sort(ds_in.lat.values).astype("float32"), "lon": ds_in.lon.values.astype("float32")})
    for v in OUT_VARS:
        arr = ds_in[v].sortby("lat").values.astype("float32")
        if v == "t2m":
            arr = arr - 273.15
        if v == "msl":
            arr = arr / 100.0
        if v == "tcwv":
            arr = np.clip(arr, 0, None)
        ds[v] = (("time", "lat", "lon"), arr)
    ds.attrs = {"source": "Earth2Studio AI", "model": "FourCastNet v1 (FCN) from GFS analysis",
                "issue_time": cycle.replace(tzinfo=timezone.utc).isoformat(), "step_hours": 6,
                "experimental": "true", "licence": "FCN weights: NVIDIA (see model card)"}
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    target = out / f"ai_fcn_{cycle:%Y%m%d%H}.nc"
    tmp = target.with_suffix(".tmp.nc")
    ds.to_netcdf(tmp, encoding={k: {"zlib": True, "complevel": 4} for k in ds.data_vars})
    os.replace(tmp, target)
    log.info("wrote %s (%.1f MB)", target.name, target.stat().st_size / 1e6)
    for k in ds.data_vars:
        log.info("  %-5s min %8.2f mean %8.2f max %8.2f", k, float(ds[k].min()), float(ds[k].mean()), float(ds[k].max()))
    for f in sorted(out.glob("ai_fcn_*.nc"))[: -a.keep]:
        f.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
