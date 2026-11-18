// A mirrored fly is the traced fly reflected: what goes into its brain is
// the other side's, and what comes out is given back to the other side, so
// given mirrored senses it does exactly what the unmirrored fly does,
// reflected. On the mapping, through the wrapper with a stand-in brain, and
// with the real brain (skipped without it: npm run brain:fetch).

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { REGIONS, RESTING_SENSES, facetDirection } from "@fly/brain";
import type { BrainSenses, BrainState, EyeMap } from "@fly/brain";
import { SENSE_ORDER } from "@fly/contracts";
import type { BrainDriver } from "@fly/contracts";
import { Rhythm } from "@fly/body";
import { World } from "@fly/world";
import { EYE_COLUMNS } from "../../../packages/brain/src/eye-columns.ts";
import { DEFAULT_CONNECTOME_PATH } from "../../../packages/brain/src/node.ts";
import { InProcessBrain, brainData } from "../../../scripts/fuzz/brain.ts";
import { MirroredBrain, REGION_MIRROR, handed, mirrorEyes, mirrorName, mirrorSenses, unmirrored } from "../src/brain/mirror.ts";
import { Life } from "../src/life.ts";

const skip = existsSync(DEFAULT_CONNECTOME_PATH) ? false : "run npm run brain:fetch for the real brain";

// Every sense is one the mirror knows: a scalar the native brain is sent (SENSE_ORDER), or a picture or smell of each side.
type Unknown = Exclude<keyof BrainSenses, (typeof SENSE_ORDER)[number] | "light" | "odor">;
const known: [Unknown] extends [never] ? true : Unknown = true;

test("every sense the mirror passes on has its other side among the senses, or no side", () => {
  assert.equal(known, true);
  for (const name of SENSE_ORDER) {
    const other = mirrorName(name);
    assert.ok((SENSE_ORDER as readonly string[]).includes(other), `${name} is felt as ${other}`);
    assert.equal(mirrorName(other), name);
    assert.equal(other === name, !/(Left|Right)$/.test(name), name);
  }
  assert.equal(SENSE_ORDER.filter((n) => n !== mirrorName(n)).length, 16);
});

test("each region is lit as its other side's, and a region with no side as itself", () => {
  REGIONS.forEach((region, r) => {
    const other = REGIONS[REGION_MIRROR[r]];
    assert.equal(REGION_MIRROR[REGION_MIRROR[r]], r);
    if (region.side === "left" || region.side === "right") {
      assert.notEqual(other.side, region.side, region.id);
      assert.equal(other.name, region.name);
      // Both sides drawn on the same scale, so a mirrored fly's glow is the traced fly's, swapped.
      assert.equal(other.fullHz, region.fullHz);
    } else assert.equal(other, region);
  });
});

/** Senses with every side different, and a picture and a smell of each. */
function lopsided(): BrainSenses {
  return {
    ...RESTING_SENSES,
    loomLeft: 0.7, loomRight: 0.1, bumpLeft: 0.4, bumpRight: 0, legsLeft: 0.3, legsRight: 0.6, temperatureLeft: 24, temperatureRight: 26,
    touchEyeLeft: 0.2, touchFrontRight: 0.5, touchOcciputLeft: 0.1, touchMouthpartsRight: 0.9, touchNotum: 0.3, hunger: 0.4, clockMorning: 0.5,
    light: { left: new Float32Array([0.1, 0.2]), right: new Float32Array([0.3, 0.4, 0.5]) },
    odor: { left: [1, 0, 0, 0, 0], right: [0, 0, 0, 0, 0.5] },
  };
}

test("the senses go over to the other side, and back again unchanged", () => {
  const from = lopsided();
  const once = mirrorSenses(from, { ...RESTING_SENSES });
  assert.equal(once.loomLeft, 0.1);
  assert.equal(once.loomRight, 0.7);
  assert.equal(once.touchEyeRight, 0.2);
  assert.equal(once.touchEyeLeft, undefined);
  assert.equal(once.touchMouthpartsLeft, 0.9);
  assert.equal(once.temperatureLeft, 26);
  assert.equal(once.legsRight, 0.3);
  assert.equal(once.touchNotum, 0.3);
  assert.equal(once.hunger, 0.4);
  assert.equal(once.light!.left, from.light!.right);
  assert.equal(once.odor!.right, from.odor!.left);
  const twice = mirrorSenses(once, { ...RESTING_SENSES });
  assert.deepEqual(twice, from);
  // What isn't felt any more is gone from the other side too.
  const without = { ...from };
  delete without.light;
  delete without.odor;
  delete without.temperatureLeft;
  mirrorSenses(without, once);
  assert.equal(once.light, undefined);
  assert.equal(once.odor, undefined);
  assert.equal(once.temperatureRight, undefined);
  assert.equal(once.temperatureLeft, 26);
});

