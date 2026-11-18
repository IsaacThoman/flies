// Whether the fly learns from the smells the world now gives off, measured as
// docs/smell-learning-protocol.md fixed before any measurement: the whole fly
// (the game's Life: the TypeScript brain, body and senses, no rendering), the
// same seed with the mushroom body's learning on and off.
//
//   node scripts/smell-learning.ts --part select --out <dir> [--seeds 1-12]
//   node scripts/smell-learning.ts --part train --out <dir> [--seeds 1-12] [--shard 1/4]
//   node scripts/smell-learning.ts --part long --out <dir> [--seeds 1-3] [--hours 6] [--shard 1/4]
//   node scripts/smell-learning.ts --reduce <dir>
//
// select: which KCs each of the world's odours fires, the brain alone, and
//   the pair the protocol's rule chooses (kcs.json in <dir>, which the other
//   parts read).
// train: two odour sources in the ethogram's arena, one paired with the
//   swoop's loom or with sugar for 300 s, then 180 s with neither.
// long: a fly set down beside the lab's fermenting fly food, living there for
//   --hours of game time from 08:00.
//
// Each trial is a file in <dir>, written when it ends; one already there is
// kept, so a stopped run carries on. --shard k/n runs every nth trial from
// the kth. --seconds train,test shortens the conditioning trials, to try
// the script out; the protocol's are 300,180.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { HEAD_AHEAD, HEAD_UP, Rhythm } from '@fly/body';
import { ODORANTS, TASTES, WORLDS, World } from '@fly/world';
import type { Food, Odor } from '@fly/world';
import { loadConnectome } from '@fly/brain';
import { Life } from '../apps/web/src/life.ts';
import { FlyBrain } from '../packages/brain/src/runtime.ts';
import { loom } from '../packages/brain/src/stimuli.ts';
import { RESTING_SENSES } from '../packages/brain/src/types.ts';
import { ARENA } from './ethogram.ts';
import { InProcessBrain, brainData } from './fuzz/brain.ts';

const DT = 0.01;
/** The world's odours, one food for each different smell (packages/world tastes.ts, SMELLS). */
const ODOURS: Record<string, Odor> = {
  fruit: TASTES.strawberry.odor,
  banana: TASTES.banana.odor,
  ketchup: TASTES.ketchup.odor,
  soda: TASTES.cola.odor,
  'fly food': TASTES.flyFood.odor,
};
const SELECT = { rest: 1, odour: 2, least: 0.01 } as const;
const TRAIN = { trainSeconds: 300, testSeconds: 180, x: 10, r: 3, near: 5, start: { x: 0, z: -12, yaw: 0 }, swoopEvery: 10, hour: 6, grey: 0.5 } as const;
const LONG = { hour: 8, food: { x: 36, z: -8 }, start: 6, window: 600, near: 2 } as const;
/** The compartments the loom's DANs (PPL1) and sugar's (PAM-γ4, PAM-β'2a) teach. */
const TAUGHT = ['g1', 'g2', 'ap1', 'a3', 'g4', 'bp2a'] as const;
/** Below this a connection has lost all but a twentieth of its strength. */
const GONE = 0.05;

const { values } = parseArgs({ options: { part: { type: 'string' }, seeds: { type: 'string' }, out: { type: 'string' }, shard: { type: 'string', default: '1/1' }, reduce: { type: 'string' }, hours: { type: 'string', default: '6' }, seconds: { type: 'string' } } });

