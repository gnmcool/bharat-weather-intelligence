"""Official warnings from NDMA SACHET — India's Common Alerting Protocol (CAP 1.2) gateway.

Carries alerts issued by IMD regional centres (heat, rain, thunderstorm/lightning, cyclone,
fog, cold wave), CWC (river flood), INCOIS and state SDMAs. We never alter wording.
IMD's own district-warning APIs require IP whitelisting; add an `imd_api` provider when
access is granted (same OfficialWarning contract).
"""
from __future__ import annotations

import asyncio
import re
import unicodedata
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

from .. import http
from ..cache import cache, disk_get, disk_set
from ..config import settings
from ..schemas import OfficialWarning

CAP = "{urn:oasis:names:tc:emergency:cap:1.2}"


def norm(s: str | None) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"\bdistrict\b", " ", s.lower())
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        try:
            return parsedate_to_datetime(s)
        except (TypeError, ValueError):
            return None


def _t(el: ET.Element | None, tag: str) -> str | None:
    if el is None:
        return None
    x = el.find(f"{CAP}{tag}")
    return x.text.strip() if x is not None and x.text else None


async def _detail(item: dict[str, Any]) -> dict[str, Any]:
    ident = item["guid"]
    hit = disk_get("cap", ident)
    if hit:
        return hit
    try:
        r = await http.get(item["link"], retries=1, timeout=20)
        root = ET.fromstring(r.content)
    except Exception:  # noqa: BLE001
        return {}
    info = root.find(f"{CAP}info")
    area = info.find(f"{CAP}area") if info is not None else None
    poly = None
    if info is not None:
        for p in info.findall(f"{CAP}parameter"):
            if (_t(p, "valueName") or "").lower().startswith("polygon"):
                poly = _t(p, "value")
    d = {
        "sender": _t(root, "sender"),
        "event": _t(info, "event"), "severity": _t(info, "severity"), "urgency": _t(info, "urgency"),
        "certainty": _t(info, "certainty"), "effective": _t(info, "effective"), "expires": _t(info, "expires"),
        "headline": _t(info, "headline"), "description": _t(info, "description"),
        "area": _t(area, "areaDesc"), "polygon_url": poly,
    }
    disk_set("cap", ident, d)
    return d


async def _all() -> list[dict[str, Any]]:
    async def load() -> list[dict[str, Any]]:
        r = await http.get(settings.sachet_rss_url, timeout=30)
        root = ET.fromstring(r.content)
        items = []
        for it in root.iter("item"):
            author = (it.findtext("author") or "")
            m = re.search(r"\(([^)]+)\)", author)
            items.append({
                "guid": (it.findtext("guid") or "").strip(),
                "title": (it.findtext("title") or "").strip(),
                "link": (it.findtext("link") or "").strip(),
                "category": it.findtext("category"),
                "issuer": m.group(1) if m else "NDMA",
                "pub": it.findtext("pubDate"),
            })
        items = items[: settings.sachet_max_details]
        sem = asyncio.Semaphore(8)

        async def one(i: dict[str, Any]) -> dict[str, Any]:
            async with sem:
                return {**i, **(await _detail(i))}

        return await asyncio.gather(*(one(i) for i in items))

    return await cache.get_or_set("sachet:all", 600, load)


def match_districts(text: str) -> list[str]:
    """District ids whose names occur in the alert text. Restricted to states named in the
    text when any are; otherwise only nationally-unique district names are accepted."""
    from ..geo import boundaries

    b = boundaries()
    t = f" {norm(text)} "
    states = {d.state for d in b.districts if f" {norm(d.state)} " in t}
    names: dict[str, list] = {}
    for d in b.districts:
        names.setdefault(norm(d.district), []).append(d)
    out = []
    for nm, ds in names.items():
        if not nm or f" {nm} " not in t:
            continue
        cand = [d for d in ds if d.state in states] if states else (ds if len(ds) == 1 else [])
        out.extend(d.id for d in cand)
    return out


async def warnings(state: str | None = None, district: str | None = None, include_national: bool = False,
                   district_id: str | None = None) -> list[OfficialWarning]:
    now = datetime.now(timezone.utc)
    st, dt = norm(state), norm(district)
    out: list[OfficialWarning] = []
    for w in await _all():
        exp = _dt(w.get("expires"))
        if exp and exp < now:
            continue
        text = norm(" ".join(filter(None, [w.get("area"), w.get("title"), w.get("headline")])))
        ids = match_districts(" ".join(filter(None, [w.get("area"), w.get("headline") or w["title"]])))
        match = "national"
        if district_id and district_id in ids:
            match = "district"
        elif dt and re.search(rf"\b{re.escape(dt)}\b", text):
            match = "district"
        elif st and re.search(rf"\b{re.escape(st)}\b", text):
            match = "state"
        if (st or dt) and match == "national" and not include_national:
            continue
        out.append(OfficialWarning(
            id=w["guid"], headline=w.get("headline") or w["title"], description=w.get("description"),
            event=w.get("event"), issuer=w["issuer"], sender=w.get("sender"), severity=w.get("severity"),
            urgency=w.get("urgency"), certainty=w.get("certainty"), effective=_dt(w.get("effective")),
            expires=exp, area=w.get("area"), link=w["link"], polygon_url=w.get("polygon_url"), match=match,
            district_ids=ids,
        ))
    rank = {"district": 0, "state": 1, "national": 2}
    sev = {"Extreme": 0, "Severe": 1, "Moderate": 2, "Minor": 3}
    out.sort(key=lambda w: (rank[w.match], sev.get(w.severity or "", 4)))
    return out


_poly_sem = asyncio.Semaphore(3)
_poly_fail: dict[str, float] = {}


async def polygon(url: str) -> dict[str, Any] | None:
    """Fetch a CAP polygon file and return GeoJSON (for map overlay).

    SACHET's polygon endpoint is protected by a WAF that returns 403 under bursts; we fetch
    politely (3 at a time), cache permanently, back off 30 min after a failure and fall back
    to district-name matching (OfficialWarning.district_ids)."""
    import time as _time

    if not url.startswith("https://sachet.ndma.gov.in/"):
        return None
    hit = disk_get("cap_poly", url)
    if hit:
        return hit
    if _time.time() - _poly_fail.get("_", 0) < 1800:
        return None
    try:
        async with _poly_sem:
            r = await http.get(url, retries=0, timeout=20)
        root = ET.fromstring(r.content)
    except Exception:  # noqa: BLE001
        _poly_fail["_"] = _time.time()
        return None
    polys = []
    for el in root.iter():
        if el.tag.endswith("polygon") and el.text:
            ring = []
            for pair in el.text.split():
                la, lo = pair.split(",")[:2]
                ring.append([float(lo), float(la)])
            if len(ring) >= 3:
                polys.append([ring])
    gj = {"type": "MultiPolygon", "coordinates": polys} if polys else None
    disk_set("cap_poly", url, gj)
    return gj
