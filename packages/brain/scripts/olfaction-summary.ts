// Reduces the assay's per-second records; preserves each seed and all commands.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

type Bin = { second: number; command: Record<string, number>; peak: Record<string, number>;
  readouts: Record<string, number>; hz: Record<string, number>; regionPeak: Record<string, number>;
  spikes: number; maxActive: number };
type Trial = { seed: number; glomerulus: string; rate: number; bins: Bin[] };
type Result = { provenance: unknown; operatingPoint: unknown; populationSizes: Record<string, number>; trials: Trial[] };
const { values } = parseArgs({ options: { results: { type: "string" }, compact: { type: "boolean", default: false }, partial: { type: "boolean", default: false } } });
assert(values.results, "--results <json[,json,...]>");
const files: Result[] = values.results.split(",").map((path) => JSON.parse(readFileSync(path, "utf8")) as Result);
const first = files[0];
for (const file of files) for (const field of ["provenance", "operatingPoint", "populationSizes"] as const) assert.deepEqual(file[field], first[field]);
const trials = files.flatMap((f) => f.trials);
const seeds = [...new Set(trials.map((t) => t.seed))].sort((a, b) => a - b);
const completeProtocol = seeds.join() === "1,2,3";
assert(values.partial || completeProtocol, "Protocol requires seeds 1,2,3; --partial explicitly labels an incomplete summary");
const expected = ["control:0", ...["DM1", "VA2", "DA2", "V", "DM5"].flatMap((g) => [10, 25, 50, 100, 200].map((r) => `${g}:${r}`))].sort();
for (const seed of seeds) assert.deepEqual(trials.filter((t) => t.seed === seed).map((t) => `${t.glomerulus}:${t.rate}`).sort(), expected);
for (const trial of trials) {
  assert.deepEqual(trial.bins.map((b) => b.second), Array.from({ length: 12 }, (_, i) => i));
  for (const b of trial.bins) for (const field of ["command", "peak", "readouts", "hz", "regionPeak"] as const) assert(Object.values(b[field]).every(Number.isFinite));
}
const mean = (bs: Bin[], field: "command" | "hz" | "readouts") => Object.fromEntries(Object.keys(bs[0][field]).map((key) => [key, bs.reduce((s, b) => s + b[field][key], 0) / bs.length]));
const subtract = (a: Record<string, number>, b: Record<string, number>) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] - b[k]]));
const maxAbs = (a: Record<string, number>) => Math.max(...Object.values(a).map(Math.abs));
const rows = trials.map((trial) => {
  const control = trials.find((t) => t.seed === trial.seed && t.glomerulus === "control")!;
  for (const second of [0, 1]) for (const field of ["command", "hz", "readouts"] as const) {
    assert.deepEqual(trial.bins[second][field], control.bins[second][field], `pre-stimulus mismatch, seed ${trial.seed}`);
  }
  const on = trial.bins.slice(2, 7), controlOn = control.bins.slice(2, 7);
  const commandDelta = subtract(mean(on, "command"), mean(controlOn, "command"));
  const hzDelta = subtract(mean(on, "hz"), mean(controlOn, "hz"));
  const finalCommandDelta = subtract(trial.bins[11].command, control.bins[11].command);
  const finalHzDelta = subtract(trial.bins[11].hz, control.bins[11].hz);
  return { seed: trial.seed, glomerulus: trial.glomerulus, rate: trial.rate,
    onCommand: mean(on, "command"), commandDelta, onHz: mean(on, "hz"), hzDelta,
    onReadouts: mean(on, "readouts"),
    peakCommand: Object.fromEntries(Object.keys(on[0].peak).map((k) => [k, Math.max(...on.map((b) => b.peak[k]))])),
    peakRegion: Object.fromEntries(Object.keys(on[0].regionPeak).map((k) => [k, Math.max(...on.map((b) => b.regionPeak[k]))])),
    finalCommandDelta, finalHzDelta,
    recovered: maxAbs(finalCommandDelta) <= 0.05 && maxAbs(finalHzDelta) <= 1,
    maxActive: Math.max(...trial.bins.map((b) => b.maxActive)),
    // Early/late bins expose a response that dies away while stimulation remains on.
    timeCourse: trial.bins.map((b) => ({ second: b.second, commandDelta: subtract(b.command, control.bins[b.second].command), hzDelta: subtract(b.hz, control.bins[b.second].hz) })),
  };
});
const aggregate = expected.map((key) => {
  const rs = rows.filter((r) => `${r.glomerulus}:${r.rate}` === key);
  const average = (field: "onCommand" | "commandDelta" | "onHz" | "hzDelta") => Object.fromEntries(Object.keys(rs[0][field]).map((k) => [k, rs.reduce((s, r) => s + r[field][k], 0) / rs.length]));
  const range = (field: "commandDelta" | "hzDelta") => Object.fromEntries(Object.keys(rs[0][field]).map((k) => [k, [Math.min(...rs.map((r) => r[field][k])), Math.max(...rs.map((r) => r[field][k]))]]));
  return { glomerulus: rs[0].glomerulus, rate: rs[0].rate, onCommand: average("onCommand"), commandDelta: average("commandDelta"),
    onHz: average("onHz"), hzDelta: average("hzDelta"), commandDeltaRange: range("commandDelta"), hzDeltaRange: range("hzDelta"),
    recoveryFailures: rs.filter((r) => !r.recovered).map((r) => r.seed) };
});
const output = { provenance: first.provenance, operatingPoint: first.operatingPoint,
  populationSizes: first.populationSizes, seeds, completeProtocol, conditionsPerSeed: expected.length, aggregate, rows };
if (values.compact) for (const row of output.rows) Reflect.deleteProperty(row, "timeCourse");
console.log(JSON.stringify(output, (_key, value: unknown) => typeof value === "number" ? Math.round(value * 1e6) / 1e6 : value, values.compact ? undefined : 2));
