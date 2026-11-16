// What the fly's compound eyes see: the world rendered round its head as six
// small square views (the faces of a cube), read back once, and resampled to
// the facets: for each facet, the brightness of the world in the direction it
// looks.
//
// Frames: the brain gives facet directions in the fly's head frame (x toward
// its right, y straight ahead, z up). The body's own frame, like the model's,
// has +x on its left, +y up and +z ahead.

import type { EyeMap } from "@fly/brain";

export type Basis = {
  /** The way the face looks, and its right and up, in the fly's body frame. */
  forward: readonly [number, number, number];
  right: readonly [number, number, number];
  up: readonly [number, number, number];
};

/** The six views round the head, each 90° square, in the order they sit side by side in the picture. */
export const FACES: readonly Basis[] = [
  { forward: [0, 0, 1], right: [-1, 0, 0], up: [0, 1, 0] }, // ahead
  { forward: [-1, 0, 0], right: [0, 0, -1], up: [0, 1, 0] }, // its right
  { forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0] }, // behind
  { forward: [1, 0, 0], right: [0, 0, 1], up: [0, 1, 0] }, // its left
  { forward: [0, 1, 0], right: [-1, 0, 0], up: [0, 0, -1] }, // above
  { forward: [0, -1, 0], right: [-1, 0, 0], up: [0, 0, 1] }, // below
];

/** A head-frame direction (x right, y ahead, z up) in the body frame (x left, y up, z ahead). */
export function headToBody(x: number, y: number, z: number, out: [number, number, number]) {
  out[0] = -x;
  out[1] = z;
  out[2] = y;
  return out;
}

const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Which face a body-frame direction falls on, and where on it (u and v from 0 to 1, v up). */
export function project(d: readonly number[]): { face: number; u: number; v: number } {
  let face = 0;
  let best = -Infinity;
  for (let i = 0; i < FACES.length; i++) {
    const along = dot(d, FACES[i].forward);
    if (along > best) {
      best = along;
      face = i;
    }
  }
  const basis = FACES[face];
  return { face, u: (dot(d, basis.right) / best + 1) / 2, v: (dot(d, basis.up) / best + 1) / 2 };
}

/**
 * How to read each facet's brightness from the picture: four pixels and their
 * weights (bilinear), into an RGBA picture `resolution` × 6 wide and
 * `resolution` high, rows from the bottom up (as WebGL reads them back).
 */
export type Sampler = { count: number; resolution: number; index: Int32Array; weight: Float32Array };

export function createSampler(directions: Float32Array, resolution: number): Sampler {
  const count = Math.floor(directions.length / 3);
  const index = new Int32Array(count * 4);
  const weight = new Float32Array(count * 4);
  const width = resolution * FACES.length;
  const d: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    headToBody(directions[i * 3], directions[i * 3 + 1], directions[i * 3 + 2], d);
    const { face, u, v } = project(d);
    // Pixel centres sit at half-pixels; keep the four taps inside the face.
    const fx = Math.min(resolution - 1, Math.max(0, u * resolution - 0.5));
    const fy = Math.min(resolution - 1, Math.max(0, v * resolution - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(resolution - 1, x0 + 1);
    const y1 = Math.min(resolution - 1, y0 + 1);
    const ax = fx - x0;
    const ay = fy - y0;
    const at = (x: number, y: number) => (y * width + face * resolution + x) * 4;
    index[i * 4] = at(x0, y0);
    index[i * 4 + 1] = at(x1, y0);
    index[i * 4 + 2] = at(x0, y1);
    index[i * 4 + 3] = at(x1, y1);
    weight[i * 4] = (1 - ax) * (1 - ay);
    weight[i * 4 + 1] = ax * (1 - ay);
    weight[i * 4 + 2] = (1 - ax) * ay;
    weight[i * 4 + 3] = ax * ay;
  }
  return { count, resolution, index, weight };
}

/**
 * How a fly weights red, green and blue light. Its outer photoreceptors
 * (R1-R6, rhodopsin Rh1), which feed the lamina cells the brain's eyes are
 * driven through, are most sensitive to blue-green light and barely to red, so
 * a blue sky is bright to a fly where human luminance would call it dim. A
 * rough three-band stand-in for Rh1's spectral sensitivity, not a fit.
 */
export const FLY_RGB = [0.1, 0.45, 0.45] as const;

/** Brightness (0 to 1) of each facet, from the read-back picture. Allocates nothing. */
export function sample(pixels: Uint8Array, sampler: Sampler, out: Float32Array) {
  const { index, weight, count } = sampler;
  const [wr, wg, wb] = FLY_RGB;
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const p = index[i * 4 + k];
      sum += weight[i * 4 + k] * (wr * pixels[p] + wg * pixels[p + 1] + wb * pixels[p + 2]);
    }
    out[i] = sum / 255;
  }
  return out;
}

