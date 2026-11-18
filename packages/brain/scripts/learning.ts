// What the mushroom body learns (README, Learning).
//
//   node packages/brain/scripts/learning.ts [--part survey,assay,smells,dishes,colours] [--light blue=0.565,...,table=0.65] [--seeds 1,2,3] [--path connectome.bin]
//
// (survey) What reaches the mushroom body through the game's senses: each
// scalar sense alone at full strength for 1 s and every stimulus of the vision
// battery (src/stimuli.ts) with the eyes open, from a fresh brain, seed by
// seed: the mean rate of the Kenyon cells, the MBONs, PAM and PPL1, the share
// of Kenyon cells that fire at all, and how many KC -> MBON synapses the
// stimulus changed.
//
// (assay) Odour conditioning at the KC -> MBON synapses, as Hige et al.
// (2015) did it. The game has no smell, so the odours are a diagnostic input,
// as scripts/olfaction.ts drives them: the ORNs of one glomerulus at 100 Hz
// (DM1, or VA2), appended to the brain and read by nothing. Each trial is a
// fresh brain, eyes shut, at rest: 2 s, a test of each odour (1 s of it after
// 1 s without, then 3 s), 15 s (longer than the learning window), one
// training, 15 s more, and the tests again. Training is one 1-s odour (CS+)
// with the unconditioned stimulus (US) starting 0.2 s in: a loom on both eyes
// (four 0.1-s pulses at 2 Hz, as Hige et al. pulsed the DANs) or sugar (0.8
// s). Controls: the odour 0.5 s after the US ends (backward), 15 s after it
// starts (unpaired), and no US. The other odour (CS-) is never in training.
// Reported, against the same seed and schedule without learning: the
// synapses of the KCs each odour fired in its first test, per compartment,
// after training over before; the MBONs' odour response (spikes during the
// odour less the second before), with learning over without; and the
// commands during each test odour after training, with learning less without.
// Ranges are over seeds and both odours as the CS+.
//
// (smells) The same with the brain's own smell (src/olfaction.ts): ethyl
// acetate and isoamyl acetate at full strength at both antennae.
//
// (colours) How distinct dishes of these brightnesses (--light) are to the
// KCs and to the visual projection neurons that synapse onto them, before any
// learning, and whether each can be told from the bare table: each swings into
// view twice, 15 s apart, and so does one of the table's own brightness. The
// default is the Build kit's colours as the game's eyes measured them at the
// picnic at midday (blue 0.54 to 0.59, yellow 0.35 to 0.47, red 0.16 to 0.34,
// their contrasts with the table 0.14, 0.29 to 0.41 and 0.48 to 0.73: a
// table near 0.65).
//
// (dishes) The same with what the game's eyes would see instead of an odour:
// the Build kit's dishes, their colours made light as the game makes them
// (scripts/ethogram/training.ts, PIECE_LIGHT: blue bright, yellow middling,
// red dark to the fly). Conditioning, blue against yellow: a dish swings into view from the side as the fly turns to
// it (0.5 s) and stays ahead and below (1.5 s), 50 degrees across, on a steady
// floor and sky; the US is sugar or, seen through the eyes as the game's swoop
// would be, a dark disc looming from above. Reported as the assay's, and the
// turn toward a dish held 40 degrees to the right, after training, with
// learning less without: conditioned approach (positive) or avoidance.

import { parseArgs } from "node:util";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../src/node.ts";
import { ODORANTS } from "../src/olfaction.ts";
import { FlyBrain } from "../src/runtime.ts";
import { BATTERY, facetAngles, loom, render, separation } from "../src/stimuli.ts";
import { PIECE_LIGHT, SCENE } from "../../../scripts/ethogram/training.ts";
import type { Stimulus } from "../src/stimuli.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";

