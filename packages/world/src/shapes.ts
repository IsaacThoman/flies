// The shapes the world is made of, and the exact geometry of each: whether a
// point is over it, how high its top is there, which way its top and its
// sides face, and where a ray meets it.
//
// The world is a height field. Every solid is a column standing on the table:
// a footprint (seen from above) extruded up to its top, which is flat or
// domed. Units are millimetres, y is up.

export type Footprint =
  | { kind: "circle"; x: number; z: number; r: number }
  /** An ellipse turned by `angle` (radians, counter-clockwise seen from above, +x toward -z). */
  | { kind: "ellipse"; x: number; z: number; rx: number; rz: number; angle: number }
  /** A rectangle with half-sizes hx, hz, turned by `angle` like an ellipse. */
  | { kind: "box"; x: number; z: number; hx: number; hz: number; angle: number };

export type Top =
  | { kind: "flat"; y: number }
  /**
   * A dome over the footprint: y = base + height × (1 − s²)^power, where s is
   * 0 at the footprint's centre and 1 at its edge. Power ½ is an ellipsoid
   * (sides go vertical at the edge: a sphere resting on the table has base and
   * height both its radius), power 1 a paraboloid that meets its base at a
   * slope a fly can walk up.
   */
  | { kind: "dome"; base: number; height: number; power: number }
  /**
   * A dish, round its footprint's middle: a flat well (`well` high) out to
   * `inner` of the way to the edge, rising to a rounded rim (`rim` high) at
   * `lip`, then down a gentle outside to the table at the edge. Each slope is
   * a smoothstep, so the rim's crest and both feet are level.
   */
  | { kind: "dish"; well: number; rim: number; inner: number; lip: number };

