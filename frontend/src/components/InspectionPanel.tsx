import type { InspectionResult } from "../api/client";
import { bboxToRect } from "../lib/geometry";

const TONE = { PASS: "pass", REJECT: "reject", REVIEW: "review" } as const;

interface Props {
  result: InspectionResult | null;
  rejectThreshold: number;
  reviewThreshold: number;
}

export function InspectionPanel({ result, rejectThreshold, reviewThreshold }: Props) {
  if (!result) {
    return (
      <div className="inspection empty">
        <div className="placeholder">Waiting for the first cell to reach the inspection station.<br />Press <b>Start</b> or <b>Step</b>.</div>
      </div>
    );
  }
  const { image_width: w, image_height: h } = result;
  const isDemo = result.mode === "demo";
  const tone = TONE[result.status];
  const stroke = Math.max(w, h) / 220;
  const font = Math.max(w, h) / 38;

  return (
    <div className="inspection">
      <div className="frame">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="frame-svg">
          <image href={result.image_url} x={0} y={0} width={w} height={h} />
          {result.detections.map((d, i) => {
            const r = bboxToRect(d.bbox, w, h);
            const cls = d.actionable ? `box box-${d.confidence >= rejectThreshold ? "reject" : "review"}` : "box box-ignored";
            const text = `${d.label} ${d.confidence.toFixed(2)}`;
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
        {isDemo && <div className="demo-watermark">DEMO · SCRIPTED RESULT</div>}
      </div>

      <div className={`verdict verdict-${tone}`}>
        <div className="verdict-status">{result.status}</div>
        <div className="verdict-meta">
          <div className="verdict-cell">{result.cell_id}{result.source === "upload" ? " · uploaded" : ""}</div>
          <div className="verdict-reason">{result.reason}</div>
        </div>
      </div>

      <dl className="facts">
        <div>
          <dt>Detections</dt>
          <dd>
            {result.detections.length === 0
              ? `None ≥ ${reviewThreshold.toFixed(2)}`
              : result.detections.map((d) => `${d.label} ${d.confidence.toFixed(2)}${d.actionable ? "" : " (ignored)"}`).join(", ")}
          </dd>
        </div>
        <div>
          <dt>Inference</dt>
          <dd>{result.inference_ms != null ? `${result.inference_ms.toFixed(1)} ms (measured, CPU)` : "not measured · demo replay"}</dd>
        </div>
        <div>
          <dt>Ground truth</dt>
          <dd>
            {result.ground_truth
              ? `${result.ground_truth} (${isDemo ? "synthetic render" : "dataset label"})`
              : "not available for this image"}
          </dd>
        </div>
      </dl>
      {isDemo && <p className="disclaimer">Confidence values in DEMO mode are illustrative and scripted, not model output.</p>}
      {result.detections.length === 0 && (
        <p className="disclaimer">No detection ≠ verified defect-free. PASS means nothing actionable was found at the configured threshold.</p>
      )}
    </div>
  );
}
