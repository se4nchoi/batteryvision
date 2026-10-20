import { useCallback, useEffect, useState } from "react";
import { api, batchApi, type BatchReport, type LotRow, type MachineRow } from "../api/client";
import { IconPlay, IconReset } from "./Icons";

const pct = (v: number | null | undefined, d = 0) => (v == null ? "–" : `${(v * 100).toFixed(d)}%`);

export function BatchesPage({ onNotice }: { onNotice: (msg: string | null) => void }) {
  const [report, setReport] = useState<BatchReport | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => batchApi.report().then(setReport).catch((e) => onNotice((e as Error).message)), [onNotice]);
  useEffect(() => {
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [load]);

  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); onNotice(null); } catch (e) { onNotice((e as Error).message); } finally { setBusy(false); load(); }
  };

  const faultValue = report?.fault ? `${report.fault.step}|${report.fault.machine}` : "";
  const setFault = (v: string) => guard(() => {
    const [step, machine] = v ? v.split("|") : [null, null];
    return batchApi.setFault(step, machine);
  });

  const top = report?.suspects[0];

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Batches</h1>
          <p className="page-sub">Which lots had the most defects, and which upstream machine they have in common.</p>
        </div>
        <div className="actions">
          <select className="select" aria-label="Fault scenario" value={faultValue} disabled={busy || !report?.fault_supported}
            onChange={(e) => setFault(e.target.value)}
            title={report?.fault_supported ? "Inject a simulated machine fault" : "Needs a data source with known labels (Demo or Dataset)"}>
            <option value="">No injected fault</option>
            {Object.entries(report?.process ?? {}).flatMap(([step, ms]) =>
              ms.map((m) => <option key={`${step}|${m}`} value={`${step}|${m}`}>Fault: {step} {m}</option>))}
          </select>
          <button className="btn" disabled={busy} onClick={() => guard(api.reset)}><IconReset />Reset</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => guard(() => batchApi.run(240))}>
            <IconPlay />{busy ? "Running…" : "Run 240 cells"}
          </button>
        </div>
      </header>

      <div className="alert alert-warning">
        {report?.fault
          ? <>Simulated fault: lots that went through <b>{report.fault.step} {report.fault.machine}</b> are fed defective photos
            75% of the time (25% otherwise). Each photo is still judged by the inspection; the analysis below must find
            the machine from those results alone.</>
          : <>Lot genealogy is simulated: every {report?.lot_size ?? 12} cells form a lot, and each lot is assigned a
            winder, tab welder and formation rack. Inject a fault to see whether the analysis can find it.</>}
        {" "}The process steps are real cell-manufacturing stages; machine IDs and lot assignments are not real records.
      </div>

      <div className="stats stats-4">
        <div className="card stat"><div className="stat-label">Cells inspected</div><div className="stat-value">{report?.cells ?? 0}</div>
          <div className="stat-sub">{report?.lots.length ?? 0} lots of {report?.lot_size ?? 12}</div></div>
        <div className="card stat"><div className="stat-label">Defect rate</div><div className="stat-value">{pct(report?.rate)}</div>
          <div className="stat-sub">rejected or sent to review</div></div>
        <div className="card stat"><div className="stat-label">Lots above control limit</div>
          <div className="stat-value">{report?.lots.filter((l) => l.out_of_control).length ?? 0}</div>
          <div className="stat-sub">p-chart, ±3σ</div></div>
        <div className={`card stat ${top ? "stat-alert" : ""}`}><div className="stat-label">Suspect machine</div>
          <div className="stat-value">{top ? `${top.step} ${top.machine}` : "None"}</div>
          <div className="stat-sub">{top ? `${pct(top.rate)} vs ${pct(top.rest_rate)} on the others` : (report?.cells ?? 0) < 100 ? "run more cells to test" : "no machine stands out"}</div></div>
      </div>

      <div className="grid">
        <section className="card">
          <div className="card-header"><h2>Defect rate by lot</h2><span className="muted small">dots in colour went through {top ? `${top.step} ${top.machine}` : "the suspect machine"}</span></div>
          <div className="card-body"><LotChart lots={report?.lots ?? []} rate={report?.rate ?? null} suspect={top ? { step: top.step, machine: top.machine } : null} /></div>
        </section>
        <section className="card">
          <div className="card-header"><h2>Where defects come from</h2></div>
          <div className="card-body"><MachineTable steps={report?.steps ?? {}} overall={report?.rate ?? null} /></div>
        </section>
      </div>

      <section className="card">
        <div className="card-header"><h2>Worst lots</h2><span className="muted small">highest defect rate first</span></div>
        <WorstLots lots={report?.lots ?? []} suspect={top ? { step: top.step, machine: top.machine } : null} />
      </section>
    </>
  );
}

