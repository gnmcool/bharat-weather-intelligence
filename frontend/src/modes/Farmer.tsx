import { AlertTriangle, BadgeCheck, ExternalLink, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { LocationSearch } from "../components/TopBar";
import { Badge, ErrorBox, LevelPill, Section, Spinner, WarningCard } from "../components/ui";
import { api, type CropList, type DistrictItem, type FarmerReport, type StateItem } from "../lib/api";
import { fmtDay, n } from "../lib/format";
import { useT } from "../lib/i18n";
import { useApp } from "../lib/store";
import FarmerSimple from "./FarmerSimple";

const pretty = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default function Farmer() {
  const { place, setPlace, resolved, lang } = useApp();
  const t = useT();
  const [detailed, setDetailed] = useState(() => {
    try {
      const v = localStorage.getItem("bwi.farmerDetailed");
      return v === null ? lang === "en" : v === "1";
    } catch {
      return true;
    }
  });
  const toggleDetailed = () => {
    setDetailed(!detailed);
    try {
      localStorage.setItem("bwi.farmerDetailed", detailed ? "0" : "1");
    } catch {
      /* ignore */
    }
  };
  const cropName = (id: string, fallback: string) => { const x = t(`crop.${id}`); return x === `crop.${id}` ? fallback : x; };
  const stageName = (s: string) => { const x = t(`st.${s}`); return x === `st.${s}` ? pretty(s) : x; };
  const [states, setStates] = useState<StateItem[]>([]);
  const [districts, setDistricts] = useState<DistrictItem[]>([]);
  const [crops, setCrops] = useState<CropList | null>(null);
  const [stateSlug, setStateSlug] = useState<string>("gujarat");
  const [districtId, setDistrictId] = useState<string>("");
  const [crop, setCrop] = useState(() => localStorage.getItem("bwi.crop") ?? "cotton");
  const [stage, setStage] = useState(() => localStorage.getItem("bwi.stage") ?? "boll_development");
  const [rep, setRep] = useState<FarmerReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.states().then(setStates).catch(() => undefined);
    api.crops().then(setCrops).catch((e) => setErr(String(e.message)));
  }, []);
  // keep selectors in sync with the chosen place (from the report or another mode)
  const locState = rep?.location.state ?? resolved?.state;
  const locDist = rep?.location.district_id ?? resolved?.district_id;
  useEffect(() => {
    if (!locState || !states.length) return;
    const s = states.find((x) => x.state === locState);
    if (s) setStateSlug(s.state_slug);
    if (locDist) setDistrictId(locDist);
  }, [locState, locDist, states]);
  useEffect(() => {
    api.districts(stateSlug).then(setDistricts).catch(() => setDistricts([]));
  }, [stateSlug]);
  useEffect(() => {
    const c = crops?.crops.find((x) => x.id === crop);
    if (c && !c.stages.includes(stage)) setStage(c.stages[0]);
  }, [crop, crops, stage]);
  useEffect(() => {
    try {
      localStorage.setItem("bwi.crop", crop);
      localStorage.setItem("bwi.stage", stage);
    } catch {
      /* ignore */
    }
    setRep(null);
    setErr(null);
    let live = true; // ignore responses from superseded requests
    api.farmer(place.lat, place.lon, crop, stage, place.name, place.taluka)
      .then((r) => live && setRep(r))
      .catch((e) => live && setErr(String(e.message)));
    return () => {
      live = false;
    };
  }, [place.lat, place.lon, place.name, place.taluka, crop, stage]);

  const stateObj = states.find((s) => s.state_slug === stateSlug);
  const distObj = districts.find((d) => d.id === districtId);
  const cropObj = crops?.crops.find((c) => c.id === crop);

  return (
    <div className="space-y-3">
      <Section title={t("your_field")}>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-slate-400">{t("state")}
            <select className="bwi-select mt-1 h-9 w-full rounded-lg bg-white/[0.06] px-2 text-[13px] text-white ring-1 ring-white/10" value={stateSlug}
              onChange={(e) => { setStateSlug(e.target.value); setDistrictId(""); }}>
              {states.map((s) => <option key={s.state_slug} value={s.state_slug} className="bg-ink-900">{s.state}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-slate-400">{t("district")}
            <select className="bwi-select mt-1 h-9 w-full rounded-lg bg-white/[0.06] px-2 text-[13px] text-white ring-1 ring-white/10" value={districtId}
              onChange={(e) => {
                const d = districts.find((x) => x.id === e.target.value);
                setDistrictId(e.target.value);
                if (d) setPlace({ name: d.district, lat: d.lat, lon: d.lon, state: stateObj?.state, district: d.district });
              }}>
              <option value="" className="bg-ink-900">Select…</option>
              {districts.map((d) => <option key={d.id} value={d.id} className="bg-ink-900">{d.district}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-2 text-[11px] text-slate-400">{t("taluka")}</div>
        <div className="mt-1">
          <LocationSearch state={stateObj?.state} district={distObj?.district} compact placeholder={distObj ? `Search in ${distObj.district}…` : "Search taluka or village…"}
            onPick={(r) => setPlace({ name: r.name, lat: r.lat, lon: r.lon, taluka: r.taluka, state: r.state, district: r.district })} />
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-300">
          <MapPin size={13} className="text-sky-400" /> {place.name}{rep?.location.taluka && rep.location.taluka !== place.name ? ` · ${rep.location.taluka} taluka` : ""}{rep?.location.district && rep.location.district !== place.name ? ` · ${rep.location.district}` : ""}
          <span className="text-slate-500">({place.lat.toFixed(3)}, {place.lon.toFixed(3)}) — or click the map</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-slate-400">{t("crop")}
            <select className="bwi-select mt-1 h-9 w-full rounded-lg bg-white/[0.06] px-2 text-[13px] text-white ring-1 ring-white/10" value={crop} onChange={(e) => setCrop(e.target.value)}>
              {crops?.crops.map((c) => <option key={c.id} value={c.id} className="bg-ink-900">{cropName(c.id, c.label)}{lang === "en" ? ` (${c.season})` : ""}</option>)}
            </select>
          </label>
          <div className="text-[11px] text-slate-400">{t("stage")}
            <div className="mt-1 flex flex-wrap gap-1">
              {cropObj?.stages.map((s) => (
                <button key={s} onClick={() => setStage(s)} className={`rounded-md px-2 py-1 text-[11px] ${stage === s ? "bg-emerald-500 text-white" : "bg-white/[0.06] text-slate-300 hover:bg-white/10"}`}>{stageName(s)}</button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {err && <ErrorBox error={err} />}
      {!rep && !err && <Spinner label="Computing crop-weather indicators" />}
      {rep && <FarmerSimple rep={rep} />}
      {rep && (
        <button onClick={toggleDetailed} className="w-full rounded-xl bg-white/[0.06] py-2 text-[12.5px] text-slate-200 ring-1 ring-white/10 hover:bg-white/10">
          {detailed ? `▲ ${t("simple")}` : `▼ ${t("detailed")}`}
        </button>
      )}
      {rep && detailed && <Report rep={rep} />}
    </div>
  );
}

function Report({ rep }: { rep: FarmerReport }) {
  const t = useT();
  return (
    <>
      {/* OFFICIAL */}
      <section className="overflow-hidden rounded-2xl ring-1 ring-emerald-400/40" style={{ background: "linear-gradient(135deg, rgba(16,185,129,.14), rgba(17,26,46,.85) 55%)" }}>
        <div className="flex items-center gap-2 border-b border-emerald-400/20 px-4 py-2.5">
          <BadgeCheck size={18} className="text-emerald-300" />
          <div className="text-[13px] font-semibold uppercase text-emerald-100">{t("official_adv")}</div>
        </div>
        <div className="space-y-2 p-4 text-[12.5px] text-slate-200">
          <div className="font-medium">{rep.official.title}</div>
          <p className="text-slate-300">{rep.official.note}</p>
          <div className="flex flex-wrap gap-2">
            {rep.official.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-[12px] text-white hover:bg-white/20">
                {l.label} <ExternalLink size={11} />
              </a>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">{rep.official.integration}</p>
          {rep.warnings.length > 0 && <div className="space-y-2 pt-1">{rep.warnings.slice(0, 3).map((w) => <WarningCard key={w.id} w={w} />)}</div>}
        </div>
      </section>

      {/* SYSTEM-DERIVED */}
      <section className="card overflow-hidden">
        <div className="flex items-start gap-2 bg-amber-400/10 px-4 py-2.5 text-[11.5px] leading-snug text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div><b>SYSTEM-DERIVED WEATHER INDICATORS</b> — {rep.disclaimer.split("—")[1] ?? rep.disclaimer}</div>
        </div>
        <div className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[14px] font-semibold text-white">{rep.crop_label}</span>
            <span className="text-[12px] text-slate-400">· {pretty(rep.stage)}</span>
            <Badge tone="amber">thresholds {rep.validation_status}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {rep.indicators.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[12.5px] text-white">{i.label}</div>
                  <div className="text-[11px] text-slate-500">{i.rule}</div>
                </div>
                <div className="shrink-0 text-right">
                  <LevelPill level={i.level} small />
                  <div className="mt-0.5 text-[11px] text-slate-300">{i.value}</div>
                </div>
              </div>
            ))}
          </div>
          {rep.crop_note && <p className="mt-2 text-[11px] text-slate-500">Basis: {rep.crop_note}</p>}
        </div>
      </section>

      <Section title="7-day field-work calendar" right={<span className="text-[11px] text-slate-500">system-derived</span>}>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead className="text-slate-500">
              <tr><th className="px-1 py-1 text-left font-medium">Day</th><th className="font-medium">Max/Min</th><th className="font-medium">Rain</th><th className="font-medium" title="Daylight hours with wind ≤ 15 km/h and no rain in next 6 h">Spray h</th><th className="font-medium" title="Hours with RH ≥ 85% and 15–30 °C">Humid h</th><th className="font-medium">Dry day</th></tr>
            </thead>
            <tbody>
              {rep.days.map((d) => (
                <tr key={d.date} className="border-t border-white/5 text-center text-slate-200">
                  <td className="px-1 py-1.5 text-left">{fmtDay(d.date, { weekday: "short", day: "numeric" })}</td>
                  <td>{n(d.tmax)}° / {n(d.tmin)}°</td>
                  <td className={d.rain && d.rain >= 2.5 ? "text-sky-300" : ""}>{n(d.rain, 1)} <span className="text-slate-500">({d.rain_prob ?? "—"}%)</span></td>
                  <td><span className={`inline-block min-w-7 rounded px-1 ${d.spray_hours >= 4 ? "bg-emerald-500/20 text-emerald-200" : d.spray_hours ? "bg-yellow-400/10 text-yellow-200" : "text-slate-500"}`}>{d.spray_hours}</span></td>
                  <td><span className={d.disease_hours >= 8 ? "text-orange-300" : "text-slate-400"}>{d.disease_hours}</span></td>
                  <td>{d.dry ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Water balance (7 days)">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-black/20 p-2"><div className="text-[11px] text-slate-400">Rain</div><div className="text-lg font-semibold text-sky-300">{n(rep.water_balance.rain_7d_mm, 0)} mm</div></div>
          <div className="rounded-xl bg-black/20 p-2"><div className="text-[11px] text-slate-400">ET₀</div><div className="text-lg font-semibold text-amber-300">{n(rep.water_balance.et0_7d_mm, 0)} mm</div></div>
          <div className="rounded-xl bg-black/20 p-2"><div className="text-[11px] text-slate-400">Balance</div><div className={`text-lg font-semibold ${rep.water_balance.balance_mm < 0 ? "text-orange-300" : "text-emerald-300"}`}>{n(rep.water_balance.balance_mm, 0)} mm</div></div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Soil moisture 9–27 cm: {rep.water_balance.soil_moisture_9_27cm ?? "—"} m³/m³ (model). {rep.water_balance.note}
        </p>
      </Section>
    </>
  );
}
