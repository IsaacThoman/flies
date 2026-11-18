// What the brain does at rest against what real neurons do at rest, and what
// the made-up visual background is needed for (README, Spontaneous behaviour):
//
//   node packages/brain/scripts/resting.ts [--part rates|background|mi9] [--seeds 1,2,3] [--minutes 10] [--rows 1,0.5,0.25,0,rate] [--path connectome.bin]
//
// (rates) each cell type whose resting rate has been measured in a fly, at rest
//     standing with the eyes shut for --minutes, against the measurement;
//     DNa02 apart while the diagnostic observer has the fly walking and not.
// (background) resting behaviour with the background's wandering at its size,
//     at half, at a quarter and held still, each at the same mean level (the
//     logistic's bias moved so that its mean over the wandering stays what it
//     is): walking, bouts, the longest pause, the share of time in bouts over
//     3 s, turns and DNa02; and, as the row "rate", the background's rate
//     halved with its wandering as it is. --rows picks rows.
// (mi9) an experiment, not the model: Mi9's tonic release in the light, as
//     a steady drive on every neuron it synapses onto at the lamina's full
//     200 Hz (the drive that rate would give: synapses × gain × rate × the
//     synaptic time constant), and its fall under brightening as
//     withdrawals of Mi9's release, at the rate the input stage's sustained
//     contrast gives each L3, shared among the Mi9s each L3 synapses onto by
//     its synapses. The battery's motion and looming stimuli with and without.
//
// Seeds 1 to 3 by default. The background part takes about half an hour at 10 minutes.

import { parseArgs } from "node:util";
import type { Connectome } from "../src/format.ts";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../src/node.ts";
import { BehaviorObserver } from "../src/observer.ts";
import { buildWeights } from "../src/params.ts";
import { FlyBrain } from "../src/runtime.ts";
import { INTERNAL_STATE } from "../src/state.ts";
import { BATTERY, facetAngles, render } from "../src/stimuli.ts";
import type { Stimulus } from "../src/stimuli.ts";
import { RESTING_SENSES } from "../src/types.ts";
import { RETINA } from "../src/vision.ts";

const { values } = parseArgs({
  options: {
    part: { type: "string" },
    seeds: { type: "string", default: "1,2,3" },
    minutes: { type: "string", default: "10" },
    rows: { type: "string", default: "1,0.5,0.25,0,rate" },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
  },
});
const seeds = values.seeds.split(",").map(Number);
const minutes = Number(values.minutes);
const connectome = readConnectomeFile(values.path);
const TICK = 16;
const type = (i: number) => connectome.columns.type.value(i);

/** The cell types with a resting rate measured in a fly (README, Spontaneous behaviour, where each is from). */
const MEASURED: readonly { label: string; test: (t: string) => boolean; measured: string }[] = [
  { label: "Kenyon cells", test: (t) => /^KC/.test(t), measured: "0.1 Hz (Turner et al. 2008)" },
  { label: "uniglomerular projection neurons", test: (t) => /_(ad|l|v|lv)PN$/.test(t), measured: "4.6 Hz, from the ORNs (Turner et al. 2008)" },
  { label: "MBON-α3 (MBON14)", test: (t) => t === "MBON14", measured: "12.1 Hz, explant (Hafez et al. 2023)" },
  { label: "l-LNv", test: (t) => t === "l-LNv", measured: "1.4 Hz dark, 3.0 light, explant (Sheeba et al. 2008)" },
  { label: "DN1p", test: (t) => /^DN1p/.test(t), measured: "about 10 Hz in the morning, near 0 at dusk, explant (Flourakis et al. 2015)" },
  { label: "the labellum's sugar, bitter and water taste neurons", test: (t) => /^(LB3[abc]|LB1[a-d])$/.test(t), measured: "about 1 Hz (Dweck & Carlson 2023)" },
  { label: "giant fiber (DNp01)", test: (t) => t === "DNp01", measured: "no spontaneous spikes reported" },
];

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(q * (s.length - 1))] : 0;
};

