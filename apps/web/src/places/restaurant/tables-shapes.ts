// The tables and the chair as templates, each built once round the middle
// of its world solids (moved there) and stamped where every table and chair
// stands (tables.ts). Every top is the world's to within half a millimetre:
// the slabs' tops flat to a 1.5 mm round-over at the edge, the foot and the
// crossed bars at their domes, the seat's cane, the posts' caps and the top
// rail's crown sampled from the world's own heights. What the world leaves
// out (the spider's open arms, the legs' tapers, the column's waist, the bars'
// arches) is cut from inside each solid, never added outside it.

import { topHeight } from "@fly/world";
import type { Solid } from "@fly/world";
import { KIND } from "./kinds.ts";
import { TBL } from "./tables-look.ts";
import { Mesh, grainColour } from "./tables-mesh.ts";
import type { Turn } from "./tables-mesh.ts";

type P3 = readonly [number, number, number];

/** An arc of radius `rad` round (cr, cy), from angle a0 to a1, as profile points facing out from its middle. */
function arc(cr: number, cy: number, rad: number, a0: number, a1: number, steps: number): Turn[] {
  const out: Turn[] = [];
  for (let k = 0; k <= steps; k++) {
    const a = a0 + ((a1 - a0) * k) / steps;
    out.push([cr + rad * Math.cos(a), cy + rad * Math.sin(a), Math.cos(a), Math.sin(a)]);
  }
  return out;
}

/** A profile point on a top y(r), facing up off it. */
function onTop(y: (r: number) => number, r: number, lower = 0): Turn {
  const d = (y(r + 0.01) - y(r - 0.01)) / 0.02;
  const l = Math.hypot(d, 1);
  return [r, y(r) - lower, -d / l, 1 / l];
}

/** A point under a bottom y(r), facing down off it. */
function onBottom(y: (r: number) => number, r: number): Turn {
  const d = (y(r + 0.01) - y(r - 0.01)) / 0.02;
  const l = Math.hypot(d, 1);
  return [r, y(r), d / l, -1 / l];
}

/** A slab's edge, from its underside's middle (`inner`) out to the felt edge and back over its top: a chamfer under, the side, a 1.5 mm round-over. */
function slabEdge(inner: number, edge: number, bottom: number, top: number, chamfer: number, rise: number): Turn[] {
  const e = edge - 0.05;
  const l = Math.hypot(chamfer, rise);
  const cn: [number, number] = [rise / l, -chamfer / l];
  return [[inner, bottom, 0, -1], [e - chamfer, bottom, 0, -1], [e - chamfer, bottom, ...cn], [e, bottom + rise, ...cn], [e, bottom + rise, 1, 0], ...arc(e - 1.5, top - 1.5, 1.5, 0, Math.PI / 2, 5), [inner, top, 0, 1]];
}

/** A solid moved so that (x, z) is its middle. */
export function centred(s: Solid, x: number, z: number): Solid {
  return { ...s, footprint: { ...s.footprint, x: s.footprint.x - x, z: s.footprint.z - z } };
}

const radius = (s: Solid) => (s.footprint.kind === "circle" ? s.footprint.r : 0);
const half = (s: Solid) => (s.footprint.kind === "box" ? s.footprint : { hx: 0, hz: 0, angle: 0 });

/** A marble top, round or square: the slab and its edge. */
export function marbleTop(m: Mesh, top: Solid) {
  const bottom = top.bottom ?? 0;
  const y = topHeight(top, top.footprint.x, top.footprint.z);
  // The sawn underside and its chamfer are left unpolished; the edge and the top are polished marble.
  if (top.footprint.kind === "circle") {
    const edge = slabEdge(0, radius(top), bottom, y, 6, 3.5);
    m.kind(TBL.stone).plain().revolve(edge.slice(0, 4), 160);
    m.kind(KIND.marble).revolve(edge.slice(4), 160);
    return;
  }
  // Corners turned 3 mm: no more of the top is missing at a corner than the round-over takes along an edge.
  const { hx, hz } = half(top);
  const edge = slabEdge(0, 3, bottom, y, 2.9, 2);
  m.kind(TBL.stone).plain().sweep(hx, hz, 3, edge.slice(0, 4), 4).plate(-hx + 3, -hz + 3, hx - 3, hz - 3, bottom, false);
  m.kind(KIND.marble).sweep(hx, hz, 3, edge.slice(4), 4).plate(-hx + 3, -hz + 3, hx - 3, hz - 3, y, true);
}

