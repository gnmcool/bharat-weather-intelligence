// Typed client for the FastAPI backend. All requests go to /api/v1 (proxied by Vite in dev).
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api/v1";

async function get<T>(path: string, params?: Record<string, string | number | undefined | null>, signal?: AbortSignal): Promise<T> {
  const q = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && q.set(k, String(v)));
  const r = await fetch(`${BASE}${path}${q.toString() ? `?${q}` : ""}`, { signal });
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try {
      const j = await r.json();
      msg = j.detail ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

export interface Provenance {
  source: string;
  model?: string | null;
  issue_time?: string | null;
  retrieved_at?: string | null;
  url?: string | null;
  licence?: string | null;
  notes?: string | null;
}
export interface Location {
  name: string;
  lat: number;
  lon: number;
  state?: string | null;
  district?: string | null;
  district_id?: string | null;
  taluka?: string | null;
  locality?: string | null;
  elevation_m?: number | null;
}
export type Level = 0 | 1 | 2 | 3;
export interface Confidence {
  level: "high" | "medium" | "low" | "n/a";
  score?: number | null;
  basis: string;
}
export interface RiskItem {
  id: string;
  label: string;
  level: Level;
  status: string;
  headline: string;
  explanation: string;
  criterion: string;
  reference?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  peak_value?: number | null;
  unit?: string | null;
  confidence: Confidence;
  sources: string[];
  official: boolean;
  experimental: boolean;
}
export interface AnomalyItem {
  id: string;
  label: string;
  period: string;
  value: number | null;
  normal: number | null;
  departure: number | null;
  departure_pct?: number | null;
  unit: string;
  category?: string | null;
  note?: string | null;
}
export interface Anomaly {
  baseline: Provenance;
  method: string;
  items: AnomalyItem[];
  dry_spell_days?: number | null;
  dry_spell_note?: string | null;
}
export interface OfficialWarning {
  id: string;
  headline: string;
  description?: string | null;
  event?: string | null;
  issuer: string;
  sender?: string | null;
  severity?: string | null;
  urgency?: string | null;
  certainty?: string | null;
  effective?: string | null;
  expires?: string | null;
  area?: string | null;
  link?: string | null;
  polygon_url?: string | null;
  match: "district" | "state" | "national";
  district_ids: string[];
  source: string;
}
export interface DailyRow {
  date: string;
  weather_code: number | null;
  temperature_2m_max: number | null;
  temperature_2m_min: number | null;
  apparent_temperature_max: number | null;
  precipitation_sum: number | null;
  precipitation_probability_max: number | null;
  wind_speed_10m_max: number | null;
  wind_gusts_10m_max: number | null;
  wind_direction_10m_dominant: number | null;
  uv_index_max: number | null;
  sunrise: string | null;
  sunset: string | null;
  et0_fao_evapotranspiration: number | null;
  normal_tmax?: number;
  normal_tmin?: number;
  normal_precip?: number;
  models?: Record<string, { tmax: number | null; tmin: number | null; precip: number | null }>;
  tmax_spread?: number | null;
}
export interface Dashboard {
  location: Location;
  generated_at: string;
  timezone: string;
  current: {
    time: string;
    values: Record<string, { value: number; unit: string }>;
    visibility_m: number | null;
    dew_point: number | null;
    terrain: string;
    source: string;
  };
  hourly: Record<string, (number | null)[]> & { time: string[] };
  daily: DailyRow[];
  anomaly: Anomaly | null;
  risks: RiskItem[];
  warnings: OfficialWarning[];
  sources: Provenance[];
  notices: string[];
}
export interface GeoResult {
  name: string;
  lat: number;
  lon: number;
  state?: string | null;
  district?: string | null;
  taluka?: string | null;
  locality?: string | null;
  population?: number | null;
  district_id?: string | null;
}
export interface StateItem {
  state: string;
  state_code: string;
  state_slug: string;
  n_districts: number;
}
export interface DistrictItem {
  id: string;
  district: string;
  lat: number;
  lon: number;
  area_km2: number;
}
export interface GridMeta {
  source: string;
  model: string;
  issue_time: string | null;
  times: string[];
  variables: Record<string, { label: string; unit: string }>;
  bbox: [number, number, number, number];
  nx: number;
  ny: number;
  dx: number;
  dy: number;
  resolution_note: string;
  notices: string[];
  grid_source: "gfs" | "ai";
  sources_available: string[];
}
export interface GridField {
  var: string;
  time: string;
  ti: number;
  nx: number;
  ny: number;
  bbox: [number, number, number, number];
  min: number;
  max: number;
  values: (number | null)[];
  source: string;
  model: string;
  issue_time: string | null;
}
export interface GridWind {
  time: string;
  ti: number;
  nx: number;
  ny: number;
  bbox: [number, number, number, number];
  u: (number | null)[];
  v: (number | null)[];
}
export interface FarmerIndicator {
  id: string;
  label: string;
  level: Level;
  value: string;
  rule: string;
}
export interface FarmerReport {
  crop: string;
  crop_label: string;
  stage: string;
  stages: string[];
  season: string;
  validation_status: string;
  crop_note?: string;
  disclaimer: string;
  official: { title: string; note: string; links: { label: string; url: string }[]; integration: string };
  indicators: FarmerIndicator[];
  days: {
    date: string;
    tmax: number | null;
    tmin: number | null;
    rain: number | null;
    rain_prob: number | null;
    spray_hours: number;
    disease_hours: number;
    dry: boolean;
  }[];
  water_balance: { rain_7d_mm: number; et0_7d_mm: number; balance_mm: number; soil_moisture_9_27cm: number | null; note: string };
  location: Location;
  warnings: OfficialWarning[];
  notices: string[];
}
export interface CropList {
  validation_status: string;
  crops: { id: string; label: string; season: string; stages: string[] }[];
}
export interface RegionIndia {
  metric: string;
  label: string;
  unit: string;
  hours: number;
  values: Record<string, number | null>;
  window: [string, string];
  aggregation: string;
  meta: Omit<GridMeta, "times">;
}
export interface StateDistrictRow {
  id: string;
  district: string;
  lat: number;
  lon: number;
  terrain: string;
  tmax_7d_max: number | null;
  tmin_7d_min: number | null;
  tmax_anom_7d: number | null;
  rain_7d: number;
  rain_7d_normal: number | null;
  rain_max_day: number;
  gust_max: number;
  rain_30d: number;
  rain_30d_normal: number | null;
  rain_30d_pct: number | null;
  rain_30d_cat: string | null;
  levels: { heat: Level; cold: Level; rain: Level; wind: Level };
  max_level: Level;
  official_warnings: number;
}
export interface RegionState {
  state: string;
  state_slug: string;
  generated_at: string;
  districts: StateDistrictRow[];
  warnings: OfficialWarning[];
  sources: Provenance[];
  method: string;
  notices: string[];
}
export interface GridPoint {
  time: string[];
  source: string;
  model: string;
  issue_time: string | null;
  series: Record<string, (number | null)[]>;
}

export interface EoLayer {
  id: string;
  label: string;
  layer: string;
  tiles: string;
  time: string;
  maxzoom: number;
  opacity: number;
  desc: string;
  legend: string | null;
  cadence: string;
}

export const api = {
  earthobsLayers: () => get<EoLayer[]>("/earthobs/layers"),
  dashboard: (lat: number, lon: number, name?: string, taluka?: string | null, s?: AbortSignal) =>
    get<Dashboard>("/dashboard", { lat, lon, name, taluka }, s),
  farmer: (lat: number, lon: number, crop: string, stage: string, name?: string, taluka?: string | null) =>
    get<FarmerReport>("/farmer", { lat, lon, crop, stage, name, taluka }),
  crops: () => get<CropList>("/farmer/crops"),
  search: (q: string, state?: string, district?: string, s?: AbortSignal) => get<GeoResult[]>("/geo/search", { q, state, district }, s),
  states: () => get<StateItem[]>("/geo/states"),
  districts: (slug: string) => get<DistrictItem[]>(`/geo/states/${slug}/districts`),
  gridMeta: (source = "gfs") => get<GridMeta>("/grid/meta", { source }),
  gridField: (v: string, time?: string, source = "gfs") => get<GridField>("/grid/field", { var: v, time, source }),
  gridWind: (time?: string, source = "gfs") => get<GridWind>("/grid/wind", { time, source }),
  gridPoint: (lat: number, lon: number, source = "gfs") => get<GridPoint>("/grid/point", { lat, lon, source }),
  regionIndia: (metric: string, hours: number) => get<RegionIndia>("/region/india", { metric, hours }),
  regionState: (slug: string) => get<RegionState>(`/region/state/${slug}`),
  warnings: () => get<OfficialWarning[]>("/warnings", { national: "true" }),
  warningPolygon: (url: string) => get<GeoJSON.MultiPolygon>("/warnings/polygon", { url }),
  sources: () => get<{ providers: { id: string; role: string; status: string; store?: string | null }[] }>("/sources"),
};
