// Phototaxis: does a light on the table steer the fly, through its eyes alone?
// The real brain, Life, senses and body run headlessly; the light reaches the
// facets and nothing else. No turn, walk or approach is imposed.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Adaptation, Rhythm } from '@fly/body';
import { World } from '@fly/world';
import type { Place } from '@fly/world';
import { ACCEPTANCE } from '../packages/brain/src/eyes.ts';
import { Life } from '../apps/web/src/life.ts';
import { InProcessBrain, brainData } from './fuzz/brain.ts';
import { HeavyLease } from './ethogram/lease.ts';

/**
 * Table and sky at the luminances the game renders at dusk and at night
 * (docs/simulation.md, The eyes), before the eyes' own light adaptation,
 * which is applied as the game applies it. The light itself is as bright as
 * the screen goes.
 */
export const SCENES = { dusk: { floor: 0.12, sky: 0.15 }, night: { floor: 0.07, sky: 0.09 } } as const;
export type SceneKind = keyof typeof SCENES;
const EMITTER = 1;
/**
 * Two lights: a fly-scale bulb on a stand, and a large glowing panel standing
 * for the strongest light a table could hold. Each lights the table under it
 * as a point light would (Lambert, inverse square), to `pool` at its foot.
 */
export const LIGHTS = {
  bulb: { heightMm: 4, radiusMm: 1.5, pool: 0.6 },
  panel: { heightMm: 10, radiusMm: 10, pool: 0.85 },
} as const;
export type LightKind = keyof typeof LIGHTS;
export type Side = 'right' | 'left';
export type Condition = { light: LightKind | 'off'; side: Side };
/** The scene, and how far from where the fly starts the light stands, square to its heading. */
export type Setup = { scene: SceneKind; distanceMm: number };
export const PHOTOTAXIS_PLACE: Place = { floor: { kind: 'circle', r: 150 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 60 };
const DT = 0.01;
/** The game's Low eyes: 20 pictures a second. */
const PICTURE_STEPS = 5;
/** Seconds of the steady dusk scene before the light comes on, as a player switches it on. */
export const SETTLE_SECONDS = 10;

/** Where the light stands: the fly starts at the origin facing +z, so its right is −x. */
export function lightPosition(side: Side, distanceMm: number) {
  return { x: side === 'right' ? -distanceMm : distanceMm, z: 0 };
}

/** Of a facet's cone, the share a disc of angular radius `rho` covers at angular distance `theta` (all radians); a linear edge, by area. */
export function coverage(theta: number, rho: number, acceptance = ACCEPTANCE) {
  if (rho >= acceptance) return Math.min(1, Math.max(0, (rho + acceptance - theta) / (2 * acceptance)));
  return (rho / acceptance) ** 2 * Math.min(1, Math.max(0, (acceptance + rho - theta) / (2 * rho)));
}

/**
 * One facet's light. (x, y, z) is its direction in the head frame (x right,
 * y ahead, z up, as the eye map gives it), the eye at `eye` with the body at
 * `yaw`, in `scene`; `on` null leaves the light out.
 */
export function facetLuminance(x: number, y: number, z: number, eye: { x: number; y: number; z: number }, yaw: number, scene: SceneKind, on: { kind: LightKind; at: { x: number; z: number } } | null) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const dx = -x * c + y * s, dz = x * s + y * c, dy = z;
  let base = dy >= 0 ? SCENES[scene].sky : SCENES[scene].floor;
  if (!on) return base;
  const light = LIGHTS[on.kind];
  if (dy < 0) {
    // Where the ray meets the table, lit by the light above its foot.
    const t = -eye.y / dy;
    const px = eye.x + dx * t - on.at.x, pz = eye.z + dz * t - on.at.z;
    const h = light.heightMm;
    base += light.pool * (h / Math.hypot(px, pz, h)) ** 3;
  }
  const lx = on.at.x - eye.x, ly = light.heightMm - eye.y, lz = on.at.z - eye.z;
  const distance = Math.hypot(lx, ly, lz);
  const cosine = (dx * lx + dy * ly + dz * lz) / distance;
  const covered = coverage(Math.acos(Math.min(1, Math.max(-1, cosine))), Math.atan(light.radiusMm / distance));
  return Math.min(1, base + (EMITTER - base) * covered);
}