const { values } = parseArgs({
  options: {
    part: { type: "string", default: "survey,assay" },
    // The kit's colours as the game's eyes measured them at the picnic at midday, and the table there (their contrasts with it).
    light: { type: "string", default: "blue=0.565,yellow=0.41,red=0.25,table=0.65" },
    seeds: { type: "string", default: "1,2,3" },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
  },
});
const parts = new Set(values.part.split(","));
const seeds = values.seeds.split(",").map(Number);
const c = readConnectomeFile(values.path);
const type = (i: number) => c.columns.type.value(i);
const KC = c.filter((i) => /^KC./.test(type(i)));
const MBON = c.filter((i) => /^MBON/.test(type(i)));
const PAM = c.filter((i) => /^PAM/.test(type(i)));
const PPL1 = c.filter((i) => /^PPL1/.test(type(i)));
const TICK = 10;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const f = (x: number, digits = 2) => x.toFixed(digits);
const range = (xs: number[], digits = 2) => (xs.length === 0 ? "none" : xs.length > 1 ? `${f(Math.min(...xs), digits)}–${f(Math.max(...xs), digits)}` : f(xs[0], digits));

function spikesOf(recording: Uint32Array, neurons: Uint32Array) {
  let n = 0;
  for (const i of neurons) n += recording[i];
  return n;
}

function changed(brain: FlyBrain) {
  let n = 0;
  for (const x of brain.learning!.factors) if (x !== 1) n++;
  return n;
}

if (parts.has("survey")) {
  console.log("(survey) mean Hz over each stimulus (range over seeds); KCs that fired at all; learning synapses changed");
  console.log(["stimulus", "KC Hz", "KCs firing", "MBON Hz", "PAM Hz", "PPL1 Hz", "changed"].join(" | "));
  const scalar: [string, Partial<BrainSenses>][] = [
    ["rest", {}],
    ["sweet", { sweet: 1 }],
    ["touch", { touch: 1 }],
    ["loomLeft", { loomLeft: 1 }],
    ["loomRight", { loomRight: 1 }],
    ["wind", { wind: 1 }],
    ["bumpLeft", { bumpLeft: 1 }],
    ["maleTaste", { maleTaste: 1 }],
    ["wingbeat", { wingbeat: 1, grounded: false }],
    ["everything", { sweet: 1, touch: 1, loomLeft: 1, loomRight: 1, wind: 1, bumpLeft: 1, bumpRight: 1, maleTaste: 1, wingbeat: 1 }],
  ];
  const row = (name: string, results: { kc: number; firing: number; mbon: number; pam: number; ppl1: number; changed: number }[]) =>
    console.log(
      [
        name,
        range(results.map((r) => r.kc), 3),
        range(results.map((r) => 100 * r.firing), 1) + "%",
        range(results.map((r) => r.mbon)),
        range(results.map((r) => r.pam)),
        range(results.map((r) => r.ppl1)),
        range(results.map((r) => r.changed), 0),
      ].join(" | "),
    );
  const measure = (brain: FlyBrain, ms: number) => {
    const r = brain.sim.recording!;
    let firing = 0;
    for (const i of KC) if (r[i] > 0) firing++;
    const hz = (neurons: Uint32Array) => (spikesOf(r, neurons) / neurons.length / ms) * 1000;
    return { kc: hz(KC), firing: firing / KC.length, mbon: hz(MBON), pam: hz(PAM), ppl1: hz(PPL1), changed: changed(brain) };
  };
  for (const [name, senses] of scalar) {
    row(
      name,
      seeds.map((seed) => {
        const brain = new FlyBrain(c, { seed });
        brain.tick(1000, RESTING_SENSES);
        brain.sim.setRecording(true);
        for (let t = 0; t < 1000; t += TICK) brain.tick(TICK, { ...RESTING_SENSES, ...senses });
        return measure(brain, 1000);
      }),
    );
  }
  const steady: Stimulus = { name: "steady scene", seconds: 2, ground: 0.5, eye: "both", scene: () => 0.5 };
  for (const stimulus of [steady, ...BATTERY]) {
    row(
      stimulus.name,
      seeds.map((seed) => {
        const brain = new FlyBrain(c, { seed });
        const angles = facetAngles(brain.eyes!);
        const light = { left: new Float32Array(brain.eyes!.left.directions.length / 3), right: new Float32Array(brain.eyes!.right.directions.length / 3) };
        light.left.fill(stimulus.ground);
        light.right.fill(stimulus.ground);
        for (let t = 0; t < 1000; t += TICK) brain.tick(TICK, { ...RESTING_SENSES, light });
        brain.sim.setRecording(true);
        const steps = Math.round((stimulus.seconds * 1000) / TICK);
        for (let k = 0; k < steps; k++) {
          render(stimulus.scene, (k * TICK) / 1000, angles, light);
          brain.tick(TICK, { ...RESTING_SENSES, light });
        }
        return measure(brain, steps * TICK);
      }),
    );
  }
}

