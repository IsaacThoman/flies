// Optical experiments: the stimulus reaches facets, never escape or motor neurons.
import { Rhythm } from '@fly/body';
import { World } from '@fly/world';
import type { Place } from '@fly/world';
import { Life } from '../../apps/web/src/life.ts';
import { InProcessBrain } from '../fuzz/brain.ts';
import { mean } from './metrics.ts';

export const LV_MS = [5, 10, 20, 40, 60, 80] as const;
export const SCREEN = { distanceMm: 67.5, pixelsPerMm: 1.65, firstHalfPixels: 2, lastHalfPixels: 220, black: 7.6 / 87.5, gray: 47.4 / 87.5, white: 1, frameSeconds: 0.005 } as const;
export const ESCAPE_PLACE: Place = { floor: { kind: 'circle', r: 2.5 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 500 };
export type EscapeKind = 'black' | 'checkerboard' | 'flash' | 'blank';
export type Vec = { x: number; y: number; z: number };
export type ScreenPose = { center: Vec; right: Vec; horizontal: Vec };
export type EscapeTrial = { seed: number; kind: EscapeKind; lvMs: number; eligible: boolean; quietWaitSeconds: number; baselineTakeoffs: number; readyActivity: string; takeoffMs: number | null; ttcMs: number | null; jumpSpeedMmS: number | null; jumpAngleDeg: number | null; flown: boolean; maxEscape: number; maxLoomInput: number; hour: number };

/** Pixel rounding and endpoints follow Fotowat et al. 2009, Visual stimulation. */
export function loomGeometry(lvMs: number) {
  const k = SCREEN.pixelsPerMm * SCREEN.distanceMm * lvMs / 1000;
  const collisionSeconds = k / SCREEN.firstHalfPixels;
  const seconds = collisionSeconds - k / SCREEN.lastHalfPixels;
  return { collisionSeconds, seconds, halfPixels: (time: number) => Math.min(SCREEN.lastHalfPixels, Math.ceil(k / Math.max(1e-9, collisionSeconds - time))) };
}
export function screenAt(eye: Vec, yaw: number): ScreenPose {
  const right = { x: -Math.cos(yaw), y: 0, z: Math.sin(yaw) };
  return { center: { x: eye.x + right.x * SCREEN.distanceMm, y: eye.y, z: eye.z + right.z * SCREEN.distanceMm }, right, horizontal: { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) } };
}

/** A fixed world-space screen; turning the body changes what the eyes see. */
export function facetLuminance(kind: EscapeKind, halfPixels: number, pose: ScreenPose, eye: Vec, yaw: number, x: number, y: number, z: number, flash = false) {
  if (kind === 'flash') return flash ? SCREEN.black : SCREEN.white;
  const background = kind === 'checkerboard' ? SCREEN.gray : SCREEN.white;
  if (kind === 'blank') return background;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const dx = -x * c + y * s, dz = x * s + y * c;
  const denominator = dx * pose.right.x + dz * pose.right.z;
  if (denominator <= 0) return background;
  const distance = ((pose.center.x - eye.x) * pose.right.x + (pose.center.z - eye.z) * pose.right.z) / denominator;
  if (distance <= 0) return background;
  const u = ((eye.x + dx * distance - pose.center.x) * pose.horizontal.x + (eye.z + dz * distance - pose.center.z) * pose.horizontal.z) * SCREEN.pixelsPerMm;
  const v = (eye.y + z * distance - pose.center.y) * SCREEN.pixelsPerMm;
  if (Math.abs(u) > halfPixels || Math.abs(v) > halfPixels) return background;
  if (kind === 'black') return SCREEN.black;
  const col = Math.min(3, Math.floor((u / halfPixels + 1) * 2));
  const row = Math.min(3, Math.floor((v / halfPixels + 1) * 2));
  return (row + col) % 2 ? SCREEN.white : SCREEN.black;
}

export function regression(points: readonly { x: number; y: number }[]) {
  if (points.length < 3 || new Set(points.map(p => p.x)).size < 2) return null;
  const x = mean(points.map(p => p.x))!, y = mean(points.map(p => p.y))!;
  let xx = 0, xy = 0;
  for (const p of points) { xx += (p.x - x) ** 2; xy += (p.x - x) * (p.y - y); }
  const slope = xy / xx;
  const intercept = y - slope * x;
  const variance = points.reduce((sum, p) => sum + (p.y - intercept - slope * p.x) ** 2, 0) / (points.length - 2);
  return { slope, intercept, n: points.length, ratios: new Set(points.map(p => p.x)).size, slopeSE: Math.sqrt(variance / xx), interceptSE: Math.sqrt(variance * (1 / points.length + x * x / xx)) };
}
export function wilson(successes: number, n: number): [number, number] | null {
  if (!n) return null;
  const z = 1.959963984540054, p = successes / n, d = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / d;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}
