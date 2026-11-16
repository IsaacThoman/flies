// A flat face of the back bar with things sunk into it: door gaps, panels,
// the toe kick, the fridge's glass, a brass cup pull. Nothing stands proud of
// the face (the fly walks in front of it), so everything is cut in: the face
// is laid out as a grid on the edges of what is cut, each cell either the
// face itself or the floor of a cut at its depth, with walls where depths
// meet. A panel with a bevel lays its own floor and four sloping sides.

import type { Look, Sheets, V3 } from "./backbar-sheet.ts";

/** Where a face lies: a point on it, the two ways across it (u, v), and the way out of it. */
export type Plane = { at: V3; u: V3; v: V3; n: V3 };

/** Something cut into a face: its rectangle, how deep, what its floor and walls are; with `bevel`, a panel whose sides slope that far in. */
export type Cut = { u0: number; u1: number; v0: number; v1: number; depth: number; floor: Look; wall?: Look; bevel?: number };

const point = (p: Plane, u: number, v: number, d: number): V3 => [p.at[0] + p.u[0] * u + p.v[0] * v - p.n[0] * d, p.at[1] + p.u[1] * u + p.v[1] * v - p.n[1] * d, p.at[2] + p.u[2] * u + p.v[2] * v - p.n[2] * d];
const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]];

/**
 * The face from (u0, v0) to (u1, v1) with its cuts (later ones over earlier),
 * each piece to the area `areaAt` gives for its middle along u; `splits` are
 * where along u one area gives way to the next, so no piece crosses one.
 */
export function cutFace(s: Sheets, p: Plane, u0: number, u1: number, v0: number, v1: number, face: Look, cuts: readonly Cut[], areaAt: (u: number) => number, splits: readonly number[] = []) {
  const us = [...new Set([u0, u1, ...splits.filter((x) => x > u0 && x < u1), ...cuts.flatMap((c) => [c.u0, c.u1])])].sort((a, b) => a - b);
  const vs = [...new Set([v0, v1, ...cuts.flatMap((c) => [c.v0, c.v1])])].sort((a, b) => a - b);
  const nu = us.length - 1;
  const nv = vs.length - 1;
  // Which cut each cell lies in (-1: the face).
  const cell = new Int16Array(nu * nv).fill(-1);
  for (let j = 0; j < nv; j++) {
    const vc = (vs[j] + vs[j + 1]) / 2;
    for (let i = 0; i < nu; i++) {
      const uc = (us[i] + us[i + 1]) / 2;
      for (let k = cuts.length - 1; k >= 0; k--) {
        const c = cuts[k];
        if (uc > c.u0 && uc < c.u1 && vc > c.v0 && vc < c.v1) {
          cell[j * nu + i] = k;
          break;
        }
      }
    }
  }
  const depth = (k: number) => (k < 0 ? 0 : cuts[k].depth);
  const bevelled = (k: number) => k >= 0 && cuts[k].bevel !== undefined;
  const split = new Set(splits);
  // Floors, in runs along u.
  for (let j = 0; j < nv; j++) {
    let i = 0;
    while (i < nu) {
      const k = cell[j * nu + i];
      let e = i + 1;
      while (e < nu && cell[j * nu + e] === k && !split.has(us[e])) e++;
      if (!bevelled(k)) {
        const d = depth(k);
        const l = k < 0 ? face : cuts[k].floor;
        s.quad(areaAt((us[i] + us[e]) / 2), point(p, us[i], vs[j], d), point(p, us[e], vs[j], d), point(p, us[e], vs[j + 1], d), point(p, us[i], vs[j + 1], d), l, p.n);
      }
      i = e;
    }
  }
  // Walls where neighbouring cells sink to different depths, facing into the deeper.
  const wall = (k0: number, k1: number, a: V3, b: V3, c: V3, d: V3, into: V3, u: number) => {
    const deep = depth(k1) > depth(k0) ? k1 : k0;
    const l = cuts[deep].wall ?? cuts[deep].floor;
    s.quad(areaAt(u), a, b, c, d, l, deep === k1 ? into : neg(into));
  };
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const k = cell[j * nu + i];
      if (bevelled(k)) continue;
      if (i + 1 < nu) {
        const r = cell[j * nu + i + 1];
        if (!bevelled(r) && depth(r) !== depth(k)) {
          const u = us[i + 1];
          const [a, b] = [depth(k), depth(r)];
          wall(k, r, point(p, u, vs[j], a), point(p, u, vs[j + 1], a), point(p, u, vs[j + 1], b), point(p, u, vs[j], b), p.u, (us[i] + us[i + 1]) / 2);
        }
      }
      if (j + 1 < nv) {
        const t = cell[(j + 1) * nu + i];
        if (!bevelled(t) && depth(t) !== depth(k)) {
          const v = vs[j + 1];
          const [a, b] = [depth(k), depth(t)];
          wall(k, t, point(p, us[i], v, a), point(p, us[i + 1], v, a), point(p, us[i + 1], v, b), point(p, us[i], v, b), p.v, (us[i] + us[i + 1]) / 2);
        }
      }
    }
  }
  // Bevelled panels: a floor, and four sides sloping down to it from the face.
  for (const c of cuts) {
    if (c.bevel === undefined) continue;
    const b = c.bevel;
    const d = c.depth;
    const area = areaAt((c.u0 + c.u1) / 2);
    const o = [point(p, c.u0, c.v0, 0), point(p, c.u1, c.v0, 0), point(p, c.u1, c.v1, 0), point(p, c.u0, c.v1, 0)];
    const n = [point(p, c.u0 + b, c.v0 + b, d), point(p, c.u1 - b, c.v0 + b, d), point(p, c.u1 - b, c.v1 - b, d), point(p, c.u0 + b, c.v1 - b, d)];
    s.quad(area, n[0], n[1], n[2], n[3], c.floor, p.n);
    for (let k = 0; k < 4; k++) s.quad(area, o[k], o[(k + 1) % 4], n[(k + 1) % 4], n[k], c.wall ?? c.floor, p.n);
  }
}
