export type Mode = "demo" | "live";
export type Status = "PASS" | "REJECT" | "REVIEW";
export type CellState =
  | "QUEUED"
  | "MOVING_TO_INSPECTION"
  | "INSPECTING"
  | "ROUTING"
  | "PASSED"
  | "REJECTED"
  | "REVIEW";

export interface Detection {
  label: string;
  confidence: number;
  bbox: [number, number, number, number]; // normalized x1, y1, x2, y2
  actionable: boolean;
  view: number; // index into InspectionResult.views
}

export interface ViewResult {
  image_url: string;
  image_width: number;
  image_height: number;
  angle: number | null;
  inference_ms: number | null;
}

export interface InspectionResult {
  cell_id: string;
  mode: Mode;
  status: Status;
  reason: string;
  detections: Detection[];
  inference_ms: number | null;
  image_url: string;
  image_width: number;
  image_height: number;
  ground_truth: string | null;
  source: string;
  model_name: string | null;
  model_sha: string | null;
  reject_threshold: number | null;
  review_threshold: number | null;
  explain_url: string | null;
  views: ViewResult[];
  primary_view: number;
}

export interface Cell {
  cell_id: string;
  state: CellState;
  image_url: string;
  source: string;
  status: Status | null;
  n_views: number;
}

export interface SimState {
  session_id: string;
  mode: Mode;
  model: string | null;
  running: boolean;
  tick: number;
  tick_seconds: number;
  cells: Cell[];
  current: InspectionResult | null;
  message: string | null;
}

export interface Metrics {
  total: number;
  passed: number;
  rejected: number;
  review: number;
  observed_reject_rate: number | null;
  avg_inference_ms: number | null;
  measured_inferences: number;
  defect_distribution: Record<string, number>;
  status_history: Status[];
}

export interface InspectionRecord {
  id: number;
  cell_id: string;
  ts: string;
  mode: Mode;
  source: string;
  status: Status;
  reason: string;
  primary_defect: string | null;
  confidence: number | null;
  inference_ms: number | null;
  ground_truth: string | null;
  model_name: string | null;
  model_sha: string | null;
}

export interface SystemStatus {
  mode: Mode;
  model: string | null;
  live_models: string[];
  replay_splits: Record<string, number>; // dataset splits available for annotation replay
  running: boolean;
  live_available: boolean;
  live_error: string | null;
  policy: { reject_threshold: number; review_threshold: number; ignore_labels: string[] };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
  }
  return res.json();
}

const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

export const api = {
  state: () => request<SimState>("/api/simulation/state"),
  status: () => request<SystemStatus>("/api/status"),
  metrics: () => request<Metrics>("/api/metrics"),
  inspections: (limit = 30) => request<InspectionRecord[]>(`/api/inspections?limit=${limit}`),
  start: () => post<SimState>("/api/simulation/start"),
  pause: () => post<SimState>("/api/simulation/pause"),
  step: () => post<SimState>("/api/simulation/step"),
  reset: () => post<SimState>("/api/simulation/reset"),
  setMode: (mode: Mode | "replay", model?: string) => post<SimState>("/api/mode", { mode, model }),
  /** One file = one-view cell; several files = several views (e.g. rotations) of one cell. */
  upload: (files: File | File[], enqueue: boolean) => {
    const form = new FormData();
    (Array.isArray(files) ? files : [files]).forEach((f) => form.append("file", f));
    return request<unknown>(`/api/inspect?enqueue=${enqueue}`, { method: "POST", body: form });
  },
};

// ---- model registry & benchmark (scripts/benchmark.py output) ----------------

export interface ModelMeta {
  architecture?: string;
  precision?: string;
  geti_version?: string;
  geti_validation_score?: { metric?: string; value?: number; split?: string };
  training_minutes?: number;
  notes?: string;
  [key: string]: unknown;
}

export interface RegisteredModel {
  name: string;
  path: string;
  loaded: boolean;
  error: string | null;
  sha256_12: string | null;
  size_mb: number | null;
  labels: string[];
  meta: ModelMeta;
}

