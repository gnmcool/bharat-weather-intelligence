# Methodology — Bharat Weather Intelligence

Every risk, anomaly and indicator shown in the app is produced by a rule documented here.
Code: `backend/app/engines/thresholds.py` (numbers), `risk.py`, `anomaly.py`, `farmer.py`.
Unit tests: `backend/tests/test_rules.py`. Change a threshold only with a note in this file.

**What the system is — and is not.** It applies published criteria to *forecast model output
at a point* (or district). It does **not** declare an IMD heat wave, cold wave or flood. IMD
declarations need observed station data, spatial coverage (≥ 2 stations in a met subdivision)
and persistence (≥ 2 days). The app labels every derived item "system-derived" and shows official
CAP alerts separately and verbatim.

## Levels

| Level | Label | Meaning |
|---|---|---|
| 0 | No risk | Rule not met anywhere in the 7-day window |
| 1 | Watch | Early / lower-tier condition (often system-defined — flagged below) |
| 2 | Alert | Published threshold met (e.g. IMD heat-wave departure) |
| 3 | Severe | Published "severe" threshold met |

## Confidence (M-CONF) — "ensemble of opportunity"

The same rule is run independently on **ECMWF IFS 0.25°, NOAA GFS 0.25° and DWD ICON** daily
fields (via Open-Meteo). Confidence = share of models reaching at least one level below the
best-match level within ±1 day of the peak:

* all models agree → **high**; ≥ half → **medium**; otherwise → **low**
* lead time ≥ D+5 caps confidence at **medium**
* when no event is forecast, confidence = share of models that also show none

This is not a calibrated probability. A true ensemble (ECMWF ENS / GEFS, or Earth2Studio
ensemble workflows) is on the roadmap. Hourly convective, fog and fire indicators use only the
blended forecast and are marked *low* confidence.

## Terrain class (M-TERRAIN)

IMD heat/cold criteria differ by terrain. **Hills**: elevation ≥ 1000 m (model elevation).
**Coastal**: within 25 km of the Natural Earth 1:10m coastline. **Plains**: everything else.
Replace with IMD's station classification when available.

## Heat (M-HEAT) — IMD heat-wave criteria

* Threshold Tmax: plains ≥ 40 °C, coastal ≥ 37 °C, hills ≥ 30 °C, **and**
  departure from normal ≥ 4.5 °C → **Alert** (heat wave); ≥ 6.5 °C → **Severe**.
* Plains, regardless of normal: Tmax ≥ 45 °C → Alert; ≥ 47 °C → Severe.
* **Watch (system-defined, not IMD):** threshold met and departure 3.0–4.4 °C.
* Normal = NASA POWER 1991–2020 day-of-year Tmax (see M-ANOM).

## Cold (M-COLD) — IMD cold-wave criteria

* Threshold Tmin: plains ≤ 10 °C, coastal ≤ 15 °C, hills ≤ 0 °C, **and** departure ≤ −4.5 °C
  → **Alert**; ≤ −6.5 °C → **Severe**.
* Plains, regardless of normal: Tmin ≤ 4 °C → Alert; ≤ 2 °C → Severe.
* **Watch (system-defined):** threshold met and departure −3.0 to −4.4 °C.

## Heavy rain (M-RAIN) — IMD 24-hour categories

| mm/day | IMD term | Level |
|---|---|---|
| 0.1–2.4 | Very light | 0 |
| 2.5–15.5 | Light | 0 |
| 15.6–35.5 | Moderate | 0 |
| 35.6–64.4 | Rather heavy (sub-class of moderate) | 1 Watch |
| 64.5–115.5 | Heavy | 2 Alert |
| 115.6–204.4 | Very heavy | 3 Severe |
| ≥ 204.5 | Extremely heavy | 3 Severe |

## Rainfall departure (M-RAINDEP) — IMD classes

Large excess ≥ +60 % · Excess +20…+59 % · Normal −19…+19 % · Deficient −20…−59 % ·
Large deficient −60…−99 % · No rain −100 %. Applied only when the normal for the period is
≥ 5 mm (anomaly) or ≥ 25 mm (drought proxy); otherwise the % is not meaningful and the app
says so ("Dry season").

## Dry spell (M-DRY)

Consecutive days with < 2.5 mm (IMD rainy-day threshold), counting back from today through
past model-analysis days, plus consecutive dry forecast days.

## Wind (M-WIND) — Beaufort-based gusts

Daily max gust ≥ 50 km/h (near gale, Bft 7) → Watch; ≥ 62 km/h (gale, Bft 8) → Alert;
≥ 89 km/h (storm, Bft 10) → Severe.

## Thunderstorm & lightning (M-TS) — experimental

* WMO weather code 95/96/99 in any forecast hour → **Alert**; 96/99 (hail) or coincident gust
  ≥ 60 km/h → **Severe**.