test("what a fly's life sends its brain is all known to the mirror", () => {
  const life = new Life(new World({ floor: { kind: "circle", r: 20 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 30 }), stillBrain());
  life.rhythm = new Rhythm(12);
  life.feelsTemperature = true;
  life.light = { left: new Float32Array(3), right: new Float32Array(3) };
  life.step(1 / 60, 0);
  const handled = new Set<string>([...SENSE_ORDER, "light", "odor"]);
  for (const key of Object.keys(life.sensed)) assert.ok(handled.has(key), key);
});

test("the eyes are exchanged whole, each column looking exactly where its twin in the other eye looks", () => {
  const eye = (side: "left" | "right") => Float32Array.from(EYE_COLUMNS[side].flatMap((row) => facetDirection(side, row[0], row[1])));
  const eyes: EyeMap = { left: { directions: eye("left") }, right: { directions: eye("right") }, acceptance: 0.05 };
  const mirrored = mirrorEyes(eyes);
  assert.equal(mirrored.left.directions.length, eyes.right.directions.length);
  assert.equal(mirrored.right.directions.length, eyes.left.directions.length);
  assert.deepEqual(mirrorEyes(mirrored), eyes);
  // The left's 880 columns all have a twin among the right's 892, looking in exactly the mirrored direction.
  const where = (side: "left" | "right", directions: Float32Array) => new Map(EYE_COLUMNS[side].map((row, k) => [`${row[0]},${row[1]}`, Array.from(directions.subarray(3 * k, 3 * k + 3))]));
  const left = where("left", eyes.left.directions);
  const reflectedRight = where("right", mirrored.left.directions);
  let twins = 0;
  for (const [hex, direction] of left) {
    assert.deepEqual(reflectedRight.get(hex), direction, hex);
    twins++;
  }
  assert.equal(twins, 880);
  assert.equal(reflectedRight.size - twins, 12);
  // Its left eye is on its left.
  for (let i = 0; i < mirrored.left.directions.length; i += 3) assert.ok(mirrored.left.directions[i] < 0.2);
});

/** A brain that answers nothing: for lives that only need to run. */
function stillBrain(): BrainDriver {
  return { status: "running", error: null, neurons: 0, connections: 0, eyes: null, regionRates: new Float32Array(REGIONS.length), state: null, stateAt: 0, tick() {}, dispose() {} };
}

/** A brain that answers each tick with what it was sent, as a native brain does: into the same state, at the time it came. */
class EchoBrain implements BrainDriver {
  status: BrainDriver["status"] = "running";
  error = null;
  neurons = 1;
  connections = 2;
  eyes: EyeMap | null = { left: { directions: new Float32Array([-1, 0, 0]) }, right: { directions: new Float32Array([1, 0, 0, 0.5, 0.5, 0.7]) }, acceptance: 0.1 };
  state: BrainState | null = null;
  stateAt = 0;
  regionRates = new Float32Array(REGIONS.length);
  sent: BrainSenses | null = null;
  readonly #state: BrainState = { command: { walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0, lean: 0 }, stats: { simMs: 0, wallMs: 0, spikes: 0, active: 0, rates: {} } };
  #clock = 0;

  tick(_dt: number, senses: BrainSenses) {
    this.sent = { ...senses };
    const s = this.#state;
    s.command.turn = senses.loomRight - senses.loomLeft;
    s.command.walk = senses.bumpLeft;
    s.stats.spikes = 7;
    s.stats.rates["DNa02 left"] = senses.loomLeft;
    s.stats.rates["DNa02 right"] = senses.loomRight;
    s.stats.rates["vision.looming left"] = senses.bumpLeft;
    s.stats.rates["vision.looming right"] = senses.bumpRight;
    s.stats.rates.MDN = 3;
    REGIONS.forEach((_, r) => (this.regionRates[r] = r));
    this.state = s;
    this.stateAt = ++this.#clock;
  }

  dispose() {}
}

test("through the wrapper: senses go in mirrored, and the answer comes back mirrored, into the same objects", () => {
  const inner = new EchoBrain();
  const brain = new MirroredBrain(inner);
  assert.equal(brain.state, null);
  const eyes = brain.eyes;
  assert.deepEqual(Array.from(eyes!.left.directions), [-1, 0, 0, -0.5, 0.5, 0.7].map(Math.fround));
  assert.equal(brain.eyes, eyes, "the same eyes, so the game samples them once");
  brain.tick(16, { ...RESTING_SENSES, loomLeft: 0.8, loomRight: 0.2, bumpRight: 0.6 });
  assert.equal(inner.sent!.loomRight, 0.8);
  assert.equal(inner.sent!.bumpLeft, 0.6);
  const state = brain.state!;
  // The brain turned toward the side it felt the loom more on, its right: the body's left.
  assert.ok(Math.abs(state.command.turn + 0.6) < 1e-12);
  assert.equal(state.command.walk, 0.6);
  assert.equal(state.stats.spikes, 7);
  assert.equal(state.stats.rates["DNa02 left"], 0.8);
  assert.equal(state.stats.rates["vision.looming left"], 0);
  assert.equal(state.stats.rates["vision.looming right"], 0.6);
  assert.equal(state.stats.rates.MDN, 3);
  REGIONS.forEach((_, r) => assert.equal(brain.regionRates[r], REGION_MIRROR[r]));
  brain.tick(16, { ...RESTING_SENSES, loomLeft: 0.1 });
  assert.equal(brain.state, state, "answered into the same state");
  assert.ok(Math.abs(state.command.turn + 0.1) < 1e-12);
  assert.equal(state.stats.rates["DNa02 left"], 0.1);
  // Tried again: no state until the brain answers again, and new eyes.
  inner.state = null;
  inner.eyes = { left: inner.eyes!.right, right: inner.eyes!.left, acceptance: 0.1 };
  assert.equal(brain.state, null);
  assert.notEqual(brain.eyes, eyes);
  assert.equal(handed(inner, false), inner);
  assert.equal(unmirrored(handed(inner, true)), inner);
});

test("the real brain behind the mirror, given mirrored senses, does exactly what it does unmirrored, reflected", { skip }, () => {
  const data = brainData();
  const plain = new InProcessBrain(data, 2);
  const mirrored = new MirroredBrain(new InProcessBrain(data, 2));
  const eyes = plain.eyes!;
  assert.deepEqual(mirrored.eyes, mirrorEyes(eyes));
  // A dark disc grows in the left eye while the antenna and legs on that side are pushed and step; the right eye sees grey.
  const light = { left: new Float32Array(eyes.left.directions.length / 3), right: new Float32Array(eyes.right.directions.length / 3).fill(0.5) };
  const senses: BrainSenses = { ...RESTING_SENSES, legsLeft: 0.5, legsRight: 0.2, light };
  const reflected: BrainSenses = { ...RESTING_SENSES };
  const DT = 16;
  for (let t = 0; t < 3000; t += DT) {
    const size = t < 1000 ? 0 : Math.min(1, (t - 1000) / 600);
    // Centred where the left eye looks most, 68 degrees left of ahead, on the horizon.
    const d = eyes.left.directions;
    for (let i = 0; i < light.left.length; i++) light.left[i] = -0.927 * d[3 * i] + 0.375 * d[3 * i + 1] > Math.cos(size * 0.8) ? 0.05 : 0.5;
    senses.bumpLeft = t > 2000 && t < 2300 ? 1 : 0;
    senses.touchEyeLeft = t > 2400 && t < 2500 ? 0.8 : 0;
    plain.tick(DT, senses);
    mirrored.tick(DT, mirrorSenses(senses, reflected));
    const a = plain.state!, b = mirrored.state!;
    for (const name of Object.keys(a.command) as (keyof BrainState["command"])[]) {
      assert.equal(b.command[name], name === "turn" ? -a.command.turn : a.command[name], `${name} at ${t} ms`);
    }
    assert.equal(b.stats.spikes, a.stats.spikes, `spikes at ${t} ms`);
    for (const [name, rate] of Object.entries(a.stats.rates)) assert.equal(b.stats.rates[mirrorName(name)], rate, `${name} at ${t} ms`);
    for (let r = 0; r < REGIONS.length; r++) assert.equal(mirrored.regionRates[REGION_MIRROR[r]], plain.regionRates[r]);
  }
  // It saw the loom, and turned.
  assert.ok(plain.state!.stats.rates["vision.looming left"] > 0);
});
