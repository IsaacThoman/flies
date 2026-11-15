import assert from "node:assert/strict";
import { test } from "node:test";
import { FACES, createSampler, headToBody, project, sample, standInEyes } from "../src/index.ts";

const cross = (a: readonly number[], b: readonly number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

test("every face is a proper camera: right × up points back at the viewer", () => {
  for (const face of FACES) {
    const back = cross(face.right, face.up);
    assert.deepEqual(back.map((v) => v + 0), face.forward.map((v) => -v + 0));
  }
});

test("straight ahead is the middle of the first face; the fly's left is its left face", () => {
  const ahead = project(headToBody(0, 1, 0, [0, 0, 0]));
  assert.equal(ahead.face, 0);
  assert.ok(Math.abs(ahead.u - 0.5) < 1e-9 && Math.abs(ahead.v - 0.5) < 1e-9);
  // Its left (head frame -x) lands on the face looking along the body's +x.
  const left = project(headToBody(-1, 0, 0, [0, 0, 0]));
  assert.deepEqual(FACES[left.face].forward, [1, 0, 0]);
  assert.equal(project(headToBody(0, 0, 1, [0, 0, 0])).face, 4);
  assert.equal(project(headToBody(0, 0, -1, [0, 0, 0])).face, 5);
  // Ahead and a little right is right of the middle of the front face.
  const aheadRight = project(headToBody(0.3, 1, 0, [0, 0, 0]));
  assert.equal(aheadRight.face, 0);
  assert.ok(aheadRight.u > 0.6);
  const aheadUp = project(headToBody(0, 1, 0.3, [0, 0, 0]));
  assert.ok(aheadUp.v > 0.6);
});

test("each facet reads the brightness of the face it looks into", () => {
  const R = 8;
  const width = R * FACES.length;
  const pixels = new Uint8Array(width * R * 4);
  // Face k is uniformly k × 40 grey.
  for (let y = 0; y < R; y++) for (let x = 0; x < width; x++) {
    const k = Math.floor(x / R);
    const p = (y * width + x) * 4;
    pixels[p] = pixels[p + 1] = pixels[p + 2] = k * 40;
    pixels[p + 3] = 255;
  }
  const dirs = new Float32Array([0, 1, 0, 1, 0, 0, 0, -1, 0, -1, 0, 0, 0, 0, 1, 0, 0, -1]);
  const out = sample(pixels, createSampler(dirs, R), new Float32Array(6));
  const expected = [0, 1, 2, 3, 4, 5].map((k) => (k * 40) / 255);
  out.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-5, `facet ${i}: ${v} vs ${expected[i]}`));
});

test("the stand-in eyes have about the asked number of facets, each on its own side", () => {
  const eyes = standInEyes(880);
  const left = eyes.left.directions.length / 3;
  const right = eyes.right.directions.length / 3;
  assert.ok(left > 700 && left < 1100, `left ${left}`);
  assert.ok(Math.abs(left - right) < 40);
  for (let i = 0; i < left; i++) {
    const [x, y, z] = eyes.left.directions.subarray(i * 3, i * 3 + 3);
    assert.ok(x < 0.13, "left eye looks left or ahead");
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-5);
  }
});
