// What lies on a table at a fly's scale, none of it half a millimetre tall:
// sugar crystals spilt from the torn packet and carried thin across the
// marble, clumped here and there; crumbs; specks of dust and a few fibres of
// lint; and the ring a glass of red left, dried dark at its edge. Thickest
// round where the fly starts and where the sugar was spilt, thinning toward
// the table's edge, so wherever the fly walks the marble near it has
// something on it. Each kind is one template copied many times.

import * as THREE from "three";
import { inside } from "@fly/world";
import type { Footprint, Solid } from "@fly/world";
import { mat4 } from "../../scene/build.ts";
import type { Builder } from "./builder.ts";
import { KIND } from "./kinds.ts";
import { put } from "./tabletop-glass.ts";
import { TOP } from "./tabletop-glsl.ts";
import { copies, tube } from "./tabletop-shapes.ts";

type Rnd = { next(): number; range(lo: number, hi: number): number };
export type Placement = { matrix: THREE.Matrix4; color: THREE.Color };
type Spot = { x: number; z: number };

/** A crystal of sugar: a cube with no underside, since it lies on one. */
const CRYSTAL = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const keep = (g.attributes.position.count / 6) * 5;
  const out = new THREE.BufferGeometry();
  // three.js orders a box's faces +x, -x, +y, -y, +z, -z: drop the fourth.
  for (const name of ["position", "normal"]) {
    const a = g.attributes[name].array as Float32Array;
    const third = keep / 5;
    const kept = new Float32Array(keep * 3);
    kept.set(a.subarray(0, third * 3 * 3), 0);
    kept.set(a.subarray(third * 4 * 3), third * 3 * 3);
    out.setAttribute(name, new THREE.BufferAttribute(kept, 3));
  }
  g.dispose();
  return out;
})();
/** A speck of dust. */
const SPECK = new THREE.TetrahedronGeometry(0.5);
/**
 * A crumb: an uneven lump, a ring of eight points between a low and a high
 * one, shaded as the rounded thing it is (each corner's normal points out
 * from its middle, its pores are in the shader), not as flat facets.
 */
const CRUMB = (() => {
  const radii = [0.5, 0.42, 0.47, 0.34, 0.44, 0.4, 0.49, 0.37];
  const ring = radii.map((r, i) => {
    const a = ((i + 0.3 * Math.sin(i * 2.1)) / radii.length) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * r, (i % 3) * 0.06 - 0.06, Math.sin(a) * r);
  });
  const high = new THREE.Vector3(0.08, 0.5, -0.05);
  const low = new THREE.Vector3(-0.05, -0.5, 0.06);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    points.push(a, high, b, b, low, a);
  }
  const g = new THREE.BufferGeometry().setFromPoints(points);
  // Squashed as it lies, so its normals out from the middle lean up a little more.
  const normals = points.flatMap((p) => new THREE.Vector3(p.x, p.y * 1.6, p.z).normalize().toArray());
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return g;
})();
const crust = new THREE.Color("#8a4a1c");
const crumbIn = new THREE.Color("#e8d6a8");
export const crumbColor = (rnd: Rnd) => () => (rnd.next() < 0.45 ? crust.clone().lerp(new THREE.Color("#5a2c10"), rnd.next() * 0.5) : crumbIn.clone().lerp(new THREE.Color("#c8a870"), rnd.next() * 0.5));

/** Crumbs, flattened lumps. */
export function crumbs(b: Builder, area: number, placed: readonly Placement[]) {
  if (placed.length) b.detailPainted(area, copies(CRUMB, placed, KIND.crumb), KIND.crumb);
}

/** A grain of sugar, as the shaker's kind reads it (tabletop-glsl.ts). */
export const SUGAR = new THREE.Color().setRGB(0.5, 0.5, 1, THREE.LinearSRGBColorSpace);

/** Sugar crystals, lying on a face, some a little tipped. */
export function sugar(b: Builder, area: number, placed: readonly Placement[]) {
  if (placed.length) b.detailPainted(area, copies(CRYSTAL, placed, TOP.shaker), TOP.shaker);
}

/** One crystal at (x, z) on a surface at height y: a third of a millimetre or so, never as tall as half of one. */
export function crystal(out: Placement[], rnd: Rnd, x: number, z: number, y: number, size = 0.14 + 0.28 * rnd.next() ** 1.6) {
  const h = Math.min(0.42, size * rnd.range(0.7, 1));
  out.push({ matrix: mat4({ x, y: y + h * 0.42, z }, new THREE.Euler(rnd.range(-0.12, 0.12), rnd.range(0, Math.PI), rnd.range(-0.12, 0.12)), { x: size, y: h, z: size * rnd.range(0.8, 1.2) }), color: SUGAR });
}

