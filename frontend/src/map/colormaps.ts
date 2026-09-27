// Perceptually-ordered palettes in the spirit of operational weather maps.
// Stops: [value, r, g, b, a(0..1)]
export type Stop = [number, number, number, number, number];

export interface Palette {
  id: string;
  label: string;
  unit: string;
  stops: Stop[];
  ticks: number[];
  opacity: number;
}

const wind: Stop[] = [
  [0, 55, 75, 150, 1], [8, 60, 115, 185, 1], [16, 55, 160, 170, 1], [24, 80, 185, 110, 1], [32, 150, 200, 70, 1],
  [42, 225, 200, 60, 1], [55, 235, 140, 50, 1], [70, 215, 65, 60, 1], [90, 170, 40, 140, 1], [120, 225, 190, 255, 1],
];

export const PALETTES: Record<string, Palette> = {
  t2m: {
    id: "t2m", label: "Temperature", unit: "°C", opacity: 0.78,
    stops: [
      [-25, 125, 60, 160, 1], [-12, 90, 95, 190, 1], [-2, 70, 150, 220, 1], [6, 75, 195, 205, 1], [13, 105, 205, 135, 1],
      [19, 175, 215, 95, 1], [24, 235, 215, 75, 1], [29, 245, 170, 60, 1], [34, 235, 110, 50, 1], [39, 205, 50, 55, 1],
      [44, 145, 25, 70, 1], [48, 95, 15, 60, 1],
    ],
    ticks: [-10, 0, 10, 20, 25, 30, 35, 40, 45],
  },
  tp: {
    id: "tp", label: "Rain (3 h)", unit: "mm", opacity: 0.9,
    stops: [
      [0, 0, 0, 0, 0], [0.15, 110, 190, 255, 0], [0.4, 110, 190, 255, 0.55], [1, 70, 150, 245, 0.75], [3, 40, 100, 230, 0.85],
      [7, 70, 55, 205, 0.9], [15, 150, 55, 215, 0.92], [30, 225, 60, 185, 0.95], [60, 255, 130, 120, 1], [100, 255, 230, 160, 1],
    ],
    ticks: [0.5, 1, 3, 7, 15, 30, 60],
  },
  wind: { id: "wind", label: "Wind", unit: "km/h", opacity: 0.72, stops: wind, ticks: [0, 10, 20, 30, 40, 55, 70, 90] },
  fg10m: { id: "fg10m", label: "Wind gusts", unit: "km/h", opacity: 0.72, stops: wind, ticks: [0, 10, 20, 30, 40, 55, 70, 90] },
  gust: { id: "gust", label: "Wind gusts", unit: "km/h", opacity: 0.72, stops: wind, ticks: [0, 10, 20, 30, 40, 55, 70, 90] },
  r2m: {
    id: "r2m", label: "Humidity", unit: "%", opacity: 0.72,
    stops: [[0, 165, 105, 45, 1], [25, 200, 160, 85, 1], [45, 175, 195, 120, 1], [60, 100, 180, 150, 1], [75, 60, 150, 200, 1], [90, 45, 90, 205, 1], [100, 35, 50, 165, 1]],
    ticks: [10, 30, 50, 70, 90],
  },
  rh: {
    id: "rh", label: "Humidity", unit: "%", opacity: 0.72,
    stops: [[0, 165, 105, 45, 1], [25, 200, 160, 85, 1], [45, 175, 195, 120, 1], [60, 100, 180, 150, 1], [75, 60, 150, 200, 1], [90, 45, 90, 205, 1], [100, 35, 50, 165, 1]],
    ticks: [10, 30, 50, 70, 90],
  },
  msl: {
    id: "msl", label: "Pressure", unit: "hPa", opacity: 0.7,
    stops: [[985, 110, 35, 150, 1], [996, 65, 95, 205, 1], [1004, 85, 175, 205, 1], [1010, 175, 215, 200, 1], [1014, 235, 230, 195, 1], [1020, 240, 175, 90, 1], [1028, 210, 90, 60, 1], [1040, 140, 30, 60, 1]],
    ticks: [990, 1000, 1005, 1010, 1015, 1020, 1030],
  },
  tcwv: {
    id: "tcwv", label: "Precipitable water", unit: "kg/m²", opacity: 0.72,
    stops: [[0, 150, 110, 70, 1], [15, 200, 185, 120, 1], [30, 125, 200, 165, 1], [45, 65, 150, 215, 1], [60, 85, 70, 205, 1], [75, 190, 70, 200, 1]],
    ticks: [10, 20, 30, 40, 50, 60, 70],
  },
  tcc: {
    id: "tcc", label: "Clouds (forecast)", unit: "%", opacity: 0.95,
    // white clouds over the dark basemap, like a satellite picture of the forecast
    stops: [[0, 255, 255, 255, 0], [15, 235, 240, 250, 0], [35, 225, 232, 245, 0.35], [60, 238, 242, 250, 0.65], [85, 250, 251, 255, 0.85], [100, 255, 255, 255, 0.95]],
    ticks: [20, 40, 60, 80, 100],
  },
};

/** 1024-entry RGBA lookup table spanning the palette domain. */
export function lut(p: Palette): { table: Uint8ClampedArray; min: number; max: number } {
  const min = p.stops[0][0];
  const max = p.stops[p.stops.length - 1][0];
  const N = 1024;
  const table = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    const v = min + ((max - min) * i) / (N - 1);
    let k = 0;
    while (k < p.stops.length - 2 && v > p.stops[k + 1][0]) k++;
    const a = p.stops[k];
    const b = p.stops[k + 1];
    const t = Math.min(1, Math.max(0, (v - a[0]) / (b[0] - a[0] || 1)));
    table[i * 4] = a[1] + (b[1] - a[1]) * t;
    table[i * 4 + 1] = a[2] + (b[2] - a[2]) * t;
    table[i * 4 + 2] = a[3] + (b[3] - a[3]) * t;
    table[i * 4 + 3] = 255 * (a[4] + (b[4] - a[4]) * t);
  }
  return { table, min, max };
}

export function cssGradient(p: Palette): string {
  const min = p.stops[0][0];
  const max = p.stops[p.stops.length - 1][0];
  return `linear-gradient(90deg, ${p.stops
    .map((s) => `rgba(${s[1]},${s[2]},${s[3]},${Math.max(s[4], 0.35)}) ${(((s[0] - min) / (max - min)) * 100).toFixed(1)}%`)
    .join(", ")})`;
}