/** The cast-iron spider under a marble top: a hub and four arms out to screw bosses, open between them. */
export function spider(m: Mesh, s: Solid, round: boolean) {
  const bottom = s.bottom ?? 0;
  // Into the slab above by a tenth, so no seam shows.
  const top = topHeight(s, s.footprint.x, s.footprint.z) + 0.1;
  // The bosses reach the felt edge: the disc's for a round top, the square's corners along the diagonals.
  const reach = round ? radius(s) - 12 : (half(s).hx - 12) * Math.SQRT2;
  m.kind(TBL.iron).plain();
  m.revolve([[0, bottom, 0, -1], [45, bottom, 0, -1], [45, bottom, 0.7, -0.7], [48, bottom + 3, 0.7, -0.7], [48, bottom + 3, 1, 0], [48, top, 1, 0]], 48);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const section = (d: number, w: number): P3[] =>
      [[-w, top], [w, top], [w, bottom + 3], [w - 3, bottom], [3 - w, bottom], [-w, bottom + 3]].map(([q, y]) => [dx * d - dz * q, y, dz * d + dx * q] as const);
    m.loft(section(40, 14), section(reach, 9));
    m.revolve([[0, bottom, 0, -1], [9.5, bottom, 0, -1], ...arc(9.5, bottom + 1.5, 1.5, -Math.PI / 2, 0, 3), [11, top, 1, 0]], 20, dx * reach, dz * reach);
  }
}

/**
 * The cast-iron column: a plinth and a bead where it stands (buried in the
 * round foot, so it starts higher there), a cove flaring up into a fluted
 * shaft, a collar, and a trumpet out to the spider's hub.
 */
export function column(m: Mesh, s: Solid, from: number) {
  const r0 = radius(s) - 0.2;
  const top = topHeight(s, s.footprint.x, s.footprint.z);
  const st: [number, number, number][] = [];
  if (from <= 0) {
    st.push([-0.1, r0, 0], [14, r0, 0], [15.2, r0 - 3.8, 0]);
    for (const a of [-45, 0, 45, 90]) st.push([19 + 3.8 * Math.sin((a * Math.PI) / 180), r0 - 3.8 + 3.8 * Math.cos((a * Math.PI) / 180), 0]);
  }
  const t0 = Math.max(0, (from - 22.8) / 97.2);
  for (let k = 0; k <= 6; k++) {
    const t = t0 + ((1 - t0) * k) / 6;
    st.push([22.8 + 97.2 * t, 21 + (r0 - 3.8 - 21) * Math.max(0, 1 - t) ** 2.2, 0]);
  }
  st.push([150, 20.8, 1.7], [530, 19.6, 1.7], [560, 19.5, 0], [570, 19.5, 0]);
  for (const a of [-90, -45, 0, 45, 90]) st.push([578 + 4.5 * Math.sin((a * Math.PI) / 180), 21.5 + 4.5 * Math.cos((a * Math.PI) / 180), 0]);
  st.push([586, 20, 0], [640, 20, 0]);
  for (let k = 1; k <= 6; k++) st.push([640 + ((top - 640) * k) / 6, 20 + (r0 - 20) * (k / 6) ** 2.4, 0]);
  const flutes = 8;
  m.kind(TBL.iron).plain();
  m.surface(
    st.length - 1,
    64,
    (u, v) => {
      const t = Math.min(st.length - 1.000001, u * (st.length - 1));
      const i = Math.floor(t);
      const f = t - i;
      const y = st[i][0] + (st[i + 1][0] - st[i][0]) * f;
      const depth = st[i][2] + (st[i + 1][2] - st[i][2]) * f;
      const a = v * Math.PI * 2;
      const p = ((a * flutes) / (Math.PI * 2)) % 1;
      const g = Math.abs(p - 0.5) < 0.4 ? Math.sqrt(1 - ((p - 0.5) / 0.4) ** 2) : 0;
      const r = st[i][1] + (st[i + 1][1] - st[i][1]) * f - depth * g;
      return [r * Math.cos(a), y, r * Math.sin(a)];
    },
    (p) => [p[0], 0, p[2]],
  );
}