// An odour assay's two odours, and how each is given: what to set up in a new brain, and the senses for an odour (or none) each tick.
type Delivery = { odours: readonly [string, string]; setUp(brain: FlyBrain): (odour: string | null) => Partial<BrainSenses> };
const deliveries: [string, Delivery][] = [];
if (parts.has("assay")) {
  const ORN = { DM1: c.find({ superClass: "cb_sensory", class: "olfactory", type: "ORN_DM1" }), VA2: c.find({ superClass: "cb_sensory", class: "olfactory", type: "ORN_VA2" }) };
  deliveries.push([
    "assay",
    {
      odours: ["DM1", "VA2"],
      setUp(brain) {
        for (const odour of Object.keys(ORN)) brain.sim.addInput(`odour ${odour}`, ORN[odour as keyof typeof ORN]);
        return (odour) => {
          for (const o of Object.keys(ORN)) brain.sim.setRate(`odour ${o}`, o === odour ? 100 : 0);
          return {};
        };
      },
    },
  ]);
}
if (parts.has("smells")) {
  // The brain's own smell (README, Smell): the odour at full strength at both antennae.
  const at = (k: number) => ODORANTS.map((_, j) => (j === k ? 1 : 0));
  const SMELLS: Record<string, number[]> = { "ethyl acetate": at(ODORANTS.indexOf("ethylAcetate")), "isoamyl acetate": at(ODORANTS.indexOf("isoamylAcetate")) };
  deliveries.push([
    "smells",
    { odours: ["ethyl acetate", "isoamyl acetate"], setUp: () => (odour) => (odour === null ? {} : { odor: { left: SMELLS[odour], right: SMELLS[odour] } }) },
  ]);
}
for (const [part, delivery] of deliveries) {
  type Odour = string;
  const US = {
    loom: (t: number) => (t >= 0 && t < 2 && t % 0.5 < 0.1 ? { loomLeft: 1, loomRight: 1 } : {}),
    sugar: (t: number) => (t >= 0 && t < 0.8 ? { sweet: 1 } : {}),
  };
  type Pairing = "forward" | "backward" | "unpaired" | "none";
  // How long each US lasts, s, and so where a backward odour starts: 0.5 s after it (Hige et al. 2015, Figure 1G).
  const usLength = { loom: 1.6, sugar: 0.8 };
  // When the CS+ and the US start in training, s; null: no US.
  const schedule = (us: keyof typeof US, pairing: Pairing): { cs: number; us: number | null } =>
    pairing === "forward" ? { cs: 0, us: 0.2 } : pairing === "backward" ? { cs: usLength[us] + 0.5, us: 0 } : pairing === "unpaired" ? { cs: 15, us: 0 } : { cs: 0, us: null };
  const keys = ["walk", "turn", "back", "escape", "feed"] as const;
  // The MBONs whose compartments each US's DANs teach: PPL1-γ1pedc's and PPL1-γ2α'1's for the loom, PAM-γ4's and PAM-β'2a's for sugar.
  const MBONS = { "MBON-γ1pedc (MBON11)": c.find({ type: "MBON11" }), "MBON-γ2α'1 (MBON12)": c.find({ type: "MBON12" }), "MBON-γ4 (MBON05)": c.find({ type: "MBON05" }), "MBON-γ5β'2a (MBON01)": c.find({ type: "MBON01" }), "all MBONs": MBON };
  // The compartments the loom's DANs (PPL1) and sugar's (PAM-β'2a, PAM-γ4) reach.
  const TAUGHT = ["g1", "g2", "ap1", "ap2", "a2", "ap3", "a3", "g4", "bp2a"];
  type Readout = keyof typeof MBONS;

  // One trial: the odour responses (spikes during the 1-s test odour less the second before) of each MBON group and the commands' means during each test odour, after training.
  const trial = (seed: number, cs: Odour, us: keyof typeof US, pairing: Pairing, learns: boolean) => {
    const brain = new FlyBrain(c, { seed, ...(learns ? {} : { learning: false as const }) });
    const smell = delivery.setUp(brain);
    brain.sim.setRecording(true);
    const r = brain.sim.recording!;
    const count = () => Object.fromEntries(Object.entries(MBONS).map(([name, neurons]) => [name, spikesOf(r, neurons)])) as Record<Readout, number>;
    // Runs `seconds`, the odour on from `odourAt` for 1 s and the US from `usAt` (s from now; null: none), returning each MBON group's spikes and the commands' means.
    const run = (seconds: number, odour: Odour | null, odourAt: number, usAt: number | null) => {
      const before = count();
      const commands = Object.fromEntries(keys.map((k) => [k, 0])) as Record<(typeof keys)[number], number>;
      const steps = Math.round((seconds * 1000) / TICK);
      for (let k = 0; k < steps; k++) {
        const t = (k * TICK) / 1000;
        const on = odour !== null && t >= odourAt && t < odourAt + 1;
        const smelled = smell(on ? odour : null);
        const state = brain.tick(TICK, { ...RESTING_SENSES, ...smelled, ...(usAt === null ? {} : US[us](t - usAt)) });
        for (const key of keys) commands[key] += state.command[key] / steps;
      }
      const after = count();
      const spikes = Object.fromEntries(Object.keys(MBONS).map((name) => [name, after[name as Readout] - before[name as Readout]])) as Record<Readout, number>;
      return { spikes, commands };
    };
    const test = (odour: Odour) => {
      const base = run(1, null, 0, null);
      const on = run(1, odour, 0, null);
      run(3, null, 0, null);
      const response = Object.fromEntries(Object.keys(MBONS).map((name) => [name, on.spikes[name as Readout] - base.spikes[name as Readout]])) as Record<Readout, number>;
      return { response, commands: on.commands };
    };
    const other: Odour = cs === delivery.odours[0] ? delivery.odours[1] : delivery.odours[0];
    run(2, null, 0, null);
    // The KCs each odour fires in its first test.
    const responding = (odour: Odour) => {
      const before = Uint32Array.from(KC, (i) => r[i]);
      test(odour);
      return new Set(KC.filter((i, k) => r[i] > before[k]));
    };
    const plusKCs = responding(cs);
    const minusKCs = responding(other);
    // Longer than the learning window, so the tests' odours are over for it before training starts, and its traces are gone after.
    run(15, null, 0, null);
    const before = brain.learning ? Float64Array.from(brain.learning.factors) : null;
    const when = schedule(us, pairing);
    run(when.cs + 1 + 15, cs, when.cs, when.us);
    // Each taught compartment's synapses (both hemispheres) from the KCs of each odour: their mean factor after training over before it.
    const synapses = (kcs: Set<number>) => {
      const sums = Object.fromEntries(TAUGHT.map((id) => [id, { total: 0, n: 0 }]));
      const learning = brain.learning;
      if (learning && before) {
        learning.edges.forEach((_, p) => {
          if (!kcs.has(learning.kcs[learning.edgeKC[p]])) return;
          const g = learning.edgeGate[p];
          for (let m = learning.gatePtr[g]; m < learning.gatePtr[g + 1]; m++) {
            const id = learning.compartments[learning.gateCompartments[m]].split(" ")[0];
            if (!(id in sums)) continue;
            sums[id].total += learning.factors[p] / before[p];
            sums[id].n++;
          }
        });
      }
      return Object.fromEntries(TAUGHT.map((id) => [id, sums[id].n > 0 ? sums[id].total / sums[id].n : NaN]));
    };
    const weights = { plus: synapses(plusKCs), minus: synapses(minusKCs) };
    return { plus: test(cs), minus: test(other), weights, changed: brain.learning ? changed(brain) : 0 };
  };

  console.log(`\n(${part}) After training, learning on against the same brain without it (same seed and schedule). Response: an MBON group's spikes during the 1-s test odour less the second before, on / off. Commands: on - off during the test odour. CS+ then CS-; range over seeds and both odours as CS+.`);
  for (const us of ["loom", "sugar"] as const) {
    for (const pairing of ["forward", "backward", "unpaired", "none"] as const) {
      if (us === "sugar" && pairing === "none") continue;
      const rows: { on: ReturnType<typeof trial>; off: ReturnType<typeof trial> }[] = [];
      for (const seed of seeds) for (const cs of delivery.odours) rows.push({ on: trial(seed, cs, us, pairing, true), off: trial(seed, cs, us, pairing, false) });
      console.log(`${pairing === "none" ? "no US" : `${us}, ${pairing}`}: synapses changed ${range(rows.map((x) => x.on.changed), 0)}`);
      for (const side of ["plus", "minus"] as const) {
        console.log(`  synapses of the ${side === "plus" ? "CS+" : "CS-"}'s KCs, after training / before: ` + TAUGHT.map((id) => `${id} ${f(mean(rows.map((x) => x.on.weights[side][id])))} (${range(rows.map((x) => x.on.weights[side][id]))})`).join(", "));
      }
      for (const name of Object.keys(MBONS) as Readout[]) {
        const ratio = (side: "plus" | "minus") => rows.map((x) => x.on[side].response[name] / Math.max(1, x.off[side].response[name]));
        console.log(`  ${name}: CS+ ${f(mean(ratio("plus")))} (${range(ratio("plus"))}; off ${range(rows.map((x) => x.off.plus.response[name]), 0)} spikes), CS- ${f(mean(ratio("minus")))} (${range(ratio("minus"))})`);
      }
      for (const side of ["plus", "minus"] as const) {
        console.log(`  commands, ${side === "plus" ? "CS+" : "CS-"}: ` + keys.map((k) => `${k} ${f(mean(rows.map((x) => x.on[side].commands[k] - x.off[side].commands[k])), 3)} (${range(rows.map((x) => x.on[side].commands[k] - x.off[side].commands[k]), 3)})`).join(", "));
      }
    }
  }
}