const range = (text: string) => text.split(',').flatMap((part) => {
  const [a, b] = part.split('-').map(Number);
  return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
});
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** Which KCs each odour fires, the brain alone (eyes shut, at rest), at its food's edge strength at both antennae for 2 s after 1 s without. */
function select(seeds: number[]) {
  const connectome = loadConnectome(brainData());
  const sets: Record<string, Record<string, number[]>> = {};
  for (const seed of seeds) {
    sets[seed] = {};
    for (const [name, odor] of Object.entries(ODOURS)) {
      const brain = new FlyBrain(connectome, { seed });
      for (let t = 0; t < SELECT.rest * 1000; t += 10) brain.tick(10, RESTING_SENSES);
      brain.sim.setRecording(true);
      const senses = { ...RESTING_SENSES, odor: { left: [...odor], right: [...odor] } };
      for (let t = 0; t < SELECT.odour * 1000; t += 10) brain.tick(10, senses);
      const r = brain.sim.recording!;
      sets[seed][name] = [...brain.learning!.kcs].filter((i) => r[i] > 0);
    }
  }
  const all = [...new FlyBrain(connectome, { seed: 1 }).learning!.kcs];
  const kcs = all.length;
  const names = Object.keys(ODOURS);
  const share = Object.fromEntries(names.map((n) => [n, seeds.map((s) => sets[s][n].length / kcs)]));
  const jaccard = (a: number[], b: number[]) => {
    const bs = new Set(b);
    const both = a.filter((i) => bs.has(i)).length;
    const either = a.length + b.length - both;
    return either ? both / either : NaN;
  };
  const pairs = names.flatMap((a, i) => names.slice(i + 1).map((b) => ({ a, b, jaccard: mean(seeds.map((s) => jaccard(sets[s][a], sets[s][b]))) })));
  // The protocol's rule: of the odours firing at least 1% of the KCs in every seed, the pair whose KCs overlap least.
  const eligible = names.filter((n) => share[n].every((x) => x >= SELECT.least));
  const chosen = pairs.filter((p) => eligible.includes(p.a) && eligible.includes(p.b)).sort((x, y) => x.jaccard - y.jaccard)[0] ?? null;
  return { kcs, seeds, share, pairs, eligible, chosen, sets, all };
}

type Sets = ReturnType<typeof select>;
const readSets = (dir: string): Sets => JSON.parse(readFileSync(join(dir, 'kcs.json'), 'utf8'));

/** Mean factor of each taught compartment's learning connections from these KCs (both hemispheres). */
function byCompartment(brain: FlyBrain, kcs: Set<number>) {
  const learning = brain.learning!;
  const sums = Object.fromEntries(TAUGHT.map((id) => [id, { total: 0, n: 0, gone: 0 }]));
  const edges = learning.edges;
  for (let p = 0; p < edges.length; p++) {
    if (!kcs.has(learning.kcs[learning.edgeKC[p]])) continue;
    const g = learning.edgeGate[p];
    for (let m = learning.gatePtr[g]; m < learning.gatePtr[g + 1]; m++) {
      const id = learning.compartments[learning.gateCompartments[m]].split(' ')[0];
      if (!(id in sums)) continue;
      sums[id].total += learning.factors[p];
      sums[id].n++;
      if (learning.factors[p] < GONE) sums[id].gone++;
    }
  }
  return Object.fromEntries(TAUGHT.map((id) => [id, { mean: sums[id].n ? sums[id].total / sums[id].n : null, gone: sums[id].n ? sums[id].gone / sums[id].n : null, n: sums[id].n }]));
}

function changed(brain: FlyBrain) {
  let n = 0;
  for (const x of brain.learning!.factors) if (x !== 1) n++;
  return n;
}

const source = (x: number, z: number, r: number, sweet: number, odor: Odor, id: number): Food => ({ id, kind: 'patch', name: 'source', x, y: 0, z, r, sweet, water: 0, bitter: 0, amount: 1, pool: false, odor });

const swoop = loom('', 0, 90, 0.04);

/** Uniform grey, as the ethogram's arena, and during a swoop its dark disc from straight above. */
function draw(directions: Float32Array, out: Float32Array, at: number | null) {
  for (let k = 0; k < out.length; k++) {
    let lum: number = TRAIN.grey;
    if (at !== null) {
      const dx = directions[3 * k], dy = directions[3 * k + 1], dz = directions[3 * k + 2];
      const az = (Math.atan2(dx, dy) * 180) / Math.PI;
      const el = (Math.asin(Math.max(-1, Math.min(1, dz))) * 180) / Math.PI;
      lum = Math.min(lum, swoop.scene(at, az, el));
    }
    out[k] = lum;
  }
}

