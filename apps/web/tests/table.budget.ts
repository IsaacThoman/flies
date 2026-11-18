// The JavaScript a device spends each frame on a full table, in M5 Pro CPU
// time (scripts/cpuBudget.ts says why, and why npm test runs this alone):
// reading the others' states as they come, 20 times a second; drawing each
// where it was a moment ago, the nearest posed and the rest stand-ins; and
// each of this device's flies meeting the nearest of them. The flies' own
// lives are company.budget.ts's. The Apple TV has no JIT and pays roughly 16
// times this.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { REGIONS } from "@fly/brain";
import type { BrainState } from "@fly/brain";
import type { BrainDriver } from "@fly/contracts";
import { FLIES_MAX, MAX_FLIES, MAX_OWN, SEND_EVERY, createFlyState, decodeFlies, encodeFlies, wireScale } from "@fly/net";
import type { FlyState } from "@fly/net";
import { World, WORLDS } from "@fly/world";
import { CpuMeter, measureBudget, median } from "../../../scripts/cpuBudget.ts";
import { Company } from "../src/company.ts";
import { Life } from "../src/life.ts";
import { OtherFlies, meet } from "../src/online/others.ts";
import { blankCanvas } from "./canvas.ts";

(globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => blankCanvas() }) };

const DT = 1 / 60;
const FRAMES = 1800;
const SAMPLES = 5;

class Still implements BrainDriver {
  readonly status = "running";
  readonly error = null;
  readonly neurons = 0;
  readonly connections = 0;
  readonly eyes = null;
  readonly regionRates = new Float32Array(REGIONS.length);
  stateAt = 0;
  state: BrainState = { command: { walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0, lean: 0 }, stats: { simMs: 0, wallMs: 0, spikes: 0, active: 0, rates: {} } };
  tick() {}
  dispose() {}
}

/**
 * A table with `n` others, each walking its own circle round the place's
 * start, and this device living MAX_OWN. `sample` runs FRAMES of its table
 * work and returns ms of this thread's CPU a frame, as an M5 Pro would spend
 * them, keeping the reference loads it ran beside them in `references`.
 */
function table(n: number, references: number[]) {
  const world = new World(WORLDS.picnic);
  const start = world.place.start;
  const followed = new Life(world, new Still());
  const company = new Company(world, () => new Still());
  company.resize(MAX_OWN - 1, followed.pantry);
  const lives = [followed, ...company.list.map((c) => c.life)];
  const others = new OtherFlies(new THREE.Group(), world);
  others.company = company.list;
  const scale = wireScale(world.place);
  // On the table round the start, which is level: what their devices would say, not worked out here.
  const y = world.heightAt(start.x, start.z, (start.y ?? 0) + 1);
  const states: FlyState[] = [];
  for (let i = 0; i < n; i++) {
    const s = createFlyState();
    s.id = MAX_OWN + 1 + i;
    states.push(s);
    others.join(s.id, "#ff3355", false);
  }
  const batch = new DataView(new ArrayBuffer(FLIES_MAX));
  const scratch = createFlyState();
  let now = 0;
  const heard = (s: FlyState) => others.heard(s, now);
  // Close behind the followed fly, as the camera follows it: the nearest are big enough to pose.
  const camera = new THREE.Vector3(start.x, (start.y ?? 0) + 15, start.z - 30);
  const frame = (i: number) => {
    now = i * DT * 1000;
    if (i % Math.round(SEND_EVERY / (DT * 1000)) === 0) {
      for (let k = 0; k < n; k++) {
        const s = states[k];
        const r = 5 + (k % 16) * 4;
        const a = k * 2.39996 + now / 2000;
        s.t = now;
        s.seq = (s.seq + 1) & 0xffff;
        s.x = start.x + Math.cos(a) * r;
        s.z = start.z + Math.sin(a) * r;
        s.y = y;
        s.yaw = a;
      }
      encodeFlies(batch, scale, states);
      decodeFlies(batch, scale, scratch, heard);
    }
    others.update(now, DT, camera, 1000, followed.body);
    for (const life of lives) meet(life.crowd, life.body, followed.body, company.list, others.list);
  };
  let at = 0;
  for (; at < 600; at++) frame(at);
  return {
    sample() {
      const meter = new CpuMeter();
      for (let i = 0; i < FRAMES; i++) {
        frame(at++);
        // Few laps, each long: every lap runs the reference beside it, and one reference in a hundred slowed by a shared CI host would
        // turn the whole measurement away as contended.
        if (i % 300 === 299) meter.lap();
      }
      references.push(...meter.references);
      return { ms: meter.ms / FRAMES, raw: meter.rawMs / FRAMES };
    },
    posed: () => others.list.filter((o) => o.near).length,
    crowd: () => followed.crowd.count,
    dispose() {
      others.dispose();
      company.dispose();
    },
  };
}

test(`a full table, ${MAX_FLIES - MAX_OWN} other players' flies besides this device's ${MAX_OWN}, costs little JavaScript a frame`, async (t) => {
  const measured = await measureBudget(t, () => {
    const references: number[] = [];
    const small = table(8 - MAX_OWN, references);
    const big = table(MAX_FLIES - MAX_OWN, references);
    const eight = Array.from({ length: SAMPLES }, () => small.sample());
    const full = Array.from({ length: SAMPLES }, () => big.sample());
    const value = { eight: median(eight.map((s) => s.ms)), full: median(full.map((s) => s.ms)), raw: median(full.map((s) => s.raw)), posed: big.posed(), crowd: big.crowd() };
    small.dispose();
    big.dispose();
    return { value, references, samples: [eight.map((s) => s.ms), full.map((s) => s.ms)] };
  });
  if (!measured) return;
  const { eight, full, raw, posed, crowd } = measured;
  console.log(`  a table of eight: ${(eight * 1000).toFixed(0)} M5 Pro CPU µs a frame; of ${MAX_FLIES}: ${(full * 1000).toFixed(0)} (${(raw * 1000).toFixed(0)} here), ${posed} posed, ${crowd} in a fly's crowd`);
  assert.ok(posed > 0 && posed <= MAX_OWN, `${posed} of the others posed`);
  assert.ok(crowd > 0);
  // 66 µs on an M5 Pro in Node 26 (a table of eight, 15): about 1.1 ms a frame on the Apple TV.
  assert.ok(full < 0.115, `${(full * 1000).toFixed(0)} M5 Pro CPU µs a frame; budget 115`);
});
