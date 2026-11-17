import assert from "node:assert/strict";
import { test } from "node:test";
import { frameFor } from "../src/display.ts";
import { positionLens, sampleLens } from "../src/ui/touch-loupe.ts";

test("the held-tool lens stays outside a fingertip and inside phone and Split View safe areas", () => {
  const at = { x: 0, y: 0, size: 0 };
  for (const [w, h] of [[390, 844], [844, 390], [430, 932], [932, 430], [820, 1180], [1180, 820], [507, 820], [375, 820]]) {
    const safe = { top: h > w ? 59 : 0, bottom: 34, left: h > w ? 0 : 59, right: h > w ? 0 : 59 };
    const frame = frameFor(w, h, safe, true);
    for (const [x, y] of [[0.5, 0.5], [0.01, 0.9], [0.99, 0.9], [0.5, 0.05], [0.5, 0.95]]) {
      positionLens(frame, x, y, at);
      assert.equal(at.size, 92);
      const r = at.size / 2;
      assert.ok(at.x - r >= safe.left && at.x + r <= w - safe.right);
      assert.ok(at.y - r >= safe.top && at.y + r <= h - safe.bottom);
      assert.ok(Math.hypot(at.x - x * w, at.y - y * h) >= r + 22, `${w}×${h}: the lens covers the fingertip`);
    }
  }
});


test("clamping a lens sample at screen edges cannot shift the point under its crosshair", () => {
  const at = { x: 0, y: 0, u: 0, v: 0 };
  for (const [w, h] of [[377, 816], [816, 377], [462, 665], [665, 462]]) {
    for (const [x, y] of [[0, 0], [1, 1], [0.01, 0.99], [0.99, 0.01], [0.5, 0.5]]) {
      sampleLens(w, h, x, y, at);
      assert.ok(at.x >= 0 && at.y >= 0 && at.x + 32 <= w && at.y + 32 <= h);
      assert.ok(Math.abs(at.x + at.u * 32 - x * w) < 1e-9);
      assert.ok(Math.abs(at.y + at.v * 32 - (1 - y) * h) < 1e-9);
    }
  }
});