/** Time near each source, visits, how long each lasted, and when the first began. */
class Zones {
  time = [0, 0];
  visits = [0, 0];
  first: (number | null)[] = [null, null];
  #in = [false, false];
  step(t: number, near: boolean[]) {
    for (let s = 0; s < 2; s++) {
      if (near[s]) {
        this.time[s] += DT;
        if (!this.#in[s]) { this.visits[s]++; this.first[s] ??= t; }
      }
      this.#in[s] = near[s];
    }
  }
  summary() {
    const total = this.time[0] + this.time[1];
    return { time: this.time, visits: this.visits, meanVisit: this.time.map((x, s) => (this.visits[s] ? x / this.visits[s] : null)), first: this.first, preference: total > 0 ? (this.time[0] - this.time[1]) / total : null };
  }
}

/** One fly: training with the CS+ (source 0 in the results) paired with the US, then the test. */
function train(sets: Sets, seed: number, plus: string, minus: string, us: 'loom' | 'sugar', learns: boolean, seconds: { train: number; test: number }) {
  const cpu = process.cpuUsage();
  const driver = new InProcessBrain(brainData(), seed, learns);
  const brain = driver.brain;
  const life = new Life(new World(ARENA), driver);
  life.rhythm = new Rhythm(TRAIN.hour, { sunrise: 6, sunset: 18 });
  const eyes = driver.eyes!;
  const light = { left: new Float32Array(eyes.left.directions.length / 3), right: new Float32Array(eyes.right.directions.length / 3) };
  life.light = light;
  // Which side the CS+ is on alternates with the seed, so neither odour nor side is always the trained one.
  const side = seed % 2 === 0 ? 1 : -1;
  const sources = [source(side * TRAIN.x, 0, TRAIN.r, us === 'sugar' ? 1 : 0, ODOURS[plus], 1), source(-side * TRAIN.x, 0, TRAIN.r, 0, ODOURS[minus], 2)];
  life.pantry.foods.push(...sources);
  life.setDown(TRAIN.start.x, TRAIN.start.z, TRAIN.start.yaw);
  brain.sim.setRecording(true);
  const r = brain.sim.recording!;
  const kcs = sets.all;
  const plusSet = new Set(sets.sets[seed][plus]), minusSet = new Set(sets.sets[seed][minus]);
  const own = { plus: new Set([...plusSet].filter((i) => !minusSet.has(i))), minus: new Set([...minusSet].filter((i) => !plusSet.has(i))) };
  const head = { x: 0, y: 0, z: 0 };
  const near = [false, false];
  const look = (at: number | null) => {
    draw(eyes.left.directions, light.left, at);
    draw(eyes.right.directions, light.right, at);
  };
  look(null);
  const frame = (t: number, zones: Zones, swooping: number | null) => {
    life.body.point(HEAD_AHEAD, HEAD_UP, 0, head);
    for (let s = 0; s < 2; s++) near[s] = Math.hypot(head.x - sources[s].x, head.z - sources[s].z) <= TRAIN.near;
    zones.step(t, near);
    if (swooping !== null || swooping !== lastSwoop) look(swooping);
    lastSwoop = swooping;
    for (const f of sources) f.amount = 1;
    life.rhythm!.setTime(TRAIN.hour);
    life.hunger.level = 1;
    life.step(DT, performance.now());
  };
  let lastSwoop: number | null = null;
  const training = new Zones();
  let swoops = 0, eating = 0, swoopStart = -Infinity;
  for (let f = 0, n = Math.round(seconds.train / DT); f < n; f++) {
    const t = f * DT;
    if (us === 'loom' && near[0] && t - swoopStart >= TRAIN.swoopEvery) { swoopStart = t; swoops++; }
    frame(t, training, t - swoopStart < swoop.seconds ? t - swoopStart : null);
    if (life.eating) eating += DT;
  }
  let kcSpikes = 0, kcsFired = 0;
  for (const i of kcs) { kcSpikes += r[i]; if (r[i] > 0) kcsFired++; }
  const afterTraining = learns ? { changed: changed(brain), plus: byCompartment(brain, own.plus), minus: byCompartment(brain, own.minus) } : null;
  // The test: neither source sweet, nothing swooping.
  sources[0].sweet = 0;
  const test = new Zones();
  for (let f = 0, n = Math.round(seconds.test / DT); f < n; f++) frame(f * DT, test, null);
  const afterTest = learns ? { changed: changed(brain), plus: byCompartment(brain, own.plus), minus: byCompartment(brain, own.minus) } : null;
  const used = process.cpuUsage(cpu);
  return {
    part: 'train', seed, plus, minus, us, learns, side,
    ownKCs: { plus: own.plus.size, minus: own.minus.size, shared: plusSet.size - own.plus.size },
    training: { ...training.summary(), swoops, eating, kcSpikes, kcsFired },
    test: test.summary(),
    afterTraining, afterTest,
    cpuSeconds: (used.user + used.system) / 1e6,
  };
}

/** A fly beside the lab's fermenting fly food for `hours` of game time, the clock running from 08:00: where its learned weights go and what it does. */
function long(sets: Sets, seed: number, learns: boolean, hours: number) {
  const cpu = process.cpuUsage();
  const driver = new InProcessBrain(brainData(), seed, learns);
  const brain = driver.brain;
  const life = new Life(new World(WORLDS.lab), driver);
  life.rhythm = new Rhythm(LONG.hour, { sunrise: 6, sunset: 18 });
  const eyes = driver.eyes!;
  life.light = { left: new Float32Array(eyes.left.directions.length / 3).fill(TRAIN.grey), right: new Float32Array(eyes.right.directions.length / 3).fill(TRAIN.grey) };
  life.setDown(LONG.food.x + LONG.start, LONG.food.z, 0);
  brain.sim.setRecording(true);
  const r = brain.sim.recording!;
  const kcs = sets.all;
  const flyFood = new Set(sets.sets[seed]['fly food']);
  const smelly = life.pantry.foods.filter((f) => f.odor && f.odor.some((x) => x > 0));
  const head = { x: 0, y: 0, z: 0 };
  const windows = [];
  let w = { near: 0, walking: 0, sleeping: 0, eating: 0, airborne: 0, odour: 0, kcSpikes: 0 };
  let kcBefore = 0;
  const frames = Math.round((hours * 3600) / DT), per = Math.round(LONG.window / DT);
  for (let f = 0; f < frames; f++) {
    const p = life.body.position, x = p.x, z = p.z, onFeet = life.body.onFeet;
    life.step(DT, performance.now());
    life.body.point(HEAD_AHEAD, HEAD_UP, 0, head);
    if (smelly.some((s) => Math.hypot(head.x - s.x, head.z - s.z) <= s.r + LONG.near)) w.near += DT;
    if (onFeet && life.body.onFeet && Math.hypot(p.x - x, p.z - z) / DT > 0.5) w.walking += DT;
    if (!life.body.onFeet) w.airborne += DT;
    if (life.activity === 'sleeping') w.sleeping += DT;
    if (life.eating) w.eating += DT;
    let most = 0;
    for (let k = 0; k < ODORANTS.length; k++) most = Math.max(most, life.sensed.odor?.left[k] ?? 0, life.sensed.odor?.right[k] ?? 0);
    w.odour += most * DT;
    if ((f + 1) % per === 0) {
      let kcNow = 0;
      for (const i of kcs) kcNow += r[i];
      w.kcSpikes = kcNow - kcBefore;
      kcBefore = kcNow;
      const at = { hours: ((f + 1) * DT) / 3600, x: life.body.position.x, z: life.body.position.z, hunger: life.hunger.level, meals: life.meals };
      const learned = learns ? { changed: changed(brain), all: summarize(brain.learning!.factors), flyFood: byCompartment(brain, flyFood), memoryBytes: brain.memory().length } : null;
      windows.push({ ...at, ...w, odour: w.odour / LONG.window, learned });
      w = { near: 0, walking: 0, sleeping: 0, eating: 0, airborne: 0, odour: 0, kcSpikes: 0 };
    }
  }
  const memory = learns ? brain.memory() : null;
  const used = process.cpuUsage(cpu);
  return { part: 'long', seed, learns, hours, windows, memory: memory ? Buffer.from(memory).toString('base64') : null, cpuSeconds: (used.user + used.system) / 1e6 };
}

/** How many learning connections are below 1, below a half and nearly gone, and the lowest. */
function summarize(factors: Float64Array | Float32Array) {
  let below = 0, half = 0, gone = 0, lowest = 1;
  for (const x of factors) {
    if (x < 1) below++;
    if (x < 0.5) half++;
    if (x < GONE) gone++;
    lowest = Math.min(lowest, x);
  }
  return { below, half, gone, lowest };
}

// A seeded generator, so the bootstrap's interval is the same each time it is reduced.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** The mean and its 95% percentile bootstrap interval, 10,000 resamples. */
function bootstrap(xs: number[]): { mean: number; ci95: [number, number] } | null {
  if (!xs.length) return null;
  const random = mulberry32(1);
  const means = Array.from({ length: 10_000 }, () => mean(Array.from({ length: xs.length }, () => xs[Math.floor(random() * xs.length)]))).sort((a, b) => a - b);
  return { mean: mean(xs), ci95: [means[249], means[9749]] };
}

type Train = ReturnType<typeof train>;
type Long = ReturnType<typeof long>;
function reduce(dir: string) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'kcs.json');
  const runs = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  const report: Record<string, unknown> = {};
  if (existsSync(join(dir, 'kcs.json'))) {
    const s = readSets(dir);
    report.select = { kcs: s.kcs, share: Object.fromEntries(Object.entries(s.share).map(([k, v]) => [k, [Math.min(...v), Math.max(...v)]])), pairs: s.pairs, eligible: s.eligible, chosen: s.chosen };
  }
  const trains = runs.filter((r) => r.part === 'train') as Train[];
  for (const us of ['loom', 'sugar'] as const) {
    const on = trains.filter((t) => t.us === us && t.learns);
    if (!on.length) continue;
    const pairs = on.map((a) => ({ on: a, off: trains.find((b) => b.us === us && !b.learns && b.seed === a.seed && b.plus === a.plus) })).filter((p) => p.off) as { on: Train; off: Train }[];
    const d = (f: (t: Train) => number | null) => pairs.flatMap(({ on, off }) => { const a = f(on), b = f(off); return a === null || b === null ? [] : [a - b]; });
    const compartments = (when: 'afterTraining' | 'afterTest', which: 'plus' | 'minus') => Object.fromEntries(TAUGHT.map((id) => {
      const xs = on.map((t) => t[when]![which][id].mean).filter((x): x is number => x !== null);
      return [id, xs.length ? { mean: mean(xs), min: Math.min(...xs), max: Math.max(...xs) } : null];
    }));
    const ranged = (xs: number[]) => ({ mean: mean(xs), min: Math.min(...xs), max: Math.max(...xs) });
    report[us] = {
      flies: pairs.length,
      kcSpikes: ranged(on.map((t) => t.training.kcSpikes)),
      kcsFired: ranged(on.map((t) => t.training.kcsFired)),
      kcsFiredOff: ranged(pairs.map((p) => p.off.training.kcsFired)),
      changedAfterTraining: ranged(on.map((t) => t.afterTraining!.changed)),
      changedAfterTest: ranged(on.map((t) => t.afterTest!.changed)),
      training: { nearPlus: ranged(on.map((t) => t.training.time[0])), nearMinus: ranged(on.map((t) => t.training.time[1])), swoops: ranged(on.map((t) => t.training.swoops)), eating: ranged(on.map((t) => t.training.eating)), visitedPlus: on.filter((t) => t.training.visits[0] > 0).length },
      // The US's own compartment: the CS-'s KCs' mean factor less the CS+'s, after training.
      specific: bootstrap(on.flatMap((t) => { const c = us === 'loom' ? 'g1' : 'g4'; const a = t.afterTraining!.minus[c].mean, b = t.afterTraining!.plus[c].mean; return a === null || b === null ? [] : [a - b]; })),
      synapses: { afterTraining: { plus: compartments('afterTraining', 'plus'), minus: compartments('afterTraining', 'minus') }, afterTest: { plus: compartments('afterTest', 'plus'), minus: compartments('afterTest', 'minus') } },
      // The primary endpoint: the test's preference for the CS+, learning on less off, paired.
      preference: { on: mean(on.map((t) => t.test.preference).filter((x): x is number => x !== null)), off: mean(pairs.map((p) => p.off.test.preference).filter((x): x is number => x !== null)), pairedDifference: bootstrap(d((t) => t.test.preference)), pairs: d((t) => t.test.preference).length, positive: d((t) => t.test.preference).filter((x) => x > 0).length, negative: d((t) => t.test.preference).filter((x) => x < 0).length, droppedNoVisit: pairs.length - d((t) => t.test.preference).length },
      secondary: {
        timeNearPlus: bootstrap(d((t) => t.test.time[0])), timeNearMinus: bootstrap(d((t) => t.test.time[1])),
        visitsPlus: bootstrap(d((t) => t.test.visits[0])), visitsMinus: bootstrap(d((t) => t.test.visits[1])),
        meanVisitPlus: bootstrap(d((t) => t.test.meanVisit[0])), meanVisitMinus: bootstrap(d((t) => t.test.meanVisit[1])),
        firstPlus: bootstrap(d((t) => t.test.first[0])), firstMinus: bootstrap(d((t) => t.test.first[1])),
      },
      identicalTests: pairs.filter((p) => JSON.stringify(p.on.test) === JSON.stringify(p.off.test)).length,
      cpuSeconds: ranged(trains.filter((t) => t.us === us).map((t) => t.cpuSeconds)),
    };
  }
  const longs = runs.filter((r) => r.part === 'long') as Long[];
  if (longs.length) {
    report.long = longs.sort((a, b) => a.seed - b.seed || Number(b.learns) - Number(a.learns)).map((l) => ({
      seed: l.seed, learns: l.learns, hours: l.hours, cpuSeconds: l.cpuSeconds, memoryBytes: l.memory ? Buffer.from(l.memory, 'base64').length : null,
      hourly: Array.from({ length: Math.ceil(l.windows.length / 6) }, (_, h) => {
        const ws = l.windows.slice(h * 6, h * 6 + 6), last = ws.at(-1)!;
        const sum = (k: 'near' | 'walking' | 'sleeping' | 'eating' | 'airborne' | 'kcSpikes') => ws.reduce((s, w) => s + w[k], 0);
        const seconds = ws.length * LONG.window;
        return { hour: last.hours, near: sum('near') / seconds, walking: sum('walking') / seconds, sleeping: sum('sleeping') / seconds, eating: sum('eating'), airborne: sum('airborne') / seconds, kcSpikes: sum('kcSpikes'), odour: mean(ws.map((w) => w.odour)), at: [Math.round(last.x), Math.round(last.z)], meals: last.meals, learned: last.learned };
      }),
    }));
  }
  return report;
}

