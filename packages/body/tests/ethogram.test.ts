import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bouts, Ethogram, Histogram, distanceScore, quantile } from '../../../scripts/ethogram/metrics.ts';
import { REFERENCES } from '../../../scripts/ethogram/references.ts';
import { comparisons, validateOptions } from '../../../scripts/ethogram.ts';

const sample = { dt: 0.01, speed: 0, yawRate: 0, yaw: 0, onFeet: true, grooming: false, eating: false, edge: false, jumped: false };

test('bout windows censor both edges rather than inventing transitions', () => {
  const bouts = new Bouts();
  bouts.add(true, 2);
  bouts.add(false, 1);
  bouts.add(true, 3);
  bouts.add(false, 1);
  bouts.add(true, 4);
  assert.deepEqual(bouts.complete, [3]);
  assert.equal(bouts.seconds, 9);
  assert.equal(bouts.starts, 2);
  assert.equal(bouts.censored, 1);
  assert.equal(bouts.rightCensored, true);
});

test('trace distinguishes actual walking, rotation, grooming, feeding and air time', () => {
  const e = new Ethogram(0.01);
  e.add(sample);
  for (let i = 0; i < 10; i++) e.add({ ...sample, speed: 10, edge: true });
  for (let i = 0; i < 20; i++) e.add({ ...sample, grooming: true });
  for (let i = 0; i < 30; i++) e.add({ ...sample, eating: true });
  for (let i = 0; i < 40; i++) e.add({ ...sample, onFeet: false, jumped: i === 0 });
  e.add(sample);
  const r = e.result();
  assert.ok(Math.abs(r.distanceMm - 1) < 1e-12);
  assert.ok(Math.abs(r.walkBoutMean! - 0.1) < 1e-12);
  assert.ok(Math.abs(r.groomBoutMean! - 0.2) < 1e-12);
  assert.ok(Math.abs(r.feedingBoutMean! - 0.3) < 1e-12);
  assert.ok(Math.abs(r.airborneBoutMean! - 0.4) < 1e-12);
  assert.ok(Math.abs(r.edgeFraction! - 10 / 62) < 1e-12);
  assert.equal(r.takeoffs, 1);
  assert.equal(r.saccadeAngleMean, null);
  assert.equal(r.saccadeDurationMedianMs, null);
  assert.equal(r.saccadeRate, 0);
});

test('rotation alone is activity but not translation', () => {
  const e = new Ethogram(0.01);
  e.add({ ...sample, yawRate: Math.PI });
  assert.equal(e.result().activeFraction, 1);
  assert.equal(e.result().walkFraction, 0);
  assert.equal(e.result().speedMedian, null);
});

test('peak-centred angle uses the entire 100 ms window, including subthreshold motion', () => {
  const e = new Ethogram(0.01);
  let yaw = 0;
  for (let i = 0; i < 30; i++) {
    const degreesPerSecond = i === 15 ? 300 : 100;
    const rate = degreesPerSecond * Math.PI / 180;
    yaw += rate * 0.01;
    e.add({ ...sample, speed: 10, yawRate: rate, yaw });
  }
  assert.ok(Math.abs(e.result().saccadeAngleMean! - 12) < 1e-10);
  assert.equal(e.result().saccadeDurationMedianMs, 10);
  assert.equal(e.result().samples.saccades, 1);
});

test('missing references and no observed events never earn scores', () => {
  const e = new Ethogram(0.01);
  e.add(sample);
  const rows = comparisons(e.result());
  assert.ok(rows.filter(r => r.observable === null).every(r => r.measured === null && r.exploratoryScore === null));
  assert.ok(rows.every(r => r.validatedScore === null));
  assert.equal(rows.find(r => r.id === 'saccade-angle')!.exploratoryScore, null);
});

