// The leg solver: segments keep their lengths, the claw reaches targets in
// reach, the knee bends toward its pole, and targets out of reach are
// approached as closely as the leg allows.

import assert from "node:assert/strict";
import { test } from "node:test";
import { LEGS } from "../src/anatomy.ts";
import { solveLeg } from "../src/leg.ts";
import type { LegInput } from "../src/leg.ts";

const unit = (x: number, y: number, z: number) => {
  const l = Math.hypot(x, y, z);
  return new Float64Array([x / l, y / l, z / l]);
};

function input(foot: [number, number, number]): LegInput {
  const spec = LEGS[1];
  const out = Math.hypot(foot[0], foot[2]);
  const [dx, dz] = [foot[0] / out, foot[2] / out];
  return {
    hip: new Float64Array(spec.hip),
    coxaRest: unit(...spec.coxaDir),
    foot: new Float64Array(foot),
    distal: unit(dx * Math.cos(0.14), -Math.sin(0.14), dz * Math.cos(0.14)),
    basal: unit(dx * Math.cos(0.62), -Math.sin(0.62), dz * Math.cos(0.62)),
    pole: new Float64Array(spec.knee),
  };
}

/** Segment origins and the claw, from the frames the solver wrote. */
function points(frames: Float32Array, spec = LEGS[1]) {
  const lengths = [spec.coxa, spec.femur, spec.tibia, spec.basitarsus, spec.tarsus];
  const p: number[][] = [];
  for (let k = 0; k < 5; k++) p.push([frames[k * 12 + 3], frames[k * 12 + 7], frames[k * 12 + 11]]);
  const last = 4 * 12;
  p.push([0, 1, 2].map((r) => frames[last + r * 4] * lengths[4] + frames[last + r * 4 + 3]));
  return { p, lengths };
}

test("reaches targets in reach, with every segment its own length", () => {
  const spec = LEGS[1];
  for (const foot of [[0.53, 0, 0.1], [0.45, 0, 0.3], [0.5, 0, -0.1], [0.4, 0.05, 0.15], [0.6, 0, 0.12]] as [number, number, number][]) {
    const frames = new Float32Array(60);
    const error = solveLeg(spec, input(foot), frames, 0, new Float64Array(3), 0);
    assert.ok(error < 1e-9, `claw within reach of ${foot} (error ${error})`);
    const { p, lengths } = points(frames);
    for (let k = 0; k < 5; k++) {
      const l = Math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1], p[k + 1][2] - p[k][2]);
      assert.ok(Math.abs(l - lengths[k]) < 1e-5, `segment ${k} is ${l}, not ${lengths[k]}`);
    }
    for (let r = 0; r < 3; r++) assert.ok(Math.abs(p[5][r] - foot[r]) < 1e-5);
    // Frames are rotations: orthonormal and right-handed.
    for (let k = 0; k < 5; k++) {
      const m = frames.subarray(k * 12, k * 12 + 12);
      const x = [m[0], m[4], m[8]], y = [m[1], m[5], m[9]], z = [m[2], m[6], m[10]];
      const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      for (const [a, b, want] of [[x, x, 1], [y, y, 1], [z, z, 1], [x, y, 0], [y, z, 0], [x, z, 0]] as [number[], number[], number][]) {
        assert.ok(Math.abs(dot(a, b) - want) < 1e-5);
      }
      const cross = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
      assert.ok(dot(cross, z) > 0.9999, "right-handed");
    }
  }
});

test("the knee bends toward its pole: up and out from the body", () => {
  const frames = new Float32Array(60);
  solveLeg(LEGS[1], input([0.53, 0, 0.1]), frames, 0, new Float64Array(3), 0);
  const { p } = points(frames);
  const [coxaTip, knee, ankle] = [p[1], p[2], p[3]];
  assert.ok(knee[1] > coxaTip[1] && knee[1] > ankle[1], "the knee is the high point of the leg");
  assert.ok(knee[0] > coxaTip[0], "and out to the side of the coxa");
});

test("the knee swings round rather than flipping as its pole passes through the leg", () => {
  const frames = new Float32Array(60), bend = new Float64Array(3);
  const leg = input([0.53, 0, 0.1]);
  let previous: number[] | null = null, worst = 0;
  // Turn the pole right round, through the line of the leg and out the other side.
  for (let k = 0; k <= 200; k++) {
    const a = (k / 200) * Math.PI;
    leg.pole.set([Math.cos(a), Math.sin(a) * 0.2 - 0.3, 0]);
    solveLeg(LEGS[1], leg, frames, 0, bend, 0);
    const knee = [frames[24 + 3], frames[24 + 7], frames[24 + 11]];
    if (previous) worst = Math.max(worst, Math.hypot(knee[0] - previous[0], knee[1] - previous[1], knee[2] - previous[2]));
    previous = knee;
  }
  assert.ok(worst < 0.03, `the knee moved ${worst} in one step`);
});

test("targets out of reach are approached, not stretched to", () => {
  const frames = new Float32Array(60);
  const error = solveLeg(LEGS[1], input([1.5, 0, 0.1]), frames, 0, new Float64Array(3), 0);
  assert.ok(error > 0.5, "reports the shortfall");
  const { p, lengths } = points(frames);
  for (let k = 0; k < 5; k++) {
    const l = Math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1], p[k + 1][2] - p[k][2]);
    assert.ok(Math.abs(l - lengths[k]) < 1e-5);
  }
  for (const v of frames) assert.ok(Number.isFinite(v));
  // Degenerate: a target on top of the hip.
  const hip = LEGS[1].hip;
  solveLeg(LEGS[1], { ...input([0.53, 0, 0.1]), foot: new Float64Array(hip) }, frames, 0, new Float64Array(3), 0);
  for (const v of frames) assert.ok(Number.isFinite(v));
});