/** The round cast foot: its dome exactly, turned over at the rim into a short edge standing on the floor. */
export function roundFoot(m: Mesh, s: Solid) {
  const y = (r: number) => topHeight(s, s.footprint.x + r, s.footprint.z);
  const edge = radius(s) - 1.5;
  const profile: Turn[] = [];
  for (let k = 0; k <= 9; k++) profile.push(onTop(y, 24 + ((edge - 24) * k) / 9));
  const [r, yy, nr, ny] = profile[profile.length - 1];
  const rim = arc(r - 1.5 * nr, yy - 1.5 * ny, 1.5, Math.atan2(ny, nr), 0, 4);
  const out = rim[rim.length - 1][0];
  m.kind(TBL.iron).plain();
  m.revolve([...profile, ...rim.slice(1), [out, -0.1, 1, 0]], 96);
}

/** The square tables' crossed foot: two cast bars at their domes, a little arched underneath between their feet. */
export function crossedFoot(m: Mesh, bars: readonly Solid[]) {
  m.kind(TBL.iron).plain();
  for (const bar of bars) {
    const { hx, hz, angle } = half(bar);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const at = (u: number, v: number) => [u * c + v * s, -u * s + v * c] as const;
    const h = (u: number, v: number) => {
      const [x, z] = at(u, v);
      return topHeight(bar, x, z);
    };
    const under = (u: number) => 6 * smooth(215, 190, Math.abs(u));
    const U = hx - 0.1;
    const V = hz - 0.1;
    const nu = 48;
    // Across the bar the grid keeps a line where the dome's ridge gives way to its round (|v| / hz = |u| / hx), so the crease stays straight.
    m.surface(
      nu,
      12,
      (a, b) => {
        const u = (-1 + 2 * a) * U;
        const k = (Math.abs(u) / hx) * V;
        const v = b < 5 / 12 ? -V + (b / (5 / 12)) * (V - k) : b < 7 / 12 ? -k + ((b - 5 / 12) / (2 / 12)) * 2 * k : k + ((b - 7 / 12) / (5 / 12)) * (V - k);
        const [x, z] = at(u, v);
        return [x, h(u, v), z];
      },
      () => [0, 1, 0],
    );
    for (const side of [-1, 1]) {
      const [nx, nz] = at(0, side);
      m.grid(nu, 1, (i, j) => {
        const u = (-1 + (2 * i) / nu) * U;
        const [x, z] = at(u, side * V);
        return [x, j ? h(u, side * V) : under(u), z, nx, 0, nz];
      });
      const [ex, ez] = at(side, 0);
      m.grid(12, 1, (i, j) => {
        const v = (-1 + (2 * i) / 12) * V;
        const [x, z] = at(side * U, v);
        return [x, j ? h(side * U, v) : -0.1, z, ex, 0, ez];
      });
    }
    m.grid(nu, 1, (i, j) => {
      const u = (-1 + (2 * i) / nu) * U;
      const [x, z] = at(u, (j ? 1 : -1) * V);
      return [x, under(u), z, 0, -1, 0];
    });
  }
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** An oak four-top's top: the slab, its edges eased, the grain along x. */
export function oakTop(m: Mesh, top: Solid) {
  const { hx, hz } = half(top);
  const bottom = top.bottom ?? 0;
  const y = topHeight(top, top.footprint.x, top.footprint.z);
  m.kind(TBL.oak).grain(1, 0);
  m.sweep(hx, hz, 3, slabEdge(0, 3, bottom, y, 2.9, 3), 4);
  m.plate(-hx + 3, -hz + 3, hx - 3, hz - 3, y, true).plate(-hx + 3, -hz + 3, hx - 3, hz - 3, bottom, false);
}

/** A rectangle's corners eased by `c`, at height y: an eight-sided ring. */
const eased = (x0: number, z0: number, x1: number, z1: number, y: number, c: number): P3[] => [
  [x0 + c, y, z0], [x1 - c, y, z0], [x1, y, z0 + c], [x1, y, z1 - c], [x1 - c, y, z1], [x0 + c, y, z1], [x0, y, z1 - c], [x0, y, z0 + c],
];

/** A four-top's leg, tapered on its two inner faces down to the floor. */
export function oakLeg(m: Mesh, leg: Solid, into: number) {
  const f = leg.footprint;
  const { hx, hz } = half(leg);
  const sx = Math.sign(f.x);
  const sz = Math.sign(f.z);
  const ring = (y: number, taper: number) => {
    const xs = [f.x + sx * hx, f.x - sx * (hx - taper)];
    const zs = [f.z + sz * hz, f.z - sz * (hz - taper)];
    return eased(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), y, 1.5);
  };
  m.kind(TBL.oak).grain(0, 0);
  m.loft(ring(-0.1, 8), ring(into, 0));
}

