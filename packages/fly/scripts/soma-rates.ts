// The region display rule applied to command-group rates, over three seeds.
// Strong-stimulus peaks and four times rest keep quiet cells from looking busy.
// Run offline before somata.ts when the model or dataset changes.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../../brain/src/node.ts";
import { FlyBrain } from "../../brain/src/runtime.ts";
import { READOUTS } from "../../brain/src/io.ts";
import type { ScalarSense } from "../../brain/src/io.ts";
import { RESTING_SENSES } from "../../brain/src/types.ts";
import type { BrainSenses } from "../../brain/src/types.ts";
import { BATTERY, facetAngles, render } from "../../brain/src/stimuli.ts";

const connectome = readConnectomeFile(DEFAULT_CONNECTOME_PATH);
const TICK = 10, count = READOUTS.length, RATE_NAMES = READOUTS.map((r) => r.name);
type Measurement = { seed: number; rows: { name: string; rest: number; peak: number; under: string }[] };
const results: Measurement[] = [];
for (const seed of [1, 2, 3]) {
  const brain = () => new FlyBrain(connectome, { seed });
  const rest = (b: FlyBrain, ms: number) => {
    for (let t = 0; t < ms; t += TICK) b.tick(TICK, RESTING_SENSES);
  };
  /** Each readout's mean and peak smoothed rate over ms of ticks, the senses (and light) given by the tick's time. */
  function measure(b: FlyBrain, ms: number, senses: (t: number) => BrainSenses) {
    const mean = new Float64Array(count);
    const peak = new Float64Array(count);
    let n = 0;
    for (let t = 0; t < ms; t += TICK) {
      const { rates } = b.tick(TICK, senses(t)).stats;
      for (let r = 0; r < count; r++) {
        const hz = rates[RATE_NAMES[r]];
        mean[r] += hz;
        if (hz > peak[r]) peak[r] = hz;
      }
      n++;
    }
    for (let r = 0; r < count; r++) mean[r] /= n;
    return { mean, peak };
  }

  const FULL: { [K in ScalarSense]: BrainSenses[K] } = { loomLeft: 1, loomRight: 1, touch: 1, bumpLeft: 1, bumpRight: 1, wind: 1, sweet: 1, grounded: false, maleTaste: 1, wingbeat: 1, bitter: 1, water: 1, legsLeft: 1, legsRight: 1 };
  const conditions: { name: string; run: () => Float64Array }[] = [];
  for (const key of Object.keys(FULL) as ScalarSense[]) {
    conditions.push({
      name: key === "grounded" ? "airborne" : key,
      run: () => {
        const b = brain();
        rest(b, 2000);
        return measure(b, 1000, () => ({ ...RESTING_SENSES, [key]: FULL[key] })).peak;
      },
    });
  }
  conditions.push({
    name: "everything at once",
    run: () => {
      const b = brain();
      rest(b, 2000);
      return measure(b, 1000, () => ({ ...RESTING_SENSES, ...FULL })).peak;
    },
  });
  conditions.push({
    name: "the looming pulse",
    run: () => {
      const b = brain();
      rest(b, 2000);
      return measure(b, 1000, (t) => ({ ...RESTING_SENSES, loomLeft: t < 80 ? 1 : Math.max(0, 1 - (t - 80) / 200) })).peak;
    },
  });
  for (const stimulus of BATTERY) {
    conditions.push({
      name: stimulus.name,
      run: () => {
        const b = brain();
        const angles = facetAngles(b.eyes!);
        const light = { left: new Float32Array(angles.left.az.length), right: new Float32Array(angles.right.az.length) };
        const seen = (scene: (typeof stimulus)["scene"], t: number) => {
          render(scene, t, angles, light);
          return { ...RESTING_SENSES, light };
        };
        measure(b, 1000, () => seen(() => stimulus.ground, 0));
        return measure(b, stimulus.seconds * 1000, (t) => seen(stimulus.scene, t / 1000)).peak;
      },
    });
  }

  const atRest = (() => {
    const b = brain();
    rest(b, 2000);
    return measure(b, 60_000, () => RESTING_SENSES).mean;
  })();
  const peak = new Float64Array(count);
  const under: string[] = READOUTS.map(() => "");
  for (const { name, run } of conditions) {
    const peaks = run();
    for (let r = 0; r < count; r++) {
      if (peaks[r] > peak[r]) {
        peak[r] = peaks[r];
        under[r] = name;
      }
    }
  }
  results.push({ seed, rows: RATE_NAMES.map((name, r) => ({ name, rest: atRest[r], peak: peak[r], under: under[r] })) });
  console.log("seed", seed, "complete");
}
const roundUp = (x: number) => {
  const step = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Number((Math.ceil(x / step - 1e-9) * step).toPrecision(2));
};
const rows = RATE_NAMES.map((name, r) => {
  let rest = 0, peak = 0, under = "", seed = 0;
  for (const s of results) {
    rest = Math.max(rest, s.rows[r].rest);
    if (s.rows[r].peak > peak) {
      peak = s.rows[r].peak;
      under = s.rows[r].under;
      seed = s.seed;
    }
  }
  return { name, rest, peak, under, seed, fullHz: 0 };
});
const own = rows.map((r) => Math.max(5, 4 * r.rest, r.peak));
own[1] = own[2] = Math.max(own[1], own[2]);
rows.forEach((r, i) => r.fullHz = roundUp(own[i]));
const report = {
  rule: "Canonical region-display rule applied to existing command readouts: peak across the sense/vision battery and seeds 1, 2, 3; at least four times maximum resting mean and 5 Hz; DNa02 left/right share the larger; rounded upward to two significant figures. Each readout retains its existing source smoothing tau. This is display normalization, not command decoding.",
  connectomeSha256: createHash("sha256").update(readFileSync(DEFAULT_CONNECTOME_PATH)).digest("hex"),
  brainTree: execFileSync("git", ["rev-parse", "HEAD:packages/brain"], { encoding: "utf8" }).trim(),
  results,
  rows,
};
writeFileSync(new URL("../src/nerves/soma-rates.ts", import.meta.url), `// Measured from the pinned connectome by scripts/soma-rates.ts.
// Display normalization only; the command decoder is unchanged.
export const SOMA_RATE_REFERENCE = ${JSON.stringify(report, null, 2)} as const;
`);
console.log(JSON.stringify(rows, null, 2));
