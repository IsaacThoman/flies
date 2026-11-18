// What the flight power motor neurons fire at, against what a fly's fire at,
// and whether the brain's own loop would hold the fly up on a physiological
// scale (packages/brain/README.md, `wings`' scale).
//
//   node packages/brain/scripts/flight-scale.ts [--seeds 1,2,3] [--minutes 10] [--part a|b] [--path connectome.bin]
//
// The 24 DLM and DVM motor neurons' mean rate is read as `wings` is, smoothed
// over 100 ms (io.ts READOUTS, `flight`). A flying fly's fire at about 3 to 12 Hz
// (Gordon & Dickinson 2006; Hürkey et al. 2023), so the fixed endpoints are
// the share of time over 2.7 Hz, the lowest rate in flight in Gordon &
// Dickinson's Figure 1e, and over 5 Hz, their typical rate in flight.
//
//   (a) Rest standing for --minutes (split by whether `walk` is past the
//       body's 0.3) and in the air for a minute; each sense alone at full
//       strength for 3 s after 2 s of rest; the eyes open on a steady white
//       for 5 s and a dark disc looming from the front; the hand-wired loom
//       on both sides for 300 ms; and a flight's 5 s in the air, the wings'
//       sensors fed the drive it flies with (as wingbeat.ts (c)), with and
//       without the body's floor.
//   (b) The loop on a physiological scale: `wings` as 0.6 (what holds the
//       fly up) at HOLD Hz, from a take-off's 0.62, in the air with the wings'
//       sensors fed that drive and no floor, for 10 s: how long it stays at
//       0.6 or more, and what it does after.

import { parseArgs } from "node:util";
import { TOUCH_SENSES } from "../src/io.ts";
import type { ScalarSense } from "../src/io.ts";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../src/node.ts";
import { FlyBrain } from "../src/runtime.ts";
import { BATTERY, facetAngles, render } from "../src/stimuli.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";

const { values } = parseArgs({
  options: {
    seeds: { type: "string", default: "1,2,3" },
    minutes: { type: "string", default: "10" },
    part: { type: "string" },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
  },
});
const seeds = values.seeds.split(",").map(Number);
const connectome = readConnectomeFile(values.path);
const TICK = 10;
/** The lowest rate in flight in Gordon & Dickinson 2006, Figure 1e, and their typical rate in flight, Hz. */
const LOWEST = 2.7;
const TYPICAL = 5;
/** The body's: what holds the fly up, the smoothing it reads commands with, a take-off's floor. */
const HOLDS = 0.6;
const SMOOTHING = 12;
const FLIGHT_WINGS = 0.62;
/** Rates taken to hold the fly up for (b): the typical one, and the ends of Gordon & Dickinson's measured range. */
const HOLD_HZ = [5, 3, 9];
const AIR: BrainSenses = { ...RESTING_SENSES, grounded: false };

const f = (x: number, d = 1) => x.toFixed(d);
const range = (xs: number[], d = 1) => `${f(Math.min(...xs), d)}–${f(Math.max(...xs), d)}`;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const rateOf = (b: FlyBrain, senses: BrainSenses) => b.tick(TICK, senses).stats.rates.flight ?? 0;

type Tally = { n: number; sum: number; peak: number; over: number; typical: number };
const tally = (): Tally => ({ n: 0, sum: 0, peak: 0, over: 0, typical: 0 });
const add = (t: Tally, hz: number) => {
  t.n++;
  t.sum += hz;
  t.peak = Math.max(t.peak, hz);
  if (hz > LOWEST) t.over++;
  if (hz > TYPICAL) t.typical++;
};
const show = (name: string, ts: Tally[]) =>
  console.log(
    `  ${name.padEnd(34)}mean ${range(ts.map((t) => t.sum / Math.max(1, t.n))).padEnd(10)} peak ${range(ts.map((t) => t.peak)).padEnd(11)} over ${LOWEST} Hz ${ts.map((t) => pct(t.over / Math.max(1, t.n))).join(" ").padEnd(20)} over ${TYPICAL} Hz ${ts.map((t) => pct(t.typical / Math.max(1, t.n))).join(" ")}`,
  );

