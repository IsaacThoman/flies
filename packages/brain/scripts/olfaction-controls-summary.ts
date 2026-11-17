// Calibration uses only unstimulated seeds; evaluation cannot silently refit it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readConnectomeFile } from "../src/node.ts";
import { REGIONS, regionOf } from "../src/regions.ts";
import { COMMANDS, GLOMERULI, RATES, SECONDS, delta, effectiveTolerance, mean, percentile95, validateCalibrationContexts } from "./olfaction-controls-lib.ts";
import type { Context, RecordTrial } from "./olfaction-controls-lib.ts";

const { values } = parseArgs({ options: { dir: { type: "string" }, calibrate: { type: "string" }, calibration: { type: "string" } } });
assert(values.dir);
const directory = values.dir;
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const trials: RecordTrial[] = readdirSync(directory).filter((s) => /^(pinned|wandering)-(none|odor|bristle)-\d+-.*\.json$/.test(s)).sort().map((s) => JSON.parse(readFileSync(join(directory, s), "utf8")));
assert(trials.length > 0);
for (const t of trials) {
  assert.equal(t.version, "recovery-v2"); assert.equal(t.assay, trials[0].assay); assert.deepEqual(t.model, trials[0].model); assert.equal(t.connectome, trials[0].connectome);
  assert.deepEqual(t.annotation, trials[0].annotation); assert.equal(t.analysisSha256, sha(readFileSync(new URL(import.meta.url))));
  assert.deepEqual(t.bins.map((b) => b.second), Array.from({ length: SECONDS }, (_, i) => i));
  assert.deepEqual(t.matching, trials[0].matching);
  for (const b of t.bins) for (const field of ["command", "readouts", "hz"] as const) assert(Object.values(b[field]).every(Number.isFinite));
}
const key = (t: RecordTrial) => `${t.context}:${t.family}:${t.seed}:${t.glomerulus}:${t.rate}`;
assert.equal(new Set(trials.map(key)).size, trials.length);
type Calibration = { version: string; assay: string; analysisSha256: string; model: Record<string, string>; connectome: string; contexts: Record<Context, { tolerances: Record<string, number>; qualified: boolean; drift: Record<string, number>[] }> };
if (values.calibrate) {
  assert(!values.calibration);
  const contexts = {} as Calibration["contexts"];
  for (const context of ["pinned", "wandering"] as const) {
    const rs = trials.filter((t) => t.context === context && t.family === "none" && t.seed >= 101 && t.seed <= 120);
    assert.deepEqual(rs.map((t) => t.seed).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => 101 + i));
    assert(rs.every((t) => t.calibration === null));
    const drift: Record<string, number>[] = rs.map((t) => ({ seed: t.seed, ...delta(t.bins[66].command, t.bins[1].command) }));
    const tolerances = Object.fromEntries(COMMANDS.map((k) => [k, Math.max(0.05, percentile95(drift.map((d) => Math.abs(d[k]))))]));
    contexts[context] = { tolerances, qualified: Object.values(tolerances).every((v) => v <= 0.1), drift };
  }
  const calibration: Calibration = { version: "recovery-v2", assay: trials[0].assay, analysisSha256: trials[0].analysisSha256, model: trials[0].model, connectome: trials[0].connectome, contexts };
  validateCalibrationContexts(contexts);
  assert(!trials.some((t) => t.family !== "none"), "Calibration directory must not contain stimulus trials");
  const inputs = Object.fromEntries(trials.filter((t) => t.seed >= 101 && t.seed <= 120).map((t) => {
    const name = t.cellsFile.replace(/\.bin$/, ".json");
    return [name, sha(readFileSync(join(directory, name)))];
  }));
  writeFileSync(values.calibrate, JSON.stringify({ ...calibration, inputs }, null, 2), { flag: "wx" });
  console.log(JSON.stringify(calibration, null, 2));
} else {
  assert(values.calibration);
  const lockedBytes = readFileSync(values.calibration);
  const locked: Calibration = JSON.parse(lockedBytes.toString());
  assert.equal(locked.version, "recovery-v2"); assert.equal(locked.analysisSha256, trials[0].analysisSha256);
  validateCalibrationContexts(locked.contexts);
  assert.deepEqual(locked.model, trials[0].model); assert.equal(locked.connectome, trials[0].connectome); assert.equal(locked.assay, trials[0].assay);
  const held = trials.filter((t) => [21, 22, 23].includes(t.seed));
  for (const t of held) assert.equal(t.calibration, sha(lockedBytes));
  for (const context of ["pinned", "wandering"] as const) for (const seed of [21, 22, 23]) {
    const expected = [`${context}:none:${seed}:none:0`, ...["odor", "bristle"].flatMap((family) => GLOMERULI.flatMap((g) => (context === "pinned" ? [...RATES] : [100]).map((r) => `${context}:${family}:${seed}:${g}:${r}`)))].sort();
    assert.deepEqual(held.filter((t) => t.context === context && t.seed === seed).map(key).sort(), expected);
  }
  const c = readConnectomeFile(), regions = regionOf(c);
  const loadCells = (t: RecordTrial) => {
    const bytes = readFileSync(join(directory, t.cellsFile));
    assert.equal(sha(bytes), t.cellsSha256); assert.equal(bytes.length, c.neurons * 3 * 2);
    return new Uint16Array(Uint8Array.from(bytes).buffer);
  };
  const rows = held.filter((t) => t.family !== "none").map((t) => {
    const control = held.find((r) => r.context === t.context && r.seed === t.seed && r.family === "none")!;
    for (const second of [0, 1]) for (const field of ["command", "readouts", "hz", "state"] as const) assert.deepEqual(t.bins[second][field], control.bins[second][field]);
    for (let s = 0; s < SECONDS; s++) assert.deepEqual(t.bins[s].state, control.bins[s].state);
    const finalCommand = delta(t.bins[66].command, control.bins[66].command);
    const finalPopulation = delta(t.bins[66].hz, control.bins[66].hz);
    const finalReadout = delta(t.bins[66].readouts, control.bins[66].readouts);
    const finalFiveCommand = delta(mean(t.bins.slice(62), "command"), mean(control.bins.slice(62), "command"));
    const finalFivePopulation = delta(mean(t.bins.slice(62), "hz"), mean(control.bins.slice(62), "hz"));
    const blocks = [52, 57, 62].map((s) => delta(mean(t.bins.slice(s, s + 5), "hz"), mean(control.bins.slice(s, s + 5), "hz")));
    const latePopulationFailures = Object.keys(blocks[0]).filter((k) => blocks.some((b) => Math.abs(b[k]) > 1));
    const spikes = loadCells(t), baseline = loadCells(control);
    const cells = Array.from({ length: c.neurons }, (_, i) => {
      const rate = [0, 1, 2].map((b) => spikes[b * c.neurons + i] / 5);
      const reference = [0, 1, 2].map((b) => baseline[b * c.neurons + i] / 5);
      const excess = rate.map((r, b) => r - reference[b]);
      return { bodyId: c.rootId[i], type: c.columns.type.value(i), side: c.columns.side.value(i), region: REGIONS[regions[i]].id,
        rate, reference, excess, persistent: excess.every((d) => Math.abs(d) >= 20) };
    });
    const persistent = cells.filter((r) => r.persistent);
    const largest = cells.sort((a, b) => Math.abs(b.excess[2]) - Math.abs(a.excess[2]) || a.bodyId - b.bodyId).slice(0, 20);
    const originalFailedCommands = COMMANDS.filter((k) => Math.abs(finalCommand[k]) > 0.05);
    const failedCommands = COMMANDS.filter((k) => Math.abs(finalCommand[k]) > effectiveTolerance(locked.contexts[t.context], k));
    const failedPopulations = Object.keys(finalPopulation).filter((k) => Math.abs(finalPopulation[k]) > 1);
    const readoutLimits: Record<string, number> = { DNg100: 2, "DNa02 left": 2, "DNa02 right": 2, MDN: 2, DNp01: 10, flight: 6, DNg12: 3, MN9: 2, pIP10: 2 };
    const lateReadout = delta(mean(t.bins.slice(62), "readouts"), mean(control.bins.slice(62), "readouts"));
    const failedReadouts = Object.keys(lateReadout).filter((k) => Math.abs(lateReadout[k]) > readoutLimits[k]);
    const drivenSpikes = t.bins.slice(2, 7).reduce((s, b) => s + b.drivenSpikes, 0);
    const weightedSpikes = t.bins.slice(2, 7).reduce((s, b) => s + b.weightedSpikes, 0);
    const excursions = t.bins.slice(7).filter((b) => COMMANDS.some((k) => Math.abs(b.command[k] - control.bins[b.second].command[k]) > effectiveTolerance(locked.contexts[t.context], k)) ||
      Object.keys(b.hz).some((k) => Math.abs(b.hz[k] - control.bins[b.second].hz[k]) > 1)).map((b) => b.second);
    const sustainedFromSecond = excursions.length === 0 ? 7 : excursions.at(-1)! < 66 ? excursions.at(-1)! + 1 : null;
    return { seed: t.seed, context: t.context, family: t.family, glomerulus: t.glomerulus, rate: t.rate,
      sustainedCommandPopulationRecoveryFromSecond: sustainedFromSecond, washoutExcursionBins: excursions,
      finalCommand, finalReadout, finalPopulation, finalFiveCommand, finalFivePopulation, originalFailedCommands, failedCommands, failedPopulations,
      latePopulationFailures, lateReadout, failedReadouts, persistent, largest, drivenSpikes, weightedSpikes,
      expectedOpportunities: t.matching[t.glomerulus].count * t.rate * 5,
      toleranceBasis: locked.contexts[t.context].qualified ? "drift-adjusted practical bound" : "original strict bound",
      recovered: failedCommands.length === 0 && failedPopulations.length === 0 && failedReadouts.length === 0,
      persistenceClear: latePopulationFailures.length === 0 && persistent.length === 0,
      onCommand: delta(mean(t.bins.slice(2, 7), "command"), mean(control.bins.slice(2, 7), "command")),
      onPopulation: delta(mean(t.bins.slice(2, 7), "hz"), mean(control.bins.slice(2, 7), "hz")),
      timeCourse: t.bins.map((b, i) => ({ second: i, command: delta(b.command, control.bins[i].command), readouts: delta(b.readouts, control.bins[i].readouts), hz: delta(b.hz, control.bins[i].hz) })) };
  });
  const monotonic = [21, 22, 23].flatMap((seed) => GLOMERULI.map((g) => {
    const rs = rows.filter((r) => r.context === "pinned" && r.family === "odor" && r.seed === seed && r.glomerulus === g).sort((a, b) => a.rate - b.rate);
    return { seed, glomerulus: g, rates: rs.map((r) => r.onPopulation.LH), increasing: rs.every((r, i) => i === 0 || r.onPopulation.LH > rs[i - 1].onPopulation.LH) };
  }));
  const pinnedOdor = rows.filter((r) => r.context === "pinned" && r.family === "odor");
  const matchingQualified = Object.values(trials[0].matching).every((m) => m.ratio >= 0.8 && m.ratio <= 1.2);
  const contrasts = rows.filter((r) => r.family === "odor").map((odor) => {
    const bristle = rows.find((r) => r.family === "bristle" && r.seed === odor.seed && r.context === odor.context && r.glomerulus === odor.glomerulus && r.rate === odor.rate)!;
    const driveRatio = bristle.weightedSpikes / odor.weightedSpikes;
    const expectedRatio = trials[0].matching[odor.glomerulus].ratio;
    const qualified = expectedRatio >= 0.8 && expectedRatio <= 1.2 && Number.isFinite(driveRatio) && driveRatio >= 0.8 && driveRatio <= 1.2;
    const magnitude = (r: typeof odor) => Math.max(...COMMANDS.map((k) => Math.abs(r.finalCommand[k]) / effectiveTolerance(locked.contexts[r.context], k)));
    return { context: odor.context, seed: odor.seed, glomerulus: odor.glomerulus, rate: odor.rate, driveRatio, qualified,
      odorMagnitude: magnitude(odor), bristleMagnitude: magnitude(bristle),
      magnitudeContrast: magnitude(odor) - magnitude(bristle),
      commandContrast: Object.fromEntries(COMMANDS.map((k) => [k, Math.abs(odor.finalCommand[k]) - Math.abs(bristle.finalCommand[k])])),
      outcome: !qualified ? "unqualified comparator" : odor.recovered ? bristle.recovered ? "both recover" : "bristle fails" : bristle.recovered ? "odor fails" : "both fail" };
  });
  const contrastSummary = ["pinned", "wandering"].flatMap((context) => GLOMERULI.flatMap((g) => (context === "pinned" ? [...RATES] : [100]).map((rate) => {
    const rs = contrasts.filter((r) => r.context === context && r.glomerulus === g && r.rate === rate);
    return { context, glomerulus: g, rate, qualified: rs.every((r) => r.qualified),
      commands: Object.fromEntries(COMMANDS.map((k) => {
        const cs = rs.map((r) => r.commandContrast[k]);
        return [k, { mean: cs.reduce((s, v) => s + v, 0) / cs.length, range: [Math.min(...cs), Math.max(...cs)], excessEverySeed: rs.every((r) => r.qualified) && cs.every((v) => v > 0.05) }];
      })) };
  })));
  const interaction = GLOMERULI.map((g) => ({ glomerulus: g, seeds: [21, 22, 23].map((seed) => {
    const a = contrasts.find((r) => r.context === "pinned" && r.seed === seed && r.glomerulus === g && r.rate === 100)!;
    const b = contrasts.find((r) => r.context === "wandering" && r.seed === seed && r.glomerulus === g && r.rate === 100)!;
    return { seed, qualified: a.qualified && b.qualified, commandContrast: delta(a.commandContrast, b.commandContrast) };
  }) }));
  console.log(JSON.stringify({ model: locked.model, calibrationSha256: sha(lockedBytes), calibration: locked.contexts,
    matching: trials[0].matching, matchingQualified, contrasts, contrastSummary, interaction, monotonic,
    recoveryGate: pinnedOdor.every((r) => r.recovered && r.persistenceClear) && monotonic.every((m) => m.increasing), rows }, null, 2));
}
