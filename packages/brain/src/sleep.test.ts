// Sleep on the real connectome, judged by the body's own thresholds.
// Like behaviour.test.ts, these skip unless the packed connectome is present.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { Behavior } from "../../body/src/behavior.ts";
import type { Intent } from "../../body/src/behavior.ts";
import { FLY_HEIGHT, FLY_LENGTH, HEAD_AHEAD, MOUTH_AHEAD } from "../../body/src/motion.ts";
import { TOUCH_PARTS, press } from "../../body/src/touch.ts";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "./node.ts";
import { FlyBrain } from "./runtime.ts";
import { RESTING_SENSES } from "./types.ts";
import type { BrainSenses } from "./types.ts";

const skip = existsSync(DEFAULT_CONNECTOME_PATH) ? false : `no ${DEFAULT_CONNECTOME_PATH}; run npm run brain:pack`;
const connectome = skip ? undefined : readConnectomeFile();
const TICK = 20;
const SEEDS = [200, 201, 202, 203, 204, 205];
const NIGHT: BrainSenses = { ...RESTING_SENSES, clockSleep: 1, sleepPressure: 0.5, sleepDepth: 1 };

const brain = (seed = 1) => new FlyBrain(connectome!, { seed });
// Moving away: walking, backing, turning or taking off. Grooming in place is counted apart: touch on its
// face grooms a sleeping fly as an awake one, which the sleep gate doesn't hold back (README, Sleep and the daily rhythm).
const movingAway = (i: Intent) => i.walking || i.backing || i.feeding || Math.abs(i.yawRate) > 0.3 || i.takeOff !== null;
const walkingShare = (ms: number, senses: BrainSenses) => {
  const b = brain();
  const behavior = new Behavior();
  let walking = 0;
  let ticks = 0;
  for (let t = 0; t < ms; t += TICK) {
    const intent = behavior.update(b.tick(TICK, senses).command, 0, true, TICK / 1000);
    if (intent.walking) walking++;
    ticks++;
  }
  return walking / ticks;
};

/** Where a touch lands on the fly standing at the origin facing +z, as the body works it out (packages/body touch.ts): a contact at (left, up, ahead) mm. */
function landing(left: number, up: number, ahead: number, reach: number, strength: number): Partial<BrainSenses> {
  const out = new Float64Array(TOUCH_PARTS.length);
  press({ position: { x: 0, y: 0, z: 0 }, yaw: 0, onFeet: true }, left, up, ahead, reach, strength, out);
  return Object.fromEntries(TOUCH_PARTS.map((part, k) => [part, out[k]]));
}
// The game's touches (apps/web): a raindrop (0.5 mm round, 0.25), the feather's tip resting (0.5 mm, 0.4) or stroking
// (brushing 0.5 mm further, 1), on its back where it rests pointed at the fly and at its face where it rests following it.
const FACE = (MOUTH_AHEAD + 0.55) * FLY_LENGTH;
const RAIN_ON_ITS_HEAD = landing(0, FLY_HEIGHT, HEAD_AHEAD * FLY_LENGTH, 0.5, 0.25);
const RAIN_ON_ITS_THORAX = landing(0, FLY_HEIGHT, 0.13 * FLY_LENGTH, 0.5, 0.25);
const FEATHER_ON_ITS_BACK = landing(0, FLY_HEIGHT, 0, 0.5, 0.4);
const STROKING_ITS_FACE = landing(0, FLY_HEIGHT, FACE, 1, 1);
const FACE_BRUSHED = landing(0, FLY_HEIGHT, FACE, 1, 0.6);

type Stimulus = { senses: Partial<BrainSenses>; ms: number };
const trial = (seed: number, depth: number, stimulus: Stimulus) => {
  const b = brain(seed);
  const behavior = new Behavior();
  const senses: BrainSenses = { ...NIGHT, sleepDepth: depth };
  for (let t = 0; t < 20_000; t += TICK) behavior.update(b.tick(TICK, senses).command, 0, true, TICK / 1000);
  const stimulated: BrainSenses = { ...senses, ...stimulus.senses };
  let woke = false;
  let groomed = false;
  let escape = 0;
  for (let t = 0; t < stimulus.ms + 1000; t += TICK) {
    const { command } = b.tick(TICK, t < stimulus.ms ? stimulated : senses);
    const intent = behavior.update(command, 0, true, TICK / 1000);
    if (movingAway(intent)) woke = true;
    if (intent.groom > 0) groomed = true;
    escape = Math.max(escape, command.escape);
  }
  return { seed, woke, groomed, escape };
};
const probe = (name: string, depth: number, stimulus: Stimulus) => {
  const results = SEEDS.map((seed) => trial(seed, depth, stimulus));
  const woken = results.filter((r) => r.woke).length;
  const report = `${name}, depth ${depth}: ${woken}/${SEEDS.length} woken; ${results.map((r) => `seed ${r.seed}: ${r.woke ? "woke" : "still"}${r.groomed ? ", groomed" : ""}, escape ${r.escape.toFixed(3)}`).join("; ")}`;
  console.log(`  ${report}`);
  return { results, woken, report };
};

