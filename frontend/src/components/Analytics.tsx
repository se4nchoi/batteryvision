import type { InspectionRecord, Metrics, Status } from "../api/client";

const TONE: Record<Status, string> = { PASS: "pass", REJECT: "reject", REVIEW: "review" };
const ORDER: Status[] = ["PASS", "REVIEW", "REJECT"];

const share = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "");

export function KpiStrip({ metrics }: { metrics: Metrics | null }) {
  const m = metrics;
  const total = m?.total ?? 0;
  const tiles = [
    { label: "Inspected", value: total, tone: "", sub: "" },
    { label: "Pass", value: m?.passed ?? 0, tone: "pass", sub: share(m?.passed ?? 0, total) },
    { label: "Review", value: m?.review ?? 0, tone: "review", sub: share(m?.review ?? 0, total) },
    { label: "Reject", value: m?.rejected ?? 0, tone: "reject", sub: share(m?.rejected ?? 0, total) },
    {
      label: "Inference",
      value: m?.avg_inference_ms != null ? `${m.avg_inference_ms.toFixed(1)} ms` : "—",
      tone: "",
      sub: m?.avg_inference_ms != null ? "avg · CPU" : "",
      title: m?.avg_inference_ms != null ? `Mean of ${m.measured_inferences} measured inferences` : "Only measured in LIVE mode",
    },
  ];
  return (
    <section className="kpis">
      {tiles.map((t) => (
        <div key={t.label} className={`kpi ${t.tone ? `kpi-${t.tone}` : ""}`} title={t.title}>
          <div className="kpi-label">{t.label}</div>
          <div className="kpi-row">
            <span className={`kpi-value ${t.tone ? `tone-${t.tone}` : ""}`}>{t.value}</span>
            {t.sub && <span className="kpi-sub">{t.sub}</span>}
          </div>
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
            <th>Decision</th>
            <th>Defect</th>
            <th className="num">Conf.</th>
            <th className="num">Latency</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 && (
            <tr>
              <td colSpan={6} className="muted empty-row">No inspections yet. Press Start.</td>
            </tr>
          )}
          {records.map((r) => (
            <tr key={r.id} title={r.model_name ? `${r.model_name}${r.model_sha ? `@${r.model_sha}` : ""}` : undefined}>
              <td className="mono muted">{new Date(r.ts).toLocaleTimeString("en-GB")}</td>
              <td className="mono">{r.cell_id}</td>
              <td><span className={`pill pill-${TONE[r.status]}`}>{r.status}</span></td>
              <td>{r.primary_defect ?? <span className="muted">—</span>}</td>
              <td className="num mono">{r.confidence?.toFixed(2) ?? "—"}</td>
              <td className="num mono">{r.inference_ms != null ? `${r.inference_ms.toFixed(1)} ms` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SessionSummary({ metrics }: { metrics: Metrics | null }) {
  const history = metrics?.status_history ?? [];
  const counts = { PASS: metrics?.passed ?? 0, REVIEW: metrics?.review ?? 0, REJECT: metrics?.rejected ?? 0 };
  const total = metrics?.total ?? 0;
  const defects = Object.entries(metrics?.defect_distribution ?? {}).sort((a, b) => b[1] - a[1]);
  const maxDefect = Math.max(1, ...defects.map(([, v]) => v));

  return (
    <div className="session-summary">
      <div>
        <div className="sub-head">Outcome mix</div>
        <div className="stack">
          {ORDER.map((s) => counts[s] > 0 && (
            <span key={s} className={`stack-seg seg-${TONE[s]}`} style={{ flexGrow: counts[s] }} title={`${s} ${counts[s]}`} />
          ))}
          {total === 0 && <span className="stack-seg seg-empty" style={{ flexGrow: 1 }} />}
        </div>
        <div className="legend">
          {ORDER.map((s) => (
            <span key={s}><i className={`dot dot-${TONE[s]}`} />{s} <b className="mono">{counts[s]}</b></span>
          ))}
        </div>
      </div>

      <div>
        <div className="sub-head">Last {Math.max(history.length, 0) || 40} decisions</div>
        <div className="history-strip">
          {history.map((s, i) => <span key={i} className={`tick tick-${TONE[s]}`} title={s} />)}
          {Array.from({ length: Math.max(0, 40 - history.length) }).map((_, i) => <span key={`e${i}`} className="tick tick-empty" />)}
        </div>
      </div>

      <div>
        <div className="sub-head">Defects found</div>
        {defects.length === 0 ? <div className="muted">None yet</div> : (
          <div className="bars">
            {defects.map(([label, count]) => (
              <div key={label} className="bar-row">
                <span className="bar-label">{label}</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: `${(count / maxDefect) * 100}%` }} /></span>
                <span className="bar-value mono">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
