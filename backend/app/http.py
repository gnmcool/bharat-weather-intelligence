from __future__ import annotations

import asyncio
import logging

import httpx

from .config import settings

log = logging.getLogger("bwi.http")
_client: httpx.AsyncClient | None = None
_loop: asyncio.AbstractEventLoop | None = None


_sems: dict[str, tuple[asyncio.AbstractEventLoop, asyncio.Semaphore]] = {}


def semaphore(name: str, n: int) -> asyncio.Semaphore:
    """Process-wide semaphore that is re-created if the event loop changes (serverless hosts)."""
    loop = asyncio.get_running_loop()
    cur = _sems.get(name)
    if cur is None or cur[0] is not loop:
        cur = _sems[name] = (loop, asyncio.Semaphore(n))
    return cur[1]


def client() -> httpx.AsyncClient:
    global _client, _loop
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if _client is None or _client.is_closed or loop is not _loop:  # new event loop → new client
        _loop = loop
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
