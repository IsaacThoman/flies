// The training assay (docs/ethogram/assays.md, Training): can the fly learn
// which of two coloured dishes is good, or bad, the way a player could teach
// it? The whole animal through Life: its body, senses, hunger and real brain,
// in the 43 mm arena with a red and a blue dish on the floor. What its eyes
// see is drawn from its pose, not rendered: each facet's ray from the head
// meets a dish, the floor, the drop beyond the arena's edge, or the sky,
// coloured as the game makes colour light (FLY_RGB). Training: sugar lies on
// one dish (a food patch, tasted through Life as any food is), or a dark disc
// looms from above whenever the fly is on it (the swoop as its eyes would
// see it). Test, after: no sugar and no swoop; the share of time on the
// trained dish against the other. The same seed is run with the brain's
// learning on and off: the difference is what learning did.

import { FLY_RGB, HEAD_UP, FLY_LENGTH, Rhythm } from '@fly/body';
import { World } from '@fly/world';
import type { Place } from '@fly/world';
import { Life } from '../../apps/web/src/life.ts';
import { loom } from '../../packages/brain/src/stimuli.ts';
import { InProcessBrain } from '../fuzz/brain.ts';

/** The ethogram's arena, a 43 mm disc (scripts/ethogram.ts, ARENA). */
const ARENA_RADIUS = 21.5;
const DT = 0.01;
const light = (rgb: readonly number[]) => rgb.reduce((sum, x, k) => sum + x * FLY_RGB[k], 0);
/** What each surface is to the fly's eyes: the colours made light as the game makes them. */
export const SCENE = { red: light([0.85, 0.15, 0.15]), blue: light([0.15, 0.35, 0.9]), floor: light([0.55, 0.45, 0.35]), below: light([0.3, 0.27, 0.24]), sky: light([0.75, 0.85, 1]) } as const;
export type Colour = 'red' | 'blue';
/** The dishes: 8 mm in radius, their centres 10 mm either side of the arena's middle. */
export const DISH_RADIUS = 8;
export const DISHES: Readonly<Record<Colour, { x: number; z: number }>> = { red: { x: -10, z: 0 }, blue: { x: 10, z: 0 } };
export const PROTOCOL = { trainSeconds: 300, testSeconds: 180, swoopEvery: 10 } as const;
export type Reinforcement = 'sugar' | 'swoop';

const swoop = loom('', 0, 90, 0.04);

/** Each facet's luminance seen from this pose (a ray from the head; the body's tilt ignored), into `out`. */
export function draw(directions: Float32Array, x: number, y: number, z: number, yaw: number, out: Float32Array, swoopAt: number | null) {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const eye = y + HEAD_UP * FLY_LENGTH;
  for (let k = 0; k < out.length; k++) {
    const dx = directions[3 * k], dy = directions[3 * k + 1], dz = directions[3 * k + 2];
    // Head frame (x right, y ahead, z up) to world: right is (-cos, 0, sin), ahead (sin, 0, cos).
    const wx = -c * dx + s * dy;
    const wz = s * dx + c * dy;
    let lum: number = SCENE.sky;
    if (dz < 0) {
      const t = eye / -dz;
      const hx = x + wx * t, hz = z + wz * t;
      lum = Math.hypot(hx, hz) > ARENA_RADIUS ? SCENE.below : SCENE.floor;
      for (const colour of ['red', 'blue'] as const) if (Math.hypot(hx - DISHES[colour].x, hz - DISHES[colour].z) <= DISH_RADIUS) lum = SCENE[colour];
    }
    if (swoopAt !== null) {
      const az = (Math.atan2(dx, dy) * 180) / Math.PI;
      const el = (Math.asin(Math.max(-1, Math.min(1, dz))) * 180) / Math.PI;
      lum = Math.min(lum, swoop.scene(swoopAt, az, el));
    }
    out[k] = lum;
  }
}

const onDish = (x: number, z: number, colour: Colour) => Math.hypot(x - DISHES[colour].x, z - DISHES[colour].z) <= DISH_RADIUS;

export type TrainingTrial = {
  seed: number; trained: Colour; reinforcement: Reinforcement; learns: boolean;
  training: { seconds: number; onTrained: number; eating: number; swoops: number };
  test: { seconds: number; onTrained: number; onOther: number; preference: number | null };
  synapsesChanged: number; kcSpikes: number;
};

