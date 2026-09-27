"""Build processed India admin boundaries (state + district) for backend and frontend.

Source (pilot): udit-001/india-maps-data (district polygons, Census-2011 based, community
curated; provenance not officially certified).  BEFORE GOVERNMENT USE: replace with
Survey of India / Local Government Directory (LGD) aligned boundaries. The loader below
only expects properties: st_nm, st_code, district, dt_code.

Usage:
    uv run python scripts/build_boundaries.py            # downloads source
    uv run python scripts/build_boundaries.py --src path/to/india.geojson
"""
from __future__ import annotations

import argparse
import math
import json
import pathlib
import re
import urllib.request

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

SRC_URL = "https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@2884453/geojson/india.geojson"
ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKEND_GEO = ROOT / "backend" / "data" / "geo"
FRONTEND_GEO = ROOT / "frontend" / "public" / "geo"


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def rnd(geom, nd=4):
    """Round coordinates to shrink files (1e-4 deg ~ 11 m)."""
    gj = mapping(geom)

    def r(c):
        if isinstance(c[0], (int, float)):
            return [round(c[0], nd), round(c[1], nd)]
        return [r(x) for x in c]

    gj["coordinates"] = r(gj["coordinates"])
    return gj


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src")
    a = ap.parse_args()
    if a.src:
        raw = json.loads(pathlib.Path(a.src).read_text())
    else:
        with urllib.request.urlopen(SRC_URL, timeout=120) as r:  # noqa: S310
            raw = json.loads(r.read())

    BACKEND_GEO.mkdir(parents=True, exist_ok=True)
    FRONTEND_GEO.mkdir(parents=True, exist_ok=True)

    groups: dict[tuple[str, str, str], dict] = {}
    by_state: dict[tuple[str, str], list] = {}
    for f in raw["features"]:
        p = f["properties"]
        g = shape(f["geometry"]).buffer(0)
        if g.is_empty:
            continue
        st = p["st_nm"].strip()
        st_code = str(p.get("st_code", "")).zfill(2)
        by_state.setdefault((st, st_code), []).append(g)
        if not p.get("district"):
            continue  # unnamed fragments (islands/slivers): state outline only
        dt = p["district"].strip()
        grp = groups.setdefault((st, st_code, dt), {"geoms": [], "code": str(p.get("dt_code") or "")})
        grp["geoms"].append(g)

    districts, used = [], set()
    for (st, st_code, dt), grp in groups.items():
        g = unary_union(grp["geoms"]).buffer(0)
        code = grp["code"] if grp["code"] not in ("", "0") else slug(dt)
        did = f"IN-{st_code}-{code}"
        if did in used:
            did = f"IN-{st_code}-{slug(dt)}"
        used.add(did)
        rp = g.representative_point()
        props = {
            "id": did, "state": st, "state_code": st_code, "state_slug": slug(st), "district": dt,
            "district_code": code, "lat": round(rp.y, 4), "lon": round(rp.x, 4),
            "area_km2": round(g.area * 111.32 * 111.32 * math.cos(math.radians(rp.y)), 1),
        }
        districts.append((props, g))
    n_by_state = {}
    for p_, _ in districts:
        n_by_state[p_["state"]] = n_by_state.get(p_["state"], 0) + 1

    # Backend: moderately simplified districts (point-in-polygon + zonal stats)
    fc_b = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": p, "geometry": rnd(g.simplify(0.002, preserve_topology=True))}
            for p, g in districts
        ],
    }
    (BACKEND_GEO / "districts.geojson").write_text(json.dumps(fc_b, separators=(",", ":")))

    # Frontend: lighter districts
    fc_f = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "id": i, "properties": {k: p[k] for k in ("id", "state", "state_slug", "district", "lat", "lon")},
             "geometry": rnd(g.simplify(0.01, preserve_topology=True), 3)}
            for i, (p, g) in enumerate(districts)
        ],
    }
    (FRONTEND_GEO / "india_districts.geojson").write_text(json.dumps(fc_f, separators=(",", ":")))

    states = []
    for i, ((st, code), geoms) in enumerate(sorted(by_state.items())):
        u = unary_union(geoms).buffer(0)
        rp = u.representative_point()
        minx, miny, maxx, maxy = u.bounds
        states.append({
            "type": "Feature", "id": i,
            "properties": {"state": st, "state_code": code, "state_slug": slug(st),
                           "lat": round(rp.y, 4), "lon": round(rp.x, 4),
                           "bbox": [round(minx, 3), round(miny, 3), round(maxx, 3), round(maxy, 3)],
                           "n_districts": n_by_state.get(st, 0)},
            "geometry": rnd(u.simplify(0.02, preserve_topology=True), 3),
        })
    fc_s = {"type": "FeatureCollection", "features": states}
    (FRONTEND_GEO / "india_states.geojson").write_text(json.dumps(fc_s, separators=(",", ":")))
    (BACKEND_GEO / "states.geojson").write_text(json.dumps(fc_s, separators=(",", ":")))
    print(f"districts={len(districts)} states={len(states)}")


if __name__ == "__main__":
    main()
