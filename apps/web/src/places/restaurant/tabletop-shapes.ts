// Shapes for what stands on the tables. Almost everything there is round, so
// one surface of revolution does most of the work: a profile turned round a
// circle or an ellipse, with flutes, wrinkles and lumps pressed into it, and
// each vertex coloured as it is made. The tabletop's own kinds read that
// colour as where the vertex is on its thing (tabletop-glsl.ts), so the
// shader can lay print, weave, petals or stains on it without textures.
// Profiles are taken from the world's own tops, so what is drawn is what the
// fly stands on.

import * as THREE from "three";
import { topHeight } from "@fly/world";
import type { Solid } from "@fly/world";
import { tag } from "../bar/materials.ts";

export type Profile = readonly (readonly [number, number])[];

/** Where a revolved thing stands: its middle, how much its profile's radius is stretched each way (an ellipse), and its turn. */
export type Place = { x: number; z: number; sx?: number; sz?: number; angle?: number };

/** A vertex's colour as it is made: where it is, and where it is on the profile (angle round, row). */
export type Paint = THREE.Color | ((out: THREE.Color, x: number, y: number, z: number, theta: number, row: number) => void);

export type RevolveOptions = {
  /** A factor on the profile's radius by angle and row: flutes, knurls, lobes. */
  shape?: (theta: number, row: number) => number;
  /** Added to a row's height by angle: a lumpy surface. */
  lift?: (theta: number, row: number) => number;
  /** Pushed out along the surface's normal (mm): a cloth lying on it. */
  push?: (theta: number, row: number) => number;
  /** Only part of the way round, by row (an open strip whose width can change down it). */
  span?: (row: number) => readonly [number, number];
};

const colour = new THREE.Color();

/**
 * A profile of (radius, height) points turned round `at`, as painted
 * geometry with smooth normals. The surface faces the way a lathe's does
 * going up its outside: a profile that runs up, over a rim and back down the
 * inside faces out, up, then in. A point repeated makes a crease.
 */
