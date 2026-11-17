import assert from "node:assert/strict";
import type { Connectome } from "../src/format.ts";
import { buildWeights } from "../src/params.ts";
import { InternalState } from "../src/state.ts";

export const GLOMERULI = ["DM1", "VA2", "DA2", "V", "DM5"] as const;
export const RATES = [10, 25, 50, 100, 200] as const;
export const COMMANDS = ["walk", "turn", "back", "escape", "wings", "groom", "feed", "sing"] as const;
export const SECONDS = 67;
export const SETTLE_SECONDS = 20;
export type Context = "pinned" | "wandering";
export type Family = "none" | "odor" | "bristle";
export type Bin = { second: number; command: Record<string, number>; readouts: Record<string, number>;
  hz: Record<string, number>; state: number[]; drivenSpikes: number; weightedSpikes: number };
export type RecordTrial = { version: string; assay: string; model: Record<string, string>; connectome: string; seed: number;
  context: Context; family: Family; glomerulus: string; rate: number; calibration: string | null;
  annotation: { url: string; sha256: string };
  analysisSha256: string;
  matching: Record<string, { count: number; odorWeight: number; bristleWeight: number; ratio: number; bodyIds: number[]; odorBodyIds: number[] }>;
  backgroundLevels: { left: number; right: number };
  bins: Bin[]; cellsFile: string; cellsSha256: string };

export function percentile95(values: number[]) {
  assert(values.length > 0 && values.every(Number.isFinite));
  return values.toSorted((a, b) => a - b)[Math.ceil(0.95 * values.length) - 1];
}
export function mean(bins: Bin[], key: "command" | "readouts" | "hz") {
  assert(bins.length > 0);
  return Object.fromEntries(Object.keys(bins[0][key]).map((k) => [k, bins.reduce((sum, b) => sum + b[key][k], 0) / bins.length]));
}
export const delta = (a: Record<string, number>, b: Record<string, number>) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] - b[k]]));
export const effectiveTolerance = (calibration: { qualified: boolean; tolerances: Record<string, number> }, command: string) => calibration.qualified ? calibration.tolerances[command] : 0.05;
export function validateCalibrationContexts(contexts: Record<Context, { qualified: boolean; tolerances: Record<string, number>; drift: Record<string, number>[] }>) {
  for (const context of ["pinned", "wandering"] as const) {
    const value = contexts[context];
    assert(value && typeof value.qualified === "boolean");
    assert.deepEqual(value.drift.map((d) => d.seed).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 101));
    assert.deepEqual(Object.keys(value.tolerances).sort(), [...COMMANDS].sort());
    for (const k of COMMANDS) assert.equal(value.tolerances[k], Math.max(0.05, percentile95(value.drift.map((d) => Math.abs(d[k])))));
    assert.equal(value.qualified, Object.values(value.tolerances).every((t) => t <= 0.1));
  }
}

/** Exogenous rate schedule only; this calculation neither runs nor observes a neuron. */
export function referenceLevels(seed: number) {
  const state = new InternalState((seed ^ 0x5bd1e995) >>> 0);
  const levels = { left: 0, right: 0 };
  for (let i = 0; i < (SETTLE_SECONDS + SECONDS) * 100; i++) {
    state.step(0.01);
    if (i >= SETTLE_SECONDS * 100) for (const side of ["left", "right"] as const) levels[side] += state.level(side) / (SECONDS * 100);
  }
  return levels;
}

/** Matches anatomy-derived first-hop weight only; no firing or command enters the selection. */
export function matchedInputs(c: Connectome) {
  const weights = buildWeights(c);
  const degree = new Float64Array(c.neurons);
  for (let i = 0; i < c.neurons; i++) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) degree[i] += Math.abs(weights.gain[i] * weights.network.count[e]);
  const pool = [...c.find({ superClass: "cb_sensory", type: /^BM/ })];
  for (const i of pool) assert(/^mechanosensory/.test(c.columns.class.value(i)), `not a mechanosensory bristle ${c.rootId[i]}`);
  const inputs = new Map<string, Uint32Array>();
  const matching: RecordTrial["matching"] = {};
  for (const g of GLOMERULI) {
    const odor = c.find({ superClass: "cb_sensory", class: "olfactory", type: `ORN_${g}` });
    assert(odor.length > 0 && odor.length <= pool.length);
    const available = new Set(pool);
    const chosen: number[] = [];
    for (const i of [...odor].sort((a, b) => degree[a] - degree[b] || c.rootId[a] - c.rootId[b])) {
      let best = -1;
      for (const j of available) if (best < 0 || Math.abs(degree[j] - degree[i]) < Math.abs(degree[best] - degree[i]) ||
        (Math.abs(degree[j] - degree[i]) === Math.abs(degree[best] - degree[i]) && c.rootId[j] < c.rootId[best])) best = j;
      chosen.push(best); available.delete(best);
    }
    chosen.sort((a, b) => c.rootId[a] - c.rootId[b]);
    const sum = (ns: Iterable<number>) => [...ns].reduce((s, i) => s + degree[i], 0);
    const odorWeight = sum(odor), bristleWeight = sum(chosen);
    assert(chosen.every((i) => !odor.includes(i)));
    matching[g] = { count: odor.length, odorWeight, bristleWeight, ratio: bristleWeight / odorWeight, bodyIds: chosen.map((i) => c.rootId[i]), odorBodyIds: [...odor].map((i) => c.rootId[i]) };
    inputs.set(`odor.${g}`, odor); inputs.set(`bristle.${g}`, Uint32Array.from(chosen));
  }
  return { inputs, matching, degree };
}
