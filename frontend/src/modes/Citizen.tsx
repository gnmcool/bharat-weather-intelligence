import { Droplets, Eye, Gauge, Sunrise, Sunset, ThermometerSun, Wind } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorBox, RiskTile, Section, Sources, Spinner, WarningCard } from "../components/ui";
import { api, type Dashboard } from "../lib/api";
import { compass, fmtDay, fmtTime, LEVEL, MODEL_NAME, n, signed, wmo } from "../lib/format";
import { translate, useT, type Lang } from "../lib/i18n";
import { useApp } from "../lib/store";
import ListenButton from "../components/ListenButton";
import { RISK_ICON } from "./FarmerSimple";

export function useDashboard() {
  const { place, setResolved } = useApp();
  const [data, setData] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    setErr(null);
    setData(null);
    api.dashboard(place.lat, place.lon, place.name, place.taluka, ac.signal)
      .then((d) => {
        setData(d);
        setResolved(d.location);
      })
      .catch((e) => !ac.signal.aborted && setErr(String(e.message ?? e)));
    return () => ac.abort();
  }, [place.lat, place.lon, place.name, place.taluka, nonce, setResolved]);
  return { data, err, retry: () => setNonce((x) => x + 1) };
}

function summary(d: Dashboard, lang: Lang): { text: string; level: 0 | 1 | 2 | 3 } {
  const active = d.risks.filter((r) => r.level > 0).sort((a, b) => b.level - a.level);
  const official = d.warnings.filter((w) => w.match !== "national");
  if (official.length) return { text: `${official.length} official warning${official.length > 1 ? "s" : ""} in force for your area. ${active[0] ? active[0].headline + "." : ""}`, level: 3 };
  if (!active.length) return { text: translate(lang, "no_risk"), level: 0 };
  if (lang !== "en") return { text: active.slice(0, 3).map((r) => `${RISK_ICON[r.id] ?? ""} ${translate(lang, `r.${r.id}`)} — ${translate(lang, `l${r.level}`)}`).join(" · "), level: active[0].level };
  return { text: active.slice(0, 2).map((r) => r.headline).join(" · "), level: active[0].level };
}