function MachineTable({ steps, overall }: { steps: Record<string, MachineRow[]>; overall: number | null }) {
  const entries = Object.entries(steps);
  if (!entries.length) return <div className="muted">No lots inspected yet. Press Run 240 cells.</div>;
  return (
    <div className="machines">
      {entries.map(([step, ms]) => (
        <div key={step} className="machine-step">
          <div className="section-label">{step}</div>
          {ms.map((m) => (
            <div key={m.machine} className={`machine-row ${m.suspect ? "is-suspect" : ""}`}>
              <span className="machine-name">{m.machine}</span>
              <span className="meter">
                <span className={`meter-fill ${m.suspect ? "fill-reject" : "fill-muted"}`} style={{ width: `${(m.rate ?? 0) * 100}%` }} />
                {overall != null && <span className="meter-mark" style={{ left: `${overall * 100}%` }} title={`line average ${pct(overall)}`} />}
              </span>
              <span className="machine-rate">{pct(m.rate)}</span>
              <span className="machine-note">
                {m.suspect ? <span className="badge badge-reject">Suspect · {m.rest_rate ? `${(m.rate! / m.rest_rate).toFixed(1)}× the others` : "highest"}</span>
                  : m.explained_by ? <span className="badge badge-muted" title="Its lots mostly also went through this machine; the excess disappears without them.">Explained by {m.explained_by}</span>
                    : <span className="muted small">{m.cells} cells</span>}
              </span>
            </div>
          ))}
        </div>
      ))}
      <p className="hint">Bars: defect rate per machine; tick: line average. Suspect = higher than the other machines of the step,
        one-sided test p &lt; 0.01, at least 24 cells. Screening only, not proof of root cause.</p>
    </div>
  );
}

function LotChart({ lots, rate, suspect }: { lots: LotRow[]; rate: number | null; suspect: { step: string; machine: string } | null }) {
  if (!lots.length || rate == null) return <div className="muted">No lots yet.</div>;
  const W = 520, H = 220, L = 40, R = 10, T = 10, B = 26;
  const x = (i: number) => L + (lots.length === 1 ? (W - L - R) / 2 : (i / (lots.length - 1)) * (W - L - R));
  const y = (v: number) => H - B - v * (H - T - B);
  const fullUcl = lots.find((l) => l.complete)?.ucl ?? lots[0].ucl;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart">
        {[0, 0.5, 1].map((v) => (
          <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="tick">{v * 100}%</text></g>
        ))}
        <line x1={L} x2={W - R} y1={y(rate)} y2={y(rate)} className="center-line" />
        {fullUcl != null && <line x1={L} x2={W - R} y1={y(fullUcl)} y2={y(fullUcl)} className="limit-line" />}
        <polyline points={lots.map((l, i) => `${x(i)},${y(l.rate)}`).join(" ")} className="lot-line" />
        {lots.map((l, i) => {
          const hit = suspect && l.genealogy[suspect.step] === suspect.machine;
          return (
            <g key={l.lot_id}>
              <circle cx={x(i)} cy={y(l.rate)} r={l.out_of_control ? 6 : 4.5}
                className={`lot-dot ${hit ? "hit" : ""} ${l.out_of_control ? "ooc" : ""} ${l.complete ? "" : "partial"}`} />
              <title>{`${l.lot_id}: ${pct(l.rate)} (${l.flagged}/${l.cells})\n${Object.entries(l.genealogy).map(([k, v]) => `${k} ${v}`).join(" · ")}`}</title>
            </g>
          );
        })}
        <text x={W - R} y={y(rate) - 4} textAnchor="end" className="tick">average {pct(rate)}</text>
        {fullUcl != null && <text x={W - R} y={y(fullUcl) - 4} textAnchor="end" className="tick">upper limit</text>}
      </svg>
      <p className="hint">With {lots[0]?.cells ?? 12} cells per lot the limits are wide, so single lots rarely cross them; comparing
        machines pools many lots and is more sensitive.</p>
    </>
  );
}

function WorstLots({ lots, suspect }: { lots: LotRow[]; suspect: { step: string; machine: string } | null }) {
  const rows = [...lots].filter((l) => l.complete).sort((a, b) => b.rate - a.rate).slice(0, 8);
  if (!rows.length) return <div className="card-body muted">No complete lots yet.</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Lot</th><th className="num">Defect rate</th><th className="num">Rejected</th><th className="num">Review</th><th>Defects</th><th>Machines</th></tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.lot_id} className={l.out_of_control ? "row-warn" : ""}>
              <td className="mono">{l.lot_id}</td>
              <td className="num">{pct(l.rate)} <span className="muted">({l.flagged}/{l.cells})</span></td>
              <td className="num">{l.rejected}</td>
              <td className="num">{l.review}</td>
              <td className="cap">{Object.entries(l.defects).map(([k, v]) => `${k} ${v}`).join(", ") || "–"}</td>
              <td>
                {Object.entries(l.genealogy).map(([step, m]) => (
                  <span key={step} className={`chip-machine ${suspect && suspect.step === step && suspect.machine === m ? "hit" : ""}`} title={step}>{m}</span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
