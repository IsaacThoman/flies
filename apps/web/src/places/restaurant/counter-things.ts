// What was left on the zinc at closing: the fruit bowl with its oranges,
// lemons and a bruised peach; the cutting board with half a lemon, slices
// and the knife; the bar mat with a shaker tin upturned to dry, syrup spilt
// beside it; two glasses with red and white left in them; and the cake
// under its cloche, crumbs on the stand's edge. Each at the world's exact
// shape, and the food where the world's patches say it lies.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ON_BAR, RESTAURANT_PATCHES, WINE_GLASS, ZINC_BAR, topHeight } from "@fly/world";
import type { Solid } from "@fly/world";
import { mat4, random } from "../../scene/build.ts";
import { areaOf } from "./areas.ts";
import type { Builder } from "./builder.ts";
import { Mesh, film, turn } from "./counter-shapes.ts";
import { CTR, domeAt } from "./counter-seats.ts";
import { scatter } from "./geometry.ts";
import { KIND } from "./kinds.ts";

const ON = ZINC_BAR.zinc.top;
type Profile = [number, number][];
const along = (n: number, f: (t: number) => Profile[number]) => Array.from({ length: n + 1 }, (_, i) => f(i / n));

/** The patch of food the world has nearest (x, z) by this name. */
function patch(name: string, x: number, z: number) {
  let best = RESTAURANT_PATCHES[0];
  let d = Infinity;
  for (const p of RESTAURANT_PATCHES) {
    const e = Math.hypot(p.x - x, p.z - z);
    if (p.name === name && e < d) {
      d = e;
      best = p;
    }
  }
  return best;
}

/** The fruit bowl: the world's dish turned exactly, white glaze with two blue lines round its outside. */
function bowl(b: Builder, s: Solid) {
  const { x, z } = s.footprint;
  const top = s.top as { well: number; rim: number; lip: number };
  const f = s.footprint as { r: number };
  const area = areaOf(s);
  const at = (r: number) => topHeight(s, x + r, z);
  // The dish's outside falls from its rim to the zinc well inside its footprint: where it is this high.
  const outside = (y: number) => {
    let lo = top.lip * f.r;
    let hi = f.r;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (at(mid) > y) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  // The lines' edges, by height up the outside, where the glaze turns blue and back.
  const edges = [ON + 18, ON + 24, ON + 29, ON + 31.5];
  const heights = [ON + 0.5, ON + 8, ...edges.slice(0, 2), ON + 26.5, ...edges.slice(2), ON + 40, ON + 52, ON + 62, ON + 70, ON + 75, top.rim - 2];
  const profile: Profile = [
    [outside(ON), ON - 0.1],
    ...heights.map((y): Profile[number] => [outside(y), y]),
    // Chords across the concave inside must lie beneath the smooth felt dish.
    ...[top.lip * f.r, 132, 128, 122, 114, 104, 94, 86, 83, 50, 0].map((r): Profile[number] => [r, Math.max(top.well, at(r) - 0.7)]),
  ];
  let start = 0;
  let blue = false;
  for (let i = 1; i < profile.length; i++) {
    if (!edges.includes(profile[i][1]) && i < profile.length - 1) continue;
    b.detail(area, turn(profile.slice(start, i + 1), 48, x, z), blue ? "#2a4a8a" : "#ece7db", KIND.ceramic);
    start = i;
    blue = !blue;
  }
  b.standIn(area, turn([[outside(ON), ON], [top.lip * f.r, top.rim], [83, at(83)], [0, at(0)]], 10, x, z), "#ece7db", KIND.ceramic);
}

/** An orange, sunk in the bowl as the world has it, the dry stub of its stem on a tilted pole. */
function orange(b: Builder, s: Solid, seed: number) {
  const f = s.footprint as { x: number; z: number; r: number };
  const top = s.top as { base: number; height: number };
  const area = areaOf(s);
  const rand = random(seed);
  const pole = new THREE.Vector3(rand.range(-0.5, 0.5), 1, rand.range(-0.5, 0.5)).normalize();
  const turnTo = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pole);
  b.detail(area, new THREE.SphereGeometry(top.height, 28, 18).translate(f.x, top.base, f.z), "#f58418", CTR.citrus);
  // Standing under half a millimetre proud of the peel.
  const stub = turn([[3.4, -0.6], [2.8, 0.15], [1.4, 0.38], [0, 0.42]], 10, 0, 0).translate(0, top.height, 0).applyQuaternion(turnTo).translate(f.x, top.base, f.z);
  b.detail(area, stub, "#5a5a26", KIND.fruit);
  b.standIn(area, new THREE.OctahedronGeometry(top.height * 0.95, 0).translate(f.x, top.base, f.z), "#f07a12", KIND.fruit);
}

