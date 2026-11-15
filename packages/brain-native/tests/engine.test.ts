// The native engine (src/sim.cpp) against sim.ts on random networks, over
// every option the engine has, including the ones the brain doesn't use yet
// (a per-neuron bias; a per-target weight scale; drive reset and adaptation
// on and off; other steps, delays, refractory periods and cleanup intervals)
// and rated inputs, a rate per neuron as the eyes drive the lamina, with
// rates from 0 to past one spike a step changed mid-run: each step's spikes
// and active count, and every neuron's v, g and a at the end, bit for bit.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Simulation, mulberry32 } from "../../brain/src/sim.ts";
import { build, harness, hex32, noCompiler } from "./compare.ts";

type Change = { step: number; input: number; rate: number } | { step: number; bias: number[] | null } | { step: number; rated: number; rates: number[] };

type Spec = {
  ptr: number[];
  post: number[];
  count: number[];
  gain: number[];
  postScale: number[] | null;
  dt: number;
  tauMem: number;
  tauSyn: number;
  threshold: number;
  refractory: number;
  delay: number;
  epsilon: number;
  cleanupInterval: number;
  seed: number;
  resetDrive: boolean;
  adaptation: { increment: number; tau: number } | null;
  inputs: { neurons: number[]; rate: number }[];
  /** Added after `inputs`, each its neurons in their order (distinct). */
  rated: { neurons: number[] }[];
  changes: Change[];
  steps: number;
};

function randomSpec(seed: number): Spec {
  const random = mulberry32(seed);
  const n = 80 + Math.floor(random() * 120);
  const ptr = [0];
  const post: number[] = [];
  const count: number[] = [];
  for (let i = 0; i < n; i++) {
    const targets = new Set<number>();
    const degree = Math.floor(random() * 15);
    while (targets.size < degree) targets.add(Math.floor(random() * n));
    for (const j of [...targets].sort((a, b) => a - b)) {
      post.push(j);
      count.push(1 + Math.floor(random() * (random() < 0.1 ? 3000 : 10)));
    }
    ptr.push(post.length);
  }
  const f = Math.fround;
  // Mostly excitatory, some inhibitory, a few muted.
  const gain = Array.from({ length: n }, () => {
    const r = random();
    return f(r < 0.65 ? 0.2 + random() * 0.9 : r < 0.93 ? -(0.3 + random() * 1.2) : 0);
  });
  const bias = () => Array.from({ length: n }, () => f(random() < 0.05 ? 7.5 + random() * 3 : random() < 0.05 ? -2 * random() : 0));
  const pick = (k: number) => Array.from({ length: k }, () => Math.floor(random() * n));
  const distinct = (k: number) => {
    const out = new Set<number>();
    while (out.size < k) out.add(Math.floor(random() * n));
    return [...out];
  };
  const rated = [{ neurons: distinct(40) }, { neurons: distinct(8) }];
  // Each neuron's rate: silent, slow, fast, or one spike a step and more (probability 1).
  const rates = (k: number) => {
    const kind = random();
    return Array.from({ length: k }, () => {
      const r = random();
      if (kind < 0.1) return 0;
      return r < 0.3 ? 0 : r < 0.8 ? random() * 200 : r < 0.95 ? 200 + random() * 400 : kind < 0.3 ? 1e308 : 3000 + random() * 3000;
    });
  };
  const steps = 1500;
  const changes: Change[] = [];
  if (random() < 0.7) changes.push({ step: 0, bias: bias() });
  for (let k = 0; k < 8; k++) {
    const step = Math.floor(random() * steps);
    const r = random();
    changes.push(r < 0.6 ? { step, input: Math.floor(random() * 3), rate: r < 0.1 ? 0 : random() * 300 } : { step, bias: r < 0.7 ? null : bias() });
  }
  for (let k = 0; k < 12; k++) {
    const which = Math.floor(random() * rated.length);
    changes.push({ step: Math.floor(random() * steps), rated: which, rates: rates(rated[which].neurons.length) });
  }
  changes.sort((a, b) => a.step - b.step);
  return {
    ptr,
    post,
    count,
    gain,
    postScale: random() < 0.5 ? Array.from({ length: n }, () => f(0.5 + random())) : null,
    dt: [1, 0.5, 0.25, 0.1][Math.floor(random() * 4)],
    tauMem: 10 + random() * 20,
    tauSyn: 2 + random() * 6,
    threshold: 7,
    refractory: [0.3, 2.2, 5][Math.floor(random() * 3)],
    delay: [0.4, 1.8, 3.1][Math.floor(random() * 3)],
    epsilon: [1e-3, 0.01][Math.floor(random() * 2)],
    cleanupInterval: [1, 3, 16][Math.floor(random() * 3)],
    seed: Math.floor(random() * 2 ** 32),
    resetDrive: random() < 0.5,
    adaptation: random() < 0.6 ? { increment: random() < 0.2 ? 0 : 0.05 + random() * 0.5, tau: 20 + random() * 1000 } : null,
    inputs: [
      { neurons: pick(12), rate: 80 + random() * 200 },
      { neurons: pick(30), rate: 5 + random() * 30 },
      { neurons: pick(5), rate: 0 },
    ],
    rated,
    changes,
    steps,
  };
}

