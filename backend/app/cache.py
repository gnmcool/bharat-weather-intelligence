"""Small async-safe TTL cache (memory) plus a permanent JSON disk cache for data that never
changes (e.g. 1991–2020 climatology)."""
from __future__ import annotations

import asyncio
import hashlib
import json
import pathlib
import time
from collections.abc import Awaitable, Callable
from typing import Any

from .config import settings


class TTLCache:
    def __init__(self, maxsize: int = 2048) -> None:
        self._d: dict[str, tuple[float, Any]] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self.maxsize = maxsize

    async def get_or_set(self, key: str, ttl_s: float, factory: Callable[[], Awaitable[Any]]) -> Any:
        hit = self._d.get(key)
        if hit and hit[0] > time.time():
            return hit[1]
        loop = asyncio.get_running_loop()
        if getattr(self, "_loop", None) is not loop:  # serverless hosts may run each request in a new loop
            self._loop, self._locks = loop, {}
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            hit = self._d.get(key)
            if hit and hit[0] > time.time():
                return hit[1]
            val = await factory()
            if len(self._d) >= self.maxsize:
                # drop the oldest-expiring ~10%
                for k in sorted(self._d, key=lambda k: self._d[k][0])[: self.maxsize // 10]:
                    self._d.pop(k, None)
            self._d[key] = (time.time() + ttl_s, val)
            return val


cache = TTLCache()


def _disk_path(namespace: str, key: str) -> pathlib.Path:
    h = hashlib.sha1(key.encode()).hexdigest()[:20]
    p = (settings.cache_dir or settings.data_dir / "cache") / namespace
    p.mkdir(parents=True, exist_ok=True)
    return p / f"{h}.json"


def disk_get(namespace: str, key: str) -> Any | None:
    p = _disk_path(namespace, key)
    if p.exists():
        try:
            return json.loads(p.read_text())
        except json.JSONDecodeError:
            return None
    return None


def disk_set(namespace: str, key: str, value: Any) -> None:
    p = _disk_path(namespace, key)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, separators=(",", ":")))
    tmp.replace(p)
