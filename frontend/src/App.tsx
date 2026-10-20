import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { api, type InspectionRecord, type Metrics, type SimState, type SystemStatus } from "./api/client";
import { Conveyor } from "./components/Conveyor";
import { InspectionPanel } from "./components/InspectionPanel";
import { InspectionTable, OutcomeBreakdown, StatCards } from "./components/Analytics";
import { InspectionsPage } from "./components/InspectionsPage";
import { ModelsPage } from "./components/ModelsPage";
import { CameraFeed } from "./components/CameraFeed";
import { IconBatches, IconLine, IconList, IconModels, IconPause, IconPlay, IconReset, IconStep, IconUpload } from "./components/Icons";
import { BatchesPage } from "./components/BatchesPage";

const POLL_MS = 400;
const Line3D = lazy(() => import("./components/Line3D").then((m) => ({ default: m.Line3D })));

function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? "active" : ""} aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
type View = "overview" | "inspections" | "batches" | "models";

const NAV: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <IconLine /> },
  { id: "inspections", label: "Inspections", icon: <IconList /> },
  { id: "batches", label: "Batches", icon: <IconBatches /> },
  { id: "models", label: "Models", icon: <IconModels /> },
];

export default function App() {
  const [sim, setSim] = useState<SimState | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview");
  const [lineView, setLineViewState] = useState<"3d" | "2d">(() => {
    try { return localStorage.getItem("bv.lineView") === "2d" ? "2d" : "3d"; } catch { return "3d"; }
  });
  const setLineView = (v: "3d" | "2d") => {
    setLineViewState(v);
    try { localStorage.setItem("bv.lineView", v); } catch { /* storage unavailable */ }
  };
  const [camView, setCamView] = useState<"result" | "live">("result");
  const lastKey = useRef("");
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshRecords = useCallback(async () => {
    const [m, r] = await Promise.all([api.metrics(), api.inspections(12)]);
    setMetrics(m);
    setRecords(r);
  }, []);

  const applyState = useCallback(
    (s: SimState) => {
      setSim(s);
      // Refresh counters/log only when the line actually changed.
      const key = `${s.session_id}:${s.tick}`;
      if (key !== lastKey.current) {
        lastKey.current = key;
        refreshRecords().catch(() => {});
      }
    },
    [refreshRecords],
  );

  useEffect(() => {
    let alive = true;
    api.status().then(setStatus).catch(() => {});
    const poll = async () => {
      try {
        const s = await api.state();
        if (alive) {
          applyState(s);
          setError(null);
        }
      } catch {
        if (alive) setError("Can't reach the backend on port 8000.");
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [applyState]);

  const act = async (fn: () => Promise<SimState>) => {
    try {
      applyState(await fn());
      setNotice(null);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const setSource = async (value: string) => {
    await act(() => (value === "demo" ? api.setMode("demo")
      : value.startsWith("replay:") ? api.setMode("replay", value.slice(7))
        : api.setMode("live", value)));
    api.status().then(setStatus).catch(() => {});
  };

  const onUpload = async (list: FileList | null) => {
    const files = Array.from(list ?? []).slice(0, 8);
    if (!files.length) return;
    try {
      await api.upload(files, true);
      setNotice(files.length > 1 ? `${files.length} images added as the sides of one cell, next in the queue.` : `${files[0].name} added to the front of the queue.`);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  // Presentation shortcuts on the overview: Space start/pause, → step, R reset.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || view !== "overview") return;
      if (e.code === "Space") {
        e.preventDefault();
        act(sim?.running ? api.pause : api.start);
      } else if (e.code === "ArrowRight") act(api.step);
      else if (e.key === "r" || e.key === "R") act(api.reset);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const mode = sim?.mode ?? status?.mode ?? "demo";
  const policy = status?.policy ?? { reject_threshold: 0.6, review_threshold: 0.3, ignore_labels: [] };
  const runState = error ? "offline" : sim?.running ? "running" : "paused";
  const replaySplit = sim?.model?.match(/^annotations \((\w+)\)$/)?.[1] ?? null;
  const source = replaySplit ? `replay:${replaySplit}` : mode === "demo" ? "demo" : sim?.model ?? "";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">BatteryVision</div>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.id} className={view === n.id ? "active" : ""} aria-current={view === n.id ? "page" : undefined}
              onClick={() => setView(n.id)}>
              {n.icon}{n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <label className="field-label" htmlFor="source">Data source</label>
          <select id="source" className="select" aria-label="Data source" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="demo">Demo (synthetic)</option>
            {Object.entries(status?.replay_splits ?? {}).map(([split, n]) => (
              <option key={split} value={`replay:${split}`}>Dataset {split} ({n} photos)</option>
            ))}
            {(status?.live_models ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {!status?.live_available && <p className="hint">No model in <code>models/</code> yet.</p>}
          <div className={`status status-${runState}`}>
            <span className="status-dot" />
            {runState === "offline" ? "Offline" : runState === "running" ? "Line running" : "Line paused"}
          </div>
        </div>
      </aside>

      <div className="content">
        {view === "overview" && (
          <>
            <header className="page-header">
              <div>
                <h1>Inspection line</h1>
                <p className="page-sub">Session {sim?.session_id ?? "–"} · Policy: reject ≥ {policy.reject_threshold.toFixed(2)}, review ≥ {policy.review_threshold.toFixed(2)}</p>
              </div>
              <div className="actions">
                {mode === "live" && (
                  <button className="btn" onClick={() => fileInput.current?.click()}
                    title="One image, or up to 8 photos of the same cell from different sides"><IconUpload />Add image</button>
                )}
                <button className="btn" onClick={() => act(api.reset)} title="R"><IconReset />Reset</button>
                <button className="btn" onClick={() => act(api.step)} disabled={sim?.running} title="→"><IconStep />Step</button>
                {sim?.running ? (
                  <button className="btn btn-primary" onClick={() => act(api.pause)} title="Space"><IconPause />Pause</button>
                ) : (
                  <button className="btn btn-primary" onClick={() => act(api.start)} title="Space"><IconPlay />Start</button>
                )}
                <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/bmp" multiple hidden
                  onChange={(e) => onUpload(e.target.files)} />
              </div>
            </header>

            {error && <div className="alert alert-error">{error}</div>}
            {!error && notice && <div className="alert">{notice}</div>}
            {!error && mode === "demo" && !replaySplit && (
              <div className="alert alert-warning">Demo mode: synthetic images with scripted results. No model is running.</div>
            )}
            {!error && replaySplit && (
              <div className="alert alert-warning">
                Dataset replay: real {replaySplit}-set photos with their <b>annotated</b> boxes (ground truth, not model
                predictions). Every annotated defect is rejected, so there are no review cases. No model is running.
              </div>
            )}

            {/* 1. Line + camera (largest) → 2. totals → 3. log → 4. session data */}
            <div className="grid hero">
              <section className="card span-2">
                <div className="card-header">
                  <h2>Inspection line</h2>
                  <Segmented value={lineView} onChange={setLineView}
                    options={[{ value: "3d", label: "3D" }, { value: "2d", label: "2D" }]} />
                </div>
                <div className={`card-body conveyor-body ${lineView === "3d" ? "flush" : ""}`}>
                  {lineView === "3d" ? (
                    <Suspense fallback={<div className="placeholder">Loading 3D view…</div>}>
                      <Line3D cells={sim?.cells ?? []} running={!!sim?.running} metrics={metrics} sessionId={sim?.session_id ?? null}
                        tickSeconds={sim?.tick_seconds ?? 1.8} />
                    </Suspense>
                  ) : (
                    <Conveyor cells={sim?.cells ?? []} running={!!sim?.running} metrics={metrics} message={sim?.message ?? null} />
                  )}
                </div>
              </section>
              <section className="card">
                <div className="card-header">
                  <h2>Camera</h2>
                  <Segmented value={camView} onChange={setCamView}
                    options={[{ value: "result", label: "Last result" }, { value: "live", label: "Live camera" }]} />
                </div>
                <div className="card-body cam-body">
                  {camView === "live" ? (
                    <CameraFeed canInspect={mode === "live"} onNotice={setNotice} />
                  ) : (
                    <InspectionPanel result={sim?.current ?? null} rejectThreshold={policy.reject_threshold}
                      reviewThreshold={policy.review_threshold} />
                  )}
                </div>
              </section>
            </div>

            <StatCards metrics={metrics} />

            <div className="grid">
              <section className="card span-2">
                <div className="card-header">
                  <h2>Recent inspections</h2>
                  <button className="link" onClick={() => setView("inspections")}>View all</button>
                </div>
                <InspectionTable records={records} />
              </section>
              <section className="card">
                <div className="card-header"><h2>This session</h2></div>
                <div className="card-body"><OutcomeBreakdown metrics={metrics} /></div>
              </section>
            </div>
          </>
        )}

        {view === "inspections" && <InspectionsPage />}

        {view === "batches" && <BatchesPage onNotice={setNotice} />}

        {view === "models" && (
          <ModelsPage activeModel={mode === "live" ? sim?.model ?? null : null} mode={mode}
            onUseModel={(m) => { setSource(m); setView("overview"); }} />
        )}
      </div>
    </div>
  );
}