/**
 * A lemon: the world's ellipsoid, thinned toward each end where a nub
 * stands out, all of it inside the ellipsoid.
 */
function lemon(b: Builder, s: Solid) {
  const f = s.footprint as { x: number; z: number; rx: number; rz: number; angle: number };
  const top = s.top as { base: number; height: number };
  const area = areaOf(s);
  const g = new THREE.SphereGeometry(1, 32, 16).rotateZ(Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const a = Math.abs(u);
    const felt = Math.sqrt(Math.max(0, 1 - u * u));
    const t = THREE.MathUtils.smoothstep(a, 0.6, 1);
    const nub = 0.09 * THREE.MathUtils.smoothstep(a, 0.86, 0.97) * (1 - THREE.MathUtils.smoothstep(a, 0.985, 1));
    const rho = Math.min(felt, felt * (1 - 0.35 * t) + nub);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const l = Math.hypot(y, z) || 1;
    pos.setXYZ(i, u * f.rx, (y / l) * rho * top.height, (z / l) * rho * f.rz);
  }
  g.computeVertexNormals();
  g.rotateY(f.angle).translate(f.x, top.base, f.z);
  b.detail(area, g, "#f2cc2a", CTR.citrus);
  b.standIn(area, new THREE.OctahedronGeometry(1, 0).scale(f.rx * 0.9, top.height * 0.9, f.rz * 0.9).rotateY(f.angle).translate(f.x, top.base, f.z), "#f2cc2a", KIND.fruit);
}

function peach(b: Builder, s: Solid) {
  const f = s.footprint as { x: number; z: number; r: number };
  const top = s.top as { base: number; height: number };
  const area = areaOf(s);
  b.detail(area, new THREE.SphereGeometry(top.height, 30, 20).rotateX(0.5).rotateY(-0.7).translate(f.x, top.base, f.z), "#e8a050", CTR.peach);
  b.standIn(area, new THREE.OctahedronGeometry(top.height * 0.95, 0).translate(f.x, top.base, f.z), "#e09050", CTR.peach);
}

/** A flat box on the zinc, turned by its angle, its edges rounded: board, mat. */
function slab(s: Solid, radius: number) {
  const f = s.footprint as { x: number; z: number; hx: number; hz: number; angle: number };
  const y0 = (s.bottom ?? 0) - 0.1;
  const y1 = (s.top as { y: number }).y;
  return new RoundedBoxGeometry(f.hx * 2, y1 - y0, f.hz * 2, 2, radius).rotateY(f.angle).translate(f.x, (y0 + y1) / 2, f.z);
}

function slabStandIn(s: Solid) {
  const f = s.footprint as { x: number; z: number; hx: number; hz: number; angle: number };
  const y0 = s.bottom ?? 0;
  const y1 = (s.top as { y: number }).y;
  return new THREE.BoxGeometry(f.hx * 2, y1 - y0, f.hz * 2).rotateY(f.angle).translate(f.x, (y0 + y1) / 2, f.z);
}

function board(b: Builder, s: Solid) {
  const area = areaOf(s);
  b.detail(area, slab(s, 1.5), "#ffffff", CTR.board);
  b.standIn(area, slabStandIn(s), "#ffffff", KIND.oak);
}

