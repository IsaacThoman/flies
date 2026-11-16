import assert from "node:assert/strict";
import { test } from "node:test";
import { ADAPT_GAIN, ADAPT_LEVEL, ADAPT_SECONDS, Adaptation, FACES, createSampler, headToBody, project, sample, standInEyes } from "../src/index.ts";

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

const picture = (v: number) => ({ left: new Float32Array(100).fill(v), right: new Float32Array(100).fill(v) });

test("light adaptation: midday is left alone, a dim picture is raised toward midday's level, by at most ADAPT_GAIN", () => {
  const bright = new Adaptation();
  const day = picture(0.62);
  bright.apply(day, 0.05);
  assert.equal(bright.gain, 1);
  assert.equal(day.left[0], Math.fround(0.62));
  const golden = new Adaptation();
  const evening = picture(0.36);
  golden.apply(evening, 0.05);
  assert.ok(Math.abs(evening.right[0] - ADAPT_LEVEL) < 1e-6, "golden hour's picture is seen at midday's level");
  const night = new Adaptation();
  const dark = picture(0.08);
  night.apply(dark, 0.05);
  assert.equal(night.gain, ADAPT_GAIN);
  assert.ok(Math.abs(dark.left[0] - 0.08 * ADAPT_GAIN) < 1e-6);
  // Contrast is kept: a dark ball on the dusk table stays as dark against it.
  const ball = picture(0.15);
  ball.left[0] = 0.01;
  new Adaptation().apply(ball, 0.05);
  assert.ok(Math.abs(ball.left[0] / ball.left[1] - 0.01 / 0.15) < 1e-6);
  // Nothing goes past white.
  const glare = picture(0.1);
  glare.right[3] = 0.9;
  new Adaptation().apply(glare, 0.05);
  assert.equal(glare.right[3], 1);
});

test("light adaptation is slow: a passing ball barely moves it, and it settles to a new level over seconds", () => {
  const a = new Adaptation();
  a.apply(picture(0.3), 1 / 60);
  const settled = a.gain;
  // A quarter of what the eyes see dark for half a second.
  for (let t = 0; t < 0.5; t += 1 / 60) {
    const passing = picture(0.3);
    passing.right.fill(0.01, 0, 50);
    a.apply(passing, 1 / 60);
  }
  assert.ok(Math.abs(a.gain / settled - 1) < 0.05, `${settled.toFixed(2)} to ${a.gain.toFixed(2)}`);
  // The light goes from dusk to midday: in a frame it hardly changes; after ADAPT_SECONDS several times over, it is midday's.
  const b = new Adaptation();
  b.apply(picture(0.15), 1 / 60);
  b.apply(picture(0.62), 1 / 60);
  assert.equal(b.gain, ADAPT_GAIN);
  for (let t = 0; t < ADAPT_SECONDS * 5; t += 1 / 60) b.apply(picture(0.62), 1 / 60);
  assert.equal(b.gain, 1);
});
