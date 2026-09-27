"""Load admin boundaries into PostGIS and (optionally) archive current official warnings.

    export BWI_DATABASE_URL=postgresql://bwi:bwi@localhost:5432/bwi
    uv run --extra db python scripts/load_postgis.py            # schema + boundaries
    uv run --extra db python scripts/load_postgis.py --warnings # + archive SACHET CAP alerts
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import pathlib
import sys

import psycopg

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
BOUNDARY_SOURCE = "udit-001/india-maps-data (Census 2011 based, community curated) — replace with Survey of India/LGD"


def load_boundaries(cur) -> None:
    states = json.loads((ROOT / "data/geo/states.geojson").read_text())
    dists = json.loads((ROOT / "data/geo/districts.geojson").read_text())
    cur.execute(
        """INSERT INTO admin_unit (id, level, name, boundary_source) VALUES ('IN', 0, 'India', %s)
           ON CONFLICT (id) DO UPDATE SET boundary_source = EXCLUDED.boundary_source""", (BOUNDARY_SOURCE,))
    for f in states["features"]:
        p = f["properties"]
        cur.execute(
            """INSERT INTO admin_unit (id, level, name, parent_id, census_code, geom, centroid, boundary_source)
               VALUES (%s, 1, %s, 'IN', %s, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)),
                       ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s)
               ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, geom = EXCLUDED.geom, centroid = EXCLUDED.centroid,
                    boundary_source = EXCLUDED.boundary_source, updated_at = now()""",
            (f"IN-{p['state_code']}", p["state"], p["state_code"], json.dumps(f["geometry"]), p["lon"], p["lat"], BOUNDARY_SOURCE))
    for f in dists["features"]:
        p = f["properties"]
        cur.execute(
            """INSERT INTO admin_unit (id, level, name, parent_id, census_code, geom, centroid, area_km2, boundary_source)
               VALUES (%s, 2, %s, %s, %s, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)),
                       ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s)
               ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, geom = EXCLUDED.geom, centroid = EXCLUDED.centroid,
                    area_km2 = EXCLUDED.area_km2, boundary_source = EXCLUDED.boundary_source, updated_at = now()""",
            (p["id"], p["district"], f"IN-{p['state_code']}", p["district_code"], json.dumps(f["geometry"]), p["lon"], p["lat"],
             p["area_km2"], BOUNDARY_SOURCE))
    print(f"admin_unit: 1 country, {len(states['features'])} states, {len(dists['features'])} districts")


async def fetch_warnings():
    from app.providers import sachet

    ws = await sachet.warnings(include_national=True)
    polys = {}
    for w in ws:
        if w.polygon_url:
            try:
                polys[w.id] = await sachet.polygon(w.polygon_url)
            except Exception:  # noqa: BLE001
                pass
    return ws, polys


def archive_warnings(cur) -> None:
    ws, polys = asyncio.run(fetch_warnings())
    for w in ws:
        g = polys.get(w.id)
        cur.execute(
            """INSERT INTO official_warning (id, source_id, issuer, sender, event, severity, urgency, certainty, headline, description,
                                             area_desc, effective, expires, geom, link, raw)
               VALUES (%s,'sachet',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                       CASE WHEN %s::text IS NULL THEN NULL ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)) END, %s, %s)
               ON CONFLICT (id) DO NOTHING""",
            (w.id, w.issuer, w.sender, w.event, w.severity, w.urgency, w.certainty, w.headline, w.description, w.area,
             w.effective, w.expires, json.dumps(g) if g else None, json.dumps(g) if g else None, w.link, w.model_dump_json()))
    # link warnings to districts by polygon intersection
    cur.execute(
        """INSERT INTO official_warning_area (warning_id, admin_id, match)
           SELECT w.id, a.id, 'polygon' FROM official_warning w JOIN admin_unit a
             ON a.level = 2 AND w.geom IS NOT NULL AND ST_Intersects(a.geom, w.geom)
           ON CONFLICT DO NOTHING""")
    print(f"official_warning: {len(ws)} alerts archived ({len(polys)} with polygons)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--warnings", action="store_true")
    a = ap.parse_args()
    url = os.environ.get("BWI_DATABASE_URL")
    if not url:
        sys.exit("Set BWI_DATABASE_URL, e.g. postgresql://bwi:bwi@localhost:5432/bwi")
    with psycopg.connect(url, autocommit=False) as conn, conn.cursor() as cur:
        cur.execute((ROOT / "db/schema.sql").read_text())
        load_boundaries(cur)
        if a.warnings:
            archive_warnings(cur)
        conn.commit()


if __name__ == "__main__":
    main()
