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

/**
 * The cast-iron spider under a marble top: a hub, and four arms along the
 * world's two crossed boxes, each a flat bar screwed to the slab over a web
 * that arches up toward a boss at the box's end.
 */
export function spider(m: Mesh, hub: Solid, arms: readonly Solid[]) {
  const bottom = hub.bottom ?? 0;
  // Into the slab above by a tenth, so no seam shows.
  const top = topHeight(hub, hub.footprint.x, hub.footprint.z) + 0.1;
  const r = radius(hub) - 0.05;
  m.kind(TBL.iron).plain();
  m.revolve([[0, bottom, 0, -1], [r - 3, bottom, 0, -1], [r - 3, bottom, 0.7, -0.7], [r, bottom + 3, 0.7, -0.7], [r, bottom + 3, 1, 0], [r, top, 1, 0]], 48);
  for (const arm of arms) {
    const { hx, hz, angle } = half(arm);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const w = hz - 0.5;
    const boss = hx - w - 0.1;
    for (const end of [-1, 1]) {
      const dx = end * c;
      const dz = -end * s;
      const at = (d: number, q: number, y: number): P3 => [dx * d - dz * q, y, dz * d + dx * q];
      const box = (d: number, half: number, y0: number, y1: number): P3[] => [at(d, -half, y1), at(d, half, y1), at(d, half, y0), at(d, -half, y0)];
      // The bar under the slab, 6 deep, from inside the hub to the boss.
      m.loft(box(30, w, top - 6, top), box(boss, w, top - 6, top));
      // The web, deep at the hub, rising to the boss.
      const web = (d: number) => bottom + 4 + (top - 16 - bottom - 4) * smooth(r - 4, boss, d);
      for (let k = 0; k < 5; k++) {
        const d0 = r - 4 + ((boss - r + 4) * k) / 5;
        const d1 = r - 4 + ((boss - r + 4) * (k + 1)) / 5;
        m.loft(box(d0, 3.5, web(d0), top - 5.9), box(d1, 3.5, web(d1), top - 5.9));
      }
      m.revolve([[0, top - 18, 0, -1], [w - 1.5, top - 18, 0, -1], ...arc(w - 1.5, top - 16.5, 1.5, -Math.PI / 2, 0, 3), [w, top, 1, 0]], 20, dx * boss, dz * boss);
    }
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
 * The bentwood chair, upright. Turned over about `flip` (y to flip − y) it
 * is the upturned chair too, its cane just touching the table, its rear
 * legs' feet the world's rounded tips like the front legs'.
 */
export function chair(c: ChairSolids, flip: number): Mesh {
  const m = new Mesh();
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
  m.kind(TBL.bent);
  for (const s of [-1, 1]) {
    m.revolve(lowLeg, 16, s * Math.abs(c.leg.footprint.x), c.leg.footprint.z, scuffed);
    m.revolve(lowLeg, 16, s * Math.abs(c.post.footprint.x), c.post.footprint.z, scuffed);
  }
  // The back's posts: on up from the rear legs through the seat, a little slimmer, to the world's caps.
  const postY = (r: number) => topHeight(c.post, c.post.footprint.x + r, c.post.footprint.z);
  const neck = legR - 0.8;
  const cap: Turn[] = [neck, 10.5, 7, 3.5, 0].map((r) => onTop(postY, r));
  // Worn only round the caps, where hands take the chair: a ring of the profile just below them keeps the rest unworn.
  const shoulder = cap[0][1] - 25;
  const upper = [...side(legR, under + 1, neck + 0.05, shoulder), ...side(neck + 0.05, shoulder, neck, cap[0][1]).slice(1), ...cap];
  for (const s of [-1, 1]) m.revolve(upper, 16, s * Math.abs(c.post.footprint.x), c.post.footprint.z, (_a, y) => [0, 0, y > shoulder + 1 ? 0.5 : 0]);

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
  m.revolve(rim, 64, 0, 0, (a, y) => [-Math.sin(a), Math.cos(a), Math.max(0, Math.sin(a)) ** 3 * (y > under + 12 ? 0.9 : 0.25)]);
  const top: Turn[] = [0, 70, 120, 158, cane].map((r) => onTop(seatY, r));
  m.kind(KIND.cane).plain().revolve(top, 64).revolve([[cane, under + 0.4, 0, -1], [0, under + 0.4, 0, -1]], 64);

  // The top rail: a bent band straight across between the posts, its crown the world's vault exactly (round across, level along), its lower edges eased.
  m.kind(TBL.bent);
  const rail = c.rail;
  const rz = rail.footprint.z;
  const { hx: rx, hz: rd } = half(rail);
  const rb = rail.bottom ?? 0;
  const crown = (u: number, v: number) => topHeight(rail, u, rz + v);
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
      push(v, crown(u, v), [0, Math.cos(th), Math.sin(th)], Math.abs(th) < 0.9 ? 0.4 * (1 - (u / rx) ** 2) : 0);
    }
    for (const [v, y, nv, ny] of arc(1.5 - V, rb + 1.5, 1.5, Math.PI, (3 * Math.PI) / 2, 3)) push(v, y, [0, ny, nv]);
    push(-V + 1.5, rb, [0, -1, 0]);
    return pts;
  };
  // Level along, it needs few steps: enough for the wear to fade toward the posts.
  bar(m, -rx, rx, 6, rz, railAt);

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
  bar(m, -Math.abs(c.post.footprint.x) + 8, Math.abs(c.post.footprint.x) - 8, 1, mid.footprint.z, () => midSection);
  return m;
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

/*
 * The far stand-ins: what is drawn from beyond an area's reach, and what the
 * fly's eyes see six times a frame, so a few dozen triangles each. They are
 * the near shapes' silhouettes, inside the world's solids, with the near
 * kinds and the same grain and wear, and normals that round them, so the
 * switch between the two is a change of a few millimetres at the edges.
 */

/** A turned point of a far stand-in, its normal tilted `t` from up toward out (radians). */
const tilt = (r: number, y: number, t: number): Turn => [r, y, Math.sin(t), Math.cos(t)];

/** A pedestal table: the slab and its rounded edge, the column flaring to the top, and the foot. */
export function farPedestal(m: Mesh, top: Solid, foot: readonly Solid[], pedestal: Solid) {
  const bottom = top.bottom ?? 0;
  const y = topHeight(top, 0, 0);
  if (top.footprint.kind === "circle") {
    const R = radius(top) - 0.05;
    m.kind(KIND.marble).plain().revolve([tilt(0, y, 0), tilt(R - 1.5, y, 0.2), tilt(R, bottom + 3.5, 1.9)], 20);
    m.kind(TBL.stone).revolve([tilt(R, bottom + 3.5, 2.2), tilt(0, bottom, Math.PI)], 20);
  } else {
    const { hx, hz } = half(top);
    const box = (yy: number, inset: number): P3[] => [[-hx + inset, -hz + inset], [hx - inset, -hz + inset], [hx - inset, hz - inset], [-hx + inset, hz - inset]].map(([x, z]) => [x, yy, z] as const);
    m.kind(KIND.marble).plain().loft(box(bottom + 2, 0.05), box(y, 0.05), false, true);
    m.kind(TBL.stone).loft(box(bottom, 2.95), box(bottom + 2, 0.05), true, false);
  }
  // The column, in six sides: its foot's cove, the shaft, the trumpet to the spider.
  const r0 = radius(pedestal) - 0.2;
  const py = topHeight(pedestal, 0, 0);
  m.kind(TBL.iron).plain().revolve([tilt(r0 - 3.8, 20, Math.PI / 2), tilt(20, 640, Math.PI / 2), tilt(r0, py, 1.2)], 6);
  for (const f of foot) {
    if (f.footprint.kind === "circle") {
      const fy = (r: number) => topHeight(f, r, 0);
      const R = radius(f) - 1.5;
      m.revolve([tilt(0, fy(0), 0), tilt(R * 0.55, fy(R * 0.55), 0.3), tilt(R + 1.4, -0.1, 1.2)], 12);
      continue;
    }
    // A crossed bar as a low pyramid under its dome: the dome's level lines are rectangles, and so are a pyramid's.
    const { hx, hz, angle } = half(f);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const at = (u: number, v: number, yy: number): P3 => [u * c + v * s, yy, -u * s + v * c];
    const eave = topHeight(f, hx, 0) - 0.1;
    const U = hx - 0.1;
    const V = hz - 0.1;
    const base = [at(-U, -V, eave), at(U, -V, eave), at(U, V, eave), at(-U, V, eave)];
    m.loft(base.map((p): P3 => [p[0], -0.1, p[2]]), base);
    const apex = at(0, 0, topHeight(f, 0, 0) - 0.1);
    for (let k = 0; k < 4; k++) {
      const p = base[k];
      const q = base[(k + 1) % 4];
      const n = cross([q[0] - p[0], q[1] - p[1], q[2] - p[2]], [apex[0] - p[0], apex[1] - p[1], apex[2] - p[2]]);
      m.tri([...p, ...n], [...q, ...n], [...apex, ...n]);
    }
  }
}

/** The unit normal of two edges, turned to face up. */
function cross(a: readonly number[], b: readonly number[]) {
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const l = Math.hypot(n[0], n[1], n[2]) * Math.sign(n[1]);
  return n.map((x) => x / l);
}

/** A four-top: the top and its eased edge, the tapered legs, the aprons. */
export function farFour(m: Mesh, top: Solid, legs: readonly Solid[], aprons: readonly Solid[]) {
  const { hx, hz } = half(top);
  const bottom = top.bottom ?? 0;
  const y = topHeight(top, 0, 0);
  const box = (x0: number, z0: number, x1: number, z1: number, yy: number): P3[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => [x, yy, z] as const);
  m.kind(TBL.oak).grain(1, 0);
  m.loft(box(-hx + 0.05, -hz + 0.05, hx - 0.05, hz - 0.05, bottom), box(-hx + 0.05, -hz + 0.05, hx - 0.05, hz - 0.05, y), true, true);
  m.grain(0, 0);
  for (const leg of legs) {
    const f = leg.footprint;
    const { hx: lx, hz: lz } = half(leg);
    const sx = Math.sign(f.x);
    const sz = Math.sign(f.z);
    const ring = (yy: number, taper: number) => {
      const xs = [f.x + sx * lx, f.x - sx * (lx - taper)];
      const zs = [f.z + sz * lz, f.z - sz * (lz - taper)];
      return box(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), yy);
    };
    m.loft(ring(-0.1, 8), ring(bottom + 0.1, 0));
  }
  // The aprons' two faces and their lower edges: their ends are in the legs, their tops under the slab.
  for (const a of aprons) {
    const f = a.footprint;
    const h = half(a);
    const alongX = h.hx > h.hz;
    const len = alongX ? h.hx : h.hz;
    const t = alongX ? h.hz : h.hx;
    const y0 = a.bottom ?? 0;
    const at = (d: number, q: number, yy: number, nq: number, ny: number) => (alongX ? [f.x + d, yy, f.z + q, 0, ny, nq] : [f.x + q, yy, f.z + d, nq, ny, 0]);
    m.grain(alongX ? 1 : 0, alongX ? 0 : 1);
    for (const side of [-1, 1]) m.quad(at(-len, side * t, y0, side, 0), at(len, side * t, y0, side, 0), at(len, side * t, bottom + 0.1, side, 0), at(-len, side * t, bottom + 0.1, side, 0));
    m.quad(at(-len, -t, y0, 0, -1), at(len, -t, y0, 0, -1), at(len, t, y0, 0, -1), at(-len, t, y0, 0, -1));
  }
}