/** Half a lemon face down on the board: the world's half ellipsoid, the pith's white edge where it meets the board. */
function halfLemon(b: Builder, s: Solid) {
  const f = s.footprint as { x: number; z: number; r: number };
  const top = s.top as { base: number; height: number };
  const area = areaOf(s);
  const peel = along(9, (t): Profile[number] => {
    const a = (t * Math.PI) / 2;
    return [f.r * Math.cos(a), top.base - 0.05 + top.height * Math.sin(a)];
  });
  // The world's half ellipsoid stands upright at its edge: the pith's band just inside it.
  const edge = f.r - 0.06;
  peel[0] = [edge, top.base + 1.2];
  b.detail(area, turn([[edge, top.base - 0.05], [edge, top.base + 1.2]], 36, f.x, f.z), "#f2ecc8", KIND.fruit);
  b.detail(area, turn(peel, 36, f.x, f.z), "#f0c824", CTR.citrus);
}

/** A slice of lemon on the board, its cut face up: the flesh and the pith drawn in the shader. */
function slice(b: Builder, s: Solid) {
  const f = s.footprint as { x: number; z: number; r: number };
  const y0 = (s.bottom ?? 0) - 0.05;
  const y1 = (s.top as { y: number }).y;
  const profile: Profile = [
    [f.r, y0],
    [f.r, y1 - 0.6],
    [f.r - 0.25, y1 - 0.15],
    [f.r - 0.7, y1],
    [f.r * 0.6, y1],
    [0, y1],
  ];
  b.detail(areaOf(s), turn(profile, 36, f.x, f.z), "#f4c81e", CTR.citrus);
}

/** The knife: a blade drawn to a point, a riveted black handle out past the board's edge. */
function knife(b: Builder, blade: Solid | undefined, handle: Solid | undefined) {
  if (blade) {
    const f = blade.footprint as { x: number; z: number; hx: number; hz: number; angle: number };
    const y0 = (blade.bottom ?? 0) - 0.05;
    const y1 = (blade.top as { y: number }).y;
    const shape = new THREE.Shape();
    const { hx, hz } = f;
    shape.moveTo(-hx, -hz);
    shape.lineTo(hx * 0.35, -hz);
    shape.quadraticCurveTo(hx * 0.85, -hz, hx, -hz * 0.15);
    shape.quadraticCurveTo(hx * 0.8, hz * 0.85, hx * 0.5, hz * 0.9);
    shape.lineTo(-hx, hz * 0.9);
    shape.lineTo(-hx, -hz);
    const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2).rotateY(f.angle).translate(f.x, y0, f.z);
    b.detail(areaOf(blade), g, "#ffffff", KIND.steel);
  }
  if (handle) {
    const f = handle.footprint as { x: number; z: number; hx: number; hz: number; angle: number };
    const area = areaOf(handle);
    b.detail(area, slab(handle, 3), "#16110e", KIND.glossy);
    const y1 = (handle.top as { y: number }).y;
    const c = Math.cos(f.angle);
    const s = Math.sin(f.angle);
    for (const u of [-14, 0, 14]) b.detail(area, turn([[1.7, y1 - 0.3], [1.7, y1 + 0.12], [0, y1 + 0.18]], 12, f.x + c * u, f.z - s * u), "#ffffff", KIND.steel);
  }
}

function mat(b: Builder, s: Solid) {
  const area = areaOf(s);
  b.detail(area, slab(s, 2), "#1c1c1c", KIND.rubber);
  b.standIn(area, slabStandIn(s), "#1c1c1c", KIND.rubber);
  // Syrup spilt on it where the world's is, a drip or two beside it.
  const top = (s.top as { y: number }).y;
  const syrup = patch("syrup", s.footprint.x, s.footprint.z);
  for (const [dx, dz, r, w] of [[0, 0, syrup.r + 2, 1.3], [17, -9, 3.2, 4.1], [-15, 11, 2.2, 2.2]] as const) {
    b.detail(area, film(r, w, 0.3).translate(syrup.x + dx, top, syrup.z + dz), "#b8640e", KIND.film);
  }
}

