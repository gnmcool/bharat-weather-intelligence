import maplibregl, { type GeoJSONSource, type ImageSource, type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { api, type GridField, type GridMeta, type GridWind } from "../lib/api";
import { useApp } from "../lib/store";
import { PALETTES } from "./colormaps";
import { renderField } from "./field";
import { resolveVar } from "./MapChrome";
import { WindParticles } from "./particles";

// OpenFreeMap: free, no key, OpenStreetMap data. Swap for a self-hosted Protomaps/OpenMapTiles style in production.
const STYLE = "https://tiles.openfreemap.org/styles/dark";
const INDIA_BOUNDS: [[number, number], [number, number]] = [[66, 5], [99, 37.5]];

const fieldCache = new Map<string, Promise<GridField>>();
const windCache = new Map<string, Promise<GridWind>>();
// keys include the model run so a new Earth2Studio store is never served from a stale cache
const getField = (v: string, t: string, src: string, run: string) => {
  const k = `${src}|${run}|${v}|${t}`;
  if (!fieldCache.has(k)) fieldCache.set(k, api.gridField(v, t, src).catch((e) => { fieldCache.delete(k); throw e; }));
  return fieldCache.get(k)!;
};
const getWind = (t: string, src: string, run: string) => {
  const k = `${src}|${run}|${t}`;
  if (!windCache.has(k)) windCache.set(k, api.gridWind(t, src).catch((e) => { windCache.delete(k); throw e; }));
  return windCache.get(k)!;
};

export interface Choropleth {
  values: Record<string, number | null>;
  stops: [number, string][];
  filterState?: string;
}

interface Props {
  meta?: GridMeta;
  choropleth?: Choropleth | null;
  highlightState?: string | null;
  focusDistrict?: string | null;
  onMapClick?: (lng: number, lat: number) => void;
  onDistrictClick?: (id: string, stateSlug: string) => void;
  alertDistricts?: Record<string, string> | null; // district id → colour
  flyTo?: { lng: number; lat: number; key: number } | null;
  padding?: { left: number; right: number; top: number; bottom: number };
}

export default function MapView({ meta, choropleth, highlightState, focusDistrict, onMapClick, onDistrictClick, alertDistricts, padding, flyTo }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const partCanvas = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const partRef = useRef<WindParticles | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const { place, layer, particles, timeIndex, mode, sat, satAnim, eo, fires } = useApp();
  const clickRef = useRef<Props["onMapClick"]>(onMapClick);
  const distClickRef = useRef<Props["onDistrictClick"]>(onDistrictClick);
  clickRef.current = onMapClick;
  distClickRef.current = onDistrictClick;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // fitBounds must account for the side panel, otherwise part of the state hides behind it
  const padRef = useRef({ left: 30, right: 30, top: 30, bottom: 30 });
  padRef.current = padding ? { left: padding.left + 20, right: Math.max(30, padding.right - 40), top: padding.top + 10, bottom: 30 } : padRef.current;

  // ---- init ----
  useEffect(() => {
    if (!el.current) return;
    const map = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      bounds: INDIA_BOUNDS,
      fitBoundsOptions: { padding: 30 },
      maxBounds: [[45, -12], [120, 50]],
      minZoom: 3,
      maxZoom: 11,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    mapRef.current = map;

    map.on("load", async () => {
      const style = map.getStyle();
      // Hide OSM-derived boundary lines: India's boundaries are drawn from the platform's own layer.
      for (const l of style.layers ?? []) {
        if (l.id.includes("boundary")) map.setLayoutProperty(l.id, "visibility", "none");
        // weather first: transport network only when zoomed in
        if (/road|highway|railway|tunnel|bridge|aeroway|transit/.test(l.id)) map.setLayerZoomRange(l.id, 8, 24);
        // English/Latin labels (OSM names can be in any local script)
        if (l.type === "symbol" && l.id.startsWith("place")) {
          map.setLayoutProperty(l.id, "text-field", ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]]);
        }
      }
      const firstSymbol = style.layers?.find((l) => l.type === "symbol")?.id;
      map.addSource("field", {
        type: "image",
        url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        coordinates: [[66, 38], [100, 38], [100, 5], [66, 5]],
      });
      map.addLayer({ id: "field", type: "raster", source: "field", paint: { "raster-opacity": 0.78, "raster-resampling": "linear", "raster-fade-duration": 0 } }, firstSymbol);
      // Satellite imagery (EUMETSAT Meteosat IODC via our tile proxy) sits above the model field
      map.addSource("sat", {
        type: "raster",
        tiles: [`${location.origin}/api/v1/sat/tile/ir/{z}/{x}/{y}.png`],
        tileSize: 256, minzoom: 2, maxzoom: 9,
        attribution: "© EUMETSAT (Meteosat IODC)",
      });
      map.addLayer({ id: "sat", type: "raster", source: "sat", layout: { visibility: "none" },
        paint: { "raster-opacity": 0.9, "raster-fade-duration": 200 } }, firstSymbol);
      // NASA GIBS overlay (tiles set when a layer is chosen) and FIRMS fire points
      map.addSource("eo", { type: "raster", tiles: [`${location.origin}/favicon.svg`], tileSize: 256, maxzoom: 9,
        attribution: "NASA EOSDIS GIBS / FIRMS" });
      map.addLayer({ id: "eo", type: "raster", source: "eo", layout: { visibility: "none" }, paint: { "raster-opacity": 0.85 } }, firstSymbol);
      map.addSource("fires", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "fires-glow", type: "circle", source: "fires", layout: { visibility: "none" },
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 9, 10], "circle-color": "#ff6b00", "circle-opacity": 0.25, "circle-blur": 0.8 } });
      map.addLayer({ id: "fires", type: "circle", source: "fires", layout: { visibility: "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 1.8, 9, 4.5],
          "circle-color": ["interpolate", ["linear"], ["get", "frp"], 0, "#ffd166", 10, "#ff7b00", 50, "#ff1f1f"],
          "circle-stroke-color": "#3b0a00", "circle-stroke-width": 0.4,
        } });
      map.addSource("districts", { type: "geojson", data: "/geo/india_districts.geojson", promoteId: "id" });
      map.addSource("states", { type: "geojson", data: "/geo/india_states.geojson" });
      map.addLayer({ id: "district-fill", type: "fill", source: "districts", layout: { visibility: "none" },
        paint: { "fill-color": "#000", "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.95, 0.8] } }, firstSymbol);
      map.addLayer({ id: "district-line", type: "line", source: "districts", minzoom: 4.8,
        paint: { "line-color": "rgba(255,255,255,0.28)", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.3, 8, 1] } }, firstSymbol);
      map.addLayer({ id: "state-line", type: "line", source: "states",
        paint: { "line-color": "rgba(255,255,255,0.7)", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 7, 1.6] } }, firstSymbol);
      map.addLayer({ id: "state-hl", type: "line", source: "states", filter: ["==", ["get", "state_slug"], ""],
        paint: { "line-color": "#fbbf24", "line-width": 2.4 } });
      map.addLayer({ id: "district-hl", type: "line", source: "districts", filter: ["==", ["get", "id"], ""],
        paint: { "line-color": "#ffffff", "line-width": 2.2 } });
      map.addLayer({ id: "warn-fill", type: "fill", source: "districts", filter: ["==", ["get", "id"], ""], paint: { "fill-color": "#ef4444", "fill-opacity": 0.35 } });
      map.addLayer({ id: "warn-line", type: "line", source: "districts", filter: ["==", ["get", "id"], ""], paint: { "line-color": "#ef4444", "line-width": 1.8 } });

      let hovered: string | number | undefined;
      map.on("mousemove", "district-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        if (hovered !== undefined) map.setFeatureState({ source: "districts", id: hovered }, { hover: false });
        hovered = f.id;
        map.setFeatureState({ source: "districts", id: hovered! }, { hover: true });
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "district-fill", () => {
        if (hovered !== undefined) map.setFeatureState({ source: "districts", id: hovered }, { hover: false });
        hovered = undefined;
        map.getCanvas().style.cursor = "";
      });
      map.on("click", (e) => {
        if (modeRef.current === "government") {
          const f = map.queryRenderedFeatures(e.point, { layers: ["district-fill"] })[0];
          if (f) distClickRef.current?.(String(f.properties.id), String(f.properties.state_slug));
          return;
        }
        clickRef.current?.(e.lngLat.lng, e.lngLat.lat);
      });
      if (partCanvas.current) partRef.current = new WindParticles(map, partCanvas.current);
      setReady(true);
    });
    return () => {
      partRef.current?.destroy();
      map.remove();
    };
  }, []);

  // ---- padding for side panels ----
  useEffect(() => {
    if (ready && padding && modeRef.current !== "government") mapRef.current!.easeTo({ padding, duration: 300 });
  }, [ready, padding?.left, padding?.right, padding?.top, padding?.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- location marker ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!markerRef.current) {
      const dot = document.createElement("div");
      dot.className = "bwi-marker";
      markerRef.current = new maplibregl.Marker({ element: dot }).setLngLat([place.lon, place.lat]).addTo(map);
    }
    markerRef.current.setLngLat([place.lon, place.lat]);
    markerRef.current.getElement().style.display = mode === "government" ? "none" : "";
    if (mode === "citizen" || mode === "farmer") map.flyTo({ center: [place.lon, place.lat], zoom: Math.max(map.getZoom(), 6.2), duration: 1200 });
  }, [ready, place.lat, place.lon, mode]);

  // ---- satellite imagery (latest image; refreshed every 10 min) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const on = sat !== "off" && mode !== "government";
    map.setLayoutProperty("sat", "visibility", on ? "visible" : "none");
    if (!on) return;
    const src = map.getSource("sat") as maplibregl.RasterTileSource;
    const set = () => src.setTiles([`${location.origin}/api/v1/sat/tile/${sat}/{z}/{x}/{y}.png?t=${Math.floor(Date.now() / 600000)}`]);
    set();
    // the colour field underneath is dimmed so clouds read clearly
    map.setPaintProperty("sat", "raster-opacity", sat === "ir" ? 0.95 : 0.85);
    const id = setInterval(set, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [ready, sat, mode]);

  // ---- NASA GIBS overlay ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const on = eo !== "none" && mode !== "government";
    if (!on) {
      map.setLayoutProperty("eo", "visibility", "none");
      return;
    }
    let cancelled = false;
    api.earthobsLayers().then((ls) => {
      const l = ls.find((x) => x.id === eo);
      if (cancelled || !l) return;
      // raster sources cannot change maxzoom in place → recreate the source
      map.removeLayer("eo");
      map.removeSource("eo");
      map.addSource("eo", { type: "raster", tiles: [l.tiles], tileSize: 256, maxzoom: l.maxzoom, attribution: "NASA EOSDIS GIBS" });
      const firstSymbol = map.getStyle().layers?.find((x) => x.type === "symbol")?.id;
      const before = map.getLayer("sat") ? "sat" : firstSymbol;
      map.addLayer({ id: "eo", type: "raster", source: "eo", paint: { "raster-opacity": l.opacity } }, before);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, eo, mode]);

  // ---- NASA FIRMS fires ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const on = fires && mode !== "government";
    for (const id of ["fires", "fires-glow"]) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    if (!on) return;
    fetch("/api/v1/earthobs/fires").then((r) => r.json()).then((fc) => (map.getSource("fires") as GeoJSONSource).setData(fc)).catch(() => undefined);
  }, [ready, fires, mode]);

  // ---- satellite animation: last 3 h of frames, preloaded as hidden layers and cycled ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !satAnim || sat === "off" || mode === "government") return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const ids: string[] = [];
    const firstSymbol = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
    fetch(`/api/v1/sat/frames?product=${sat}&hours=3&step=30`).then((r) => r.json()).then((j: { times: string[] }) => {
      if (cancelled) return;
      j.times.forEach((t, k) => {
        const id = `satf-${k}`;
        ids.push(id);
        map.addSource(id, { type: "raster", tileSize: 256, minzoom: 2, maxzoom: 9,
          tiles: [`${location.origin}/api/v1/sat/tile/${sat}/{z}/{x}/{y}.png?time=${encodeURIComponent(t)}`] });
        // opacity 0 (not visibility none) so every frame's tiles load up-front
        map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0, "raster-fade-duration": 0 } }, firstSymbol);
      });
      let k = 0;
      const show = () => {
        ids.forEach((id, i) => map.getLayer(id) && map.setPaintProperty(id, "raster-opacity", i === k ? 0.95 : 0));
        useApp.getState().setSatFrameTime(j.times[k]);
        k = (k + 1) % ids.length;
      };
      // keep the live image on screen until every frame's tiles are in, then start the loop
      const started = Date.now();
      const wait = setInterval(() => {
        if (cancelled) return clearInterval(wait);
        const loaded = ids.every((id) => map.getSource(id) && map.isSourceLoaded(id));
        if (loaded || Date.now() - started > 25000) {
          clearInterval(wait);
          if (cancelled) return;
          map.setLayoutProperty("sat", "visibility", "none");
          show();
          timer = setInterval(show, 700);
        }
      }, 400);
    }).catch(() => useApp.getState().setSatAnim(false));
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      for (const id of ids) {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      }
      useApp.getState().setSatFrameTime(null);
      const st = useApp.getState(); // current values, not the ones captured when the loop started
      if (map.getLayer("sat")) map.setLayoutProperty("sat", "visibility", st.sat !== "off" && st.mode !== "government" ? "visible" : "none");
    };
  }, [ready, satAnim, sat, mode]);

  // ---- scalar field layer ----
  const showField = mode !== "government" && layer !== "none";
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !meta) return;
    map.setLayoutProperty("field", "visibility", showField ? "visible" : "none");
    if (!showField) return;
    const t = meta.times[Math.max(0, Math.min(meta.times.length - 1, timeIndex))];
    const varId = resolveVar(meta, layer);
    if (!meta.variables[varId]) return;
    const pal = PALETTES[varId] ?? PALETTES.t2m;
    let cancelled = false;
    const src = meta.grid_source ?? "gfs";
    const run = meta.issue_time ?? "";
    getField(varId, t, src, run)
      .then((f) => renderField(f, pal))
      .then(({ url, coords }) => {
        if (cancelled) return URL.revokeObjectURL(url);
        (map.getSource("field") as ImageSource).updateImage({ url, coordinates: coords });
        map.setPaintProperty("field", "raster-opacity", pal.opacity);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      })
      .catch((e) => console.warn("field", e));
    // prefetch next step for smooth playback
    const nt = meta.times[timeIndex + 1];
    if (nt) getField(varId, nt, src, run).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, meta, layer, timeIndex, showField]);

  // ---- wind particles ----
  useEffect(() => {
    const p = partRef.current;
    if (!ready || !p || !meta) return;
    const on = particles && mode !== "government";
    p.setEnabled(on);
    if (!on) return;
    const t = meta.times[Math.max(0, Math.min(meta.times.length - 1, timeIndex))];
    let cancelled = false;
    getWind(t, meta.grid_source ?? "gfs", meta.issue_time ?? "")
      .then((w) => {
        if (cancelled) return;
        p.setData({ nx: w.nx, ny: w.ny, bbox: w.bbox, values: w.u }, { nx: w.nx, ny: w.ny, bbox: w.bbox, values: w.v });
      })
      .catch((e) => console.warn("wind", e));
    return () => {
      cancelled = true;
    };
  }, [ready, meta, particles, timeIndex, mode]);

  // ---- choropleth (government) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const on = mode === "government" && !!choropleth;
    map.setLayoutProperty("district-fill", "visibility", on ? "visible" : "none");
    map.setPaintProperty("district-line", "line-color", on ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.28)");
    if (!on || !choropleth) return;
    const entries = Object.entries(choropleth.values).filter(([, v]) => v !== null) as [string, number][];
    const colorExpr: maplibregl.ExpressionSpecification = [
      "interpolate", ["linear"], ["coalesce", ["to-number", ["get", ["get", "id"], ["literal", Object.fromEntries(entries)]]], -9999],
      -9999, "rgba(0,0,0,0)",
      ...choropleth.stops.flatMap(([v, c]) => [v, c]),
    ] as unknown as maplibregl.ExpressionSpecification;
    map.setPaintProperty("district-fill", "fill-color", colorExpr);
  }, [ready, choropleth, mode]);

  // ---- highlight / focus ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter("state-hl", ["==", ["get", "state_slug"], mode === "government" ? highlightState ?? "" : ""]);
    map.setFilter("district-hl", ["==", ["get", "id"], focusDistrict ?? ""]);
    if (mode === "government" && highlightState) {
      const src = map.getSource("states") as GeoJSONSource;
      src.getData().then((fc) => {
        const f = (fc as GeoJSON.FeatureCollection).features.find((x) => x.properties?.state_slug === highlightState);
        const b = f?.properties?.bbox;
        if (b) {
          const bb = typeof b === "string" ? JSON.parse(b) : b;
          map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: padRef.current, duration: 900 });
        }
      });
    } else if (mode === "government") {
      map.fitBounds(INDIA_BOUNDS, { padding: padRef.current, duration: 900 });
    }
  }, [ready, highlightState, focusDistrict, mode]);

  // ---- fly to a point (e.g. an official alert) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !flyTo) return;
    map.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: Math.max(6.5, map.getZoom()), duration: 1200 });
  }, [ready, flyTo]);

  // ---- official alert districts ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const ids = Object.keys(alertDistricts ?? {});
    const filter: maplibregl.FilterSpecification = ["in", ["get", "id"], ["literal", ids]];
    const color = (ids.length
      ? ["match", ["get", "id"], ...ids.flatMap((i) => [i, alertDistricts![i]]), "#ef4444"]
      : "#ef4444") as unknown as maplibregl.ExpressionSpecification;
    for (const l of ["warn-fill", "warn-line"]) map.setFilter(l, filter);
    map.setPaintProperty("warn-fill", "fill-color", color);
    map.setPaintProperty("warn-line", "line-color", color);
  }, [ready, alertDistricts]);

  return (
    <div className="absolute inset-0">
      {/* inline style: maplibre's .maplibregl-map sets position:relative, which would collapse a class-based inset */}
      <div ref={el} style={{ position: "absolute", inset: 0 }} />
      <canvas ref={partCanvas} className="pointer-events-none absolute inset-0" style={{ zIndex: 1 }} />
    </div>
  );
}
