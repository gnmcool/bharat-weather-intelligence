import { ArrowLeft, ArrowUpDown, ExternalLink, FileSpreadsheet, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ErrorBox, LevelPill, Section, Sources, Spinner, WarningCard } from "../components/ui";
import { api, apiUrl, asset, type RegionIndia, type RegionState, type StateDistrictRow, type StateItem } from "../lib/api";
import { fmtDateTime, LEVEL, n, signed } from "../lib/format";
import { useApp } from "../lib/store";
import type { Choropleth } from "../map/MapView";

export const GOV_METRICS: Record<string, { label: string; unit: string; stops: [number, string][]; asc?: boolean }> = {
  rain: { label: "Rainfall", unit: "mm", stops: [[0, "rgba(30,41,59,0.55)"], [2.5, "#1e3a5f"], [15, "#2563eb"], [35.6, "#7c3aed"], [64.5, "#c026d3"], [115.6, "#f43f5e"], [204.5, "#fde047"]] },
  tmax: { label: "Max temperature", unit: "°C", stops: [[18, "#1e3a8a"], [26, "#0891b2"], [31, "#65a30d"], [35, "#eab308"], [38, "#f97316"], [41, "#dc2626"], [45, "#7f1d1d"]] },
  tmin: { label: "Min temperature", unit: "°C", asc: true, stops: [[-10, "#6d28d9"], [0, "#2563eb"], [8, "#0ea5e9"], [15, "#14b8a6"], [21, "#eab308"], [26, "#f97316"], [30, "#dc2626"]] },
  gust: { label: "Max wind / gust", unit: "km/h", stops: [[10, "#1e3a5f"], [25, "#0e7490"], [40, "#65a30d"], [50, "#eab308"], [62, "#f97316"], [89, "#dc2626"]] },
  rh: { label: "Mean humidity", unit: "%", stops: [[10, "#92400e"], [30, "#ca8a04"], [50, "#65a30d"], [70, "#0891b2"], [90, "#1d4ed8"]] },
};
const WINDOWS = [[24, "24 h"], [72, "72 h"], [120, "5 days"]] as const;

type DistMeta = Record<string, { district: string; state: string; state_slug: string }>;
let distMetaP: Promise<DistMeta> | null = null;
export function districtMeta(): Promise<DistMeta> {
  distMetaP ??= fetch(asset("/geo/india_districts.geojson"))
    .then((r) => r.json())
    .then((fc: GeoJSON.FeatureCollection) => Object.fromEntries(fc.features.map((f) => [f.properties!.id, { district: f.properties!.district, state: f.properties!.state, state_slug: f.properties!.state_slug }])));
  return distMetaP;
}

export function useGovChoropleth(): { data: RegionIndia | null; choropleth: Choropleth | null; err: string | null } {
  const { govMetric, govHours } = useApp();
  const [data, setData] = useState<RegionIndia | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setErr(null);
    api.regionIndia(govMetric, govHours).then(setData).catch((e) => setErr(String(e.message)));
  }, [govMetric, govHours]);
  const choropleth = useMemo(() => (data ? { values: data.values, stops: GOV_METRICS[govMetric].stops } : null), [data, govMetric]);
  return { data, choropleth, err };
}