export default function Citizen() {
  const { data: d, err, retry } = useDashboard();
  const lang = useApp((st) => st.lang);
  const t = useT();
  if (err) return <ErrorBox error={err} retry={retry} />;
  if (!d) return <Spinner label="Building your weather intelligence" />;
  const c = d.current.values;
  const [cond, icon] = wmo(c.weather_code?.value, c.is_day?.value);
  const today = d.daily[0];
  const s = summary(d, lang);
  const speech = [
    translate(lang, "s.today", { place: d.location.name, tmax: n(today?.temperature_2m_max), tmin: n(today?.temperature_2m_min) }),
    today?.precipitation_probability_max ? translate(lang, "s.pop", { pop: today.precipitation_probability_max }) : "",
    d.risks.some((r) => r.level > 0 && !r.experimental)
      ? translate(lang, "s.risks", { items: d.risks.filter((r) => r.level > 0 && !r.experimental).map((r) => translate(lang, `r.${r.id}`)).join(", ") })
      : translate(lang, "s.safe"),
    d.warnings.some((w) => w.match !== "national") ? translate(lang, "s.official") : "",
  ].filter(Boolean).join(" ");
  const L = LEVEL[s.level];
  const loc = d.location;
  const sub = [loc.taluka && loc.taluka !== loc.name ? `${loc.taluka} taluka` : null, loc.district && loc.district !== loc.name ? loc.district : null, loc.state].filter(Boolean).join(", ");
  const risks = [...d.risks].sort((a, b) => b.level - a.level);

  return (
    <div className="space-y-3">
      {/* HERO */}
      <section className="card overflow-hidden">
        <div className="bg-gradient-to-br from-sky-500/20 via-indigo-500/10 to-transparent p-4">
          <div className="text-[12px] text-slate-400">{sub || "India"} · {d.current.terrain}</div>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-white">{loc.name}</h2>
            <ListenButton text={speech} />
          </div>
          <div className="mt-2 flex items-end gap-4">
            <div className="text-6xl font-light leading-none tracking-tight text-white">{n(c.temperature_2m?.value)}°</div>
            <div className="pb-1">
              <div className="text-2xl leading-none">{icon}</div>
              <div className="text-[13px] text-slate-200">{cond}</div>
              <div className="text-[12px] text-slate-400">Feels {n(c.apparent_temperature?.value)}° · H {n(today?.temperature_2m_max)}° L {n(today?.temperature_2m_min)}°</div>
            </div>
          </div>
          <div className={`mt-3 rounded-xl px-3 py-2 text-[13px] ring-1 ${L.bg} ${L.ring} ${s.level ? L.text : "text-emerald-200"}`}>
            <span className="font-semibold">{t("know")}: </span>{s.text}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-px bg-white/5 text-center text-[11px] text-slate-400">
          {[
            [Droplets, `${n(c.relative_humidity_2m?.value)}%`, t("humidity")],
            [Wind, `${n(c.wind_speed_10m?.value)} ${compass(c.wind_direction_10m?.value)}`, `${t("wind")} km/h`],
            [Gauge, `${n(c.pressure_msl?.value)}`, "hPa"],
            [Eye, d.current.visibility_m !== null ? `${n((d.current.visibility_m ?? 0) / 1000, 1)} km` : "—", "Visibility"],
          ].map(([I, v, l], i) => {
            const Icon = I as typeof Wind;
            return (
              <div key={i} className="bg-ink-800/80 px-1 py-2.5">
                <Icon size={14} className="mx-auto mb-1 text-slate-500" />
                <div className="text-[13px] font-semibold text-white">{v as string}</div>
                <div>{l as string}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* OFFICIAL WARNINGS */}
      {d.warnings.length > 0 && (
        <Section title={t("official_warnings")} right={<span className="text-[11px] text-slate-500">IMD · CWC · SDMA via NDMA SACHET</span>}>
          <div className="space-y-2">{d.warnings.slice(0, 6).map((w) => <WarningCard key={w.id} w={w} />)}</div>
        </Section>
      )}

      {/* RISKS */}
      <Section title={t("risks")} right={<span className="text-[11px] text-slate-500">tap for rule & confidence</span>}>
        <div className="space-y-1.5">{risks.map((r) => <RiskTile key={r.id} r={r} />)}</div>
      </Section>

      <Hourly d={d} />
      <DailyList d={d} />
      <VsNormal d={d} />

      <Section title="Sun & UV">
        <div className="grid grid-cols-3 gap-2 text-center text-[12px]">
          <div className="rounded-lg bg-black/20 p-2"><Sunrise size={16} className="mx-auto text-amber-300" /><div className="mt-1 text-white">{fmtTime(today?.sunrise, { hour: "numeric", minute: "2-digit" })}</div></div>
          <div className="rounded-lg bg-black/20 p-2"><Sunset size={16} className="mx-auto text-orange-400" /><div className="mt-1 text-white">{fmtTime(today?.sunset, { hour: "numeric", minute: "2-digit" })}</div></div>
          <div className="rounded-lg bg-black/20 p-2"><ThermometerSun size={16} className="mx-auto text-rose-300" /><div className="mt-1 text-white">UV {n(today?.uv_index_max, 1)}</div></div>
        </div>
      </Section>

      <Section title="Where this comes from">
        <Sources sources={d.sources} notices={d.notices} />
        <p className="mt-2 text-[11px] text-slate-500">Current conditions are model analysis, not a weather-station reading. Generated {fmtTime(d.generated_at, { hour: "numeric", minute: "2-digit" })} IST.</p>
      </Section>
    </div>
  );
}

function Hourly({ d }: { d: Dashboard }) {
  const t = useT();
  const rows = useMemo(
    () => d.hourly.time.map((t, i) => ({
      t: fmtTime(t, { hour: "numeric" }),
      temp: d.hourly.temperature_2m?.[i],
      feels: d.hourly.apparent_temperature?.[i],
      rain: d.hourly.precipitation?.[i],
      pop: d.hourly.precipitation_probability?.[i],
      gust: d.hourly.wind_gusts_10m?.[i],
    })),
    [d],
  );
  return (
    <Section title={t("next48")}>
      <div className="h-44 -ml-3">
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="t" interval={5} tickLine={false} axisLine={false} />
            <YAxis yAxisId="t" width={34} tickLine={false} axisLine={false} domain={[(m: number) => Math.floor(m - 2), (m: number) => Math.ceil(m + 2)]} allowDecimals={false} tickFormatter={(v: number) => `${Math.round(v)}°`} />
            <YAxis yAxisId="r" orientation="right" width={28} tickLine={false} axisLine={false} domain={[0, (m: number) => Math.max(4, Math.ceil(m))]} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, fontSize: 12 }}
              formatter={(v: number, k: string) => [k === "rain" ? `${v} mm` : k === "pop" ? `${v}%` : `${v}°C`, { temp: "Temp", feels: "Feels like", rain: "Rain", pop: "Rain chance" }[k] ?? k]} />
            <Bar yAxisId="r" dataKey="rain" fill="#38bdf8" radius={[3, 3, 0, 0]} maxBarSize={6} />
            <Line yAxisId="t" type="monotone" dataKey="feels" stroke="#fb7185" strokeDasharray="3 3" dot={false} strokeWidth={1.2} />
            <Line yAxisId="t" type="monotone" dataKey="temp" stroke="#fbbf24" dot={false} strokeWidth={2.2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex gap-4 text-[11px] text-slate-400">
        <span><i className="mr-1 inline-block h-0.5 w-3 bg-amber-400 align-middle" />Temp</span>
        <span><i className="mr-1 inline-block h-0.5 w-3 border-t border-dashed border-rose-400 align-middle" />Feels like</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-sky-400 align-middle" />Rain mm</span>
      </div>
    </Section>
  );
}

function DailyList({ d }: { d: Dashboard }) {
  const t = useT();
  const days = d.daily.slice(0, 10);
  const lo = Math.min(...days.map((x) => Math.min(x.temperature_2m_min ?? 99, x.normal_tmin ?? 99)));
  const hi = Math.max(...days.map((x) => Math.max(x.temperature_2m_max ?? -99, x.normal_tmax ?? -99)));
  const pos = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
  return (
    <Section title={t("next10")} right={<span className="text-[11px] text-slate-500">▮ normal range · spread = model disagreement</span>}>
      <div className="divide-y divide-white/5">
        {days.map((x, i) => {
          const [cond, icon] = wmo(x.weather_code);
          const models = x.models ? Object.entries(x.models).map(([m, v]) => `${MODEL_NAME[m] ?? m} ${n(v.tmax)}°/${n(v.precip, 1)}mm`).join(" · ") : "";
          return (
            <div key={x.date} className="grid grid-cols-[62px_26px_1fr_64px] items-center gap-2 py-2" title={models}>
              <div className="text-[12.5px] text-white">{i === 0 ? t("today") : fmtDay(x.date, { weekday: "short", day: "numeric" })}</div>
              <div className="text-lg leading-none" title={cond}>{icon}</div>
              <div className="flex items-center gap-2">
                <span className="w-7 text-right text-[12px] text-slate-400">{n(x.temperature_2m_min)}°</span>
                <div className="relative h-1.5 flex-1 rounded-full bg-white/5">
                  {x.normal_tmin !== undefined && x.normal_tmax !== undefined && (
                    <div className="absolute -top-1 h-3.5 rounded-sm bg-white/10 ring-1 ring-white/15" style={{ left: pos(x.normal_tmin), width: `calc(${pos(x.normal_tmax)} - ${pos(x.normal_tmin)})` }} />
                  )}
                  <div className="absolute h-1.5 rounded-full bg-gradient-to-r from-sky-400 via-amber-300 to-rose-500"
                    style={{ left: pos(x.temperature_2m_min ?? lo), width: `calc(${pos(x.temperature_2m_max ?? hi)} - ${pos(x.temperature_2m_min ?? lo)})` }} />
                </div>
                <span className="w-7 text-[12px] font-semibold text-white">{n(x.temperature_2m_max)}°</span>
              </div>
              <div className="text-right text-[11px] leading-tight">
                <div className={x.precipitation_sum && x.precipitation_sum >= 2.5 ? "text-sky-300" : "text-slate-500"}>{n(x.precipitation_sum, 1)} mm</div>
                <div className="text-slate-500">
                  {x.precipitation_probability_max ?? "—"}%
                  {x.tmax_spread !== null && x.tmax_spread !== undefined && x.tmax_spread >= 3 && <span className="ml-1 text-amber-400" title="Models disagree by ≥3 °C">±{n(x.tmax_spread / 2, 0)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function VsNormal({ d }: { d: Dashboard }) {
  const t = useT();
  const a = d.anomaly;
  if (!a) return null;
  return (
    <Section title={t("vs_normal")} right={<span className="text-[11px] text-slate-500">baseline 1991–2020</span>}>
      <div className="grid grid-cols-2 gap-2">
        {a.items.map((it) => {
          const isRain = it.unit === "mm";
          const big = isRain ? (it.departure_pct !== null && it.departure_pct !== undefined ? `${signed(it.departure_pct, 0)}%` : `${n(it.value, 0)} mm`) : `${signed(it.departure)}°`;
          const warm = isRain ? (it.departure_pct ?? 0) > 19 : (it.departure ?? 0) >= 1.5;
          const cool = isRain ? (it.departure_pct ?? 0) < -19 : (it.departure ?? 0) <= -1.5;
          return (
            <div key={it.id} className="rounded-xl bg-black/20 p-3" title={it.note ?? undefined}>
              <div className="text-[11px] text-slate-400">{it.label}</div>
              <div className="text-[10.5px] text-slate-500">{it.period}</div>
              <div className={`mt-1 text-2xl font-semibold ${warm ? (isRain ? "text-sky-300" : "text-orange-300") : cool ? (isRain ? "text-amber-300" : "text-sky-300") : "text-white"}`}>{big}</div>
              <div className="text-[11px] text-slate-400">
                {n(it.value, 1)} vs {n(it.normal, 1)} {it.unit} · <span className="text-slate-300">{it.category}</span>
              </div>
            </div>
          );
        })}
        <div className="rounded-xl bg-black/20 p-3" title={a.dry_spell_note ?? undefined}>
          <div className="text-[11px] text-slate-400">Dry spell</div>
          <div className="text-[10.5px] text-slate-500">days &lt; 2.5 mm</div>
          <div className="mt-1 text-2xl font-semibold text-white">{a.dry_spell_days ?? "—"} <span className="text-sm font-normal text-slate-400">days</span></div>
          <div className="text-[11px] text-slate-400">incl. dry forecast days</div>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-slate-500">{a.method} Baseline: {a.baseline.source} ({a.baseline.model}).</p>
    </Section>
  );
}