export function revolve(profile: Profile, segments: number, at: Place, paint: Paint, options: RevolveOptions = {}) {
  const rows = profile.length;
  const cols = segments + 1;
  const sx = at.sx ?? 1;
  const sz = at.sz ?? 1;
  const angle = at.angle ?? 0;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const p = new Float32Array(rows * cols * 3);
  const thetas = new Float32Array(rows * cols);
  const place = () => {
    for (let i = 0; i < rows; i++) {
      const [r0, y0] = profile[i];
      const [t0, t1] = options.span ? options.span(i) : [0, Math.PI * 2];
      for (let j = 0; j < cols; j++) {
        const th = t0 + ((t1 - t0) * j) / segments;
        const r = r0 * (options.shape ? options.shape(th, i) : 1);
        const u = Math.cos(th) * r * sx;
        const v = Math.sin(th) * r * sz;
        const k = (i * cols + j) * 3;
        p[k] = at.x + u * c + v * s;
        p[k + 1] = y0 + (options.lift ? options.lift(th, i) : 0);
        p[k + 2] = at.z - u * s + v * c;
        thetas[i * cols + j] = th;
      }
    }
  };
  place();
  const closed = !options.span;
  const crease = (i: number) => i > 0 && profile[i][0] === profile[i - 1][0] && profile[i][1] === profile[i - 1][1];
  const n = new Float32Array(rows * cols * 3);
  const normals = () => {
    for (let i = 0; i < rows; i++) {
      // Along the profile, within its run (a crease starts a new one).
      const lo = i > 0 && !crease(i) ? i - 1 : i;
      const hi = i < rows - 1 && !crease(i + 1) ? i + 1 : i;
      for (let j = 0; j < cols; j++) {
        const a = (lo * cols + j) * 3;
        const b = (hi * cols + j) * 3;
        const ax = p[b] - p[a];
        const ay = p[b + 1] - p[a + 1];
        const az = p[b + 2] - p[a + 2];
        // Round it: from the neighbours either side, or the circle's own way where they meet at the axis.
        const jl = closed ? (j - 1 + segments) % segments : Math.max(0, j - 1);
        const jh = closed ? (j + 1) % segments : Math.min(segments, j + 1);
        const l = (i * cols + jl) * 3;
        const h = (i * cols + jh) * 3;
        let bx = p[h] - p[l];
        let by = p[h + 1] - p[l + 1];
        let bz = p[h + 2] - p[l + 2];
        if (bx * bx + by * by + bz * bz < 1e-10) {
          const th = thetas[i * cols + j];
          const tu = -Math.sin(th) * sx;
          const tv = Math.cos(th) * sz;
          bx = tu * c + tv * s;
          by = 0;
          bz = -tu * s + tv * c;
        }
        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        const k = (i * cols + j) * 3;
        n[k] = nx;
        n[k + 1] = ny;
        n[k + 2] = nz;
      }
    }
  };
  normals();
  if (options.push) {
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const k = (i * cols + j) * 3;
        const d = options.push(thetas[i * cols + j], i);
        p[k] += n[k] * d;
        p[k + 1] += n[k + 1] * d;
        p[k + 2] += n[k + 2] * d;
      }
    }
    normals();
  }
  const col = new Float32Array(rows * cols * 3);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const k = (i * cols + j) * 3;
      if (typeof paint === "function") paint(colour, p[k], p[k + 1], p[k + 2], thetas[i * cols + j], i);
      else colour.copy(paint);
      col[k] = colour.r;
      col[k + 1] = colour.g;
      col[k + 2] = colour.b;
    }
  }
  // Two triangles a cell, one where a row is on the axis, none across a crease.
  let count = 0;
  for (let i = 0; i < rows - 1; i++) {
    if (crease(i + 1) || (profile[i][0] === 0 && profile[i + 1][0] === 0)) continue;
    count += segments * ((profile[i][0] === 0 ? 0 : 3) + (profile[i + 1][0] === 0 ? 0 : 3));
  }
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const rgb = new Float32Array(count * 3);
  let o = 0;
  const emit = (v: number) => {
    const k = v * 3;
    pos[o] = p[k];
    pos[o + 1] = p[k + 1];
    pos[o + 2] = p[k + 2];
    nor[o] = n[k];
    nor[o + 1] = n[k + 1];
    nor[o + 2] = n[k + 2];
    rgb[o] = col[k];
    rgb[o + 1] = col[k + 1];
    rgb[o + 2] = col[k + 2];
    o += 3;
  };
  for (let i = 0; i < rows - 1; i++) {
    if (crease(i + 1)) continue;
    const axisA = profile[i][0] === 0;
    const axisB = profile[i + 1][0] === 0;
    if (axisA && axisB) continue;
    for (let j = 0; j < segments; j++) {
      const a = i * cols + j;
      if (!axisA) {
        emit(a);
        emit(a + cols);
        emit(a + 1);
      }
      if (!axisB) {
        emit(a + 1);
        emit(a + cols);
        emit(a + cols + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
  return geometry;
}

/** Revolved and tagged with its kind, ready for `Builder.detailPainted`. */
export const turned = (kind: number, profile: Profile, segments: number, at: Place, paint: Paint, options?: RevolveOptions) => tag(revolve(profile, segments, at, paint, options), kind);

/** A round (or elliptical) solid's footprint: its middle, its radii and turn. */
export function roundOf(solid: Solid) {
  const f = solid.footprint;
  if (f.kind === "circle") return { x: f.x, z: f.z, rx: f.r, rz: f.r, angle: 0 };
  if (f.kind === "ellipse") return { x: f.x, z: f.z, rx: f.rx, rz: f.rz, angle: f.angle };
  throw new Error(`${solid.name} is not round`);
}

/** The height of a round solid's top at s (0 its middle, 1 its edge), never below its underside: its felt profile. */
export function feltAt(solid: Solid, s: number) {
  const f = roundOf(solid);
  const u = Math.min(s, 0.99999) * f.rx;
  return Math.max(solid.bottom ?? 0, topHeight(solid, f.x + u * Math.cos(f.angle), f.z - u * Math.sin(f.angle)));
}

/** Where a dish's outside comes down to its underside (s): inside that, the world has it standing. */
export function dishEdge(solid: Solid) {
  const top = solid.top;
  if (top.kind !== "dish") throw new Error(`${solid.name} is not a dish`);
  const bottom = solid.bottom ?? 0;
  let lo = top.lip;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (feltAt(solid, mid) > bottom + 1e-3) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The felt profile from s0 to s1 in `steps`, as (s, height) points: radii in units of the footprint, to be stretched by `Place`. */
export function feltRun(solid: Solid, s0: number, s1: number, steps: number, ease = (t: number) => t) {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const s = s0 + (s1 - s0) * ease(i / steps);
    out.push([s, feltAt(solid, s)]);
  }
  return out;
}

/**
 * A dish's outside wall, rim and inside, from its underside up and over and
 * down to `inner` (s), exactly as the world has them, `sink` below its
 * underside where it stands on something.
 */
export function dishProfile(solid: Solid, inner: number, sink = 0.1, steps = 12): [number, number][] {
  const top = solid.top;
  if (top.kind !== "dish") throw new Error(`${solid.name} is not a dish`);
  const bottom = solid.bottom ?? 0;
  const edge = dishEdge(solid);
  const out: [number, number][] = [[edge, bottom - sink]];
  // Up the outside, which is steep: closely, and most closely at its foot.
  out.push(...feltRun(solid, edge, top.lip, 8, (t) => t * t).slice(1));
  // Over the rim and down the inside.
  out.push(...feltRun(solid, top.lip, inner, steps, (t) => 0.5 - 0.5 * Math.cos(Math.PI * t)).slice(1));
  return out;
}

/** Points on a dome's felt surface from its edge (s = 1) to its middle, close where it is steep. */
export function domeRun(solid: Solid, steps: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const s = Math.cos((i / steps) * (Math.PI / 2));
    out.push([i === steps ? 0 : s, feltAt(solid, s)]);
  }
  return out;
}

/**
 * Copies of one coded template (its colour's red and green where on it a
 * vertex is), each placed by a matrix with its own blue: many small things
 * that each carry a design, baked into one geometry.
 */
export function stamp(template: THREE.BufferGeometry, items: readonly { matrix: THREE.Matrix4; blue: number }[], kind: number) {
  const tp = template.attributes.position.array;
  const tn = template.attributes.normal.array;
  const tc = template.attributes.color.array;
  const count = tp.length / 3;
  const pos = new Float32Array(count * 3 * items.length);
  const nor = new Float32Array(count * 3 * items.length);
  const rgb = new Float32Array(count * 3 * items.length);
  const normal = new THREE.Matrix3();
  const v = new THREE.Vector3();
  items.forEach(({ matrix, blue }, k) => {
    normal.getNormalMatrix(matrix);
    const o = k * count * 3;
    for (let i = 0; i < count * 3; i += 3) {
      v.set(tp[i], tp[i + 1], tp[i + 2]).applyMatrix4(matrix);
      pos[o + i] = v.x;
      pos[o + i + 1] = v.y;
      pos[o + i + 2] = v.z;
      v.set(tn[i], tn[i + 1], tn[i + 2]).applyMatrix3(normal).normalize();
      nor[o + i] = v.x;
      nor[o + i + 1] = v.y;
      nor[o + i + 2] = v.z;
      rgb[o + i] = tc[i];
      rgb[o + i + 1] = tc[i + 1];
      rgb[o + i + 2] = blue;
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
  return tag(geometry, kind);
}

/** A colour set straight from three numbers, for the kinds that read their vertex colour as coordinates. */
export const raw = (out: THREE.Color, r: number, g: number, b: number) => out.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
