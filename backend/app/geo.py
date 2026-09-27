"""Administrative hierarchy: India → State → District (polygons) → Taluka/Village (gazetteer
search via geocoding; LGD import path documented in docs/ARCHITECTURE.md)."""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from shapely import STRtree
from shapely.geometry import Point, shape
from shapely.prepared import prep

from .config import settings


@dataclass
class District:
    id: str
    state: str
    state_code: str
    state_slug: str
    district: str
    district_code: str
    lat: float
    lon: float
    area_km2: float
    geom: object


class Boundaries:
    def __init__(self) -> None:
        path = settings.data_dir / "geo" / "districts.geojson"
        fc = json.loads(path.read_text())
        self.districts: list[District] = []
        for f in fc["features"]:
            p = f["properties"]
            self.districts.append(District(geom=shape(f["geometry"]), **p))
        self._tree = STRtree([d.geom for d in self.districts])
        self._prepared: dict[int, object] = {}
        self.by_id = {d.id: d for d in self.districts}

    def locate(self, lat: float, lon: float) -> District | None:
        pt = Point(lon, lat)
        for i in self._tree.query(pt):
            if self.districts[i].geom.contains(pt):
                return self.districts[i]
        # nearest within ~15 km (coastline/simplification tolerance)
        i = self._tree.nearest(pt)
        if i is not None and self.districts[i].geom.distance(pt) < 0.15:
            return self.districts[i]
        return None

    def states(self) -> list[dict]:
        seen: dict[str, dict] = {}
        for d in self.districts:
            s = seen.setdefault(d.state_slug, {"state": d.state, "state_code": d.state_code, "state_slug": d.state_slug, "n_districts": 0})
            s["n_districts"] += 1
        return sorted(seen.values(), key=lambda s: s["state"])

    def districts_of(self, state_slug: str) -> list[District]:
        return sorted((d for d in self.districts if d.state_slug == state_slug), key=lambda d: d.district)

    def grid_mask(self, d: District, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
        """Boolean mask of grid cell centres inside a district (for zonal statistics)."""
        idx = self.districts.index(d)
        pg = self._prepared.get(idx)
        if pg is None:
            pg = self._prepared[idx] = prep(d.geom)
        minx, miny, maxx, maxy = d.geom.bounds
        mask = np.zeros((lats.size, lons.size), dtype=bool)
        yi = np.where((lats >= miny) & (lats <= maxy))[0]
        xi = np.where((lons >= minx) & (lons <= maxx))[0]
        for y in yi:
            for x in xi:
                if pg.contains(Point(float(lons[x]), float(lats[y]))):
                    mask[y, x] = True
        return mask


@lru_cache(maxsize=1)
def boundaries() -> Boundaries:
    return Boundaries()
