import type { Map as MLMap } from "maplibre-gl";
import { sampleGrid, type FieldGrid } from "./field";

/**
 * Animated wind particles (earth.nullschool / Windy style) drawn on a canvas overlay.
 * The u/v grid is projected to a screen-space vector field whenever the map settles;
 * particles advect through it with fading trails. Hidden while the map moves.
 */
export class WindParticles {
  private ctx: CanvasRenderingContext2D;
  private u?: FieldGrid;
  private v?: FieldGrid;
  private field?: Float32Array; // [vx, vy, speed] per cell
  private cols = 0;
  private rows = 0;
  private readonly cell = 5;
  private px: Float32Array = new Float32Array(0);
  private py: Float32Array = new Float32Array(0);
  private age: Uint16Array = new Uint16Array(0);
  private raf = 0;
  private moving = false;
  private enabled = true;
  private dpr = Math.min(2, window.devicePixelRatio || 1);

  constructor(private map: MLMap, private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    map.on("movestart", this.onMoveStart);
    map.on("moveend", this.onMoveEnd);
    map.on("resize", this.onMoveEnd);
    this.resize();
  }

  setData(u: FieldGrid, v: FieldGrid) {
    this.u = u;
    this.v = v;
    this.rebuild();
  }

  setEnabled(b: boolean) {
    this.enabled = b;
    if (!b) {
      cancelAnimationFrame(this.raf);
      this.clear();
    } else this.rebuild();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.map.off("movestart", this.onMoveStart);
    this.map.off("moveend", this.onMoveEnd);
    this.map.off("resize", this.onMoveEnd);
  }

  private onMoveStart = () => {
    this.moving = true;
    cancelAnimationFrame(this.raf);
    this.clear();
  };

  private onMoveEnd = () => {
    this.moving = false;
    this.resize();
    this.rebuild();
  };

  private resize() {
    const c = this.map.getCanvas();
    const w = c.clientWidth, h = c.clientHeight;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private rebuild() {
    cancelAnimationFrame(this.raf);
    if (!this.u || !this.v || !this.enabled || this.moving) return;
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    this.cols = Math.ceil(w / this.cell) + 1;
    this.rows = Math.ceil(h / this.cell) + 1;
    const f = new Float32Array(this.cols * this.rows * 3).fill(NaN);
    const z = this.map.getZoom();
    const k = 0.11 * Math.pow(1.18, Math.max(0, z - 4)); // visual speed factor per m/s per frame
    // Map rotation/pitch are disabled, so lng depends only on x and lat only on y.
    const lngs = new Float64Array(this.cols);
    const lats = new Float64Array(this.rows);
    for (let c = 0; c < this.cols; c++) lngs[c] = this.map.unproject([c * this.cell, 0]).lng;
    for (let r = 0; r < this.rows; r++) lats[r] = this.map.unproject([0, r * this.cell]).lat;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const uu = sampleGrid(this.u, lngs[c], lats[r]);
        const vv = sampleGrid(this.v, lngs[c], lats[r]);
        if (uu === null || vv === null) continue;
        const o = (r * this.cols + c) * 3;
        f[o] = uu * k;
        f[o + 1] = -vv * k;
        f[o + 2] = Math.hypot(uu, vv);
      }
    }
    this.field = f;
    const n = Math.min(7000, Math.round((w * h) / 220));
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.age = new Uint16Array(n);
    for (let i = 0; i < n; i++) this.spawn(i, true);
    this.clear();
    this.loop();
  }

  private spawn(i: number, randomAge = false) {
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    this.px[i] = Math.random() * w;
    this.py[i] = Math.random() * h;
    this.age[i] = randomAge ? Math.floor(Math.random() * 80) : 0;
  }

  private at(x: number, y: number): [number, number, number] | null {
    const c = Math.round(x / this.cell), r = Math.round(y / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows || !this.field) return null;
    const o = (r * this.cols + c) * 3;
    const vx = this.field[o];
    if (Number.isNaN(vx)) return null;
    return [vx, this.field[o + 1], this.field[o + 2]];
  }

  private loop = () => {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    // fade previous trails
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = "rgba(0,0,0,0.9)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    const buckets: number[][] = [[], [], [], []];
    for (let i = 0; i < this.px.length; i++) {
      const x = this.px[i], y = this.py[i];
      const s = this.at(x, y);
      if (!s || this.age[i] > 90) {
        this.spawn(i);
        continue;
      }
      const nx = x + s[0], ny = y + s[1];
      const b = s[2] < 3 ? 0 : s[2] < 7 ? 1 : s[2] < 12 ? 2 : 3;
      buckets[b].push(x, y, nx, ny);
      this.px[i] = nx;
      this.py[i] = ny;
      this.age[i]++;
    }
    const alphas = [0.35, 0.55, 0.75, 0.95];
    ctx.lineWidth = 1.15;
    ctx.lineCap = "round";
    for (let b = 0; b < 4; b++) {
      const arr = buckets[b];
      if (!arr.length) continue;
      ctx.strokeStyle = `rgba(255,255,255,${alphas[b]})`;
      ctx.beginPath();
      for (let j = 0; j < arr.length; j += 4) {
        ctx.moveTo(arr[j], arr[j + 1]);
        ctx.lineTo(arr[j + 2], arr[j + 3]);
      }
      ctx.stroke();
    }
    this.raf = requestAnimationFrame(this.loop);
  };
}
