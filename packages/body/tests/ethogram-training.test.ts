import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DISHES, SCENE, draw, summarizeTraining } from '../../../scripts/ethogram/training.ts';
import type { TrainingTrial } from '../../../scripts/ethogram/training.ts';

test('the training arena is drawn from the pose: a dish to the left is seen by the left-looking facets, the sky above, a swoop darkens from above', () => {
  // Facets looking ahead-down, left-down, right-down and up, in the head frame (x right, y ahead, z up).
  const n = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
  const directions = Float32Array.from([...n(0, 1, -0.3), ...n(-1, 0, -0.3), ...n(1, 0, -0.3), ...n(0, 0.2, 1)]);
  const out = new Float32Array(4);
  // At the middle facing +z (yaw 0), its left is +x: the blue dish, 10 mm away; its right the red one.
  draw(directions, 0, 0, 0, 0, out, null);
  assert.deepEqual([...out], [SCENE.floor, SCENE.blue, SCENE.red, SCENE.sky].map(Math.fround));
  // Turned half round, they swap sides.
  draw(directions, 0, 0, 0, Math.PI, out, null);
  assert.deepEqual([out[1], out[2]], [SCENE.red, SCENE.blue].map(Math.fround));
  // Standing on the red dish, it sees red ahead.
  draw(directions, DISHES.red.x, 0, DISHES.red.z, 0, out, null);
  assert.equal(out[0], Math.fround(SCENE.red));
  // At the end of a swoop the disc above is dark, and only above.
  draw(directions, 0, 0, 0, 0, out, 1);
  assert.equal(out[3], 0);
  assert.equal(out[0], Math.fround(SCENE.floor));
  assert.ok(SCENE.red < SCENE.floor && SCENE.blue > SCENE.floor, 'to a fly, red is dark and blue bright');
});

test('the training summary pairs each fly with learning against the same fly without it', () => {
  const trial = (learns: boolean, onTrained: number, onOther: number): TrainingTrial => ({
    seed: 1, trained: 'red', reinforcement: 'sugar', learns,
    training: { seconds: 1, onTrained: 0, eating: 0, swoops: 0 },
    test: { seconds: 1, onTrained, onOther, preference: onTrained + onOther > 0 ? (onTrained - onOther) / (onTrained + onOther) : null },
    synapsesChanged: learns ? 3 : 0, kcSpikes: 0,
  });
  const summary = summarizeTraining([trial(true, 3, 1), trial(false, 1, 1)]).sugar as { pairedDifference: number; identicalPairs: number; synapsesChanged: number[] };
  assert.equal(summary.pairedDifference, 0.5);
  assert.equal(summary.identicalPairs, 0);
  assert.deepEqual(summary.synapsesChanged, [3]);
});