if (parts.has("dishes")) {
  // The Build kit's dishes, as bright as each colour is to the fly, on the training assay's floor (scripts/ethogram/training.ts).
  const DISHES = { blue: PIECE_LIGHT["dish-blue"], yellow: PIECE_LIGHT["dish-yellow"], red: PIECE_LIGHT["tile-red"] };
  type Dish = keyof typeof DISHES;
  const TABLE = SCENE.floor;
  const SKY = SCENE.sky;
  const ground = (_t: number, _az: number, el: number) => (el < 0 ? TABLE : SKY);
  // A dish 50 degrees across, 35 below the horizon, its centre at azimuth `az`.
  const dish = (colour: Dish, az: number) => (t: number, a: number, e: number) => (separation(a, e, az, -35) <= 25 ? DISHES[colour] : ground(t, a, e));
  // It swings in from 100 degrees to `to` over 0.5 s, stays 1.5 s, swings out again over 0.5 s.
  const arriving = (colour: Dish, to: number) => (t: number, a: number, e: number) => {
    const az = t < 0.5 ? 100 + (to - 100) * (t / 0.5) : t < 2 ? to : t < 2.5 ? to + (100 - to) * ((t - 2) / 0.5) : 100;
    return dish(colour, az)(t, a, e);
  };
  const swoop = loom("", 0, 45, 0.04);
  const US = {
    sugar: (t: number) => (t >= 0 && t < 0.8 ? { sweet: 1 } : {}),
    swoop: () => ({}),
  };
  type Pairing = "forward" | "unpaired" | "none";
  const keys = ["walk", "turn"] as const;

  const trial = (seed: number, cs: Dish, us: keyof typeof US, pairing: Pairing, learns: boolean) => {
    const brain = new FlyBrain(c, { seed, ...(learns ? {} : { learning: false as const }) });
    const angles = facetAngles(brain.eyes!);
    const view = { left: new Float32Array(brain.eyes!.left.directions.length / 3), right: new Float32Array(brain.eyes!.right.directions.length / 3) };
    brain.sim.setRecording(true);
    const r = brain.sim.recording!;
    // Runs `seconds` of this scene, the US from `usAt` (s from now; null: none), returning the commands' means over [from, to) s.
    const run = (seconds: number, scene: (t: number, a: number, e: number) => number, usAt: number | null, from = 0, to = seconds) => {
      const commands = { walk: 0, turn: 0 };
      const steps = Math.round((seconds * 1000) / TICK);
      for (let k = 0; k < steps; k++) {
        const t = (k * TICK) / 1000;
        const looming = us === "swoop" && usAt !== null && t >= usAt && t - usAt < swoop.seconds;
        render(looming ? (_t, a, e) => Math.min(scene(t, a, e), swoop.scene(t - usAt!, a, e)) : scene, t, angles, view);
        const state = brain.tick(TICK, { ...RESTING_SENSES, light: view, ...(usAt === null ? {} : US[us](t - usAt)) });
        if (t >= from && t < to) for (const key of keys) commands[key] += state.command[key] / Math.round(((to - from) * 1000) / TICK);
      }
      return commands;
    };
    const responding = (colour: Dish) => {
      const before = Uint32Array.from(KC, (i) => r[i]);
      run(2.5, arriving(colour, 0), null);
      run(3, ground, null);
      return new Set(KC.filter((i, k) => r[i] > before[k]));
    };
    const other: Dish = cs === "blue" ? "yellow" : "blue";
    run(2, ground, null);
    const plusKCs = responding(cs);
    const minusKCs = responding(other);
    run(15, ground, null);
    const before = brain.learning ? Float64Array.from(brain.learning.factors) : null;
    if (pairing === "unpaired") {
      run(15, ground, 0);
      run(2.5, arriving(cs, 0), null);
    } else run(2.5, arriving(cs, 0), pairing === "forward" ? 0.7 : null);
    run(15, ground, null);
    const synapses = (kcs: Set<number>) => {
      const learning = brain.learning;
      let total = 0;
      let n = 0;
      if (learning && before) learning.factors.forEach((f, p) => {
        if (!kcs.has(learning.kcs[learning.edgeKC[p]])) return;
        total += f / before[p];
        n++;
      });
      return n > 0 ? total / n : NaN;
    };
    // The test: the dish swings in to 40 degrees right and stays; the turn toward it while it stays.
    const test = (colour: Dish) => {
      const commands = run(2.5, arriving(colour, 40), null, 0.5, 2);
      run(3, ground, null);
      return commands;
    };
    return { kcs: [plusKCs.size, minusKCs.size], weights: [synapses(plusKCs), synapses(minusKCs)], plus: test(cs), minus: test(other) };
  };

  console.log(`\n(dishes) luminance to the fly: blue dish ${f(DISHES.blue)}, yellow dish ${f(DISHES.yellow)}, red ${f(DISHES.red)}, floor ${f(TABLE)}, sky ${f(SKY)}. KCs: of ${KC.length}, how many each dish fired. Synapses: the mean over every learning synapse of those KCs, after training / before. Turn toward the test dish (40 degrees right) and walk: learning on - off. Ranges over seeds and both dishes as CS+.`);
  for (const us of ["sugar", "swoop"] as const) {
    for (const pairing of ["forward", "unpaired", "none"] as const) {
      if (us === "swoop" && pairing === "none") continue;
      const rows: { on: ReturnType<typeof trial>; off: ReturnType<typeof trial> }[] = [];
      for (const seed of seeds) for (const cs of ["blue", "yellow"] as const) rows.push({ on: trial(seed, cs, us, pairing, true), off: trial(seed, cs, us, pairing, false) });
      const d = (side: "plus" | "minus", key: (typeof keys)[number]) => rows.map((x) => x.on[side][key] - x.off[side][key]);
      console.log(
        `${pairing === "none" ? "no US" : `${us}, ${pairing}`}: KCs firing CS+ ${range(rows.map((x) => x.on.kcs[0]), 0)}, CS- ${range(rows.map((x) => x.on.kcs[1]), 0)}; ` +
          `synapses CS+ ${range(rows.map((x) => x.on.weights[0]).filter((x) => !Number.isNaN(x)), 3)}, CS- ${range(rows.map((x) => x.on.weights[1]).filter((x) => !Number.isNaN(x)), 3)}; ` +
          `turn toward CS+ ${f(mean(d("plus", "turn")), 3)} (${range(d("plus", "turn"), 3)}), CS- ${f(mean(d("minus", "turn")), 3)} (${range(d("minus", "turn"), 3)}); ` +
          `walk at CS+ ${f(mean(d("plus", "walk")), 3)} (${range(d("plus", "walk"), 3)})`,
      );
    }
  }
}

