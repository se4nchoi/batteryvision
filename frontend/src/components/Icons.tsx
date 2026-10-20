// Minimal 24px stroke icons (inline SVG, no icon library).
type P = { size?: number };

function Svg({ size = 16, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className="icon">
      {children}
    </svg>
  );
}

export const IconLine = (p: P) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></Svg>
);
export const IconList = (p: P) => (
  <Svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Svg>
);
export const IconModels = (p: P) => (
  <Svg {...p}><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></Svg>
);
export const IconBatches = (p: P) => (
  <Svg {...p}><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 12l9 4 9-4" /><path d="M3 17l9 4 9-4" /></Svg>
);
export const IconPlay = (p: P) => (
  <Svg {...p}><path d="M7 4l13 8-13 8z" /></Svg>
);
export const IconPause = (p: P) => (
  <Svg {...p}><path d="M8 5v14M16 5v14" /></Svg>
);
export const IconStep = (p: P) => (
  <Svg {...p}><path d="M6 5l9 7-9 7z" /><path d="M19 5v14" /></Svg>
);
export const IconReset = (p: P) => (
  <Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></Svg>
);
export const IconUpload = (p: P) => (
  <Svg {...p}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></Svg>
);
export const IconRefresh = (p: P) => (
  <Svg {...p}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></Svg>
);
