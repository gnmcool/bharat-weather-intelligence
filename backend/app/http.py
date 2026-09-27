from __future__ import annotations

import asyncio
import logging

import httpx

from .config import settings

log = logging.getLogger("bwi.http")
_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=settings.http_timeout_s,
            headers={"User-Agent": "BharatWeatherIntelligence/0.1 (+research pilot)"},
            follow_redirects=True,
        )
    return _client


async def get(url: str, params: dict | None = None, retries: int = 2, **kw) -> httpx.Response:
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            r = await client().get(url, params=params, **kw)
            if r.status_code in (429, 502, 503, 504) and attempt < retries:
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            r.raise_for_status()
            return r
        except (httpx.TransportError, httpx.HTTPStatusError) as e:  # pragma: no cover - network
            last = e
            if attempt < retries:
                await asyncio.sleep(1.0 * (attempt + 1))
    assert last is not None
    raise last


async def aclose() -> None:
    if _client is not None:
        await _client.aclose()
