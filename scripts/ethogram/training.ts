// The training assay (docs/ethogram/assays.md, Training): can the fly learn
// which of two of the Build kit's coloured pieces is good, or bad, the way a
// player could teach it? The whole animal through Life: its body, senses,
// hunger and real brain, in an open disc with two of the kit's own pieces set
// down as the world's solids (withPieces). What its eyes see is drawn from its
// pose: each facet's ray from the head is marched over the pieces' own shapes
// and the floor, and takes the colour of what it meets, made light as the
// game makes colour light (FLY_RGB), unshaded. Training: sugar lies in the
// trained dish's well (a food patch, tasted through Life as any food is), or a
// dark disc looms from above whenever the fly stands on the trained piece (the
// swoop as its eyes would see it). Test, after: no sugar and no swoop; the
// share of time on the trained piece against the other. The same seed is run
// with the brain's learning on and off: the difference is what learning did.

import { FLY_LENGTH, FLY_RGB, HEAD_AHEAD, HEAD_UP, Rhythm } from '@fly/body';
import { World, inside, pieceSolid, topHeight, withPieces } from '@fly/world';
import type { Piece, Place, Solid } from '@fly/world';
import { Life } from '../../apps/web/src/life.ts';
import { KIT_COLOURS } from '../../apps/web/src/scene/kit.ts';
import { loom } from '../../packages/brain/src/stimuli.ts';
import { InProcessBrain } from '../fuzz/brain.ts';

const DT = 0.01;
/** A colour as the fly's eyes take it in (packages/body's FLY_RGB): unshaded, so a colour's own brightness to it. */
export const flyLight = (hex: string) => [1, 3, 5].reduce((sum, at, k) => sum + (parseInt(hex.slice(at, at + 2), 16) / 255) * FLY_RGB[k], 0);
export type Coloured = 'dish-blue' | 'dish-yellow' | 'tile-blue' | 'tile-yellow' | 'tile-red';
/** The coloured pieces, as bright as each is to the fly. */
export const PIECE_LIGHT: Readonly<Record<Coloured, number>> = {
  'dish-blue': flyLight(KIT_COLOURS.blue),
  'dish-yellow': flyLight(KIT_COLOURS.yellow),
  'tile-blue': flyLight(KIT_COLOURS.blue),
  'tile-yellow': flyLight(KIT_COLOURS.yellow),
  'tile-red': flyLight(KIT_COLOURS.red),
};
export const isColoured = (kind: string): kind is Coloured => Object.hasOwn(PIECE_LIGHT, kind);
/** Around the pieces: a wooden floor, the drop past its edge, the sky. */
export const SCENE = { floor: flyLight('#8c7359'), below: flyLight('#4d453d'), sky: flyLight('#bfd9ff') } as const;
/** An open disc 60 mm across, room for two dishes 22 mm across with the fly between them. */
const ARENA_RADIUS = 30;
/** Where the two pieces' middles are (mm), either side of the middle. */
const SPOTS = [{ x: -14, z: 0 }, { x: 14, z: 0 }];
/** The well a dish's food lies in: 13 mm across (packages/world's kit). */
const WELL_RADIUS = 6.5;
/** How often the eyes' picture is drawn again, Hz: the game's at its low detail (apps/web/src/eyes/eyes.ts, DETAIL). */
const EYES_HZ = 20;
/** The march along each facet's ray: its step and how far it goes (mm). */
const STEP = 0.25;
const REACH = 60;
/** Nothing in the arena stands higher than this (mm): a dish's rim is 1.6. */
const TALLEST = 3;
export const PROTOCOL = { trainSeconds: 300, testSeconds: 180, swoopEvery: 10 } as const;
export type Reinforcement = 'sugar' | 'swoop';

const swoop = loom('', 0, 90, 0.04);

/** The two pieces, the trained one first, at the arena's two spots. */
export function arenaPieces(trained: Coloured, other: Coloured): Piece[] {
  return [trained, other].map((kind, k) => ({ kind, ...SPOTS[k], turns: 0, y: 0 }));
}

