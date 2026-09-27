import { MapPin, ShieldAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { OfficialWarning } from "../lib/api";
import { SEVERITY_COLOR } from "../lib/format";
import { useT } from "../lib/i18n";
import { useApp } from "../lib/store";
import { WarningCard } from "./ui";

type DMeta = Record<string, { district: string; state: string; lat: number; lon: number }>;
let metaP: Promise<DMeta> | null = null;
const districtMeta = () =>
  (metaP ??= fetch("/geo/india_districts.geojson")
    .then((r) => r.json())
    .then((fc: GeoJSON.FeatureCollection) =>
      Object.fromEntries(fc.features.map((f) => [f.properties!.id, { district: f.properties!.district, state: f.properties!.state, lat: f.properties!.lat, lon: f.properties!.lon }])),
    ));

const RANK: Record<string, number> = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3 };

export default function AlertsPanel({ alerts, onFly }: { alerts: OfficialWarning[]; onFly: (lng: number, lat: number) => void }) {
  const t = useT();
  const { setAlertsOpen, resolved } = useApp();
  const [meta, setMeta] = useState<DMeta>({});
  const [scope, setScope] = useState<"all" | "state">("all");
  const [sev, setSev] = useState<string>("all");
  useEffect(() => {
    districtMeta().then(setMeta).catch(() => undefined);
  }, []);
  const stateOf = (a: OfficialWarning) => {
    const s = new Set((a.district_ids ?? []).map((id) => meta[id]?.state).filter(Boolean));
    return [...s].join(", ");
  };
  const list = useMemo(() => {
    let l = [...alerts];
    if (scope === "state" && resolved?.state) l = l.filter((a) => stateOf(a).includes(resolved.state!) || (a.area ?? "").includes(resolved.state!));
    if (sev !== "all") l = l.filter((a) => a.severity === sev);
    return l.sort((a, b) => (RANK[a.severity ?? ""] ?? 9) - (RANK[b.severity ?? ""] ?? 9));
  }, [alerts, scope, sev, resolved?.state, meta]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of alerts) c[a.severity ?? "Unknown"] = (c[a.severity ?? "Unknown"] ?? 0) + 1;
    return c;
  }, [alerts]);

  return (
    <div className="glass pointer-events-auto flex max-h-[calc(100vh-150px)] w-[380px] max-w-[calc(100vw-24px)] flex-col rounded-2xl">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <ShieldAlert size={16} className="text-red-300" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-white">{t("alerts")} <span className="text-slate-400">({alerts.length})</span></div>
          <div className="text-[10.5px] text-slate-400">IMD · CWC · SDMA via NDMA SACHET — original wording</div>
        </div>
        <button onClick={() => setAlertsOpen(false)} className="rounded p-1 text-slate-400 hover:bg-white/10" aria-label="Close"><X size={15} /></button>
      </div>
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 text-[11px]">
        {(["all", "state"] as const).map((s) => (
          <button key={s} onClick={() => setScope(s)} disabled={s === "state" && !resolved?.state}
            className={`rounded-md px-2 py-1 ${scope === s ? "bg-white text-slate-900" : "bg-white/[0.06] text-slate-300 disabled:opacity-40"}`}>
            {s === "all" ? "All India" : resolved?.state ?? "My state"}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-white/10" />
        {["all", "Extreme", "Severe", "Moderate", "Minor"].filter((s) => s === "all" || counts[s]).map((s) => (
          <button key={s} onClick={() => setSev(s)} className={`flex items-center gap-1 rounded-md px-2 py-1 ${sev === s ? "bg-white text-slate-900" : "bg-white/[0.06] text-slate-300"}`}>
            {s !== "all" && <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[s] }} />}
            {s === "all" ? "All" : `${s} ${counts[s]}`}
          </button>
        ))}
      </div>
      <div className="panel-scroll min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {!list.length && <div className="p-4 text-center text-[12px] text-slate-400">{t("alerts_none")}</div>}
        {list.map((a) => {
          const first = (a.district_ids ?? []).map((id) => meta[id]).find(Boolean);
          return (
            <div key={a.id}>
              <WarningCard w={a} />
              <div className="mt-0.5 flex items-center justify-between px-1 text-[10.5px] text-slate-500">
                <span className="truncate">{stateOf(a) || a.area}</span>
                {first && (
                  <button onClick={() => onFly(first.lon, first.lat)} className="flex shrink-0 items-center gap-1 text-sky-300 hover:underline">
                    <MapPin size={11} /> {t("show_on_map")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
