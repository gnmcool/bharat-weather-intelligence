"""Helpers to slice Open-Meteo responses into past / forecast windows (local time)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from ..config import settings


def today_local() -> date:
    return datetime.now(ZoneInfo(settings.timezone)).date()


@dataclass
class Daily:
    dates: list[date]
    v: dict[str, list[Any]]
    i0: int  # index of today

    def fut(self, var: str, n: int | None = None) -> list[Any]:
        arr = self.v.get(var) or []
        return arr[self.i0 : (self.i0 + n) if n else None]

    def past(self, var: str, n: int) -> list[Any]:
        arr = self.v.get(var) or []
        return arr[max(0, self.i0 - n) : self.i0]

    def fut_dates(self, n: int | None = None) -> list[date]:
        return self.dates[self.i0 : (self.i0 + n) if n else None]


@dataclass
class Hourly:
    times: list[datetime]
    v: dict[str, list[Any]]
    i0: int  # index of current hour

    def fut(self, var: str, hours: int | None = None) -> list[Any]:
        arr = self.v.get(var) or []
        return arr[self.i0 : (self.i0 + hours) if hours else None]

    def fut_times(self, hours: int | None = None) -> list[datetime]:
        return self.times[self.i0 : (self.i0 + hours) if hours else None]


def daily(fc: dict[str, Any]) -> Daily:
    d = fc["daily"]
    dates = [date.fromisoformat(x) for x in d["time"]]
    t = today_local()
    i0 = next((i for i, x in enumerate(dates) if x >= t), len(dates) - 1)
    return Daily(dates, {k: v for k, v in d.items() if k != "time"}, i0)


def hourly(fc: dict[str, Any]) -> Hourly:
    h = fc["hourly"]
    tz = ZoneInfo(settings.timezone)
    times = [datetime.fromisoformat(x).replace(tzinfo=tz) for x in h["time"]]
    now = datetime.now(tz).replace(minute=0, second=0, microsecond=0)
    i0 = next((i for i, x in enumerate(times) if x >= now), len(times) - 1)
    return Hourly(times, {k: v for k, v in h.items() if k != "time"}, i0)


def nz(xs: list[Any]) -> list[float]:
    return [float(x) for x in xs if x is not None]


def at(d: date, hour: int = 0) -> datetime:
    return datetime(d.year, d.month, d.day, hour, tzinfo=ZoneInfo(settings.timezone))
