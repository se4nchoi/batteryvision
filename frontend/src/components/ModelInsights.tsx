import { useState } from "react";
import type { BenchModel } from "../api/client";

const pct = (v: number | null | undefined, d = 0) => (v == null || Number.isNaN(v) ? "–" : `${(v * 100).toFixed(d)}%`);
const int = (v: number) => Math.round(v).toLocaleString("en-US");
const RATES = [0.001, 0.005, 0.01, 0.02, 0.05];
const CELLS = 10_000;

/*
 * Projects the measured test-set rates onto a production line where defects are rare.
 * Pure arithmetic: assumes the per-cell catch rate and good-cell flag rate stay as measured.
 */
export function LineProjection({ m }: { m: BenchModel }) {
  const [rate, setRate] = useState(0.005);
  const mx = m.image_level?.matrix;
  const nDef = mx ? mx.defective.PASS + mx.defective.REVIEW + mx.defective.REJECT : 0;
  const nClean = mx ? mx.no_defect_annotated.PASS + mx.no_defect_annotated.REVIEW + mx.no_defect_annotated.REJECT : 0;
  if (!mx || !nDef || !nClean) {
    return <div className="muted">Needs both defective and defect-free test images.</div>;
  }
  const catchRate = (mx.defective.REVIEW + mx.defective.REJECT) / nDef; // stopped = reviewed or rejected
  const goodFlagRate = (mx.no_defect_annotated.REVIEW + mx.no_defect_annotated.REJECT) / nClean;
  const defective = CELLS * rate;
  const good = CELLS - defective;
  const stopped = defective * catchRate;
  const missed = defective - stopped;
  const goodFlagged = good * goodFlagRate;
  const purity = stopped + goodFlagged > 0 ? stopped / (stopped + goodFlagged) : null;
  const testShare = nDef / (nDef + nClean);

  return (
    <div className="projection">
      <div className="projection-controls">
        <span className="muted">Defect rate on the line</span>
        <div className="segmented" role="group" aria-label="Defect rate">
          {RATES.map((r) => (
            <button key={r} className={r === rate ? "active" : ""} aria-pressed={r === rate} onClick={() => setRate(r)}>
              {r * 100}%
            </button>
          ))}
        </div>
      </div>
      <div className="projection-grid">
        <div><span className="proj-label">Defective cells</span><span className="proj-value">{int(defective)}</span></div>
        <div><span className="proj-label">Stopped</span><span className="proj-value tone-pass-text">{int(stopped)}</span></div>
        <div><span className="proj-label">Missed</span><span className="proj-value tone-reject">{int(missed)}</span></div>
        <div><span className="proj-label">Good cells flagged</span><span className="proj-value tone-review-text">{int(goodFlagged)}</span></div>
      </div>
      <div className="purity">
        <div className="purity-text">
          Of every 100 cells the line stops, <b>{purity == null ? "–" : Math.round(purity * 100)}</b> are actually defective.
        </div>
        <div className="meter"><span className="meter-fill fill-accent" style={{ width: purity == null ? 0 : `${purity * 100}%` }} /></div>
      </div>
      <p className="hint">
        Per {int(CELLS)} cells, using the measured catch rate ({pct(catchRate)}) and good-cell flag rate ({pct(goodFlagRate)}).
        The test set is {pct(testShare)} defective, so its raw precision overstates how clean the reject bin would be.
        Projection only: assumes those rates hold on the line.
      </p>
    </div>
  );
}

export function BackgroundBreakdown({ m }: { m: BenchModel }) {
  const groups = Object.entries(m.by_background ?? {});
  if (!groups.length) return <div className="muted">Re-run benchmark.py to get this breakdown.</div>;
  const worst = groups.reduce((a, b) => ((b[1].defect_catch_rate ?? 1) < (a[1].defect_catch_rate ?? 1) ? b : a))[0];
  return (
    <>
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr><th>Background</th><th className="num">Images</th><th className="num">Defects caught</th><th className="num">Good flagged</th><th className="num">Box recall</th></tr>
          </thead>
          <tbody>
            {groups.map(([g, v]) => (
              <tr key={g} className={g === worst && groups.length > 1 ? "row-warn" : ""}>
                <td className="cap">{g}</td>
                <td className="num">{v.n_images}</td>
                <td className="num">{pct(v.defect_catch_rate)}</td>
                <td className="num">{v.n_clean ? pct(v.false_reject_rate) : "–"}</td>
                <td className="num">{pct(v.box_recall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint card-pad">
        Groups are estimated from the image border colour. A large gap between groups suggests the model depends on the
        background. A factory belt is a background it has never seen, so test one with the live camera.
      </p>
    </>
  );
}
