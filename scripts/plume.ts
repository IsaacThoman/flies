// Smell in the world, measured as docs/smell-protocol.md fixed before any
// measurement: the whole fly (the game's Life: the TypeScript brain, body and
// senses, no rendering) with food that gives off odour, against the same food
// giving off none, on the same seeds.
//
//   node scripts/plume.ts --part reach --air draught|still --out <dir> [--seeds 51-70] [--shard 1/4]
//   node scripts/plume.ts --part escape --out <dir> [--shard 1/4]
//   node scripts/plume.ts --part rest|night --out <dir> [--seeds 1-6] [--shard 1/4]
//   node scripts/plume.ts --part cost
//   node scripts/plume.ts --reduce <dir>
//
// Each trial is a file in <dir>, written when it ends; a trial already there
// is kept, so a stopped run carries on where it was. --shard k/n runs every
// nth trial from the kth, to share a part among processes.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { HEAD_AHEAD, HEAD_UP, Rhythm } from '@fly/body';
import { NO_ODOR, ODORANTS, Pantry, TASTES, WORLDS, World, smellAt } from '@fly/world';
import type { Food, Odor, Vec3 } from '@fly/world';
import { Life } from '../apps/web/src/life.ts';
import { FlyBrain } from '../packages/brain/src/runtime.ts';
import { RESTING_SENSES } from '../packages/brain/src/types.ts';
import type { BrainSenses } from '../packages/brain/src/types.ts';
import { readConnectomeFile } from '../packages/brain/src/node.ts';
import { ARENA } from './ethogram.ts';
import { LV_MS, opticalTrial, wilson } from './ethogram/escape.ts';
import { InProcessBrain, brainData } from './fuzz/brain.ts';

const DT = 0.01;
/** The lab's fermenting food: the five odorants at 1 (Part D's fermenting fruit). */
const FERMENTING: Odor = TASTES.flyFood.odor;
/** Part D's slow draught, 20 mm/s, blowing toward +z. */
const DRAUGHT: Vec3 = { x: 0, y: 0, z: 20 };
const STILL: Vec3 = { x: 0, y: 0, z: 0 };
const REACH = { r: 2, ahead: 12, aside: 5, settle: 30, limit: 180, feedWindow: 10 } as const;
const NEAR = { r: 2, start: 6, restSeconds: 600, restHour: 13, nightSeconds: 3600, nightHour: 1 } as const;
const ESCAPE = { r: 3, x: 8, seeds: [30000, 30001, 30002, 30003], hour: 6 } as const;

const { values } = parseArgs({ options: { part: { type: 'string' }, air: { type: 'string', default: 'draught' }, seeds: { type: 'string' }, out: { type: 'string' }, shard: { type: 'string', default: '1/1' }, reduce: { type: 'string' } } });

const range = (text: string) => text.split(',').flatMap((part) => {
  const [a, b] = part.split('-').map(Number);
  return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
});

/** A source on the arena's floor: food the fly can taste (`sweet`) or only smell. */
const source = (x: number, z: number, r: number, sweet: number, odor: Odor): Food => ({ id: 1, kind: 'patch', name: 'food', x, y: 0, z, r, sweet, water: 0, bitter: 0, amount: 1, pool: false, odor });

function fly(seed: number, hour: number) {
  const driver = new InProcessBrain(brainData(), seed);
  const life = new Life(new World(ARENA), driver);
  life.rhythm = new Rhythm(hour, { sunrise: 6, sunset: 18 });
  // Uniform grey, as the ethogram's arena: no food is seen.
  if (driver.eyes) life.light = { left: new Float32Array(driver.eyes.left.directions.length / 3).fill(0.5), right: new Float32Array(driver.eyes.right.directions.length / 3).fill(0.5) };
  return { driver, life };
}

const strongest = (s: BrainSenses) => {
  let most = 0;
  for (let k = 0; k < ODORANTS.length; k++) most = Math.max(most, s.odor?.left[k] ?? 0, s.odor?.right[k] ?? 0);
  return most;
};