/** The highest point of a top. */
export function topPeak(top: Top): number {
  return top.kind === "flat" ? top.y : top.kind === "dome" ? top.base + top.height : top.rim;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const smoothSlope = (t: number) => 6 * t * (1 - t);

/** A dish's height at normalised distance s from its middle, and its slope dy/ds. */
function dishProfile(top: Extract<Top, { kind: "dish" }>, s: number, out: { y: number; dy: number }) {
  if (s <= top.inner) {
    out.y = top.well;
    out.dy = 0;
  } else if (s <= top.lip) {
    const w = top.lip - top.inner;
    const t = (s - top.inner) / w;
    out.y = top.well + (top.rim - top.well) * smooth(t);
    out.dy = ((top.rim - top.well) * smoothSlope(t)) / w;
  } else {
    const w = 1 - top.lip;
    const t = Math.min(1, (s - top.lip) / w);
    out.y = top.rim * (1 - smooth(t));
    out.dy = (-top.rim * smoothSlope(t)) / w;
  }
  return out;
}
const scratchProfile = { y: 0, dy: 0 };

export type Solid = {
  name: string;
  footprint: Footprint;
  top: Top;
};

export type Vec3 = { x: number; y: number; z: number };

/** The footprint's own coordinates of a world point: u along its x axis, v along its z axis. */
function local(f: Footprint, x: number, z: number, out: { u: number; v: number }) {
  const dx = x - f.x;
  const dz = z - f.z;
  if (f.kind === "circle" || f.angle === 0) {
    out.u = dx;
    out.v = dz;
  } else {
    const c = Math.cos(f.angle);
    const s = Math.sin(f.angle);
    // Turned counter-clockwise seen from above (y up): +x toward -z.
    out.u = dx * c - dz * s;
    out.v = dx * s + dz * c;
  }
  return out;
}

/** Back from the footprint's coordinates to world x and z. */
function world(f: Footprint, u: number, v: number, out: { x: number; z: number }) {
  if (f.kind === "circle" || f.angle === 0) {
    out.x = u;
    out.z = v;
  } else {
    const c = Math.cos(f.angle);
    const s = Math.sin(f.angle);
    out.x = u * c + v * s;
    out.z = -u * s + v * c;
  }
  return out;
}

const scratch = { u: 0, v: 0 };
const scratchXZ = { x: 0, z: 0 };

/**
 * The squared normalised distance s² of a point from the footprint's centre:
 * below 1 inside. For a box, the larger of the two axes' (so 1 on its edge).
 */
export function footprintS2(f: Footprint, x: number, z: number): number {
  if (f.kind === "circle") {
    const dx = x - f.x;
    const dz = z - f.z;
    return (dx * dx + dz * dz) / (f.r * f.r);
  }
  const { u, v } = local(f, x, z, scratch);
  if (f.kind === "ellipse") return (u / f.rx) ** 2 + (v / f.rz) ** 2;
  return Math.max((u / f.hx) ** 2, (v / f.hz) ** 2);
}

export const inside = (f: Footprint, x: number, z: number) => footprintS2(f, x, z) < 1;

/** The top's height at a point inside the footprint. */
export function topHeight(solid: Solid, x: number, z: number): number {
  const { top } = solid;
  if (top.kind === "flat") return top.y;
  const s2 = Math.min(1, footprintS2(solid.footprint, x, z));
  if (top.kind === "dish") return dishProfile(top, Math.sqrt(s2), scratchProfile).y;
  return top.base + top.height * Math.pow(1 - s2, top.power);
}

/**
 * The top's upward unit normal at a point inside the footprint. Writes `out`.
 * Near the edge of an ellipsoidal dome the slope grows without bound; the
 * normal there is close to horizontal.
 */
export function topNormal(solid: Solid, x: number, z: number, out: Vec3): Vec3 {
  const { top, footprint: f } = solid;
  if (top.kind === "flat" || f.kind === "box") {
    out.x = 0;
    out.y = 1;
    out.z = 0;
    return out;
  }
  const s2 = Math.min(0.999999, footprintS2(f, x, z));
  // dy/d(s²)
  let k: number;
  if (top.kind === "dish") {
    const s = Math.sqrt(s2);
    k = s > 1e-9 ? dishProfile(top, s, scratchProfile).dy / (2 * s) : 0;
  } else k = -top.height * top.power * Math.pow(1 - s2, top.power - 1);
  let gx: number;
  let gz: number;
  if (f.kind === "circle") {
    gx = (k * 2 * (x - f.x)) / (f.r * f.r);
    gz = (k * 2 * (z - f.z)) / (f.r * f.r);
  } else {
    const { u, v } = local(f, x, z, scratch);
    const gu = (k * 2 * u) / (f.rx * f.rx);
    const gv = (k * 2 * v) / (f.rz * f.rz);
    const back = world(f, gu, gv, scratchXZ);
    gx = back.x;
    gz = back.z;
  }
  const length = Math.hypot(gx, 1, gz);
  out.x = -gx / length;
  out.y = 1 / length;
  out.z = -gz / length;
  return out;
}

/**
 * The horizontal outward normal of the footprint's edge nearest a point: the
 * way out of the column's side. Writes x and z of `out` (y is 0).
 */
export function sideNormal(f: Footprint, x: number, z: number, out: Vec3): Vec3 {
  out.y = 0;
  if (f.kind === "circle") {
    const dx = x - f.x;
    const dz = z - f.z;
    const d = Math.hypot(dx, dz) || 1;
    out.x = dx / d;
    out.z = dz / d;
    return out;
  }
  const { u, v } = local(f, x, z, scratch);
  let nu: number;
  let nv: number;
  if (f.kind === "ellipse") {
    nu = u / (f.rx * f.rx);
    nv = v / (f.rz * f.rz);
  } else if (Math.abs(u) / f.hx > Math.abs(v) / f.hz) {
    nu = Math.sign(u) || 1;
    nv = 0;
  } else {
    nu = 0;
    nv = Math.sign(v) || 1;
  }
  const back = world(f, nu, nv, scratchXZ);
  const d = Math.hypot(back.x, back.z) || 1;
  out.x = back.x / d;
  out.z = back.z / d;
  return out;
}

/**
 * Where a ray enters and leaves the footprint's infinite vertical prism, as
 * distances along it: [t0, t1], or null when it misses. Only x and z of the
 * ray matter.
 */
export function prismSpan(f: Footprint, ox: number, oz: number, dx: number, dz: number): [number, number] | null {
  let u0: number;
  let v0: number;
  let du: number;
  let dv: number;
  if (f.kind === "circle") {
    u0 = (ox - f.x) / f.r;
    v0 = (oz - f.z) / f.r;
    du = dx / f.r;
    dv = dz / f.r;
  } else {
    const o = local(f, ox, oz, scratch);
    u0 = o.u;
    v0 = o.v;
    const c = f.angle === 0 ? 1 : Math.cos(f.angle);
    const s = f.angle === 0 ? 0 : Math.sin(f.angle);
    du = dx * c - dz * s;
    dv = dx * s + dz * c;
    const ru = f.kind === "ellipse" ? f.rx : f.hx;
    const rv = f.kind === "ellipse" ? f.rz : f.hz;
    u0 /= ru;
    v0 /= rv;
    du /= ru;
    dv /= rv;
  }
  if (f.kind === "box") {
    // Slabs |u| < 1 and |v| < 1.
    let t0 = -Infinity;
    let t1 = Infinity;
    for (const [p, d] of [[u0, du], [v0, dv]] as const) {
      if (Math.abs(d) < 1e-12) {
        if (Math.abs(p) >= 1) return null;
        continue;
      }
      const a = (-1 - p) / d;
      const b = (1 - p) / d;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    return t0 < t1 ? [t0, t1] : null;
  }
  // Unit circle: |p + t d|² = 1.
  const a = du * du + dv * dv;
  if (a < 1e-12) return u0 * u0 + v0 * v0 < 1 ? [-Infinity, Infinity] : null;
  const b = 2 * (u0 * du + v0 * dv);
  const c = u0 * u0 + v0 * v0 - 1;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return null;
  const root = Math.sqrt(disc);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

/** The footprint's bounding radius around its centre. */
export function footprintRadius(f: Footprint): number {
  if (f.kind === "circle") return f.r;
  if (f.kind === "ellipse") return Math.max(f.rx, f.rz);
  return Math.hypot(f.hx, f.hz);
}
