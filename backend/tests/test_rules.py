"""Unit tests for documented rules (docs/METHODOLOGY.md). No network access needed."""
from datetime import date, timedelta

import numpy as np
import xarray as xr

from app.engines import thresholds as T
from app.engines.risk import _acc72, cold_level, dry_spell, flood_level, heat_level, rain_level, wind_level
from app.engines.series import Daily
from app.engines.terrain import classify
from app.geo import boundaries
from app.providers.nasa_power import _doy366
from workers.e2s_gfs_ingest import latest_cycle, to_store


# ---- M-HEAT -------------------------------------------------------------
def test_heat_plains_departure_classes():
    assert heat_level(42.0, 37.0, "plains")[0] == 2  # +5.0 → heat wave
    assert heat_level(44.0, 37.0, "plains")[0] == 3  # +7.0 → severe
    assert heat_level(41.0, 37.5, "plains")[0] == 1  # +3.5 → system watch
    assert heat_level(39.5, 33.0, "plains")[0] == 0  # below 40 °C threshold despite +6.5


def test_heat_absolute_and_terrain():
    assert heat_level(45.2, 44.0, "plains")[0] == 2  # absolute ≥ 45
    assert heat_level(47.1, 46.0, "plains")[0] == 3  # absolute ≥ 47
    assert heat_level(38.0, 33.4, "coastal")[0] == 2  # coastal ≥ 37 & +4.6
    assert heat_level(31.0, 26.0, "hills")[0] == 2  # hills ≥ 30 & +5
    assert heat_level(45.2, None, "coastal")[0] == 0  # absolute rule is plains-only; no normal → no departure


# ---- M-COLD -------------------------------------------------------------
def test_cold():
    assert cold_level(3.5, 8.0, "plains")[0] == 2  # absolute ≤ 4
    assert cold_level(1.5, 6.0, "plains")[0] == 3  # absolute ≤ 2
    assert cold_level(9.0, 14.0, "plains")[0] == 2  # −5
    assert cold_level(8.0, 15.0, "plains")[0] == 3  # −7
    assert cold_level(12.0, 20.0, "plains")[0] == 0  # above 10 °C


# ---- M-RAIN / M-WIND / M-FLOOD ------------------------------------------
def test_rain_categories_boundaries():
    assert rain_level(35.5) == 0 and rain_level(35.6) == 1
    assert rain_level(64.4) == 1 and rain_level(64.5) == 2
    assert rain_level(115.5) == 2 and rain_level(115.6) == 3
    assert T.rain_category(70) == "Heavy" and T.rain_category(210) == "Extremely heavy" and T.rain_category(10) == "Light"


def test_rain_departure_categories():
    assert T.rain_departure_category(-100) == "No rain"
    assert T.rain_departure_category(-60) == "Large deficient"
    assert T.rain_departure_category(-20) == "Deficient"
    assert T.rain_departure_category(19) == "Normal"
    assert T.rain_departure_category(25) == "Excess"
    assert T.rain_departure_category(60) == "Large excess"


def test_wind_and_flood():
    assert [wind_level(x) for x in (49, 50, 62, 89)] == [0, 1, 2, 3]
    assert [flood_level(x) for x in (100, 120, 210, 310)] == [0, 1, 2, 3]
    assert _acc72([10, 20, 30, 0], [100, 50]) == [160, 80, 60, 50]


# ---- M-DRY --------------------------------------------------------------
def test_dry_spell():
    today = date(2026, 9, 27)
    dates = [today + timedelta(days=i) for i in range(-10, 7)]
    precip = [5, 0, 0, 1, 0, 2.4, 0, 0, 0, 0] + [0, 0, 3.0, 0, 0, 0, 0]
    d = Daily(dates, {"precipitation_sum": precip}, 10)
    # 9 dry past days (after the 5 mm day) + today + tomorrow = 11
    assert dry_spell(d) == 11


# ---- Earth2Studio GFS precipitation de-accumulation -----------------------
def test_gfs_tp_deaccumulation():
    leads = [3, 6, 9, 12]
    bucket_m = np.array([1, 3, 2, 5], dtype="float32") / 1000.0  # 6-h buckets in metres
    lat = np.array([20.0, 20.25])
    lon = np.array([72.0, 72.25])
    data = np.zeros((4, 1, 2, 2), dtype="float32")
    data[:, 0] = bucket_m[:, None, None]
    da = xr.DataArray(data, dims=["lead_time", "variable", "lat", "lon"],
                      coords={"lead_time": [np.timedelta64(h, "h") for h in leads], "variable": ["tp"], "lat": lat, "lon": lon})
    from datetime import datetime

    ds = to_store(da, datetime(2026, 9, 27, 0), leads)
    np.testing.assert_allclose(ds.tp.values[:, 0, 0], [1, 2, 2, 3], atol=1e-4)  # mm per 3 h


def test_latest_cycle_is_6h_aligned():
    from datetime import datetime, timezone

    c = latest_cycle(datetime(2026, 9, 27, 4, 30, tzinfo=timezone.utc))
    assert (c.year, c.month, c.day, c.hour) == (2026, 9, 26, 18)


# ---- Climatology calendar -------------------------------------------------
def test_doy366_leap_handling():
    assert _doy366(date(2021, 2, 28)) == 58
    assert _doy366(date(2024, 2, 29)) == 59
    assert _doy366(date(2021, 3, 1)) == 60
    assert _doy366(date(2021, 12, 31)) == 365


# ---- Geography ------------------------------------------------------------
def test_locate_districts():
    b = boundaries()
    d = b.locate(23.0225, 72.5714)
    assert d and d.state == "Gujarat" and d.district == "Ahmedabad"
    d = b.locate(19.08, 82.03)
    assert d and d.state == "Chhattisgarh" and d.district == "Bastar"
    assert len({x.id for x in b.districts}) == len(b.districts)


def test_terrain():
    assert classify(23.02, 72.57, 53) == "plains"  # Ahmedabad
    assert classify(19.07, 72.88, 10) == "coastal"  # Mumbai
    assert classify(31.10, 77.17, 2200) == "hills"  # Shimla
