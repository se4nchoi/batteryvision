import { useEffect, useState } from "react";
import type { Detection, InspectionResult, ViewResult } from "../api/client";
import { bboxToRect } from "../lib/geometry";
import { StatusBadge } from "./Analytics";

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SCAN_MS = 260; // time per view while "rotating" through a new cell

interface Props {
  result: InspectionResult | null;
  rejectThreshold: number;
  reviewThreshold: number;
}

function viewsOf(r: InspectionResult): ViewResult[] {
  return r.views?.length ? r.views
    : [{ image_url: r.image_url, image_width: r.image_width, image_height: r.image_height, angle: null, inference_ms: r.inference_ms }];
}

function ViewImage({ view, detections, reject, heatUrl, annotated }: {
  view: ViewResult; detections: Detection[]; reject: number; heatUrl?: string | null; annotated: boolean;
}) {
  const { image_width: w, image_height: h } = view;
  const stroke = Math.max(w, h) / 220;
  const font = Math.max(w, h) / 34;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="frame-svg">
      <image href={view.image_url} x={0} y={0} width={w} height={h} />
      {heatUrl && <image href={heatUrl} x={0} y={0} width={w} height={h} opacity={0.75} />}
      {detections.map((d, i) => {
        const r = bboxToRect(d.bbox, w, h);
        const cls = d.actionable ? `box box-${d.confidence >= reject ? "reject" : "review"}` : "box box-ignored";
        const text = annotated ? `${d.label} (annotated)` : `${d.label} ${Math.round(d.confidence * 100)}%`;
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
  );
}

/** Magnified crop around a (small) defect, so it is visible at dashboard size. */
function ZoomInset({ view, det, reject }: { view: ViewResult; det: Detection; reject: number }) {
  const { image_width: w, image_height: h } = view;
  const r = bboxToRect(det.bbox, w, h);
  // square crop, about 3x the box, at least 18% of the image side, kept inside the image
  const side = Math.min(Math.max(Math.max(r.width, r.height) * 4, Math.max(w, h) * 0.25), Math.max(w, h));
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const x0 = Math.min(Math.max(cx - side / 2, 0), Math.max(w - side, 0));
  const y0 = Math.min(Math.max(cy - side / 2, 0), Math.max(h - side, 0));
  const tone = !det.actionable ? "ignored" : det.confidence >= reject ? "reject" : "review";
  // sit in the corner opposite the finding, so the inset never covers the box or its confidence tag
  const corner = `${cy > h / 2 ? "top" : "bottom"}-${cx > w / 2 ? "left" : "right"}`;
  return (
    <div className={`zoom-inset zoom-${corner}`} aria-label="Zoomed view of the finding">
      <svg viewBox={`${x0} ${y0} ${side} ${side}`} preserveAspectRatio="xMidYMid slice">
        <image href={view.image_url} x={0} y={0} width={w} height={h} />
        <g className={`box box-${tone}`}>
          <rect x={r.x} y={r.y} width={r.width} height={r.height} strokeWidth={side / 90} />
        </g>
      </svg>
      <span>Zoom ×{Math.max(1, Math.round(Math.max(w, h) / side))}</span>
    </div>
  );
}

export function InspectionPanel({ result, rejectThreshold, reviewThreshold }: Props) {
  const [showHeat, setShowHeat] = useState(true);
  const [selected, setSelected] = useState(0);
  const [scanning, setScanning] = useState(false);

  // New cell: flip through every side once (simulated rotation), then rest on the strongest finding.
  const cellId = result?.cell_id;
  useEffect(() => {
    if (!result) return;
    const n = viewsOf(result).length;
    if (n < 2) { setSelected(0); return; }
    let i = 0;
    setScanning(true);
    setSelected(0);
    const id = setInterval(() => {
      i += 1;
      if (i < n) setSelected(i);
      else { clearInterval(id); setScanning(false); setSelected(result.primary_view ?? 0); }
    }, SCAN_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellId]);

  if (!result) return <div className="placeholder">No cell inspected yet.</div>;

  const views = viewsOf(result);
  const sel = Math.min(selected, views.length - 1);
  const isDemo = result.mode === "demo";
  const annotated = result.model_name?.startsWith("annotations") ?? false; // dataset replay: ground truth
  const reject = result.reject_threshold ?? rejectThreshold;
  const review = result.review_threshold ?? reviewThreshold;
  const actionable = result.detections.filter((d) => d.actionable);
  const top = actionable[0] && actionable.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  // strongest finding on the side being shown (drives the zoom inset)
  const focus = result.detections.filter((d) => (d.view ?? 0) === sel)
    .reduce<Detection | null>((a, b) => (!a || b.confidence > a.confidence ? b : a), null);
  const viewTone = (i: number) => {
    const best = Math.max(0, ...actionable.filter((d) => (d.view ?? 0) === i).map((d) => d.confidence));
    return best >= reject ? "reject" : best >= review ? "review" : "";
  };
  const angle = (v: ViewResult, i: number) => (v.angle != null ? `${v.angle}°` : `View ${i + 1}`);

  return (
    <div className="inspection">
      <div className="frame">
        <ViewImage view={views[sel]} detections={result.detections.filter((d) => (d.view ?? 0) === sel)} reject={reject}
          heatUrl={sel === result.primary_view && showHeat ? result.explain_url : null} annotated={annotated} />
        {focus && (focus.bbox[2] - focus.bbox[0]) * (focus.bbox[3] - focus.bbox[1]) < 0.06 && (
          <ZoomInset view={views[sel]} det={focus} reject={reject} />
        )}
        {isDemo && <span className="frame-tag">{annotated ? "Dataset photo · annotations" : "Demo image"}</span>}
        {views.length > 1 && <span className={`frame-angle ${scanning ? "scanning" : ""}`}>{scanning ? "Rotating… " : ""}{angle(views[sel], sel)}</span>}
        {result.explain_url && (
          <button className="btn btn-sm frame-btn" onClick={() => setShowHeat(!showHeat)}>{showHeat ? "Hide" : "Show"} heatmap</button>
        )}
      </div>

      {views.length === 1 && (
        <p className="hint">One photo per cell in this source: the cell turns at the station, but only this side was inspected.</p>
      )}
      {views.length > 1 && (
        <div className="view-strip" role="tablist" aria-label="Cell sides">
          {views.map((v, i) => (
            <button key={i} role="tab" aria-selected={i === sel} title={angle(v, i)}
              className={`view-thumb ${i === sel ? "active" : ""} ${viewTone(i) ? `tone-${viewTone(i)}` : ""}`}
              onClick={() => { setScanning(false); setSelected(i); }}>
              <img src={v.image_url} alt="" />
              <span>{angle(v, i)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="inspection-head">
        <span className="mono">{result.cell_id}</span>
        <StatusBadge status={result.status} />
      </div>

      <dl className="details">
        <div>
          <dt>Finding</dt>
          <dd>
            {result.reason.startsWith("Inference error") ? result.reason
              : top && annotated ? `${sentence(top.label)} (annotated)`
              : top ? `${sentence(top.label)}, ${Math.round(top.confidence * 100)}%${views.length > 1 ? ` at ${angle(views[top.view ?? 0], top.view ?? 0)}` : ""}`
              : annotated ? "No defect annotated"
                : `Nothing above ${Math.round(review * 100)}%${views.length > 1 ? ` on ${views.length} sides` : ""}`}
          </dd>
        </div>
        <div>
          <dt>Inference</dt>
          <dd>{result.inference_ms != null ? `${result.inference_ms.toFixed(1)} ms${views.length > 1 ? ` (${views.length} views)` : ""}` : annotated ? "No model (annotations)" : isDemo ? "Not run (demo)" : "–"}</dd>
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
