import type { Level } from "./api";

export const TZ = "Asia/Kolkata";

export const fmtTime = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { hour: "numeric" }) =>
  iso ? new Date(iso.length <= 16 && !iso.endsWith("Z") ? iso + ":00+05:30" : iso).toLocaleString("en-IN", { timeZone: TZ, ...opts }) : "—";

export const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  new Date(d + "T12:00:00+05:30").toLocaleDateString("en-IN", { timeZone: TZ, ...opts });

export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

export const n = (v: number | null | undefined, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(d));
export const signed = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d)}`);

export const LEVEL = {
  0: { label: "No risk", text: "text-emerald-300", bg: "bg-emerald-400/10", ring: "ring-emerald-400/30", dot: "#34d399" },
  1: { label: "Watch", text: "text-yellow-300", bg: "bg-yellow-400/10", ring: "ring-yellow-400/40", dot: "#facc15" },
  2: { label: "Alert", text: "text-orange-300", bg: "bg-orange-500/15", ring: "ring-orange-400/50", dot: "#fb923c" },
  3: { label: "Severe", text: "text-red-300", bg: "bg-red-500/15", ring: "ring-red-400/60", dot: "#f87171" },
} as Record<Level, { label: string; text: string; bg: string; ring: string; dot: string }>;

export const SEVERITY_COLOR: Record<string, string> = {
  Extreme: "#ef4444",
  Severe: "#f97316",
  Moderate: "#eab308",
  Minor: "#38bdf8",
  Unknown: "#94a3b8",
};

// WMO weather interpretation codes (Open-Meteo)
const WMO: Record<number, [string, string]> = {
  0: ["Clear sky", "☀️"],
  1: ["Mainly clear", "🌤️"],
  2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"],
  48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"],
  53: ["Drizzle", "🌦️"],
  55: ["Dense drizzle", "🌧️"],
  56: ["Freezing drizzle", "🌧️"],
  57: ["Freezing drizzle", "🌧️"],
  61: ["Light rain", "🌦️"],
  63: ["Rain", "🌧️"],
  65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"],
  67: ["Freezing rain", "🌧️"],
  71: ["Light snow", "🌨️"],
  73: ["Snow", "🌨️"],
  75: ["Heavy snow", "❄️"],
  77: ["Snow grains", "🌨️"],
  80: ["Rain showers", "🌦️"],
  81: ["Rain showers", "🌧️"],
  82: ["Violent showers", "⛈️"],
  85: ["Snow showers", "🌨️"],
  86: ["Snow showers", "🌨️"],
  95: ["Thunderstorm", "⛈️"],
  96: ["Thunderstorm, hail", "⛈️"],
  99: ["Severe thunderstorm, hail", "⛈️"],
};
export const wmo = (c: number | null | undefined, isDay = 1): [string, string] => {
  if (c === null || c === undefined) return ["—", "·"];
  const r = WMO[c] ?? ["Unknown", "·"];
  if (!isDay && (c === 0 || c === 1)) return [r[0], "🌙"];
  return r;
};

export const compass = (deg: number | null | undefined) => {
  if (deg === null || deg === undefined) return "—";
  const d = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return d[Math.round(deg / 22.5) % 16];
};

export const MODEL_NAME: Record<string, string> = { ecmwf_ifs025: "ECMWF", gfs_seamless: "GFS", icon_seamless: "ICON" };