/**
 * Each facet's luminance seen from this pose, into `out`: the head ahead of
 * and above the body's middle, the body's tilt and the facets' acceptance
 * cones left out. During a swoop (`swoopAt`, s into it), its dark disc too.
 */
export function draw(directions: Float32Array, x: number, y: number, z: number, yaw: number, pieces: readonly Piece[], out: Float32Array, swoopAt: number | null) {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const ex = x + s * HEAD_AHEAD * FLY_LENGTH;
  const ez = z + c * HEAD_AHEAD * FLY_LENGTH;
  const ey = y + HEAD_UP * FLY_LENGTH;
  const solids: Solid[] = pieces.map(pieceSolid);
  for (let k = 0; k < out.length; k++) {
    const dx = directions[3 * k], dy = directions[3 * k + 1], dz = directions[3 * k + 2];
    // Head frame (x right, y ahead, z up) to world: right is (-cos, 0, sin), ahead (sin, 0, cos).
    const wx = -c * dx + s * dy;
    const wz = s * dx + c * dy;
    let lum: number = dz < 0 ? SCENE.below : SCENE.sky;
    for (let t = STEP; t <= REACH; t += STEP) {
      const px = ex + wx * t, py = ey + dz * t, pz = ez + wz * t;
      // Above everything and rising, it can only reach the sky.
      if (py > TALLEST && dz >= 0) break;
      let hit = -1;
      for (let n = 0; n < solids.length; n++) if (inside(solids[n].footprint, px, pz) && py <= topHeight(solids[n], px, pz)) hit = n;
      if (hit >= 0) {
        lum = PIECE_LIGHT[pieces[hit].kind as Coloured];
        break;
      }
      if (py <= 0) {
        lum = Math.hypot(px, pz) > ARENA_RADIUS ? SCENE.below : SCENE.floor;
        break;
      }
    }
    if (swoopAt !== null) {
      const az = (Math.atan2(dx, dy) * 180) / Math.PI;
      const el = (Math.asin(Math.max(-1, Math.min(1, dz))) * 180) / Math.PI;
      lum = Math.min(lum, swoop.scene(swoopAt, az, el));
    }
    out[k] = lum;
  }
}

const on = (piece: Piece, x: number, z: number) => inside(pieceSolid(piece).footprint, x, z);

export type TrainingTrial = {
  seed: number; trained: Coloured; other: Coloured; reinforcement: Reinforcement; learns: boolean;
  training: { seconds: number; onTrained: number; eating: number; swoops: number };
  test: { seconds: number; onTrained: number; onOther: number; preference: number | null };
  synapsesChanged: number; kcSpikes: number;
};