export function summarizeEscape(trials: readonly EscapeTrial[]) {
  const group = (kind: EscapeKind) => {
    const all = trials.filter(t => t.kind === kind), eligible = all.filter(t => t.eligible);
    const successful = eligible.filter(t => t.flown && t.takeoffMs !== null);
    const fit = regression(successful.map(t => ({ x: t.lvMs, y: t.ttcMs! })));
    return { attempted: all.length, n: eligible.length, readinessFailures: all.length - eligible.length, successes: successful.length, probability: eligible.length ? successful.length / eligible.length : null, probabilityCI95: wilson(successful.length, eligible.length), fit, perLv: LV_MS.map(lv => {
      const each = eligible.filter(t => t.lvMs === lv), jumps = each.filter(t => t.takeoffMs !== null);
      return { lvMs: lv, n: each.length, successes: each.filter(t => t.flown).length, takeoffMsMean: mean(jumps.map(t => t.takeoffMs!)), ttcMsMean: mean(jumps.map(t => t.ttcMs!)) };
    }) };
  };
  const black = group('black'), checkerboard = group('checkerboard'), flash = group('flash'), blank = group('blank');
  return { black, checkerboard, flash, blank, values: { escapeBWProbability: black.probability, escapeCBProbability: checkerboard.probability, escapeFlashProbability: flash.probability, escapeBWSlope: black.fit?.slope ?? null, escapeBWIntercept: black.fit?.intercept ?? null, escapeCBSlope: checkerboard.fit?.slope ?? null, escapeCBIntercept: checkerboard.fit?.intercept ?? null } };
}

export async function opticalTrial(data: ArrayBuffer, kind: EscapeKind, lvMs: number, seed: number, hour: number, checkpoint: () => Promise<void>): Promise<EscapeTrial> {
  await checkpoint();
  const driver = new InProcessBrain(data, seed);
  const life = new Life(new World(ESCAPE_PLACE), driver);
  life.rhythm = new Rhythm(hour, { sunrise: 6, sunset: 18 });
  if (!driver.eyes) throw new Error('optical assay requires the real eye map');
  const light = { left: new Float32Array(driver.eyes.left.directions.length / 3), right: new Float32Array(driver.eyes.right.directions.length / 3) };
  life.light = light;
  const ground = kind === 'checkerboard' ? SCREEN.gray : SCREEN.white;
  light.left.fill(ground); light.right.fill(ground);
  const dt = SCREEN.frameSeconds;
  const step = () => { life.rhythm!.setTime(hour); life.step(dt, performance.now()); };
  const eye = { x: 0, y: 0, z: 0 };
  let quiet = 0, frame = 0;
  // The retina initializes adapted to its first steady field; the wait establishes body readiness.
  for (; frame < 120 / dt && quiet < 3; frame++) {
    if (frame % 200 === 0) await checkpoint();
    const p = life.body.position, x = p.x, y = p.y, z = p.z, yaw = life.body.yaw;
    step();
    const angular = Math.abs(Math.atan2(Math.sin(life.body.yaw - yaw), Math.cos(life.body.yaw - yaw))) / dt;
    const speed = Math.hypot(p.x - x, p.y - y, p.z - z) / dt;
    quiet = life.body.onFeet && speed <= 0.5 && angular <= 20 * Math.PI / 180 ? quiet + dt : 0;
  }
  const result: EscapeTrial = { seed, kind, lvMs, eligible: quiet >= 3, quietWaitSeconds: frame * dt, baselineTakeoffs: life.takeOffs, readyActivity: life.activity, takeoffMs: null, ttcMs: null, jumpSpeedMmS: null, jumpAngleDeg: null, flown: false, maxEscape: 0, maxLoomInput: 0, hour };
  if (!result.eligible) { driver.dispose(); return result; }
  life.body.point(0.42, 0.3, 0, eye);
  const pose = screenAt(eye, life.body.yaw);
  const geometry = loomGeometry(lvMs);
  const presentation = kind === 'flash' ? 0.025 : geometry.seconds;
  const responseEnd = kind === 'flash' ? 0.25 : presentation + 0.25;
  const duration = responseEnd + 0.1;
  let airAfterJump = 0;
  try {
    for (let i = 0; i < Math.ceil(duration / dt); i++) {
      if (i % 200 === 0) await checkpoint();
      const t = i * dt;
      life.body.point(0.42, 0.3, 0, eye);
      for (const side of ['left', 'right'] as const) {
        const directions = driver.eyes[side].directions, out = light[side];
        for (let k = 0; k < out.length; k++) out[k] = facetLuminance(kind, geometry.halfPixels(Math.min(t, geometry.seconds)), pose, eye, life.body.yaw, directions[3 * k], directions[3 * k + 1], directions[3 * k + 2], t < 0.025);
      }
      step();
      result.maxEscape = Math.max(result.maxEscape, life.intent.escape);
      result.maxLoomInput = Math.max(result.maxLoomInput, life.sensed.loomLeft, life.sensed.loomRight);
      // A late response can have negative TTC; excluding it would bias the fitted timing.
      if (life.body.events.jumped && t < responseEnd && result.takeoffMs === null) {
        result.takeoffMs = (i + 1) * dt * 1000;
        result.ttcMs = kind === 'black' || kind === 'checkerboard' ? geometry.collisionSeconds * 1000 - result.takeoffMs : null;
        const v = life.body.velocity;
        result.jumpSpeedMmS = Math.hypot(v.x, v.y, v.z);
        result.jumpAngleDeg = Math.atan2(v.y, Math.hypot(v.x, v.z)) * 180 / Math.PI;
      }
      if (result.takeoffMs !== null && !life.body.onFeet && life.intent.wings >= 0.6 && life.body.wingbeat > 0.15) airAfterJump += dt;
    }
  } finally { driver.dispose(); }
  // A jump followed by at least 50 ms of powered airborne wing drive operationalizes jump-and-flight; report the rule.
  result.flown = result.takeoffMs !== null && airAfterJump >= 0.05;
  return result;
}

