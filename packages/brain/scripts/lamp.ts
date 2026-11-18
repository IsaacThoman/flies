// A light beside a still fly, open loop: does the turn command lean toward it?
//
//   node packages/brain/scripts/lamp.ts [--azimuth 90] [--radius 18] [--seconds 60] [--seeds 1,2,4]
//
// The eyes see a steady dusk scene as the game adapts it (sky 0.3 above the
// horizon, table 0.24 below; docs/simulation.md, A light on the table) for 3 s,
// then a disc as bright as the screen goes, `--radius` degrees across its
// half-width, `--azimuth` degrees from straight ahead on the horizon, on the
// right or the left. Nothing moves: the fly's turns don't move the light across
// its eyes. Each run is set against an unlit control of the same seed. Per
// seed and side: the mean turn command toward the light, less the control's,
// over the whole run and in windows after the light comes on, and the unlit
// control's own mean turn command, which the visual background sets.

import { parseArgs } from "node:util";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../src/node.ts";
import { FlyBrain } from "../src/runtime.ts";
import { RESTING_SENSES } from "../src/types.ts";

const { values } = parseArgs({
  options: {
    azimuth: { type: "string", default: "90" },
    radius: { type: "string", default: "18" },
    seconds: { type: "string", default: "60" },
    seeds: { type: "string", default: "1,2,4" },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
  },
});
const c = readConnectomeFile(values.path);
const azimuth = (Number(values.azimuth) * Math.PI) / 180;
const radius = (Number(values.radius) * Math.PI) / 180;
const seconds = Number(values.seconds);
const seeds = values.seeds.split(",").map(Number);
const SKY = 0.3;
const TABLE = 0.24;
const TICK = 100;
const WINDOWS = [0, 1, 3, 10, 30, 60, 120, 300].filter((s) => s < seconds).concat(seconds);

function run(seed: number, lamp: "left" | "right" | null) {
  const brain = new FlyBrain(c, { seed });
  if (!brain.eyes || !brain.vision) throw new Error("this connectome has no eyes");
  const light = { left: new Float32Array(brain.vision.retina.left.facets), right: new Float32Array(brain.vision.retina.right.facets) };
  const show = (lit: boolean) => {
    for (const side of ["left", "right"] as const) {
      const d = brain.eyes![side].directions;
      for (let k = 0; k < light[side].length; k++) {
        const x = d[3 * k], y = d[3 * k + 1], z = d[3 * k + 2];
        let v = z >= 0 ? SKY : TABLE;
        if (lit && lamp) {
          // Head frame: x right, y ahead, z up.
          const lx = (lamp === "right" ? 1 : -1) * Math.sin(azimuth), ly = Math.cos(azimuth);
          if (Math.acos(Math.min(1, x * lx + y * ly)) < radius) v = 1;
        }
        light[side][k] = v;
      }
    }
  };
  const senses = { ...RESTING_SENSES, light };
  show(false);
  for (let t = 0; t < 3000; t += TICK) brain.tick(TICK, senses);
  show(true);
  const turn: number[] = [];
  let spikes = 0;
  for (let t = 0; t < seconds * 1000; t += TICK) {
    const state = brain.tick(TICK, senses);
    turn.push(state.command.turn);
    spikes += state.stats.spikes;
  }
  return { turn, spikes: spikes / seconds };
}

const mean = (v: readonly number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const fixed = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(3);
console.log(`A light ${values.radius}° in radius, ${values.azimuth}° from ahead, for ${seconds} s; turn toward it less the unlit control's`);
console.log(`  seed side   whole run  ${WINDOWS.slice(0, -1).map((a, i) => `${a}-${WINDOWS[i + 1]} s`.padStart(9)).join(" ")}   spikes/s (unlit)   unlit turn`);
const all: number[] = [];
for (const seed of seeds) {
  const off = run(seed, null);
  for (const side of ["right", "left"] as const) {
    const lit = run(seed, side);
    const toward = side === "right" ? 1 : -1;
    const d = lit.turn.map((x, i) => (x - off.turn[i]) * toward);
    all.push(mean(d));
    const windows = WINDOWS.slice(0, -1).map((a, i) => fixed(mean(d.slice((a * 1000) / TICK, (WINDOWS[i + 1] * 1000) / TICK))).padStart(9));
    console.log(`  ${String(seed).padStart(4)} ${side.padEnd(6)} ${fixed(mean(d)).padStart(9)}  ${windows.join(" ")}   ${Math.round(lit.spikes)} (${Math.round(off.spikes)})   ${fixed(mean(off.turn))}`);
  }
}
const m = mean(all);
const sd = Math.sqrt(all.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, all.length - 1));
console.log(`  mean ${fixed(m)} ± ${sd.toFixed(3)}, ${all.filter((x) => x > 0).length} of ${all.length} toward`);