/** Crystals round a point, thickest at its middle; now and then a few stuck together. */
export function sugarRound(out: Placement[], rnd: Rnd, x: number, z: number, r: number, count: number, y: number, free: (x: number, z: number) => boolean = () => true) {
  for (let i = 0; i < count; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const d = r * Math.sqrt(rnd.next()) * (0.4 + 0.6 * rnd.next());
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    if (!free(px, pz)) continue;
    crystal(out, rnd, px, pz, y);
    if (rnd.next() < 0.12) {
      const n = 2 + Math.floor(rnd.next() * 4);
      for (let k = 0; k < n; k++) {
        const b = rnd.range(0, Math.PI * 2);
        const s = rnd.range(0.22, 0.36);
        crystal(out, rnd, px + Math.cos(b) * s, pz + Math.sin(b) * s, y);
      }
    }
  }
}

/** A footprint grown by m all round, to keep litter off what stands on the table. */
function grown(f: Footprint, m: number): Footprint {
  if (f.kind === "circle") return { ...f, r: f.r + m };
  if (f.kind === "ellipse") return { ...f, rx: f.rx + m, rz: f.rz + m };
  return { ...f, hx: f.hx + m, hz: f.hz + m };
}

/** A point within r of a spot, more often near it (`bias` above 1). */
function near(rnd: Rnd, at: Spot, r0: number, r1: number, bias: number): Spot {
  const a = rnd.range(0, Math.PI * 2);
  const d = r0 + (r1 - r0) * rnd.next() ** bias;
  return { x: at.x + Math.cos(a) * d, z: at.z + Math.sin(a) * d };
}

/** A fibre of lint: a thread a few millimetres long lying in loose curves. */
function fibre(rnd: Rnd, x: number, z: number, y: number) {
  const r = rnd.range(0.016, 0.03);
  const len = rnd.range(1, 5);
  const steps = 9;
  let a = rnd.range(0, Math.PI * 2);
  let turn = rnd.range(-0.5, 0.5);
  const points: THREE.Vector3[] = [];
  let px = x;
  let pz = z;
  for (let i = 0; i <= steps; i++) {
    points.push(new THREE.Vector3(px, y + r * 0.7, pz));
    turn += rnd.range(-0.35, 0.35);
    a += turn * (len / steps) * 0.6;
    px += Math.cos(a) * (len / steps);
    pz += Math.sin(a) * (len / steps);
  }
  return tube(points, r, 3);
}

const DUST = ["#8c8882", "#b8b4ac", "#6c6258", "#d4d0c8", "#5a5650", "#9c8a74"].map((c) => new THREE.Color(c));
const LINT = ["#5a6a8a", "#d8d4cc", "#e4e0d8", "#9a4a46", "#b4aca0", "#7a8a9a"];

/**
 * The litter on a table round `centre` (radius r, top at y): `grains`
 * crystals, `dust` specks, `lint` fibres and `crumbs`, a share of each
 * close round `focus` (where the fly starts) and the rest thinning out
 * across the table, kept off the things standing on it.
 */
export function litter(b: Builder, area: number, table: Spot & { r: number; y: number }, focus: Spot, on: readonly Solid[], rnd: Rnd, count: { grains: number; dust: number; lint: number; crumbs: number }, out: Placement[]) {
  const feet = on.filter((s) => (s.bottom ?? 0) <= table.y + 1).map((s) => grown(s.footprint, 1.5));
  const free = (x: number, z: number) => Math.hypot(x - table.x, z - table.z) < table.r - 4 && !feet.some((f) => inside(f, x, z));
  // A quarter close round the focus, the rest spread over the table, thinner away from it.
  const spot = (i: number, total: number): Spot => (i < total / 4 ? near(rnd, focus, 0, 45, 1) : near(rnd, focus, 30, table.r * 1.2, 1.5));
  for (let i = 0; i < count.grains; i++) {
    const p = spot(i, count.grains);
    sugarRound(out, rnd, p.x, p.z, 0.01, 1, table.y, free);
  }
  const specks: Placement[] = [];
  for (let i = 0; i < count.dust; i++) {
    const p = spot(i, count.dust);
    if (!free(p.x, p.z)) continue;
    const s = rnd.range(0.04, 0.16) * (rnd.next() < 0.08 ? 2 : 1);
    specks.push({ matrix: mat4({ x: p.x, y: table.y + s * 0.12, z: p.z }, new THREE.Euler(rnd.range(0, 3), rnd.range(0, 3), rnd.range(0, 3)), { x: s, y: s * 0.5, z: s }), color: DUST[Math.floor(rnd.next() * DUST.length)] });
  }
  if (specks.length) b.detailPainted(area, copies(SPECK, specks, KIND.matte), KIND.matte);
  for (let i = 0; i < count.lint; i++) {
    const p = spot(i * 3, count.lint * 3);
    if (free(p.x, p.z)) b.detail(area, fibre(rnd, p.x, p.z, table.y), LINT[Math.floor(rnd.next() * LINT.length)], KIND.matte);
  }
  const bits: Placement[] = [];
  const color = crumbColor(rnd);
  for (let i = 0; i < count.crumbs; i++) {
    const p = spot(i, count.crumbs);
    if (!free(p.x, p.z)) continue;
    const w = rnd.range(0.3, 1.1);
    const h = Math.min(0.3, w * 0.4);
    bits.push({ matrix: mat4({ x: p.x, y: table.y + h * 0.3, z: p.z }, new THREE.Euler(rnd.range(-0.25, 0.25), rnd.range(0, 6.3), rnd.range(-0.25, 0.25)), { x: w, y: h, z: w * rnd.range(0.7, 1.3) }), color: color() });
  }
  crumbs(b, area, bits);
}