export interface PR {
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface SweepRow {
  threshold: number;
  defect_recall: number | null;
  escape_rate: number | null;
  false_reject_rate: number | null;
  box_precision: number | null;
  box_recall: number | null;
}

export interface RobustnessRow {
  map50: number;
  map50_95: number;
  precision: number | null;
  recall: number | null;
  defect_escape_rate: number | null;
  false_reject_rate: number | null;
}

export interface BenchModel {
  name: string;
  path: string;
  error?: string;
  sha256_12?: string;
  size_mb?: number;
  labels?: string[];
  meta: ModelMeta;
  coco?: { map50: number; map50_95: number; per_class: Record<string, { ap50: number; ap50_95: number }> };
  pr_at_threshold?: { threshold: number; overall: PR; per_class: Record<string, PR> };
  image_level?: {
    matrix: Record<"defective" | "no_defect_annotated", Record<Status, number>>;
    defect_escape_rate: number | null;
    false_reject_rate: number | null;
    review_rate: number | null;
    defect_catch_rate: number | null;
  };
  latency?: { n: number; mean_ms: number; median_ms: number; p95_ms: number } | null;
  robustness?: Record<string, RobustnessRow>;
  threshold_sweep?: SweepRow[];
  failures?: { file: string; ground_truth: string; decision: Status; top: [string, number] | null }[];
  by_background?: Record<string, {
    n_images: number; n_defective: number; n_clean: number;
    defect_catch_rate: number | null; false_reject_rate: number | null;
    box_recall: number | null; box_precision: number | null;
  }>;
  unmatched_model_labels?: string[];
}

export interface Benchmark {
  available: boolean;
  example?: boolean; // bundled EXAMPLE data with invented numbers
  path: string;
  generated_at?: string;
  command?: string;
  machine?: { cpu: string; os: string; device: string };
  test_set?: {
    annotations: string;
    n_images: number;
    n_boxes: number;
    boxes_per_class: Record<string, number>;
    images_without_annotations: number;
    backgrounds?: Record<string, number>;
  };
  policy?: { reject_threshold: number; review_threshold: number; ignore_labels: string[] };
  perturbations?: string[];
  leakage?: { checked: boolean; count?: number; test_images?: number; method?: string; near_duplicates?: { test: string; train: string; distance: number }[] };
  models?: BenchModel[];
}

export const modelsApi = {
  registry: () => request<{ active: string | null; models: RegisteredModel[] }>("/api/models"),
  benchmark: (example = false) => request<Benchmark>(`/api/benchmark${example ? "?example=true" : ""}`),
  useModel: (model: string) => post<SimState>("/api/mode", { mode: "live", model }),
};

// ---- batch traceability (/api/batches) ----------------------------------------

export interface LotRow {
  lot_id: string;
  cells: number;
  complete: boolean;
  flagged: number;
  rejected: number;
  review: number;
  rate: number;
  ucl: number | null;
  lcl: number | null;
  out_of_control: boolean;
  defects: Record<string, number>;
  genealogy: Record<string, string>;
}

export interface MachineRow {
  machine: string;
  cells: number;
  lots: number;
  flagged: number;
  rate: number | null;
  rest_rate: number | null;
  lift: number | null;
  p_value: number | null;
  suspect: boolean;
  explained_by?: string;
  defects: Record<string, number>;
}

export interface BatchReport {
  session_id: string;
  process: Record<string, string[]>;
  fault: { step: string; machine: string } | null;
  fault_supported: boolean;
  cells: number;
  flagged: number;
  rate: number | null;
  lot_size: number;
  lots: LotRow[];
  steps: Record<string, MachineRow[]>;
  suspects: (MachineRow & { step: string })[];
}

export const batchApi = {
  report: () => request<BatchReport>("/api/batches"),
  setFault: (step: string | null, machine: string | null) => post<SimState>("/api/simulation/fault", { step, machine }),
  run: (cells: number) => post<SimState>("/api/simulation/run", { cells }),
};