async function main() {
  if (values.reduce) {
    console.log(JSON.stringify(reduce(values.reduce), null, 2));
    return;
  }
  if (!values.out) throw new Error('--out <dir>');
  mkdirSync(values.out, { recursive: true });
  if (values.part === 'select') {
    const result = select(range(values.seeds ?? '1-12'));
    writeFileSync(join(values.out, 'kcs.json'), JSON.stringify(result) + '\n');
    console.log(JSON.stringify({ share: result.share, pairs: result.pairs, eligible: result.eligible, chosen: result.chosen }, null, 2));
    return;
  }
  const sets = readSets(values.out);
  const [k, n] = values.shard.split('/').map(Number);
  const jobs: { name: string; run: () => unknown }[] = [];
  if (values.part === 'train') {
    if (!sets.chosen) throw new Error('no pair of odours fires enough KCs: see kcs.json');
    const [a, b] = [sets.chosen.a, sets.chosen.b];
    const [trainSeconds, testSeconds] = (values.seconds ?? `${TRAIN.trainSeconds},${TRAIN.testSeconds}`).split(',').map(Number);
    for (const us of ['loom', 'sugar'] as const) for (const seed of range(values.seeds ?? '1-12')) for (const [plus, minus] of [[a, b], [b, a]]) for (const learns of [true, false]) {
      jobs.push({ name: `train-${us}-${seed}-${plus.replace(' ', '')}-${learns ? 'on' : 'off'}`, run: () => train(sets, seed, plus, minus, us, learns, { train: trainSeconds, test: testSeconds }) });
    }
  } else if (values.part === 'long') {
    const hours = Number(values.hours);
    for (const seed of range(values.seeds ?? '1-3')) for (const learns of [true, false]) jobs.push({ name: `long-${seed}-${learns ? 'on' : 'off'}`, run: () => long(sets, seed, learns, hours) });
  } else throw new Error('--part select|train|long, or --reduce <dir>');
  for (let i = k - 1; i < jobs.length; i += n) {
    const file = join(values.out, `${jobs[i].name}.json`);
    if (existsSync(file)) continue;
    const result = jobs[i].run();
    writeFileSync(file, JSON.stringify(result) + '\n');
    process.stderr.write(`${jobs[i].name}\n`);
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
