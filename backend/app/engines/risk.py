"""Risk engine: turns forecast fields into documented, explainable risk items.

Rules are in thresholds.py; methodology in docs/METHODOLOGY.md. Confidence is an
"ensemble of opportunity": the same rule is applied independently to ECMWF IFS, NOAA GFS
and DWD ICON; agreement between models is reported, degraded with lead time."""
from __future__ import annotations

from collections.abc import Callable
from datetime import date
from typing import Any

from ..providers.openmeteo import MODEL_META
from ..schemas import Confidence, OfficialWarning, RiskItem
from . import thresholds as T
from .series import Daily, Hourly, at, nz

MODEL_SHORT = {"ecmwf_ifs025": "ECMWF", "gfs_seamless": "GFS", "icon_seamless": "ICON"}
HORIZON = 7


def _normal(normals: dict | None, var: str, d: date) -> float | None:
    if not normals:
        return None
    from ..providers.nasa_power import normal_for

    return normal_for(normals, var, d)


def heat_level(tmax: float | None, normal: float | None, terrain: str) -> tuple[int, float | None]:
    if tmax is None:
        return 0, None
    dep = None if normal is None else tmax - normal
    lvl = 0
    if terrain == "plains":
        if tmax >= T.HEAT["absolute_severe"]:
            lvl = 3
        elif tmax >= T.HEAT["absolute_heatwave"]:
            lvl = 2
    if tmax >= T.HEAT[terrain]["min_tmax"] and dep is not None:
        if dep >= T.HEAT["departure_severe"]:
            lvl = max(lvl, 3)
        elif dep >= T.HEAT["departure_heatwave"]:
            lvl = max(lvl, 2)
        elif dep >= T.HEAT["watch_departure"]:
            lvl = max(lvl, 1)
    return lvl, dep


def cold_level(tmin: float | None, normal: float | None, terrain: str) -> tuple[int, float | None]:
    if tmin is None:
        return 0, None
    dep = None if normal is None else tmin - normal
    lvl = 0
    if terrain == "plains":
        if tmin <= T.COLD["absolute_severe"]:
            lvl = 3
        elif tmin <= T.COLD["absolute_coldwave"]:
            lvl = 2
    if tmin <= T.COLD[terrain]["max_tmin"] and dep is not None:
        if dep <= T.COLD["departure_severe"]:
            lvl = max(lvl, 3)
        elif dep <= T.COLD["departure_coldwave"]:
            lvl = max(lvl, 2)
        elif dep <= T.COLD["watch_departure"]:
            lvl = max(lvl, 1)
    return lvl, dep


def rain_level(mm: float | None) -> int:
    if mm is None:
        return 0
    return 3 if mm >= T.RAIN["severe"] else 2 if mm >= T.RAIN["alert"] else 1 if mm >= T.RAIN["watch"] else 0


def wind_level(g: float | None) -> int:
    if g is None:
        return 0
    return 3 if g >= T.WIND["severe"] else 2 if g >= T.WIND["alert"] else 1 if g >= T.WIND["watch"] else 0


def flood_level(acc72: float | None) -> int:
    if acc72 is None:
        return 0
    return 3 if acc72 >= T.FLOOD["severe"] else 2 if acc72 >= T.FLOOD["alert"] else 1 if acc72 >= T.FLOOD["watch"] else 0


class Ctx:
    """Aligned per-day inputs for best-match and each model."""

    def __init__(self, d: Daily, md: dict[str, Any] | None, normals: dict | None, terrain: str):
        self.d, self.normals, self.terrain = d, normals, terrain
        self.dates = d.fut_dates(HORIZON)
        self.best = {
            "tmax": d.fut("temperature_2m_max", HORIZON), "tmin": d.fut("temperature_2m_min", HORIZON),
            "precip": d.fut("precipitation_sum", HORIZON), "gust": d.fut("wind_gusts_10m_max", HORIZON),
        }
        # previous two days of precipitation for 72 h accumulation on day 0
        self.best_prev_precip = d.past("precipitation_sum", 2)
        self.models: dict[str, dict[str, list]] = {}
        if md and md.get("models"):
            idx = {t: i for i, t in enumerate(md["time"])}
            for m, f in md["models"].items():
                rows: dict[str, list] = {"tmax": [], "tmin": [], "precip": [], "gust": []}
                for dd in self.dates:
                    i = idx.get(dd.isoformat())
                    for k, src in (("tmax", "temperature_2m_max"), ("tmin", "temperature_2m_min"),
                                   ("precip", "precipitation_sum"), ("gust", "wind_gusts_10m_max")):
                        arr = f.get(src) or []
                        rows[k].append(arr[i] if i is not None and i < len(arr) else None)
                if any(x is not None for x in rows["tmax"]):
                    self.models[m] = rows

    def normal(self, var: str, i: int) -> float | None:
        return _normal(self.normals, var, self.dates[i])


