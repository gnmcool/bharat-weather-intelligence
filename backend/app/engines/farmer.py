"""Farmer mode: SYSTEM-DERIVED crop-weather indicators, kept strictly separate from
OFFICIAL agrometeorological advisories (IMD / ICAR Gramin Krishi Mausam Sewa)."""
from __future__ import annotations

import pathlib
from functools import lru_cache
from typing import Any

import yaml

from . import thresholds as T
from .risk import dry_spell
from .series import Daily, Hourly, nz

CROPS_FILE = pathlib.Path(__file__).with_name("crops.yaml")

OFFICIAL_ADVISORY = {
    "title": "Official Agromet Advisory (IMD × ICAR — Gramin Krishi Mausam Sewa)",
    "note": ("District Agromet Advisory Service bulletins are issued every Tuesday and Friday by IMD with State "
             "Agricultural Universities / KVKs. They are the authoritative source for farm operations."),
    "links": [
        {"label": "IMD — Agromet services", "url": "https://mausam.imd.gov.in/"},
        {"label": "Meghdoot app (IMD/ICAR/IITM) — district advisories", "url": "https://play.google.com/store/apps/details?id=com.aas.meghdoot"},
        {"label": "Kisan Call Centre — 1800-180-1551", "url": "tel:18001801551"},
    ],
    "integration": "Not yet ingested automatically — requires IMD Agromet data access (see docs/ARCHITECTURE.md).",
}


@lru_cache(maxsize=1)
def crops() -> dict[str, Any]:
    return yaml.safe_load(CROPS_FILE.read_text())


def assess(d: Daily, h: Hourly, crop: str, stage: str) -> dict[str, Any]:
    cfg = crops()
    g = cfg["generic"]
    c = cfg["crops"].get(crop)
    if c is None:
        raise KeyError(crop)
    if stage not in c["stages"]:
        stage = c["stages"][0]
    dates = d.fut_dates(7)
    tmax, tmin = d.fut("temperature_2m_max", 7), d.fut("temperature_2m_min", 7)
    rain, pop = d.fut("precipitation_sum", 7), d.fut("precipitation_probability_max", 7)
    et0 = d.fut("et0_fao_evapotranspiration", 7)

    # hourly per-day windows
    ht, hw, hp, hrh, htmp, hday = (h.fut_times(7 * 24), h.fut("wind_speed_10m", 168), h.fut("precipitation", 168),
                                   h.fut("relative_humidity_2m", 168), h.fut("temperature_2m", 168), h.fut("is_day", 168))
    days: list[dict[str, Any]] = []
    for di, dd in enumerate(dates):
        idx = [i for i, t in enumerate(ht) if t.date() == dd]
        spray = 0
        disease = 0
        for i in idx:
            nxt = [x for x in hp[i : i + g["spray_rain_free_hours"]] if x is not None]
            if (hday[i] if i < len(hday) else 0) and (hw[i] or 99) <= g["spray_max_wind_kmh"] and sum(nxt) < 0.2:
                spray += 1
            if (hrh[i] or 0) >= g["disease_rh"] and g["disease_t"][0] <= (htmp[i] or -99) <= g["disease_t"][1]:
                disease += 1
        r = rain[di] if di < len(rain) else None
        pp = pop[di] if di < len(pop) else None
        days.append({
            "date": dd.isoformat(), "tmax": tmax[di] if di < len(tmax) else None, "tmin": tmin[di] if di < len(tmin) else None,
            "rain": r, "rain_prob": pp, "spray_hours": spray, "disease_hours": disease,
            "dry": (r is not None and r < g["harvest_dry_mm"] and (pp is None or pp < g["harvest_max_pop"])),
        })

    ind: list[dict[str, Any]] = []
    ht_thr = c.get("heat_tmax", {}).get(stage)
    if ht_thr is not None:
        n = sum(1 for x in nz(tmax) if x >= ht_thr)
        ind.append({"id": "heat_stress", "label": "Heat stress for this stage", "level": 2 if n >= 3 else 1 if n >= 1 else 0,
                    "value": f"{n} of 7 days ≥ {ht_thr} °C", "rule": f"Tmax ≥ {ht_thr} °C at {stage.replace('_', ' ')}"})
    ct_thr = c.get("cold_tmin", {}).get(stage)
    if ct_thr is not None:
        n = sum(1 for x in nz(tmin) if x <= ct_thr)
        ind.append({"id": "cold_stress", "label": "Cold / frost stress", "level": 2 if n >= 2 else 1 if n else 0,
                    "value": f"{n} of 7 nights ≤ {ct_thr} °C", "rule": f"Tmin ≤ {ct_thr} °C at {stage.replace('_', ' ')}"})
    heavy = [x for x in nz(rain) if x >= T.RAIN["alert"]]
    ind.append({"id": "heavy_rain", "label": "Heavy rain", "level": 2 if heavy else 1 if any(x >= T.RAIN["watch"] for x in nz(rain)) else 0,
                "value": f"max {max(nz(rain) or [0]):.0f} mm/day", "rule": "IMD heavy rain ≥ 64.5 mm/day (Watch ≥ 35.6)"})
    ds = dry_spell(d)
    ind.append({"id": "dry_spell", "label": "Dry spell", "level": 2 if ds >= 15 else 1 if ds >= 10 else 0,
                "value": f"{ds} days", "rule": "Consecutive days < 2.5 mm"})
    if stage == "harvest":
        dry_run, best = 0, 0
        for x in days:
            dry_run = dry_run + 1 if x["dry"] else 0
            best = max(best, dry_run)
        ind.append({"id": "harvest_window", "label": "Dry harvest window", "level": 0 if best >= 3 else 1 if best >= 1 else 2,
                    "value": f"longest dry run {best} days", "rule": f"days < {g['harvest_dry_mm']} mm & rain prob < {g['harvest_max_pop']}%"})
    dh = sum(x["disease_hours"] for x in days)
    sens = stage in c.get("disease_sensitive_stages", [])
    ind.append({"id": "disease_weather", "label": "Disease-favourable weather", "level": (2 if dh >= 36 else 1 if dh >= 12 else 0) if sens else (1 if dh >= 36 else 0),
                "value": f"{dh} humid hours (RH ≥ {g['disease_rh']}%, {g['disease_t'][0]}–{g['disease_t'][1]} °C)",
                "rule": "Leaf-wetness proxy; stage-sensitive for this crop" if sens else "Leaf-wetness proxy"})
    sm = nz(h.fut("soil_moisture_9_to_27cm", 24))
    rain7, et07 = sum(nz(rain)), sum(nz(et0))
    return {
        "crop": crop, "crop_label": c["label"], "stage": stage, "stages": c["stages"], "season": c["season"],
        "validation_status": cfg["validation_status"], "crop_note": c.get("note"),
        "disclaimer": ("SYSTEM-DERIVED WEATHER INDICATORS — computed automatically from forecast models using unvalidated "
                       "thresholds. They are not farming instructions. Follow the official Agromet Advisory for decisions."),
        "official": OFFICIAL_ADVISORY,
        "indicators": ind,
        "days": days,
        "water_balance": {"rain_7d_mm": round(rain7, 1), "et0_7d_mm": round(et07, 1), "balance_mm": round(rain7 - et07, 1),
                          "soil_moisture_9_27cm": round(sm[0], 3) if sm else None,
                          "note": "Balance = forecast rain − FAO-56 reference evapotranspiration (ET0). Crop demand = ET0 × crop coefficient (Kc)."},
    }
