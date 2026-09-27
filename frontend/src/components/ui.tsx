import { ChevronDown, ExternalLink, FlaskConical, Info, ShieldAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { OfficialWarning, Provenance, RiskItem } from "../lib/api";
import { fmtDateTime, LEVEL, n, SEVERITY_COLOR } from "../lib/format";
import { useT } from "../lib/i18n";

export function Section({ title, right, children, className = "" }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-300">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function LevelPill({ level, small }: { level: 0 | 1 | 2 | 3; small?: boolean }) {
  const L = LEVEL[level];
  const t = useT();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full ${L.bg} ${L.text} ring-1 ${L.ring} ${small ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]"} font-semibold`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: L.dot }} />
      {t(`l${level}`)}
    </span>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "amber" | "sky" | "green" | "red" }) {
  const t = {
    slate: "bg-slate-500/15 text-slate-300 ring-slate-400/20",
    amber: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
    sky: "bg-sky-400/10 text-sky-300 ring-sky-400/30",
    green: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30",
    red: "bg-red-500/10 text-red-300 ring-red-400/30",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${t}`}>{children}</span>;
}

const CONF_TONE = { high: "green", medium: "amber", low: "red", "n/a": "slate" } as const;

export function RiskTile({ r }: { r: RiskItem }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const L = LEVEL[r.level];
  return (
    <div className={`rounded-xl ring-1 ${r.level ? L.ring : "ring-white/5"} ${r.level ? L.bg : "bg-white/[0.02]"} transition`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: L.dot, boxShadow: r.level ? `0 0 10px ${L.dot}` : undefined }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-white">{t(`r.${r.id}`)}</span>
            <span className={`text-[11px] font-medium ${L.text}`}>{t(`l${r.level}`)}</span>
            {r.official && <Badge tone="red">Official</Badge>}
            {r.experimental && <FlaskConical size={12} className="text-slate-500" aria-label="Experimental indicator" />}
          </div>
          <div className="truncate text-[12px] text-slate-300">{r.headline}</div>
        </div>
        <ChevronDown size={16} className={`mt-1 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-white/5 px-3 pb-3 pt-2 text-[12px] leading-relaxed text-slate-300">
          <p>{r.explanation}</p>
          {r.period_start && (
            <p className="text-slate-400">
              Period: {fmtDateTime(r.period_start)} → {fmtDateTime(r.period_end)}
              {r.peak_value !== null && r.peak_value !== undefined && ` · peak ${n(r.peak_value, 1)} ${r.unit ?? ""}`}
            </p>
          )}
          <div className="rounded-lg bg-black/25 p-2 text-[11px] text-slate-400">
            <div><span className="text-slate-300">Rule:</span> {r.criterion} {r.reference && <span className="text-slate-500">[{r.reference}]</span>}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-slate-300">Confidence:</span>
              <Badge tone={CONF_TONE[r.confidence.level]}>{r.confidence.level}</Badge>
              <span>{r.confidence.basis}</span>
            </div>
            <div className="mt-1"><span className="text-slate-300">Data:</span> {r.sources.join(" · ")}</div>
            {!r.official && <div className="mt-1 italic text-slate-500">System-derived indicator — not an official IMD warning.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function WarningCard({ w }: { w: OfficialWarning }) {
  const [open, setOpen] = useState(false);
  const c = SEVERITY_COLOR[w.severity ?? "Unknown"] ?? SEVERITY_COLOR.Unknown;
  return (
    <div className="rounded-xl bg-black/20 ring-1 ring-white/5" style={{ borderLeft: `3px solid ${c}` }}>
      <button onClick={() => setOpen(!open)} className="w-full px-3 py-2 text-left">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <Badge tone="red">
            <ShieldAlert size={11} /> Official
          </Badge>
          <span className="font-semibold" style={{ color: c }}>{w.severity ?? "—"}</span>
          <span className="text-slate-400">{w.event}</span>
          <span className="text-slate-500">· {w.issuer}</span>
          {w.match !== "national" && <span className="text-slate-500">· {w.match} match</span>}
        </div>
        <div className="mt-0.5 text-[12.5px] leading-snug text-slate-100">{w.headline}</div>
      </button>
      {open && (
        <div className="space-y-1 border-t border-white/5 px-3 pb-2.5 pt-2 text-[12px] text-slate-300">
          {w.description && w.description !== w.headline && <p>{w.description}</p>}
          <p className="text-slate-400">
            Area: {w.area ?? "—"} · Valid {fmtDateTime(w.effective)} → {fmtDateTime(w.expires)} · Urgency {w.urgency ?? "—"} · Certainty {w.certainty ?? "—"}
          </p>
          {w.link && (
            <a href={w.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-300 hover:underline">
              Original CAP message <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function Sources({ sources, notices }: { sources: Provenance[]; notices?: string[] }) {
  return (
    <div className="space-y-2 text-[11.5px] text-slate-400">
      {notices?.map((x) => (
        <div key={x} className="flex gap-2 rounded-lg bg-amber-400/10 p-2 text-amber-200">
          <Info size={14} className="mt-0.5 shrink-0" /> {x}
        </div>
      ))}
      {sources.map((s, i) => (
        <div key={i} className="rounded-lg bg-black/20 p-2">
          <div className="text-slate-200">
            <b>{s.source}</b> {s.model && <span className="text-slate-400">· {s.model}</span>}
          </div>
          {s.issue_time && <div>Model run: {fmtDateTime(s.issue_time)} IST</div>}
          {s.notes && <div>{s.notes}</div>}
          {s.licence && <div className="text-slate-500">Licence: {s.licence}</div>}
        </div>
      ))}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 p-6 text-sm text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
      {label}…
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="card m-3 p-4 text-sm text-red-200">
      <div className="font-semibold">Couldn’t load data</div>
      <div className="mt-1 text-red-300/80">{error}</div>
      <div className="mt-2 text-xs text-slate-400">Is the API running on port 8000? (see README → Run)</div>
      {retry && (
        <button onClick={retry} className="mt-3 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20">
          Retry
        </button>
      )}
    </div>
  );
}
