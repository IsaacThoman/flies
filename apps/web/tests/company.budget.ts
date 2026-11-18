// The JavaScript a device spends each frame on the flies it lives beside the
// followed one (Settings → Flies), in M5 Pro CPU time (scripts/cpuBudget.ts
// says why, and why npm test runs this alone). Their brains run off this
// thread (a worker, or the Apple TV's native threads), so it is the rest: each
// fly meeting the others, its senses and its body, its pose, and its model
// posed while it is near the camera. The Apple TV has no JIT and pays roughly
// 16 times this; their eyes take turns with the followed fly's (eyes.ts), so
// they add no refreshes to a frame.

import assert from "node:assert/strict";
import { test } from "node:test";
import { REGIONS } from "@fly/brain";
import type { BrainState } from "@fly/brain";
import type { BrainDriver } from "@fly/contracts";
import { createFly } from "@fly/fly";
import { MAX_OWN } from "@fly/net";
import { World, WORLDS } from "@fly/world";
import { CpuMeter, median } from "../../../scripts/cpuBudget.ts";
import { Company } from "../src/company.ts";
import { Life } from "../src/life.ts";
import { meet } from "../src/online/others.ts";

const DT = 1 / 60;
const FRAMES = 600;
const SAMPLES = 5;

/** A brain that walks the fly round in a slow circle, so that the flies meet and part. */
class Walker implements BrainDriver {
  readonly status = "running";
  readonly error = null;
  readonly neurons = 0;
  readonly connections = 0;
  readonly eyes = null;
  readonly regionRates = new Float32Array(REGIONS.length);
  stateAt = 0;
  state: BrainState = { command: { walk: 0.6, turn: 0.15, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0, lean: 0 }, stats: { simMs: 0, wallMs: 0, spikes: 0, active: 0, rates: {} } };
  tick() {
    this.stateAt = performance.now();
  }
  dispose() {}
}

/** A frame of every fly a device can live, the followed one among them: what it spends on them, ms of this thread's CPU, as an M5 Pro would. */
function frames() {
  const world = new World(WORLDS.picnic);
  const followed = new Life(world, new Walker());
  const company = new Company(world, () => new Walker());
  company.resize(MAX_OWN - 1, followed.pantry);
  // Every one near the camera: the most a frame can pose.
  const models = company.list.map(() => createFly());
  const lives = [followed, ...company.list.map((c) => c.life)];
  const frame = (now: number) => {
    for (const life of lives) meet(life.crowd, life.body, followed.body, company.list, []);
    followed.step(DT, now);
    for (const c of company.list) c.life.step(DT, now);
    company.pose();
    for (let i = 0; i < models.length; i++) models[i].update(company.list[i].pose, DT);
  };
  for (let i = 0; i < 300; i++) frame(i * 16);
  const meter = new CpuMeter();
  for (let i = 0; i < FRAMES; i++) {
    frame((300 + i) * 16);
    if (i % 60 === 59) meter.lap();
  }
  return { ms: meter.ms / FRAMES, raw: meter.rawMs / FRAMES };
}

test(`the ${MAX_OWN} flies a device can live cost little JavaScript a frame`, () => {
  const samples = Array.from({ length: SAMPLES }, frames);
  const ms = median(samples.map((s) => s.ms));
  const raw = median(samples.map((s) => s.raw));
  console.log(`  ${MAX_OWN} flies: ${(ms * 1000).toFixed(0)} M5 Pro CPU µs a frame (${(raw * 1000).toFixed(0)} here) with a JIT; median of ${SAMPLES}`);
  // 19 µs on an M5 Pro in Node 26: about 0.3 ms a frame on the Apple TV.
  assert.ok(ms < 0.034, `${(ms * 1000).toFixed(0)} M5 Pro CPU µs a frame; budget 34`);
});
