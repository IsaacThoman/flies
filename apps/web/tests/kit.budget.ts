// The JavaScript a frame costs with the most a place keeps built in it, in M5
// Pro CPU time (scripts/cpuBudget.ts says why, and why npm test runs this
// alone): the fly walking round among the pieces, its body meeting them; the
// Build tool in hand, asking where the next piece would go; and the pieces'
// view kept up (built again only when they change, which no frame here does).
// Beside it, the same with nothing built. The Apple TV has no JIT and pays
// roughly 16 times this.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { REGIONS } from "@fly/brain";
import type { BrainState } from "@fly/brain";
import type { BrainDriver } from "@fly/contracts";
import { MAX_PIECES, PICNIC, PIECE_KINDS, World } from "@fly/world";
import { CpuMeter, measureBudget, median } from "../../../scripts/cpuBudget.ts";
import { Life } from "../src/life.ts";
import { picnic } from "../src/places/picnic/index.ts";
import { KitView } from "../src/scene/kit.ts";
import { Daylight } from "../src/scene/light.ts";
import { WeatherNow } from "../src/scene/weather.ts";
import { Builder } from "../src/tools/build.ts";

const DT = 1 / 60;
const FRAMES = 1800;
const SAMPLES = 5;

/** A brain that walks the fly round in a slow circle, so that it meets what is built: its command always fresh at the frames' own clock. */
class Walker implements BrainDriver {
  readonly status = "running";
  readonly error = null;
  readonly neurons = 0;
  readonly connections = 0;
  readonly eyes = null;
  readonly regionRates = new Float32Array(REGIONS.length);
  stateAt = 0;
  state: BrainState = { command: { walk: 0.6, turn: 0.15, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0 }, stats: { simMs: 0, wallMs: 0, spikes: 0, active: 0, rates: {} } };
  tick() {}
  dispose() {}
}

/** The picnic with the most pieces it keeps round where the fly walks: a maze of walls and every other piece, as many as fit. */
function built(full: boolean) {
  const world = new World(PICNIC);
  const builder = new Builder(world, {}, () => {});
  builder.enter("picnic", PICNIC);
  const far = { x: 300, y: 0, z: 0 };
  const start = PICNIC.start;
  for (let ring = 1; full && ring < 12 && builder.pieces.length < MAX_PIECES; ring++) {
    for (let k = 0; k < ring * 6 && builder.pieces.length < MAX_PIECES; k++) {
      const a = (k / (ring * 6)) * Math.PI * 2;
      const kind = PIECE_KINDS[(ring * 7 + k) % PIECE_KINDS.length];
      builder.turns = (k * 3) % 8;
      const at = { x: start.x + Math.cos(a) * ring * 11, y: 0, z: start.z + Math.sin(a) * ring * 11 };
      builder.point(kind, at, false, far, [far], []);
      builder.use(kind, [far], []);
    }
  }
  return { world, builder };
}

/**
 * The fly among what `full` builds, its frames warmed up. Each `sample` runs FRAMES more of them, on from the last,
 * and returns ms of this thread's CPU a frame, as an M5 Pro would spend them: the same place throughout, since a
 * place built again for each sample left garbage whose collection fell inside the next sample's few milliseconds.
 */
function kit(full: boolean) {
  const { world, builder } = built(full);
  const brain = new Walker();
  const life = new Life(world, brain);
  const view = new KitView(new THREE.Scene());
  const light = new Daylight("noon", picnic.palettes);
  const weather = new WeatherNow();
  const flies = [life.body.position];
  const hand = { x: 0, y: 0, z: 0 };
  const met = { on: 0, blocked: 0 };
  const frame = (now: number) => {
    brain.stateAt = now;
    life.step(DT, now);
    if (life.body.surface.solid >= PICNIC.solids.length) met.on++;
    if (life.body.blocked) met.blocked++;
    // The hand just in front of it, as it waits while the fly is followed.
    const p = life.body.position;
    hand.x = p.x + Math.sin(life.body.yaw) * 4;
    hand.z = p.z + Math.cos(life.body.yaw) * 4;
    hand.y = world.heightAt(hand.x, hand.z, p.y + 0.9);
    const aim = builder.point("tile-blue", hand, true, p, flies, life.pantry.foods);
    view.update(builder, aim, false, 1, now / 1000, light, weather, true);
  };
  let at = 0;
  for (; at < 300; at++) frame(at * 16);
  const sample = () => {
    const meter = new CpuMeter();
    for (let i = 0; i < FRAMES; i++) {
      frame(at++ * 16);
      // Few laps, each long: a frame with nothing built is a few microseconds, so laps of 60 held under a millisecond of work beside each reference.
      if (i % 300 === 299) meter.lap();
    }
    return { ms: meter.ms / FRAMES, raw: meter.rawMs / FRAMES, references: meter.references };
  };
  return { sample, pieces: builder.pieces.length, met };
}

test(`with the most a place keeps built (${MAX_PIECES} pieces), a frame costs little more JavaScript than with none`, async (t) => {
  const nothing = kit(false);
  const most = kit(true);
  // The first samples in a process would include the JIT tiering the frame up: one of each runs unmeasured first.
  nothing.sample();
  most.sample();
  const measured = await measureBudget(t, () => {
    const bare = Array.from({ length: SAMPLES }, nothing.sample);
    const full = Array.from({ length: SAMPLES }, most.sample);
    const value = { bare: median(bare.map((s) => s.ms)), full: median(full.map((s) => s.ms)), raw: median(full.map((s) => s.raw)), pieces: most.pieces, met: most.met };
    return { value, references: [...bare, ...full].flatMap((s) => s.references), samples: [bare.map((s) => s.ms), full.map((s) => s.ms)] };
  });
  if (!measured) return;
  const { bare, full, raw, pieces, met } = measured;
  console.log(`  nothing built: ${(bare * 1000).toFixed(1)} M5 Pro CPU µs a frame; ${pieces} pieces: ${(full * 1000).toFixed(1)} (${(raw * 1000).toFixed(1)} here), on them ${met.on} frames and held at them ${met.blocked}`);
  assert.equal(pieces, MAX_PIECES);
  assert.ok(met.on > 0 && met.blocked > 0, "the fly walks onto pieces and into them");
  // 23 µs on an M5 Pro in Node 26 (nothing built, 7): its body clearing so many things near it; about 0.4 ms a frame on the Apple TV.
  assert.ok(full < 0.04, `${(full * 1000).toFixed(1)} M5 Pro CPU µs a frame; budget 40`);
});
