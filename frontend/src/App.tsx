import { useCallback, useEffect, useRef, useState } from "react";
import { api, type InspectionRecord, type Metrics, type Mode, type SimState, type SystemStatus } from "./api/client";
import { Conveyor } from "./components/Conveyor";
import { InspectionPanel } from "./components/InspectionPanel";
import { DefectDistribution, EventLog, KpiStrip, StatusHistory } from "./components/Analytics";
import { ModelsPage } from "./components/ModelsPage";

const POLL_MS = 400;

export default function App() {
  const [sim, setSim] = useState<SimState | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lastKey = useRef("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"line" | "models">("line");

  const refreshRecords = useCallback(async () => {
    const [m, r] = await Promise.all([api.metrics(), api.inspections(30)]);
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
        if (alive) setError("Backend unreachable on :8000. Is the API running?");
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

  const switchMode = async (mode: Mode, model?: string) => {
    await act(() => api.setMode(mode, model));
    api.status().then(setStatus).catch(() => {});
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      await api.upload(file, true);
      setNotice(`${file.name} queued: it is next into the inspection station.`);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  // Keyboard shortcuts for the live presentation: Space start/pause, → step, R reset.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || view !== "line") return;
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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" className="logo" aria-hidden>
            <rect x="3" y="9" width="23" height="14" rx="3" />
            <rect x="26" y="13" width="3" height="6" rx="1" className="logo-cap" />
            <path d="M8 16h4l2-4 3 8 2-4h3" />
          </svg>
          <div>
            <div className="brand-name">BatteryVision</div>
            <div className="brand-sub">Cell surface defect inspection · virtual line</div>
          </div>
        </div>

        <nav className="tabs" aria-label="View">
          <button className={view === "line" ? "on" : ""} onClick={() => setView("line")}>Line</button>
          <button className={view === "models" ? "on" : ""} onClick={() => setView("models")}>Models</button>
        </nav>

        <div className="status-group">
          <span className={`mode-badge mode-${mode}`}>
            {mode === "demo" ? "DEMO · SIMULATED PREDICTIONS" : `LIVE · ${sim?.model ?? "OPENVINO"}`}
          </span>
          <span className={`run-state ${error ? "down" : sim?.running ? "running" : "paused"}`}>
            <i />
            {error ? "OFFLINE" : sim?.running ? "RUNNING" : "PAUSED"}
          </span>
          <span className="session mono">session {sim?.session_id ?? "—"}</span>
        </div>

        <div className="controls">
          <div className="segmented" role="group" aria-label="Inference mode">
            <button className={mode === "demo" ? "on" : ""} onClick={() => switchMode("demo")}>Demo</button>
            <button
              className={mode === "live" ? "on" : ""}
              onClick={() => switchMode("live")}
              disabled={!status?.live_available}
              title={status?.live_available ? "Use the exported Geti model" : `No model loaded: ${status?.live_error ?? ""}`}
            >
              Live
            </button>
          </div>
          {(status?.live_models.length ?? 0) > 1 && (
            <select className="model-select" value={mode === "live" ? sim?.model ?? "" : ""}
              onChange={(e) => switchMode("live", e.target.value)} aria-label="Live model">
              <option value="" disabled>model…</option>
              {status!.live_models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {sim?.running ? (
            <button className="btn" onClick={() => act(api.pause)}>❚❚ Pause</button>
          ) : (
            <button className="btn btn-primary" onClick={() => act(api.start)}>▶ Start</button>
          )}
          <button className="btn" onClick={() => act(api.step)} disabled={sim?.running}>Step ›</button>
          <button className="btn" onClick={() => act(api.reset)}>↺ Reset</button>
          <button className="btn" onClick={() => fileInput.current?.click()} disabled={mode !== "live"}
            title={mode === "live" ? "Send a held-out image down the line" : "Upload inference requires LIVE mode"}>
            ⇪ Inject image
          </button>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/bmp" hidden
            onChange={(e) => onUpload(e.target.files?.[0])} />
        </div>
      </header>

      {(error || notice) && <div className={`banner ${error ? "banner-error" : ""}`}>{error ?? notice}</div>}

      {view === "models" ? (
        <ModelsPage activeModel={sim?.model ?? null} mode={mode}
          onUseModel={(m) => { switchMode("live", m); setView("line"); }} />
      ) : (<>
      <KpiStrip metrics={metrics} mode={mode} />

      <main className="main-grid">
        <section className="panel panel-line">
          <div className="panel-head">
            <h2>Virtual inspection line</h2>
            <span className="muted small">Simulated conveyor · states owned by backend · no physical equipment controlled</span>
          </div>
          <Conveyor cells={sim?.cells ?? []} running={!!sim?.running} metrics={metrics} message={sim?.message ?? null} />
          <div className="line-foot">
            <span className="muted small">
              Policy: REJECT ≥ {policy.reject_threshold.toFixed(2)} · REVIEW ≥ {policy.review_threshold.toFixed(2)} · else PASS
            </span>
            <span className="muted small kbd-hint"><kbd>Space</kbd> start/pause <kbd>→</kbd> step <kbd>R</kbd> reset</span>
          </div>
        </section>

        <section className="panel panel-vision">
          <div className="panel-head">
            <h2>Vision inspection · CAM-01</h2>
            <span className={`chip chip-${mode}`}>{mode === "demo" ? "DEMO DATA" : "MODEL OUTPUT"}</span>
          </div>
          <InspectionPanel result={sim?.current ?? null} rejectThreshold={policy.reject_threshold}
            reviewThreshold={policy.review_threshold} />
        </section>

        <section className="panel panel-log">
          <div className="panel-head"><h2>Inspection log</h2><span className="muted small">SQLite · current session</span></div>
          <EventLog records={records} />
        </section>

        <section className="panel panel-dist">
          <div className="panel-head"><h2>Defect distribution</h2></div>
          <DefectDistribution dist={metrics?.defect_distribution ?? {}} />
        </section>

        <section className="panel panel-hist">
          <div className="panel-head"><h2>Decision history</h2></div>
          <StatusHistory history={metrics?.status_history ?? []} />
        </section>
      </main>
      </>)}
    </div>
  );
}
