// Slow neuromodulation on the synthetic connectome (test-helpers.ts): the
// levels, the receptors' carriers and sources, their kinetics and effects.

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConnectome } from "./format.ts";
import { MODULATION, Modulation, RECEPTORS } from "./modulation.ts";
import type { ReceptorSpec } from "./modulation.ts";
import { smooth } from "./io.ts";
import { TRANSMITTER_FIXES, transmitters } from "./params.ts";
import { FlyBrain } from "./runtime.ts";
import { bufferOf, syntheticConnectome } from "./test-helpers.ts";
import { RESTING_SENSES } from "./types.ts";

const synthetic = syntheticConnectome();
const load = () => loadConnectome(bufferOf(synthetic.bytes));

test("the modulatory neurons are the sources, named octopaminergic and dopaminergic cells included", () => {
  const brain = new FlyBrain(load());
  const m = brain.modulation;
  // FB6H and OA-VUMa1 have no prediction in the fixture; params.ts makes them dopamine and octopamine. The mushroom
  // body's DANs are dopaminergic too; its Kenyon cells, predicted dopaminergic, are made cholinergic (params.ts).
  assert.deepEqual([...m.sources], [...synthetic.index["dFB dopamine"], ...synthetic.index.OA, ...synthetic.index.PPL101, ...synthetic.index.PAM08].sort((a, b) => a - b));
  assert.deepEqual(m.transmitters, ["DA", "OCT", "DA", "DA", "DA"]);
  assert.equal(m.levelOf(synthetic.index.sweet[0]), 0);
});

test("a source's level is its firing rate smoothed over MODULATION.tau", () => {
  const brain = new FlyBrain(load(), { seed: 2 });
  brain.sim.setRecording(true);
  const [oa] = synthetic.index.OA;
  let expected = 0;
  let before = 0;
  // Touch drives the bristles, which drive the octopaminergic neuron.
  for (let t = 0; t < 2000; t += 10) {
    brain.tick(10, { ...RESTING_SENSES, touch: 1 });
    const spikes = brain.sim.recording![oa] - before;
    before = brain.sim.recording![oa];
    expected = smooth(expected, (spikes / 10) * 1000, 10, MODULATION.tau);
  }
  assert.ok(expected > 0.5, `level ${expected}`);
  assert.equal(brain.modulation.levelOf(oa), expected);
});

test("Dop1R2: its carriers are the sleep-promoting neurons its sources synapse onto; it engages slowly and takes away what sleep pressure gives", () => {
  const brain = new FlyBrain(load(), { seed: 3 });
  const m = brain.modulation;
  const route = m.routes.find((r) => r.spec.receptor === "Dop1R2")!;
  assert.deepEqual([...route.carriers], synthetic.index.dFB);
  assert.deepEqual([...m.excitable], synthetic.index.dFB, "sleep pressure's excitability and dopamine's are on the same neurons");
  assert.deepEqual(
    brain.wiring.state.find((g) => g.spec.name === "sleep pressure")!.neurons,
    Uint32Array.from(synthetic.index.R5),
    "the R5 ring neurons fire with sleep pressure, and the fan-shaped body's dopaminergic neuron doesn't",
  );
  brain.tick(0, { ...RESTING_SENSES, sleepPressure: 0.5 });
  assert.deepEqual([...m.bias], [3.5, 3.5]);
  // Touched, the bristles drive the dopaminergic neuron, and Dop1R2 engages over minutes, not seconds.
  for (let t = 0; t < 10_000; t += 50) brain.tick(50, { ...RESTING_SENSES, touch: 1, sleepPressure: 1 });
  const engaged = route.engaged[0];
  assert.ok(engaged > 0 && engaged < 0.1, `engaged ${engaged} after 10 s`);
  assert.equal(m.bias[0], 7 - 7 * engaged);
  // It falls more slowly than it rose.
  for (let t = 0; t < 10_000; t += 50) brain.tick(50, { ...RESTING_SENSES, sleepPressure: 1 });
  assert.ok(route.engaged[0] > 0.6 * engaged, `${route.engaged[0]} of ${engaged} left 10 s later`);
});

test("a receptor's exposure is its sources' levels weighted by the synapses each makes onto the carrier", () => {
  const connectome = load();
  const { nt } = transmitters(connectome, TRANSMITTER_FIXES);
  const spec: ReceptorSpec = { ...RECEPTORS[1], kinetics: undefined, full: 100 };
  const m = new Modulation(connectome, { nt, senses: [], excitability: [], receptors: [spec], standIns: [] });
  const route = m.routes[0];
  const [dopamine] = synthetic.index["dFB dopamine"];
  const k = [...m.sources].indexOf(dopamine);
  m.level[k] = 40;
  m.update(0);
  assert.deepEqual([...route.engaged], [0.4, 0.4]);
  assert.deepEqual([...m.bias], [-7 * 0.4, -7 * 0.4]);
});

test("DopEcR follows the sweet sense's neurons, whatever they are", () => {
  const brain = new FlyBrain(load());
  const sweet = brain.wiring.senses.find((g) => g.spec.sense === "sweet")!.neurons;
  const route = brain.modulation.routes.find((r) => r.spec.receptor === "DopEcR")!;
  assert.deepEqual(route.carriers, sweet);
  assert.deepEqual([...brain.sim.outputGainMembers("release DopEcR")], [...sweet]);
  // Fed, TH-VUM fires at 1 Hz: the release of a starved fly's sweet neurons, less dopamine's 1.4 fold.
  brain.tick(16, { ...RESTING_SENSES, hunger: 0 });
  assert.equal(route.factors![0], (1 + 0.4 * (1 / 25)) / 1.4);
});