/**
 * Light adaptation: the eyes' working range follows the scene's overall
 * brightness. A fly's photoreceptors adapt their gain (and close their
 * pupil, the pigment granules that shade the rhabdomere) so that they code
 * contrast across many log units of light, from dusk to full sun; dusk is
 * still far above the light at which their own noise takes over. The
 * picture's brightness is the screen's, not the world's: dusk renders at 0.15
 * and night at 0.07 to 0.09 where midday renders at 0.6 to 0.66 (the picnic,
 * the fly's right eye). The brain's input stage measures contrast against the
 * ambient level plus a floor of 0.05 for black (RETINA.floor), which at those
 * levels stands where the photoreceptors' noise would and cut a dark ball's
 * contrast from 0.89 at midday to 0.70 at dusk and 0.63 at night. So the
 * picture is scaled up toward the level midday has (ADAPT_LEVEL), by at most
 * ADAPT_GAIN: dusk's ball then has a contrast of 0.86, and night's 0.76.
 * Midday is left as it is: the gain never goes below 1. Real flies do see
 * worse in dim light (fewer photons, a slower, noisier response), and a cap of
 * 4, which brought night up to midday's level, also made a quiet night's
 * scene set the fly off more often with nothing thrown at it (measured while
 * the bubbles were still drawn as bright as by day: 9 to 12 take-offs in 4
 * minutes, against 2 to 3 with no adaptation and 6 to 10 at 2); 2 is the
 * smaller step.
 *
 * It follows the picture's mean over ADAPT_SECONDS. Real light adaptation is
 * quick and dark adaptation takes minutes; one slow time constant keeps the
 * gain from moving with the fly's gaze or a passing ball (which darkens a
 * quarter of what the two eyes see for half a second, moving the gain by
 * about 3%), and the brain takes its slow changes calmly: after night jumps to
 * midday the picture dims back from white over seconds, and the giant fiber
 * stays at its resting level (escape 0.15 to 0.18 against 0.14 to 0.15, at a
 * time constant of 4 or 8 s; 0.22 at 2 s).
 */
export const ADAPT_LEVEL = 0.5;
export const ADAPT_GAIN = 2;
export const ADAPT_SECONDS = 4;

export class Adaptation {
  /** The picture's mean brightness it has adapted to, before the gain; negative until the first picture. */
  level = -1;
  gain = 1;

  /** Scales both eyes' light in place, `dt` seconds after the last picture. Allocates nothing. */
  apply(light: { left: Float32Array; right: Float32Array }, dt: number) {
    let sum = 0;
    for (let i = 0; i < light.left.length; i++) sum += light.left[i];
    for (let i = 0; i < light.right.length; i++) sum += light.right[i];
    const n = light.left.length + light.right.length;
    if (n === 0) return;
    const mean = sum / n;
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.level = this.level < 0 ? mean : this.level + (mean - this.level) * (1 - Math.exp(-step / ADAPT_SECONDS));
    this.gain = Math.min(ADAPT_GAIN, Math.max(1, ADAPT_LEVEL / Math.max(1e-6, this.level)));
    if (this.gain === 1) return;
    for (let i = 0; i < light.left.length; i++) light.left[i] = Math.min(1, light.left[i] * this.gain);
    for (let i = 0; i < light.right.length; i++) light.right[i] = Math.min(1, light.right[i] * this.gain);
  }
}

/**
 * A stand-in for the brain's eyes, until it has its own: about `perEye`
 * facets per eye, evenly spread over each eye's field (from a little past
 * straight ahead round to behind, and from well below to above), in the head
 * frame. It is a picture of what the eyes take in, not the real layout.
 */
export function standInEyes(perEye = 880): EyeMap {
  // Each eye covers about 41% of the sphere; spread enough points to fill it.
  const total = Math.round(perEye / 0.41);
  const left: number[] = [];
  const right: number[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < total; i++) {
    const z = 1 - ((i + 0.5) / total) * 2;
    const r = Math.sqrt(1 - z * z);
    const a = i * golden;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (z < -0.75 || z > 0.92) continue;
    // Each eye sees its own side and a little across the middle in front.
    const ahead = y > 0.5;
    if (x > 0.12 || (ahead && x > -0.12)) right.push(x, y, z);
    if (x < -0.12 || (ahead && x < 0.12)) left.push(x, y, z);
  }
  return { left: { directions: Float32Array.from(left) }, right: { directions: Float32Array.from(right) }, acceptance: (5 * Math.PI) / 180 };
}
