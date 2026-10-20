import type { InspectionRecord, Metrics, Status } from "../api/client";

const TONE: Record<Status, string> = { PASS: "pass", REJECT: "reject", REVIEW: "review" };

export function KpiStrip({ metrics, mode }: { metrics: Metrics | null; mode: string }) {
  const m = metrics;
  const rate = m?.observed_reject_rate;
  const tiles = [
    { label: "Inspected", value: m?.total ?? 0, tone: "" },
    { label: "Passed", value: m?.passed ?? 0, tone: "pass" },
    { label: "Rejected", value: m?.rejected ?? 0, tone: "reject" },
    { label: "Review", value: m?.review ?? 0, tone: "review" },
    { label: "Observed reject rate", value: rate == null ? "—" : `${(rate * 100).toFixed(1)}%`, tone: "", note: "this session's sample" },
    {
      label: "Avg inference",
      value: m?.avg_inference_ms != null ? `${m.avg_inference_ms.toFixed(1)} ms` : "—",
      tone: "",
      note: m?.avg_inference_ms != null ? `${m.measured_inferences} measured · CPU` : mode === "demo" ? "not measured in demo" : "no inferences yet",
    },
  ];
  return (
    <section className="kpis">
      {tiles.map((t) => (
        <div key={t.label} className="kpi">
          <div className="kpi-label">{t.label}</div>
          <div className={`kpi-value ${t.tone ? `tone-${t.tone}` : ""}`}>{t.value}</div>
          {t.note && <div className="kpi-note">{t.note}</div>}
        </div>
      ))}
    </section>
  );
}

export function EventLog({ records }: { records: InspectionRecord[] }) {
  return (
    <div className="log">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Cell</th>
            <th>Mode</th>
            <th>Decision</th>
            <th>Primary defect</th>
            <th className="num">Conf.</th>
            <th className="num">Latency</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">No inspections in this session yet.</td>
            </tr>
          )}
          {records.map((r) => (
            <tr key={r.id}>
              <td className="mono">{new Date(r.ts).toLocaleTimeString("en-GB")}</td>
              <td className="mono">{r.cell_id}</td>
              <td><span className={`chip chip-${r.mode}`}>{r.mode.toUpperCase()}</span></td>
              <td><span className={`pill pill-${TONE[r.status]}`}>{r.status}</span></td>
              <td>{r.primary_defect ?? <span className="muted">none</span>}</td>
              <td className="num mono">{r.confidence?.toFixed(2) ?? "—"}</td>
              <td className="num mono">{r.inference_ms != null ? `${r.inference_ms.toFixed(1)} ms` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DefectDistribution({ dist }: { dist: Record<string, number> }) {
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (entries.length === 0) return <div className="muted small">No defects detected yet.</div>;
  return (
    <div className="bars">
      {entries.map(([label, count]) => (
        <div key={label} className="bar-row">
          <span className="bar-label">{label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(count / max) * 100}%` }} />
          </span>
          <span className="bar-value mono">{count}</span>
        </div>
      ))}
      <div className="muted small">Detections at or above review threshold, this session.</div>
    </div>
  );
}

export function StatusHistory({ history }: { history: Status[] }) {
  // Cumulative share of each outcome over the session, plus the last N decisions.
  const n = history.length;
  const counts = { PASS: 0, REJECT: 0, REVIEW: 0 };
  history.forEach((s) => counts[s]++);
  return (
    <div className="history">
      <div className="history-strip">
        {history.map((s, i) => (
          <span key={i} className={`tick tick-${TONE[s]}`} title={s} />
        ))}
        {Array.from({ length: Math.max(0, 40 - n) }).map((_, i) => (
          <span key={`e${i}`} className="tick tick-empty" />
        ))}
      </div>
      <div className="stack">
        {(["PASS", "REVIEW", "REJECT"] as Status[]).map((s) => (
          <span key={s} className={`stack-seg seg-${TONE[s]}`} style={{ flexGrow: counts[s] || 0.0001 }} />
        ))}
      </div>
      <div className="legend">
        {(["PASS", "REVIEW", "REJECT"] as Status[]).map((s) => (
          <span key={s}><i className={`dot dot-${TONE[s]}`} />{s} {n ? Math.round((counts[s] / n) * 100) : 0}%</span>
        ))}
        <span className="muted">last {n} decisions</span>
      </div>
    </div>
  );
}