/**
 * The chair, upright and upturned: a round seat, its cane inside the bent
 * rim; five-sided legs; the back's two posts to their caps, the top rail
 * straight across and the mid rail. Upturned, its cane is down on the table
 * and left out.
 */
export function farChair(c: ChairSolids, flip: number): { upright: Mesh; upturned: Mesh } {
  const R = radius(c.seat) - 0.05;
  const under = c.seat.bottom ?? 0;
  const cane = R - 17;
  const seatY = (r: number) => topHeight(c.seat, r, 0);
  const legR = radius(c.leg) - 0.4;
  const postTop = topHeight(c.post, c.post.footprint.x, c.post.footprint.z);
  const lx = Math.abs(c.leg.footprint.x);
  // The near chair's wear: the rim's front, the caps.
  const rimWear = (a: number) => [-Math.sin(a), Math.cos(a), Math.max(0, Math.sin(a)) ** 3 * 0.6] as const;
  const build = (cane0: boolean) => {
    const m = new Mesh();
    if (cane0) m.kind(KIND.cane).plain().revolve([tilt(0, seatY(0), 0), tilt(cane, seatY(cane), 0)], 16);
    // The rim's top and side as one band, rounding from the cane's edge down to the seat's underside.
    m.kind(TBL.bent).revolve([tilt(cane, seatY(cane), 0.2), tilt(R, under + 4, 1.9), tilt(0, under, Math.PI)], 16, 0, 0, rimWear);
    m.plain();
    for (const s of [-1, 1]) {
      m.revolve([tilt(legR - 2.6, 0, Math.PI / 2), tilt(legR, under + 1, Math.PI / 2)], 5, s * lx, c.leg.footprint.z);
      m.revolve([tilt(legR - 2.6, 0, Math.PI / 2), tilt(legR - 0.8, postTop - 3, 1.2)], 5, s * lx, c.post.footprint.z);
      // The cap flat, a little under the world's dome.
      const cap = Array.from({ length: 5 }, (_, k) => [s * lx + (legR - 0.8) * Math.cos((k * 2 * Math.PI) / 5), postTop - 3, c.post.footprint.z + (legR - 0.8) * Math.sin((k * 2 * Math.PI) / 5), 0, 1, 0]);
      m.grain(0, 0, 0.5);
      for (let k = 1; k < 4; k++) m.tri(cap[0], cap[k], cap[k + 1]);
      m.plain();
    }
    // The rails as prisms between the posts' middles, the top one's gable under the world's vault.
    const rail = (s: Solid, reach: number, section: readonly (readonly [number, number])[], wear: number) => {
      const z = s.footprint.z;
      const end = (x: number) => section.map(([v, yy]) => [x, yy, z + v] as const);
      m.grain(1, 0, wear).loft(end(-reach), end(reach));
    };
    const rd = half(c.rail).hz - 0.05;
    const rb = c.rail.bottom ?? 0;
    const rTop = topHeight(c.rail, 0, c.rail.footprint.z);
    rail(c.rail, lx, [[-rd, rb], [rd, rb], [rd, rTop - 11], [0, rTop - 0.2], [-rd, rTop - 11]], 0.2);
    const md = half(c.mid).hz - 0.05;
    const m0 = c.mid.bottom ?? 0;
    const m1 = topHeight(c.mid, 0, c.mid.footprint.z);
    rail(c.mid, lx - 8, [[-md, m0], [md, m0], [md, m1], [-md, m1]], 0);
    return m;
  };
  return { upright: build(true), upturned: build(false).flipped(flip) };
}