function partA() {
  console.log(`(a) The 24 flight power motor neurons' mean rate, Hz, smoothed as read; ranges over seeds ${seeds.join(", ")}, shares by seed.`);
  const minutes = Number(values.minutes);
  const still: Tally[] = [];
  const walking: Tally[] = [];
  const air: Tally[] = [];
  for (const seed of seeds) {
    const b = new FlyBrain(connectome, { seed });
    const [s, w] = [tally(), tally()];
    for (let t = 0; t < minutes * 60_000; t += TICK) {
      const { command, stats } = b.tick(TICK, RESTING_SENSES);
      add(command.walk > 0.3 ? w : s, stats.rates.flight ?? 0);
    }
    still.push(s);
    walking.push(w);
    const a = tally();
    const c = new FlyBrain(connectome, { seed });
    for (let t = 0; t < 60_000; t += TICK) add(a, rateOf(c, AIR));
    air.push(a);
  }
  show(`at rest, standing (${minutes} min)`, still);
  show(`at rest, walking (${minutes} min)`, walking);
  console.log(`    walking ${walking.map((w, k) => pct(w.n / (w.n + still[k].n))).join(" ")} of the time`);
  show("at rest, in the air (1 min)", air);

  const FULL: Partial<Record<ScalarSense, number | boolean>> = { loomLeft: 1, loomRight: 1, touch: 1, bumpLeft: 1, bumpRight: 1, wind: 1, sweet: 1, maleTaste: 1, bitter: 1, water: 1, legsLeft: 1, legsRight: 1 };
  const senses: [string, BrainSenses][] = [
    ...Object.entries(FULL).map(([k, v]) => [k, { ...RESTING_SENSES, [k]: v }] as [string, BrainSenses]),
    ...TOUCH_SENSES.map((k) => [k, { ...RESTING_SENSES, [k]: 1 }] as [string, BrainSenses]),
    ["wingbeat, in the air", { ...AIR, wingbeat: 1 }],
  ];
  console.log("  Each sense alone at full strength, 3 s after 2 s of rest:");
  for (const [name, s] of senses) {
    show(`  ${name}`, seeds.map((seed) => {
      const b = new FlyBrain(connectome, { seed });
      for (let t = 0; t < 2000; t += TICK) b.tick(TICK, RESTING_SENSES);
      const t0 = tally();
      for (let t = 0; t < 3000; t += TICK) add(t0, rateOf(b, s));
      return t0;
    }));
  }

  const front = BATTERY.find((s) => s.name === "loom front")!;
  const eyes = (live: boolean) =>
    seeds.map((seed) => {
      const b = new FlyBrain(connectome, { seed });
      const angles = facetAngles(b.eyes!);
      const light = { left: new Float32Array(angles.left.az.length), right: new Float32Array(angles.right.az.length) };
      const white = () => 1;
      for (let t = 0; t < 1000; t += TICK) {
        render(white, 0, angles, light);
        b.tick(TICK, { ...RESTING_SENSES, light });
      }
      const t0 = tally();
      const ms = live ? front.seconds * 1000 : 5000;
      for (let t = 0; t < ms; t += TICK) {
        render(live ? front.scene : white, t / 1000, angles, light);
        add(t0, rateOf(b, { ...RESTING_SENSES, light }));
      }
      return t0;
    });
  show("eyes open, a steady white (5 s)", eyes(false));
  show("eyes open, a dark disc from the front", eyes(true));
  show("the hand-wired loom, both sides, 300 ms", seeds.map((seed) => {
    const b = new FlyBrain(connectome, { seed });
    for (let t = 0; t < 2000; t += TICK) b.tick(TICK, RESTING_SENSES);
    const t0 = tally();
    for (let t = 0; t < 300; t += TICK) add(t0, rateOf(b, { ...RESTING_SENSES, loomLeft: 1, loomRight: 1 }));
    return t0;
  }));
  for (const floor of [true, false]) {
    show(`a flight's 5 s, ${floor ? "with" : "without"} the floor`, seeds.map((seed) => {
      const b = new FlyBrain(connectome, { seed });
      for (let t = 0; t < 2000; t += TICK) b.tick(TICK, RESTING_SENSES);
      let smoothed = FLIGHT_WINGS;
      const t0 = tally();
      for (let t = 0; t < 5000; t += TICK) {
        const drive = floor ? Math.max(smoothed, FLIGHT_WINGS) : smoothed;
        const { command, stats } = b.tick(TICK, { ...AIR, wingbeat: drive });
        add(t0, stats.rates.flight ?? 0);
        smoothed += (command.wings - smoothed) * (1 - Math.exp(-SMOOTHING * (TICK / 1000)));
      }
      return t0;
    }));
  }
}

function partB() {
  console.log(`\n(b) The loop on a physiological scale: wings = ${HOLDS} at each rate below, from a take-off's ${FLIGHT_WINGS}, no floor, 10 s in the air.`);
  console.log("    By seed: seconds until it first falls below what holds it up (and stays below for 0.5 s), share of the 10 s at or above it, the motor neurons' mean rate over each second.");
  for (const hold of HOLD_HZ) {
    console.log(`  ${HOLDS} at ${hold} Hz (1 at ${f((hold / HOLDS) * 1, 1)} Hz):`);
    for (const seed of seeds) {
      const b = new FlyBrain(connectome, { seed });
      for (let t = 0; t < 2000; t += TICK) b.tick(TICK, RESTING_SENSES);
      let drive = FLIGHT_WINGS;
      let below = 0;
      let fell: number | null = null;
      let up = 0;
      const seconds: number[] = [];
      let second = 0;
      for (let t = TICK; t <= 10_000; t += TICK) {
        const hz = rateOf(b, { ...AIR, wingbeat: drive });
        const wings = Math.min(1, (HOLDS * hz) / hold);
        drive += (wings - drive) * (1 - Math.exp(-SMOOTHING * (TICK / 1000)));
        if (drive >= HOLDS) {
          up++;
          below = 0;
        } else if ((below += TICK) >= 500 && fell === null) fell = (t - below) / 1000;
        second += hz;
        if (t % 1000 === 0) {
          seconds.push(second / (1000 / TICK));
          second = 0;
        }
      }
      console.log(`    seed ${seed}: ${fell === null ? "held all 10 s" : `fell at ${f(fell, 2)} s`}, up ${pct(up / (10_000 / TICK))}; Hz ${seconds.map((x) => f(x)).join(" ")}`);
    }
  }
}

if (!values.part || values.part === "a") partA();
if (!values.part || values.part === "b") partB();
