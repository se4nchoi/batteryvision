export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Map a normalized [x1, y1, x2, y2] box onto an image of the given pixel size. */
export function bboxToRect(bbox: readonly number[], imageWidth: number, imageHeight: number): PixelRect {
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
  const [ax, ay, bx, by] = bbox.map(clamp);
  const x1 = Math.min(ax, bx), x2 = Math.max(ax, bx);
  const y1 = Math.min(ay, by), y2 = Math.max(ay, by);
  return {
    x: x1 * imageWidth,
    y: y1 * imageHeight,
    width: (x2 - x1) * imageWidth,
    height: (y2 - y1) * imageHeight,
  };
}
