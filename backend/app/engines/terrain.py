"""Terrain class used by IMD heat/cold criteria: plains, coastal, hills (REF M-TERRAIN).

coastal: within 25 km of the Natural Earth 1:10m coastline; hills: elevation ≥ 1000 m.
IMD maintains station-wise classification; replace with that list when available."""
from __future__ import annotations

import json
import math
from functools import lru_cache

from shapely.geometry import Point, shape

from ..config import settings
from .thresholds import COASTAL_DISTANCE_KM, HILLS_ELEVATION_M


@lru_cache(maxsize=1)
def _coast():
    f = json.loads((settings.data_dir / "geo" / "coastline.geojson").read_text())
    return shape(f["geometry"])


def classify(lat: float, lon: float, elevation_m: float | None) -> str:
    if elevation_m is not None and elevation_m >= HILLS_ELEVATION_M:
        return "hills"
    deg = _coast().distance(Point(lon, lat))
    km = deg * 111.32 * math.sqrt((1 + math.cos(math.radians(lat)) ** 2) / 2)  # rough isotropic scale
    return "coastal" if km <= COASTAL_DISTANCE_KM else "plains"
