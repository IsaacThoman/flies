// The regions of the nervous system (src/regions.ts) on the real connectome:
// what each one holds, and how fast it fires at rest and under every stimulus
// report.ts runs, which is what each region's fullHz is chosen from.
//
//   node packages/brain/scripts/regions.ts [--seed 1] [--path connectome.bin]
//
// Prints two Markdown tables for the README (Regions). The first gives each
// region's neurons by what put them there, the largest groups first: super
// class, class or sub class where the rule reads it, and the cell type's
// prefix (its letters before the first digit). The second gives each region's
// smoothed rate (src/regions.ts, REGION_TAU) at rest, its mean over a minute
// after 2 s of rest; its peak, the highest it reaches under any stimulus, and
// which; and its fullHz, then says whether every fullHz is the rule's. The
// stimuli, each from a fresh brain: each sense alone at full strength for 1 s
// after 2 s of rest, every sense at once the same way, the game's fallback looming pulse
// in the left eye (report.ts, a), and every stimulus of the vision battery
// with the eyes open, after 1 s of its steady scene (report.ts, e).
//
// The rule: full is the peak, but at least four times the resting rate, so
// that rest stays a faint glow (at most a quarter of full), and at least 5 Hz,
// so that a region where only a few of its neurons ever fire never looks busy;
// a left/right pair shares the larger, so that the display shows where one
// side fires more than the other; rounded up to two significant figures.
// Peaks are of the smoothed rate, sampled every 10 ms. About half a minute.

import { parseArgs } from "node:util";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../src/node.ts";
import { REGIONS, REGION_RATE_NAMES, regionOf } from "../src/regions.ts";
import { FlyBrain } from "../src/runtime.ts";
import { BATTERY, facetAngles, render } from "../src/stimuli.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";
import type { ScalarSense } from "../src/io.ts";

const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "1" },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
  },
});
const seed = Number(values.seed);
const connectome = readConnectomeFile(values.path);
const TICK = 10;
const count = REGIONS.length;
const brain = () => new FlyBrain(connectome, { seed });
const rest = (b: FlyBrain, ms: number) => {
  for (let t = 0; t < ms; t += TICK) b.tick(TICK, RESTING_SENSES);
};

// What each region holds.
const sizes = new Uint32Array(count);
{
  const { superClass, class: klass, subClass, type } = connectome.columns;
  const regions = regionOf(connectome);
  const groups = REGIONS.map(() => new Map<string, number>());
  for (let i = 0; i < connectome.neurons; i++) {
    const t = type.value(i);
    const prefix = t === "" ? "untyped" : t.replace(/[0-9].*$/, "") || t;
    // The cord's motor and sensory neurons are placed by sub class, everything else by class where it is read.
    const bySub = ["vnc_motor", "vnc_sensory", "sensory_ascending"].includes(superClass.value(i));
    const detail = [superClass.value(i), bySub ? subClass.value(i) : klass.value(i), prefix].filter(Boolean).join(" · ");
    const group = groups[regions[i]];
    group.set(detail, (group.get(detail) ?? 0) + 1);
    sizes[regions[i]]++;
  }
  console.log("| Region | Neurons | What put them there (neurons) |\n|---|---|---|");
  REGIONS.forEach((region, r) => {
    const parts = [...groups[r]].sort((a, b) => b[1] - a[1]);
    const shown = parts.slice(0, 6).map(([detail, n]) => `${detail} ${n.toLocaleString("en-US")}`);
    if (parts.length > 6) shown.push(`${parts.length - 6} more groups ${parts.slice(6).reduce((sum, [, n]) => sum + n, 0).toLocaleString("en-US")}`);
    console.log(`| \`${region.id}\` | ${sizes[r].toLocaleString("en-US")} | ${shown.join("; ")} |`);
  });
}

/** Each region's mean and peak smoothed rate over ms of ticks, the senses (and light) given by the tick's time. */
function measure(b: FlyBrain, ms: number, senses: (t: number) => BrainSenses) {
  const mean = new Float64Array(count);
  const peak = new Float64Array(count);
  let n = 0;
  for (let t = 0; t < ms; t += TICK) {
    const { rates } = b.tick(TICK, senses(t)).stats;
    for (let r = 0; r < count; r++) {
      const hz = rates[REGION_RATE_NAMES[r]];
      mean[r] += hz;
      if (hz > peak[r]) peak[r] = hz;
    }
    n++;
  }
  for (let r = 0; r < count; r++) mean[r] /= n;
  return { mean, peak };
}

const FULL: { [K in ScalarSense]: BrainSenses[K] } = { loomLeft: 1, loomRight: 1, touch: 1, bumpLeft: 1, bumpRight: 1, wind: 1, sweet: 1, grounded: false, maleTaste: 1, wingbeat: 1, bitter: 1, water: 1 };
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
const under: string[] = REGIONS.map(() => "");
for (const { name, run } of conditions) {
  const peaks = run();
  for (let r = 0; r < count; r++) {
    if (peaks[r] > peak[r]) {
      peak[r] = peaks[r];
      under[r] = name;
    }
  }
}

/** Rounded up to two significant figures. */
const roundUp = (x: number) => {
  const step = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Number((Math.ceil(x / step - 1e-9) * step).toPrecision(2));
};
const own = (r: number) => Math.max(peak[r], 4 * atRest[r], 5);
const partner = (r: number) => {
  const id = REGIONS[r].id;
  const other = id.endsWith("-left") ? id.replace(/-left$/, "-right") : id.endsWith("-right") ? id.replace(/-right$/, "-left") : id;
  return REGIONS.findIndex((region) => region.id === other);
};
const suggested = (r: number) => roundUp(Math.max(own(r), own(partner(r))));
const hz = (x: number) => (x < 0.005 ? "0" : x < 10 ? x.toFixed(2) : x.toFixed(1));

console.log(`\nSeed ${seed}.\n\n| Region | Neurons | Rest (Hz) | Peak (Hz) | Under | fullHz |\n|---|---|---|---|---|---|`);
REGIONS.forEach((region, r) => {
  console.log(`| \`${region.id}\` | ${sizes[r].toLocaleString("en-US")} | ${hz(atRest[r])} | ${hz(peak[r])} | ${peak[r] < 0.005 ? "-" : under[r]} | ${region.fullHz} |`);
});
const differ = REGIONS.flatMap((region, r) => (suggested(r) === region.fullHz ? [] : [`${region.id} (the rule gives ${suggested(r)})`]));
console.log(differ.length === 0 ? "\nEvery fullHz is the rule's." : `\nNot the rule's fullHz: ${differ.join(", ")}.`);