/** An apron board between two legs, its lower edges eased, its ends in the legs. */
export function apron(m: Mesh, board: Solid, into: number) {
  const f = board.footprint;
  const { hx, hz } = half(board);
  const bottom = board.bottom ?? 0;
  const alongX = hx > hz;
  const len = (alongX ? hx : hz) + 5;
  const t = alongX ? hz : hx;
  const section = (d: number): P3[] =>
    [[-t, into], [t, into], [t, bottom + 1.5], [t - 1.5, bottom], [1.5 - t, bottom], [-t, bottom + 1.5]].map(([q, y]): P3 => (alongX ? [f.x + d, y, f.z + q] : [f.x + q, y, f.z + d]));
  m.kind(TBL.oak).grain(alongX ? 1 : 0, alongX ? 0 : 1);
  m.loft(section(-len), section(len));
}

/** The chair's solids, upright and upturned, moved to its own frame: aside along x, ahead along z. */
export type ChairSolids = { seat: Solid; leg: Solid; post: Solid; rail: Solid; mid: Solid; tip: Solid };

/**
 * The bentwood chair, upright, in two pieces: everything but the back legs
 * below the seat (`back`), and those (`rear`): the world's upturned chair
 * has no back legs in the air, so it is `back` turned over. `flip` is the
 * height the upturned chair mirrors about (y to flip − y), its cane just
 * touching the table.
 */
