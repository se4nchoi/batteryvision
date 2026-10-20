import type { InspectionRecord, Metrics, Status } from "../api/client";

export const STATUS_LABEL: Record<Status, string> = { PASS: "Pass", REVIEW: "Review", REJECT: "Reject" };
const TONE: Record<Status, string> = { PASS: "pass", REVIEW: "review", REJECT: "reject" };
const ORDER: Status[] = ["PASS", "REVIEW", "REJECT"];

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

const pct = (n: number, total: number) => (total ? `${((n / total) * 100).toFixed(0)}% of total` : "–");

export function StatCards({ metrics: m }: { metrics: Metrics | null }) {
  const total = m?.total ?? 0;
  const cards = [
    { label: "Inspected", value: String(total), sub: "cells this session" },
    { label: "Passed", value: String(m?.passed ?? 0), sub: pct(m?.passed ?? 0, total), tone: "pass" },
    { label: "Sent to review", value: String(m?.review ?? 0), sub: pct(m?.review ?? 0, total), tone: "review" },
    { label: "Rejected", value: String(m?.rejected ?? 0), sub: pct(m?.rejected ?? 0, total), tone: "reject" },
    {
      label: "Avg. inference time",
      value: m?.avg_inference_ms != null ? `${m.avg_inference_ms.toFixed(1)} ms` : "–",
      sub: m?.avg_inference_ms != null ? `${m.measured_inferences} runs on CPU` : "measured in live mode only",
    },
  ];
  return (
    <div className="stats">
      {cards.map((c) => (
        <div key={c.label} className="card stat">
          <div className="stat-label">{c.tone && <span className={`dot dot-${c.tone}`} />}{c.label}</div>
          <div className="stat-value">{c.value}</div>
          <div className="stat-sub">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

export function InspectionTable({ records, showModel = false }: { records: InspectionRecord[]; showModel?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Cell</th>
            <th>Result</th>
            <th>Defect</th>
            <th className="num">Confidence</th>
            <th className="num">Inference</th>
            {showModel && <th>Model</th>}
          </tr>
        </thead>
        <tbody>
          {records.length === 0 && (
            <tr><td colSpan={showModel ? 7 : 6} className="empty">No inspections yet. Press Start.</td></tr>
          )}
          {records.map((r) => (
            <tr key={r.id}>
              <td className="muted">{new Date(r.ts).toLocaleTimeString("en-GB")}</td>
              <td className="mono">{r.cell_id}</td>
              <td><StatusBadge status={r.status} /></td>
              <td className="cap">{r.primary_defect ?? <span className="muted">None</span>}</td>
              <td className="num">{r.model_name?.startsWith("annotations") && r.confidence != null ? "Annotated"
                : r.confidence != null ? `${(r.confidence * 100).toFixed(0)}%` : "–"}</td>
              <td className="num">{r.inference_ms != null ? `${r.inference_ms.toFixed(1)} ms` : "–"}</td>
              {showModel && (
                <td className="muted">{r.model_name}{r.model_sha ? <span className="mono"> · {r.model_sha.slice(0, 8)}</span> : ""}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OutcomeBreakdown({ metrics }: { metrics: Metrics | null }) {
  const total = metrics?.total ?? 0;
  const counts: Record<Status, number> = { PASS: metrics?.passed ?? 0, REVIEW: metrics?.review ?? 0, REJECT: metrics?.rejected ?? 0 };
  const defects = Object.entries(metrics?.defect_distribution ?? {}).sort((a, b) => b[1] - a[1]);
  const maxDefect = Math.max(1, ...defects.map(([, v]) => v));
  const history = metrics?.status_history ?? [];

  return (
    <div className="breakdown">
      <div>
        <div className="section-label">Result share</div>
        {ORDER.map((s) => (
          <div key={s} className="meter-row">
            <span className="meter-name"><span className={`dot dot-${TONE[s]}`} />{STATUS_LABEL[s]}</span>
            <span className="meter"><span className={`meter-fill fill-${TONE[s]}`} style={{ width: total ? `${(counts[s] / total) * 100}%` : 0 }} /></span>
            <span className="meter-value">{total ? `${Math.round((counts[s] / total) * 100)}%` : "–"}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="section-label">Defects found</div>
        {defects.length === 0 ? <div className="muted">None yet</div> : defects.map(([label, n]) => (
          <div key={label} className="meter-row">
            <span className="meter-name cap">{label}</span>
            <span className="meter"><span className="meter-fill fill-accent" style={{ width: `${(n / maxDefect) * 100}%` }} /></span>
            <span className="meter-value">{n}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="section-label">Last {history.length || 0} results</div>
        <div className="timeline">
          {history.map((s, i) => <span key={i} className={`tl tl-${TONE[s]}`} title={STATUS_LABEL[s]} />)}
          {Array.from({ length: Math.max(0, 40 - history.length) }).map((_, i) => <span key={`e${i}`} className="tl" />)}
        </div>
      </div>
    </div>
  );
}