/** Resting behaviour for --minutes after 2 s, with a per-tick hook; walking bouts and pauses as the observer counts them. */
function rest(brain: FlyBrain, each?: (walking: boolean, rates: Record<string, number>) => void) {
  for (let t = 0; t < 2000; t += TICK) brain.tick(TICK, RESTING_SENSES);
  const observer = new BehaviorObserver();
  const bouts: number[] = [];
  const pauses: number[] = [];
  let bout = 0;
  let pause = 0;
  let walked = 0;
  for (let t = 0; t < minutes * 60_000; t += TICK) {
    const state = brain.tick(TICK, RESTING_SENSES);
    observer.observe(state.command, TICK / 1000);
    const walking = observer.tally.walking > walked;
    walked = observer.tally.walking;
    each?.(walking, state.stats.rates);
    if (walking) {
      bout += TICK / 1000;
      if (pause > 0) pauses.push(pause);
      pause = 0;
    } else {
      pause += TICK / 1000;
      if (bout > 0) bouts.push(bout);
      bout = 0;
    }
  }
  return { tally: observer.tally, bouts, pauses };
}

function rates() {
  console.log(`(rates) Resting rates against the fly's: eyes shut, standing, ${minutes} minutes after 2 s, seeds ${seeds.join(", ")}.`);
  const rows = MEASURED.map(() => [] as string[]);
  const dna02: string[] = [];
  for (const seed of seeds) {
    const brain = new FlyBrain(connectome, { seed });
    brain.sim.setRecording(true);
    const sum = { walking: 0, still: 0, nWalking: 0, nStill: 0 };
    rest(brain, (walking, r) => {
      const mean = (r["DNa02 left"] + r["DNa02 right"]) / 2;
      if (walking) {
        sum.walking += mean;
        sum.nWalking++;
      } else {
        sum.still += mean;
        sum.nStill++;
      }
    });
    // The recording counts from before the 2 s of rest.
    const seconds = minutes * 60 + 2;
    const recording = brain.sim.recording!;
    MEASURED.forEach(({ test }, k) => {
      let n = 0;
      let spikes = 0;
      for (let i = 0; i < connectome.neurons; i++) {
        if (!test(type(i))) continue;
        n++;
        spikes += recording[i];
      }
      rows[k].push(n ? (spikes / n / seconds).toFixed(2) : "-");
    });
    dna02.push(`${(sum.still / Math.max(1, sum.nStill)).toFixed(1)} still, ${(sum.walking / Math.max(1, sum.nWalking)).toFixed(1)} walking`);
  }
  MEASURED.forEach(({ label, measured }, k) => console.log(`  ${label.padEnd(52)} ${rows[k].join(", ").padEnd(20)} Hz; the fly: ${measured}`));
  console.log(`  ${"DNa02 (smoothed, both sides' mean)".padEnd(52)} ${dna02.join("; ")} Hz; the fly: about 5 immobile, 25 to 30 walking (Rayshubskiy et al. 2025)`);
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));
/** The mean of logistic(bias + spread × z) over a standard normal z, by the trapezoid rule on ±10. */
function meanLevel(bias: number, spread: number) {
  const steps = 4000;
  let total = 0;
  for (let s = 0; s <= steps; s++) {
    const z = -10 + (20 * s) / steps;
    total += (s === 0 || s === steps ? 0.5 : 1) * logistic(bias + spread * z) * Math.exp((-z * z) / 2);
  }
  return (total * (20 / steps)) / Math.sqrt(2 * Math.PI);
}
/** The bias that gives this mean level at this spread. */
function biasFor(level: number, spread: number) {
  let lo = -10;
  let hi = 10;
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2;
    if (meanLevel(mid, spread) < level) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function background() {
  const { arousal, scene, bias } = INTERNAL_STATE;
  const spread = Math.hypot(arousal.weight, scene.weight);
  const level = meanLevel(bias, spread);
  console.log(`\n(background) Resting behaviour with the background's wandering scaled, at its mean level (${level.toFixed(3)} of full), ${minutes} minutes, seeds ${seeds.join(", ")}.`);
  console.log("  wandering   bias    walking   bouts   mean bout   longest pause   in bouts over 3 s   turns left/right   DNa02 still/walking (Hz)");
  for (const row of values.rows.split(",")) {
    // "rate": the wandering as it is, the background's rate halved.
    const scale = row === "rate" ? 1 : Number(row);
    const b = row === "rate" ? bias : biasFor(level, spread * scale);
    const cells: string[][] = [[], [], [], [], [], [], []];
    for (const seed of seeds) {
      const parameters = { ...INTERNAL_STATE, arousal: { ...arousal, weight: arousal.weight * scale }, scene: { ...scene, weight: scene.weight * scale }, bias: b };
      const brain = new FlyBrain(connectome, { seed, internalState: parameters });
      if (row === "rate") for (const group of brain.wiring.background) group.maxRate /= 2;
      const dna = { walking: 0, still: 0, nWalking: 0, nStill: 0 };
      const { tally, bouts, pauses } = rest(brain, (walking, r) => {
        const mean = (r["DNa02 left"] + r["DNa02 right"]) / 2;
        if (walking) {
          dna.walking += mean;
          dna.nWalking++;
        } else {
          dna.still += mean;
          dna.nStill++;
        }
      });
      cells[0].push(`${((100 * tally.walking) / tally.seconds).toFixed(1)}%`);
      cells[1].push(String(tally.walkBouts));
      cells[2].push(`${(bouts.reduce((x, y) => x + y, 0) / Math.max(1, bouts.length)).toFixed(1)} s`);
      cells[3].push(`${quantile(pauses, 1).toFixed(1)} s`);
      cells[4].push(`${((100 * bouts.filter((x) => x > 3).reduce((x, y) => x + y, 0)) / tally.seconds).toFixed(0)}%`);
      cells[5].push(`${tally.turnsLeft}/${tally.turnsRight}`);
      cells[6].push(`${(dna.still / Math.max(1, dna.nStill)).toFixed(1)}/${(dna.walking / Math.max(1, dna.nWalking)).toFixed(1)}`);
    }
    console.log(`  ${(row === "rate" ? "rate ×0.5" : `×${scale}`).padEnd(10)}  ${b.toFixed(3).padStart(6)}   ${cells.map((c) => c.join(", ")).join("   ")}`);
  }
}

/** Mi9's tonic release as a drive on its targets, and its withdrawal under brightening (see the header). */
function mi9Tonic(brain: FlyBrain, c: Connectome) {
  const { maxRate, ambient: tauAmbient, floor } = RETINA;
  const tauSyn = brain.sim.tauSyn / 1000;
  const weights = buildWeights(c);
  const mi9 = c.find({ type: "Mi9" });
  const index = new Map<number, number>();
  mi9.forEach((i, k) => index.set(i, k));
  const drive = new Map<number, number>();
  for (const i of mi9) {
    for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) drive.set(c.post[e], (drive.get(c.post[e]) ?? 0) + weights.network.count[e] * weights.gain[i] * maxRate * tauSyn);
  }
  const targets = Uint32Array.from([...drive.keys()].sort((a, b) => a - b));
  brain.sim.addExcitability("Mi9 tonic", targets);
  brain.sim.setExcitability("Mi9 tonic", Float64Array.from(targets, (j) => drive.get(j)!));
  brain.sim.addRatedInput("Mi9 withdrawn", mi9, { withdraw: true });
  // Each L3's share of each Mi9's L3 synapses.
  const shares: { side: "left" | "right"; facet: number; mi9: number; share: number }[] = [];
  const fromL3 = new Float64Array(mi9.length);
  for (const side of ["left", "right"] as const) {
    brain.vision![side].l3.forEach((l3, facet) => {
      if (l3 < 0) return;
      for (let e = c.ptr[l3]; e < c.ptr[l3 + 1]; e++) {
        const k = index.get(c.post[e]);
        if (k === undefined) continue;
        shares.push({ side, facet, mi9: k, share: c.count[e] });
        fromL3[k] += c.count[e];
      }
    });
  }
  for (const s of shares) s.share /= fromL3[s.mi9];
  const ambient = { left: new Float64Array(brain.vision!.left.l3.length), right: new Float64Array(brain.vision!.right.l3.length) };
  const rates = new Float64Array(mi9.length);
  let open = false;
  /** The input stage's sustained brightening for each L3, from the light about to be shown. */
  return {
    stepped: targets.length,
    see(light: { left: Float32Array; right: Float32Array }, dt: number) {
      const keep = Math.exp(-dt / tauAmbient);
      for (const side of ["left", "right"] as const) {
        for (let k = 0; k < ambient[side].length; k++) {
          const x = Math.min(1, Math.max(0, light[side][k]));
          ambient[side][k] = open ? x + (ambient[side][k] - x) * keep : x;
        }
      }
      open = true;
      rates.fill(0);
      for (const { side, facet, mi9: k, share } of shares) {
        const x = Math.min(1, Math.max(0, light[side][facet]));
        rates[k] += share * Math.min(maxRate, Math.max(0, (maxRate * (x - ambient[side][facet])) / (ambient[side][facet] + floor)));
      }
      for (let k = 0; k < rates.length; k++) rates[k] = Math.min(maxRate, rates[k]);
      brain.sim.setRates("Mi9 withdrawn", rates);
    },
  };
}