export function chair(c: ChairSolids, flip: number): { back: Mesh; rear: Mesh } {
  const back = new Mesh();
  const rear = new Mesh();
  const seatY = (r: number) => topHeight(c.seat, r, 0);
  const R = radius(c.seat);
  const under = c.seat.bottom ?? 0;
  const cane = R - 17;
  const legR = radius(c.leg) - 0.4;
  const foot = legR - 2.6;
  // The upturned legs' rounded tips are their feet: the foot's underside is the tip's dome turned over.
  const footY = (r: number) => flip - topHeight(c.tip, c.tip.footprint.x + r, c.tip.footprint.z);
  const sole: Turn[] = [0, 5, 8.5, foot].map((r) => onBottom(footY, r));
  const ankle = sole[sole.length - 1];
  const side = (r0: number, y0: number, r1: number, y1: number): Turn[] => {
    const l = Math.hypot(r1 - r0, y1 - y0);
    const n = [(y1 - y0) / l, -(r1 - r0) / l] as const;
    return [[r0, y0, ...n], [r1, y1, ...n]];
  };
  const scuffed = (_a: number, y: number) => [0, 0, y < 30 ? 0.7 : 0] as const;
  const lowLeg = [...sole, ...side(foot, ankle[1], foot + 0.2, 30), ...side(foot + 0.2, 30, legR, under + 1).slice(1)];
  back.kind(TBL.bent);
  rear.kind(TBL.bent);
  for (const s of [-1, 1]) {
    back.revolve(lowLeg, 16, s * Math.abs(c.leg.footprint.x), c.leg.footprint.z, scuffed);
    rear.revolve(lowLeg, 16, s * Math.abs(c.post.footprint.x), c.post.footprint.z, scuffed);
  }
  // The back's posts: on up from inside the seat (where, turned over, the cane hides their ends), a little slimmer, to the world's caps.
  const postY = (r: number) => topHeight(c.post, c.post.footprint.x + r, c.post.footprint.z);
  const neck = legR - 0.8;
  const cap: Turn[] = [neck, 10.5, 7, 3.5, 0].map((r) => onTop(postY, r));
  // Worn only round the caps, where hands take the chair: a ring of the profile just below them keeps the rest unworn.
  const shoulder = cap[0][1] - 25;
  const upper = [...side(legR, under + 1, neck + 0.05, shoulder), ...side(neck + 0.05, shoulder, neck, cap[0][1]).slice(1), ...cap];
  for (const s of [-1, 1]) back.revolve(upper, 16, s * Math.abs(c.post.footprint.x), c.post.footprint.z, (_a, y) => [0, 0, y > shoulder + 1 ? 0.5 : 0]);

  // The seat: cane in a bent rim, both at the world's dome, the rim rounded over and under, the cane's underside a hair above the rim's.
  const rimTop: Turn[] = [cane, (cane + R) / 2, R - 1.5].map((r) => onTop(seatY, r));
  const [lr, ly, lnr, lny] = rimTop[2];
  const over = arc(lr - 1.5 * lnr, ly - 1.5 * lny, 1.5, Math.atan2(lny, lnr), 0, 3);
  const out = over[over.length - 1][0];
  const rim: Turn[] = [
    ...rimTop,
    ...over.slice(1),
    [out, under + 1.5, 1, 0],
    ...arc(out - 1.5, under + 1.5, 1.5, 0, -Math.PI / 2, 2).slice(1),
    [cane, under, 0, -1],
    [cane, under, -1, 0],
    [cane, under + 0.4, -1, 0],
  ];
  back.revolve(rim, 64, 0, 0, (a, y) => [-Math.sin(a), Math.cos(a), Math.max(0, Math.sin(a)) ** 3 * (y > under + 12 ? 0.9 : 0.25)]);
  const top: Turn[] = [0, 70, 120, 158, cane].map((r) => onTop(seatY, r));
  back.kind(KIND.cane).plain().revolve(top, 64).revolve([[cane, under + 0.4, 0, -1], [0, under + 0.4, 0, -1]], 64);

  // The top rail: a bent band straight across between the posts, its crown the world's exactly, its lower edges eased.
  back.kind(TBL.bent);
  const rail = c.rail;
  const rz = rail.footprint.z;
  const { hx: rx, hz: rd } = half(rail);
  const rb = rail.bottom ?? 0;
  const crown = (u: number, v: number) => topHeight(rail, u, rz + v);
  const ridge = (u: number) => {
    const d = (crown(Math.min(rx - 0.6, u + 0.05), rz) - crown(Math.max(-rx + 0.6, u - 0.05), rz)) / 0.1;
    const l = Math.hypot(d, 1);
    return [-d / l, 1 / l, 0] as const;
  };
  const V = rd - 0.05;
  const railAt = (u: number) => {
    const pts: [number, number, number, number, number, number][] = [];
    const push = (v: number, y: number, n: readonly [number, number, number], wear = 0) => pts.push([v, y, n[0], n[1], n[2], wear]);
    push(-V + 1.5, rb, [0, -1, 0]);
    push(V - 1.5, rb, [0, -1, 0]);
    for (const [v, y, nv, ny] of arc(V - 1.5, rb + 1.5, 1.5, -Math.PI / 2, 0, 3).slice(1)) push(v, y, [0, ny, nv]);
    for (let k = 0; k <= 10; k++) {
      const th = Math.PI / 2 - (k * Math.PI) / 10;
      const v = V * Math.sin(th);
      // Where the band's round governs the world's dome its normal is the round's; toward the ends, the ridge's slope along it.
      const n = Math.abs(v) / rd >= Math.abs(u) / rx ? ([0, Math.cos(th), Math.sin(th)] as const) : ridge(u);
      push(v, crown(u, v), n, Math.abs(th) < 0.9 ? 0.4 * (1 - (u / rx) ** 2) : 0);
    }
    for (const [v, y, nv, ny] of arc(1.5 - V, rb + 1.5, 1.5, Math.PI, (3 * Math.PI) / 2, 3)) push(v, y, [0, ny, nv]);
    push(-V + 1.5, rb, [0, -1, 0]);
    return pts;
  };
  bar(back, -rx, rx, 18, rz, railAt);

  // The mid rail: a plain band with its edges rounded, a little into the posts at either end.
  const mid = c.mid;
  const { hz: md } = half(mid);
  const m0 = mid.bottom ?? 0;
  const m1 = topHeight(mid, mid.footprint.x, mid.footprint.z);
  const W = md - 0.05;
  const midSection: [number, number, number, number, number, number][] = [];
  for (const [cv, cy, a0] of [[W - 1.5, m0 + 1.5, -Math.PI / 2], [W - 1.5, m1 - 1.5, 0], [1.5 - W, m1 - 1.5, Math.PI / 2], [1.5 - W, m0 + 1.5, Math.PI]] as const) {
    for (const [v, y, nv, ny] of arc(cv, cy, 1.5, a0, a0 + Math.PI / 2, 3)) midSection.push([v, y, 0, ny, nv, 0]);
  }
  midSection.push(midSection[0]);
  bar(back, -Math.abs(c.post.footprint.x) + 8, Math.abs(c.post.footprint.x) - 8, 1, mid.footprint.z, () => midSection);
  return { back, rear };
}

