import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { FrameWriter, traceFrames, FREE_FLAGS, ESCAPE_FLAGS } from '../../../scripts/ethogram/trace.ts';
import { replayFree, replayEscape, verifyTraces } from '../../../scripts/ethogram/replay.ts';
import { opticalWindow } from '../../../scripts/ethogram/escape.ts';
import type { EscapeTrial } from '../../../scripts/ethogram/escape.ts';

const initial = { x: 0, y: 0, z: 0, yaw: 0, unwrappedYaw: 0, onFeet: true };

test('raw positions independently supply speed, occupancy, bouts and censoring', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ethogram-frames-'));
  try {
    const w = new FrameWriter(join(dir, 'free.bin'), 'free');
    let x = 0;
    for (let i = 0; i < 100; i++) {
      if (i >= 20 && i < 70) x += 0.1;
      w.write(FREE_FLAGS.onFeet, [x, 0, 0, 0]);
    }
    const trace = { ...w.close(), initial, dtSeconds: 0.01, floor: { kind: 'circle' as const, r: 20 } };
    const m = await replayFree(trace);
    assert.ok(Math.abs(m.walkFraction! - 0.5) < 1e-12);
    assert.ok(Math.abs(m.walkBoutMean! - 0.5) < 1e-12);
    assert.equal(m.samples.walkingBouts, 1);
    assert.deepEqual(m.censoring.stopping, { left: 1, right: 1 });
    assert.ok(Math.abs(m.distanceMm - 5) < 1e-12);
    assert.equal(m.takeoffs, 0);
    await verifyTraces([{ seed: 1, trace, measured: m }], []);
    await assert.rejects(() => verifyTraces([{ seed: 1, trace, measured: { ...m, walkFraction: 1 } }], []));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('trace integrity rejects replacement, truncation, wrong order, nonfinite state and overwrite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ethogram-corruption-'));
  try {
    const file = join(dir, 'free.bin'), w = new FrameWriter(file, 'free');
    assert.throws(() => w.write(0, [NaN, 0, 0, 0]));
    w.write(1, [1, 2, 3, 0]);
    const trace = w.close();
    assert.throws(() => new FrameWriter(file, 'free'));
    assert.throws(() => w.write(1, [0, 0, 0, 0]));
    assert.equal([...traceFrames(trace)].length, 1);
    const bytes = readFileSync(file);
    writeFileSync(file, bytes.subarray(0, -1));
    assert.throws(() => [...traceFrames(trace)]);
    bytes.writeUInt32LE(7, 8);
    writeFileSync(file, bytes);
    assert.throws(() => [...traceFrames(trace)]);
    const changed = { ...trace, sha256: createHash('sha256').update(bytes).digest('hex') };
    assert.throws(() => [...traceFrames(changed)], /index/);
    bytes.writeUInt32LE(0, 8); bytes.writeDoubleLE(NaN, 16); writeFileSync(file, bytes);
    assert.throws(() => [...traceFrames({ ...trace, sha256: createHash('sha256').update(bytes).digest('hex') })], /nonfinite/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('optical replay exposes body power and rejects interruptions and later departures', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ethogram-flight-'));
  try {
    const base: EscapeTrial = { seed: 1, kind: 'flash', lvMs: 40, eligible: true, quietWaitSeconds: 3, baselineTakeoffs: 0, readyActivity: 'resting', takeoffMs: 5, ttcMs: null, jumpSpeedMmS: null, jumpAngleDeg: null, flown: false, longestPoweredFlightSeconds: 0.03, maxEscape: 0.5, maxLoomInput: 0, hour: 6 };
    const frames = opticalWindow(base.kind, base.lvMs).frames;
    for (const continuous of [false, true]) {
      const w = new FrameWriter(join(dir, `${continuous}.bin`), 'escape');
      for (let i = 0; i < frames; i++) {
        const flags = (i === 0 || i === 20 ? ESCAPE_FLAGS.jumped : 0) | (i === 15 ? ESCAPE_FLAGS.onFeet : 0);
        const power = continuous ? 0.62 : i === 6 ? 0 : 0.62;
        w.write(flags, [0.2, power, power, 0.5, 0.5, 0, 0]);
      }
      const trace = w.close(), t = { ...base, trace };
      const replayed = await replayEscape(t);
      assert.equal(replayed.flown, continuous);
      assert.equal(replayed.longestPoweredFlightSeconds, continuous ? 0.075 : 0.04);
      assert.ok(replayed.poweredWithLowRawNeuralFrames > 0);
      const actual = { ...t, ...replayed };
      await verifyTraces([], [actual]);
      await assert.rejects(() => verifyTraces([], [{ ...actual, takeoffMs: 10 }]));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
