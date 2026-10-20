import { useEffect, useMemo, useState } from "react";
import { modelsApi, type BenchModel, type Benchmark, type RegisteredModel, type SweepRow } from "../api/client";

// Categorical model colours, fixed order (validated on the #121821 panel: all-pairs CVD and normal-vision pass).
// Green / amber / red are reserved for PASS / REVIEW / REJECT and never used for models.
const MODEL_COLORS = ["#3987e5", "#d95926", "#199e70"];
const OTHER = "#8794a6";

const pct = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null | undefined, d = 3) => (v == null || Number.isNaN(v) ? "—" : v.toFixed(d));

type Col = { key: string; label: string; get: (m: BenchModel) => number | null | undefined; fmt: (v: number | null | undefined) => string; better: "high" | "low"; hint: string };

const COLUMNS: Col[] = [
  { key: "map50", label: "mAP@50", get: (m) => m.coco?.map50, fmt: (v) => num(v), better: "high", hint: "COCO AP at IoU 0.5, mean over classes" },
  { key: "map", label: "mAP@50:95", get: (m) => m.coco?.map50_95, fmt: (v) => num(v), better: "high", hint: "COCO AP averaged over IoU 0.50–0.95" },
  { key: "p", label: "Precision", get: (m) => m.pr_at_threshold?.overall.precision, fmt: (v) => num(v), better: "high", hint: "Boxes at conf ≥ reject threshold, IoU ≥ 0.5" },
  { key: "r", label: "Recall", get: (m) => m.pr_at_threshold?.overall.recall, fmt: (v) => num(v), better: "high", hint: "Annotated defects found at conf ≥ reject threshold" },
  { key: "f1", label: "F1", get: (m) => m.pr_at_threshold?.overall.f1, fmt: (v) => num(v), better: "high", hint: "Harmonic mean of precision and recall" },
  { key: "esc", label: "Missed", get: (m) => m.image_level?.defect_escape_rate, fmt: pct, better: "low", hint: "Defective test images that the policy PASSED" },
  { key: "frr", label: "False rej.", get: (m) => m.image_level?.false_reject_rate, fmt: pct, better: "low", hint: "Images without defect annotations that were REJECTED" },
  { key: "lat", label: "Latency", get: (m) => m.latency?.mean_ms, fmt: (v) => (v == null ? "—" : `${v.toFixed(1)} ms`), better: "low", hint: "Mean per image, CPU, first call excluded" },
  { key: "p95", label: "p95", get: (m) => m.latency?.p95_ms, fmt: (v) => (v == null ? "—" : `${v.toFixed(1)}`), better: "low", hint: "95th percentile latency (ms)" },
  { key: "size", label: "Size", get: (m) => m.size_mb, fmt: (v) => (v == null ? "—" : `${v.toFixed(1)} MB`), better: "low", hint: "model.xml + model.bin" },
];

