import { useEffect, useMemo, useState } from "react";
import { modelsApi, type BenchModel, type Benchmark, type RegisteredModel, type SweepRow } from "../api/client";
import { IconRefresh } from "./Icons";

// Fixed-order model colours (validated on white: all-pairs CVD + normal-vision pass; labels always shown).
const MODEL_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];
const OTHER = "#98a2b3";

const pct = (v: number | null | undefined, d = 0) => (v == null || Number.isNaN(v) ? "–" : `${(v * 100).toFixed(d)}%`);
const ms = (v: number | null | undefined) => (v == null ? "–" : `${v.toFixed(1)} ms`);

const PERTURB_LABEL: Record<string, string> = {
  clean: "Original", blur: "Blurred", dark: "Darker", bright: "Brighter",
  low_contrast: "Low contrast", noise: "Sensor noise", jpeg_q20: "Heavy JPEG",
};

interface Props { activeModel: string | null; mode: string; onUseModel: (name: string) => void }

export function ModelsPage({ activeModel, onUseModel }: Props) {
  const [source, setSource] = useState<"real" | "example">("real");
  const [bench, setBench] = useState<Benchmark | null>(null);
  const [registry, setRegistry] = useState<RegisteredModel[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    modelsApi.benchmark(source === "example").then(setBench).catch((e) => setError((e as Error).message));
    modelsApi.registry().then((r) => setRegistry(r.models)).catch(() => {});
  };
  useEffect(() => { setSelected(null); load(); }, [source]); // eslint-disable-line react-hooks/exhaustive-deps
  const isExample = source === "example";

  const models = useMemo(() => (bench?.models ?? []).filter((m) => !m.error), [bench]);
  const color = (name: string) => {
    const i = models.findIndex((m) => m.name === name);
    return i >= 0 && i < MODEL_COLORS.length ? MODEL_COLORS[i] : OTHER;
  };
  const current = models.find((m) => m.name === selected) ?? models.find((m) => m.name === activeModel) ?? models[0];
  const loaded = new Set(registry.filter((r) => r.loaded).map((r) => r.name));

  const header = (
    <header className="page-header">
      <div>
        <h1>Models</h1>
        <p className="page-sub">
          {isExample ? "Example layout with invented numbers."
            : bench?.available && bench.test_set
              ? `Benchmarked on ${bench.test_set.n_images} held-out test images (${bench.test_set.n_boxes} defects) · ${new Date(bench.generated_at!).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`
              : "Compare trained models on the same held-out test images."}
        </p>
      </div>
      <div className="actions">
        <div className="segmented" role="group" aria-label="Data shown">
          <button className={!isExample ? "active" : ""} aria-pressed={!isExample} onClick={() => setSource("real")}>Your results</button>
          <button className={isExample ? "active" : ""} aria-pressed={isExample} onClick={() => setSource("example")}>Example data</button>
        </div>
        {!isExample && <button className="btn" onClick={load}><IconRefresh />Reload</button>}
      </div>
    </header>
  );
  const exampleBanner = isExample && (
    <div className="alert alert-warning">
      <b>Example data.</b> These numbers are invented to preview this page. They were not measured and must not be reported.
    </div>
  );

  if (error) return <>{header}<div className="alert alert-error">{error}</div></>;
  if (!bench) return header;
  if (!bench.available || models.length === 0)
    return <>{header}<EmptyState registry={registry} failed={(bench.models ?? []).filter((m) => m.error)} onExample={() => setSource("example")} /></>;

  const ts = bench.test_set!;
  const alerts: { tone: string; text: string }[] = [];
  if (bench.leakage?.checked && (bench.leakage.count ?? 0) > 0)
    alerts.push({ tone: "error", text: `${bench.leakage.count} test images look like copies of training images, so scores may be inflated.` });
  if (ts.images_without_annotations === 0)
    alerts.push({ tone: "warning", text: "The test set has no defect-free images, so false rejects can't be measured." });
  if (ts.n_images < 50)
    alerts.push({ tone: "warning", text: `Only ${ts.n_images} test images. Small differences between models aren't meaningful.` });

  return (
    <>
      {header}
      {exampleBanner}
      {alerts.map((a, i) => <div key={i} className={`alert alert-${a.tone}`}>{a.text}</div>)}

      <div className="models-layout">
        <section className="card model-list">
          <div className="card-header"><h2>Trained models</h2>{isExample && <span className="badge badge-review">Example</span>}</div>
          <ul>
            {models.map((m) => (
              <li key={m.name}>
                <button className={m.name === current?.name ? "active" : ""} onClick={() => setSelected(m.name)}>
                  <span className="swatch" style={{ background: color(m.name) }} />
                  <span className="model-list-name">
                    {m.name}
                    <span className="muted">{[m.meta.architecture, m.meta.precision].filter(Boolean).join(" · ") || "–"}</span>
                  </span>
                  <span className="model-list-score">{pct(m.coco?.map50)}</span>
                  {m.name === activeModel && <span className="badge badge-pass">On line</span>}
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">Score shown: detection accuracy (mAP@50).</p>
        </section>

        {current && (
          <ModelDetail m={current} models={models} color={color} reject={bench.policy!.reject_threshold} isExample={isExample}
            isActive={current.name === activeModel} canUse={!isExample && loaded.has(current.name)} onUse={() => onUseModel(current.name)} />
        )}
      </div>

      <section className="card">
        <div className="card-header"><h2>All models side by side</h2></div>
        <CompareTable models={models} color={color} />
      </section>
    </>
  );
}

function ModelDetail({ m, models, color, reject, isActive, canUse, onUse, isExample }: {
  m: BenchModel; models: BenchModel[]; color: (n: string) => string; reject: number;
  isActive: boolean; canUse: boolean; onUse: () => void; isExample: boolean;
}) {
  const pr = m.pr_at_threshold?.overall;
  const il = m.image_level;
  const best = (get: (x: BenchModel) => number | null | undefined, higher = true) => {
    const vals = models.map(get).filter((v): v is number => v != null && !Number.isNaN(v));
    const v = get(m);
    if (v == null || vals.length < 2 || vals.every((x) => x === vals[0])) return false;
    return v === (higher ? Math.max(...vals) : Math.min(...vals));
  };

  const results = [
    { label: "Detection accuracy", value: m.coco?.map50, note: "mAP@50", best: best((x) => x.coco?.map50) },
    { label: "Precision", value: pr?.precision, note: "flagged boxes that are real defects", best: best((x) => x.pr_at_threshold?.overall.precision) },
    { label: "Recall", value: pr?.recall, note: "real defects that were found", best: best((x) => x.pr_at_threshold?.overall.recall) },
    { label: "Defective cells caught", value: il?.defect_catch_rate, note: "sent to review or rejected", best: best((x) => x.image_level?.defect_catch_rate) },
    { label: "Good cells rejected", value: il?.false_reject_rate, note: "lower is better", lowerBetter: true, best: best((x) => x.image_level?.false_reject_rate, false) },
  ];

  const classes = Object.entries(m.coco?.per_class ?? {});
  const clean = m.robustness?.clean?.map50 ?? null;
  const robust = Object.entries(m.robustness ?? {}).filter(([k]) => k !== "clean");

  return (
    <div className="model-detail">
      <section className="card">
        <div className="card-header">
          <div className="model-title">
            <span className="swatch lg" style={{ background: color(m.name) }} />
            <h2>{m.name}</h2>
            {isExample && <span className="badge badge-review">Example data</span>}
            {isActive && <span className="badge badge-pass">Running on the line</span>}
          </div>
          {!isActive && canUse && <button className="btn btn-primary" onClick={onUse}>Use on line</button>}
        </div>
        <div className="card-body">
          <div className="section-label">Traits</div>
          <dl className="traits">
            <div><dt>Architecture</dt><dd>{m.meta.architecture ?? "–"}</dd></div>
            <div><dt>Precision</dt><dd>{m.meta.precision ?? "–"}</dd></div>
            <div><dt>Speed</dt><dd>{ms(m.latency?.mean_ms)} <span className="muted">per image</span></dd></div>
            <div><dt>File size</dt><dd>{m.size_mb != null ? `${m.size_mb.toFixed(1)} MB` : "–"}</dd></div>
            <div><dt>Classes</dt><dd className="cap">{Object.keys(m.coco?.per_class ?? {}).join(", ") || (m.labels ?? []).join(", ") || "–"}</dd></div>
            <div><dt>Geti score</dt><dd>{m.meta.geti_validation_score?.value != null ? `${m.meta.geti_validation_score.value}` : "–"} <span className="muted">reported by Geti</span></dd></div>
          </dl>

          <div className="section-label">Results on the test set</div>
          <div className="results">
            {results.map((r) => (
              <div key={r.label} className="result">
                <div className="result-label">{r.label}{r.best && <span className="badge badge-accent">Best</span>}</div>
                <div className="result-value">{pct(r.value)}</div>
                <div className="meter"><span className={`meter-fill ${r.lowerBetter ? "fill-reject" : "fill-accent"}`} style={{ width: r.value != null ? `${r.value * 100}%` : 0 }} /></div>
                <div className="result-note">{r.note}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="detail-grid">
        <section className="card">
          <div className="card-header"><h2>Accuracy by defect type</h2></div>
          <div className="card-body">
            {classes.map(([c, v]) => (
              <div key={c} className="meter-row">
                <span className="meter-name cap">{c}</span>
                <span className="meter"><span className="meter-fill fill-accent" style={{ width: `${(v.ap50 || 0) * 100}%` }} /></span>
                <span className="meter-value">{pct(v.ap50)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-header"><h2>When the image changes</h2></div>
          <div className="card-body">
            {robust.length === 0 ? <div className="muted">Not measured.</div> : (
              <>
                <div className="meter-row">
                  <span className="meter-name">Original</span>
                  <span className="meter"><span className="meter-fill fill-accent" style={{ width: `${(clean ?? 0) * 100}%` }} /></span>
                  <span className="meter-value">{pct(clean)}</span>
                </div>
                {robust.map(([k, v]) => {
                  const drop = clean != null ? (v.map50 - clean) * 100 : null;
                  return (
                    <div key={k} className="meter-row">
                      <span className="meter-name">{PERTURB_LABEL[k] ?? k}</span>
                      <span className="meter"><span className="meter-fill fill-muted" style={{ width: `${v.map50 * 100}%` }} /></span>
                      <span className={`meter-value ${drop != null && drop < -5 ? "tone-reject" : ""}`}>
                        {drop != null ? `${drop >= 0 ? "+" : ""}${drop.toFixed(0)} pts` : pct(v.map50)}
                      </span>
                    </div>
                  );
                })}
                <p className="hint">Detection accuracy on altered copies of the test images.</p>
              </>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header"><h2>Reject threshold trade-off</h2></div>
          <div className="card-body"><Sweep rows={m.threshold_sweep ?? []} reject={reject} /></div>
        </section>

        <section className="card">
          <div className="card-header"><h2>Mistakes to review</h2></div>
          <div className="card-body">
            {(m.failures ?? []).length === 0 ? <div className="muted">No missed defects or false rejects.</div> : (
              <ul className="mistakes">
                {m.failures!.map((f) => (
                  <li key={f.file}>
                    <span className={`badge ${f.ground_truth === "defective" ? "badge-reject" : "badge-review"}`}>
                      {f.ground_truth === "defective" ? "Missed" : "False reject"}
                    </span>
                    <span className="mono">{f.file}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="hint mono">Model hash {m.sha256_12}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function CompareTable({ models, color }: { models: BenchModel[]; color: (n: string) => string }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Model</th><th>Type</th>
            <th className="num">Accuracy (mAP@50)</th><th className="num">mAP@50:95</th>
            <th className="num">Precision</th><th className="num">Recall</th>
            <th className="num">Caught</th><th className="num">Good rejected</th>
            <th className="num">Speed</th><th className="num">Size</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.name}>
              <td><span className="swatch" style={{ background: color(m.name) }} />{m.name}</td>
              <td className="muted">{[m.meta.architecture, m.meta.precision].filter(Boolean).join(" · ") || "–"}</td>
              <td className="num">{pct(m.coco?.map50, 1)}</td>
              <td className="num">{pct(m.coco?.map50_95, 1)}</td>
              <td className="num">{pct(m.pr_at_threshold?.overall.precision, 1)}</td>
              <td className="num">{pct(m.pr_at_threshold?.overall.recall, 1)}</td>
              <td className="num">{pct(m.image_level?.defect_catch_rate)}</td>
              <td className="num">{pct(m.image_level?.false_reject_rate)}</td>
              <td className="num">{ms(m.latency?.mean_ms)}</td>
              <td className="num">{m.size_mb != null ? `${m.size_mb.toFixed(1)} MB` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Line chart: share of defective cells caught vs share of good cells rejected, across thresholds.
function Sweep({ rows, reject }: { rows: SweepRow[]; reject: number }) {
  if (!rows.length) return <div className="muted">Not measured.</div>;
  const W = 420, H = 190, L = 40, R = 12, T = 10, B = 28;
  const x = (t: number) => L + t * (W - L - R);
  const y = (v: number) => H - B - v * (H - T - B);
  const line = (key: keyof SweepRow) =>
    rows.filter((r) => r[key] != null).map((r) => `${x(r.threshold)},${y(r[key] as number)}`).join(" ");
  const at = rows.reduce((a, b) => (Math.abs(b.threshold - reject) < Math.abs(a.threshold - reject) ? b : a));
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart">
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="tick">{v * 100}%</text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => <text key={t} x={x(t)} y={H - 8} textAnchor="middle" className="tick">{t}</text>)}
        <line x1={x(reject)} x2={x(reject)} y1={T} y2={H - B} className="marker" />
        <polyline points={line("defect_recall")} className="series series-a" />
        <polyline points={line("false_reject_rate")} className="series series-b" />
        {rows.map((r) => (
          <rect key={r.threshold} x={x(r.threshold) - 8} y={T} width={16} height={H - T - B} fill="transparent">
            <title>{`Threshold ${r.threshold}: caught ${pct(r.defect_recall)}, good rejected ${pct(r.false_reject_rate)}`}</title>
          </rect>
        ))}
      </svg>
      <div className="legend">
        <span><i className="key key-a" />Defective caught <b>{pct(at.defect_recall)}</b></span>
        <span><i className="key key-b" />Good rejected <b>{pct(at.false_reject_rate)}</b></span>
        <span className="muted">at current threshold {reject}</span>
      </div>
    </>
  );
}

function EmptyState({ registry, failed, onExample }: { registry: RegisteredModel[]; failed: BenchModel[]; onExample: () => void }) {
  return (
    <div className="grid two">
      <section className="card">
        <div className="card-header"><h2>No benchmark results yet</h2></div>
        <div className="card-body">
          <ol className="steps">
            <li>Put each model exported from Geti in its own folder, e.g. <code>models\yolox_tiny_fp16\</code></li>
            <li>From the <code>backend</code> folder, run:
              <pre>{`.\\.venv\\Scripts\\python scripts\\benchmark.py \`
  --coco ..\\datasets\\battery\\test\\_annotations.coco.json \`
  --images ..\\datasets\\battery\\test \`
  --train-images ..\\datasets\\battery\\train`}</pre>
            </li>
            <li>Click Reload.</li>
          </ol>
          <div className="empty-example">
            <span className="muted">Want to see the layout first?</span>
            <button className="btn" onClick={onExample}>Preview with example data</button>
          </div>
          {failed.length > 0 && <div className="alert alert-error">Failed to load: {failed.map((f) => `${f.name} (${f.error})`).join("; ")}</div>}
        </div>
      </section>
      <section className="card">
        <div className="card-header"><h2>Models found</h2></div>
        {registry.length === 0 ? <div className="card-body muted">No models in <code>models/</code> yet.</div> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Name</th><th>Status</th><th>Classes</th><th className="num">Size</th></tr></thead>
            <tbody>{registry.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>{r.loaded ? <span className="badge badge-pass">Loaded</span> : <span className="badge badge-reject" title={r.error ?? ""}>Error</span>}</td>
                <td className="cap">{r.labels.join(", ") || "–"}</td>
                <td className="num">{r.size_mb ? `${r.size_mb} MB` : "–"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
