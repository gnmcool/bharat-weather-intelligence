import { create } from "zustand";
import type { Location } from "./api";
import type { Lang } from "./i18n";

export type Mode = "citizen" | "farmer" | "government" | "map";
export type SatProduct = "off" | "ir" | "natural" | "convection";
export type LayerId = "t2m" | "tp" | "wind" | "r2m" | "msl" | "tcwv" | "fg10m" | "tcc" | "none";

export interface Place {
  name: string;
  lat: number;
  lon: number;
  taluka?: string | null;
  state?: string | null;
  district?: string | null;
}

const DEFAULT_PLACE: Place = { name: "Ahmedabad", lat: 23.0225, lon: 72.5714, state: "Gujarat", district: "Ahmedabad" };

function initialPlace(): Place {
  try {
    const s = localStorage.getItem("bwi.place");
    if (s) return JSON.parse(s) as Place;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_PLACE;
}

interface State {
  mode: Mode;
  place: Place;
  resolved?: Location;
  layer: LayerId;
  gridSource: "gfs" | "ai";
  lang: Lang;
  setLang: (l: Lang) => void;
  alertsOpen: boolean;
  setAlertsOpen: (b: boolean) => void;
  sat: SatProduct;
  setSat: (s: SatProduct) => void;
  satAnim: boolean;
  setSatAnim: (b: boolean) => void;
  eo: string; // NASA GIBS overlay id or "none"
  setEo: (s: string) => void;
  fires: boolean;
  setFires: (b: boolean) => void;
  satFrameTime: string | null;
  setSatFrameTime: (t: string | null) => void;
  particles: boolean;
  timeIndex: number;
  playing: boolean;
  govMetric: string;
  govHours: number;
  govState?: string; // slug
  focusDistrict?: string;
  setMode: (m: Mode) => void;
  setPlace: (p: Place) => void;
  setResolved: (l: Location) => void;
  setLayer: (l: LayerId) => void;
  setGridSource: (s: "gfs" | "ai") => void;
  setParticles: (b: boolean) => void;
  setTimeIndex: (i: number) => void;
  setPlaying: (b: boolean) => void;
  setGov: (p: Partial<Pick<State, "govMetric" | "govHours" | "govState" | "focusDistrict">>) => void;
}

export const useApp = create<State>((set) => ({
  mode: (new URLSearchParams(location.search).get("mode") as Mode) || "citizen",
  place: initialPlace(),
  layer: "wind",
  gridSource: "gfs",
  lang: (() => {
    try {
      return (localStorage.getItem("bwi.lang") as Lang) || "en";
    } catch {
      return "en";
    }
  })(),
  setLang: (lang) => {
    try {
      localStorage.setItem("bwi.lang", lang);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
  alertsOpen: false,
  setAlertsOpen: (alertsOpen) => set({ alertsOpen }),
  sat: "off",
  setSat: (sat) => set(sat === "off" ? { sat, satAnim: false } : { sat }),
  satAnim: false,
  setSatAnim: (satAnim) => set({ satAnim }),
  eo: "none",
  setEo: (eo) => set({ eo }),
  fires: false,
  setFires: (fires) => set({ fires }),
  satFrameTime: null,
  setSatFrameTime: (satFrameTime) => set({ satFrameTime }),
  particles: true,
  timeIndex: -1,
  playing: false,
  govMetric: "rain",
  govHours: 72,
  setMode: (mode) => set({ mode }),
  setPlace: (place) => {
    try {
      localStorage.setItem("bwi.place", JSON.stringify(place));
    } catch {
      /* ignore */
    }
    set({ place });
  },
  setResolved: (resolved) => set({ resolved }),
  setLayer: (layer) => set({ layer }),
  setGridSource: (gridSource) => set({ gridSource, timeIndex: -1 }),
  setParticles: (particles) => set({ particles }),
  setTimeIndex: (timeIndex) => set({ timeIndex }),
  setPlaying: (playing) => set({ playing }),
  setGov: (p) => set(p),
}));
