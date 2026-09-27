import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Layers, Menu, ShieldAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AlertsPanel from "./components/AlertsPanel";
import PointCard from "./components/PointCard";
import TopBar, { LanguageSelect, MODES } from "./components/TopBar";
import { api, type GridMeta, type OfficialWarning } from "./lib/api";
import { SEVERITY_COLOR } from "./lib/format";
import { useT } from "./lib/i18n";
import { useApp } from "./lib/store";
import { Legend, LayerPicker, SourceBadge, Timeline } from "./map/MapChrome";
import MapView from "./map/MapView";
import Citizen from "./modes/Citizen";
import Farmer from "./modes/Farmer";
import Government, { useGovChoropleth } from "./modes/Government";

function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [q]);
  return m;
}

export default function App() {
  const { mode, setMode, setPlace, govState, focusDistrict, setGov, gridSource, setGridSource, alertsOpen, setAlertsOpen } = useApp();
  const t = useT();
  const [fly, setFly] = useState<{ lng: number; lat: number; key: number } | null>(null);
  const [meta, setMeta] = useState<GridMeta>();
  const [click, setClick] = useState<{ lng: number; lat: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false); // left panel hidden (desktop) / minimised (mobile)
  const [rightHidden, setRightHidden] = useState(false); // right layer bar hidden
  const [alerts, setAlerts] = useState<OfficialWarning[]>([]);
  const showAlerts = alertsOpen;
  const desktop = useMedia("(min-width: 900px)");
  // mobile: slide-up sheets (☰ menu with modes + panel, and layers)
  const [sheet, setSheet] = useState<"menu" | "layers" | null>(() => (mode !== "map" ? "menu" : null));
  const gov = useGovChoropleth();

  useEffect(() => {
    api.gridMeta(gridSource).then(setMeta).catch((e) => {
      console.warn("grid meta", e);
      if (gridSource === "ai") setGridSource("gfs");
    });
    const id = setInterval(() => api.gridMeta(gridSource).then(setMeta).catch(() => undefined), 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [gridSource, setGridSource]);
  useEffect(() => {
    api.warnings().then(setAlerts).catch(() => undefined);
  }, []);
  useEffect(() => {
    const u = new URL(location.href);
    u.searchParams.set("mode", mode);
    history.replaceState(null, "", u);
    setClick(null);
  }, [mode]);

  // Official alert overlay: districts named in active CAP alerts, coloured by the most severe alert
  const alertDistricts = useMemo(() => {
    if (!showAlerts) return null;
    const rank: Record<string, number> = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1 };
    const best: Record<string, { r: number; c: string }> = {};
    for (const a of alerts) {
      const r = rank[a.severity ?? ""] ?? 0;
      for (const id of a.district_ids ?? []) {
        if (!best[id] || r > best[id].r) best[id] = { r, c: SEVERITY_COLOR[a.severity ?? "Unknown"] ?? SEVERITY_COLOR.Unknown };
      }
    }
    return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.c]));
  }, [showAlerts, alerts]);

  const panelOpen = mode !== "map";
  const leftEdge = desktop && panelOpen && !collapsed ? 468 : 12;
  const padding = useMemo(
    () => ({ left: desktop && panelOpen && !collapsed ? 470 : 10, right: desktop && !rightHidden ? 90 : 10, top: desktop ? 80 : 70, bottom: desktop ? 90 : 70 }),
    [desktop, panelOpen, collapsed, rightHidden],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-950">
      <MapView
        meta={meta}
        choropleth={mode === "government" ? gov.choropleth : null}
        highlightState={govState}
        focusDistrict={mode === "government" ? focusDistrict : null}
        onMapClick={(lng, lat) => {
          if (mode === "farmer") setPlace({ name: `${lat.toFixed(3)}, ${lng.toFixed(3)}`, lat: +lat.toFixed(4), lon: +lng.toFixed(4) });
          else setClick({ lng, lat });
        }}
        onDistrictClick={(id, slug) => { setGov({ govState: slug, focusDistrict: id }); if (!desktop) setSheet("menu"); }}
        alertDistricts={alertDistricts}
        flyTo={fly}
        padding={padding}
      />
      {!desktop ? (
        <MobileChrome meta={meta} alerts={alerts} click={click} setClick={setClick} sheet={sheet} setSheet={setSheet}
          gov={gov} onFly={(lng, lat) => setFly({ lng, lat, key: Date.now() })} mode={mode} setMode={setMode}
          alertsOpen={alertsOpen} setAlertsOpen={setAlertsOpen} />
      ) : (
      <div className="pointer-events-none absolute inset-0 z-20">
        <TopBar />

        {/* Left panel */}
        {panelOpen && desktop && collapsed && (
          <button onClick={() => setCollapsed(false)} title="Show panel"
            className="glass pointer-events-auto absolute left-3 top-[76px] flex items-center gap-1 rounded-xl px-2 py-2 text-[12px] text-slate-200 hover:text-white">
            <ChevronRight size={16} /> {t(`mode.${mode}`)}
          </button>
        )}
        {panelOpen && !(desktop && collapsed) && (
          <aside className={`pointer-events-auto absolute flex flex-col ${desktop ? "bottom-3 left-3 top-[76px] w-[440px]" : `bottom-0 left-0 right-0 ${collapsed ? "h-14" : "h-[58vh]"}`} transition-all`}>
            {desktop && (
              <button onClick={() => setCollapsed(true)} title="Hide panel" aria-label="Hide panel"
                className="glass absolute -right-7 top-3 z-10 grid h-12 w-7 place-items-center rounded-r-xl text-slate-300 hover:text-white">
                <ChevronLeft size={16} />
              </button>
            )}
            <div className={`glass flex min-h-0 flex-1 flex-col ${desktop ? "rounded-2xl" : "rounded-t-2xl"}`}>
              {!desktop && (
                <button onClick={() => setCollapsed(!collapsed)} className="flex h-8 shrink-0 items-center justify-center text-slate-400" aria-label="Toggle panel">
                  {collapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              )}
              {!(collapsed && !desktop) && (
                <div className="panel-scroll min-h-0 flex-1 overflow-y-auto p-3">
                  {mode === "citizen" && <Citizen />}
                  {mode === "farmer" && <Farmer />}
                  {mode === "government" && <Government india={gov.data} err={gov.err} />}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Right map chrome */}
        {(desktop || mode === "map") && (
          <div className="absolute right-3 top-[76px] flex flex-col items-end gap-2">
            {mode !== "government" && (
              rightHidden ? (
                <button onClick={() => setRightHidden(false)} title="Show layers"
                  className="glass pointer-events-auto flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12px] text-slate-200 hover:text-white">
                  <ChevronLeft size={15} /> <Layers size={15} />
                </button>
              ) : (
                <div className="relative">
                  <button onClick={() => setRightHidden(true)} title="Hide layers" aria-label="Hide layers"
                    className="glass pointer-events-auto absolute -left-7 top-3 z-10 grid h-12 w-7 place-items-center rounded-l-xl text-slate-300 hover:text-white">
                    <ChevronRight size={16} />
                  </button>
                  <LayerPicker meta={meta} />
                </div>
              )
            )}
            <button onClick={() => setAlertsOpen(!alertsOpen)} title="Official alerts (IMD, CWC, SDMA)" aria-expanded={alertsOpen}
              className={`glass pointer-events-auto flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12px] ${alertsOpen ? "text-red-200 ring-1 ring-red-400/60" : "text-slate-200"}`}>
              <ShieldAlert size={15} /> <span className="hidden sm:inline">{t("alerts")}</span>
              <span className="rounded bg-red-500/90 px-1.5 text-[10px] font-semibold text-white">{alerts.length}</span>
            </button>
          </div>
        )}
        {alertsOpen && (
          <div className={`absolute top-[76px] z-40 ${desktop && mode !== "government" ? `${rightHidden ? "right-[150px]" : "right-[236px]"}` : desktop ? "right-[150px]" : "left-3 right-3"}`}>
            <AlertsPanel alerts={alerts} onFly={(lng, lat) => setFly({ lng, lat, key: Date.now() })} />
          </div>
        )}

        {mode !== "government" && (desktop || mode === "map") && (
          <>
            {/* legend + source: bottom-right, above the timeline row */}
            <div className="absolute bottom-[60px] right-3 flex flex-wrap items-end justify-end gap-2">
              <SourceBadge meta={meta} />
              <Legend meta={meta} />
            </div>
            {/* timeline: centred in the visible map area */}
            <div className="absolute bottom-3 flex flex-col items-center gap-2" style={{ left: leftEdge, right: 12 }}>
              {click && <PointCard lng={click.lng} lat={click.lat} onClose={() => setClick(null)} />}
              <div className="w-full max-w-[720px]"><Timeline meta={meta} /></div>
            </div>
          </>
        )}
        {!desktop && mode !== "map" && mode !== "government" && click && (
          <div className="absolute left-3 right-3 top-[76px] flex justify-center"><PointCard lng={click.lng} lat={click.lat} onClose={() => setClick(null)} /></div>
        )}
        {meta?.notices?.length && (mode === "map" || meta.grid_source === "ai") ? (
          <div className="glass pointer-events-auto absolute left-3 top-[124px] max-w-sm rounded-xl p-2.5 text-[11.5px] text-amber-200">{meta.notices[0]}</div>
        ) : null}
      </div>
      )}
    </div>
  );
}

type Gov = ReturnType<typeof useGovChoropleth>;

/** Phone / small-tablet layout, modelled on Windy: full-screen map, search on top, a bottom dock
 *  with ☰ + timeline, floating Layers / Alerts buttons, and slide-up sheets. */
function MobileChrome({ meta, alerts, click, setClick, sheet, setSheet, gov, onFly, mode, setMode, alertsOpen, setAlertsOpen }: {
  meta?: GridMeta; alerts: OfficialWarning[]; click: { lng: number; lat: number } | null; setClick: (c: null) => void;
  sheet: "menu" | "layers" | null; setSheet: (s: "menu" | "layers" | null) => void; gov: Gov; onFly: (lng: number, lat: number) => void;
  mode: ReturnType<typeof useApp.getState>["mode"]; setMode: (m: ReturnType<typeof useApp.getState>["mode"]) => void;
  alertsOpen: boolean; setAlertsOpen: (b: boolean) => void;
}) {
  const t = useT();
  const hasTimeline = mode !== "government";
  const close = () => setSheet(null);
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <TopBar mobile />

      {/* floating buttons, right side above the dock (hidden while a point card is open) */}
      {!click && <div className="absolute bottom-[calc(96px+env(safe-area-inset-bottom))] right-2 flex flex-col items-end gap-2">
        <button onClick={() => { setAlertsOpen(!alertsOpen); setSheet(null); }} aria-label={t("alerts")} aria-expanded={alertsOpen}
          className={`glass pointer-events-auto relative grid h-12 w-12 place-items-center rounded-full ${alertsOpen ? "text-red-200 ring-1 ring-red-400/60" : "text-slate-100"}`}>
          <ShieldAlert size={20} />
          <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{alerts.length}</span>
        </button>
        {mode !== "government" && (
          <button onClick={() => setSheet(sheet === "layers" ? null : "layers")} aria-label="Layers"
            className={`glass pointer-events-auto grid h-12 w-12 place-items-center rounded-full ${sheet === "layers" ? "bg-sky-500 text-white" : "text-slate-100"}`}>
            <Layers size={20} />
          </button>
        )}
      </div>}

      {/* legend, bottom-left above the dock */}
      {hasTimeline && !sheet && (
        <div className="absolute bottom-[calc(68px+env(safe-area-inset-bottom))] left-2"><Legend meta={meta} compact /></div>
      )}

      {/* point meteogram card */}
      {click && !sheet && (
        <div className="absolute bottom-[calc(126px+env(safe-area-inset-bottom))] left-2 right-2 flex justify-center">
          <PointCard lng={click.lng} lat={click.lat} onClose={() => setClick(null)} />
        </div>
      )}

      {/* bottom dock: ☰ + timeline */}
      <div className="absolute inset-x-2 bottom-[calc(8px+env(safe-area-inset-bottom))] flex items-center gap-2">
        <button onClick={() => setSheet(sheet === "menu" ? null : "menu")} aria-label="Menu" aria-expanded={sheet === "menu"}
          className={`glass pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-xl ${sheet === "menu" ? "bg-sky-500 text-white" : "text-white"}`}>
          {sheet === "menu" ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div className="min-w-0 flex-1">
          {hasTimeline ? <Timeline meta={meta} compact /> : (
            <div className="glass pointer-events-auto flex h-11 items-center rounded-xl px-3 text-[12.5px] text-slate-300">
              {t("mode.government")} — tap ☰ for the district table
            </div>
          )}
        </div>
      </div>

      {alertsOpen && (
        <div className="pointer-events-auto absolute inset-x-2 top-[68px] z-40 max-h-[calc(100%-150px)] overflow-y-auto">
          <AlertsPanel alerts={alerts} onFly={(lng, lat) => { onFly(lng, lat); setAlertsOpen(false); }} />
        </div>
      )}

      {/* slide-up sheets (sit above the dock so the timeline stays usable) */}
      {sheet && (
        <div className={`glass pointer-events-auto absolute inset-x-0 z-30 flex flex-col rounded-t-2xl bottom-[calc(60px+env(safe-area-inset-bottom))] ${sheet === "menu" ? "top-[68px]" : "max-h-[70%]"}`}>
          <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
            {sheet === "menu" ? (
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[14px] font-bold text-white">Bharat Weather Intelligence</div>
                <div className="text-[11px] text-slate-400">{t("made_by")} <span className="font-semibold text-sky-300">Gaurav Makwana</span></div>
              </div>
            ) : (
              <div className="flex-1 text-[14px] font-semibold text-white">Map layers</div>
            )}
            <button onClick={close} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white"><X size={18} /></button>
          </div>
          <div className="panel-scroll min-h-0 flex-1 overflow-y-auto p-3">
            {sheet === "layers" ? (
              <>
                <LayerPicker meta={meta} sheet />
                <div className="mt-3"><SourceBadge meta={meta} /></div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-1.5">
                  {MODES.map((m) => (
                    <button key={m.id} onClick={() => { setMode(m.id); if (m.id === "map") close(); }} aria-current={mode === m.id}
                      className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11.5px] font-medium ${mode === m.id ? "bg-white text-slate-900" : "bg-white/[0.06] text-slate-200"}`}>
                      <m.icon size={18} /> <span className="truncate">{t(`mode.${m.id}`)}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-2"><LanguageSelect big /></div>
                <div className="mt-3">
                  {mode === "citizen" && <Citizen />}
                  {mode === "farmer" && <Farmer />}
                  {mode === "government" && <Government india={gov.data} err={gov.err} />}
                  {mode === "map" && <p className="px-1 text-[12.5px] text-slate-400">Tap anywhere on the map for a 10-day forecast of that point.</p>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