def _acc72(precip: list, prev: list) -> list[float | None]:
    seq = list(prev) + list(precip)
    off = len(prev)
    out = []
    for i in range(len(precip)):
        win = [x for x in seq[max(0, off + i - 2) : off + i + 1] if x is not None]
        out.append(sum(win) if win else None)
    return out


def _confidence(levels_best: list[int], per_model: dict[str, list[int]], peak_i: int | None) -> Confidence:
    if not per_model:
        return Confidence(level="n/a", basis="Single blended forecast; per-model data unavailable")
    n = len(per_model)
    names = [MODEL_SHORT.get(m, m) for m in per_model]
    if peak_i is None:  # no risk in best-match: how many models also show none?
        quiet = [MODEL_SHORT.get(m, m) for m, lv in per_model.items() if max(lv or [0]) == 0]
        k = len(quiet)
        lvl = "high" if k == n else "medium" if k >= n / 2 else "low"
        return Confidence(level=lvl, score=round(k / n, 2), basis=f"{k} of {n} models ({', '.join(names)}) show no event in 7 days")
    target = levels_best[peak_i]
    agree = [MODEL_SHORT.get(m, m) for m, lv in per_model.items()
             if max(lv[max(0, peak_i - 1) : peak_i + 2] or [0]) >= max(1, target - 1)]
    k = len(agree)
    score = k / n
    lvl = "high" if k == n else "medium" if score >= 0.5 else "low"
    if peak_i >= 5 and lvl == "high":
        lvl = "medium"
    basis = f"{k} of {n} models agree ({', '.join(agree) or 'none'}) within ±1 day; lead time D+{peak_i}"
    return Confidence(level=lvl, score=round(score, 2), basis=basis)


def _daily_rule(ctx: Ctx, fn: Callable[[dict[str, list], int], tuple[int, float | None]]) -> tuple[list[int], list, dict[str, list[int]]]:
    lv, vals = [], []
    for i in range(len(ctx.dates)):
        l, v = fn(ctx.best, i)
        lv.append(l)
        vals.append(v)
    pm = {m: [fn(rows, i)[0] for i in range(len(ctx.dates))] for m, rows in ctx.models.items()}
    return lv, vals, pm


def _period(ctx: Ctx, lv: list[int]):
    idx = [i for i, x in enumerate(lv) if x > 0]
    if not idx:
        return None, None
    return at(ctx.dates[idx[0]]), at(ctx.dates[idx[-1]], 23)


def _src(ctx: Ctx) -> list[str]:
    return ["Open-Meteo best-match"] + [MODEL_META[m][1] for m in ctx.models if m in MODEL_META]


def _fmt_day(ctx: Ctx, i: int) -> str:
    return "today" if i == 0 else "tomorrow" if i == 1 else ctx.dates[i].strftime("%a %d %b")