/** The shaker tin, upturned on the mat to dry: its rolled mouth down, its base the world's dome; drops of water round it. */
function shakerTin(b: Builder, s: Solid, mat: Solid | undefined) {
  const f = s.footprint as { x: number; z: number; r: number };
  const top = s.top as { base: number; height: number };
  const y0 = (s.bottom ?? 0) - 0.05;
  const area = areaOf(s);
  const r = f.r;
  const at = (q: number) => domeAt(q, r, top.base, top.height, 1);
  const profile: Profile = [
    [r - 1.2, y0],
    [r - 0.3, y0 + 0.6],
    [r, y0 + 2],
    [r, y0 + 5],
    [r - 0.4, y0 + 6.2],
    [r - 0.4, top.base - 1.4],
    [r - 0.7, top.base - 0.2],
    ...[r - 1.4, r - 3, r - 6, r - 12, r - 20, r - 30, 0].map((q): Profile[number] => [q, at(q)]),
  ];
  b.detail(area, turn(profile, 56, f.x, f.z), "#ffffff", KIND.steel);
  b.standIn(area, turn([[r, y0], [r, top.base], [0, top.base + top.height]], 6, f.x, f.z), "#ffffff", KIND.steel);
  const rand = random(17);
  const drop = turn([[1, 0], [0.75, 0.22], [0, 0.32]], 10);
  // Only on the mat: off it they would hang in the air over the zinc.
  const m = mat?.footprint as { x: number; z: number; hx: number; hz: number } | undefined;
  const onMat = (x: number, z: number) => !m || (Math.abs(x - m.x) < m.hx - 4 && Math.abs(z - m.z) < m.hz - 4);
  const drops: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
  while (drops.length < 18) {
    const a = rand.range(0, Math.PI * 2);
    const d = r + rand.range(1, 32);
    const k = rand.range(0.6, 2.4);
    const x = f.x + Math.cos(a) * d;
    const z = f.z + Math.sin(a) * d;
    if (onMat(x, z)) drops.push({ matrix: mat4({ x, y: y0 + 0.02, z }, new THREE.Euler(), { x: k * rand.range(0.8, 1.3), y: 1, z: k }), color: new THREE.Color("#dfe6ea") });
  }
  b.detailPainted(area, scatter(drop, drops, KIND.water), KIND.water);
  drop.dispose();
}

/** The two glasses left on the zinc: foot, stem and bowl turned in one, the wine pooled in the bottom. */
function glass(b: Builder, s: Solid) {
  const { x, z } = s.footprint;
  const area = areaOf(s);
  const on = (s.bottom ?? 0) - WINE_GLASS.stem.top;
  const inner = (r: number) => topHeight(s, x + r, z);
  const { foot, bowl } = WINE_GLASS;
  const well = on + bowl.well;
  // The glass's own bottom under the wine, below the world's well (inside it): the wine fills it to the well.
  const under: Profile = [[15.3, well], [13, well - 2.4], [9, well - 5.8], [4, well - 8], [0, well - 8.6]];
  const profile: Profile = [
    [foot.r, on - 0.05],
    [foot.r, on + 1.2],
    [foot.r - 0.6, on + 1.9],
    [30, on + 2.3],
    [18, on + 2.75],
    [8, on + 2.95],
    [4, on + 3],
    [3.7, on + 8],
    [3.7, on + 85],
    [4, on + 95],
    [11, on + 97.2],
    [18, on + 101.8],
    [23, on + 111],
    [26.8, on + 130],
    [29.4, on + 153],
    [32.4, on + 172],
    [36.2, on + 189],
    [39.6, on + 201],
    [40.3, on + 203.4],
    [40.35, on + 204],
    [40.25, on + 204.8],
    [40, inner(40)],
    ...[39.5, 38.5, 37, 35.5, 34, 32, 30, 28, 26, 24, 21, 18, 16.5].map((r): Profile[number] => [r, inner(r)]),
    ...under,
  ];
  b.detail(area, turn(profile, 32, x, z), "#f4f8ff", KIND.glass);
  const red = Math.hypot(patch("red wine", x, z).x - x, patch("red wine", x, z).z - z) < 1;
  const kind = red ? KIND.wine : KIND.whiteWine;
  const color = red ? "#5a0a18" : "#e6cc6a";
  // The wine: its underside just inside the glass's bottom, its surface the world's well.
  const wine: Profile = [[0, well - 8.45], [3.9, well - 7.85], [8.9, well - 5.65], [12.9, well - 2.25], [15.3, well + 0.1], [0, well + 0.1]];
  b.detail(area, turn(wine, 32, x, z), color, kind);
  b.standIn(area, turn([[4, on + 95], [30, on + 160], [40.3, on + 204], [0, well]], 6, x, z), "#f4f8ff", KIND.glass);
  b.standIn(area, turn([[15, well + 0.1], [0, well + 0.1]], 6, x, z), color, kind);
}