if (parts.has("colours")) {
  // How distinct the kit's colours are to the KCs, before any learning, and whether each can be told from the bare
  // table: a dish of each brightness (and one of the table's own, which shows nothing) swings in twice, 15 s apart.
  const light = Object.fromEntries(values.light.split(",").map((pair) => {
    const [name, value] = pair.split("=");
    const x = Number(value);
    if (!name || !(x >= 0 && x <= 1)) throw new Error(`--light ${pair}: a name and a brightness from 0 to 1`);
    return [name, x];
  }));
  if (!("table" in light)) throw new Error("--light needs the table's brightness, table=...");
  const TABLE = light.table;
  const SKY = SCENE.sky;
  const ground = (_t: number, _az: number, el: number) => (el < 0 ? TABLE : SKY);
  const arriving = (lum: number) => (t: number, a: number, e: number) => {
    const az = t < 0.5 ? 100 - 100 * (t / 0.5) : t < 2 ? 0 : t < 2.5 ? 100 * ((t - 2) / 0.5) : 100;
    return separation(a, e, az, -35) <= 25 ? lum : ground(t, a, e);
  };
  const inputs = c.filter((i) => {
    if (c.columns.superClass.value(i) !== "visual_projection") return false;
    for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) if (/^KC./.test(type(c.post[e]))) return true;
    return false;
  });
  const cosine = (a: number[], b: number[]) => {
    let ab = 0, aa = 0, bb = 0;
    for (let k = 0; k < a.length; k++) { ab += a[k] * b[k]; aa += a[k] * a[k]; bb += b[k] * b[k]; }
    return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : NaN;
  };
  const colours = Object.keys(light);
  const seen: Record<string, { kcs: number[]; hz: number[]; same: number[]; pairs: Record<string, number[]> }> = Object.fromEntries(colours.map((col) => [col, { kcs: [], hz: [], same: [], pairs: {} }]));
  for (const seed of seeds) {
    const brain = new FlyBrain(c, { seed });
    const angles = facetAngles(brain.eyes!);
    const view = { left: new Float32Array(brain.eyes!.left.directions.length / 3), right: new Float32Array(brain.eyes!.right.directions.length / 3) };
    brain.sim.setRecording(true);
    const r = brain.sim.recording!;
    const show = (scene: (t: number, a: number, e: number) => number, seconds: number) => {
      for (let k = 0; k < Math.round((seconds * 1000) / TICK); k++) {
        render(scene, (k * TICK) / 1000, angles, view);
        brain.tick(TICK, { ...RESTING_SENSES, light: view });
      }
    };
    show(ground, 2);
    const vectors: Record<string, number[][]> = Object.fromEntries(colours.map((col) => [col, []]));
    for (let round = 0; round < 2; round++) {
      for (const colour of colours) {
        const before = Array.from(inputs, (i) => r[i]);
        const kcBefore = Array.from(KC, (i) => r[i]);
        show(arriving(light[colour]), 2.5);
        vectors[colour].push(Array.from(inputs, (i, k) => r[i] - before[k]));
        if (round === 0) {
          seen[colour].kcs.push(KC.filter((i, k) => r[i] > kcBefore[k]).length);
          seen[colour].hz.push(mean(vectors[colour][0]) / 2.5);
        }
        show(ground, 15);
      }
    }
    for (const colour of colours) {
      seen[colour].same.push(cosine(vectors[colour][0], vectors[colour][1]));
      for (const other of colours) if (other !== colour) (seen[colour].pairs[other] ??= []).push(cosine(vectors[colour][0], vectors[other][1]));
    }
  }
  console.log(`\n(colours) as a dish 50 degrees across swings into view (2.5 s) on a table of ${f(TABLE)}, before any learning: the KCs it fires (of ${KC.length}); the ${inputs.length} visual projection neurons that synapse onto KCs, their mean rate, and the cosine similarity of their spike counts with the same dish shown again 15 s later and with each other one shown then (range over seeds). "table" is a dish of the table's own brightness: nothing to see.`);
  for (const colour of colours) {
    const x = seen[colour];
    console.log(`${colour} (${f(light[colour])}): KCs ${range(x.kcs, 0)}; inputs ${range(x.hz)} Hz; again ${range(x.same)}; ` + Object.entries(x.pairs).map(([other, v]) => `against ${other} ${range(v)}`).join(", "));
  }
}
