// Picture-first, voice-first farmer card for users who cannot read comfortably.
// Everything important is shown as an icon + colour + number, and read aloud with 🔊.
import { Square, Volume2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, type Dashboard, type FarmerReport, type Level } from "../lib/api";
import { LEVEL, n, wmo } from "../lib/format";
import { dayName, speak, stopSpeaking, translate, useT, voiceFor } from "../lib/i18n";
import { useApp } from "../lib/store";

export const RISK_ICON: Record<string, string> = {
  heat: "🌡️", cold: "❄️", rain: "🌧️", wind: "💨", thunderstorm: "⛈️", lightning: "⚡", flood: "🌊",
  drought: "🏜️", fog: "🌫️", fire: "🔥", cyclone: "🌀",
};

export default function FarmerSimple({ rep }: { rep: FarmerReport }) {
  const t = useT();
  const { lang, place } = useApp();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [noVoice, setNoVoice] = useState(false);
  useEffect(() => {
    let live = true;
    api.dashboard(place.lat, place.lon, place.name, place.taluka).then((d) => live && setDash(d)).catch(() => undefined);
    return () => {
      live = false;
      stopSpeaking();
    };
  }, [place.lat, place.lon, place.name, place.taluka]);
  useEffect(() => {
    stopSpeaking();
    setSpeaking(false);
    setNoVoice(false);
  }, [lang]);

  const active = useMemo(() => (dash?.risks ?? []).filter((r) => (r.level > 0 && !r.experimental) || r.level >= 2).sort((a, b) => b.level - a.level), [dash]);
  const days = rep.days.slice(0, 7);

  const script = useMemo(() => {
    if (!dash) return "";
    const d0 = dash.daily[0];
    const parts = [translate(lang, "s.today", { place: rep.location.name, tmax: n(d0?.temperature_2m_max), tmin: n(d0?.temperature_2m_min) })];
    if (d0?.precipitation_probability_max) parts.push(translate(lang, "s.pop", { pop: d0.precipitation_probability_max }));
    const r7 = rep.water_balance.rain_7d_mm;
    parts.push(r7 >= 1 ? translate(lang, "s.rain_week", { rain: Math.round(r7) }) : translate(lang, "s.dry_week"));
    parts.push(active.length ? translate(lang, "s.risks", { items: active.map((r) => translate(lang, `r.${r.id}`)).join(", ") }) : translate(lang, "s.safe"));
    const spray = days.filter((d) => d.spray_hours >= 4).slice(0, 4).map((d) => dayName(lang, d.date, true));
    if (spray.length) parts.push(translate(lang, "s.spray", { days: spray.join(", ") }));
    if (dash.warnings.some((w) => w.match !== "national")) parts.push(translate(lang, "s.official"));
    parts.push(translate(lang, "s.advice"));
    return parts.join(" ");
  }, [dash, lang, rep, active, days]);

  const onListen = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const ok = speak(lang, script, () => setSpeaking(false));
    setNoVoice(!ok);
    setSpeaking(ok);
  };
  const hasVoice = lang === "en" || !!voiceFor(lang);

  return (
    <section className="card overflow-hidden ring-1 ring-sky-400/30">
      <div className="flex items-center gap-3 bg-gradient-to-r from-sky-500/20 to-emerald-500/10 p-3">
        <button onClick={onListen} aria-label={speaking ? t("stop") : t("listen")}
          className={`grid h-16 w-16 shrink-0 place-items-center rounded-full text-white shadow-lg transition ${speaking ? "animate-pulse bg-red-500" : "bg-sky-500 hover:bg-sky-400"}`}>
          {speaking ? <Square size={26} fill="white" /> : <Volume2 size={30} />}
        </button>
        <div className="min-w-0">
          <div className="text-[16px] font-bold leading-tight text-white">{speaking ? t("stop") : t("listen")} 🔊</div>
          <div className="text-[12.5px] leading-snug text-slate-300">{t("week")}</div>
          {!hasVoice && <div className="mt-0.5 text-[10.5px] text-amber-300">{t("no_voice")}</div>}
        </div>
      </div>
      {noVoice && <div className="bg-amber-400/10 px-3 py-2 text-[11.5px] text-amber-200">{t("no_voice")}</div>}

      {/* Danger strip: icons only, colour = level */}
      <div className="flex flex-wrap gap-2 px-3 pt-3">
        {active.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-400/10 px-3 py-2 text-[14px] font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
            <span className="text-2xl">👍</span> {t("l0")}
          </div>
        )}
        {active.map((r) => {
          const L = LEVEL[r.level as Level];
          return (
            <div key={r.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ${L.bg} ${L.ring}`} title={r.headline}>
              <span className="text-2xl">{RISK_ICON[r.id] ?? "⚠️"}</span>
              <div className="leading-tight">
                <div className="text-[13px] font-semibold text-white">{t(`r.${r.id}`)}</div>
                <div className={`text-[11px] font-medium ${L.text}`}>{t(`l${r.level}`)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 7 day picture strip */}
      <div className="grid grid-cols-7 gap-1 p-3">
        {days.map((d, i) => {
          const dd = dash?.daily.find((x) => x.date === d.date);
          const [, icon] = wmo(dd?.weather_code ?? null);
          const wet = (d.rain ?? 0) >= 2.5;
          return (
            <div key={d.date} className={`flex flex-col items-center rounded-xl py-2 text-center ${i === 0 ? "bg-white/10 ring-1 ring-white/20" : "bg-black/20"}`}>
              <div className="text-[10.5px] font-semibold text-slate-300">{i === 0 ? t("today") : dayName(lang, d.date)}</div>
              <div className="my-1 text-2xl leading-none">{icon}</div>
              <div className="text-[13px] font-bold text-white">{n(d.tmax)}°</div>
              <div className="text-[10.5px] text-slate-400">{n(d.tmin)}°</div>
              <div className={`mt-1 text-[10.5px] font-semibold ${wet ? "text-sky-300" : "text-slate-500"}`}>💧{n(d.rain, 0)}</div>
              <div className="mt-1 h-5 text-base leading-none" title={d.spray_hours >= 4 ? t("spray_ok") : d.dry ? t("dry_day") : ""}>
                {d.spray_hours >= 4 ? "✅" : d.dry ? "☀️" : ""}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 pb-3 text-[11px] text-slate-400">
        <span>✅ {t("spray_ok")}</span>
        <span>☀️ {t("dry_day")}</span>
        <span>💧 {t("rain")} (mm)</span>
      </div>
    </section>
  );
}
