import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { Behavior } from '../src/behavior.ts';
import { brainData } from '../../../scripts/fuzz/brain.ts';
import { DEFAULT_CONNECTOME_PATH } from '../../brain/src/node.ts';
import { PIECE_LIGHT, SCENE, arenaPieces, draw, summarizeTraining, trainingTrial } from '../../../scripts/ethogram/training.ts';
import type { TrainingTrial } from '../../../scripts/ethogram/training.ts';

test("the kit's colours are bright, middling and dark to a fly, as the kit means them to be", () => {
  assert.ok(PIECE_LIGHT['dish-blue'] > PIECE_LIGHT['dish-yellow'] && PIECE_LIGHT['dish-yellow'] > PIECE_LIGHT['tile-red']);
  assert.equal(PIECE_LIGHT['tile-blue'], PIECE_LIGHT['dish-blue']);
});

test('the training arena is drawn from the pose over the pieces themselves: a dish to the left is seen by the left-looking facets, the floor ahead, the sky above, a swoop darkens from above', () => {
  // Facets looking ahead-down, left and right just under the horizon, and up, in the head frame (x right, y ahead, z up).
  const n = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
  const directions = Float32Array.from([...n(0, 1, -0.3), ...n(-1, 0, -0.05), ...n(1, 0, -0.05), ...n(0, 0.2, 1)]);
  const out = new Float32Array(4);
  // The trained blue dish at x = -14, the yellow at 14. At the middle facing +z (yaw 0), its left is +x: the yellow dish's side.
  const pieces = arenaPieces('dish-blue', 'dish-yellow');
  draw(directions, 0, 0, 0, 0, pieces, out, null);
  assert.deepEqual([...out], [SCENE.floor, PIECE_LIGHT['dish-yellow'], PIECE_LIGHT['dish-blue'], SCENE.sky].map(Math.fround));
  // Turned half round, they swap sides.
  draw(directions, 0, 0, 0, Math.PI, pieces, out, null);
  assert.deepEqual([out[1], out[2]], [PIECE_LIGHT['dish-blue'], PIECE_LIGHT['dish-yellow']].map(Math.fround));
  // Standing in the blue dish's well, it sees the dish ahead.
  draw(directions, -14, 0.45, -1, 0, pieces, out, null);
  assert.equal(out[0], Math.fround(PIECE_LIGHT['dish-blue']));
  // At the end of a swoop the disc above is dark, and only above.
  draw(directions, 0, 0, 0, 0, pieces, out, 1);
  assert.equal(out[3], 0);
  assert.equal(out[0], Math.fround(SCENE.floor));
});

test('the training summary pairs each fly with learning against the same fly without it', () => {
  const trial = (learns: boolean, onTrained: number, onOther: number): TrainingTrial => ({
    seed: 1, trained: 'dish-blue', other: 'dish-yellow', reinforcement: 'sugar', learns,
    training: { seconds: 1, onTrained: 0, eating: 0, swoops: 0 },
    test: { seconds: 1, onTrained, onOther, preference: onTrained + onOther > 0 ? (onTrained - onOther) / (onTrained + onOther) : null },
    synapsesChanged: learns ? 3 : 0, kcSpikes: 0,
  });
  const summary = summarizeTraining([trial(true, 3, 1), trial(false, 1, 1)]).sugar as { pairedDifference: number; identicalPairs: number; synapsesChanged: number[] };
  assert.equal(summary.pairedDifference, 0.5);
  assert.equal(summary.identicalPairs, 0);
  assert.deepEqual(summary.synapsesChanged, [3]);
});

test('training and test phases age brain commands on the driver clock', { skip: !existsSync(DEFAULT_CONNECTOME_PATH) }, async (t) => {
  // The driver stamps synchronous commands with performance.now, far from assay time.
  t.mock.method(performance, 'now', () => 1_000_000);
  const update = Behavior.prototype.update;
  const ages: number[] = [];
  t.mock.method(Behavior.prototype, 'update', function (this: Behavior, ...args: Parameters<Behavior['update']>) {
    ages.push(args[1]);
    const intent = update.apply(this, args);
    assert.ok(intent.live);
    return intent;
  });
  const result = await trainingTrial(brainData(), 1, 'dish-blue', 'dish-yellow', 'sugar', true, async () => {}, 6, { trainSeconds: 0.02, testSeconds: 0.02, swoopEvery: 10 });
  assert.equal(result.training.seconds, 0.02);
  assert.equal(result.test.seconds, 0.02);
  assert.deepEqual(ages, [0, 0, 0, 0]);
});