/** Part D: a hungry fly 12 mm downwind of food and 5 mm to one side, facing across the wind away from it. */
function reach(seed: number, layout: 1 | -1, odour: boolean, air: 'draught' | 'still') {
  const cpu = process.cpuUsage();
  const { driver, life } = fly(seed, 6);
  const food = source(layout * REACH.aside, -REACH.ahead, REACH.r, 1, NO_ODOR);
  life.pantry.foods.push(food);
  life.setDown(0, 0, -layout * Math.PI / 2);
  const wind = air === 'draught' ? DRAUGHT : STILL;
  const head = { x: 0, y: 0, z: 0 };
  let onset: number[] = [];
  let time: number | null = null;
  let ate: boolean | null = null;
  let closest = Infinity;
  let smelled = 0, walking = 0, frames = 0;
  const settle = REACH.settle / DT, total = (REACH.settle + REACH.limit + REACH.feedWindow) / DT;
  for (let f = 0; f < total; f++) {
    if (f === settle) {
      onset = [life.body.position.x, life.body.position.z, life.body.yaw];
      if (odour) food.odor = FERMENTING;
    }
    const p = life.body.position, x = p.x, z = p.z, onFeet = life.body.onFeet;
    life.rhythm!.setTime(6);
    life.hunger.level = 1;
    life.stimuli.air = wind;
    life.step(DT, performance.now());
    if (f < settle) continue;
    const t = (f + 1 - settle) * DT;
    life.body.point(HEAD_AHEAD, HEAD_UP, 0, head);
    const d = Math.hypot(head.x - food.x, head.z - food.z);
    if (t <= REACH.limit) {
      closest = Math.min(closest, d);
      if (time === null && d <= REACH.r + 1) { time = t; ate = false; }
      smelled += strongest(life.sensed);
      if (onFeet && life.body.onFeet && Math.hypot(p.x - x, p.z - z) / DT > 0.5) walking++;
      frames++;
    }
    if (time !== null && t <= time + REACH.feedWindow && life.eating) ate = true;
  }
  driver.dispose();
  const used = process.cpuUsage(cpu);
  return { part: 'reach', air, seed, layout, odour, reached: time !== null, time, ateWithin: ate, closest, onset, meanStrongestOdour: smelled / frames, walking: walking / frames, cpuSeconds: (used.user + used.system) / 1e6 };
}

/** Rest by day or sleep by night beside a source of fermenting odour (or of none), in still air. */
function near(seed: number, odour: boolean, night: boolean) {
  const cpu = process.cpuUsage();
  const hour = night ? NEAR.nightHour : NEAR.restHour;
  const { driver, life } = fly(seed, hour);
  life.pantry.foods.push(source(0, 0, NEAR.r, 0, odour ? FERMENTING : NO_ODOR));
  life.setDown(NEAR.start, 0, 0);
  let walking = 0, sleeping = 0, smelled = 0;
  const frames = (night ? NEAR.nightSeconds : NEAR.restSeconds) / DT;
  for (let f = 0; f < frames; f++) {
    const p = life.body.position, x = p.x, z = p.z, onFeet = life.body.onFeet;
    life.rhythm!.setTime(hour);
    life.step(DT, performance.now());
    if (onFeet && life.body.onFeet && Math.hypot(p.x - x, p.z - z) / DT > 0.5) walking++;
    if (life.activity === 'sleeping') sleeping++;
    smelled += strongest(life.sensed);
  }
  driver.dispose();
  const used = process.cpuUsage(cpu);
  return { part: night ? 'night' : 'rest', seed, odour, walking: walking / frames, sleeping: sleeping / frames, meanStrongestOdour: smelled / frames, cpuSeconds: (used.user + used.system) / 1e6 };
}

/** The ethogram's black looming square, with fermenting odour beside the platform or none. */
async function escape(seed: number, lv: number, odour: boolean) {
  const trial = await opticalTrial(brainData(), 'black', lv, seed, ESCAPE.hour, async () => {}, undefined, (life) => {
    life.pantry.foods.push(source(ESCAPE.x, 0, ESCAPE.r, 0, odour ? FERMENTING : NO_ODOR));
  });
  return { part: 'escape', seed, lv, odour, eligible: trial.eligible, escaped: trial.takeoffMs !== null, takeoffMs: trial.takeoffMs };
}