export function ModelsPage({ activeModel, mode, onUseModel }: { activeModel: string | null; mode: string; onUseModel: (name: string) => void }) {
  const [bench, setBench] = useState<Benchmark | null>(null);
  const [registry, setRegistry] = useState<RegisteredModel[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    modelsApi.benchmark().then(setBench).catch((e) => setError((e as Error).message));
    modelsApi.registry().then((r) => setRegistry(r.models)).catch(() => {});
  };
  useEffect(load, []);

  const models = useMemo(() => (bench?.models ?? []).filter((m) => !m.error), [bench]);
  const failed = (bench?.models ?? []).filter((m) => m.error);
  const color = (name: string) => {
    const i = (bench?.models ?? []).filter((m) => !m.error).findIndex((m) => m.name === name);
    return i >= 0 && i < MODEL_COLORS.length ? MODEL_COLORS[i] : OTHER;
  };
  const current = models.find((m) => m.name === selected) ?? models[0];
  const loadedNames = new Set(registry.filter((r) => r.loaded).map((r) => r.name));

  if (error) return <div className="models-page"><div className="banner banner-error">{error}</div></div>;
  if (!bench) return <div className="models-page muted">Loading…</div>;
  if (!bench.available || models.length === 0) return <EmptyState bench={bench} registry={registry} onReload={load} failed={failed} />;

  const ts = bench.test_set!;
  const warnings: { tone: string; text: string }[] = [];
  if (ts.images_without_annotations === 0)
    warnings.push({ tone: "review", text: "No defect-free test images, so false rejects can't be measured." });
  if (bench.leakage?.checked && (bench.leakage.count ?? 0) > 0)
    warnings.push({ tone: "reject", text: `${bench.leakage.count} of ${bench.leakage.test_images} test images look like copies of training images (${bench.leakage.near_duplicates?.slice(0, 2).map((d) => `${d.test} ≈ ${d.train}`).join(", ")}${(bench.leakage.count ?? 0) > 2 ? ", …" : ""}). Scores may be inflated.` });
  if (!bench.leakage?.checked) warnings.push({ tone: "muted", text: "Train/test duplicate check not run (add --train-images)." });
  if (ts.n_images < 50) warnings.push({ tone: "review", text: `Only ${ts.n_images} test images: small differences between models aren't meaningful.` });
  models.forEach((m) => m.unmatched_model_labels?.length &&
    warnings.push({ tone: "review", text: `${m.name}: labels ${m.unmatched_model_labels.join(", ")} not in the dataset (ignored).` }));
  if (bench.leakage?.checked && (bench.leakage.count ?? 0) === 0)
    warnings.push({ tone: "pass", text: "No train/test duplicates found." });

  return (
    <div className="models-page">
      <section className="panel prov">
        <div className="prov-grid">
          <Fact label="Test set" value={`${ts.n_images} images · ${ts.n_boxes} boxes`} sub={Object.entries(ts.boxes_per_class).map(([k, v]) => `${k} ${v}`).join(" · ")} />
          <Fact label="Defect-free images" value={String(ts.images_without_annotations)} />
          <Fact label="Policy" value={`REJECT ≥ ${bench.policy!.reject_threshold} · REVIEW ≥ ${bench.policy!.review_threshold}`} />
          <Fact label="Measured" value={new Date(bench.generated_at!).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
            sub={bench.machine?.device ?? "CPU"} title={bench.machine?.cpu} />
          <button className="btn" onClick={load}>↻ Reload</button>
        </div>
        <div className="warnings">
          {warnings.map((w, i) => <span key={i} className={`warn warn-${w.tone}`}>{w.text}</span>)}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Models on the held-out test set</h2>
          <span className="muted small">★ best · click a row for details</span>
        </div>
        <ComparisonTable models={models} color={color} selected={current?.name} onSelect={setSelected}
          activeModel={mode === "live" ? activeModel : null} loaded={loadedNames} onUseModel={onUseModel} />
        {failed.length > 0 && <div className="muted small">Failed to load: {failed.map((f) => `${f.name} (${f.error})`).join("; ")}</div>}
      </section>

      <div className="chart-row">
        <section className="panel"><div className="panel-head"><h2>Accuracy vs speed</h2><span className="muted small">↖ better</span></div>
          <Scatter models={models} color={color} /></section>
        <section className="panel"><div className="panel-head"><h2>Per-class AP@50</h2></div>
          <PerClass models={models} color={color} /></section>
        <section className="panel"><div className="panel-head"><h2>Robustness</h2><span className="muted small">mAP@50 on altered images</span></div>
          <Robustness models={models} color={color} perturbations={bench.perturbations ?? []} /></section>
      </div>

      {current && (
        <div className="chart-row detail-row">
          <section className="panel"><div className="panel-head"><h2>Threshold trade-off</h2><span className="muted small"><span style={{ color: color(current.name) }}>■</span> {current.name}</span></div>
            <Sweep rows={current.threshold_sweep ?? []} reject={bench.policy!.reject_threshold} /></section>
          <section className="panel"><div className="panel-head"><h2>Decisions per image</h2><span className="muted small">{current.name}</span></div>
            <Outcomes m={current} /></section>
          <section className="panel"><div className="panel-head"><h2>Model identity & errors</h2><span className="muted small">{current.name}</span></div>
            <Trace m={current} failures={current.failures ?? []} /></section>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, sub, title }: { label: string; value: string; sub?: string; title?: string }) {
  return (
    <div className="fact" title={title}>
      <div className="fact-label">{label}</div>
      <div className="fact-value">{value}</div>
      {sub && <div className="fact-sub">{sub}</div>}
    </div>
  );
}

function ComparisonTable({ models, color, selected, onSelect, activeModel, loaded, onUseModel }: {
  models: BenchModel[]; color: (n: string) => string; selected?: string; onSelect: (n: string) => void;
  activeModel: string | null; loaded: Set<string>; onUseModel: (n: string) => void;
}) {
  const best = Object.fromEntries(COLUMNS.map((c) => {
    const vals = models.map(c.get).filter((v): v is number => v != null && !Number.isNaN(v));
    if (vals.length < 2 || vals.every((v) => v === vals[0])) return [c.key, null]; // no star when all tie
    return [c.key, c.better === "high" ? Math.max(...vals) : Math.min(...vals)];
  }));
  return (
    <div className="log compare">
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th title="From meta.json (copied from Geti)">Type</th>
            <th title="Geti's own validation score, from meta.json. Not measured here.">Geti score</th>
            {COLUMNS.map((c) => <th key={c.key} className="num" title={c.hint}>{c.label}</th>)}
            <th title="SHA-256 of model.xml + model.bin">Hash</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.name} className={m.name === selected ? "row-selected" : ""} onClick={() => onSelect(m.name)}>
              <td><span className="swatch" style={{ background: color(m.name) }} />{m.name}</td>
              <td className="geti">{[m.meta.architecture, m.meta.precision].filter(Boolean).join(" ") || "—"}</td>
              <td className="geti mono">
                {m.meta.geti_validation_score?.value != null
                  ? `${m.meta.geti_validation_score.metric ?? "score"} ${m.meta.geti_validation_score.value}`
                  : "—"}
              </td>
              {COLUMNS.map((c) => {
                const v = c.get(m);
                const isBest = best[c.key] != null && v === best[c.key];
                return <td key={c.key} className={`num mono ${isBest ? "best" : ""}`}>{c.fmt(v)}{isBest ? " ★" : ""}</td>;
              })}
              <td className="mono muted">{m.sha256_12?.slice(0, 8)}</td>
              <td>
                {activeModel === m.name ? <span className="chip chip-live">ON LINE</span>
                  : loaded.has(m.name) ? <button className="btn btn-xs" onClick={(e) => { e.stopPropagation(); onUseModel(m.name); }}>Use on line</button>
                  : <span className="muted small">not loaded</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- charts (plain SVG; native <title> tooltips) -------------------------------

const W = 420, H = 230, PAD = { l: 44, r: 16, t: 14, b: 34 };
const xr = (v: number, lo: number, hi: number) => PAD.l + ((v - lo) / (hi - lo || 1)) * (W - PAD.l - PAD.r);
const yr = (v: number, lo = 0, hi = 1) => H - PAD.b - ((v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);

function Axes({ yTicks = [0, 0.25, 0.5, 0.75, 1], yFmt = (v: number) => v.toFixed(2), xLabel }: { yTicks?: number[]; yFmt?: (v: number) => string; xLabel?: string }) {
  return (
    <g className="axes">
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={yr(t)} y2={yr(t)} className="grid" />
          <text x={PAD.l - 6} y={yr(t) + 4} textAnchor="end" className="tick-label">{yFmt(t)}</text>
        </g>
      ))}
      {xLabel && <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} textAnchor="middle" className="axis-label">{xLabel}</text>}
    </g>
  );
}

function Legend({ models, color }: { models: BenchModel[]; color: (n: string) => string }) {
  return (
    <div className="legend chart-legend">
      {models.map((m) => <span key={m.name}><i className="dot" style={{ background: color(m.name) }} />{m.name}</span>)}
    </div>
  );
}

function Scatter({ models, color }: { models: BenchModel[]; color: (n: string) => string }) {
  const pts = models.filter((m) => m.latency && m.coco);
  if (!pts.length) return <div className="muted small">No latency data.</div>;
  const lats = pts.map((m) => m.latency!.mean_ms);
  const lo = 0, hi = Math.max(...lats) * 1.6; // headroom on the right for the label column
  const xt = [0, hi / 2, hi];
  const xfmt = (v: number) => v.toFixed(hi < 10 ? 1 : 0);
  // Dodge direct labels: walk points top-to-bottom and push a label down if it would overlap the previous one.
  const placed = pts.map((m) => ({ m, x: xr(m.latency!.mean_ms, lo, hi), y: yr(m.coco!.map50) }))
    .sort((a, b) => a.y - b.y);
  let lastY = -Infinity;
  const labelY = new Map<string, number>();
  placed.forEach((p) => { const ly = Math.max(p.y + 4, lastY + 18); labelY.set(p.m.name, ly); lastY = ly; });
  // All labels in one column beside the point cluster (right if it fits, else left), so no label crosses a dot.
  const LABEL_W = 100;
  const right = Math.max(...placed.map((p) => p.x)) + 22;
  const onRight = right + LABEL_W <= W;
  const labelX = onRight ? right : Math.min(...placed.map((p) => p.x)) - 22;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart">
        <Axes xLabel="ms per image →" />
        {xt.map((t) => <text key={t} x={xr(t, lo, hi)} y={H - PAD.b + 14} textAnchor="middle" className="tick-label">{xfmt(t)}</text>)}
        {placed.map(({ m, x, y }) => {
          const ly = labelY.get(m.name)!;
          return (
            <g key={m.name} className="mark">
              <circle cx={x} cy={y} r={14} fill="transparent" />
              <line x1={onRight ? x + 6 : x - 6} y1={y} x2={onRight ? labelX - 4 : labelX + 4} y2={ly - 4} className="leader" />
              <circle cx={x} cy={y} r={6} fill={color(m.name)} className="dot-mark" />
              <text x={labelX} y={ly} textAnchor={onRight ? "start" : "end"} className="direct-label">{m.name}</text>
              <title>{`${m.name}\nmAP@50 ${m.coco!.map50.toFixed(3)}\n${m.latency!.mean_ms.toFixed(1)} ms mean`}</title>
            </g>
          );
        })}
      </svg>
    </>
  );
}

function PerClass({ models, color }: { models: BenchModel[]; color: (n: string) => string }) {
  const classes = Array.from(new Set(models.flatMap((m) => Object.keys(m.coco?.per_class ?? {}))));
  if (!classes.length) return <div className="muted small">No per-class data.</div>;
  const groupW = (W - PAD.l - PAD.r) / classes.length;
  const barW = Math.min(26, (groupW - 16) / models.length - 2);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart">
        <Axes />
        {classes.map((c, ci) => {
          const gx = PAD.l + ci * groupW + (groupW - models.length * (barW + 2)) / 2;
          return (
            <g key={c}>
              {models.map((m, mi) => {
                const v = m.coco?.per_class[c]?.ap50;
                const val = v == null || Number.isNaN(v) ? 0 : v;
                const x = gx + mi * (barW + 2), y = yr(val);
                return (
                  <g key={m.name} className="mark">
                    <path d={roundedTop(x, y, barW, yr(0) - y)} fill={color(m.name)} />
                    <title>{`${m.name} · ${c}\nAP@50 ${num(v)}\nAP@50:95 ${num(m.coco?.per_class[c]?.ap50_95)}`}</title>
                  </g>
                );
              })}
              <text x={PAD.l + ci * groupW + groupW / 2} y={H - PAD.b + 16} textAnchor="middle" className="tick-label cap">{c}</text>
            </g>
          );
        })}
      </svg>
      <Legend models={models} color={color} />
    </>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

const SHORT: Record<string, string> = { low_contrast: "contrast", jpeg_q20: "jpeg", bright: "bright", dark: "dark", noise: "noise", blur: "blur", clean: "clean" };

function Robustness({ models, color, perturbations }: { models: BenchModel[]; color: (n: string) => string; perturbations: string[] }) {
  if (perturbations.length < 2) return <div className="muted small">Run benchmark.py without --no-robustness to see this.</div>;
  const step = (W - PAD.l - PAD.r) / (perturbations.length - 1);
  const x = (i: number) => PAD.l + i * step;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart">
        <Axes />
        {perturbations.map((p, i) => (
          <text key={p} x={x(i)} y={H - PAD.b + 16} textAnchor="middle" className="tick-label">{SHORT[p] ?? p}</text>
        ))}
        {models.map((m) => {
          const pts = perturbations.map((p, i) => [x(i), yr(m.robustness?.[p]?.map50 ?? 0)] as const);
          return (
            <g key={m.name}>
              <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={color(m.name)} strokeWidth={2} />
              {perturbations.map((p, i) => (
                <g key={p} className="mark">
                  <circle cx={pts[i][0]} cy={pts[i][1]} r={12} fill="transparent" />
                  <circle cx={pts[i][0]} cy={pts[i][1]} r={4} fill={color(m.name)} className="dot-mark" />
                  <title>{`${m.name} · ${p}\nmAP@50 ${num(m.robustness?.[p]?.map50)}\nrecall ${num(m.robustness?.[p]?.recall)}\nescape ${pct(m.robustness?.[p]?.defect_escape_rate)}`}</title>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <Legend models={models} color={color} />
    </>
  );
}

const SWEEP_SERIES: { key: keyof SweepRow; label: string; cls: string }[] = [
  { key: "defect_recall", label: "defects caught", cls: "s-solid" },
  { key: "false_reject_rate", label: "clean rejected", cls: "s-dash" },
  { key: "box_precision", label: "box precision", cls: "s-dot" },
];

function Sweep({ rows, reject }: { rows: SweepRow[]; reject: number }) {
  if (!rows.length) return <div className="muted small">No sweep data.</div>;
  const x = (t: number) => xr(t, 0, 1);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart">
        <Axes yFmt={(v) => `${Math.round(v * 100)}%`} xLabel="reject threshold →" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => <text key={t} x={x(t)} y={H - PAD.b + 14} textAnchor="middle" className="tick-label">{t}</text>)}
        <line x1={x(reject)} x2={x(reject)} y1={PAD.t} y2={H - PAD.b} className="policy-line" />
        <text x={x(reject) + 4} y={PAD.t + 10} className="direct-label">now {reject}</text>
        {SWEEP_SERIES.map((s) => {
          const pts = rows.filter((r) => r[s.key] != null).map((r) => `${x(r.threshold)},${yr(r[s.key] as number)}`);
          return pts.length ? <polyline key={s.key} points={pts.join(" ")} className={`sweep ${s.cls}`} /> : null;
        })}
        {rows.map((r) => (
          <g key={r.threshold} className="mark">
            <rect x={x(r.threshold) - 8} y={PAD.t} width={16} height={H - PAD.t - PAD.b} fill="transparent" />
            <title>{`threshold ${r.threshold}\ndefective rejected ${pct(r.defect_recall)}\nclean rejected ${pct(r.false_reject_rate)}\nbox precision ${num(r.box_precision)} · recall ${num(r.box_recall)}`}</title>
          </g>
        ))}
      </svg>
      <div className="legend chart-legend">
        {SWEEP_SERIES.map((s) => <span key={s.key}><svg width="22" height="8"><line x1="0" x2="22" y1="4" y2="4" className={`sweep ${s.cls}`} /></svg>{s.label}</span>)}
      </div>
    </>
  );
}

function Outcomes({ m }: { m: BenchModel }) {
  const il = m.image_level;
  if (!il) return null;
  const rows = [["defective", "Defective"], ["no_defect_annotated", "No defect"]] as const;
  return (
    <div className="outcomes">
      <table className="matrix">
        <thead><tr><th>Truth ↓ · decision →</th><th className="tone-pass">PASS</th><th className="tone-review">REVIEW</th><th className="tone-reject">REJECT</th></tr></thead>
        <tbody>
          {rows.map(([k, label]) => (
            <tr key={k}><th>{label}</th>{(["PASS", "REVIEW", "REJECT"] as const).map((s) => {
              const bad = (k === "defective" && s === "PASS") || (k === "no_defect_annotated" && s === "REJECT");
              return <td key={s} className={`mono ${bad && il.matrix[k][s] > 0 ? "cell-bad" : ""}`}>{il.matrix[k][s]}</td>;
            })}</tr>
          ))}
        </tbody>
      </table>
      <dl className="rates">
        <div><dt>Caught</dt><dd className="tone-pass">{pct(il.defect_catch_rate)}</dd></div>
        <div><dt>Missed</dt><dd className="tone-reject">{pct(il.defect_escape_rate)}</dd></div>
        <div><dt>False reject</dt><dd>{pct(il.false_reject_rate)}</dd></div>
        <div><dt>To review</dt><dd className="tone-review">{pct(il.review_rate)}</dd></div>
      </dl>
      <p className="chart-note" title="Whole system (model + policy) per image. Not a per-class confusion matrix; does not replace mAP.">Whole system, per image. Not a replacement for mAP.</p>
    </div>
  );
}

function Trace({ m, failures }: { m: BenchModel; failures: NonNullable<BenchModel["failures"]> }) {
  const meta = Object.entries(m.meta).filter(([k]) => !k.startsWith("_"));
  return (
    <div className="trace">
      <dl className="trace-list">
        <div><dt>File</dt><dd className="mono">{m.path}</dd></div>
        <div><dt>Hash</dt><dd className="mono">{m.sha256_12}</dd></div>
        <div><dt>Labels</dt><dd>{(m.labels ?? []).join(", ") || "—"}</dd></div>
        {meta.length > 0 && <div><dt>From Geti</dt><dd>{meta.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}</dd></div>}
      </dl>
      <div className="fact-label">Errors · use in the report ({failures.length})</div>
      <ul className="failures">
        {failures.length === 0 && <li className="muted">None</li>}
        {failures.map((f) => (
          <li key={f.file}>
            <span className={`pill pill-${f.decision === "PASS" ? "pass" : "reject"}`}>{f.decision}</span>
            <span className="mono">{f.file}</span>
            <span className="muted"> {f.ground_truth === "defective" ? "missed" : "false reject"}{f.top ? ` · ${f.top[0]} ${f.top[1]}` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ bench, registry, onReload, failed }: { bench: Benchmark; registry: RegisteredModel[]; onReload: () => void; failed: BenchModel[] }) {
  return (
    <div className="models-page">
      <section className="panel empty-models">
        <h2>No benchmark yet</h2>
        <ol>
          <li>Put each Geti model in its own folder, e.g. <code>models\yolox_tiny_fp16\model.xml</code></li>
          <li>Run:
            <pre>{`cd backend
.\\.venv\\Scripts\\python scripts\\benchmark.py \`
  --coco ..\\datasets\\battery\\test\\_annotations.coco.json \`
  --images ..\\datasets\\battery\\test \`
  --train-images ..\\datasets\\battery\\train`}</pre>
          </li>
          <li><button className="btn btn-xs" onClick={onReload}>↻ Reload</button></li>
        </ol>
        {failed.length > 0 && <p className="tone-reject small">Failed: {failed.map((f) => `${f.name}: ${f.error}`).join("; ")}</p>}
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Models found</h2></div>
        {registry.length === 0 ? <div className="muted">None in models/ yet</div> : (
          <div className="log"><table>
            <thead><tr><th>Name</th><th>Status</th><th>Labels</th><th>SHA-256</th><th>Size</th></tr></thead>
            <tbody>{registry.map((r) => (
              <tr key={r.name}><td>{r.name}</td>
                <td>{r.loaded ? <span className="pill pill-pass">loaded</span> : <span className="pill pill-reject" title={r.error ?? ""}>error</span>}</td>
                <td>{r.labels.join(", ") || "—"}</td><td className="mono">{r.sha256_12 ?? "—"}</td><td className="mono">{r.size_mb ? `${r.size_mb} MB` : "—"}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