/** One fly, from a fresh brain: training, then the test. `checkpoint` yields to the heavy-work lease every simulated second. */
export async function trainingTrial(
  data: ArrayBuffer, seed: number, trained: Coloured, other: Coloured, reinforcement: Reinforcement, learns: boolean, checkpoint: () => Promise<void>,
  hour = 6, protocol: { trainSeconds: number; testSeconds: number; swoopEvery: number } = PROTOCOL,
): Promise<TrainingTrial> {
  if (reinforcement === 'sugar' && !trained.startsWith('dish')) throw new Error('sugar is put in a dish');
  const driver = new InProcessBrain(data, seed, learns);
  if (!driver.eyes) throw new Error('the training assay needs a brain with eyes');
  const pieces = arenaPieces(trained, other);
  const patches = reinforcement === 'sugar' ? [{ name: 'sugar in the dish', x: pieces[0].x, z: pieces[0].z, r: WELL_RADIUS, sweet: 1 }] : [];
  const arena: Place = withPieces({ floor: { kind: 'circle', r: ARENA_RADIUS }, solids: [], patches, start: { x: 0, z: -20, yaw: 0 }, ceiling: 30 }, pieces);
  const life = new Life(new World(arena), driver);
  life.rhythm = new Rhythm(hour, { sunrise: 6, sunset: 18 });
  const facets = { left: new Float32Array(driver.eyes.left.directions.length / 3), right: new Float32Array(driver.eyes.right.directions.length / 3) };
  life.light = facets;
  const kcs = driver.brain.learning?.kcs ?? new Uint32Array(0);
  driver.brain.sim.setRecording(true);
  const look = (swooping: number | null) => {
    const { x, y, z } = life.body.position;
    draw(driver.eyes!.left.directions, x, y, z, life.body.yaw, pieces, facets.left, swooping);
    draw(driver.eyes!.right.directions, x, y, z, life.body.yaw, pieces, facets.right, swooping);
  };
  const every = Math.round(1 / (EYES_HZ * DT));
  const training = { seconds: protocol.trainSeconds, onTrained: 0, eating: 0, swoops: 0 };
  let swoopStart = -Infinity;
  let t = 0;
  for (let k = 0, n = Math.round(protocol.trainSeconds / DT); k < n; k++, t += DT) {
    const { x, z } = life.body.position;
    const there = life.body.onFeet && on(pieces[0], x, z);
    if (there) training.onTrained += DT;
    if (reinforcement === 'swoop' && there && t - swoopStart >= protocol.swoopEvery) {
      swoopStart = t;
      training.swoops++;
    }
    const swooping = t - swoopStart < swoop.seconds ? t - swoopStart : null;
    // A swoop is drawn every frame, as the game refreshes a fly's eyes while something comes at it (URGENT_HZ).
    if (k % every === 0 || swooping !== null) look(swooping);
    life.step(DT, performance.now());
    if (life.eating) training.eating += DT;
    if (k % 100 === 99) await checkpoint();
  }
  // The test: the same pieces, nothing on them and nothing swooping.
  life.pantry.reset([]);
  const test = { seconds: protocol.testSeconds, onTrained: 0, onOther: 0, preference: null as number | null };
  for (let k = 0, n = Math.round(protocol.testSeconds / DT); k < n; k++, t += DT) {
    const { x, z } = life.body.position;
    if (life.body.onFeet && on(pieces[0], x, z)) test.onTrained += DT;
    if (life.body.onFeet && on(pieces[1], x, z)) test.onOther += DT;
    if (k % every === 0) look(null);
    life.step(DT, performance.now());
    if (k % 100 === 99) await checkpoint();
  }
  const time = test.onTrained + test.onOther;
  test.preference = time > 0 ? (test.onTrained - test.onOther) / time : null;
  const recording = driver.brain.sim.recording!;
  let kcSpikes = 0;
  for (const i of kcs) kcSpikes += recording[i];
  const synapsesChanged = driver.brain.learning ? driver.brain.learning.factors.filter((f) => f !== 1).length : 0;
  return { seed, trained, other, reinforcement, learns, training, test, synapsesChanged, kcSpikes };
}

/** Seeds × each of the two pieces trained × both reinforcements (sugar only where the trained piece is a dish), each with learning on and off. */
export async function trainingBattery(data: ArrayBuffer, seeds: readonly number[], checkpoint: () => Promise<void>, hour = 6, pair: readonly [Coloured, Coloured] = ['dish-blue', 'dish-yellow']) {
  const trials: TrainingTrial[] = [];
  for (const reinforcement of ['sugar', 'swoop'] as const) {
    for (const seed of seeds) {
      for (const [trained, other] of [pair, [pair[1], pair[0]]] as const) {
        if (reinforcement === 'sugar' && !trained.startsWith('dish')) continue;
        for (const learns of [true, false]) trials.push(await trainingTrial(data, seed, trained, other, reinforcement, learns, checkpoint, hour));
      }
    }
  }
  return {
    protocol: { ...PROTOCOL, hour, seeds: [...seeds], pair, light: Object.fromEntries(pair.map((kind) => [kind, PIECE_LIGHT[kind]])), scene: SCENE, spots: SPOTS, arenaRadius: ARENA_RADIUS, eyesHz: EYES_HZ },
    trials,
    summary: summarizeTraining(trials),
  };
}

/** Per reinforcement: the mean preference for the trained piece with learning and without, their paired difference, and what the brain learned. */
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
