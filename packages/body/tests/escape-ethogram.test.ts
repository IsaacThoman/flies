import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loomGeometry, facetLuminance, screenAt, regression, summarizeEscape, wilson, SCREEN } from '../../../scripts/ethogram/escape.ts';
import type { EscapeTrial } from '../../../scripts/ethogram/escape.ts';
import { scorecard } from '../../../scripts/ethogram/scoring.ts';
import { validateOptions } from '../../../scripts/ethogram.ts';

const eye = { x: 0, y: 1, z: 0 };
const trial: EscapeTrial = { seed: 1, kind: 'black', lvMs: 20, eligible: true, quietWaitSeconds: 3, baselineTakeoffs: 0, readyActivity: 'resting', takeoffMs: null, ttcMs: null, jumpSpeedMmS: null, jumpAngleDeg: null, flown: false, maxEscape: 0, maxLoomInput: 0, hour: 6 };

test('loom obeys the published angular expansion, pixel rounding and endpoints', () => {
  const g = loomGeometry(40);
  assert.equal(g.halfPixels(0), 2);
  assert.equal(g.halfPixels(g.seconds), 220);
  const ttc = 0.1;
  const px = g.halfPixels(g.collisionSeconds - ttc);
  const exact = SCREEN.pixelsPerMm * SCREEN.distanceMm * 0.04 / ttc;
  assert.ok(px >= exact && px < exact + 1);
  const angle = 2 * Math.atan(px / SCREEN.pixelsPerMm / SCREEN.distanceMm);
  assert.ok(Math.abs(angle - 2 * Math.atan(0.04 / ttc)) < 0.02);
  assert.ok(2 * Math.atan(220 / SCREEN.pixelsPerMm / SCREEN.distanceMm) * 180 / Math.PI > 120);
});

test('screen is fixed in the world and is seen only through intersecting facets', () => {
  const pose = screenAt(eye, 0);
  assert.equal(facetLuminance('black', 220, pose, eye, 0, 1, 0, 0), SCREEN.black);
  assert.equal(facetLuminance('black', 220, pose, eye, 0, -1, 0, 0), SCREEN.white);
  assert.equal(facetLuminance('black', 220, pose, eye, Math.PI, 1, 0, 0), SCREEN.white);
  assert.equal(facetLuminance('blank', 220, pose, eye, 0, 1, 0, 0), SCREEN.white);
  assert.equal(facetLuminance('flash', 2, pose, eye, 0, -1, 0, 0, true), SCREEN.black);
  assert.equal(facetLuminance('flash', 2, pose, eye, 0, 1, 0, 0, false), SCREEN.white);
});

test('checkerboard has eight white and eight black tiles at every size', () => {
  const pose = screenAt(eye, 0);
  for (const half of [10, 100, 220]) {
    const values: number[] = [];
    for (let u = 0; u < 4; u++) for (let v = 0; v < 4; v++) {
      const horizontal = ((u + 0.5) / 2 - 1) * half / SCREEN.pixelsPerMm;
      const vertical = ((v + 0.5) / 2 - 1) * half / SCREEN.pixelsPerMm;
      const norm = Math.hypot(SCREEN.distanceMm, horizontal, vertical);
      values.push(facetLuminance('checkerboard', half, pose, eye, 0, SCREEN.distanceMm / norm, horizontal / norm, vertical / norm));
    }
    assert.equal(values.filter(v => v === SCREEN.white).length, 8);
    assert.equal(values.filter(v => v === SCREEN.black).length, 8);
  }
});

test('timing keeps negative TTC and does not invent latencies for nonresponses', () => {
  const trials = [5, 20, 80].map((lvMs, i) => ({ ...trial, seed: i, lvMs, takeoffMs: 300, ttcMs: 2 * lvMs - 22, flown: true }));
  const s = summarizeEscape([...trials, { ...trial, seed: 4 }]);
  assert.equal(s.black.successes, 3);
  assert.equal(s.black.probability, 0.75);
  assert.deepEqual(s.black.fit, { slope: 2, intercept: -22, n: 3, ratios: 3 });
  assert.equal(s.values.escapeCBProbability, null);
  assert.equal(regression([{ x: 1, y: 2 }, { x: 1, y: 4 }, { x: 1, y: 7 }]), null);
});

test('readiness failures remain in the denominator accounting, never become a no-response trial', () => {
  const s = summarizeEscape([{ ...trial, eligible: false }, trial]);
  assert.equal(s.black.attempted, 2);
  assert.equal(s.black.readinessFailures, 1);
  assert.equal(s.black.n, 1);
  assert.equal(s.black.probability, 0);
  assert.equal(s.black.fit, null);
  assert.equal(wilson(0, 0), null);
  assert.ok(Math.abs(wilson(0, 10)![1] - 0.2775328) < 1e-6);
});

test('incompatible references cannot earn numeric scores, even at exact target values', () => {
  const card = scorecard({ speedMedian: 20, activeFraction: 0.54, walkBoutMean: 22.6195, escapeBWProbability: 0.82, escapeCBProbability: 0.87 });
  assert.equal(card.scored, 2);
  assert.equal(card.opticalBenchmarkMean, 10);
  assert.equal(card.rows.find(r => r.id === 'speed-median')!.score, null);
  assert.equal(card.overall, null);
  assert.equal(card.overallBounds[0], 20 / 21);
  assert.equal(card.overallBounds[1], 10);
  assert.throws(() => scorecard({ escapeBWProbability: 1.1 }));
  const none = scorecard({ escapeBWProbability: 0, escapeCBProbability: 0 });
  assert.equal(none.rows.find(r => r.id === 'loom-bw-slope')!.measured, null);
  assert.equal(none.rows.find(r => r.id === 'loom-bw-slope')!.score, null);
});

test('clock is explicit and invalid hours are refused', () => {
  const o = { hours: 1, burnSeconds: 60, seeds: [1], place: 'arena' };
  for (const hour of [-1, 24, Infinity, NaN]) assert.throws(() => validateOptions({ ...o, hour }));
  for (const hour of [0, 6, 23.5]) validateOptions({ ...o, hour });
});