/** The brain alone: CPU seconds per simulated second at rest and with the five odorants at 1 at both antennae, and the senses' sampling. */
function cost() {
  const connectome = readConnectomeFile();
  const five = [1, 1, 1, 1, 1];
  const rows = [];
  for (const seed of [1, 2, 3]) {
    const row: Record<string, number> = { seed };
    for (const [name, senses] of [['rest', RESTING_SENSES], ['odour', { ...RESTING_SENSES, odor: { left: five, right: five } }]] as const) {
      const brain = new FlyBrain(connectome, { seed });
      for (let t = 0; t < 2000; t += 16) brain.tick(16, senses);
      const cpu = process.cpuUsage();
      for (let t = 0; t < 10_000; t += 16) brain.tick(16, senses);
      const used = process.cpuUsage(cpu);
      row[name] = (used.user + used.system) / 1e6 / 10;
    }
    rows.push(row);
  }
  // The world's side: both antennae of one fly among the restaurant's food, the most of any place.
  const world = new World(WORLDS.restaurant);
  const pantry = new Pantry(world, WORLDS.restaurant.patches);
  const out = new Float64Array(ODORANTS.length);
  const n = 200_000;
  const cpu = process.cpuUsage();
  for (let i = 0; i < n; i++) smellAt(pantry.foods, STILL, (i % 400) - 200, 760, 1500, out);
  const used = process.cpuUsage(cpu);
  return { brain: rows, sampling: { foods: pantry.foods.length, microsecondsPerAntenna: ((used.user + used.system) / n) } };
}

// McNemar's exact one-sided p: of `b + c` discordant pairs, `b` or more going the first way by chance.
function mcnemar(b: number, c: number) {
  const n = b + c;
  let p = 0;
  for (let k = b; k <= n; k++) p += binomial(n, k) / 2 ** n;
  return n ? Math.min(1, p) : 1;
}
function binomial(n: number, k: number) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

type Run = Record<string, unknown> & { part: string; seed: number; odour: boolean };
function reduce(dir: string) {
  const runs: Run[] = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  const report: Record<string, unknown> = {};
  for (const air of ['draught', 'still']) {
    const rs = runs.filter((r) => r.part === 'reach' && r.air === air);
    if (!rs.length) continue;
    const key = (r: Run) => `${r.seed}/${r.layout}`;
    const on = new Map(rs.filter((r) => r.odour).map((r) => [key(r), r]));
    const off = new Map(rs.filter((r) => !r.odour).map((r) => [key(r), r]));
    let b = 0, c = 0, eatOnly = 0, eatOffOnly = 0, mismatched = 0;
    // Described, not decided on: in pairs where both reach after odour starts, the difference in time.
    const sooner: number[] = [];
    for (const [k, r] of on) {
      const o = off.get(k);
      if (!o) continue;
      if (JSON.stringify(r.onset) !== JSON.stringify(o.onset)) mismatched++;
      if (r.reached && !o.reached) b++;
      if (!r.reached && o.reached) c++;
      if (r.reached && o.reached && (r.time as number) > 0.01 && (o.time as number) > 0.01) sooner.push((o.time as number) - (r.time as number));
      if (r.reached && o.reached) {
        if (r.ateWithin && !o.ateWithin) eatOnly++;
        if (!r.ateWithin && o.ateWithin) eatOffOnly++;
      }
    }
    const side = (m: Map<string, Run>) => {
      const all = [...m.values()];
      const reached = all.filter((r) => r.reached);
      const times = reached.map((r) => r.time as number).sort((x, y) => x - y);
      // Censored at the limit: the median over all trials is a time only if more than half reached.
      const sorted = all.map((r) => (r.reached ? (r.time as number) : Infinity)).sort((x, y) => x - y);
      const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
      return { n: all.length, reached: reached.length, wilson95: wilson(reached.length, all.length), medianTimeAllTrials: median === Infinity ? `>${REACH.limit}` : median, times, ate: reached.filter((r) => r.ateWithin).length, meanStrongestOdour: all.reduce((s, r) => s + (r.meanStrongestOdour as number), 0) / all.length, meanWalking: all.reduce((s, r) => s + (r.walking as number), 0) / all.length };
    };
    report[`reach-${air}`] = {
      on: side(on), off: side(off),
      discordant: { onOnly: b, offOnly: c, mcnemarOneSidedP: mcnemar(b, c) },
      feeding: { pairsBothReached: [...on.keys()].filter((k) => on.get(k)!.reached && off.get(k)?.reached).length, ateOnlyWithOdour: eatOnly, ateOnlyWithout: eatOffOnly, breakP: mcnemar(eatOffOnly, eatOnly) },
      settlingMismatches: mismatched,
      pairedTimes: { pairs: sooner.length, soonerWithOdour: sooner.filter((d) => d > 0).length, laterWithOdour: sooner.filter((d) => d < 0).length, medianSecondsSooner: sooner.length ? sooner.sort((x, y) => x - y)[Math.floor((sooner.length - 1) / 2)] : null },
      runs: rs.map((r) => ({ seed: r.seed, layout: r.layout as number, odour: r.odour, reached: r.reached, time: r.time, ate: r.ateWithin, closest: Number((r.closest as number).toFixed(2)) })).sort((x, y) => x.seed - y.seed || x.layout - y.layout || Number(x.odour) - Number(y.odour)),
    };
  }
  for (const part of ['rest', 'night']) {
    const rs = runs.filter((r) => r.part === part).sort((a, b) => a.seed - b.seed);
    if (!rs.length) continue;
    const rows = [...new Set(rs.map((r) => r.seed))].map((seed) => {
      const on = rs.find((r) => r.seed === seed && r.odour), off = rs.find((r) => r.seed === seed && !r.odour);
      return { seed, walkingOn: on?.walking, walkingOff: off?.walking, sleepingOn: on?.sleeping, sleepingOff: off?.sleeping, odourOn: on?.meanStrongestOdour };
    });
    const mean = (k: 'walkingOn' | 'walkingOff' | 'sleepingOn' | 'sleepingOff') => rows.reduce((s, r) => s + ((r[k] as number) ?? 0), 0) / rows.length;
    report[part] = { rows, meanWalkingOn: mean('walkingOn'), meanWalkingOff: mean('walkingOff'), meanSleepingOn: mean('sleepingOn'), meanSleepingOff: mean('sleepingOff') };
  }
  const es = runs.filter((r) => r.part === 'escape');
  if (es.length) {
    let b = 0, c = 0;
    const key = (r: Run) => `${r.seed}/${r.lv}`;
    const off = new Map(es.filter((r) => !r.odour).map((r) => [key(r), r]));
    for (const r of es.filter((r) => r.odour)) {
      const o = off.get(key(r));
      if (!o || !r.eligible || !o.eligible) continue;
      if (!r.escaped && o.escaped) b++;
      if (r.escaped && !o.escaped) c++;
    }
    const count = (odour: boolean) => ({ eligible: es.filter((r) => r.odour === odour && r.eligible).length, escaped: es.filter((r) => r.odour === odour && r.eligible && r.escaped).length, trials: es.filter((r) => r.odour === odour).length });
    report.escape = { on: count(true), off: count(false), lostWithOdour: b, gainedWithOdour: c, breakP: mcnemar(b, c) };
  }
  return report;
}