/** The light's bearing from the fly's heading, radians, positive to its right. */
export function bearing(position: { x: number; z: number }, yaw: number, at: { x: number; z: number }) {
  const tx = at.x - position.x, tz = at.z - position.z;
  return Math.atan2(-tx * Math.cos(yaw) + tz * Math.sin(yaw), tx * Math.sin(yaw) + tz * Math.cos(yaw));
}

export type Trial = {
  seed: number; light: LightKind | 'off'; side: Side; scene: SceneKind; distanceMm: number; seconds: number;
  /** Mean turn command toward the light's side (DNa02 right minus left, signed so that + turns toward it), over the first 5 s lit and over the whole run. */
  turnTowardOnset: number; turnToward: number;
  /** Mean yaw rate toward the light, °/s, over the whole run. */
  yawToward: number;
  /** Mean cosine of the light's bearing: 1 facing it, −1 facing away. */
  facing: number;
  startMm: number; endMm: number; minMm: number; meanLastMinuteMm: number;
  /** Share of the run within 10 mm of the light's foot. */
  near: number;
  pathMm: number; walking: number; takeOffs: number; maxEscape: number;
  /** Mean rate of both eyes' lamina, Hz: whether the light reached the eyes at all. */
  laminaHz: number;
};

export async function phototaxisTrial(data: ArrayBuffer, condition: Condition, setup: Setup, seed: number, seconds: number, hour: number, checkpoint: () => Promise<void>): Promise<Trial> {
  const driver = new InProcessBrain(data, seed);
  const life = new Life(new World(PHOTOTAXIS_PLACE), driver);
  life.rhythm = new Rhythm(hour, { sunrise: 6, sunset: 18 });
  if (!driver.eyes) throw new Error('phototaxis needs the real eye map');
  const directions = { left: driver.eyes.left.directions, right: driver.eyes.right.directions };
  const light = { left: new Float32Array(directions.left.length / 3), right: new Float32Array(directions.right.length / 3) };
  life.light = light;
  const adaptation = new Adaptation();
  // The off control reports against where the light would stand.
  const at = lightPosition(condition.side, setup.distanceMm);
  const on = condition.light === 'off' ? null : { kind: condition.light, at };
  const eye = { x: 0, y: 0, z: 0 };
  const look = (lit: boolean) => {
    life.body.point(0.42, 0.3, 0, eye);
    for (const side of ['left', 'right'] as const) {
      const d = directions[side], out = light[side];
      for (let k = 0; k < out.length; k++) out[k] = facetLuminance(d[3 * k], d[3 * k + 1], d[3 * k + 2], eye, life.body.yaw, setup.scene, lit ? on : null);
    }
    adaptation.apply(light, PICTURE_STEPS * DT);
  };
  const step = () => { life.rhythm!.setTime(hour); life.step(DT, performance.now()); };
  const settle = Math.round(SETTLE_SECONDS / DT);
  for (let i = 0; i < settle; i++) {
    if (i % 500 === 0) await checkpoint();
    if (i % PICTURE_STEPS === 0) look(false);
    step();
  }
  const p = life.body.position;
  const frames = Math.round(seconds / DT), onsetFrames = Math.round(5 / DT), lastMinute = Math.max(0, frames - Math.round(60 / DT));
  let lamina = 0, turnOnset = 0, turn = 0, yawRate = 0, facing = 0, near = 0, path = 0, walking = 0, minMm = Infinity, lastSum = 0, maxEscape = 0;
  const startMm = Math.hypot(at.x - p.x, at.z - p.z), takeOffs = life.takeOffs;
  for (let i = 0; i < frames; i++) {
    if (i % 500 === 0) await checkpoint();
    if (i % PICTURE_STEPS === 0) look(true);
    const x = p.x, z = p.z, yaw = life.body.yaw;
    const sign = Math.sign(bearing(p, yaw, at));
    step();
    const command = driver.state?.command.turn ?? 0;
    const rates = driver.state?.stats.rates;
    lamina += (rates?.['vision.lamina left'] ?? 0) + (rates?.['vision.lamina right'] ?? 0);
    if (i < onsetFrames) turnOnset += command * sign;
    turn += command * sign;
    // Yaw grows to the fly's left; the bearing grows to its right.
    yawRate += -Math.atan2(Math.sin(life.body.yaw - yaw), Math.cos(life.body.yaw - yaw)) / DT * sign;
    const b = bearing(p, life.body.yaw, at);
    facing += Math.cos(b);
    const mm = Math.hypot(at.x - p.x, at.z - p.z);
    if (mm < 10) near++;
    if (mm < minMm) minMm = mm;
    if (i >= lastMinute) lastSum += mm;
    path += Math.hypot(p.x - x, p.z - z);
    if (life.activity === 'walking') walking++;
    maxEscape = Math.max(maxEscape, life.intent.escape);
  }
  driver.dispose();
  return {
    seed, light: condition.light, side: condition.side, scene: setup.scene, distanceMm: setup.distanceMm, seconds,
    turnTowardOnset: turnOnset / onsetFrames, turnToward: turn / frames, yawToward: yawRate / frames * 180 / Math.PI,
    facing: facing / frames, startMm, endMm: Math.hypot(at.x - p.x, at.z - p.z), minMm, meanLastMinuteMm: lastSum / (frames - lastMinute),
    near: near / frames, pathMm: path, walking: walking / frames, takeOffs: life.takeOffs - takeOffs, maxEscape, laminaHz: lamina / frames,
  };
}