const C = ON_BAR.cake;
/** The cake stand: foot, stem and plate turned in one, ceramic. */
const STAND: Profile = [
  [C.foot.r, ON - 0.1],
  [C.foot.r, ON + 0.5],
  [C.foot.r - 0.7, ON + 1.1],
  ...[C.foot.r - 2.5, 70, 50, 30, C.stem.r].map((r): Profile[number] => [r, domeAt(r, C.foot.r, ON + 1, C.foot.height - 1, 1)]),
  ...[20, 26, 78, 84].flatMap((y): Profile => [[C.stem.r, ON + y], [C.stem.r - 0.5, ON + y + 1], [C.stem.r - 0.5, ON + y + 3], [C.stem.r, ON + y + 4]]),
  [C.stem.r, ON + C.stem.top],
  [C.plate.r - 1.5, ON + C.stem.top],
  [C.plate.r - 0.4, ON + C.stem.top + 0.6],
  [C.plate.r, ON + C.stem.top + 1.8],
  [C.plate.r, ON + C.plate.top - 1.5],
  [C.plate.r - 0.44, ON + C.plate.top - 0.44],
  [C.plate.r - 1.5, ON + C.plate.top],
  [0, ON + C.plate.top],
];

/** The cake inside: a chocolate layer cake with a wedge cut from it, out of reach under the glass. */
function cake(b: Builder, area: number) {
  const y0 = ON + C.plate.top - 0.05;
  const r = 100;
  const h = 72;
  const gap = [0.5, 1.35];
  const outside: Profile = [[r, y0], [r, y0 + h - 4], [r - 1.5, y0 + h - 0.8], [r - 4, y0 + h], [0, y0 + h]];
  b.detail(area, turn(outside, 40, C.x, C.z, gap[1], gap[0] + Math.PI * 2), "#3a1e12", CTR.cake);
  for (const [a, dir] of [[gap[0], -1], [gap[1], 1]] as const) {
    const m = new Mesh();
    m.polygon(outside.map(([px, py]): [number, number, number] => [px, py, 0]).concat([[0, y0, 0]]), [0, 0, dir], [0, 1]);
    // In the turned shape a radius at angle a runs along (sin a, cos a).
    b.detail(area, m.geometry().rotateY(a - Math.PI / 2).translate(C.x, 0, C.z), "#3a1e12", CTR.cake);
  }
}

/** Crumbs on the stand's plate, by its edge, where the world's are: specks under half a millimetre. */
function crumbs(b: Builder, area: number) {
  const p = patch("cake crumbs", C.x + C.plate.r, C.z);
  const rand = random(41);
  const speck = new THREE.IcosahedronGeometry(1, 0);
  const brown = [new THREE.Color("#4a2614"), new THREE.Color("#6a3a1e"), new THREE.Color("#2e160c")];
  const list = Array.from({ length: 22 }, (_, i) => {
    const a = rand.range(0, Math.PI * 2);
    const d = Math.sqrt(rand.next()) * (i < 14 ? p.r : p.r * 2.4);
    let x = p.x + Math.cos(a) * d;
    let z = p.z + Math.sin(a) * d;
    // Kept on the plate, between the cloche's rim and the plate's edge.
    const dx = x - C.x;
    const dz = z - C.z;
    const e = Math.hypot(dx, dz);
    const keep = THREE.MathUtils.clamp(e, C.cloche.r + 1.5, C.plate.r - 2);
    x = C.x + (dx / e) * keep;
    z = C.z + (dz / e) * keep;
    const k = rand.range(0.35, 1.4);
    return { matrix: mat4({ x, y: ON + C.plate.top + 0.12 * k, z }, new THREE.Euler(0, rand.range(0, 6.3), 0), { x: k, y: 0.3, z: k * rand.range(0.6, 1) }), color: brown[i % 3] };
  });
  b.detailPainted(area, scatter(speck, list, KIND.crumb), KIND.crumb);
  speck.dispose();
}

