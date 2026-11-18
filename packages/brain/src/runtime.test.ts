// The runtime on a small synthetic connectome (test-helpers.ts), so these run
// without the real data: decoding, the sense-to-rate mapping, the wiring's
// checks, createBrain end to end and its errors, and determinism.

import assert from "node:assert/strict";
import { test } from "node:test";
import { ConnectomeFormatError, loadConnectome } from "./format.ts";
import { BACKGROUND, BRISTLE_RATE, LEG_RATE, LEG_STEPPING, READOUTS, SCALES, SENSES, SLEEP_GATE, THIRST, WINGBEAT_RATE, backgroundRates, balanceFactor, decode, hungerOf, intensity, outputSynapses, regionRate, senseRates, smooth, thirstOf, waterOutputGain, wire } from "./io.ts";
import { RECEPTORS, STAND_INS } from "./modulation.ts";
import { OPERATING_POINT, buildWeights, completenessFactors } from "./params.ts";
import { REGIONS, REGION_RATE_NAMES } from "./regions.ts";
import { createBrain, FlyBrain, MAX_TICK_MS } from "./runtime.ts";
import { INTERNAL_STATE, InternalState, Wander, normals } from "./state.ts";
import { bufferOf, packSynthetic, syntheticConnectome, syntheticEyeColumns } from "./test-helpers.ts";
import { RESTING_SENSES } from "./types.ts";
import type { BrainSenses } from "./types.ts";
import { VISION_STAGES } from "./vision.ts";

