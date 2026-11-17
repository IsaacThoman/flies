// What was left on the dessert plate, as the fly finds it: crumbs of tart
// pastry, broken off a golden crust, chips and grains of it down to dust;
// and the raspberry coulis, a blob where the spoon put it, dragged out by a
// fork's tines into four streaks thinning to nothing. None of it stands
// half a millimetre proud of the glaze: the fly walks over it all.

import * as THREE from "three";
import { random } from "../../scene/build.ts";
import type { Builder } from "./builder.ts";
import { tag } from "./geometry.ts";
import { KIND } from "./kinds.ts";
import { Faces, film } from "./rest-shapes.ts";

type Rnd = ReturnType<typeof random>;
type V = [number, number, number];

/** The tallest anything here stands above the glaze, and how far into it things are sunk. */
const TALL = 0.45;
const SINK = 0.05;

const ORDER = [0, 1, 2];
const FLIPPED = [0, 2, 1];

/** Crumbs' facets as they are made, each its own colour. */
class Chips {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  /** How baked a facet looks: its colour, from where it is and which way it faces. */
  #shade: (x: number, z: number, up: number) => THREE.Color;

  constructor(shade: (x: number, z: number, up: number) => THREE.Color) {
    this.#shade = shade;
  }

  /** A triangle, wound to face away from `inside`; lit flat, or by its corners' own normals (`soft`). */
  facet(a: V, b: V, c: V, inside: V, soft?: readonly [V, V, V]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    const mx = (a[0] + b[0] + c[0]) / 3;
    const my = (a[1] + b[1] + c[1]) / 3;
    const mz = (a[2] + b[2] + c[2]) / 3;
    const out = nx * (mx - inside[0]) + ny * (my - inside[1]) + nz * (mz - inside[2]) >= 0;
    const k = (out ? 1 : -1) / l;
    nx *= k;
    ny *= k;
    nz *= k;
    const color = this.#shade(mx, mz, ny);
    const order = out ? ORDER : FLIPPED;
    const corners = [a, b, c];
    for (const k of order) {
      const p = corners[k];
      this.pos.push(p[0], p[1], p[2]);
      if (soft) this.nor.push(soft[k][0], soft[k][1], soft[k][2]);
      else this.nor.push(nx, ny, nz);
      this.col.push(color.r, color.g, color.b);
    }
  }

  geometry(kind: number) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    return tag(g, kind);
  }
}

/**
 * A chip of pastry `w` across and `tall` high on the level `ground`: a
 * broken outline of `sides`, its sides sheared off at a slant, its top a
 * low hump of facets, crust or crumb.
 */
function chip(f: Chips, rnd: Rnd, x: number, z: number, ground: number, w: number, tall: number, sides: number) {
  const turn = rnd.range(0, Math.PI * 2);
  const stretch = rnd.range(0.6, 1);
  const top = ground + tall;
  const foot: V[] = [];
  const rim: V[] = [];
  for (let i = 0; i < sides; i++) {
    const a = turn + ((i + rnd.range(-0.3, 0.3)) / sides) * Math.PI * 2;
    const r = (w / 2) * rnd.range(0.6, 1);
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r * stretch;
    foot.push([x + cx, ground - SINK, z + cz]);
    // Sheared: the top's edge in from the foot (or, now and then, over it), at its own height.
    const k = rnd.range(0.62, 1.05);
    rim.push([x + cx * k, top - tall * rnd.range(0.15, 0.55), z + cz * k]);
  }
  const peak: V = [x + rnd.range(-0.15, 0.15) * w, top, z + rnd.range(-0.15, 0.15) * w];
  const inside: V = [x, ground + tall * 0.3, z];
  const under: V = [peak[0], ground, peak[2]];
  // The baked top is rounded, lit soft; the sides it broke along are sharp.
  const up: V = [0, 1, 0];
  const soft = rim.map((p): V => {
    const ox = p[0] - x;
    const oz = p[2] - z;
    const l = Math.hypot(ox, oz, w * 0.8);
    return [ox / l, (w * 0.8) / l, oz / l];
  });
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    f.facet(foot[i], foot[j], rim[j], inside);
    f.facet(foot[i], rim[j], rim[i], inside);
    f.facet(peak, rim[i], rim[j], under, [up, soft[i], soft[j]]);
  }
}

const smooth = (x: number) => Math.sin(x) * 0.5 + 0.5;
const crust = new THREE.Color("#a5622a");
const golden = new THREE.Color("#d89a48");
const crumb = new THREE.Color("#f4e2b4");
const thin = new THREE.Color("#d2405c");
const deep = new THREE.Color("#6e0818");
const paint = new THREE.Color();

/**
 * Crumbs of tart round (x, z) on a level glaze at `ground`, as far out as
 * `spread`: a few shards, chips, grains and dust. Their tops are the baked
 * crust, golden to brown from crumb to crumb; where they broke, the pale
 * short pastry shows.
 */