/** What the harness's engine mode prints, from sim.ts. */
function typescript(spec: Spec): string[] {
  const n = spec.ptr.length - 1;
  const sim = new Simulation(
    { ptr: Uint32Array.from(spec.ptr), post: Uint32Array.from(spec.post), count: Uint16Array.from(spec.count) },
    {
      gain: Float32Array.from(spec.gain),
      postScale: spec.postScale ? Float32Array.from(spec.postScale) : undefined,
      dt: spec.dt,
      tauMem: spec.tauMem,
      tauSyn: spec.tauSyn,
      threshold: spec.threshold,
      refractory: spec.refractory,
      delay: spec.delay,
      epsilon: spec.epsilon,
      cleanupInterval: spec.cleanupInterval,
      seed: spec.seed,
      resetDrive: spec.resetDrive,
      adaptation: spec.adaptation ?? undefined,
    },
  );
  spec.inputs.forEach((input, k) => sim.addInput(`input ${k}`, input.neurons, input.rate));
  spec.rated.forEach((input, k) => sim.addRatedInput(`rated ${k}`, input.neurons));
  const lines: string[] = [];
  let next = 0;
  for (let s = 0; s < spec.steps; s++) {
    while (next < spec.changes.length && spec.changes[next].step === s) {
      const change = spec.changes[next++];
      if ("rate" in change) sim.setRate(`input ${change.input}`, change.rate);
      else if ("rates" in change) sim.setRates(`rated ${change.rated}`, change.rates);
      else sim.setBias(change.bias ? Float32Array.from(change.bias) : null);
    }
    sim.step();
    lines.push(`${s} ${sim.active}: ${[...sim.lastSpikes()].join(" ")}`);
  }
  for (let i = 0; i < n; i++) lines.push(`${hex32(sim.potential(i))} ${hex32(sim.drive(i))} ${hex32(sim.adaptationOf(i))}`);
  return lines;
}

test("the engine is sim.ts's to the bit on random networks with every option", { skip: noCompiler }, () => {
  const dir = build();
  let spikes = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const spec = randomSpec(seed);
    const expected = typescript(spec);
    const actual = harness(dir, ["engine"], JSON.stringify(spec));
    const k = expected.findIndex((line, m) => line !== actual[m]);
    assert.equal(k, -1, `seed ${seed}, line ${k}:\n  typescript ${expected[k]}\n  native     ${actual[k]}`);
    assert.equal(actual.length, expected.length);
    spikes += expected.slice(0, spec.steps).reduce((sum, line) => sum + (line.split(": ")[1].length > 0 ? line.split(": ")[1].split(" ").length : 0), 0);
  }
  assert.ok(spikes > 100_000, `${spikes} spikes`);
});
