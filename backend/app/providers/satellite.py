"""Satellite cloud imagery for the map — EUMETSAT Meteosat IODC (Indian Ocean Data Coverage).

Meteosat over 45.5°E images India every 15 min. EUMETView publishes it as an open WMS
(https://view.eumetsat.int). We proxy it as XYZ map tiles so the browser gets one origin,
caching, and (for infrared) a cloud-only rendering: the IR10.8 brightness image is turned
into white clouds on a transparent background, so the basemap stays visible underneath —
the same look as operational weather apps.

Production upgrade for India: ISRO INSAT-3D/3DR/3DS imagery via MOSDAC (needs an account).
"""
from __future__ import annotations

import asyncio
import io
import math
import re
import time
from typing import Any

from .. import http
from ..cache import cache

WMS = "https://view.eumetsat.int/geoserver/ows"
PRODUCTS: dict[str, dict[str, Any]] = {
    "ir": {"layer": "msg_iodc:ir108", "label": "Clouds — infrared (day & night)", "process": "ir_clouds"},
    "natural": {"layer": "msg_iodc:rgb_natural", "label": "Natural colour (daytime)", "process": None},
    "convection": {"layer": "msg_iodc:rgb_convection", "label": "Convection RGB (storms)", "process": None},
}
ATTRIBUTION = "Satellite: © EUMETSAT Meteosat IODC (EUMETView)"
_R = 6378137.0


def _tile_bbox(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    n = 2**z
    size = 2 * math.pi * _R / n
    minx = -math.pi * _R + x * size
    maxy = math.pi * _R - y * size
    return minx, maxy - size, minx + size, maxy


def _ir_to_clouds(png: bytes) -> bytes:
    """Grey IR image (bright = cold cloud tops) → white clouds with alpha, transparent clear sky."""
    import numpy as np
    from PIL import Image

    im = Image.open(io.BytesIO(png)).convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    grey = a[..., :3].mean(axis=2)
    src_alpha = a[..., 3] / 255.0
    # warm surfaces are dark grey; only cloud (brighter than ~95) should show
    t = np.clip((grey - 95.0) / 120.0, 0, 1)
    alpha = (t**0.8) * 235 * src_alpha
    out = np.zeros_like(a)
    # very cold tops (deep convection) get a faint blue tint
    cold = np.clip((grey - 200.0) / 55.0, 0, 1)
    out[..., 0] = 255 - 40 * cold
    out[..., 1] = 255 - 20 * cold
    out[..., 2] = 255
    out[..., 3] = alpha
    buf = io.BytesIO()
    Image.fromarray(out.astype(np.uint8), "RGBA").save(buf, "PNG", optimize=True)
    return buf.getvalue()


async def latest_time(product: str = "ir") -> str | None:
    """Most recent image time advertised in the WMS capabilities (cached 5 min)."""
    layer = PRODUCTS[product]["layer"]

    async def load() -> str | None:
        try:
            r = await http.get(WMS, {"service": "WMS", "request": "GetCapabilities", "version": "1.3.0",
                                     "namespace": layer.split(":")[0]}, retries=1, timeout=40)
            s = r.text
            i = s.find(f"<Name>{layer.split(':')[1]}</Name>")
            if i < 0:
                i = s.find(f"<Name>{layer}</Name>")
            m = re.search(r'<Dimension[^>]*name="time"[^>]*default="([^"]+)"', s[i : i + 6000]) if i >= 0 else None
            return m.group(1) if m else None
        except Exception:  # noqa: BLE001
            return None

    return await cache.get_or_set(f"sat:time:{product}", 300, load)


async def frames(product: str = "ir", hours: float = 3.0, step_min: int = 30) -> list[str]:
    """Image times (ISO, UTC) for an animation loop ending at the latest available slot."""
    from datetime import datetime, timedelta, timezone

    latest = await latest_time(product)
    end = datetime.fromisoformat(latest.replace("Z", "+00:00")) if latest else datetime.now(timezone.utc) - timedelta(minutes=30)
    end = end.replace(minute=(end.minute // 15) * 15, second=0, microsecond=0)
    n = int(hours * 60 // step_min) + 1
    return [(end - timedelta(minutes=step_min * k)).strftime("%Y-%m-%dT%H:%M:%SZ") for k in reversed(range(n))]


# EUMETSAT tiles are fetched at most 6 at a time so an animation (≈250 tiles) never starves the
# shared HTTP pool used by forecasts, warnings and baselines.
_SAT_SEM: "asyncio.Semaphore | None" = None


def _sem():
    global _SAT_SEM
    if _SAT_SEM is None:
        _SAT_SEM = asyncio.Semaphore(6)
    return _SAT_SEM


_TIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$")


async def tile(product: str, z: int, x: int, y: int, when: str | None = None) -> bytes:
    p = PRODUCTS[product]
    if when is not None and not _TIME_RE.match(when):
        raise ValueError("bad time")
    # latest: 10-minute buckets (new slots every 15 min); a fixed time never changes → cache long
    key = f"sat:{product}:{z}/{x}/{y}:{when or int(time.time() // 600)}"

    async def load() -> bytes:
        minx, miny, maxx, maxy = _tile_bbox(z, x, y)
        params = {
            "service": "WMS", "version": "1.3.0", "request": "GetMap", "layers": p["layer"], "styles": "",
            "crs": "EPSG:3857", "bbox": f"{minx},{miny},{maxx},{maxy}", "width": 256, "height": 256,
            "format": "image/png", "transparent": "true",
        }
        if when:
            params["time"] = when
        async with _sem():
            r = await http.get(WMS, params, retries=1, timeout=30)
        if not r.headers.get("content-type", "").startswith("image/"):
            raise ValueError("EUMETView did not return an image")
        return _ir_to_clouds(r.content) if p["process"] == "ir_clouds" else r.content

    return await cache.get_or_set(key, 6 * 3600 if when else 900, load)