/** One fly, from a fresh brain: training, then the test. `checkpoint` yields to the heavy-work lease every simulated second. */
export async function trainingTrial(data: ArrayBuffer, seed: number, trained: Colour, reinforcement: Reinforcement, learns: boolean, checkpoint: () => Promise<void>, hour = 10, protocol: { trainSeconds: number; testSeconds: number; swoopEvery: number } = PROTOCOL): Promise<TrainingTrial> {
  const driver = new InProcessBrain(data, seed, learns);
  if (!driver.eyes) throw new Error('the training assay needs a brain with eyes');
  const patches = reinforcement === 'sugar' ? [{ name: 'sugar on the dish', x: DISHES[trained].x, z: DISHES[trained].z, r: DISH_RADIUS, sweet: 1 }] : [];
  const arena: Place = { floor: { kind: 'circle', r: ARENA_RADIUS }, solids: [], patches, start: { x: 0, z: -12, yaw: 0 }, ceiling: 30 };
  const life = new Life(new World(arena), driver);
  life.rhythm = new Rhythm(hour, { sunrise: 6, sunset: 18 });
  const facets = { left: new Float32Array(driver.eyes.left.directions.length / 3), right: new Float32Array(driver.eyes.right.directions.length / 3) };
  life.light = facets;
  const kcs = driver.brain.learning?.kcs ?? new Uint32Array(0);
  driver.brain.sim.setRecording(true);
  const training = { seconds: protocol.trainSeconds, onTrained: 0, eating: 0, swoops: 0 };
  let swoopStart = -Infinity;
  let t = 0;
  for (let k = 0, n = Math.round(protocol.trainSeconds / DT); k < n; k++, t += DT) {
    const { x, y, z } = life.body.position;
    const on = onDish(x, z, trained) && life.body.onFeet;
    if (on) training.onTrained += DT;
    if (reinforcement === 'swoop' && on && t - swoopStart >= protocol.swoopEvery) {
      swoopStart = t;
      training.swoops++;
    }
    const swooping = t - swoopStart < swoop.seconds ? t - swoopStart : null;
    draw(driver.eyes.left.directions, x, y, z, life.body.yaw, facets.left, swooping);
    draw(driver.eyes.right.directions, x, y, z, life.body.yaw, facets.right, swooping);
    life.step(DT, t * 1000);
    if (life.eating) training.eating += DT;
    if (k % 100 === 99) await checkpoint();
  }
  // The test: the same dishes, nothing on them and nothing swooping.
  life.pantry.reset([]);
  const test = { seconds: protocol.testSeconds, onTrained: 0, onOther: 0, preference: null as number | null };
  const other: Colour = trained === 'red' ? 'blue' : 'red';
  for (let k = 0, n = Math.round(protocol.testSeconds / DT); k < n; k++, t += DT) {
    const { x, y, z } = life.body.position;
    if (life.body.onFeet && onDish(x, z, trained)) test.onTrained += DT;
    if (life.body.onFeet && onDish(x, z, other)) test.onOther += DT;
    draw(driver.eyes.left.directions, x, y, z, life.body.yaw, facets.left, null);
    draw(driver.eyes.right.directions, x, y, z, life.body.yaw, facets.right, null);
    life.step(DT, t * 1000);
    if (k % 100 === 99) await checkpoint();
  }
  const on = test.onTrained + test.onOther;
  test.preference = on > 0 ? (test.onTrained - test.onOther) / on : null;
  const recording = driver.brain.sim.recording!;
  let kcSpikes = 0;
  for (const i of kcs) kcSpikes += recording[i];
  const synapsesChanged = driver.brain.learning ? driver.brain.learning.factors.filter((f) => f !== 1).length : 0;
  return { seed, trained, reinforcement, learns, training, test, synapsesChanged, kcSpikes };
}

/** Seeds × both colours trained × both reinforcements, each with learning on and off. */
export async function trainingBattery(data: ArrayBuffer, seeds: readonly number[], checkpoint: () => Promise<void>, hour = 10) {
  const trials: TrainingTrial[] = [];
  for (const reinforcement of ['sugar', 'swoop'] as const) {
    for (const seed of seeds) {
      for (const trained of ['red', 'blue'] as const) {
        for (const learns of [true, false]) trials.push(await trainingTrial(data, seed, trained, reinforcement, learns, checkpoint, hour));
      }
    }
  }
  return { protocol: { ...PROTOCOL, hour, seeds: [...seeds], scene: SCENE, dishRadius: DISH_RADIUS, dishes: DISHES, arenaRadius: ARENA_RADIUS }, trials, summary: summarizeTraining(trials) };
}

/** Per reinforcement: the mean preference for the trained dish with learning and without, their paired difference, and what the brain learned. */
export function summarizeTraining(trials: readonly TrainingTrial[]) {
  const out: Record<string, unknown> = {};
  for (const reinforcement of ['sugar', 'swoop'] as const) {
    const pairs = trials.filter((t) => t.reinforcement === reinforcement && t.learns).map((on) => ({ on, off: trials.find((t) => t.reinforcement === reinforcement && !t.learns && t.seed === on.seed && t.trained === on.trained)! }));
    const differences = pairs.flatMap(({ on, off }) => (on.test.preference !== null && off.test.preference !== null ? [on.test.preference - off.test.preference] : []));
    const preferences = (learns: boolean) => pairs.flatMap((p) => ((learns ? p.on : p.off).test.preference === null ? [] : [(learns ? p.on : p.off).test.preference!]));
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    out[reinforcement] = {
      flies: pairs.length,
      preferenceWithLearning: mean(preferences(true)),
      preferenceWithout: mean(preferences(false)),
      pairedDifference: mean(differences),
      pairedDifferenceRange: differences.length ? [Math.min(...differences), Math.max(...differences)] : null,
      identicalPairs: pairs.filter(({ on, off }) => on.test.onTrained === off.test.onTrained && on.test.onOther === off.test.onOther).length,
      synapsesChanged: pairs.map(({ on }) => on.synapsesChanged),
      kcSpikes: pairs.map(({ on }) => on.kcSpikes),
      trainingOnTrainedSeconds: pairs.map(({ on }) => on.training.onTrained),
      eatingSeconds: pairs.map(({ on }) => on.training.eating),
      swoops: pairs.map(({ on }) => on.training.swoops),
    };
  }
  return out;
}
