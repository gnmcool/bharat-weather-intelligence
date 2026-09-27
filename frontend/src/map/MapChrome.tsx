import { Cloud, CloudRain, Droplets, Flame, Gauge, Globe2, Leaf, Pause, Play, Satellite, Sprout, Thermometer, Waves, Wind, Zap } from "lucide-react";
import { api, apiUrl, type EoLayer } from "../lib/api";
import { useEffect, useMemo, useState } from "react";
import { useT } from "../lib/i18n";
import type { GridMeta } from "../lib/api";
import { fmtDateTime, TZ } from "../lib/format";
import { useApp, type LayerId } from "../lib/store";
import { cssGradient, PALETTES } from "./colormaps";

const LAYERS: { id: LayerId; label: string; key?: string; icon: typeof Wind; needs: string[] }[] = [
  { id: "wind", label: "Wind", key: "wind", icon: Wind, needs: ["wind"] },
  { id: "t2m", label: "Temperature", key: "temp", icon: Thermometer, needs: ["t2m"] },
  { id: "tp", label: "Rain", key: "rain", icon: CloudRain, needs: ["tp"] },
  { id: "tcc", label: "Clouds", icon: Cloud, needs: ["tcc"] },
  { id: "fg10m", label: "Gusts", icon: Zap, needs: ["fg10m", "gust"] },
  { id: "r2m", label: "Humidity", key: "humidity", icon: Droplets, needs: ["r2m", "rh"] },
  { id: "msl", label: "Pressure", icon: Gauge, needs: ["msl"] },
  { id: "tcwv", label: "Moisture", icon: Waves, needs: ["tcwv"] },
];

const SAT_PRODUCTS = [
  { id: "ir", label: "Clouds (IR)", title: "Infrared clouds — day & night, white = cloud" },
  { id: "natural", label: "Visible", title: "Natural colour — daytime only" },
  { id: "convection", label: "Storms", title: "Convection RGB — bright yellow/red = strong storm tops" },
] as const;

function useSatTime(on: boolean) {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return;
    const load = () => fetch(apiUrl("/sat/meta")).then((r) => r.json()).then((j) => setT(j.latest?.ir ?? null)).catch(() => undefined);
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [on]);
  return t;
}

export function resolveVar(meta: GridMeta | undefined, id: LayerId): string {
  if (!meta) return id;
  if (id === "fg10m" && !meta.variables.fg10m && meta.variables.gust) return "gust";
  if (id === "r2m" && !meta.variables.r2m && meta.variables.rh) return "rh";
  return id;
}