/** A band along x at z = zc: its section (v across, y up, the normal's x, y, z, and the finish's wear) at each u. */
function bar(m: Mesh, u0: number, u1: number, steps: number, zc: number, section: (u: number) => readonly (readonly [number, number, number, number, number, number])[]) {
  const rows: (readonly (readonly [number, number, number, number, number, number])[])[] = [];
  for (let i = 0; i <= steps; i++) rows.push(section(u0 + ((u1 - u0) * i) / steps));
  m.grid(steps, rows[0].length - 1, (i, j) => {
    const [v, y, nx, ny, nz, wear] = rows[i][j];
    return [u0 + ((u1 - u0) * i) / steps, y, zc + v, nx, ny, nz, ...grainColour(1, 0, wear)];
  });
}

/** A ring of `n` points round (x, z) at height y. */
const ring = (x: number, z: number, r: number, n: number, y: number, turn = 0): P3[] =>
  Array.from({ length: n }, (_, k) => {
    const a = turn + (k / n) * Math.PI * 2;
    return [x + r * Math.cos(a), y, z + r * Math.sin(a)] as const;
  });

/** A fan over a ring, facing up or down. */
function fan(m: Mesh, points: readonly P3[], up: boolean) {
  const n = up ? 1 : -1;
  const c = points.reduce((s, p) => [s[0] + p[0] / points.length, s[1] + p[1] / points.length, s[2] + p[2] / points.length], [0, 0, 0]);
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    m.tri([c[0], c[1], c[2], 0, n, 0], [a[0], a[1], a[2], 0, n, 0], [b[0], b[1], b[2], 0, n, 0]);
  }
}

