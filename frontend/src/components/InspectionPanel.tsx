import { useState } from "react";
import type { InspectionResult } from "../api/client";
import { bboxToRect } from "../lib/geometry";

const TONE = { PASS: "pass", REJECT: "reject", REVIEW: "review" } as const;

interface Props {
  result: InspectionResult | null;
  rejectThreshold: number;
  reviewThreshold: number;
}

export function InspectionPanel({ result, rejectThreshold, reviewThreshold }: Props) {
  const [showHeat, setShowHeat] = useState(true);
  if (!result) {
    return (
      <div className="inspection empty">
        <div className="placeholder">No cell inspected yet</div>
      </div>
    );
  }
  const { image_width: w, image_height: h } = result;
  const isDemo = result.mode === "demo";
  const tone = TONE[result.status];
  const stroke = Math.max(w, h) / 200;
  const font = Math.max(w, h) / 32;
  const actionable = result.detections.filter((d) => d.actionable);
  const top = actionable[0];
  const review = result.review_threshold ?? reviewThreshold;
  const reject = result.reject_threshold ?? rejectThreshold;

  const finding = result.reason.startsWith("Inference error")
    ? result.reason
    : top
      ? `${top.label} ${top.confidence.toFixed(2)}${actionable.length > 1 ? ` +${actionable.length - 1} more` : ""}`
      : `No defect ≥ ${review.toFixed(2)}`;

  return (
    <div className="inspection">
      <div className="frame">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="frame-svg">
          <image href={result.image_url} x={0} y={0} width={w} height={h} />
          {result.explain_url && showHeat && <image href={result.explain_url} x={0} y={0} width={w} height={h} opacity={0.75} />}
          {result.detections.map((d, i) => {
            const r = bboxToRect(d.bbox, w, h);
            const cls = d.actionable ? `box box-${d.confidence >= reject ? "reject" : "review"}` : "box box-ignored";
            const text = `${d.label} ${d.confidence.toFixed(2)}`;
            const labelY = r.y > font * 1.6 ? r.y - font * 0.4 : r.y + r.height + font * 1.1;
            return (
              <g key={i} className={cls}>
                <rect x={r.x} y={r.y} width={r.width} height={r.height} strokeWidth={stroke} />
                <rect x={r.x} y={labelY - font} width={text.length * font * 0.6 + font * 0.6} height={font * 1.3} className="box-tag" />
                <text x={r.x + font * 0.3} y={labelY} fontSize={font}>{text}</text>
              </g>
            );
          })}
        </svg>
        {isDemo && <div className="demo-watermark" title="Synthetic image with a scripted result. No model was run.">DEMO · scripted</div>}
        {result.explain_url && (
          <button className="btn btn-xs heat-toggle" onClick={() => setShowHeat(!showHeat)}>
            {showHeat ? "Hide" : "Show"} heatmap
          </button>
        )}
      </div>

      <div className={`verdict verdict-${tone}`} title={result.reason}>
        <div className="verdict-status">{result.status}</div>
        <div className="verdict-meta">
          <div className="verdict-finding">{finding}</div>
          <div className="verdict-cell mono">{result.cell_id}{result.source === "upload" ? " · uploaded" : ""}</div>
        </div>
        <div className="verdict-latency mono">
          {result.inference_ms != null ? `${result.inference_ms.toFixed(1)} ms` : isDemo ? "no inference" : "—"}
        </div>
      </div>

      <div className="meta-line">
        <span title="Known label for this image">
          <span className="meta-key">Truth</span>
          {result.ground_truth ? `${result.ground_truth}${isDemo ? " (synthetic)" : ""}` : "unknown"}
        </span>
        <span className="mono" title="Model and policy that produced this decision (stored with the record)">
          <span className="meta-key">Trace</span>
          {result.model_name ?? "?"}{result.model_sha ? `@${result.model_sha.slice(0, 8)}` : ""}
        </span>
      </div>
    </div>
  );
}
