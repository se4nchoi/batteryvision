import type { Cell, CellState, Metrics } from "../api/client";

// Fixed layout in SVG user units (viewBox 1000 x 330).
const BELT_Y = 165;
const LANES = { PASSED: 70, REVIEW: 165, REJECTED: 260 } as const;
const X = { queueHead: 230, queueGap: 66, moving: 360, inspecting: 500, routing: 640, bin: 905 };

function position(state: CellState, queueIndex: number): { x: number; y: number } {
  switch (state) {
    case "QUEUED":
      return { x: X.queueHead - queueIndex * X.queueGap, y: BELT_Y };
    case "MOVING_TO_INSPECTION":
      return { x: X.moving, y: BELT_Y };
    case "INSPECTING":
      return { x: X.inspecting, y: BELT_Y };
    case "ROUTING":
      return { x: X.routing, y: BELT_Y };
    default:
      return { x: 795, y: LANES[state] };
  }
}

const STATUS_CLASS: Record<string, string> = { PASS: "pass", REJECT: "reject", REVIEW: "review" };

function CellGlyph({ cell }: { cell: Cell }) {
  const tone = cell.status && cell.state !== "INSPECTING" ? STATUS_CLASS[cell.status] : "neutral";
  return (
    <g className={`cell cell-${tone}`}>
      <rect x={-26} y={-13} width={52} height={26} rx={7} className="cell-body" />
      <rect x={26} y={-6} width={5} height={12} rx={1.5} className="cell-cap" />
      <rect x={-26} y={-13} width={52} height={7} rx={4} className="cell-shine" />
      <text y={33} textAnchor="middle" className="cell-id">
        {cell.cell_id.replace("CELL-", "#")}
        {cell.source === "upload" ? " ↑" : ""}
      </text>
    </g>
  );
}

interface Props {
  cells: Cell[];
  running: boolean;
  metrics: Metrics | null;
  message: string | null;
}

export function Conveyor({ cells, running, metrics, message }: Props) {
  let q = 0;
  const placed = cells.map((cell) => ({ cell, pos: position(cell.state, cell.state === "QUEUED" ? q++ : 0) }));
  const inspecting = cells.some((c) => c.state === "INSPECTING");
  const bins = [
    { key: "PASSED", label: "Accepted", count: metrics?.passed ?? 0, tone: "pass" },
    { key: "REVIEW", label: "Review", count: metrics?.review ?? 0, tone: "review" },
    { key: "REJECTED", label: "Rejected", count: metrics?.rejected ?? 0, tone: "reject" },
  ] as const;

  return (
    <div className="conveyor">
      <svg viewBox="0 0 1000 330" className="conveyor-svg" role="img" aria-label="Virtual inspection line">
        <defs>
          <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* stage labels */}
        {[
          { x: 135, t: "Queue" },
          { x: 360, t: "Transfer" },
          { x: 500, t: cells.some((c) => (c.n_views ?? 1) > 1) ? "Camera · 360°" : "Camera" },
          { x: 640, t: "Diverter" },
        ].map((s) => (
          <text key={s.t} x={s.x} y={24} textAnchor="middle" className="stage-label">
            {s.t}
          </text>
        ))}

        {/* main belt */}
        <rect x={30} y={BELT_Y - 17} width={640} height={34} rx={6} className="belt-bg" />
        <line x1={36} y1={BELT_Y} x2={664} y2={BELT_Y} className={running ? "belt-ribs belt-running" : "belt-ribs"} />
        <rect x={30} y={BELT_Y - 17} width={640} height={34} rx={6} className="belt-edge" />
        {[60, 640].map((x) => (
          <circle key={x} cx={x} cy={BELT_Y} r={10} className="roller" />
        ))}

        {/* output lanes */}
        {Object.entries(LANES).map(([k, y]) => (
          <path key={k} d={`M 660 ${BELT_Y} C 720 ${BELT_Y}, 730 ${y}, 790 ${y} L 850 ${y}`}
            className={`lane lane-${k === "PASSED" ? "pass" : k === "REVIEW" ? "review" : "reject"}`} />
        ))}

        {/* camera gantry */}
        <g className={inspecting ? "camera camera-active" : "camera"}>
          <rect x={470} y={40} width={60} height={24} rx={4} className="camera-body" />
          <circle cx={500} cy={64} r={7} className="camera-lens" />
          <polygon points={`488,70 512,70 545,${BELT_Y + 18} 455,${BELT_Y + 18}`} fill="url(#beam)" className="beam" />
          
        </g>

        {/* diverter */}
        <rect x={622} y={BELT_Y - 26} width={36} height={52} rx={5} className="diverter" />

        {/* bins */}
        {bins.map((b) => (
          <g key={b.key} transform={`translate(860 ${LANES[b.key] - 30})`}>
            <rect width={128} height={60} rx={8} className={`bin bin-${b.tone}`} />
            <text x={10} y={20} className="bin-label">{b.label}</text>
            <text x={10} y={48} className={`bin-count tone-${b.tone}`}>{b.count}</text>
          </g>
        ))}

        {/* cells (keyed so CSS transitions animate between positions) */}
        {placed.map(({ cell, pos }) => (
          <g key={cell.cell_id} className="cell-pos" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
            <CellGlyph cell={cell} />
          </g>
        ))}
      </svg>
      {message && <div className="conveyor-message">{message}</div>}
    </div>
  );
}