/** The far stand-ins: a pedestal table (round or square) in a few dozen triangles. */
export function farPedestal(m: Mesh, top: Solid, foot: readonly Solid[], pedestal: Solid) {
  const bottom = top.bottom ?? 0;
  const y = topHeight(top, 0, 0);
  m.kind(KIND.marble).plain();
  if (top.footprint.kind === "circle") m.loft(ring(0, 0, radius(top), 12, bottom), ring(0, 0, radius(top), 12, y), true, true);
  else m.loft(eased(-half(top).hx, -half(top).hz, half(top).hx, half(top).hz, bottom, 0).filter((_, i) => i % 2 === 0), eased(-half(top).hx, -half(top).hz, half(top).hx, half(top).hz, y, 0).filter((_, i) => i % 2 === 0), true, true);
  m.kind(TBL.iron);
  m.loft(ring(0, 0, radius(pedestal) * 0.8, 4, 0), ring(0, 0, radius(pedestal) * 0.8, 4, topHeight(pedestal, 0, 0)));
  for (const f of foot) {
    if (f.footprint.kind === "circle") {
      const rim = ring(0, 0, radius(f), 8, topHeight(f, radius(f), 0));
      const apex = topHeight(f, 0, 0);
      for (let i = 0; i < 8; i++) m.tri([0, apex, 0, 0, 1, 0], [...rim[i], 0, 1, 0], [...rim[(i + 1) % 8], 0, 1, 0]);
      continue;
    }
    const { hx, hz, angle } = half(f);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const box = (yy: number): P3[] => [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([u, v]) => [u * c + v * s, yy, -u * s + v * c] as const);
    m.loft(box(0), box(topHeight(f, 0, 0) * 0.7), false, true);
  }
}

/** The far stand-in of a four-top: its top, legs and aprons as boxes. */
export function farFour(m: Mesh, top: Solid, legs: readonly Solid[], aprons: readonly Solid[]) {
  const { hx, hz } = half(top);
  const bottom = top.bottom ?? 0;
  const y = topHeight(top, 0, 0);
  const box = (x0: number, z0: number, x1: number, z1: number, yy: number) => eased(x0, z0, x1, z1, yy, 0).filter((_, i) => i % 2 === 0);
  m.kind(TBL.oak);
  m.loft(box(-hx, -hz, hx, hz, bottom), box(-hx, -hz, hx, hz, y), true, true);
  for (const s of [...legs, ...aprons]) {
    const f = s.footprint;
    const h = half(s);
    m.loft(box(f.x - h.hx, f.z - h.hz, f.x + h.hx, f.z + h.hz, s.bottom ?? 0), box(f.x - h.hx, f.z - h.hz, f.x + h.hx, f.z + h.hz, bottom));
  }
}

/** The far stand-in of the chair, upright and upturned: seat, legs, posts and rails as a few prisms. */
export function farChair(c: ChairSolids, flip: number): { upright: Mesh; upturned: Mesh } {
  const build = (whole: boolean) => {
    const m = new Mesh();
    const R = radius(c.seat);
    const under = c.seat.bottom ?? 0;
    const crown = topHeight(c.seat, R * 0.5, 0);
    m.kind(KIND.bentwood).plain();
    const low = ring(0, 0, R, 8, under, Math.PI / 8);
    const high = ring(0, 0, R, 8, crown, Math.PI / 8);
    m.loft(low, high, true, false);
    m.kind(KIND.cane);
    fan(m, high, true);
    m.kind(KIND.bentwood);
    const r = radius(c.leg) - 1;
    const lx = Math.abs(c.leg.footprint.x);
    for (const s of [-1, 1]) {
      m.loft(ring(s * lx, c.leg.footprint.z, r, 3, 0), ring(s * lx, c.leg.footprint.z, r, 3, under));
      m.loft(ring(s * lx, c.post.footprint.z, r, 3, whole ? 0 : under), ring(s * lx, c.post.footprint.z, r, 3, topHeight(c.post, c.post.footprint.x, c.post.footprint.z) - 2), false, true);
    }
    for (const s of [c.rail, c.mid]) {
      const h = half(s);
      const f = s.footprint;
      const yb = s.bottom ?? 0;
      const yt = topHeight(s, f.x, f.z) - (s === c.rail ? 4 : 0);
      const box = (yy: number): P3[] => [[-h.hx, f.z - h.hz], [h.hx, f.z - h.hz], [h.hx, f.z + h.hz], [-h.hx, f.z + h.hz]].map(([x, z]) => [x, yy, z] as const);
      m.loft(box(yb), box(yt));
    }
    return m;
  };
  return { upright: build(true), upturned: build(false).flipped(flip) };
}
