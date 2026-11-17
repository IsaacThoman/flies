// One leg, from its coxa on the thorax to the claw. The tarsus is placed
// first, back from the claw along the two directions it is given (on the
// ground: the last four tarsomeres lying nearly flat, the basitarsus sloping
// up to the tibia), then the coxa turns part of the way toward it and the
// femur and tibia close the gap as a two-bone chain whose knee bends toward
// the pole. If the ankle is out of reach the whole tarsus slides back along
// the chain rather than the segments stretching, and the solver reports how
// far the claw ended up from where it was asked to be. The knee remembers
// which way it bent last frame, so that a pole passing through the line of
// the leg swings it round smoothly instead of flipping it over.

import { setFrame } from "./affine.ts";
import type { LegSpec } from "./anatomy.ts";

const s = new Float64Array(48);
// Scratch slots in `s`: points H C K A B F, then D, P, N, cd.
const H = 0, C = 3, K = 6, A = 9, B = 12, F = 15, D = 18, P = 21, N = 24, CD = 27;

function normalize(i: number): number {
  const l = Math.sqrt(s[i] * s[i] + s[i + 1] * s[i + 1] + s[i + 2] * s[i + 2]);
  if (l > 1e-9) {
    s[i] /= l; s[i + 1] /= l; s[i + 2] /= l;
  }
  return l;
}

/** Writes the frame of the segment from point `from` to point `to` (x along it, z near the leg plane's normal). */
function segmentFrame(out: Float32Array, o: number, from: number, to: number): void {
  let xx = s[to] - s[from], xy = s[to + 1] - s[from + 1], xz = s[to + 2] - s[from + 2];
  const l = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
  xx /= l; xy /= l; xz /= l;
  const nx = s[N], ny = s[N + 1], nz = s[N + 2];
  let yx = ny * xz - nz * xy, yy = nz * xx - nx * xz, yz = nx * xy - ny * xx;
  let yl = Math.sqrt(yx * yx + yy * yy + yz * yz);
  if (yl < 1e-6) {
    yx = -xz; yy = 0; yz = xx;
    yl = Math.sqrt(yx * yx + yz * yz) || 1;
  }
  yx /= yl; yy /= yl; yz /= yl;
  setFrame(out, o, xx, xy, xz, yx, yy, yz, xy * yz - xz * yy, xz * yx - xx * yz, xx * yy - xy * yx, s[from], s[from + 1], s[from + 2]);
}

export type LegInput = {
  /** Coxa base and the coxa's rest direction, in the model's space. */
  hip: Float64Array;
  coxaRest: Float64Array;
  /** Where the claw should be. */
  foot: Float64Array;
  /** Unit directions of tarsomeres 2–5 and of the basitarsus, each pointing toward the claw. */
  distal: Float64Array;
  basal: Float64Array;
  /** Which way the knee bends. */
  pole: Float64Array;
};

/**
 * Solves one leg and writes its five segment frames (coxa, femur, tibia,
 * basitarsus, tarsomeres 2–5) to `out` from offset `o`. `bend` holds the
 * leg's knee direction from the last solve at offset `b` (zeros at first),
 * and is updated. Returns the distance between the claw and its target.
 */
export function solveLeg(spec: LegSpec, input: LegInput, out: Float32Array, o: number, bend: Float64Array, b: number): number {
  const { hip, coxaRest, foot, distal, basal, pole } = input;
  for (let k = 0; k < 3; k++) {
    s[H + k] = hip[k];
    s[F + k] = foot[k];
    s[B + k] = foot[k] - distal[k] * spec.tarsus;
    s[A + k] = s[B + k] - basal[k] * spec.basitarsus;
  }

  // The coxa swings part of the way toward the ankle.
  for (let k = 0; k < 3; k++) s[CD + k] = s[A + k] - s[H + k];
  normalize(CD);
  for (let k = 0; k < 3; k++) s[CD + k] = coxaRest[k] + (s[CD + k] - coxaRest[k]) * spec.coxaFollow;
  normalize(CD);
  for (let k = 0; k < 3; k++) {
    s[C + k] = s[H + k] + s[CD + k] * spec.coxa;
    s[D + k] = s[A + k] - s[C + k];
  }

  const lf = spec.femur, lt = spec.tibia;
  let wanted = normalize(D);
  // An ankle folded right back onto the coxa has no direction of its own: carry on along the coxa.
  if (wanted < 1e-4) {
    s[D] = s[CD]; s[D + 1] = s[CD + 1]; s[D + 2] = s[CD + 2];
    wanted = 0;
  }
  const dist = Math.min(lf + lt - 1e-4, Math.max(Math.abs(lf - lt) + 0.01, wanted));
  const slide = dist - wanted;
  for (let k = 0; k < 3; k++) {
    const shift = s[D + k] * slide;
    s[A + k] += shift; s[B + k] += shift; s[F + k] += shift;
  }

  // Knee: in the plane of the chain and the pole, bending toward the pole,
  // with last frame's bend added in to carry it through a degenerate pole.
  const pl = Math.sqrt(pole[0] * pole[0] + pole[1] * pole[1] + pole[2] * pole[2]) || 1;
  const pd = (pole[0] * s[D] + pole[1] * s[D + 1] + pole[2] * s[D + 2]) / pl;
  const bd = bend[b] * s[D] + bend[b + 1] * s[D + 1] + bend[b + 2] * s[D + 2];
  for (let k = 0; k < 3; k++) s[P + k] = pole[k] / pl - s[D + k] * pd + 1.5 * (bend[b + k] - s[D + k] * bd);
  if (normalize(P) < 1e-6) {
    s[P] = 0; s[P + 1] = 1; s[P + 2] = 0;
  }
  bend[b] = s[P]; bend[b + 1] = s[P + 1]; bend[b + 2] = s[P + 2];
  const along = (lf * lf - lt * lt + dist * dist) / (2 * dist);
  const up = Math.sqrt(Math.max(0, lf * lf - along * along));
  for (let k = 0; k < 3; k++) s[K + k] = s[C + k] + s[D + k] * along + s[P + k] * up;
  s[N] = s[D + 1] * s[P + 2] - s[D + 2] * s[P + 1];
  s[N + 1] = s[D + 2] * s[P] - s[D] * s[P + 2];
  s[N + 2] = s[D] * s[P + 1] - s[D + 1] * s[P];

  segmentFrame(out, o, H, C);
  segmentFrame(out, o + 12, C, K);
  segmentFrame(out, o + 24, K, A);
  segmentFrame(out, o + 36, A, B);
  segmentFrame(out, o + 48, B, F);
  const ex = s[F] - foot[0], ey = s[F + 1] - foot[1], ez = s[F + 2] - foot[2];
  return Math.sqrt(ex * ex + ey * ey + ez * ez);
}