export function LayerPicker({ meta, sheet }: { meta?: GridMeta; sheet?: boolean }) {
  const { layer, setLayer, particles, setParticles, gridSource, setGridSource, sat, setSat, satAnim, setSatAnim, satFrameTime, eo, setEo, fires, setFires } = useApp();
  const t = useT();
  const satTime = useSatTime(sat !== "off");
  // fall back to wind if the current layer is not in this source (e.g. rain in the AI model)
  useEffect(() => {
    const cur = LAYERS.find((l) => l.id === layer);
    if (meta && cur && !cur.needs.some((n) => meta.variables[n])) setLayer("wind");
  }, [meta, layer, setLayer]);
  return (
    <div className={sheet ? "pointer-events-auto flex flex-col gap-0.5" : "glass panel-scroll pointer-events-auto flex max-h-[calc(100vh-290px)] flex-col gap-0.5 overflow-y-auto rounded-2xl p-1.5"}>
      {meta?.sources_available?.includes("ai") && (
        <div className="mb-1 grid grid-cols-2 gap-0.5 rounded-xl bg-black/30 p-0.5 text-[11px]" title="Model source">
          {(["gfs", "ai"] as const).map((s) => (
            <button key={s} onClick={() => setGridSource(s)} className={`rounded-lg px-2 py-1 ${gridSource === s ? (s === "ai" ? "bg-fuchsia-500 text-white" : "bg-white text-slate-900") : "text-slate-300"}`}>
              {s === "gfs" ? "GFS" : "AI β"}
            </button>
          ))}
        </div>
      )}
      <div className={sheet ? "grid grid-cols-2 gap-1" : "contents"}>
      {LAYERS.filter((l) => !meta || l.needs.some((n) => meta.variables[n])).map((l) => {
        const on = layer === l.id;
        return (
          <button key={l.id} onClick={() => setLayer(l.id)} title={l.key ? t(l.key) : l.label}
            className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] transition ${on ? "bg-sky-500/90 text-white shadow" : "text-slate-200 hover:bg-white/10"}`}>
            <l.icon size={16} strokeWidth={2} />
            <span className={sheet ? "" : "hidden sm:inline"}>{l.key ? t(l.key) : l.label}</span>
          </button>
        );
      })}
      </div>
      <div className="my-1 h-px bg-white/10" />
      <button onClick={() => setParticles(!particles)} title="Animated wind particles"
        className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] ${particles ? "text-sky-300" : "text-slate-400"} hover:bg-white/10`}>
        <span className={`inline-block h-3 w-6 rounded-full transition ${particles ? "bg-sky-500" : "bg-slate-600"}`}>
          <span className={`block h-3 w-3 rounded-full bg-white transition ${particles ? "translate-x-3" : ""}`} />
        </span>
        <span className={sheet ? "" : "hidden sm:inline"}>Particles</span>
      </button>
      <div className="my-1 h-px bg-white/10" />
      <button onClick={() => setSat(sat === "off" ? "ir" : "off")} title="Live satellite imagery — EUMETSAT Meteosat (Indian Ocean), every 15 min"
        className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] transition ${sat !== "off" ? "bg-indigo-500/90 text-white shadow" : "text-slate-200 hover:bg-white/10"}`}>
        <Satellite size={16} strokeWidth={2} />
        <span className={sheet ? "" : "hidden sm:inline"}>Satellite</span>
      </button>
      {sat !== "off" && (
        <div className="px-1 pb-1">
          <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-black/30 p-0.5 text-[10.5px]">
            {SAT_PRODUCTS.map((p) => (
              <button key={p.id} onClick={() => setSat(p.id)} title={p.title}
                className={`rounded-md px-1 py-1 ${sat === p.id ? "bg-white text-slate-900" : "text-slate-300"}`}>{p.label}</button>
            ))}
          </div>
          <button onClick={() => setSatAnim(!satAnim)} title="Loop the last 3 hours of satellite images (30-min steps)"
            className={`mt-1 flex w-full items-center justify-center gap-1 rounded-md py-1 text-[11px] ${satAnim ? "bg-indigo-500 text-white" : "bg-white/[0.06] text-slate-200 hover:bg-white/10"}`}>
            {satAnim ? <Pause size={11} /> : <Play size={11} />} {satAnim ? "Stop loop" : "Animate last 3 h"}
          </button>
          <div className="mt-1 text-[10px] leading-tight text-slate-400">
            Meteosat · {(() => {
              const tt = satAnim ? satFrameTime : satTime;
              return tt ? new Date(tt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }) + " IST" : satAnim ? "loading frames…" : "latest";
            })()}
            <br />not synced to timeline
          </div>
        </div>
      )}
      <NasaLayers eo={eo} setEo={setEo} fires={fires} setFires={setFires} sheet={sheet} />
    </div>
  );
}

export function Legend({ meta, compact }: { meta?: GridMeta; compact?: boolean }) {
  const { layer } = useApp();
  const v = resolveVar(meta, layer);
  const p = PALETTES[v];
  if (!p || layer === "none") return null;
  const min = p.stops[0][0];
  const max = p.stops[p.stops.length - 1][0];
  return (
    <div className={`glass pointer-events-auto rounded-xl ${compact ? "w-[190px] px-2 py-1" : "w-[260px] px-3 py-2"}`}>
      <div className="mb-1 flex justify-between text-[11px] text-slate-300">
        <span className="font-medium text-white">{p.label}</span>
        <span>{p.unit}</span>
      </div>
      <div className="relative h-2.5 rounded-full" style={{ background: cssGradient(p) }} />
      <div className="relative mt-1 h-3 text-[10px] text-slate-400">
        {p.ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: `${((t - min) / (max - min)) * 100}%` }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

export function Timeline({ meta, compact }: { meta?: GridMeta; compact?: boolean }) {
  const { timeIndex, setTimeIndex, playing, setPlaying } = useApp();
  const times = meta?.times ?? [];
  // default to the step nearest to now
  useEffect(() => {
    if (!times.length || (timeIndex >= 0 && timeIndex < times.length)) return;
    const now = Date.now();
    let best = 0;
    times.forEach((t, i) => {
      if (Math.abs(new Date(t).getTime() - now) < Math.abs(new Date(times[best]).getTime() - now)) best = i;
    });
    setTimeIndex(best);
  }, [times, timeIndex, setTimeIndex]);
  useEffect(() => {
    if (!playing || !times.length) return;
    const id = setInterval(() => {
      const i = useApp.getState().timeIndex;
      setTimeIndex(i + 1 >= times.length ? 0 : i + 1);
    }, 900);
    return () => clearInterval(id);
  }, [playing, times.length, setTimeIndex]);

  const days = useMemo(() => {
    const out: { label: string; start: number; len: number }[] = [];
    times.forEach((t, i) => {
      const d = new Date(t);
      const lbl = compact
        ? d.toLocaleDateString("en-IN", { timeZone: TZ, day: "numeric" })
        : d.toLocaleDateString("en-IN", { timeZone: TZ, weekday: "short", day: "numeric" });
      const last = out[out.length - 1];
      if (last && last.label === lbl) last.len++;
      else out.push({ label: lbl, start: i, len: 1 });
    });
    return out;
  }, [times, compact]);

  if (!times.length) return null;
  const i = Math.max(0, Math.min(times.length - 1, timeIndex));
  const nowIdx = times.findIndex((t) => new Date(t).getTime() > Date.now());
  return (
    <div className={`glass pointer-events-auto flex w-full items-center gap-2 rounded-xl px-2 ${compact ? "h-11 py-1" : "py-1"}`}>
      <button onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-500 text-white shadow hover:bg-sky-400">
        {playing ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="relative flex h-3.5 text-[9.5px] leading-none text-slate-400">
          {days.map((d) => (
            <div key={d.start} className={`truncate border-l border-white/10 ${compact ? "text-center" : "pl-1"}`} style={{ width: `${(d.len / times.length) * 100}%` }}>
              {compact && d.len < 6 ? "" : d.label}
            </div>
          ))}
        </div>
        <div className="relative -mt-0.5">
          <input type="range" min={0} max={times.length - 1} value={i} onChange={(e) => setTimeIndex(+e.target.value)} className="bwi-range bwi-range-sm w-full" aria-label="Forecast time" />
          {nowIdx > 0 && <div className="pointer-events-none absolute top-0 h-full w-px bg-amber-300/70" style={{ left: `${((nowIdx - 0.5) / (times.length - 1)) * 100}%` }} title="Now" />}
        </div>
      </div>
      <div className="shrink-0 text-right leading-tight">
        <div className={`${compact ? "text-[11px]" : "text-[11.5px]"} font-semibold text-white`}>
          {compact
            ? new Date(times[i]).toLocaleString("en-IN", { timeZone: TZ, weekday: "short", hour: "numeric" })
            : fmtDateTime(times[i])}
        </div>
        <div className="text-[9.5px] text-slate-400">IST{compact ? "" : ` · ${i + 1}/${times.length}`}</div>
      </div>
    </div>
  );
}

export function SourceBadge({ meta }: { meta?: GridMeta }) {
  if (!meta) return null;
  const run = meta.issue_time ? new Date(meta.issue_time) : null;
  const runLabel = run ? `${run.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} ${String(run.getUTCHours()).padStart(2, "0")}Z` : "—";
  const e2s = meta.source.includes("Earth2Studio");
  const ai = meta.grid_source === "ai";
  const ageH = run ? (Date.now() - run.getTime()) / 3.6e6 : 0;
  const stale = e2s && !ai && ageH > 12;
  return (
    <div className="glass pointer-events-auto max-w-[360px] rounded-xl px-3 py-1.5 text-[11px] leading-tight text-slate-300" title={meta.resolution_note}>
      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${ai ? "bg-fuchsia-400" : stale ? "bg-amber-400" : e2s ? "bg-emerald-400" : "bg-amber-400"}`} />
      <b className="text-white">{meta.model}</b> · {e2s ? "Earth2Studio" : meta.source} · run {runLabel}
      {ai && <span className="ml-1 rounded bg-fuchsia-500/30 px-1 text-fuchsia-200">experimental</span>}
      {stale && <span className="ml-1 rounded bg-amber-500/25 px-1 text-amber-200" title="Run scripts/ingest.sh or set up scripts/schedule-windows.ps1">{Math.round(ageH)} h old — update</span>}
    </div>
  );
}

