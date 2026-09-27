"""Every threshold used by the platform, in one place, each tied to a methodology reference
(see docs/METHODOLOGY.md). Changing a number here changes behaviour everywhere — do it with
a methodology note, never ad hoc."""

LEVEL_LABEL = {0: "No risk", 1: "Watch", 2: "Alert", 3: "Severe"}

# IMD heat-wave criteria (IMD FAQ on heat waves / Heat Action Plan guidance) — REF M-HEAT
HEAT = {
    "plains": {"min_tmax": 40.0},
    "coastal": {"min_tmax": 37.0},
    "hills": {"min_tmax": 30.0},
    "departure_heatwave": 4.5,  # 4.5–6.4 °C above normal => heat wave
    "departure_severe": 6.5,  # >= 6.5 => severe heat wave
    "absolute_heatwave": 45.0,  # plains: actual Tmax >= 45 => heat wave regardless of normal
    "absolute_severe": 47.0,
    "watch_departure": 3.0,  # SYSTEM-DEFINED early watch (not IMD): threshold met, departure 3.0–4.4
}

# IMD cold-wave criteria — REF M-COLD
COLD = {
    "plains": {"max_tmin": 10.0},
    "coastal": {"max_tmin": 15.0},
    "hills": {"max_tmin": 0.0},
    "departure_coldwave": -4.5,
    "departure_severe": -6.5,
    "absolute_coldwave": 4.0,  # plains: Tmin <= 4 => cold wave
    "absolute_severe": 2.0,
    "watch_departure": -3.0,  # SYSTEM-DEFINED early watch
}

# IMD 24-h rainfall intensity categories (mm/day) — REF M-RAIN
RAIN_CATEGORIES = [
    (0.1, "Very light"), (2.5, "Light"), (15.6, "Moderate"), (35.6, "Rather heavy"),
    (64.5, "Heavy"), (115.6, "Very heavy"), (204.5, "Extremely heavy"),
]
RAIN = {"watch": 35.6, "alert": 64.5, "severe": 115.6}

# IMD rainfall departure categories (% of normal) — REF M-RAINDEP
RAIN_DEPARTURE = [
    (60, "Large excess"), (20, "Excess"), (-19, "Normal"), (-59, "Deficient"), (-99, "Large deficient"), (-100, "No rain"),
]
RAINY_DAY_MM = 2.5  # IMD rainy-day definition — REF M-DRY

# Wind gust thresholds, km/h, Beaufort-based — REF M-WIND
WIND = {"watch": 50.0, "alert": 62.0, "severe": 89.0}

# Thunderstorm / lightning (system-derived, experimental) — REF M-TS
TS = {"cape_watch": 1000.0, "cape_alert": 2500.0, "pop_watch": 40.0, "ts_codes": (95, 96, 99), "hail_codes": (96, 99),
      "gust_severe": 60.0}

# Fog: IMD visibility classes (m) — REF M-FOG
FOG = {"watch": 1000.0, "alert": 200.0, "severe": 50.0}

# Rain-based flood indicator (72-h accumulation, mm) — REF M-FLOOD (experimental, not hydrological)
FLOOD = {"watch": 115.6, "alert": 204.5, "severe": 300.0, "wet_soil_m3m3": 0.35}

# Meteorological-drought proxy — REF M-DROUGHT
DROUGHT = {"min_normal_30d_mm": 25.0, "dry_spell_watch": 10, "dry_spell_alert": 15}

# Fire weather (Hot-Dry-Windy style heuristic, experimental) — REF M-FIRE
FIRE = {"tmax": 35.0, "rh_watch": 25.0, "rh_alert": 15.0, "gust_watch": 30.0, "gust_alert": 40.0, "rain7_mm": 2.0}

# Terrain classes for IMD criteria — REF M-TERRAIN
HILLS_ELEVATION_M = 1000.0
COASTAL_DISTANCE_KM = 25.0


def rain_category(mm: float | None) -> str | None:
    if mm is None:
        return None
    cat = "No rain"
    for lo, name in RAIN_CATEGORIES:
        if mm >= lo:
            cat = name
    return cat


def rain_departure_category(pct: float | None) -> str | None:
    if pct is None:
        return None
    if pct <= -99.5:
        return "No rain"
    if pct >= 60:
        return "Large excess"
    if pct >= 20:
        return "Excess"
    if pct >= -19:
        return "Normal"
    if pct >= -59:
        return "Deficient"
    return "Large deficient"