export async function escapeBattery(data: ArrayBuffer, perRatio: number, hour: number, checkpoint: () => Promise<void>, seedBase = 10000) {
  if (!Number.isInteger(perRatio) || perRatio < 1 || perRatio > 100) throw new Error('trials must be an integer in [1,100] per ratio and pattern');
  if (!Number.isFinite(hour) || hour < 0 || hour >= 24) throw new Error('hour must be in [0,24)');
  if (!Number.isInteger(seedBase) || seedBase < 0 || seedBase + 14 * perRatio > 0x100000000) throw new Error('trial seeds must be uint32');
  const firstSeed = seedBase;
  const trials: EscapeTrial[] = [];
  for (const kind of ['black', 'checkerboard'] as const) for (const lv of LV_MS) for (let n = 0; n < perRatio; n++) {
    trials.push(await opticalTrial(data, kind, lv, seedBase++, hour, checkpoint));
    process.stderr.write(`${kind} l/v=${lv} ms: ${n + 1}/${perRatio}\n`);
  }
  for (const kind of ['flash', 'blank'] as const) for (let n = 0; n < perRatio; n++) trials.push(await opticalTrial(data, kind, 40, seedBase++, hour, checkpoint));
  return { protocol: { hour, sunrise: 6, sunset: 18, lvMs: LV_MS, perRatio, firstSeed, screen: SCREEN, source: 'Fotowat et al. 2009, Figures 1–3; Visual stimulation; Video recordings and analysis', limitations: ['Clock time was not reported in the publication; assay pins ZT0 to remove clock variation.', 'The virtual 5 mm platform reproduces the funnel exit diameter, not climbing inside the funnel.', 'Facet luminance preserves measured contrast ratios; spectral composition and absolute photon flux are not modeled.', 'Flash is a uniform 25 ms luminance-off surrogate, not a geometric model of four LEDs.', 'Takeoff time resolution is 5 ms; powered-flight criterion is 50 ms with wing drive ≥0.6 and wingbeat >0.15, not a reconstruction of wing kinematics.', 'The final square is held for a 250 ms response window; negative TTC responses are retained. Flash has a 250 ms onset response window.'] }, trials, summary: summarizeEscape(trials) };
}