async function main() {
  if (values.reduce) {
    console.log(JSON.stringify(reduce(values.reduce), null, 2));
    return;
  }
  if (values.part === 'cost') {
    console.log(JSON.stringify(cost(), null, 2));
    return;
  }
  if (!values.out) throw new Error('--out <dir>');
  mkdirSync(values.out, { recursive: true });
  const [k, n] = values.shard.split('/').map(Number);
  const jobs: { name: string; run: () => unknown }[] = [];
  if (values.part === 'reach') {
    const air = values.air as 'draught' | 'still';
    if (air !== 'draught' && air !== 'still') throw new Error('--air draught|still');
    for (const seed of range(values.seeds ?? '51-70')) for (const layout of [1, -1] as const) for (const odour of [true, false]) jobs.push({ name: `reach-${air}-${seed}-${layout > 0 ? 'a' : 'b'}-${odour ? 'on' : 'off'}`, run: () => reach(seed, layout, odour, air) });
  } else if (values.part === 'rest' || values.part === 'night') {
    for (const seed of range(values.seeds ?? '1-6')) for (const odour of [true, false]) jobs.push({ name: `${values.part}-${seed}-${odour ? 'on' : 'off'}`, run: () => near(seed, odour, values.part === 'night') });
  } else if (values.part === 'escape') {
    for (const seed of ESCAPE.seeds) for (const lv of LV_MS) for (const odour of [true, false]) jobs.push({ name: `escape-${seed}-${lv}-${odour ? 'on' : 'off'}`, run: () => escape(seed, lv, odour) });
  } else throw new Error('--part reach|escape|rest|night|cost, or --reduce <dir>');
  for (let i = k - 1; i < jobs.length; i += n) {
    const file = join(values.out, `${jobs[i].name}.json`);
    if (existsSync(file)) continue;
    const result = await jobs[i].run();
    writeFileSync(file, JSON.stringify(result) + '\n');
    process.stderr.write(`${jobs[i].name}\n`);
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
