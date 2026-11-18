import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { loadConnectome } from "./format.ts";
import { COMPARTMENTS, DAN_COMPARTMENTS, MBON_COMPARTMENTS, MEMORY, MushroomBody } from "./learning.ts";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "./node.ts";
import { FlyBrain } from "./runtime.ts";
import { bufferOf, syntheticConnectome } from "./test-helpers.ts";
import { RESTING_SENSES } from "./types.ts";
import type { BrainSenses } from "./types.ts";

const synthetic = syntheticConnectome();
const brain = () => new FlyBrain(loadConnectome(bufferOf(synthetic.bytes)), { seed: 2 });
const run = (b: FlyBrain, ms: number, senses: Partial<BrainSenses> = {}) => {
  for (let t = 0; t < ms; t += 10) b.tick(10, { ...RESTING_SENSES, ...senses });
};
test("the compartment tables name only compartments that exist, and the learning synapses are a KC's onto an MBON sharing its lobe", () => {
  const ids = new Set<string>(COMPARTMENTS.map((c) => c.id));
  for (const table of [DAN_COMPARTMENTS, MBON_COMPARTMENTS]) for (const list of Object.values(table)) for (const c of list) assert.ok(ids.has(c), c);
  const connectome = loadConnectome(bufferOf(synthetic.bytes));
  const learning = new MushroomBody(connectome);
  const type = (i: number) => connectome.columns.type.value(i);
  const onto = new Map<string, string[]>();
  learning.edges.forEach((e, p) => {
    const gate = [...learning.gateCompartments.subarray(learning.gatePtr[learning.edgeGate[p]], learning.gatePtr[learning.edgeGate[p] + 1])].map((c) => learning.compartments[c]);
    onto.set(`${type(learning.kcs[learning.edgeKC[p]])} -> ${type(connectome.post[e])}`, gate);
  });
  // γ KCs reach MBON-γ1pedc in γ1 and MBON-γ4 in γ4; α/β KCs MBON-γ1pedc in the peduncle and MBON-β1 in β1.
  assert.deepEqual(Object.fromEntries(onto), {
    "KCg-m -> MBON11": ["g1 left"],
    "KCg-m -> MBON05": ["g4 left"],
    "KCab-s -> MBON11": ["ped left"],
    "KCab-s -> MBON06": ["b1 left"],
  });
  assert.equal(learning.edges.length, 6 * 2 + 4 * 2);
  assert.ok(learning.factors.every((f) => f === 1));
});

test("a KC's synapses are depressed where its compartment's DANs fire soon after it, restored where they fire just before it, and left alone otherwise", () => {
  const connectome = loadConnectome(bufferOf(synthetic.bytes));
  const post = (p: number, b: FlyBrain) => connectome.columns.type.value(connectome.post[b.learning!.edges[p]]);
  const kc = (p: number, b: FlyBrain) => connectome.columns.type.value(b.learning!.kcs[b.learning!.edgeKC[p]]);
  const by = (b: FlyBrain, from: string, to: string) => [...b.learning!.factors].filter((_, p) => kc(p, b) === from && post(p, b) === to);

  // The KCs alone (a loom on the left) or the DAN alone (touch) teach nothing.
  const alone = brain();
  run(alone, 500, { loomLeft: 1 });
  run(alone, 15000);
  run(alone, 500, { touch: 1 });
  assert.ok(alone.learning!.factors.every((f) => f === 1));

  // Forward: the loom fires the KCs, then touch fires PPL1-γ1pedc. Their
  // synapses onto MBON-γ1pedc fall, in γ1 and the peduncle; those onto the
  // MBONs of γ4 and β1, where no DAN fired, don't.
  const b = brain();
  run(b, 500, { loomLeft: 1 });
  run(b, 300);
  run(b, 500, { touch: 1 });
  const depressed = [...by(b, "KCg-m", "MBON11"), ...by(b, "KCab-s", "MBON11")];
  assert.ok(depressed.every((f) => f < 0.5), String(depressed));
  assert.ok([...by(b, "KCg-m", "MBON05"), ...by(b, "KCab-s", "MBON06")].every((f) => f === 1));
  // Each learning edge's weight in the simulation is its weight in the wiring times its factor.
  const reference = new FlyBrain(connectome, { seed: 2, learning: false });
  b.learning!.edges.forEach((e, p) => assert.equal(b.sim.weightOf(e), Math.fround(reference.sim.weightOf(e) * b.learning!.factors[p])));

  // Backward, after the window: touch first, then the loom. What was lost comes back, toward the wiring's strength, never past it.
  run(b, 15000);
  const lost = by(b, "KCg-m", "MBON11");
  run(b, 300, { touch: 1 });
  run(b, 500, { loomLeft: 1 });
  const restored = by(b, "KCg-m", "MBON11");
  restored.forEach((f, k) => assert.ok(f > lost[k] && f <= 1, `${f} after ${lost[k]}`));

  // Sugar drives the γ4 reward DANs (io.ts, REINFORCEMENT): after the loom it depresses the γ KCs' synapses onto MBON-γ4, and only those.
  const sweet = brain();
  run(sweet, 500, { loomLeft: 1 });
  run(sweet, 300);
  run(sweet, 500, { sweet: 1 });
  assert.ok(by(sweet, "KCg-m", "MBON05").every((f) => f < 1));
  assert.ok([...by(sweet, "KCg-m", "MBON11"), ...by(sweet, "KCab-s", "MBON11"), ...by(sweet, "KCab-s", "MBON06")].every((f) => f === 1));
});

