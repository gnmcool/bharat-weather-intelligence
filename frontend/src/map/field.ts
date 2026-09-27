import { lut, type Palette } from "./colormaps";

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

export interface FieldGrid {
  nx: number;
  ny: number;
  bbox: [number, number, number, number]; // W,S,E,N of cell centres
  values: (number | null)[]; // row-major, row 0 = south
}

/**
 * Render a lat/lon grid to an image that is correct in Web Mercator.
 * Rows are resampled at Mercator-uniform spacing, columns at longitude spacing,
 * with bilinear interpolation. Returns the image and its four corner coordinates.
 */
export async function renderField(g: FieldGrid, p: Palette, maxDim = 1400, featherDeg = 2.5) {
  const [w, s, e, n] = g.bbox;
  const dx = (e - w) / (g.nx - 1);
  const dy = (n - s) / (g.ny - 1);
  // extend by half a cell so pixels cover the full cell footprint
  const W = w - dx / 2, E = e + dx / 2, S = s - dy / 2, N = n + dy / 2;
  const scale = Math.max(1, Math.min(6, Math.floor(maxDim / Math.max(g.nx, g.ny))));
  const width = g.nx * scale;
  const yN = mercY(N), yS = mercY(S);
  const height = Math.round(((yN - yS) / (((E - W) * Math.PI) / 180)) * width);
  const { table, min, max } = lut(p);
  const span = max - min;
  const img = new ImageData(width, height);
  const d = img.data;
  const vals = g.values;
  for (let r = 0; r < height; r++) {
    const lat = invMercY(yN - ((r + 0.5) / height) * (yN - yS));
    let gy = (lat - s) / dy;
    gy = Math.max(0, Math.min(g.ny - 1.0001, gy));
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    const row0 = y0 * g.nx;
    const row1 = (y0 + 1) * g.nx;
    for (let c = 0; c < width; c++) {
      const lon = W + ((c + 0.5) / width) * (E - W);
      let gx = (lon - w) / dx;
      gx = Math.max(0, Math.min(g.nx - 1.0001, gx));
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const a = vals[row0 + x0], b = vals[row0 + x0 + 1], cc = vals[row1 + x0], dd = vals[row1 + x0 + 1];
      const o = (r * width + c) * 4;
      if (a === null || b === null || cc === null || dd === null) {
        d[o + 3] = 0;
        continue;
      }
      const v = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + cc * (1 - fx) * fy + dd * fx * fy;
      let k = Math.round(((v - min) / span) * 1023);
      k = k < 0 ? 0 : k > 1023 ? 1023 : k;
      // feather the outer edge so the data domain fades into the basemap instead of a hard box
      const edge = Math.min(lon - W, E - lon, lat - S, N - lat);
      const fade = edge >= featherDeg ? 1 : Math.max(0, edge / featherDeg);
      d[o] = table[k * 4];
      d[o + 1] = table[k * 4 + 1];
      d[o + 2] = table[k * 4 + 2];
      d[o + 3] = table[k * 4 + 3] * fade * fade * (3 - 2 * fade);
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
  const url = URL.createObjectURL(blob);
  const coords: [[number, number], [number, number], [number, number], [number, number]] = [
    [W, N], [E, N], [E, S], [W, S],
  ];
  return { url, coords };
}

/** Bilinear sample of a grid at lon/lat (null outside). */
export function sampleGrid(g: FieldGrid, lon: number, lat: number): number | null {
  const [w, s, e, n] = g.bbox;
  if (lon < w || lon > e || lat < s || lat > n) return null;
  const gx = ((lon - w) / (e - w)) * (g.nx - 1);
  const gy = ((lat - s) / (n - s)) * (g.ny - 1);
  const x0 = Math.min(g.nx - 2, Math.floor(gx)), y0 = Math.min(g.ny - 2, Math.floor(gy));
  const fx = gx - x0, fy = gy - y0;
  const a = g.values[y0 * g.nx + x0], b = g.values[y0 * g.nx + x0 + 1];
  const c = g.values[(y0 + 1) * g.nx + x0], d = g.values[(y0 + 1) * g.nx + x0 + 1];
  if (a === null || b === null || c === null || d === null) return null;
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}
