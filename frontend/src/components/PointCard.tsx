import { MapPin, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, ComposedChart, Line, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { api, apiUrl, type GridPoint, type Location } from "../lib/api";
import { fmtTime, n } from "../lib/format";
import { useApp } from "../lib/store";

export default function PointCard({ lng, lat, onClose }: { lng: number; lat: number; onClose: () => void }) {
  const { timeIndex, setPlace, setMode, mode, gridSource } = useApp();
  const [gp, setGp] = useState<GridPoint | null>(null);
  const [loc, setLoc] = useState<Location | null>(null);
  useEffect(() => {
    setGp(null);
    api.gridPoint(lat, lng, gridSource).then(setGp).catch(() => undefined);
    fetch(apiUrl(`/geo/locate?lat=${lat}&lon=${lng}`)).then((r) => r.json()).then(setLoc).catch(() => undefined);
  }, [lat, lng, gridSource]);
  const rows = useMemo(
    () => (gp ? gp.time.map((t, i) => ({ i, t, temp: gp.series.t2m?.[i], rain: gp.series.tp?.[i] })) : []),
    [gp],
  );
  const ti = Math.max(0, Math.min((gp?.time.length ?? 1) - 1, timeIndex));
  const val = (k: string, d = 0) => n(gp?.series[k]?.[ti] ?? null, d);
  return (
    <div className="glass pointer-events-auto w-[min(440px,calc(100vw-24px))] rounded-2xl p-3">
      <div className="flex items-start gap-2">
        <MapPin size={16} className="mt-0.5 text-sky-400" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-white">{loc?.district ? `${loc.district}, ${loc.state}` : "Outside India districts"}</div>
          <div className="text-[11px] text-slate-400">{lat.toFixed(3)}°N {lng.toFixed(3)}°E · {gp ? `${gp.model} · ${fmtTime(gp.time[ti], { weekday: "short", hour: "numeric" })}` : "loading…"}</div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-white/10" aria-label="Close"><X size={15} /></button>
      </div>
      {gp && (
        <>
          <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px] text-slate-400">
            <div><div className="text-[15px] font-semibold text-white">{val("t2m", 1)}°</div>Temp</div>
            <div><div className="text-[15px] font-semibold text-white">{val("wind")}</div>Wind km/h</div>
            <div><div className="text-[15px] font-semibold text-white">{val("tp", 1)}</div>Rain mm/3h</div>
            <div><div className="text-[15px] font-semibold text-white">{val("r2m") !== "—" ? val("r2m") : val("rh")}%</div>RH</div>
          </div>
          <div className="mt-1 h-20">
            <ResponsiveContainer>
              <ComposedChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <XAxis dataKey="i" hide />
                <YAxis yAxisId="t" hide domain={["dataMin - 1", "dataMax + 1"]} />
                <YAxis yAxisId="r" hide domain={[0, (m: number) => Math.max(3, m)]} />
                <Bar yAxisId="r" dataKey="rain" fill="#38bdf8" isAnimationActive={false} />
                <Line yAxisId="t" type="monotone" dataKey="temp" stroke="#fbbf24" dot={false} strokeWidth={1.8} isAnimationActive={false} connectNulls />
                <ReferenceLine yAxisId="t" x={ti} stroke="#fff" strokeOpacity={0.6} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[10px] text-slate-500">{gp.source} — 0.25° grid value (bilinear), not a station.</div>
        </>
      )}
      {mode !== "farmer" && (
        <button onClick={() => { setPlace({ name: loc?.district ?? `${lat.toFixed(2)}, ${lng.toFixed(2)}`, lat: +lat.toFixed(4), lon: +lng.toFixed(4), district: loc?.district, state: loc?.state }); setMode("citizen"); onClose(); }}
          className="mt-2 w-full rounded-lg bg-sky-500 py-1.5 text-[12px] font-medium text-white hover:bg-sky-400">
          Full intelligence for this point
        </button>
      )}
    </div>
  );
}