test("a brain that doesn't learn has no plastic synapses, and one whose connectome has no mushroom body none either", () => {
  assert.equal(new FlyBrain(loadConnectome(bufferOf(synthetic.bytes)), { learning: false }).learning, null);
  const without = syntheticConnectome({ without: ["KCg", "KCab", "MBON11", "MBON05", "MBON06", "PPL101", "PAM08"] });
  const b = new FlyBrain(loadConnectome(bufferOf(without.bytes)));
  assert.equal(b.learning, null);
  assert.equal(b.wiring.reinforcement.length, 0);
});

test("what it learned goes into a memory a few bytes a synapse, and another brain of the same connectome takes it back; any other is refused", () => {
  const b = brain();
  assert.equal(b.memory().length, MEMORY.header, "nothing learned yet");
  run(b, 500, { loomLeft: 1 });
  run(b, 300);
  run(b, 500, { touch: 1 });
  const memory = b.memory();
  const kept = (f: number) => Math.round(f * MEMORY.steps) / MEMORY.steps;
  const changed = [...b.learning!.factors].filter((f) => kept(f) !== 1).length;
  const synapses = b.learning!.edges.length;
  assert.ok(changed > 0);
  // Sparse, five bytes a changed synapse, or dense, a byte each, whichever is shorter.
  assert.equal(memory.length, MEMORY.header + Math.min(MEMORY.entry * changed, synapses));

  const again = new FlyBrain(loadConnectome(bufferOf(synthetic.bytes)), { seed: 9 });
  again.remember(memory);
  assert.deepEqual([...again.learning!.factors], [...b.learning!.factors].map(kept));
  again.learning!.edges.forEach((e, p) => assert.equal(again.sim.weightOf(e), Math.fround(new FlyBrain(loadConnectome(bufferOf(synthetic.bytes)), { learning: false }).sim.weightOf(e) * kept(b.learning!.factors[p]))));
  assert.deepEqual(again.memory(), memory);
  // Taking back a memory of nothing learned undoes what was.
  again.remember(new FlyBrain(loadConnectome(bufferOf(synthetic.bytes))).memory());
  assert.ok(again.learning!.factors.every((f) => f === 1));

  const other = new FlyBrain(loadConnectome(bufferOf(syntheticConnectome({ without: ["MBON06"] }).bytes)));
  assert.throws(() => other.remember(memory), /another brain's/);
  const none = new FlyBrain(loadConnectome(bufferOf(syntheticConnectome({ without: ["KCg", "KCab"] }).bytes)));
  assert.equal(none.learning, null);
  none.remember(none.memory());
  assert.throws(() => none.remember(memory), /another brain's/);
  assert.throws(() => b.remember(none.memory()), /another brain's/);
  assert.throws(() => b.remember(new Uint8Array(3)), /isn't a fly's memory/);
  assert.deepEqual(b.memory(), memory, "a refusal changes nothing");
});

const path = DEFAULT_CONNECTOME_PATH;
const real = existsSync(path);

test("on the real connectome an odour paired with a loom depresses its own KCs' synapses where PPL1 teaches, and an unpaired odour's hardly", { skip: real ? false : `no ${path}` }, () => {
  // As scripts/learning.ts's assay: DM1's ORNs as the paired odour, VA2's as
  // the unpaired one; each tested once, then 15 s, the training, 15 s.
  const connectome = readConnectomeFile(path);
  const b = new FlyBrain(connectome, { seed: 1 });
  const odours = { DM1: connectome.find({ type: "ORN_DM1" }), VA2: connectome.find({ type: "ORN_VA2" }) };
  for (const [name, neurons] of Object.entries(odours)) b.sim.addInput(name, neurons);
  b.sim.setRecording(true);
  const r = b.sim.recording!;
  const learning = b.learning!;
  const fired = (odour: "DM1" | "VA2") => {
    const before = Uint32Array.from(learning.kcs, (i) => r[i]);
    b.sim.setRate(odour, 100);
    run(b, 1000);
    b.sim.setRate(odour, 0);
    run(b, 3000);
    return new Set([...learning.kcs].filter((i, k) => r[i] > before[k]));
  };
  run(b, 2000);
  const plus = fired("DM1");
  const minus = fired("VA2");
  assert.ok(plus.size > 50 && minus.size > 50, `${plus.size} and ${minus.size} KCs`);
  run(b, 15000);
  const before = Float64Array.from(learning.factors);
  // The odour for 1 s; the loom in four 0.1-s pulses at 2 Hz from 0.2 s in.
  for (let t = 0; t < 2000; t += 10) {
    b.sim.setRate("DM1", t < 1000 ? 100 : 0);
    b.tick(10, { ...RESTING_SENSES, ...(t >= 200 && t < 1800 && (t - 200) % 500 < 100 ? { loomLeft: 1, loomRight: 1 } : {}) });
  }
  run(b, 15000);
  // γ1 (MBON-γ1pedc's), on both sides.
  const g1 = (kcs: Set<number>) => {
    const ratios: number[] = [];
    learning.edges.forEach((_, p) => {
      const g = learning.edgeGate[p];
      const inG1 = [...learning.gateCompartments.subarray(learning.gatePtr[g], learning.gatePtr[g + 1])].some((c) => learning.compartments[c].startsWith("g1 "));
      if (inG1 && kcs.has(learning.kcs[learning.edgeKC[p]])) ratios.push(learning.factors[p] / before[p]);
    });
    return ratios.reduce((a, x) => a + x, 0) / ratios.length;
  };
  assert.ok(g1(plus) < 0.5, `paired ${g1(plus)}`);
  assert.ok(g1(minus) > 0.9, `unpaired ${g1(minus)}`);
});