const MEASURES = ['laminaHz', 'turnTowardOnset', 'turnToward', 'yawToward', 'facing', 'endMm', 'minMm', 'meanLastMinuteMm', 'near', 'pathMm', 'walking', 'takeOffs', 'maxEscape'] as const;
type Measure = (typeof MEASURES)[number];
const meanSd = (v: readonly number[]) => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return { mean: m, sd: v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) : 0, n: v.length };
};

/**
 * Each light against the unlit control, both sides pooled so that the
 * connectome's lean to the left cancels: per measure, the light's mean and
 * the control's, and the paired difference (same seed and side), with how
 * many of the pairs went the light's way.
 */
export function summarise(trials: readonly Trial[]) {
  const off = trials.filter(t => t.light === 'off');
  const out: Record<string, Record<Measure, { light: number; off: number; difference: number; sd: number; pairs: number; lightWay: number }>> = {};
  const name = (t: Trial) => `${t.light}, ${t.scene}, ${t.distanceMm} mm`;
  for (const key of new Set(trials.filter(t => t.light !== 'off').map(name))) {
    const lit = trials.filter(t => name(t) === key);
    const pairs = lit.flatMap(t => { const o = off.find(c => c.seed === t.seed && c.side === t.side && c.scene === t.scene && c.distanceMm === t.distanceMm); return o ? [[t, o] as const] : []; });
    if (!pairs.length) continue;
    out[key] = {} as (typeof out)[string];
    for (const m of MEASURES) {
      const d = pairs.map(([t, o]) => t[m] - o[m]);
      // Nearer the light is the light's way for distances; more of the rest is.
      const lightWay = d.filter(x => (m.endsWith('Mm') && m !== 'pathMm' ? x < 0 : x > 0)).length;
      out[key][m] = { light: meanSd(pairs.map(([t]) => t[m])).mean, off: meanSd(pairs.map(([, o]) => o[m])).mean, difference: meanSd(d).mean, sd: meanSd(d).sd, pairs: pairs.length, lightWay };
    }
  }
  return out;
}

