// What the eyes do on the real connectome (skipped without it; see
// behaviour.test.ts). scripts/vision.ts and scripts/report.ts measure the same
// things at more length.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "./node.ts";
import { FlyBrain } from "./runtime.ts";
import { BATTERY, facetAngles, render } from "./stimuli.ts";
import type { Scene } from "./stimuli.ts";
import { RESTING_SENSES } from "./types.ts";
import type { BrainSenses } from "./types.ts";
import { RETINA } from "./vision.ts";

const skip = existsSync(DEFAULT_CONNECTOME_PATH) ? false : `no ${DEFAULT_CONNECTOME_PATH}; run npm run brain:pack`;
const connectome = skip ? undefined : readConnectomeFile();
const TICK = 10;
const stimulus = (name: string) => BATTERY.find((s) => s.name === name)!;

/** A brain with its eyes open, and a way to show it a scene for a while. */
function seeing(seed = 1, retina = RETINA) {
  const brain = new FlyBrain(connectome!, { seed, retina });
  const angles = facetAngles(brain.eyes!);
  const light = { left: new Float32Array(angles.left.az.length), right: new Float32Array(angles.right.az.length) };
  /** Shows the scene for ms (its time running from 0), with these other senses; calls `each` after every tick. */
  const show = (scene: Scene, ms: number, others: BrainSenses = RESTING_SENSES, each?: (state: ReturnType<FlyBrain["tick"]>) => void) => {
    for (let t = 0; t < ms; t += TICK) {
      render(scene, t / 1000, angles, light);
      const state = brain.tick(TICK, { ...others, light });
      each?.(state);
    }
  };
  return { brain, show };
}

test("with the eyes shut the brain is what it was before it had eyes, wherever no columnar cell fires", { skip }, () => {
  // The graded columnar synapses are there with the eyes shut too. These senses
  // never make a columnar cell fire; looming on both sides at once, or
  // everything at full strength, can, and then the runs part (see the README).
  // Spikes per tick under a fixed sequence of senses, seed 1, hashed: measured
  // on the commit before the eyes were added (b373345), and again, with the
  // columnar synapses at 1 as they were then, when Johnston's organ's right
  // half was made to count as much as its left (it changes wind and bump) and
  // when `grounded` was narrowed to the legs' load sensors (it changes rest)
  // and when `sweet` was given the mouth's sugar neurons by what they are:
  // the same as a brain built without eyes, the columnar synapses at 1.
  const b = new FlyBrain(connectome!, { seed: 1 });
  const phases = [
    RESTING_SENSES,
    { ...RESTING_SENSES, loomLeft: 1 },
    { ...RESTING_SENSES, touch: 0.6, wind: 1, grounded: false },
    { ...RESTING_SENSES, sweet: 1, bumpRight: 1 },
    RESTING_SENSES,
  ];
  let total = 0;
  let hash = 0;
  for (const senses of phases) {
    for (let t = 0; t < 1000; t += 16) {
      const spikes = b.tick(16, senses).stats.spikes;
      total += spikes;
      hash = (Math.imul(hash, 31) + spikes) >>> 0;
    }
  }
  assert.deepEqual({ total, hash }, { total: 460567, hash: 2187919625 });
});

test("a dark disc looming at an eye fires the giant fiber through the optic lobe; a passing dot or a receding disc doesn't", { skip }, () => {
  const peak = (name: string) => {
    const s = stimulus(name);
    const { show } = seeing();
    show(() => s.ground, 1000);
    let top = 0;
    show(s.scene, s.seconds * 1000, RESTING_SENSES, (state) => (top = Math.max(top, state.command.escape)));
    return top;
  };
  for (const [name, low, high] of [
    ["loom right", 0.5, 1],
    ["loom right above", 0.5, 1],
    ["dot right, front to back", 0, 0.3],
    ["dot right, upward", 0, 0.3],
    ["recede right", 0, 0.5],
  ] as const) {
    const escape = peak(name);
    assert.ok(escape >= low && escape <= high, `${name}: escape peaked at ${escape}`);
  }
});

test("a steady scene, once adapted to, sends the lamina nothing", { skip }, () => {
  const s = stimulus("static checkerboard");
  const { brain, show } = seeing();
  show((_t, a, e) => s.scene(0, a, e), 20_000);
  for (const side of ["left", "right"] as const) {
    assert.ok(brain.vision!.retina[side].rates.every((rate) => rate === 0), `${side} eye still firing`);
    assert.ok(brain.rates[`vision.lamina ${side}`] < 0.01);
  }
});