* CAPE ≥ 1000 J/kg **and** precipitation probability ≥ 40 % → **Watch**.
* Lightning follows the thunderstorm signal; **Severe** when CAPE ≥ 2500 J/kg with thunderstorm
  codes. This is *not* a strike forecast. Live strikes: IITM *Damini* app; official
  thunderstorm/lightning warnings arrive via SACHET.

## Fog (M-FOG) — IMD visibility classes

Shallow 500–1000 m / moderate 200–500 m → Watch; dense 50–200 m → Alert; very dense < 50 m →
Severe. Model visibility is a derived diagnostic and under-forecasts radiation fog → low
confidence.

## Flood indicator (M-FLOOD) — experimental, rain-based only

72-hour accumulated rain (including the previous two days of model analysis) ≥ 115.6 mm →
Watch; ≥ 204.5 mm → Alert; ≥ 300 mm → Severe; +1 level when 9–27 cm soil moisture
≥ 0.35 m³/m³. There is no river, reservoir or drainage model. River flood information comes
only from **CWC** alerts in the SACHET feed.

## Drought proxy (M-DROUGHT) — experimental

30-day rainfall (model analysis) vs 1991–2020 normal, IMD classes: Deficient → Watch,
Large deficient / no rain → Alert — only when the 30-day normal ≥ 25 mm. A dry spell ≥ 10 days
→ Watch, ≥ 15 days → Alert **only if** the normal rain over the spell ≥ 25 mm and the prior 30
days were not in excess. Operational drought needs SPI/SPEI over 1–6 months with gauge data
(IMD) — roadmap.

## Fire weather (M-FIRE) — experimental heuristic

Within 72 h: T ≥ 35 °C, RH ≤ 25 % and gust ≥ 30 km/h → Watch; RH ≤ 15 % and gust ≥ 40 km/h →
Alert; only if 7-day rain < 2 mm. Inspired by Hot-Dry-Windy style indices; unvalidated for India.
Operational fire danger: FSI (Forest Survey of India) fire alerts — roadmap.

## Cyclone (M-CYCLONE) — official only

The platform does not forecast cyclone tracks. Level comes only from IMD cyclone/depression CAP
alerts matched to the state or district (IMD RSMC New Delhi is the WMO-designated centre).

## Weather vs normal (M-ANOM)

* Baseline: **NASA POWER daily (MERRA-2 reanalysis), 1991–2020** (WMO standard normal period),
  ~0.5° × 0.625°, cached per cell.
* Day-of-year normal = mean over the 30 years of a **31-day window centred on the day**
  (circular, Feb 29 on a 366-day calendar).
* Temperature departure = forecast − normal; ±1.5 °C is reported as *near normal* because the
  forecast model and reanalysis have different biases at a point.
* Rainfall departure % uses the IMD classes above.
* Past 30 days are **model analysis**, not rain-gauge observations.
* **Production upgrade:** IMD Pune gridded rainfall (0.25°, 1901–present) and temperature (1°)
  normals — the authoritative Indian baseline; same provider interface.

## Farmer indicators — SYSTEM-DERIVED, unvalidated

Thresholds in `backend/app/engines/crops.yaml` carry `validation_status: unvalidated`. They are
commonly cited crop-physiology values (e.g. wheat terminal heat — Porter & Gawith 1999; rice
spikelet sterility above ~35 °C at anthesis — Jagadish et al. 2007) and **must** be reviewed by
a State Agricultural University (for Gujarat: AAU Anand, JAU Junagadh, NAU Navsari, SDAU
Dantiwada) before operational use. The UI shows them only under "System-derived weather
indicators", below the official Agromet Advisory block, with a disclaimer.

| Indicator | Rule |
|---|---|
| Heat stress | days with Tmax ≥ crop/stage threshold (≥ 1 Watch, ≥ 3 Alert) |
| Cold/frost | nights with Tmin ≤ crop/stage threshold |
| Spray window | daylight hours with wind ≤ 15 km/h and no rain in next 6 h |
| Disease-favourable hours | RH ≥ 85 % and 15–30 °C (leaf-wetness proxy) |
| Harvest window | longest run of days < 1 mm and rain probability < 30 % |
| Water balance | 7-day forecast rain − FAO-56 reference ET₀ (crop demand = ET₀ × Kc) |

## Earth2Studio GFS processing

`workers/e2s_gfs_ingest.py` uses `earth2studio.data.GFS_FX` (0.17 lexicon). GFS precipitation
(`tp` = `596::APCP::surface`) is a 6-hour bucket accumulation; the 3-hour amount is the bucket
value at L % 6 = 3 and the difference of consecutive buckets at L % 6 = 0 (verified against NOAA
`.idx` files f003–f240; unit-tested). Temperatures K → °C, pressure Pa → hPa, precipitation m → mm.

District statistics on the map use every 0.25° grid cell whose centre falls inside the district
polygon (max for Tmax/rain/wind, min for Tmin, mean for humidity); districts smaller than a cell
use the nearest cell.
