// Run with: npm test  (Node's built-in test runner; Node >= 23.6 strips TS types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { bboxToRect, type PixelRect } from "./geometry.ts";

const round = (r: PixelRect) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 1e6) / 1e6]));

test("maps normalized box to pixels for a landscape image", () => {
  assert.deepEqual(round(bboxToRect([0.1, 0.25, 0.5, 0.75], 640, 400)), { x: 64, y: 100, width: 256, height: 200 });
});

test("same normalized box scales with image size", () => {
  const a = bboxToRect([0.2, 0.2, 0.6, 0.4], 1000, 500);
  const b = bboxToRect([0.2, 0.2, 0.6, 0.4], 200, 800);
  assert.deepEqual(round(a), { x: 200, y: 100, width: 400, height: 100 });
  assert.deepEqual(round(b), { x: 40, y: 160, width: 80, height: 160 });
});

test("swapped corners and out-of-range values are handled", () => {
  assert.deepEqual(round(bboxToRect([0.5, 0.5, -0.2, 1.4], 100, 100)), { x: 0, y: 50, width: 50, height: 50 });
});