def assess(d: Daily, h: Hourly, md: dict | None, normals: dict | None, terrain: str,
           warnings: list[OfficialWarning]) -> list[RiskItem]:
    ctx = Ctx(d, md, normals, terrain)
    out: list[RiskItem] = []
    off = {w.event.lower() if w.event else "": w for w in warnings if w.match in ("district", "state")}

    def official_note(*keys: str) -> str:
        for ev, w in off.items():
            if any(k in ev or k in (w.headline or "").lower() for k in keys):
                return f" Official: {w.issuer} has an active {w.event or 'warning'} for this area — see Official warnings."
        return ""

    # ---------- HEAT ----------
    def heat(rows, i):
        return heat_level(rows["tmax"][i] if i < len(rows["tmax"]) else None, ctx.normal("tmax", i), terrain)

    lv, vals, pm = _daily_rule(ctx, heat)
    tmaxes = nz(ctx.best["tmax"])
    peak = max(range(len(lv)), key=lambda i: (lv[i], ctx.best["tmax"][i] or -99)) if lv else 0
    pk = peak if lv and lv[peak] > 0 else None
    tpk = ctx.best["tmax"][peak] if ctx.best["tmax"] else None
    dep = vals[peak] if vals else None
    thr = T.HEAT[terrain]["min_tmax"]
    if pk is None:
        head = f"No heat-wave conditions expected (max {max(tmaxes):.0f}°C)" if tmaxes else "No data"
        expl = (f"Heat wave per IMD needs Tmax ≥ {thr:.0f}°C ({terrain}) and ≥ 4.5°C above normal"
                + (f"; the week's highest is {tpk:.1f}°C" if tpk is not None else "")
                + (f", {dep:+.1f}°C vs normal." if dep is not None else "."))
    else:
        head = {1: "Heat watch", 2: "Heat-wave conditions", 3: "Severe heat-wave conditions"}[lv[pk]] + f" {_fmt_day(ctx, pk)}"
        expl = (f"Forecast Tmax {tpk:.1f}°C on {_fmt_day(ctx, pk)}"
                + (f", {dep:+.1f}°C vs 1991–2020 normal" if dep is not None else "")
                + f". Classed {terrain}. Stay hydrated, avoid 12–4 pm outdoor work." + official_note("heat"))
    out.append(RiskItem(id="heat", label="Heat", level=lv[pk] if pk is not None else 0, status=T.LEVEL_LABEL[lv[pk] if pk is not None else 0],
                        headline=head, explanation=expl,
                        criterion=f"IMD: Tmax ≥ {thr:.0f}°C ({terrain}) & departure ≥ 4.5°C (heat wave) / ≥ 6.5°C (severe); plains Tmax ≥ 45°C / 47°C. Watch (system): departure ≥ 3°C.",
                        reference="M-HEAT", period_start=_period(ctx, lv)[0], period_end=_period(ctx, lv)[1],
                        peak_value=tpk, unit="°C", confidence=_confidence(lv, pm, pk), sources=_src(ctx) + (["NASA POWER normals"] if normals else [])))

    # ---------- COLD ----------
    def cold(rows, i):
        return cold_level(rows["tmin"][i] if i < len(rows["tmin"]) else None, ctx.normal("tmin", i), terrain)

    lv, vals, pm = _daily_rule(ctx, cold)
    peak = max(range(len(lv)), key=lambda i: (lv[i], -(ctx.best["tmin"][i] or 99))) if lv else 0
    pk = peak if lv and lv[peak] > 0 else None
    tpk = ctx.best["tmin"][peak] if ctx.best["tmin"] else None
    thr = T.COLD[terrain]["max_tmin"]
    tmins = nz(ctx.best["tmin"])
    head = (f"No cold-wave conditions (min {min(tmins):.0f}°C)" if tmins else "No data") if pk is None else \
        {1: "Cold watch", 2: "Cold-wave conditions", 3: "Severe cold wave"}[lv[pk]] + f" {_fmt_day(ctx, pk)}"
    expl = (f"IMD cold wave needs Tmin ≤ {thr:.0f}°C ({terrain}) and ≤ −4.5°C vs normal." if pk is None else
            f"Forecast Tmin {tpk:.1f}°C on {_fmt_day(ctx, pk)}" + (f", {vals[pk]:+.1f}°C vs normal." if vals[pk] is not None else ".") + official_note("cold"))
    out.append(RiskItem(id="cold", label="Cold", level=lv[pk] if pk is not None else 0, status=T.LEVEL_LABEL[lv[pk] if pk is not None else 0],
                        headline=head, explanation=expl,
                        criterion=f"IMD: Tmin ≤ {thr:.0f}°C ({terrain}) & departure ≤ −4.5°C (cold wave) / ≤ −6.5°C (severe); plains Tmin ≤ 4°C / 2°C.",
                        reference="M-COLD", period_start=_period(ctx, lv)[0], period_end=_period(ctx, lv)[1], peak_value=tpk, unit="°C",
                        confidence=_confidence(lv, pm, pk), sources=_src(ctx) + (["NASA POWER normals"] if normals else [])))

    # ---------- RAIN ----------
    lv, vals, pm = _daily_rule(ctx, lambda rows, i: (rain_level(rows["precip"][i] if i < len(rows["precip"]) else None), rows["precip"][i] if i < len(rows["precip"]) else None))
    peak = max(range(len(lv)), key=lambda i: (lv[i], ctx.best["precip"][i] or 0)) if lv else 0
    pk = peak if lv and lv[peak] > 0 else None
    mm = ctx.best["precip"][peak] if ctx.best["precip"] else None
    wk = sum(nz(ctx.best["precip"]))
    head = (f"No heavy rain expected (7-day total {wk:.0f} mm)" if pk is None else
            f"{T.rain_category(mm)} rain {_fmt_day(ctx, pk)} ({mm:.0f} mm)")
    expl = ("IMD categories: rather heavy 35.6–64.4, heavy 64.5–115.5, very heavy 115.6–204.4, extremely heavy ≥ 204.5 mm/24 h."
            if pk is None else f"Daily total up to {mm:.0f} mm — IMD category '{T.rain_category(mm)}'. Watch for waterlogging and traffic disruption." + official_note("rain"))
    out.append(RiskItem(id="rain", label="Heavy rain", level=lv[pk] if pk is not None else 0, status=T.LEVEL_LABEL[lv[pk] if pk is not None else 0],
                        headline=head, explanation=expl, criterion="IMD 24-h categories: Watch ≥ 35.6 mm, Alert ≥ 64.5 mm (heavy), Severe ≥ 115.6 mm (very heavy+).",
                        reference="M-RAIN", period_start=_period(ctx, lv)[0], period_end=_period(ctx, lv)[1], peak_value=mm, unit="mm/day",
                        confidence=_confidence(lv, pm, pk), sources=_src(ctx)))

    # ---------- WIND ----------
    lv, vals, pm = _daily_rule(ctx, lambda rows, i: (wind_level(rows["gust"][i] if i < len(rows["gust"]) else None), None))
    gusts = ctx.best["gust"]
    peak = max(range(len(lv)), key=lambda i: (lv[i], gusts[i] or 0)) if lv else 0
    pk = peak if lv and lv[peak] > 0 else None
    g = gusts[peak] if gusts else None
    out.append(RiskItem(id="wind", label="Wind", level=lv[pk] if pk is not None else 0, status=T.LEVEL_LABEL[lv[pk] if pk is not None else 0],
                        headline=(f"Gusts up to {g:.0f} km/h" if g is not None else "No data") + ("" if pk is None else f" {_fmt_day(ctx, pk)}"),
                        explanation=("Strong gusts can damage kutcha structures, hoardings, standing crops." if pk else "Gusts stay below the 50 km/h watch level.") + (official_note("wind", "squall") if pk else ""),
                        criterion="Daily max gust (Beaufort): Watch ≥ 50 km/h, Alert ≥ 62 km/h (gale), Severe ≥ 89 km/h (storm).",
                        reference="M-WIND", period_start=_period(ctx, lv)[0], period_end=_period(ctx, lv)[1], peak_value=g, unit="km/h",
                        confidence=_confidence(lv, pm, pk), sources=_src(ctx)))

    # ---------- THUNDERSTORM + LIGHTNING (hourly, best-match only) ----------
    codes, cape, pop, hg = h.fut("weather_code", HORIZON * 24), h.fut("cape", HORIZON * 24), h.fut("precipitation_probability", HORIZON * 24), h.fut("wind_gusts_10m", HORIZON * 24)
    times = h.fut_times(HORIZON * 24)
    ts_lv = []
    for i in range(len(times)):
        c, cp, pp, gg = codes[i] if i < len(codes) else None, cape[i] if i < len(cape) else None, pop[i] if i < len(pop) else None, hg[i] if i < len(hg) else None
        l = 0
        if c in T.TS["ts_codes"]:
            l = 2
            if c in T.TS["hail_codes"] or (gg or 0) >= T.TS["gust_severe"]:
                l = 3
        elif (cp or 0) >= T.TS["cape_watch"] and (pp or 0) >= T.TS["pop_watch"]:
            l = 1
        ts_lv.append(l)
    tsmax = max(ts_lv or [0])
    first = next((i for i, x in enumerate(ts_lv) if x == tsmax and x > 0), None)
    last = max((i for i, x in enumerate(ts_lv) if x > 0), default=None)
    cape_max = max(nz(cape) or [0])
    ts_when = times[first].strftime("%a %d %b, %I %p").replace(" 0", " ") if first is not None else None
    conf_ts = Confidence(level="low" if tsmax else "medium", basis="Convective events are poorly resolved at 0.25°; single blended model, hourly")
    out.append(RiskItem(id="thunderstorm", label="Thunderstorm", level=tsmax, status=T.LEVEL_LABEL[tsmax],
                        headline=("No thunderstorm signal" if not tsmax else f"Thunderstorm {'likely' if tsmax >= 2 else 'possible'} from {ts_when}"),
                        explanation=(f"Peak CAPE {cape_max:.0f} J/kg." + (" Model shows thunderstorm weather codes." if tsmax >= 2 else " Unstable air with rain chance ≥ 40%." if tsmax else ""))
                        + official_note("thunder", "lightning"),
                        criterion="System: WMO code 95–99 → Alert (96/99 hail or gust ≥ 60 km/h → Severe); CAPE ≥ 1000 J/kg & rain prob ≥ 40% → Watch.",
                        reference="M-TS", period_start=times[first] if first is not None else None, period_end=times[last] if last is not None else None,
                        peak_value=cape_max, unit="J/kg", confidence=conf_ts, sources=["Open-Meteo best-match (hourly)"], experimental=True))
    l_lv = 0
    if tsmax >= 2:
        l_lv = 3 if cape_max >= T.TS["cape_alert"] else 2
    elif tsmax == 1:
        l_lv = 1
    out.append(RiskItem(id="lightning", label="Lightning", level=l_lv, status=T.LEVEL_LABEL[l_lv],
                        headline="No lightning signal" if not l_lv else f"Lightning risk {'high' if l_lv == 3 else 'present'} from {ts_when}",
                        explanation=("When thunder roars, go indoors. Avoid open fields, trees, water bodies. Use Damini app (IITM) for live strikes."
                                     if l_lv else "No convective signal. Live strike data: Damini app (IITM Pune).") + official_note("lightning"),
                        criterion="System: follows thunderstorm signal; Severe when CAPE ≥ 2500 J/kg with thunderstorm codes. Not a strike forecast.",
                        reference="M-TS", period_start=times[first] if first is not None else None, period_end=times[last] if last is not None else None,
                        peak_value=cape_max, unit="J/kg", confidence=conf_ts, sources=["Open-Meteo best-match (hourly)"], experimental=True))

    # ---------- FLOOD (rain-based indicator) ----------
    acc_best = _acc72(ctx.best["precip"], ctx.best_prev_precip)
    lvf = [flood_level(x) for x in acc_best]
    sm = nz(h.fut("soil_moisture_9_to_27cm", 24))
    wet = bool(sm) and max(sm) >= T.FLOOD["wet_soil_m3m3"]
    if wet:
        lvf = [min(3, x + 1) if x > 0 else 0 for x in lvf]
    pmf = {m: [flood_level(x) for x in _acc72(rows["precip"], [])] for m, rows in ctx.models.items()}
    pkf = max(range(len(lvf)), key=lambda i: (lvf[i], acc_best[i] or 0)) if lvf else 0
    pkf_i = pkf if lvf and lvf[pkf] > 0 else None
    accmax = acc_best[pkf] if acc_best else None
    offl = official_note("flood")
    out.append(RiskItem(id="flood", label="Flood", level=lvf[pkf] if pkf_i is not None else 0, status=T.LEVEL_LABEL[lvf[pkf] if pkf_i is not None else 0],
                        headline=(f"72-h rain up to {accmax:.0f} mm (incl. past 2 days)" if accmax is not None else "No data") + (" — flooding possible" if pkf_i is not None else ""),
                        explanation=("Rain-based indicator only (no river/drainage model)." + (" Soil already wet." if wet else "") + offl),
                        criterion="System: 72-h accumulated rain ≥ 115.6 (Watch) / 204.5 (Alert) / 300 mm (Severe); +1 level when 9–27 cm soil moisture ≥ 0.35 m³/m³. River floods: CWC via SACHET.",
                        reference="M-FLOOD", period_start=_period(ctx, lvf)[0], period_end=_period(ctx, lvf)[1], peak_value=accmax, unit="mm/72h",
                        confidence=_confidence(lvf, pmf, pkf_i), sources=_src(ctx) + ["CWC flood alerts (SACHET)"], experimental=True))

    # ---------- DROUGHT / DRY SPELL ----------
    past30 = nz(d.past("precipitation_sum", 30))
    n30 = None
    if normals and past30:
        from ..providers.nasa_power import normal_sum

        n30 = normal_sum(normals, "precip", d.dates[d.i0 - len(past30) : d.i0])
    obs30 = sum(past30) if past30 else None
    dry = dry_spell(d)
    lvl, head = 0, "Rainfall near normal or dry season"
    if n30 is not None and obs30 is not None and n30 >= T.DROUGHT["min_normal_30d_mm"]:
        pct = (obs30 - n30) / n30 * 100
        cat = T.rain_departure_category(pct)
        lvl = 2 if pct <= -60 else 1 if pct <= -20 else 0
        # A dry spell escalates only if rain was actually expected over those days and the
        # preceding month was not already in excess (soil profile recharged).
        from ..providers.nasa_power import normal_sum as _ns

        spell_days = d.dates[max(0, d.i0 - dry) : d.i0 + 1] if dry else []
        spell_normal = _ns(normals, "precip", spell_days) if spell_days else 0.0
        if pct < 20 and spell_normal >= T.DROUGHT["min_normal_30d_mm"]:
            if dry >= T.DROUGHT["dry_spell_alert"]:
                lvl = max(lvl, 2)
            elif dry >= T.DROUGHT["dry_spell_watch"]:
                lvl = max(lvl, 1)
        head = f"Last 30 days: {obs30:.0f} mm vs normal {n30:.0f} mm ({pct:+.0f}%, {cat})"
        expl = (f"Dry spell: {dry} consecutive days < 2.5 mm (incl. forecast); normal rain over that spell ≈ {spell_normal:.0f} mm."
                + (" Preceding month was wet, so the spell is not escalated." if pct >= 20 and dry >= 10 else ""))
    elif n30 is not None:
        expl = f"Normal 30-day rain here is only {n30:.0f} mm — deficit % not meaningful in the dry season. Dry spell {dry} days."
    else:
        expl = "Baseline unavailable."
    out.append(RiskItem(id="drought", label="Drought / dry spell", level=lvl, status=T.LEVEL_LABEL[lvl], headline=head, explanation=expl,
                        criterion="IMD departure classes on 30-day rain (Deficient −20…−59% → Watch, ≤ −60% → Alert) when normal ≥ 25 mm; dry spell ≥ 10 d Watch, ≥ 15 d Alert only if normal rain over the spell ≥ 25 mm and prior month not in excess.",
                        reference="M-DROUGHT", peak_value=obs30, unit="mm/30d",
                        confidence=Confidence(level="medium" if n30 else "n/a", basis="Past 30 days are model analysis, not rain-gauge observations"),
                        sources=["Open-Meteo past-days analysis", "NASA POWER normals"], experimental=True))

    # ---------- FOG ----------
    vis = h.fut("visibility", 72)
    vt = h.fut_times(72)
    vmin = min(nz(vis) or [99999])
    fl = 3 if vmin < T.FOG["severe"] else 2 if vmin < T.FOG["alert"] else 1 if vmin < T.FOG["watch"] else 0
    vi = next((i for i, x in enumerate(vis) if x is not None and x == vmin), None)
    out.append(RiskItem(id="fog", label="Fog / visibility", level=fl, status=T.LEVEL_LABEL[fl],
                        headline="Good visibility next 72 h" if not fl else f"Visibility down to {vmin:.0f} m around {vt[vi].strftime('%a %I %p') if vi is not None else ''}",
                        explanation="Model visibility is indicative; dense fog forms locally and is under-forecast." + (official_note("fog") if fl else ""),
                        criterion="IMD fog classes: < 1000 m shallow/moderate (Watch), < 200 m dense (Alert), < 50 m very dense (Severe).",
                        reference="M-FOG", peak_value=vmin if vmin < 99999 else None, unit="m",
                        confidence=Confidence(level="low", basis="Visibility is a derived model diagnostic"), sources=["Open-Meteo best-match (hourly)"], experimental=True))

    # ---------- FIRE WEATHER ----------
    rh = h.fut("relative_humidity_2m", 72)
    tt = h.fut("temperature_2m", 72)
    gg = h.fut("wind_gusts_10m", 72)
    rain7 = sum(nz(ctx.best["precip"]))
    fire = 0
    for i in range(min(len(rh), len(tt), len(gg))):
        if None in (rh[i], tt[i], gg[i]):
            continue
        if tt[i] >= T.FIRE["tmax"] and rain7 < T.FIRE["rain7_mm"]:
            if rh[i] <= T.FIRE["rh_alert"] and gg[i] >= T.FIRE["gust_alert"]:
                fire = max(fire, 2)
            elif rh[i] <= T.FIRE["rh_watch"] and gg[i] >= T.FIRE["gust_watch"]:
                fire = max(fire, 1)
    out.append(RiskItem(id="fire", label="Fire weather", level=fire, status=T.LEVEL_LABEL[fire],
                        headline="Hot, dry and windy spells ahead" if fire else "No hot-dry-windy signal (72 h)",
                        explanation="Avoid stubble/waste burning; keep firebreaks." if fire else "Heuristic check of heat, low humidity and wind together.",
                        criterion="System heuristic: T ≥ 35°C, RH ≤ 25% & gust ≥ 30 km/h (Watch); RH ≤ 15% & gust ≥ 40 km/h (Alert); only if 7-day rain < 2 mm.",
                        reference="M-FIRE", confidence=Confidence(level="low", basis="Unvalidated heuristic"), sources=["Open-Meteo best-match (hourly)"], experimental=True))

    # ---------- CYCLONE (official only) ----------
    cyc = [w for w in warnings if any(k in f"{w.event} {w.headline}".lower() for k in ("cyclon", "depression", "deep depression"))]
    cl = 0
    if cyc:
        sev = {"Extreme": 3, "Severe": 3, "Moderate": 2, "Minor": 1}
        cl = max(sev.get(w.severity or "", 1) for w in cyc)
    out.append(RiskItem(id="cyclone", label="Cyclone", level=cl, status=T.LEVEL_LABEL[cl],
                        headline=cyc[0].headline if cyc else "No cyclone alert in the official feed",
                        explanation="Cyclone risk is taken only from official IMD alerts (RSMC New Delhi) — the platform does not forecast cyclone tracks.",
                        criterion="Official only: IMD cyclone/depression CAP alerts matched to this state/district.",
                        reference="M-CYCLONE", confidence=Confidence(level="n/a", basis="Official bulletin"),
                        sources=["NDMA SACHET (IMD)"], official=bool(cyc)))
    return out


def dry_spell(d: Daily) -> int:
    """Consecutive days < 2.5 mm ending at the last dry forecast day contiguous with today."""
    past = d.past("precipitation_sum", 60)
    fut = d.fut("precipitation_sum", 7)
    n = 0
    for x in reversed(past):
        if x is None or x >= T.RAINY_DAY_MM:
            break
        n += 1
    for x in fut:
        if x is None or x >= T.RAINY_DAY_MM:
            break
        n += 1
    return n