const CONDITIONS: Record<string, Condition> = {
  'bulb-right': { light: 'bulb', side: 'right' }, 'bulb-left': { light: 'bulb', side: 'left' },
  'panel-right': { light: 'panel', side: 'right' }, 'panel-left': { light: 'panel', side: 'left' },
  'off-right': { light: 'off', side: 'right' }, 'off-left': { light: 'off', side: 'left' },
};

async function main() {
  const { values, positionals } = parseArgs({ options: {
    conditions: { type: 'string', default: Object.keys(CONDITIONS).join(',') },
    seeds: { type: 'string', default: '1,2,3,4,5,6,7,8' },
    minutes: { type: 'string', default: '3' },
    hour: { type: 'string', default: '6' },
    scene: { type: 'string', default: 'dusk' },
    distance: { type: 'string', default: '30' },
    out: { type: 'string' },
    summarise: { type: 'boolean', default: false },
  }, allowPositionals: true });
  if (values.summarise) {
    // Reports from separate runs (one per condition, run side by side) read together.
    const trials = positionals.flatMap(file => (JSON.parse(readFileSync(file, 'utf8')) as { trials: Trial[] }).trials);
    process.stdout.write(JSON.stringify(summarise(trials), null, 2) + '\n');
    return;
  }
  const names = values.conditions.split(',');
  for (const name of names) if (!CONDITIONS[name]) throw new Error(`unknown condition ${name}; one of ${Object.keys(CONDITIONS).join(', ')}`);
  const seeds = values.seeds.split(',').map(Number), seconds = Number(values.minutes) * 60, hour = Number(values.hour);
  if (!Object.hasOwn(SCENES, values.scene)) throw new Error(`scene is one of ${Object.keys(SCENES).join(', ')}`);
  const setup: Setup = { scene: values.scene as SceneKind, distanceMm: Number(values.distance) };
  if (!(setup.distanceMm >= 5 && setup.distanceMm <= 100)) throw new Error('distance is 5 to 100 mm');
  if (seeds.some(s => !Number.isInteger(s) || s < 0)) throw new Error('seeds are non-negative integers');
  if (!(seconds >= 60)) throw new Error('at least one minute');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const lease = new HeavyLease(`phototaxis ${commit.slice(0, 8)}`);
  const release = () => { lease.release(); process.exit(130); };
  process.once('SIGINT', release); process.once('SIGTERM', release);
  const data = brainData();
  const trials: Trial[] = [];
  const cpu = process.cpuUsage();
  try {
    for (const name of names) for (const seed of seeds) {
      trials.push(await phototaxisTrial(data, CONDITIONS[name], setup, seed, seconds, hour, () => lease.checkpoint()));
      const t = trials.at(-1)!;
      process.stderr.write(`${name} ${setup.scene} ${setup.distanceMm} mm seed ${seed}: lamina ${t.laminaHz.toFixed(2)} Hz, turn toward ${t.turnTowardOnset.toFixed(3)} (onset) ${t.turnToward.toFixed(3)} (all), facing ${t.facing.toFixed(2)}, ${t.startMm.toFixed(0)} → ${t.endMm.toFixed(0)} mm, near ${(t.near * 100).toFixed(0)}%\n`);
    }
  } finally { lease.release(); }
  const report = { commit, hour, seconds, settleSeconds: SETTLE_SECONDS, setup, scenes: SCENES, lights: LIGHTS, cpuSeconds: (process.cpuUsage(cpu).user + process.cpuUsage(cpu).system) / 1e6, trials };
  const json = JSON.stringify(report, null, 2);
  if (values.out) writeFileSync(values.out, json + '\n');
  else process.stdout.write(json + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
