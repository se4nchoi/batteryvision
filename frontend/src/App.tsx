import { useCallback, useEffect, useRef, useState } from "react";
import { api, type InspectionRecord, type Metrics, type Mode, type SimState, type SystemStatus } from "./api/client";
import { Conveyor } from "./components/Conveyor";
import { InspectionPanel } from "./components/InspectionPanel";
import { EventLog, KpiStrip, SessionSummary } from "./components/Analytics";
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

  const runState = error ? "down" : sim?.running ? "running" : "paused";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" className="logo" aria-hidden>
            <rect x="3" y="9" width="23" height="14" rx="3" />
            <rect x="26" y="13" width="3" height="6" rx="1" className="logo-cap" />
            <path d="M8 16h4l2-4 3 8 2-4h3" />
          </svg>
          <span className="brand-name">BatteryVision</span>
        </div>

        <nav className="tabs" aria-label="View">
          <button className={view === "line" ? "on" : ""} onClick={() => setView("line")}>Line</button>
          <button className={view === "models" ? "on" : ""} onClick={() => setView("models")}>Models</button>
        </nav>

        <div className="mode-group">
          <div className="segmented" role="group" aria-label="Inference mode">
            <button className={mode === "demo" ? "on demo" : ""} onClick={() => switchMode("demo")}
              title="Scripted results on synthetic images. No model runs.">Demo</button>
            <button className={mode === "live" ? "on live" : ""} onClick={() => switchMode("live")}
              disabled={!status?.live_available}
              title={status?.live_available ? "Real OpenVINO inference" : `No model loaded. ${status?.live_error ?? ""}`}>
              Live
            </button>
          </div>
          {mode === "live" && (status?.live_models.length ?? 0) > 1 ? (
            <select className="model-select" value={sim?.model ?? ""} onChange={(e) => switchMode("live", e.target.value)}
              aria-label="Live model">
              {status!.live_models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : mode === "live" ? <span className="model-name mono">{sim?.model}</span> : null}
        </div>

        <span className={`run-state ${runState}`} title={`Session ${sim?.session_id ?? "—"}`}>
          <i />{runState === "down" ? "Offline" : runState === "running" ? "Running" : "Paused"}
        </span>

        <div className="controls">
          {sim?.running ? (
            <button className="btn" onClick={() => act(api.pause)} title="Space">❚❚ Pause</button>
          ) : (
            <button className="btn btn-primary" onClick={() => act(api.start)} title="Space">▶ Start</button>
          )}
          <button className="btn" onClick={() => act(api.step)} disabled={sim?.running} title="→ key">Step</button>
          <button className="btn" onClick={() => act(api.reset)} title="R key · starts a new session">Reset</button>
          {mode === "live" && (
            <button className="btn" onClick={() => fileInput.current?.click()} title="Send a test image down the line next">
              Inject image
            </button>
          )}
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/bmp" hidden
            onChange={(e) => onUpload(e.target.files?.[0])} />
        </div>
      </header>

      {(error || notice) && <div className={`banner ${error ? "banner-error" : ""}`}>{error ?? notice}</div>}

      {view === "models" ? (
        <ModelsPage activeModel={sim?.model ?? null} mode={mode}
          onUseModel={(m) => { switchMode("live", m); setView("line"); }} />
      ) : (<>
      <KpiStrip metrics={metrics} />

      <main className="main-grid">
        <section className="panel panel-line">
          <div className="panel-head">
            <h2>Inspection line</h2>
            <span className="policy-chip mono" title="Decision policy: highest defect confidence decides">
              <b className="tone-reject">REJECT</b> ≥ {policy.reject_threshold.toFixed(2)}
              <b className="tone-review">REVIEW</b> ≥ {policy.review_threshold.toFixed(2)}
            </span>
          </div>
          <Conveyor cells={sim?.cells ?? []} running={!!sim?.running} metrics={metrics} message={sim?.message ?? null} />
        </section>

        <section className="panel panel-vision">
          <div className="panel-head">
            <h2>Camera · CAM-01</h2>
            <span className={`chip chip-${mode}`}>{mode === "demo" ? "DEMO DATA" : "MODEL OUTPUT"}</span>
          </div>
          <InspectionPanel result={sim?.current ?? null} rejectThreshold={policy.reject_threshold}
            reviewThreshold={policy.review_threshold} />
        </section>

        <section className="panel panel-log">
          <div className="panel-head"><h2>Inspection log</h2></div>
          <EventLog records={records} />
        </section>

        <section className="panel panel-session">
          <div className="panel-head"><h2>This session</h2></div>
          <SessionSummary metrics={metrics} />
        </section>
      </main>
      </>)}
    </div>
  );
}
