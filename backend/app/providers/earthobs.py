"""Free NASA Earth-observation layers for India.

* NASA GIBS (Global Imagery Browse Services) — open WMTS tiles, no key, CORS-enabled, so the
  browser loads tiles directly from NASA. This module publishes the layer catalogue with the
  latest available image time for each layer (read from the GIBS capabilities document).
* NASA FIRMS — active-fire detections (VIIRS 375 m, three satellites) for South Asia, last 24 h,
  free CSV without a key. Served as GeoJSON clipped to the India region.

Attribution: "Imagery: NASA EOSDIS GIBS / FIRMS".
"""
from __future__ import annotations

import csv
import io
import re
from typing import Any

from .. import http
from ..cache import cache

GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best"
CAPS = f"{GIBS}/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities"

LAYERS: list[dict[str, Any]] = [
    {"id": "rain_now", "label": "Rain now (satellite)", "layer": "IMERG_Precipitation_Rate_30min", "ext": "png",
     "tms": "GoogleMapsCompatible_Level6", "maxzoom": 6, "opacity": 0.85,
     "desc": "NASA GPM IMERG rain rate from satellites, every 30 min (~4 h behind). The free substitute for weather radar.",
     "legend": "https://gibs.earthdata.nasa.gov/legends/GPM_Precipitation_Rate_H.svg", "cadence": "30 min"},
    {"id": "flood", "label": "Flood water", "layer": "VIIRS_Combined_Flood_1-Day", "ext": "png",
     "tms": "GoogleMapsCompatible_Level9", "maxzoom": 9, "opacity": 0.95,
     "desc": "Surface water detected by VIIRS (daily). Red = water not normally present (flood). Cloud can hide floods.",
     "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_Flood_H.svg", "cadence": "daily"},
    {"id": "soil", "label": "Soil moisture (root zone)", "layer": "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture", "ext": "png",
     "tms": "GoogleMapsCompatible_Level6", "maxzoom": 6, "opacity": 0.8,
     "desc": "NASA SMAP L4 root-zone (0–100 cm) soil moisture, ~9 km, ~3 days behind. For district-scale drought, not single farms.",
     "legend": "https://gibs.earthdata.nasa.gov/legends/SMAP_Analyzed_Soil_Moisture_H.svg", "cadence": "daily (~3 day lag)"},
    {"id": "ndvi", "label": "Crop greenness (NDVI)", "layer": "VIIRS_SNPP_NDVI_8Day", "ext": "png",
     "tms": "GoogleMapsCompatible_Level8", "maxzoom": 8, "opacity": 0.85,
     "desc": "VIIRS 8-day vegetation index. Greener = healthier crop / vegetation cover.",
     "legend": "https://gibs.earthdata.nasa.gov/legends/MODIS_NDVI_H.svg", "cadence": "8-day"},
    {"id": "truecolor", "label": "True colour (daily photo)", "layer": "VIIRS_NOAA20_CorrectedReflectance_TrueColor", "ext": "jpg",
     "tms": "GoogleMapsCompatible_Level9", "maxzoom": 9, "opacity": 1.0,
     "desc": "Daily daytime photo from NOAA-20 VIIRS (~375 m): fog, dust, smoke, snow, flood-silt. Strips of no data between orbits are normal.",
     "legend": None, "cadence": "daily"},
]

FIRMS = [
    ("NOAA-20", "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_Asia_24h.csv"),
    ("NOAA-21", "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_South_Asia_24h.csv"),
    ("Suomi-NPP", "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_Asia_24h.csv"),
]
INDIA_BBOX = (66.0, 5.0, 99.0, 38.0)


async def _default_times() -> dict[str, str]:
    async def load() -> dict[str, str]:
        out: dict[str, str] = {}
        try:
            r = await http.get(CAPS, retries=1, timeout=60)
            s = r.text
            for lay in LAYERS:
                i = s.find(f"<ows:Identifier>{lay['layer']}</ows:Identifier>")
                if i < 0:
                    continue
                m = re.search(r"<Default>([^<]+)</Default>", s[i : i + 6000])
                if m:
                    out[lay["layer"]] = m.group(1)
        except Exception:  # noqa: BLE001 — fall back to GIBS "default" (= latest)
            pass
        return out

    return await cache.get_or_set("gibs:times", 1800, load)


async def layers() -> list[dict[str, Any]]:
    times = await _default_times()
    out = []
    for lay in LAYERS:
        t = times.get(lay["layer"], "default")
        out.append({**lay, "time": t,
                    "tiles": f"{GIBS}/{lay['layer']}/default/{t}/{lay['tms']}/{{z}}/{{y}}/{{x}}.{lay['ext']}",
                    "attribution": "NASA EOSDIS GIBS"})
    return out


async def fires() -> dict[str, Any]:
    async def load() -> dict[str, Any]:
        feats: list[dict[str, Any]] = []
        seen: set[tuple[float, float]] = set()
        latest = ""
        for sat, url in FIRMS:
            try:
                r = await http.get(url, retries=1, timeout=60)
            except Exception:  # noqa: BLE001
                continue
            for row in csv.DictReader(io.StringIO(r.text)):
                try:
                    la, lo = float(row["latitude"]), float(row["longitude"])
                except (KeyError, ValueError):
                    continue
                w, s, e, n = INDIA_BBOX
                if not (w <= lo <= e and s <= la <= n):
                    continue
                key = (round(la, 3), round(lo, 3))
                if key in seen:
                    continue
                seen.add(key)
                when = f"{row.get('acq_date')}T{(row.get('acq_time') or '0000').zfill(4)[:2]}:{(row.get('acq_time') or '0000').zfill(4)[2:]}:00Z"
                latest = max(latest, when)
                feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lo, la]},
                              "properties": {"sat": sat, "time": when, "confidence": row.get("confidence"),
                                             "frp": float(row.get("frp") or 0), "daynight": row.get("daynight")}})
        return {"type": "FeatureCollection", "features": feats,
                "meta": {"count": len(feats), "latest": latest or None, "window": "last 24 h",
                         "source": "NASA FIRMS VIIRS 375 m (NOAA-20, NOAA-21, Suomi-NPP)"}}

    return await cache.get_or_set("firms:southasia", 1800, load)