test('score uses distance outside the acceptance band, rejects invalid scales', () => {
  assert.equal(distanceScore(10, 10, 2), 10);
  assert.equal(distanceScore(12, 10, 2), 10);
  assert.equal(distanceScore(13, 10, 2), 5);
  assert.equal(distanceScore(14, 10, 2), 0);
  assert.equal(distanceScore(-100, 10, 2), 0);
  assert.throws(() => distanceScore(NaN, 1, 1));
  assert.throws(() => distanceScore(0, 1, 0));
});

test('histogram quantiles bound error and report overflows as missing', () => {
  const h = new Histogram(0.1, 1);
  h.add(0.2, 1);
  h.add(0.4, 3);
  assert.ok(Math.abs(h.quantile(0.5)! - 0.4) < 0.1);
  h.add(5, 5);
  assert.equal(h.overflow, 5);
  assert.equal(h.quantile(0.9), null);
  assert.equal(quantile([], 0.5), null);
  assert.equal(quantile([1, 3, 2, 4], 0.5), 2.5);
});

test('duration and seed validation refuses ambiguous or misleading runs', () => {
  const valid = { hours: 1, burnSeconds: 60, seeds: [1, 2, 3], place: 'arena' };
  validateOptions(valid);
  for (const hours of [0, -1, NaN, Infinity, 25]) assert.throws(() => validateOptions({ ...valid, hours }));
  assert.throws(() => validateOptions({ ...valid, seeds: [1, 1] }));
  assert.throws(() => validateOptions({ ...valid, seeds: [1.5] }));
  assert.throws(() => validateOptions({ ...valid, place: 'absent' }));
  assert.throws(() => validateOptions({ ...valid, place: 'toString' }));
  assert.throws(() => validateOptions({ ...valid, burnSeconds: 0.001 }));
  assert.throws(() => new Ethogram(0.03));
});

test('each of 15 reference entries retains provenance, statistic and tolerance policy', () => {
  assert.equal(REFERENCES.length, 15);
  assert.equal(new Set(REFERENCES.map(r => r.id)).size, REFERENCES.length);
  assert.ok(REFERENCES.every(r => r.paper && r.url.startsWith('https://') && r.location && r.statistic && r.assay && r.limitation && r.toleranceKind && Number.isFinite(r.value) && r.tolerance > 0));
});

test('nearby peaks remain separate events even when their 100 ms windows overlap', () => {
  const e = new Ethogram(0.01);
  let yaw = 0;
  for (let i = 0; i < 35; i++) {
    const rate = (i === 15 ? 400 : i === 18 ? 300 : 0) * Math.PI / 180;
    yaw += rate * 0.01;
    e.add({ ...sample, speed: 10, yawRate: rate, yaw });
  }
  assert.equal(e.result().samples.saccades, 2);
  assert.equal(e.result().samples.saccadeAngles, 2);
  assert.ok(Math.abs(e.result().saccadeAngleMean! - 7) < 1e-10);
});

test('observation edges cannot create complete saccades or peak angles', () => {
  const e = new Ethogram(0.01);
  for (let i = 0; i < 15; i++) e.add({ ...sample, yawRate: i < 2 || i === 14 ? 5 : 0, yaw: i * 0.05 });
  assert.equal(e.result().samples.saccades, 0);
  assert.equal(e.result().samples.saccadeAngles, 0);
  assert.deepEqual(e.result().censoring.saccades, { left: 1, right: 1 });
});

test('nonfinite observations cannot corrupt the report', () => {
  const e = new Ethogram(0.01);
  for (const key of ['dt', 'speed', 'yawRate', 'yaw']) assert.throws(() => e.add({ ...sample, [key]: NaN }));
  assert.equal(e.result().seconds, 0);
});

test('a ground saccade window cannot include an airborne tail', () => {
  const e = new Ethogram(0.01);
  for (let i = 0; i < 30; i++) e.add({ ...sample, yawRate: i === 15 ? 5 : 0, yaw: i < 15 ? 0 : 0.05, onFeet: i !== 18 });
  assert.equal(e.result().samples.saccades, 1);
  assert.equal(e.result().samples.saccadeAngles, 0);
});
