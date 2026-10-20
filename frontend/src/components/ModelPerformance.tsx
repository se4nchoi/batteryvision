import { useState } from "react";
import type { BenchModel } from "../api/client";

const pct = (v: number | null | undefined, d = 1) => (v == null || Number.isNaN(v) ? "–" : `${(v * 100).toFixed(d)}%`);
const num = (v: number | null | undefined, d = 3) => (v == null || Number.isNaN(v) ? "–" : v.toFixed(d));

type Point = "review" | "reject";

/** Full model evaluation on the held-out test set, at either operating point of the policy. */
export function ModelPerformance({ m, review, reject }: { m: BenchModel; review: number; reject: number }) {
  const [point, setPoint] = useState<Point>("review");
  const op = m.operating_points?.[point];
  const conf = m.confusion?.[point];
  const cell = m.cell_binary?.[point === "review" ? "flagged" : "rejected"];
  const classes = Object.keys(m.coco?.per_class ?? {});

  if (!op || !conf || !cell) {
    return (
      <section className="card">
        <div className="card-header"><h2>Model performance</h2></div>
        <div className="card-body muted">Re-run <code>scripts/benchmark.py</code> to get per-class F1, the confusion matrix and cell-level accuracy.</div>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2>Model performance · held-out test set</h2>
        <div className="segmented" role="group" aria-label="Operating point">
          <button className={point === "review" ? "active" : ""} aria-pressed={point === "review"} onClick={() => setPoint("review")}>
            Flag at ≥ {review}
          </button>
          <button className={point === "reject" ? "active" : ""} aria-pressed={point === "reject"} onClick={() => setPoint("reject")}>
            Auto-reject at ≥ {reject}
          </button>
        </div>
      </div>
      <div className="card-body perf">
        <div>
          <div className="section-label">Per defect type (boxes, IoU ≥ 0.5)</div>
          <table className="table compact perf-table">
            <thead><tr><th>Class</th><th className="num">AP@50</th><th className="num">AP@50:95</th><th className="num">Precision</th><th className="num">Recall</th><th className="num">F1</th></tr></thead>
            <tbody>
              {classes.map((c) => {
                const pc = op.per_class[c];
                return (
                  <tr key={c}>
                    <td className="cap">{c}</td>
                    <td className="num">{num(m.coco!.per_class[c].ap50)}</td>
                    <td className="num">{num(m.coco!.per_class[c].ap50_95)}</td>
                    <td className="num">{num(pc?.precision)}</td>
                    <td className="num">{num(pc?.recall)}</td>
                    <td className="num"><b>{num(pc?.f1)}</b></td>
                  </tr>
                );
              })}
              <tr className="row-total">
                <td>All</td><td className="num">{num(m.coco?.map50)}</td><td className="num">{num(m.coco?.map50_95)}</td>
                <td className="num">{num(op.overall.precision)}</td><td className="num">{num(op.overall.recall)}</td>
                <td className="num"><b>{num(op.overall.f1)}</b></td>
              </tr>
            </tbody>
          </table>
          <p className="hint">AP is threshold-free; precision, recall and F1 use confidence ≥ {op.threshold}.</p>
        </div>

        <div>
          <div className="section-label">Confusion matrix (boxes)</div>
          <ConfusionGrid labels={conf.labels} matrix={conf.matrix} rowTitle="Annotated" colTitle="Predicted" />
          <p className="hint">“background” column = missed defect; “background” row = false detection.</p>
        </div>

        <div>
          <div className="section-label">Per cell: defective vs good</div>
          <div className="cell-metrics">
            {([["Accuracy", cell.accuracy], ["Precision", cell.precision], ["Recall", cell.recall],
               ["Specificity", cell.specificity], ["F1", cell.f1]] as const).map(([k, v]) => (
              <div key={k}><span className="proj-label">{k}</span><span className="cell-metric">{k === "F1" ? num(v) : pct(v)}</span></div>
            ))}
          </div>
          <ConfusionGrid labels={["defective", "good"]} colLabels={["called defective", "passed"]}
            matrix={[[cell.tp, cell.fn], [cell.fp, cell.tn]]} rowTitle="Actual" colTitle="Decision" />
          <p className="hint">
            {point === "review" ? "Defective = sent to review or rejected." : "Defective = auto-rejected only; review cases count as passed."}
          </p>
        </div>
      </div>
    </section>
  );
}

function ConfusionGrid({ labels, colLabels, matrix, rowTitle, colTitle }: {
  labels: string[]; colLabels?: string[]; matrix: number[][]; rowTitle: string; colTitle: string;
}) {
  const cols = colLabels ?? labels;
  return (
    <table className="confusion">
      <thead>
        <tr><th className="corner">{rowTitle} ↓ · {colTitle} →</th>{cols.map((c) => <th key={c} className="cap">{c}</th>)}</tr>
      </thead>
      <tbody>
        {matrix.map((row, i) => {
          const total = row.reduce((a, b) => a + b, 0);
          return (
            <tr key={labels[i]}>
              <th className="cap">{labels[i]}</th>
              {row.map((v, j) => {
                const share = total ? v / total : 0;
                const correct = i === j && !(labels[i] === "background");
                return (
                  <td key={j} className={correct ? "cm-ok" : v ? "cm-bad" : "cm-zero"}
                    style={{ ["--a" as string]: String(0.12 + share * 0.6) }} title={total ? `${v} of ${total} (${Math.round(share * 100)}%)` : String(v)}>
                    {v}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
