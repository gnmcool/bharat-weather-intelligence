import { Building2, Languages, LocateFixed, Map as MapIcon, Search, Sprout, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, asset, type GeoResult } from "../lib/api";
import { LANGS, useT, type Lang } from "../lib/i18n";
import { useApp, type Mode } from "../lib/store";

export const MODES: { id: Mode; icon: typeof User }[] = [
  { id: "citizen", icon: User },
  { id: "farmer", icon: Sprout },
  { id: "government", icon: Building2 },
  { id: "map", icon: MapIcon },
];

export function LocationSearch({ state, district, onPick, placeholder, compact }: {
  state?: string;
  district?: string;
  onPick: (r: GeoResult) => void;
  placeholder?: string;
  compact?: boolean;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const [pendingEnter, setPendingEnter] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pick = (r: GeoResult) => {
    onPick(r);
    setOpen(false);
    setQ("");
    setRes([]);
    setPendingEnter(false);
  };
  useEffect(() => {
    if (q.trim().length < 2) {
      setRes([]);
      return;
    }
    const ac = new AbortController();
    const tm = setTimeout(() => {
      setBusy(true);
      api.search(q.trim(), state, district, ac.signal)
        .then((r) => {
          setRes(r);
          setActive(0);
          setOpen(true);
        })
        .catch(() => undefined)
        .finally(() => setBusy(false));
    }, 250);
    return () => {
      clearTimeout(tm);
      ac.abort();
    };
  }, [q, state, district]);
  // Enter pressed before results arrived → take the first result as soon as it lands
  useEffect(() => {
    if (pendingEnter && !busy && res.length) pick(res[0]);
  }, [pendingEnter, busy, res]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(res.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (res.length && !busy) pick(res[Math.min(active, res.length - 1)]);
      else if (q.trim().length >= 2) setPendingEnter(true);
    } else if (e.key === "Escape") setOpen(false);
  };
  return (
    <div ref={box} className="relative w-full">
      <div className={`flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 ring-1 ring-white/10 focus-within:ring-sky-400/60 ${compact ? "h-9" : "h-10"}`}>
        <Search size={15} className="text-slate-400" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setPendingEnter(false); }} onKeyDown={onKey}
          onFocus={() => res.length && setOpen(true)} placeholder={placeholder ?? t("search")} enterKeyHint="search"
          className="h-full w-full bg-transparent text-[13px] text-white placeholder:text-slate-500 focus:outline-none" aria-label="Search location" />
        {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />}
      </div>
      {open && res.length > 0 && (
        <div className="glass absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-xl p-1" role="listbox">
          {res.map((r, i) => (
            <button key={i} onClick={() => pick(r)} onMouseEnter={() => setActive(i)} role="option" aria-selected={i === active}
              className={`block w-full rounded-lg px-3 py-2 text-left ${i === active ? "bg-white/10" : "hover:bg-white/10"}`}>
              <div className="text-[13px] text-white">{r.name}</div>
              <div className="text-[11px] text-slate-400">{[r.taluka && r.taluka !== r.name ? `${r.taluka} taluka` : null, r.district, r.state].filter(Boolean).join(" · ")}</div>
            </button>
          ))}
        </div>
      )}
      {open && !busy && q.length >= 2 && res.length === 0 && (
        <div className="glass absolute left-0 right-0 top-full z-50 mt-1 rounded-xl p-3 text-xs text-slate-400">No places found{state ? ` in ${district ?? state}` : ""}.</div>
      )}
    </div>
  );
}

export function LanguageSelect({ big }: { big?: boolean }) {
  const { lang, setLang } = useApp();
  return (
    <label className="relative flex shrink-0 items-center" title="Language / भाषा">
      <Languages size={15} className="pointer-events-none absolute left-2.5 text-sky-300" />
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label="Language"
        className={`bwi-select rounded-xl bg-white/[0.06] pl-8 text-white ring-1 ring-white/10 ${big ? "h-11 w-full text-[15px]" : "h-9 max-w-[118px] text-[12.5px]"}`}>
        {LANGS.map((l) => <option key={l.id} value={l.id} className="bg-ink-900">{l.native}</option>)}
      </select>
    </label>
  );
}

export default function TopBar({ mobile }: { mobile?: boolean }) {
  const { mode, setMode, setPlace } = useApp();
  const t = useT();
  const [locating, setLocating] = useState(false);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!gpsMsg) return;
    const id = setTimeout(() => setGpsMsg(null), 9000);
    return () => clearTimeout(id);
  }, [gpsMsg]);
  const useGps = () => {
    // Browsers only allow GPS on https:// or http://localhost pages
    if (!window.isSecureContext || !navigator.geolocation) {
      setGpsMsg(`Your browser blocks location on ${location.host}. Open the app at http://localhost:${location.port || 5173} (or https), or search / click the map instead.`);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPlace({ name: "My location", lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setGpsMsg(err.code === 1 ? "Location permission was denied. Allow it in the browser's site settings (lock icon in the address bar)." :
          err.code === 3 ? "Location timed out. Try again, or search for your village." : "Could not get your location. Search for your village instead.");
      },
      { timeout: 12000, enableHighAccuracy: false, maximumAge: 600000 },
    );
  };
  return (
    <header className="glass pointer-events-auto absolute left-2 right-2 top-2 z-30 flex h-14 items-center gap-2 rounded-2xl px-3 md:left-3 md:right-3 md:top-3 md:gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <img src={asset("/favicon.svg")} alt="" className="h-8 w-8" />
        <div className="hidden leading-tight lg:block" title="Weather → Impact → Decision">
          <div className="text-[14px] font-bold tracking-tight text-white">Bharat Weather Intelligence</div>
          <div className="text-[10.5px] text-slate-400">{t("made_by")} <span className="font-semibold text-sky-300">Gaurav Makwana</span></div>
        </div>
      </div>
      {!mobile && <nav className="flex shrink-0 rounded-xl bg-black/25 p-1" aria-label="Mode">
        {MODES.map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)} aria-current={mode === m.id} title={t(`mode.${m.id}`)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition ${mode === m.id ? "bg-white text-slate-900 shadow" : "text-slate-300 hover:text-white"}`}>
            <m.icon size={15} />
            <span className="hidden md:inline">{t(`mode.${m.id}`)}</span>
          </button>
        ))}
      </nav>}
      {!mobile && <LanguageSelect />}
      <div className={`relative ml-auto flex w-full items-center gap-2 ${mobile ? "" : "max-w-md"}`}>
        <LocationSearch onPick={(r) => setPlace({ name: r.name, lat: r.lat, lon: r.lon, taluka: r.taluka, state: r.state, district: r.district })} compact />
        <button onClick={useGps} title={t("gps")} aria-label={t("gps")} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-slate-300 ring-1 ring-white/10 hover:text-white">
          {locating ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" /> : <LocateFixed size={16} />}
        </button>
        {gpsMsg && (
          <div role="alert" className="glass absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-24px)] rounded-xl p-3 text-[12px] leading-snug text-amber-200">
            {gpsMsg}
          </div>
        )}
      </div>
    </header>
  );
}