function cakeStand(b: Builder, s: Solid) {
  const area = areaOf(s);
  b.detail(area, turn(STAND, 40, C.x, C.z), "#f4f2ec", KIND.ceramic);
  b.standIn(area, turn([[C.stem.r, ON], [C.stem.r, ON + C.stem.top], [C.plate.r, ON + C.stem.top], [C.plate.r, ON + C.plate.top], [0, ON + C.plate.top]], 8, C.x, C.z), "#f4f2ec", KIND.ceramic);
  cake(b, area);
  crumbs(b, area);
}

/** The cloche: the world's half ellipsoid in glass a few millimetres thick, and its knob. */
function cloche(b: Builder, s: Solid) {
  const area = areaOf(s);
  const base = ON + C.plate.top;
  const { r, height } = C.cloche;
  const at = (k: number, t: number): Profile[number] => [(r - k) * Math.cos(t), base + 0.05 + (height - k) * Math.sin(t)];
  const outer = along(14, (t) => at(0, (t * Math.PI) / 2));
  const inner = along(10, (t) => at(2.6, ((1 - t) * Math.PI) / 2));
  b.detail(area, turn([...outer, ...inner.slice(0, -1), [r - 2.6, base + 0.05]], 40, C.x, C.z), "#f4f8ff", KIND.glass);
  b.standIn(area, turn([[r, base], [r * 0.92, base + height * 0.39], [r * 0.7, base + height * 0.71], [r * 0.38, base + height * 0.92], [0, base + height]], 8, C.x, C.z), "#f4f8ff", KIND.glass);
}

function clocheKnob(b: Builder, s: Solid) {
  const f = s.footprint as { x: number; z: number; r: number };
  const top = s.top as { base: number; height: number };
  const profile: Profile = [[f.r, (s.bottom ?? 0) + 2], [f.r, top.base], ...along(10, (t): Profile[number] => {
    const a = ((t * 0.98 + 0.02) * Math.PI) / 2;
    return [f.r * Math.cos(a), top.base + top.height * Math.sin(a)];
  }), [0, top.base + top.height]];
  b.detail(areaOf(s), turn(profile, 32, f.x, f.z), "#f4f8ff", KIND.glass);
}

/** Draws what is on the zinc: whichever of its solids it is given. */
export function buildThings(b: Builder, solids: readonly Solid[]) {
  let seed = 3;
  const named = (n: string) => solids.find((s) => s.name === n);
  for (const s of solids) {
    switch (s.name) {
      case "fruit bowl":
        bowl(b, s);
        break;
      case "orange":
        orange(b, s, seed++);
        break;
      case "lemon":
        if (s.footprint.kind === "ellipse") lemon(b, s);
        else halfLemon(b, s);
        break;
      case "peach":
        peach(b, s);
        break;
      case "board":
        board(b, s);
        break;
      case "lemon slice":
        slice(b, s);
        break;
      case "bar mat":
        mat(b, s);
        break;
      case "shaker tin":
        shakerTin(b, s, named("bar mat"));
        break;
      case "wine glass":
        glass(b, s);
        break;
      case "cake plate":
        cakeStand(b, s);
        break;
      case "cloche":
        cloche(b, s);
        break;
      case "cloche knob":
        clocheKnob(b, s);
        break;
    }
  }
  knife(b, named("knife"), named("knife handle"));
}

/** The names of the solids drawn here (the glass's foot and stem with its bowl, the stand's foot and stem with its plate). */
export const THINGS = new Set(["fruit bowl", "orange", "lemon", "peach", "board", "lemon slice", "knife", "knife handle", "bar mat", "shaker tin", "cake stand", "cake plate", "cloche", "cloche knob", "glass foot", "glass stem", "wine glass"]);
