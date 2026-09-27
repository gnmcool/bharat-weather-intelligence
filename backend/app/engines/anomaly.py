"""WEATHER VS NORMAL. Forecast/analysis compared with 1991–2020 day-of-year normals.

Caveat (documented): forecast models and the reanalysis baseline have different biases;
departures of < ~1.5 °C at a single point should be read as 'near normal'. See M-ANOM."""
from __future__ import annotations

from ..providers import nasa_power
from ..schemas import Anomaly, AnomalyItem
from . import thresholds as T
from .risk import dry_spell
from .series import Daily, nz


def compute(d: Daily, normals: dict | None) -> Anomaly | None:
    if not normals:
        return None
    items: list[AnomalyItem] = []
    t0 = d.dates[d.i0]

    def tmp(var_fc: str, var_n: str, label: str, idx_days: int, lbl_period: str, id_: str):
        vals = d.fut(var_fc, idx_days)
        days = d.fut_dates(idx_days)
        pairs = [(v, nasa_power.normal_for(normals, var_n, dd)) for v, dd in zip(vals, days) if v is not None]
        if not pairs:
            return
        v = sum(p[0] for p in pairs) / len(pairs)
        n = sum(p[1] for p in pairs) / len(pairs)
        dep = v - n
        cat = "Above normal" if dep >= 1.5 else "Below normal" if dep <= -1.5 else "Near normal"
        items.append(AnomalyItem(id=id_, label=label, period=lbl_period, value=round(v, 1), normal=round(n, 1),
                                 departure=round(dep, 1), unit="°C", category=cat))

    tmp("temperature_2m_max", "tmax", "Max temperature", 1, "Today", "tmax_today")
    tmp("temperature_2m_min", "tmin", "Min temperature", 1, "Today", "tmin_today")
    tmp("temperature_2m_max", "tmax", "Max temperature (7-day mean)", 7, "Next 7 days", "tmax_7d")

    def rain(values: list, days: list, label: str, period: str, id_: str, note: str | None = None):
        if not values:
            return
        v = sum(values)
        n = nasa_power.normal_sum(normals, "precip", days)
        pct = (v - n) / n * 100 if n >= 1.0 else None
        cat = T.rain_departure_category(pct) if n >= 5.0 else ("Dry season" if v < 1 else "Rain in dry season")
        items.append(AnomalyItem(id=id_, label=label, period=period, value=round(v, 1), normal=round(n, 1),
                                 departure=round(v - n, 1), departure_pct=None if pct is None else round(pct),
                                 unit="mm", category=cat,
                                 note=note if n >= 5.0 else f"Normal is only {n:.1f} mm — % departure not meaningful"))

    fut7 = d.fut("precipitation_sum", 7)
    rain(nz(fut7), d.fut_dates(7)[: len(nz(fut7))], "Rainfall", "Next 7 days (forecast)", "rain_7d")
    p30 = d.past("precipitation_sum", 30)
    rain(nz(p30), d.dates[d.i0 - len(p30) : d.i0], "Rainfall", "Past 30 days (model analysis)", "rain_30d",
         note="Model analysis, not gauge observations")

    ds = dry_spell(d)
    return Anomaly(
        baseline=nasa_power.provenance(),
        method=("Departure = forecast − 1991–2020 normal for the same calendar days (31-day centred window). "
                "Temperature: ±1.5 °C band = near normal. Rainfall: IMD departure classes when the normal ≥ 5 mm."),
        items=items, dry_spell_days=ds,
        dry_spell_note=f"{ds} consecutive days with < 2.5 mm (IMD rainy-day threshold), counting back from today plus dry forecast days from {t0:%d %b}.",
    )