test("motion: the right eye's HS cells prefer front-to-back motion and H2 back-to-front, and a rotation turns the fly with it", { skip }, () => {
  const types = { HS: ["HSE", "HSN", "HSS"], H2: ["H2"] };
  const respond = (name: string, seed = 1) => {
    const s = stimulus(name);
    const { brain, show } = seeing(seed);
    show(() => s.ground, 1000);
    brain.sim.setRecording(true);
    let turn = 0;
    let n = 0;
    show(s.scene, s.seconds * 1000, RESTING_SENSES, (state) => {
      turn += state.command.turn;
      n++;
    });
    const rate = (list: string[]) => {
      const cells = connectome!.find({ type: list, side: "right" });
      return cells.reduce((sum, i) => sum + brain.sim.recording![i], 0) / cells.length / s.seconds;
    };
    return { HS: rate(types.HS), H2: rate(types.H2), turn: turn / n };
  };
  const forward = respond("grating right, front to back");
  const backward = respond("grating right, back to front");
  // Less than twice since the ON pathway: T4 adds drive that is only weakly direction selective (README, Seeing).
  assert.ok(forward.HS > 1.3 * backward.HS, `HS: ${forward.HS} Hz front to back, ${backward.HS} back to front`);
  assert.ok(backward.H2 > 2 * forward.H2, `H2: ${backward.H2} Hz back to front, ${forward.H2} front to back`);
  // The optomotor response, weakly: every seed turns more toward its right under a clockwise rotation than an
  // anticlockwise one (measured, seeds 1 to 3: by 0.04, 0.07 and 0.11; README, Seeing).
  const gaps = [1, 2, 3].map((seed) => {
    const clockwise = respond("grating, clockwise", seed);
    const anticlockwise = respond("grating, anticlockwise", seed);
    assert.ok(clockwise.turn > anticlockwise.turn + 0.02, `seed ${seed}: turn ${clockwise.turn} clockwise, ${anticlockwise.turn} anticlockwise`);
    return clockwise.turn - anticlockwise.turn;
  });
  assert.ok(gaps.reduce((a, b) => a + b) / gaps.length > 0.05, `turn ${gaps} more clockwise`);
});

/** Mean rate, Hz, of each cell type of the right eye (both eyes for a stimulus at both) over a stimulus, less the same over its steady ground. */
function rates(name: string, types: readonly string[], retina = RETINA) {
  const s = stimulus(name);
  const sides = s.eye === "both" ? ["left", "right"] : [s.eye];
  const run = (scene: Scene) => {
    const { brain, show } = seeing(1, retina);
    show(() => s.ground, 1000);
    brain.sim.setRecording(true);
    show(scene, s.seconds * 1000);
    return types.map((type) => {
      const cells = connectome!.find({ type, side: sides });
      return cells.reduce((sum, i) => sum + brain.sim.recording![i], 0) / cells.length / s.seconds;
    });
  };
  const live = run(s.scene);
  const control = run(() => s.ground);
  return Object.fromEntries(types.map((type, k) => [type, live[k] - control[k]]));
}

test("brightening reaches the ON pathway through L1's withdrawn release: Mi1, Tm3 and every T4 subtype; without it, nothing", { skip }, () => {
  const types = ["L1", "Mi1", "Tm3", "T4a", "T4b", "T4c", "T4d", "Tm1", "Tm2"];
  const on = rates("brighten", types);
  for (const type of ["Mi1", "Tm3"]) assert.ok(on[type] > 5, `${type} ${on[type]} Hz`);
  for (const type of ["T4a", "T4b", "T4c", "T4d"]) assert.ok(on[type] > 1, `${type} ${on[type]} Hz`);
  // The OFF pathway's columnar cells answer darkening only.
  for (const type of ["Tm1", "Tm2"]) assert.ok(Math.abs(on[type]) < 0.5, `${type} ${on[type]} Hz`);
  const off = rates("brighten", types, { ...RETINA, withdraw: 0 });
  for (const type of types) assert.ok(Math.abs(off[type]) < 0.05, `without withdrawals ${type} ${off[type]} Hz`);
  // L1 itself is quieter, not busier: a withdrawal is not a spike (it fires a little only from L5's feedback).
  assert.ok(on.L1 < on.Mi1, `L1 ${on.L1} Hz`);
});

test("each T4 subtype prefers its own direction in a drifting grating: a front to back, b back to front, c up, d down", { skip }, () => {
  const types = ["T4a", "T4b", "T4c", "T4d"];
  const [forward, backward, up, down] = ["front to back", "back to front", "upward", "downward"].map((way) => rates(`grating right, ${way}`, types));
  assert.ok(forward.T4a > backward.T4a, `T4a ${forward.T4a} against ${backward.T4a} Hz`);
  assert.ok(backward.T4b > forward.T4b, `T4b ${backward.T4b} against ${forward.T4b} Hz`);
  assert.ok(up.T4c > down.T4c, `T4c ${up.T4c} against ${down.T4c} Hz`);
  assert.ok(down.T4d > up.T4d, `T4d ${down.T4d} against ${up.T4d} Hz`);
});

test("no seizures: after a loom, a drifting grating or a flicker, alone and with every other sense at full strength, activity is back in the resting band within 1 s", { skip }, () => {
  const windowRate = (show: ReturnType<typeof seeing>["show"], ground: number) => {
    let spikes = 0;
    show(() => ground, 250, RESTING_SENSES, (state) => (spikes += state.stats.spikes));
    return spikes * 4;
  };
  const reference = seeing();
  reference.show(() => 1, 2000);
  let band = 0;
  for (let w = 0; w < 120; w++) band = Math.max(band, windowRate(reference.show, 1));
  const everything: BrainSenses = { loomLeft: 1, loomRight: 1, touch: 1, bumpLeft: 1, bumpRight: 1, wind: 1, sweet: 1, grounded: false, maleTaste: 1, wingbeat: 1, bitter: 1, water: 1 };
  for (const name of ["loom right fast", "grating, clockwise", "flicker"]) {
    for (const others of [RESTING_SENSES, everything]) {
      const s = stimulus(name);
      const { show } = seeing();
      show(() => s.ground, 1000);
      show(s.scene, s.seconds * 1000, others);
      show(() => s.ground, 750);
      const after = windowRate(show, s.ground);
      assert.ok(after <= band, `${name}${others === everything ? " with everything" : ""}: ${after} spikes/s 1 s after, resting band tops out at ${band}`);
    }
  }
});
