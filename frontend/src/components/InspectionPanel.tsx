import { useState } from "react";
import type { InspectionResult } from "../api/client";
import { bboxToRect } from "../lib/geometry";
import { StatusBadge } from "./Analytics";

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Props {
  result: InspectionResult | null;
  rejectThreshold: number;
  reviewThreshold: number;
}

export function InspectionPanel({ result, rejectThreshold, reviewThreshold }: Props) {
  const [showHeat, setShowHeat] = useState(true);
  if (!result) return <div className="placeholder">No cell inspected yet.</div>;

  const { image_width: w, image_height: h } = result;
  const isDemo = result.mode === "demo";
  const stroke = Math.max(w, h) / 220;
  const font = Math.max(w, h) / 34;
  const actionable = result.detections.filter((d) => d.actionable);
  const reject = result.reject_threshold ?? rejectThreshold;
  const review = result.review_threshold ?? reviewThreshold;
  const top = actionable[0];

  return (
    <div className="inspection">
      <div className="frame">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="frame-svg">
          <image href={result.image_url} x={0} y={0} width={w} height={h} />
          {result.explain_url && showHeat && <image href={result.explain_url} x={0} y={0} width={w} height={h} opacity={0.75} />}
          {result.detections.map((d, i) => {
            const r = bboxToRect(d.bbox, w, h);
            const cls = d.actionable ? `box box-${d.confidence >= reject ? "reject" : "review"}` : "box box-ignored";
            const text = `${d.label} ${Math.round(d.confidence * 100)}%`;
            const labelY = r.y > font * 1.6 ? r.y - font * 0.4 : r.y + r.height + font * 1.1;
            return (
              <g key={i} className={cls}>
                <rect x={r.x} y={r.y} width={r.width} height={r.height} strokeWidth={stroke} />
                <rect x={r.x} y={labelY - font} width={text.length * font * 0.58 + font * 0.6} height={font * 1.3} className="box-tag" />
                <text x={r.x + font * 0.3} y={labelY} fontSize={font}>{text}</text>
              </g>
            );
          })}
        </svg>
        {isDemo && <span className="frame-tag">Demo image</span>}
        {result.explain_url && (
          <button className="btn btn-sm frame-btn" onClick={() => setShowHeat(!showHeat)}>{showHeat ? "Hide" : "Show"} heatmap</button>
        )}
      </div>

      <div className="inspection-head">
        <span className="mono">{result.cell_id}</span>
        <StatusBadge status={result.status} />
      </div>

      <dl className="details">
        <div>
          <dt>Finding</dt>
          <dd>
            {result.reason.startsWith("Inference error") ? result.reason
              : top ? `${sentence(top.label)}, ${Math.round(top.confidence * 100)}% confidence` : `Nothing above ${Math.round(review * 100)}%`}
          </dd>
        </div>
        <div>
          <dt>Inference</dt>
          <dd>{result.inference_ms != null ? `${result.inference_ms.toFixed(1)} ms` : isDemo ? "Not run (demo)" : "–"}</dd>
        </div>
        <div>
          <dt>Known label</dt>
          <dd>{result.ground_truth ? sentence(result.ground_truth) : "Unknown"}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd title={result.model_sha ?? undefined}>
            {result.model_name ?? "–"}{result.model_sha && <span className="mono muted"> · {result.model_sha.slice(0, 8)}</span>}
          </dd>
        </div>
      </dl>
    </div>
  );
}