const synthetic = syntheticConnectome();
const load = () => loadConnectome(bufferOf(synthetic.bytes));
const close = (a: number, b: number, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

test("decode turns readout rates into commands with the documented scales", () => {
  const zero = decode({});
  assert.deepEqual(zero, { walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0 });
  const half = decode({
    DNg100: SCALES.walk / 2,
    "DNa02 right": SCALES.turn / 2,
    MDN: SCALES.back / 2,
    DNp01: SCALES.escape / 2,
    flight: SCALES.wings / 2,
    DNg12: SCALES.groom / 2,
    MN9: SCALES.feed / 2,
    pIP10: SCALES.sing / 2,
  });
  for (const value of Object.values(half)) assert.ok(close(value, 0.5));
  // Turning is right minus left, toward the side whose DNa02 fires more.
  assert.ok(close(decode({ "DNa02 left": SCALES.turn / 4 }).turn, -0.25));
  assert.ok(close(decode({ "DNa02 left": 10, "DNa02 right": 10 }).turn, 0));
  // Clamped to the contract's ranges, and nonsense reads as 0.
  const huge = decode({ DNg100: 1e6, "DNa02 left": 1e6, MDN: 1e6, DNp01: 1e6, flight: 1e6, DNg12: 1e6, MN9: 1e6, pIP10: 1e6 });
  assert.deepEqual(huge, { walk: 1, turn: -1, back: 1, escape: 1, wings: 1, groom: 1, feed: 1, sing: 1 });
  assert.equal(decode({ DNg100: Number.NaN }).walk, 0);
  assert.equal(decode({ DNg100: -5 }).walk, 0);
});

test("smoothing follows a step with its time constant, however the time is split", () => {
  assert.ok(close(smooth(0, 1, 100, 100), 1 - Math.exp(-1)));
  let split = 0;
  for (let k = 0; k < 7; k++) split = smooth(split, 1, 100 / 7, 100);
  assert.ok(close(split, 1 - Math.exp(-1), 1e-12));
  assert.equal(smooth(3, 3, 16, 40), 3);
  assert.equal(smooth(2, 9, 0, 40), 2);
});

test("touch drives each region at the stronger of its own and the whole body's, gated in sleep as the other mechanosensory senses", () => {
  const wiring = wire(load());
  const head = wiring.senses.find((g) => g.spec.name === "touch head")!;
  const body = wiring.senses.find((g) => g.spec.name === "touch body")!;
  const region = (group: typeof head, sense: string) => group.spec.regions!.find((r) => r.sense === sense)!;
  const rate = (group: typeof head, sense: string, senses: Partial<BrainSenses>) => regionRate(group, region(group, sense), { ...RESTING_SENSES, ...senses });
  assert.equal(head.maxRate, BRISTLE_RATE);
  assert.equal(body.maxRate, BRISTLE_RATE);
  assert.equal(rate(body, "touchNotum", { touchNotum: 0.5 }), 25);
  assert.equal(rate(body, "touchWings", { touchNotum: 0.5 }), 0, "a part feels only its own touch");
  assert.equal(rate(head, "touchEyeLeft", { touchNotum: 0.5 }), 0);
  assert.equal(rate(head, "touchEyeRight", { touchEyeRight: 0.2, touch: 0.6 }), 30, "the stronger of its own and touch everywhere");
  assert.equal(rate(head, "touchEyeLeft", { touch: 1 }), BRISTLE_RATE);
  assert.equal(rate(body, "touchLegs", { touchLegs: 7 }), BRISTLE_RATE);
  assert.equal(rate(body, "touchLegs", { touchLegs: Number.NaN }), 0);
  assert.equal(rate(body, "touchNotum", { touchNotum: 1, sleepDepth: 1 }), BRISTLE_RATE * (1 - SLEEP_GATE));
  // Every region is its own neurons: the group's, region after region, with none in two.
  for (const group of [head, body]) {
    assert.equal(group.ends!.length, group.spec.regions!.length);
    assert.equal(group.ends!.at(-1), group.neurons.length);
    assert.equal(new Set(group.neurons).size, group.neurons.length);
  }
});

test("each sense drives its groups at its intensity times the stated maximum", () => {
  const wiring = wire(load());
  const at = (senses: Partial<BrainSenses>) => senseRates(wiring, { ...RESTING_SENSES, grounded: false, ...senses });
  const max = new Map(wiring.senses.map((s) => [s.spec.name, s.maxRate]));
  // At rest on the ground only the load sensors fire.
  for (const [name, rate] of senseRates(wiring, RESTING_SENSES)) assert.equal(rate, name === "grounded" ? max.get(name) : 0);
  for (const [name, rate] of at({})) assert.equal(rate, 0, name);
  assert.equal(at({ loomLeft: 1 }).get("loomLeft"), 100);
  assert.equal(at({ loomLeft: 0.25 }).get("loomLeft"), 25);
  assert.equal(at({ loomLeft: 1 }).get("loomRight"), 0);
  assert.equal(at({ sweet: 0.5 }).get("sweet"), 50);
  // Touch's groups have a rate a region (regionRate), not one for the group.
  assert.equal(at({ touch: 1 }).has("touch head"), false);
  // Out of range and nonsense are clamped.
  assert.equal(at({ wind: 7 }).get("wind"), max.get("wind"));
  assert.equal(at({ wind: -1 }).get("wind"), 0);
  assert.equal(at({ wind: Number.NaN }).get("wind"), 0);
  assert.equal(intensity({ ...RESTING_SENSES, grounded: true }, "grounded"), 1);
  assert.equal(intensity({ ...RESTING_SENSES, grounded: false }, "grounded"), 0);
  // Every sense in the contract drives something.
  for (const sense of Object.keys(RESTING_SENSES)) assert.ok(SENSES.some((s) => s.sense === sense), sense);

  const background = backgroundRates(wiring, { left: 0.5, right: 2 });
  assert.equal(background.get("background left"), BACKGROUND[0].maxRate * 0.5);
  assert.equal(background.get("background right"), BACKGROUND[1].maxRate);
});

test("a male's taste drives only the front legs' LgLG1a and LgAG1, picked by root ID, and is added after the eyes", () => {
  const c = load();
  const wiring = wire(c);
  const taste = wiring.senses.find((s) => s.spec.sense === "maleTaste")!;
  assert.deepEqual([...taste.neurons], [...synthetic.index["LgAG1"], ...synthetic.index["LgLG1a"]]);
  assert.ok(!taste.neurons.includes(synthetic.index["LgLG1a mid leg"][0]));
  const after = SENSES.filter((s) => s.afterEyes || s.last);
  assert.deepEqual(after, SENSES.slice(SENSES.length - after.length), "only the last senses come after the eyes");
  const last = SENSES.filter((s) => s.last);
  assert.deepEqual(last, SENSES.slice(SENSES.length - last.length), "and the last of all after them");
  // (seeing.test.ts's fingerprint holds that the inputs before it draw what they drew without it.)
  const brain = new FlyBrain(c, { eyeColumns: syntheticEyeColumns(synthetic) });
  assert.deepEqual([...brain.sim.members("maleTaste")], [...taste.neurons]);
});

test("grounded drives the legs' load sensors, and wingbeat every other campaniform sensillum: the wings' and halteres'", () => {
  const wiring = wire(load());
  const neurons = (sense: string) => [...wiring.senses.find((s) => s.spec.sense === sense)!.neurons];
  assert.deepEqual(neurons("grounded"), synthetic.index["campaniform"]);
  assert.deepEqual(neurons("wingbeat"), synthetic.index["wing campaniform"]);
  assert.equal(senseRates(wiring, { ...RESTING_SENSES, wingbeat: 0.5 }).get("wingbeat"), WINGBEAT_RATE / 2);
});

test("the mouth's taste: sweet, bitter and water each drive their own types, bitter and water added after the eyes", () => {
  const wiring = wire(load());
  const neurons = (sense: string) => [...wiring.senses.find((s) => s.spec.sense === sense)!.neurons];
  assert.deepEqual(neurons("sweet"), synthetic.index["sweet"]);
  assert.deepEqual(neurons("bitter"), synthetic.index["bitter"]);
  assert.deepEqual(neurons("water"), synthetic.index["water"]);
  assert.deepEqual(
    SENSES.filter((s) => s.afterEyes).map((s) => s.sense),
    ["maleTaste", "wingbeat", "bitter", "water"],
  );
  const rates = senseRates(wiring, { ...RESTING_SENSES, bitter: 0.5, water: 2 });
  assert.equal(rates.get("bitter"), 50);
  assert.equal(rates.get("water"), 100);
});

test("each side's legs drive that side's claw, club and hair plate neurons, the unlisted left out; claw and hair plates are full once the legs step", () => {
  const wiring = wire(load());
  for (const [name, organ] of [
    ["claw", "claw"],
    ["club", "club"],
    ["hair plates", "hairPlate"],
  ]) {
    for (const side of ["left", "right"]) assert.deepEqual([...wiring.senses.find((s) => s.spec.name === `${name} ${side}`)!.neurons], synthetic.index[`${organ} ${side}`]);
  }
  const rates = (legsLeft: number) => senseRates(wiring, { ...RESTING_SENSES, legsLeft });
  assert.equal(rates(0).get("claw left"), 0);
  assert.equal(rates(LEG_STEPPING / 2).get("claw left"), LEG_RATE / 2);
  assert.equal(rates(LEG_STEPPING).get("hair plates left"), LEG_RATE);
  assert.equal(rates(0.5).get("claw left"), LEG_RATE);
  assert.equal(rates(0.5).get("club left"), LEG_RATE / 2);
  assert.equal(rates(0.5).get("club right"), 0);
  assert.equal(senseRates(wiring, { ...RESTING_SENSES, legsRight: 1, sleepDepth: 1 }).get("club right"), LEG_RATE * (1 - SLEEP_GATE));
});

test("balancing turns down the side whose neurons make more synapses", () => {
  const c = load();
  const left = synthetic.index["LC10a left"];
  const fewer = left.slice(0, 3);
  assert.equal(balanceFactor(c, fewer, left), 1);
  assert.ok(close(balanceFactor(c, left, fewer), outputSynapses(c, fewer) / outputSynapses(c, left)));
  assert.equal(balanceFactor(c, left, synthetic.index["LC10a right"]), 1);
});

test("the less completely traced side of a Johnston's organ zone counts the other side's synapses", () => {
  const jo = (type: string, side: string) => ({ type, superClass: "cb_sensory", side, nt: "ACH" });
  const c = loadConnectome(
    bufferOf(
      packSynthetic(
        [
          jo("JO-EV1", "left"),
          jo("JO-ED1", "left"),
          jo("JO-EV1", "right"),
          jo("JO-FV", "left"),
          jo("JO-FV", "right"),
          jo("JO-A1", "left"),
          jo("JO-A1", "right"),
          { type: "AMMC001", superClass: "cb_intrinsic", side: "left", nt: "ACH" },
        ],
        [
          [0, 7, 30],
          [1, 7, 30],
          [2, 7, 20],
          [3, 7, 10],
          [4, 7, 15],
          [5, 7, 40],
          [6, 7, 4],
        ],
      ),
    ),
  );
  // Zone E: 60 synapses on the left, 20 on the right. Zone F: 10 against 15. Zone A (sound) is left as it is.
  const factors = completenessFactors(c, OPERATING_POINT.completeness);
  assert.deepEqual([...factors].sort((a, b) => a[0] - b[0]), [
    [2, 3],
    [3, 1.5],
  ]);
  const { gain } = buildWeights(c);
  assert.equal(gain[0], Math.fround(OPERATING_POINT.excitatory));
  assert.equal(gain[2], Math.fround(Math.fround(OPERATING_POINT.excitatory) * 3));
  assert.equal(gain[3], Math.fround(Math.fround(OPERATING_POINT.excitatory) * 1.5));
  assert.equal(gain[6], Math.fround(OPERATING_POINT.excitatory));
});

test("no neuron is both driven and read, and wiring refuses connectomes where one would be", () => {
  const wiring = wire(load());
  const driven = new Set([...wiring.senses, ...wiring.background].flatMap((g) => [...g.neurons]));
  const read = wiring.readouts.flatMap((g) => [...g.neurons]);
  assert.ok(driven.size > 0 && read.length > 0);
  for (const i of read) assert.ok(!driven.has(i), `neuron ${i} is both driven and read`);
  assert.equal(wiring.readouts.length, READOUTS.length);

  // A giant fiber annotated as a visual projection neuron would be in the background.
  const overlapping = syntheticConnectome({ change: { "DNp01 left": { superClass: "visual_projection" } } });
  assert.throws(() => createBrain(bufferOf(overlapping.bytes)), /both driven and read \(readout "DNp01"\)/);
});

test("createBrain runs the synthetic connectome end to end", () => {
  const brain = createBrain(bufferOf(synthetic.bytes), { seed: 3 });
  assert.equal(brain.neurons, synthetic.neurons.length);
  assert.equal(brain.connections > 0, true);
  let state = brain.tick(16, RESTING_SENSES);
  assert.equal(state.stats.simMs, 16);
  assert.ok(state.stats.wallMs >= 0);
  assert.deepEqual(Object.keys(state.stats.rates), [...READOUTS.map((r) => r.name), ...REGION_RATE_NAMES]);
  for (const [key, value] of Object.entries(state.command)) {
    assert.ok(Number.isFinite(value), key);
    assert.ok(value >= (key === "turn" ? -1 : 0) && value <= 1, `${key} ${value}`);
  }
  // Any dt adds up: 0, a fraction of a step, and a 100 ms tick.
  let total = 0;
  for (const dt of [0, 0.4, 0.6, 3.3, 100, 16]) total += brain.tick(dt, RESTING_SENSES).stats.simMs;
  assert.ok(Math.abs(total - 120.3) <= 1, `${total} ms simulated`);

  const run = (senses: Partial<BrainSenses>, ms = 300) => {
    const fresh = createBrain(bufferOf(synthetic.bytes), { seed: 3 });
    for (let t = 0; t < ms; t += 16) state = fresh.tick(16, { ...RESTING_SENSES, ...senses });
    return state;
  };
  const loom = run({ loomRight: 1 });
  assert.ok(loom.command.escape > 0.5, `escape ${loom.command.escape}`);
  assert.ok(loom.command.wings > 0.1, `wings ${loom.command.wings}`);
  assert.ok(loom.stats.rates.DNp01 > 50);
  assert.ok(run({ sweet: 1 }).command.feed > 0.3);
  // In the synthetic wiring bitter reaches MN9 only through an inhibitory interneuron.
  assert.ok(run({ sweet: 1, bitter: 1 }).stats.rates.MN9 < run({ sweet: 1 }).stats.rates.MN9);
  assert.ok(run({ touch: 1 }).command.back > 0.3);
  assert.ok(run({ wind: 1 }).command.groom > 0.3);
  assert.ok(run({ maleTaste: 1 }).command.sing > 0.3);
});

test("createBrain explains what is wrong with a bad buffer or a bad call", () => {
  assert.throws(() => createBrain(new Uint8Array(8) as unknown as ArrayBuffer), ConnectomeFormatError);
  assert.throws(() => createBrain(new ArrayBuffer(4)), /Not a connectome: only 4 bytes/);
  assert.throws(() => createBrain(new TextEncoder().encode("this is not a connectome").buffer), /expected magic "CBUG"/);
  assert.throws(() => createBrain(bufferOf(synthetic.bytes.subarray(0, synthetic.bytes.length - 64))), /Truncated connectome/);
  assert.throws(() => createBrain(bufferOf(syntheticConnectome({ without: ["MN9"] }).bytes)), /no neurons for "MN9"/);
  assert.throws(() => createBrain(bufferOf(syntheticConnectome({ without: ["LPLC2 left", "LC4 left"] }).bytes)), /no neurons for "loomLeft"/);
  assert.throws(() => createBrain(bufferOf(synthetic.bytes), { seed: 1.5 }), /whole number/);
  const brain = createBrain(bufferOf(synthetic.bytes));
  for (const dt of [-1, Number.NaN, MAX_TICK_MS + 1]) assert.throws(() => brain.tick(dt, RESTING_SENSES), /tick takes 0 to/);
});

test("a seed gives the same brain every time; another seed a different one", () => {
  const ticks = (seed: number) => {
    const brain = createBrain(bufferOf(synthetic.bytes), { seed });
    const out: unknown[] = [];
    const senses = [RESTING_SENSES, { ...RESTING_SENSES, loomLeft: 0.7, touch: 0.4 }, { ...RESTING_SENSES, sweet: 1, wind: 0.3 }];
    for (let k = 0; k < 90; k++) {
      const { command, stats } = brain.tick(k % 5 === 0 ? 33 : 16, senses[Math.floor(k / 30)]);
      out.push({ command, spikes: stats.spikes, active: stats.active, rates: stats.rates });
    }
    return out;
  };
  assert.deepEqual(ticks(5), ticks(5));
  assert.notDeepEqual(ticks(5), ticks(6));
});

test("the internal state wanders around 0 with unit spread, reproducibly", () => {
  const wander = new Wander(2, normals(9));
  let sum = 0;
  let squares = 0;
  const n = 200_000;
  for (let k = 0; k < n; k++) {
    const x = wander.step(0.05);
    sum += x;
    squares += x * x;
  }
  assert.ok(Math.abs(sum / n) < 0.1, `mean ${sum / n}`);
  assert.ok(Math.abs(squares / n - 1) < 0.1, `variance ${squares / n}`);
  const a = new InternalState(4);
  const b = new InternalState(4);
  for (let k = 0; k < 100; k++) {
    a.step(0.01);
    b.step(0.01);
  }
  assert.equal(a.level("left"), b.level("left"));
  assert.ok(a.level("left") > 0 && a.level("left") < 1);
  assert.notEqual(a.level("left"), a.level("right"));
  // Off, nothing spontaneous happens.
  const quiet = new FlyBrain(load(), { spontaneous: false });
  for (let t = 0; t < 500; t += 16) assert.equal(quiet.tick(16, { ...RESTING_SENSES, grounded: false }).stats.spikes, 0);
});

test("hunger: left out it is 1, the brain as it was; lower, the sweet neurons pass on less and the background quietens", () => {
  assert.equal(hungerOf(RESTING_SENSES), 1);
  for (const [given, taken] of [[0, 0], [0.25, 0.25], [1, 1], [-3, 0], [7, 1], [Number.NaN, 1], [Number.NEGATIVE_INFINITY, 1]]) {
    assert.equal(hungerOf({ ...RESTING_SENSES, hunger: given }), taken, `hunger ${given}`);
  }
  // Hunger sets the stand-in TH-VUM's rate, whose dopamine on DopEcR sets the sweet neurons' release.
  const factor = (hunger: number) => {
    const brain = new FlyBrain(load());
    brain.tick(0, { ...RESTING_SENSES, hunger });
    const route = brain.modulation.routes.find((r) => r.spec.receptor === "DopEcR")!;
    assert.deepEqual([...route.carriers], synthetic.index.sweet);
    return route.factors![0];
  };
  const [vum] = STAND_INS;
  assert.equal(vum.low + (vum.high - vum.low), RECEPTORS[0].full, "TH-VUM starved engages DopEcR fully");
  assert.equal(factor(1), 1, "starved, the weights as wired");
  assert.ok(Math.abs(factor(0) - (1 + 0.4 / 25) / 1.4) < 1e-12, `fed ${factor(0)}`);
  assert.ok(factor(0.5) > factor(0) && factor(0.5) < 1);

  // The hunger term is 0 at 1 and lowers both eyes' background below it.
  const a = new InternalState(4);
  for (let k = 0; k < 100; k++) a.step(0.01);
  const { arousal, scene, bias } = INTERNAL_STATE;
  const without = 1 / (1 + Math.exp(-(arousal.weight * a.arousal.value + scene.weight * a.scene.left.value + bias)));
  assert.equal(a.level("left"), without);
  a.hunger = 0;
  assert.ok(a.level("left") < without && a.level("right") < 1);

  const run = (hunger: number | undefined, ms = 600) => {
    const brain = new FlyBrain(load(), { seed: 5 });
    const rates: string[] = [];
    let feed = 0;
    for (let t = 0; t < ms; t += 16) {
      const state = brain.tick(16, { ...RESTING_SENSES, sweet: 0.6, hunger });
      rates.push(JSON.stringify(state.stats.rates));
      feed += state.command.feed;
    }
    return { rates, feed, state: brain.state.level("left") };
  };
  const before = run(undefined);
  assert.deepEqual(run(1).rates, before.rates, "hunger 1 is the brain without hunger, spike for spike");
  assert.deepEqual(run(Number.NaN).rates, before.rates);
  const fed = run(0);
  assert.ok(fed.feed < before.feed, `fed ${fed.feed}, hungry ${before.feed}`);
  assert.ok(fed.state < before.state);
});

test("thirst: left out it is 1, the brain as it was; lower, the water neurons pass on less", () => {
  assert.equal(thirstOf(RESTING_SENSES), 1);
  for (const [given, taken] of [[0, 0], [0.25, 0.25], [1, 1], [-3, 0], [7, 1], [Number.NaN, 1], [Number.NEGATIVE_INFINITY, 1]]) {
    assert.equal(thirstOf({ ...RESTING_SENSES, thirst: given }), taken, `thirst ${given}`);
  }
  assert.equal(waterOutputGain(1), 1);
  assert.equal(waterOutputGain(0), THIRST.sated);
  assert.ok(waterOutputGain(0.5) > THIRST.sated && waterOutputGain(0.5) < 1);

  // In the synthetic wiring, water reaches nothing that is read; with it, sugar's answer is the same at any thirst.
  const run = (senses: Partial<BrainSenses>, ms = 600) => {
    const brain = new FlyBrain(load(), { seed: 5 });
    const rates: string[] = [];
    for (let t = 0; t < ms; t += 16) rates.push(JSON.stringify(brain.tick(16, { ...RESTING_SENSES, sweet: 0.6, water: 1, ...senses }).stats.rates));
    return rates;
  };
  const before = run({});
  assert.deepEqual(run({ thirst: 1 }), before, "thirst 1 is the brain without thirst, spike for spike");
  assert.deepEqual(run({ thirst: Number.NaN }), before);
  // Without water on its mouth, thirst touches nothing at all.
  assert.deepEqual(run({ water: 0, thirst: 0 }), run({ water: 0 }));
});

test("the eyes: shut, the brain is the same as one without them; open, darkness reaches the lamina and on", () => {
  const columns = syntheticEyeColumns(synthetic);
  const seeing = () => new FlyBrain(load(), { seed: 4, eyeColumns: columns });
  assert.equal(createBrain(bufferOf(synthetic.bytes)).eyes, null);
  const brain = seeing();
  assert.ok(brain.eyes);
  assert.equal(brain.eyes.right.directions.length, 12);
  // The eyes add the vision.<stage> rates the connectome has neurons for, after the readouts and the regions.
  const names = Object.keys(brain.tick(10, RESTING_SENSES).stats.rates);
  assert.deepEqual(names.slice(0, READOUTS.length), READOUTS.map((r) => r.name));
  assert.deepEqual(names.slice(READOUTS.length, READOUTS.length + REGIONS.length), REGION_RATE_NAMES);
  assert.deepEqual(names.slice(READOUTS.length + REGIONS.length), ["lamina", "lobula", "looming"].flatMap((stage) => [`vision.${stage} left`]).concat(["lamina", "lobula", "looming"].map((stage) => `vision.${stage} right`)));
  assert.ok(VISION_STAGES.every(({ stage }) => stage !== "lamina" || names.includes(`vision.${stage} left`)));

  // Shut eyes: spike for spike the brain without eyes, whatever else is going
  // on, but for the reward DANs sugar drives: their input comes after the
  // eyes', so its stream isn't the same. Their output is muted, but what they
  // teach (γ4 here) can differ.
  const blind = new FlyBrain(load(), { seed: 4 });
  const eyes = seeing();
  const reward = blind.wiring.reinforcement.flatMap((group) => [...group.neurons]);
  assert.ok(reward.length > 0);
  for (const brain of [blind, eyes]) brain.sim.setRecording(true);
  const counted = (brain: FlyBrain, spikes: number) => spikes - reward.reduce((n, i) => n + brain.sim.recording![i], 0);
  let before = [0, 0];
  const senses = [RESTING_SENSES, { ...RESTING_SENSES, loomLeft: 0.6, touch: 1 }, { ...RESTING_SENSES, sweet: 1, grounded: false }];
  for (let k = 0; k < 90; k++) {
    const s = senses[Math.floor(k / 30)];
    const a = blind.tick(16, s);
    const b = eyes.tick(16, s);
    const now = [counted(blind, blind.sim.stats.spikes), counted(eyes, eyes.sim.stats.spikes)];
    assert.equal(now[1] - before[1], now[0] - before[0], `tick ${k}`);
    before = now;
    assert.deepEqual(b.command, a.command);
  }

  // Open: a steady scene, then the right eye goes dark. Its L2s drive the right LPLC2 and the giant fiber.
  const light = { left: [1, 1, 1, 1], right: [1, 1, 1, 1] };
  let state = brain.tick(200, { ...RESTING_SENSES, light });
  assert.equal(state.stats.rates["vision.lamina right"], 0);
  light.right = [0, 0, 0, 0];
  for (let t = 0; t < 200; t += 10) state = brain.tick(10, { ...RESTING_SENSES, light });
  assert.ok(state.stats.rates["vision.lamina right"] > 20, `lamina ${state.stats.rates["vision.lamina right"]}`);
  assert.ok(state.stats.rates["vision.looming right"] > 5, `looming ${state.stats.rates["vision.looming right"]}`);
  assert.equal(state.stats.rates["vision.lamina left"], 0);
  assert.ok(state.stats.rates.DNp01 > 5, `giant fiber ${state.stats.rates.DNp01} Hz`);
  assert.throws(() => brain.tick(10, { ...RESTING_SENSES, light: { left: [1], right: [1, 1, 1, 1] } }), /left eye has 4 facets, but the light gives 1/);
});