function mi9() {
  const STAGES = ["Mi9", "Tm1", "Tm2", "TmY3", "T4a", "T4b", "T4c", "T4d", "LC4", "HS", "VS", "H2", "DNp01"];
  const of = (t: string) => (t === "HS" ? ["HSE", "HSN", "HSS"] : [t]);
  const chosen = /^(ON edge right|grating right|loom right$|brighten)/;
  const battery = BATTERY.filter((s) => chosen.test(s.name));
  console.log(`\n(mi9) An experiment: Mi9's tonic release and its fall under brightening. Seed ${seeds[0]}, mean rate over each stimulus (Hz), without / with.`);
  console.log(`  ${"".padEnd(30)}${STAGES.map((s) => s.padStart(12)).join("")}${"escape".padStart(12)}${"spikes/s".padStart(16)}`);
  const run = (stimulus: Stimulus, tonic: boolean) => {
    const brain = new FlyBrain(connectome, { seed: seeds[0] });
    const extra = tonic ? mi9Tonic(brain, connectome) : null;
    const groups = STAGES.map((t) => connectome.find({ type: of(t), side: stimulus.eye === "both" ? ["left", "right"] : [stimulus.eye] }));
    const angles = facetAngles(brain.eyes!);
    const light = { left: new Float32Array(angles.left.az.length), right: new Float32Array(angles.right.az.length) };
    const tick = 10;
    for (let t = 0; t < 1000; t += tick) {
      render(() => stimulus.ground, 0, angles, light);
      extra?.see(light, tick);
      brain.tick(tick, { ...RESTING_SENSES, light });
    }
    brain.sim.setRecording(true);
    let escape = 0;
    let spikes = 0;
    for (let t = 0; t < stimulus.seconds * 1000; t += tick) {
      render(stimulus.scene, t / 1000, angles, light);
      extra?.see(light, tick);
      const state = brain.tick(tick, { ...RESTING_SENSES, light });
      escape = Math.max(escape, state.command.escape);
      spikes += state.stats.spikes;
    }
    const recording = brain.sim.recording!;
    const mean = groups.map((g) => {
      let n = 0;
      for (const i of g) n += recording[i];
      return g.length ? n / g.length / stimulus.seconds : 0;
    });
    return { mean, escape, spikes: spikes / stimulus.seconds, stepped: extra?.stepped ?? 0 };
  };
  let stepped = 0;
  for (const stimulus of battery) {
    const a = run(stimulus, false);
    const b = run(stimulus, true);
    stepped = b.stepped;
    const pair = (x: number, y: number, digits = 1) => `${x.toFixed(digits)}/${y.toFixed(digits)}`.padStart(12);
    console.log(`  ${stimulus.name.padEnd(30)}${a.mean.map((x, k) => pair(x, b.mean[k])).join("")}${pair(a.escape, b.escape, 2)}${`${Math.round(a.spikes / 1000)}k/${Math.round(b.spikes / 1000)}k`.padStart(16)}`);
  }
  console.log(`  Mi9's targets, stepped every step with their drive: ${stepped.toLocaleString("en-US")} neurons.`);
}

const part = values.part;
if (!part || part === "rates") rates();
if (!part || part === "background") background();
if (!part || part === "mi9") mi9();
