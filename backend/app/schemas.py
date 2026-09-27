"""API data contracts.

Every number exposed by the platform must be traceable: `Provenance` carries source, model,
issue time and licence; `DataPoint` is the canonical single-observation/forecast record
(source, model, issue_time, valid_time, lat, lon, variable, unit, confidence)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class Provenance(BaseModel):
    source: str  # e.g. "Open-Meteo", "NOAA GFS via Earth2Studio", "NDMA SACHET (IMD/CWC CAP)"
    model: str | None = None  # e.g. "ecmwf_ifs025", "GFS 0.25°"
    issue_time: datetime | None = None
    retrieved_at: datetime | None = None
    url: str | None = None
    licence: str | None = None
    notes: str | None = None


class DataPoint(BaseModel):
    variable: str
    value: float | None
    unit: str
    valid_time: datetime
    issue_time: datetime | None = None
    lat: float
    lon: float
    source: str
    model: str | None = None
    confidence: float | None = Field(None, description="0–1 where available (e.g. model agreement)")


class Location(BaseModel):
    name: str
    lat: float
    lon: float
    country: str = "India"
    state: str | None = None
    district: str | None = None
    district_id: str | None = None
    taluka: str | None = None
    locality: str | None = None
    elevation_m: float | None = None


RiskLevel = Literal[0, 1, 2, 3]  # 0 none, 1 watch, 2 alert, 3 severe


class Confidence(BaseModel):
    level: Literal["high", "medium", "low", "n/a"]
    score: float | None = None
    basis: str


class RiskItem(BaseModel):
    id: str  # heat, cold, rain, thunderstorm, lightning, wind, flood, drought, fog, fire, cyclone
    label: str
    level: RiskLevel
    status: str  # "No risk", "Watch", "Alert", "Severe"
    headline: str
    explanation: str
    criterion: str  # the documented rule that was applied
    reference: str | None = None  # methodology reference id (docs/METHODOLOGY.md)
    period_start: datetime | None = None
    period_end: datetime | None = None
    peak_value: float | None = None
    unit: str | None = None
    confidence: Confidence
    sources: list[str]
    official: bool = False  # True only if it comes from an official warning feed
    experimental: bool = False


class AnomalyItem(BaseModel):
    id: str
    label: str
    period: str
    value: float | None
    normal: float | None
    departure: float | None
    departure_pct: float | None = None
    unit: str
    category: str | None = None  # e.g. IMD rainfall category
    note: str | None = None


class Anomaly(BaseModel):
    baseline: Provenance
    method: str
    items: list[AnomalyItem]
    dry_spell_days: int | None = None
    dry_spell_note: str | None = None


class OfficialWarning(BaseModel):
    id: str
    headline: str
    description: str | None = None
    event: str | None = None
    issuer: str  # e.g. "IMD Ahmedabad", "CWC"
    sender: str | None = None
    severity: str | None = None  # CAP: Extreme/Severe/Moderate/Minor/Unknown
    urgency: str | None = None
    certainty: str | None = None
    effective: datetime | None = None
    expires: datetime | None = None
    area: str | None = None
    link: str | None = None
    polygon_url: str | None = None
    match: Literal["district", "state", "national"] = "national"
    district_ids: list[str] = []  # districts named in the alert (name match; polygons when available)
    source: str = "NDMA SACHET CAP feed"


class Dashboard(BaseModel):
    location: Location
    generated_at: datetime
    timezone: str
    current: dict[str, Any]
    hourly: dict[str, Any]
    daily: list[dict[str, Any]]
    anomaly: Anomaly | None
    risks: list[RiskItem]
    warnings: list[OfficialWarning]
    sources: list[Provenance]
    notices: list[str] = []


class GridMeta(BaseModel):
    source: str
    model: str
    issue_time: datetime | None
    times: list[datetime]
    variables: dict[str, dict[str, Any]]
    bbox: tuple[float, float, float, float]  # W,S,E,N
    nx: int
    ny: int
    dx: float
    dy: float
    resolution_note: str
    notices: list[str] = []
    grid_source: str = "gfs"
    sources_available: list[str] = []
