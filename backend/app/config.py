"""Runtime configuration. Every setting can be overridden with an env var prefixed BWI_
(or via backend/.env)."""
from __future__ import annotations

import os
import pathlib

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BWI_", env_file=BACKEND_ROOT / ".env", extra="ignore")

    # Paths
    data_dir: pathlib.Path = BACKEND_ROOT / "data"
    # Where the Earth2Studio worker writes its NetCDF forecast stores
    grid_store_dir: pathlib.Path = BACKEND_ROOT / "data" / "grids"
    # Writable cache folder (cloud hosts: set BWI_CACHE_DIR=/tmp/bwi-cache)
    cache_dir: pathlib.Path | None = None
    # Cloud mode: download the latest Earth2Studio store published by the GitHub Actions ingest
    # (e.g. https://github.com/<owner>/<repo>/releases/download/forecast/gfs_latest.nc)
    grid_store_url: str | None = None
    grid_store_refresh_min: float = 30.0

    # Service
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "https://gnmcool.github.io"]
    timezone: str = "Asia/Kolkata"

    # Providers
    openmeteo_forecast_url: str = "https://api.open-meteo.com/v1/forecast"
    openmeteo_geocoding_url: str = "https://geocoding-api.open-meteo.com/v1/search"
    openmeteo_models: list[str] = ["ecmwf_ifs025", "gfs_seamless", "icon_seamless"]
    # Open-Meteo commercial key (optional). Free tier is non-commercial, 10k calls/day.
    openmeteo_api_key: str | None = None

    nasa_power_url: str = "https://power.larc.nasa.gov/api/temporal/daily/point"
    climatology_start_year: int = 1991
    climatology_end_year: int = 2020

    sachet_rss_url: str = "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml"
    sachet_max_details: int = 120

    # Coarse fallback grid (used only when no Earth2Studio store exists)
    fallback_grid_step_deg: float = 2.0
    fallback_grid_bbox: tuple[float, float, float, float] = (66.0, 6.0, 99.0, 37.5)  # W,S,E,N

    # Earth2Studio store considered stale after this many hours
    grid_store_max_age_h: float = 30.0

    # Optional PostGIS
    database_url: str | None = None

    http_timeout_s: float = 40.0


settings = Settings()

# Cloud deployment (Vercel sets VERCEL=1): the code folder is read-only, so caches and the
# downloaded Earth2Studio store live in /tmp, and the store comes from the GitHub Actions ingest.
if os.environ.get("VERCEL"):
    if "BWI_CACHE_DIR" not in os.environ:
        settings.cache_dir = pathlib.Path("/tmp/bwi-cache")
    if "BWI_GRID_STORE_DIR" not in os.environ:
        settings.grid_store_dir = pathlib.Path("/tmp/bwi-grids")
    if "BWI_GRID_STORE_URL" not in os.environ:
        settings.grid_store_url = "https://github.com/gnmcool/bharat-weather-intelligence/releases/download/forecast/gfs_latest.nc"
