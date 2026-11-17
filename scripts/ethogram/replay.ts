import { isDeepStrictEqual } from 'node:util';
import { Ethogram } from './metrics.ts';
import { SCREEN, loomGeometry, opticalWindow } from './escape.ts';
import type { EscapeTrial } from './escape.ts';
import { traceFrames, FREE_FLAGS, ESCAPE_FLAGS } from './trace.ts';
import type { FreeTrace } from './trace.ts';

export async function replayFree(trace: FreeTrace, checkpoint?: () => Promise<void>) {
  if (trace.kind !== 'free' || trace.dtSeconds !== 0.01 || ['x', 'y', 'z', 'yaw', 'unwrappedYaw'].some(k => !Number.isFinite(trace.initial[k as keyof FreeTrace['initial']])) || typeof trace.initial.onFeet !== 'boolean') throw new Error('invalid free-trace metadata');
  const floor = trace.floor;
  if (!(floor.kind === 'circle' ? Number.isFinite(floor.r) && floor.r > 0 : floor.kind === 'rect' && Number.isFinite(floor.hx) && floor.hx > 0 && Number.isFinite(floor.hz) && floor.hz > 0)) throw new Error('invalid trace floor');
  const e = new Ethogram(trace.dtSeconds);
  let { x, y, z, yaw, unwrappedYaw, onFeet } = trace.initial;
  for (const f of traceFrames(trace)) {
    if (f.frame % 10000 === 0) await checkpoint?.();
    const [nx, ny, nz, heading] = f.values;
    const standing = !!(f.flags & FREE_FLAGS.onFeet), grounded = onFeet && standing;
    const delta = Math.atan2(Math.sin(heading - yaw), Math.cos(heading - yaw));
    unwrappedYaw += delta;
    const edge = floor.kind === 'circle' ? Math.hypot(nx, nz) >= floor.r / Math.sqrt(2) : Math.abs(nx) >= floor.hx / Math.sqrt(2) || Math.abs(nz) >= floor.hz / Math.sqrt(2);
    e.add({ dt: trace.dtSeconds, speed: grounded ? Math.hypot(nx - x, ny - y, nz - z) / trace.dtSeconds : 0, yawRate: delta / trace.dtSeconds, yaw: unwrappedYaw, onFeet: grounded, grooming: !!(f.flags & FREE_FLAGS.grooming), eating: !!(f.flags & FREE_FLAGS.eating), jumped: !!(f.flags & FREE_FLAGS.jumped), edge });
    x = nx; y = ny; z = nz; yaw = heading; onFeet = standing;
  }
  return e.result();
}

/** Derive continuity directly from raw states, independently of the capture counter. */
export async function replayEscape(trial: EscapeTrial, checkpoint?: () => Promise<void>) {
  if (!trial.trace || trial.trace.kind !== 'escape' || trial.trace.frames !== opticalWindow(trial.kind, trial.lvMs).frames) throw new Error('missing or incomplete optical trace');
  let takeoffMs: number | null = null, landed = false, run = 0, longest = 0, maxEscape = 0, maxLoomInput = 0;
  let poweredFrames = 0, poweredWithLowRawNeuralFrames = 0;
  const window = opticalWindow(trial.kind, trial.lvMs);
  for (const f of traceFrames(trial.trace)) {
    if (f.frame % 10000 === 0) await checkpoint?.();
    const [rawWings, intentWings, reflex, wingbeat, escape, loomLeft, loomRight] = f.values;
    if ([rawWings, intentWings, reflex, wingbeat, escape, loomLeft, loomRight].some(v => v < 0 || v > 1)) throw new Error('optical command or sense outside its range');
    maxEscape = Math.max(maxEscape, escape); maxLoomInput = Math.max(maxLoomInput, loomLeft, loomRight);
    if (takeoffMs === null && (f.flags & ESCAPE_FLAGS.jumped) && f.frame * SCREEN.frameSeconds < window.responseEnd) takeoffMs = (f.frame + 1) * SCREEN.frameSeconds * 1000;
    if (takeoffMs === null || landed) continue;
    if (f.flags & ESCAPE_FLAGS.onFeet) { landed = true; run = 0; continue; }
    const powered = intentWings >= 0.6 && wingbeat > 0.15;
    run = powered ? run + 1 : 0; longest = Math.max(longest, run);
    if (powered) { poweredFrames++; if (rawWings < 0.6 && reflex >= 0.6) poweredWithLowRawNeuralFrames++; }
  }
  return { takeoffMs, ttcMs: takeoffMs !== null && (trial.kind === 'black' || trial.kind === 'checkerboard') ? loomGeometry(trial.lvMs).collisionSeconds * 1000 - takeoffMs : null, longestPoweredFlightSeconds: longest * SCREEN.frameSeconds, flown: longest >= 10, maxEscape, maxLoomInput, poweredFrames, poweredWithLowRawNeuralFrames };
}

export async function verifyTraces(results: readonly { seed: number; measured: unknown; trace?: FreeTrace | null }[], trials: readonly EscapeTrial[], checkpoint?: () => Promise<void>) {
  const free = [];
  for (const r of results) {
    if (!r.trace || !isDeepStrictEqual(await replayFree(r.trace, checkpoint), r.measured)) throw new Error(`free trace does not reproduce seed ${r.seed}`);
    free.push({ seed: r.seed, frames: r.trace.frames, matched: true });
  }
  const optical = [];
  for (const t of trials) {
    if (!t.eligible) { if (t.trace) throw new Error('ineligible trial has a stimulus trace'); continue; }
    const replayed = await replayEscape(t, checkpoint);
    for (const k of ['takeoffMs', 'ttcMs', 'longestPoweredFlightSeconds', 'flown', 'maxEscape', 'maxLoomInput'] as const) if (replayed[k] !== t[k]) throw new Error(`optical trace does not reproduce seed ${t.seed}: ${k}`);
    optical.push({ seed: t.seed, ...replayed, matched: true });
  }
  return { free, optical };
}