test("the internal state left out is the brain as it was", { skip }, () => {
  const omitted = brain();
  const explicit = brain();
  const zeros: BrainSenses = { ...RESTING_SENSES, clockMorning: 0, clockEvening: 0, clockSleep: 0, sleepPressure: 0, sleepDepth: 0 };
  for (let t = 0; t < 3000; t += TICK) {
    const a = omitted.tick(TICK, RESTING_SENSES);
    const b = explicit.tick(TICK, zeros);
    assert.equal(a.stats.spikes, b.stats.spikes, `spikes at ${t + TICK} ms`);
    assert.deepEqual(a.stats.rates, b.stats.rates, `rates at ${t + TICK} ms`);
  }
  const { wiring } = omitted;
  assert.deepEqual(wiring.state.map((g) => g.spec.name), ["clock morning", "clock evening", "sleep pressure"]);
  const read = new Set(wiring.readouts.flatMap((g) => [...g.neurons]));
  for (const group of wiring.state) {
    assert.ok(group.neurons.length > 0, `${group.spec.name} has no neurons`);
    for (const i of group.neurons) assert.ok(!read.has(i), `${group.spec.name} neuron ${i} is also read`);
  }
});

test("at night it is still", { skip }, () => {
  const night = walkingShare(180_000, { ...NIGHT, sleepPressure: 0.3 });
  const rest = walkingShare(60_000, RESTING_SENSES);
  console.log(`  Walking: night ${(night * 100).toFixed(1)}% over 3 minutes, no state ${(rest * 100).toFixed(1)}% over 1 minute`);
  assert.ok(night < 0.02, `walking ${(night * 100).toFixed(1)}% of the night`);
  assert.ok(rest > 0.2, `without state: walking ${(rest * 100).toFixed(1)}% of the time`);
});

test("the touches land where they do: a feather on its back is no touch of its head", () => {
  const head = TOUCH_PARTS.filter((part) => /Eye|Front|Occiput|Mouthparts/.test(part));
  for (const part of head) assert.equal(FEATHER_ON_ITS_BACK[part], 0, part);
  assert.ok((FEATHER_ON_ITS_BACK.touchNotum ?? 0) > 0);
  assert.ok((RAIN_ON_ITS_HEAD.touchFrontLeft ?? 0) > 0);
  assert.equal(STROKING_ITS_FACE.touchFrontLeft, 1);
});

test("asleep, a raindrop or the feather on its back doesn't move it, stroking its face and a loom do", { skip }, () => {
  const rain = probe("a raindrop on its thorax", 1, { senses: RAIN_ON_ITS_THORAX, ms: 300 });
  const feather = probe("the feather on its back", 1, { senses: FEATHER_ON_ITS_BACK, ms: 5000 });
  const stroking = probe("stroking its face", 1, { senses: STROKING_ITS_FACE, ms: 3000 });
  const loom = probe("loom", 1, { senses: { loomRight: 1 }, ms: 100 });
  assert.ok(rain.woken <= 1, rain.report);
  assert.ok(feather.woken <= 1, feather.report);
  assert.ok(feather.results.every((r) => !r.groomed), `the feather on its back grooms nothing: ${feather.report}`);
  assert.ok(stroking.woken >= 4, stroking.report);
  for (const result of loom.results) assert.ok(result.escape >= 0.4, loom.report);
});

test("the gate raises the threshold: its face brushed moves a fly that has only stopped away, not a sleeping one", { skip }, () => {
  const stimulus: Stimulus = { senses: FACE_BRUSHED, ms: 3000 };
  const awake = probe("its face brushed at 0.6", 0, stimulus);
  const asleep = probe("its face brushed at 0.6", 1, stimulus);
  const rain = probe("a raindrop on its head", 1, { senses: RAIN_ON_ITS_HEAD, ms: 300 });
  assert.ok(awake.woken >= 4, awake.report);
  assert.ok(asleep.woken <= 1, asleep.report);
  assert.ok(rain.woken <= 1, rain.report);
});