export function tartCrumbs(b: Builder, area: number, x: number, z: number, r: number, ground: number, spread: number, seed: number) {
  const rnd = random(seed);
  const f = new Chips((px, pz, up) => {
    // Which crumb, as a smooth field across the plate; whether this facet is its baked top.
    const bake = smooth(px * 2.1 + Math.sin(pz * 1.7)) * smooth(pz * 1.9 + px * 0.6);
    // A few are bits from inside, broken all round.
    const top = THREE.MathUtils.smoothstep(up, 0.3, 0.6) * (smooth(px * 0.9 - pz * 1.3) > 0.25 ? 1 : 0.2);
    return paint.copy(golden).lerp(crust, bake).lerp(crumb, 1 - top);
  });
  // Shards, chips, grains and dust: how many, how wide, how many sides.
  const sizes: [number, number, number, number][] = [
    [4, 1.8, 3.2, 7],
    [20, 0.7, 1.6, 6],
    [40, 0.22, 0.7, 5],
    [50, 0.06, 0.2, 3],
  ];
  for (const [count, w0, w1, sides] of sizes) {
    for (let i = 0; i < count; i++) {
      // Most round where it fell; some kicked further.
      const d = (rnd.next() < 0.25 ? spread : r) * Math.sqrt(rnd.next());
      const a = rnd.range(0, Math.PI * 2);
      const w = rnd.range(w0, w1);
      chip(f, rnd, x + Math.cos(a) * d, z + Math.sin(a) * d, ground, w, Math.min(TALL, w * rnd.range(0.3, 0.55)), sides);
    }
  }
  b.detailPainted(area, f.geometry(KIND.crumb), KIND.crumb);
}

/** A level sheet over a grid `ni` by `nj`, its corners from `at`, its normals from its neighbours. */
function sheetGrid(f: Faces, ni: number, nj: number, at: (i: number, j: number) => V) {
  const pts: V[][] = [];
  for (let j = 0; j <= nj; j++) {
    const row: V[] = [];
    for (let i = 0; i <= ni; i++) row.push(at(i, j));
    pts.push(row);
  }
  const normal = (i: number, j: number) => {
    const a = pts[j][Math.min(ni, i + 1)];
    const b = pts[j][Math.max(0, i - 1)];
    const c = pts[Math.min(nj, j + 1)][i];
    const d = pts[Math.max(0, j - 1)][i];
    const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const v = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    let nx = u[1] * v[2] - u[2] * v[1];
    let ny = u[2] * v[0] - u[0] * v[2];
    let nz = u[0] * v[1] - u[1] * v[0];
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  const v = pts.map((row, j) => row.map((p, i) => [...p, ...normal(i, j)]));
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) f.quad(v[j][i], v[j][i + 1], v[j + 1][i + 1], v[j + 1][i]);
  return f;
}

/**
 * The coulis on a level glaze at `ground`: a blob at (x, z), and the fork's
 * four tines dragged out of it along `angle` for `length`, each streak
 * narrowing and thinning to its end, the glaze showing between them. Deep
 * red where it lies thick, pink where it is thin over the white.
 */
export function coulis(b: Builder, area: number, x: number, z: number, r: number, ground: number, angle: number, length: number, seed: number) {
  const rnd = random(seed);
  const thick = 0.34;
  // Its colour by how deep it lies, from `base`: each layer's body is under a wet film a little wider and deeper.
  const depth = (base: number) => (p: THREE.Vector3) => paint.copy(thin).lerp(deep, THREE.MathUtils.smoothstep(p.y - base, 0, thick * 0.7));
  const wet = "#a01028";
  const along: V = [Math.cos(angle), 0, -Math.sin(angle)];
  const across: V = [-along[2], 0, along[0]];
  const body = new Faces();
  const wetFilm = new Faces();
  for (let t = 0; t < 4; t++) {
    const offset = (t - 1.5) * 2.6 + rnd.range(-0.3, 0.3);
    const reach = length * rnd.range(0.82, 1.05);
    const wave = rnd.range(-1, 1);
    const steps = 20;
    const ribs = 6;
    for (const [f, wide, tall] of [[body, 0.9, 0.75], [wetFilm, 1, 1]] as const) {
      sheetGrid(f, ribs, steps, (i, j) => {
        const s = j / steps;
        // Thinner and narrower as the tine ran out of coulis; a little wander as the hand went.
        const half = wide * 1.15 * (1 - 0.6 * s) * (1 + 0.08 * Math.sin(s * 23 + t));
        const h = tall * thick * (1 - 0.75 * s) * (0.9 + 0.1 * Math.sin(s * 17 + t * 2));
        const u = (i / ribs) * 2 - 1;
        const side = offset + u * half + Math.sin(s * Math.PI * 0.9) * 2.2 * wave;
        const out = r * 0.45 + s * reach;
        const y = ground - SINK + (h + SINK) * Math.sqrt(Math.max(0, 1 - u * u));
        return [x + along[0] * out + across[0] * side, y, z + along[2] * out + across[2] * side];
      });
    }
  }
  b.detail(area, body.geometry(), depth(ground), KIND.glossy);
  b.detail(area, wetFilm.geometry(), wet, KIND.film);
  // The blob it was dragged from, and a few drops flicked off.
  const blob = (at: V, rr: number, wobble: number, h: number) => {
    const m = new THREE.Matrix4().makeTranslation(at[0], ground, at[2]);
    b.detail(area, film(new Faces(), rr * 0.95, wobble, h * 0.75).geometry(), depth(0), KIND.glossy, m);
    b.detail(area, film(new Faces(), rr, wobble, h).geometry(), wet, KIND.film, m.clone());
  };
  blob([x, 0, z], r * 0.55, 4.1, thick);
  for (let i = 0; i < 4; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const d = rnd.range(r * 1.1, r * 1.6);
    blob([x + Math.cos(a) * d, 0, z + Math.sin(a) * d], rnd.range(1.2, 2.4), i, 0.22);
  }
}