export default function Government({ india, err }: { india: RegionIndia | null; err: string | null }) {
  const { govMetric, govHours, govState, setGov } = useApp();
  const [states, setStates] = useState<StateItem[]>([]);
  const [meta, setMeta] = useState<DistMeta>({});
  useEffect(() => {
    api.states().then(setStates).catch(() => undefined);
    districtMeta().then(setMeta).catch(() => undefined);
  }, []);
  const M = GOV_METRICS[govMetric];

  return (
    <div className="space-y-3">
      <Section title="Geographic intelligence">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-slate-400">Scope
            <select className="bwi-select mt-1 h-9 w-full rounded-lg bg-white/[0.06] px-2 text-[13px] text-white ring-1 ring-white/10" value={govState ?? ""}
              onChange={(e) => setGov({ govState: e.target.value || undefined, focusDistrict: undefined })}>
              <option value="" className="bg-ink-900">All India</option>
              {states.map((s) => <option key={s.state_slug} value={s.state_slug} className="bg-ink-900">{s.state}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-slate-400">Map metric
            <select className="bwi-select mt-1 h-9 w-full rounded-lg bg-white/[0.06] px-2 text-[13px] text-white ring-1 ring-white/10" value={govMetric} onChange={(e) => setGov({ govMetric: e.target.value })}>
              {Object.entries(GOV_METRICS).map(([k, v]) => <option key={k} value={k} className="bg-ink-900">{v.label}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-2 flex gap-1">
          {WINDOWS.map(([h, l]) => (
            <button key={h} onClick={() => setGov({ govHours: h })} className={`rounded-md px-2.5 py-1 text-[12px] ${govHours === h ? "bg-sky-500 text-white" : "bg-white/[0.06] text-slate-300"}`}>Next {l}</button>
          ))}
        </div>
        <ChoroLegend metric={govMetric} />
        {india && <p className="mt-2 text-[11px] text-slate-500">{india.meta.model} · {india.meta.source} · {india.aggregation} · window {fmtDateTime(india.window[0])} → {fmtDateTime(india.window[1])} IST</p>}
      </Section>

      {err && <ErrorBox error={err} />}
      {!govState && india && <Hotspots india={india} meta={meta} unit={M.unit} asc={!!M.asc} />}
      {govState && <StatePanel slug={govState} />}
    </div>
  );
}

function ChoroLegend({ metric }: { metric: string }) {
  const M = GOV_METRICS[metric];
  return (
    <div className="mt-3">
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {M.stops.map(([, c], i) => <div key={i} className="flex-1" style={{ background: c }} />)}
      </div>
      <div className="mt-1 flex text-[10px] text-slate-400">
        {M.stops.map(([v], i) => <div key={i} className="flex-1">{v}</div>)}
      </div>
      <div className="text-right text-[10px] text-slate-500">{M.unit}</div>
    </div>
  );
}

function Hotspots({ india, meta, unit, asc }: { india: RegionIndia; meta: DistMeta; unit: string; asc: boolean }) {
  const { setGov } = useApp();
  const top = Object.entries(india.values)
    .filter(([, v]) => v !== null)
    .sort((a, b) => (asc ? (a[1]! - b[1]!) : (b[1]! - a[1]!)))
    .slice(0, 14);
  return (
    <Section title={`Hotspots — ${india.label.toLowerCase()}`} right={<span className="text-[11px] text-slate-500">click to open state</span>}>
      <div className="divide-y divide-white/5">
        {top.map(([id, v], i) => {
          const m = meta[id];
          return (
            <button key={id} onClick={() => m && setGov({ govState: m.state_slug, focusDistrict: id })} className="flex w-full items-center gap-3 py-1.5 text-left hover:bg-white/[0.03]">
              <span className="w-5 text-right text-[11px] text-slate-500">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-white">{m?.district ?? id} <span className="text-slate-500">· {m?.state}</span></span>
              <span className="text-[12.5px] font-semibold text-sky-200">{n(v, 1)} {unit}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

type SortKey = "max_level" | "tmax_7d_max" | "tmax_anom_7d" | "rain_7d" | "rain_30d_pct" | "gust_max" | "district";

function StatePanel({ slug }: { slug: string }) {
  const { setGov, focusDistrict, setPlace, setMode } = useApp();
  const [d, setD] = useState<RegionState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("max_level");
  const [desc, setDesc] = useState(true);
  useEffect(() => {
    setD(null);
    setErr(null);
    api.regionState(slug).then(setD).catch((e) => setErr(String(e.message)));
  }, [slug]);
  const rows = useMemo(() => {
    if (!d) return [];
    const r = [...d.districts];
    r.sort((a, b) => {
      const av = a[sort] as number | string | null, bv = b[sort] as number | string | null;
      if (av === null) return 1;
      if (bv === null) return -1;
      const c = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return desc ? -c : c;
    });
    return r;
  }, [d, sort, desc]);
  if (err) return <ErrorBox error={err} />;
  if (!d) return <Spinner label="Scanning districts (first load fetches 30-year baselines)" />;

  const counts = [3, 2, 1].map((l) => d.districts.filter((x) => x.max_level === l).length);
  const warmest = [...d.districts].filter((x) => x.tmax_anom_7d !== null).sort((a, b) => b.tmax_anom_7d! - a.tmax_anom_7d!)[0];
  const wettest = [...d.districts].sort((a, b) => b.rain_7d - a.rain_7d)[0];
  const driest = [...d.districts].filter((x) => x.rain_30d_pct !== null).sort((a, b) => a.rain_30d_pct! - b.rain_30d_pct!)[0];
  const H = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th className="cursor-pointer select-none px-1 py-1 font-medium hover:text-white" onClick={() => (sort === k ? setDesc(!desc) : (setSort(k), setDesc(true)))}>
      <span className="inline-flex items-center gap-0.5">{children}{sort === k && <ArrowUpDown size={10} />}</span>
    </th>
  );
  const focus = d.districts.find((x) => x.id === focusDistrict);

  return (
    <>
      <Section title={<span className="flex items-center gap-2"><button onClick={() => setGov({ govState: undefined, focusDistrict: undefined })} className="rounded p-0.5 hover:bg-white/10" aria-label="Back to India"><ArrowLeft size={14} /></button>{d.state}</span>}
        right={<span className="text-[11px] text-slate-500">{d.districts.length} districts · 7 days</span>}>
        <div className="mb-2 flex gap-2">
          <a href={apiUrl(`/region/state/${slug}/export.xlsx`)} download
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-1.5 text-[12px] font-medium text-white hover:bg-emerald-500">
            <FileSpreadsheet size={14} /> Excel report
          </a>
          <a href={apiUrl(`/region/state/${slug}/report.html`)} target="_blank" rel="noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-2 py-1.5 text-[12px] font-medium text-white hover:bg-white/20">
            <Printer size={14} /> Briefing / PDF
          </a>
        </div>
        <div className="text-[12px] text-slate-300">Where is something unusual happening?</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {counts.map((c, i) => {
            const L = LEVEL[(3 - i) as 1 | 2 | 3];
            return (
              <div key={i} className={`rounded-xl p-2 text-center ring-1 ${L.bg} ${L.ring}`}>
                <div className={`text-xl font-bold ${L.text}`}>{c}</div>
                <div className="text-[10.5px] text-slate-400">{L.label}</div>
              </div>
            );
          })}
        </div>
        <ul className="mt-3 space-y-1 text-[12px] text-slate-300">
          {warmest && <li>🌡️ Warmest vs normal: <b className="text-white">{warmest.district}</b> {signed(warmest.tmax_anom_7d)}°C (7-day mean Tmax)</li>}
          {wettest && <li>🌧️ Wettest next 7 days: <b className="text-white">{wettest.district}</b> {n(wettest.rain_7d, 0)} mm{wettest.rain_7d_normal !== null && ` (normal ${n(wettest.rain_7d_normal, 0)})`}</li>}
          {driest && <li>🏜️ Largest 30-day deficit: <b className="text-white">{driest.district}</b> {signed(driest.rain_30d_pct, 0)}% ({driest.rain_30d_cat})</li>}
        </ul>
      </Section>

      {focus && (
        <Section title={focus.district} right={
          <button onClick={() => { setPlace({ name: focus.district, lat: focus.lat, lon: focus.lon, district: focus.district, state: d.state }); setMode("citizen"); }}
            className="inline-flex items-center gap-1 rounded-md bg-sky-500 px-2 py-1 text-[11px] text-white">Open dashboard <ExternalLink size={11} /></button>}>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {(["heat", "cold", "rain", "wind"] as const).map((k) => <span key={k} className="inline-flex items-center gap-1 text-slate-400">{k} <LevelPill level={focus.levels[k]} small /></span>)}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[11.5px] text-slate-300">
            <div>Tmax 7d: <b className="text-white">{n(focus.tmax_7d_max, 1)}°</b> ({signed(focus.tmax_anom_7d)})</div>
            <div>Rain 7d: <b className="text-white">{n(focus.rain_7d, 0)} mm</b></div>
            <div>30d: <b className="text-white">{signed(focus.rain_30d_pct, 0)}%</b></div>
          </div>
        </Section>
      )}

      <Section title="District table">
        <div className="-mx-2 max-h-[420px] overflow-auto panel-scroll">
          <table className="w-full text-[11.5px]">
            <thead className="sticky top-0 bg-ink-800 text-slate-400">
              <tr>
                <H k="district">District</H><H k="max_level">Risk</H><H k="tmax_7d_max">Tmax</H><H k="tmax_anom_7d">Δ°C</H>
                <H k="rain_7d">Rain 7d</H><H k="rain_30d_pct">30d %</H><H k="gust_max">Gust</H>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <Row key={r.id} r={r} active={r.id === focusDistrict} onClick={() => setGov({ focusDistrict: r.id })} />)}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">{d.method}</p>
      </Section>

      {d.warnings.length > 0 && (
        <Section title="Official warnings in state">
          <div className="space-y-2">{d.warnings.slice(0, 12).map((w) => <WarningCard key={w.id} w={w} />)}</div>
        </Section>
      )}
      <Section title="Sources"><Sources sources={d.sources} notices={d.notices} /></Section>
    </>
  );
}

function Row({ r, active, onClick }: { r: StateDistrictRow; active: boolean; onClick: () => void }) {
  const L = LEVEL[r.max_level];
  return (
    <tr onClick={onClick} className={`cursor-pointer border-t border-white/5 text-center ${active ? "bg-sky-500/15" : "hover:bg-white/[0.03]"}`}>
      <td className="px-1 py-1.5 text-left text-white">{r.district}{r.official_warnings > 0 && <span className="ml-1 rounded bg-red-500/20 px-1 text-[9px] text-red-300" title="Official warnings">{r.official_warnings}</span>}</td>
      <td><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: L.dot }} title={`${L.label}: heat ${r.levels.heat}, cold ${r.levels.cold}, rain ${r.levels.rain}, wind ${r.levels.wind}`} /></td>
      <td>{n(r.tmax_7d_max, 1)}</td>
      <td className={(r.tmax_anom_7d ?? 0) >= 1.5 ? "text-orange-300" : (r.tmax_anom_7d ?? 0) <= -1.5 ? "text-sky-300" : "text-slate-400"}>{signed(r.tmax_anom_7d)}</td>
      <td className={r.rain_7d >= 35 ? "text-sky-300" : ""}>{n(r.rain_7d, 0)}</td>
      <td className={(r.rain_30d_pct ?? 0) <= -20 ? "text-amber-300" : (r.rain_30d_pct ?? 0) >= 20 ? "text-sky-300" : "text-slate-400"} title={r.rain_30d_cat ?? ""}>{r.rain_30d_pct === null ? "—" : signed(r.rain_30d_pct, 0)}</td>
      <td>{n(r.gust_max, 0)}</td>
    </tr>
  );
}