/** Sugar carried in a thin trail from one spot to another, the way a sleeve or a cloth drags it. */
export function sugarTrail(out: Placement[], rnd: Rnd, from: Spot, to: Spot, count: number, y: number) {
  for (let i = 0; i < count; i++) {
    // Most near where it came from, fewer and more scattered the further it was carried.
    const t = rnd.next() ** 1.7;
    const spread = 3 + 8 * t;
    crystal(out, rnd, from.x + (to.x - from.x) * t + rnd.range(-spread, spread), from.z + (to.z - from.z) * t + rnd.range(-spread, spread), y);
  }
}

/**
 * The ring a glass of red left, dried: a thin film a millimetre or two wide,
 * the wine drawn to its outer edge as it dried, so darkest there; broken
 * where the glass's foot was lifted, and run wider where the world has its
 * food (`pools`).
 */
export function wineRing(b: Builder, area: number, centre: Spot, R: number, pools: readonly Spot[], y: number, rnd: Rnd) {
  const at = pools.map((p) => Math.atan2(p.z - centre.z, p.x - centre.x));
  const phase = rnd.range(0, 6.3);
  const near = (th: number, a: number) => {
    const d = Math.abs(((th - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return Math.exp(-((d / 0.11) ** 2));
  };
  // How wide the ring is round the way: about two millimetres, gone in places, swollen at the pools.
  const width = (th: number) => {
    const base = THREE.MathUtils.smoothstep(Math.sin(th * 3 + phase) + 0.6 * Math.sin(th * 7 + phase * 2), -1.2, -0.3);
    return 0.05 + 0.95 * base + at.reduce((w, a) => w + 1.6 * near(th, a), 0);
  };
  // Rows across the ring and how high each stands.
  // From its outer edge in, so it faces up.
  // Flat: a stain, a hair higher at its outer edge where the wine drew as it dried.
  const rows: [number, number][] = [[0.95, -0.02], [0.88, 0.045], [0.75, 0.032], [0.6, 0.03], [0.3, 0.03], [-0.2, 0.03], [-0.7, 0.028], [-0.9, -0.02]];
  const pale = new THREE.Color("#a03048");
  const dark = new THREE.Color("#2a0410");
  const mid = new THREE.Color("#5a0a20");
  put(b, area, TOP.dregs, rows.map(([o, h]) => [R + o * 1.1, y + h]), 120, { x: centre.x, z: centre.z }, (out, _x, _y, _z, th, row) => {
    const t = rows[row][0];
    out.copy(pale).lerp(mid, THREE.MathUtils.smoothstep(t, -0.6, 0.4)).lerp(dark, THREE.MathUtils.smoothstep(t, 0.45, 0.8));
    // At the pools the wine lay deep and dried darker all through.
    out.lerp(dark, at.reduce((m, a) => Math.max(m, near(th, a)), 0) * 0.6);
  }, { shape: (th, row) => (R + rows[row][0] * 1.1 * width(th)) / (R + rows[row][0] * 1.1) });
  // A few drops flicked off it.
  for (let i = 0; i < 5; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const d = R + rnd.range(3, 14);
    const r = rnd.range(0.3, 0.9);
    put(b, area, TOP.dregs, [[r, y - 0.02], [r * 0.8, y + 0.04], [r * 0.4, y + 0.04], [0, y + 0.04]], 10, { x: centre.x + Math.cos(a) * d, z: centre.z + Math.sin(a) * d }, dark);
  }
}