const EO_ICON: Record<string, typeof Wind> = { rain_now: CloudRain, flood: Waves, soil: Sprout, ndvi: Leaf, truecolor: Globe2 };

function NasaLayers({ eo, setEo, fires, setFires, sheet }: { eo: string; setEo: (s: string) => void; fires: boolean; setFires: (b: boolean) => void; sheet?: boolean }) {
  const [layers, setLayers] = useState<EoLayer[]>([]);
  const [fireMeta, setFireMeta] = useState<{ count: number; latest: string | null } | null>(null);
  useEffect(() => {
    api.earthobsLayers().then(setLayers).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!fires) return;
    fetch(apiUrl("/earthobs/fires")).then((r) => r.json()).then((j) => setFireMeta(j.meta)).catch(() => undefined);
  }, [fires]);
  const cur = layers.find((l) => l.id === eo);
  const date = (t: string) => (t.includes("T") ? new Date(t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + " IST" : new Date(t + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short" }));
  return (
    <>
      <div className="my-1 h-px bg-white/10" />
      <div className="px-2 pb-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-slate-500">NASA satellite data</div>
      {layers.map((l) => {
        const Icon = EO_ICON[l.id] ?? Globe2;
        const on = eo === l.id;
        return (
          <button key={l.id} onClick={() => setEo(on ? "none" : l.id)} title={l.desc}
            className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[12.5px] transition ${on ? "bg-emerald-600/90 text-white shadow" : "text-slate-200 hover:bg-white/10"}`}>
            <Icon size={15} strokeWidth={2} />
            <span className={sheet ? "" : "hidden sm:inline"}>{l.label}</span>
          </button>
        );
      })}
      <button onClick={() => setFires(!fires)} title="Active fires detected by NASA VIIRS satellites in the last 24 hours (FIRMS)"
        className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[12.5px] transition ${fires ? "bg-orange-600/90 text-white shadow" : "text-slate-200 hover:bg-white/10"}`}>
        <Flame size={15} strokeWidth={2} />
        <span className={sheet ? "" : "hidden sm:inline"}>Fires (24 h){fires && fireMeta ? ` · ${fireMeta.count}` : ""}</span>
      </button>
      {cur && (
        <div className="mx-1 mt-1 max-w-[190px] rounded-lg bg-black/30 p-1.5 text-[10px] leading-snug text-slate-400">
          <div className="text-slate-200">{cur.label}</div>
          <div>{date(cur.time)} · {cur.cadence}</div>
          {cur.legend && <img src={cur.legend} alt="legend" className="mt-1 w-full rounded bg-white/90 p-0.5" />}
          <div className="mt-1">{cur.desc}</div>
        </div>
      )}
      {fires && fireMeta && (
        <div className="mx-1 mt-1 max-w-[190px] text-[10px] leading-snug text-slate-400">
          🔥 {fireMeta.count} fire detections, latest {fireMeta.latest ? date(fireMeta.latest) : "—"}. Dot colour = fire intensity (FRP).
        </div>
      )}
      <div className="px-2 pt-1 text-[9px] text-slate-600">NASA EOSDIS GIBS / FIRMS</div>
    </>
  );
}
