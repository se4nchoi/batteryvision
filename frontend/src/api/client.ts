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
}

export interface Cell {
  cell_id: string;
  state: CellState;
  image_url: string;
  source: string;
  status: Status | null;
}

export interface SimState {
  session_id: string;
  mode: Mode;
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
}

export interface SystemStatus {
  mode: Mode;
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
  setMode: (mode: Mode) => post<SimState>("/api/mode", { mode }),
  upload: (file: File, enqueue: boolean) => {
    const form = new FormData();
    form.append("file", file);
    return request<unknown>(`/api/inspect?enqueue=${enqueue}`, { method: "POST", body: form });
  },
};
