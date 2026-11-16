// What is left on the tables, and the food about the place: the bread basket
// with its napkin and heel, the espresso cup on its saucer, the menu with
// ketchup smeared on it, the torn sugar packet and its spilt sugar, crumbs,
// the soda spilt by the bar and the grape trodden flat under a window table.
// Whatever the world doesn't have is under half a millimetre tall, lying on
// what it does.

import * as THREE from "three";
import type { Solid } from "@fly/world";
import { mat4 } from "../../scene/build.ts";
import type { Builder } from "./builder.ts";
import { KIND } from "./kinds.ts";
import { far, put } from "./tabletop-glass.ts";
import { TOP } from "./tabletop-glsl.ts";
import { crumbColor, crumbs, sugar, sugarRound, sugarTrail } from "./tabletop-litter.ts";
import type { Placement } from "./tabletop-litter.ts";
import { dishEdge, dishProfile, domeRun, feltAt, feltRun, raw, roundOf, tube } from "./tabletop-shapes.ts";

type Rnd = { next(): number; range(lo: number, hi: number): number };

/** What small things are scattered on: a surface's height at a point. */
type Ground = (x: number, z: number) => number;

/** Grains (or crumbs) round a point, thickest in the middle: each at most `tall` high, resting on `ground`. */
function strew(out: Placement[], rnd: Rnd, x: number, z: number, r: number, count: number, ground: Ground, size: readonly [number, number], tall: number, color: (i: number) => THREE.Color, flat = 1) {
  for (let i = 0; i < count; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const d = r * Math.sqrt(rnd.next()) * (0.4 + 0.6 * rnd.next());
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const w = rnd.range(size[0], size[1]);
    const h = Math.min(tall, w * flat);
    out.push({
      matrix: mat4({ x: px, y: ground(px, pz) + h * 0.3, z: pz }, new THREE.Euler(rnd.range(-0.25, 0.25), rnd.range(0, 6.3), rnd.range(-0.25, 0.25)), { x: w, y: h, z: w * rnd.range(0.7, 1.3) }),
      color: color(i),
    });
  }
}

/** A flat thing on a table, lying in its footprint: a sheet of `shape` (local x, z), extruded up `thick`, coloured by where on it. */
function sheet(b: Builder, area: number, shape: THREE.Shape, thick: number, at: { x: number; y: number; z: number; angle: number }, paint: (u: number, v: number) => THREE.Color, kind: number) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 3 }).rotateX(-Math.PI / 2);
  b.detail(area, geometry, (p) => paint(p.x, p.z), kind, mat4({ x: at.x, y: at.y, z: at.z }, new THREE.Euler(0, at.angle, 0)));
}

/** A rounded rectangle round the middle. */
function roundedRect(hx: number, hz: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-hx + r, hz);
  s.lineTo(hx - r, hz);
  s.quadraticCurveTo(hx, hz, hx, hz - r);
  s.lineTo(hx, -hz + r);
  s.quadraticCurveTo(hx, -hz, hx - r, -hz);
  s.lineTo(-hx + r, -hz);
  s.quadraticCurveTo(-hx, -hz, -hx, -hz + r);
  s.lineTo(-hx, hz - r);
  s.quadraticCurveTo(-hx, hz, -hx + r, hz);
  return s;
}

/** The laminated menu, and the ketchup smeared on it. */
export function menu(b: Builder, area: number, solid: Solid, smear: { x: number; z: number; r: number }, rnd: Rnd) {
  const f = solid.footprint as { x: number; z: number; hx: number; hz: number; angle: number };
  const ground = solid.bottom ?? 0;
  const top = (solid.top as { y: number }).y;
  const thick = top - ground - 0.05;
  const color = new THREE.Color();
  sheet(b, area, roundedRect(f.hx, f.hz, 3), thick, { x: f.x, y: ground - 0.02, z: f.z, angle: f.angle }, (u, v) => raw(color, (u + f.hx) / (2 * f.hx), (v + f.hz) / (2 * f.hz), 0), TOP.print);
  const lying = top - 0.07;
  const fresh = new THREE.Color("#a01208");
  const dry = new THREE.Color("#4a0a06");
  const lobes = rnd.range(0, 6.3);
  put(b, area, TOP.ketchup, [[1, lying], [0.92, lying + 0.1], [0.7, lying + 0.15], [0, lying + 0.17]], 40, { x: smear.x, z: smear.z, sx: smear.r * 1.5, sz: smear.r * 0.6, angle: 1.1 }, (out, x, _y, z) => {
    out.copy(dry).lerp(fresh, 1 - THREE.MathUtils.smoothstep(Math.hypot(x - smear.x, z - smear.z), smear.r * 0.4, smear.r * 0.9));
  }, { shape: (th) => 1 + 0.12 * Math.sin(th * 3 + lobes) + 0.06 * Math.sin(th * 7) });
  for (let i = 0; i < 5; i++) {
    const a = rnd.range(0, 6.3);
    const d = smear.r * rnd.range(1.3, 2.2);
    const r = rnd.range(0.5, 1.2);
    put(b, area, TOP.ketchup, [[r, lying], [r * 0.6, lying + 0.2], [0, lying + 0.24]], 10, { x: smear.x + Math.cos(a) * d, z: smear.z + Math.sin(a) * d }, dry);
  }
  b.standIn(area, new THREE.PlaneGeometry(f.hx * 2, f.hz * 2).rotateX(-Math.PI / 2), "#e2d8c0", KIND.paper, mat4({ x: f.x, y: top - 0.05, z: f.z }, new THREE.Euler(0, f.angle, 0)));
}

/**
 * The sugar packet, torn open at one end and lying flat, the sugar spilt
 * from it in a heap beside it (the world's food: `spill`), a trail of grains
 * between, and some on the packet (`onPacket`).
 */
export function tornPacket(b: Builder, area: number, solid: Solid, spill: { x: number; z: number; r: number }, onPacket: { x: number; z: number; r: number }, rnd: Rnd) {
  const f = solid.footprint as { x: number; z: number; hx: number; hz: number; angle: number };
  const ground = solid.bottom ?? 0;
  const top = (solid.top as { y: number }).y;
  const shape = new THREE.Shape();
  const tear = -f.hx + 3.5;
  shape.moveTo(tear, f.hz);
  shape.lineTo(f.hx, f.hz);
  shape.lineTo(f.hx, -f.hz);
  const steps = 14;
  for (let i = 0; i <= steps; i++) shape.lineTo(tear + (i % 2 ? 1.2 : -1) * rnd.range(0.5, 1) + Math.sin(i * 1.7) * 0.8, -f.hz + (2 * f.hz * i) / steps);
  const color = new THREE.Color();
  sheet(b, area, shape, top - ground - 0.06, { x: f.x, y: ground - 0.02, z: f.z, angle: f.angle }, (u, v) => raw(color, (u + f.hx) / (2 * f.hx), (v + f.hz) / (2 * f.hz), 4 / 8), TOP.print);
  b.standIn(area, new THREE.PlaneGeometry(f.hx * 2, f.hz * 2).rotateX(-Math.PI / 2), "#ece6da", KIND.paper, mat4({ x: f.x, y: top - 0.05, z: f.z }, new THREE.Euler(0, f.angle, 0)));
  const placed: Placement[] = [];
  sugarRound(placed, rnd, spill.x, spill.z, spill.r, 340, ground);
  sugarRound(placed, rnd, onPacket.x, onPacket.z, onPacket.r, 60, top - 0.06);
  // From the torn end (its corner toward the heap) to the heap.
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  sugarTrail(placed, rnd, { x: f.x + tear * c + f.hz * 0.4 * s, z: f.z - tear * s + f.hz * 0.4 * c }, spill, 50, ground);
  return placed;
}

/**
 * The bread basket: coiled straw, its outside and rim the world's dish, a
 * checked napkin lining it with its corners hanging over the rim, and the
 * heel of bread on it, crumbs round it.
 */
export function breadBasket(b: Builder, area: number, basket: Solid, bread: Solid, crumbsAt: { x: number; z: number; r: number }, rnd: Rnd) {
  const f = roundOf(basket);
  const at = { x: f.x, z: f.z, sx: f.rx, sz: f.rz, angle: f.angle };
  const top = basket.top as { well: number; rim: number; inner: number; lip: number };
  const ground = basket.bottom ?? 0;
  const mean = (f.rx + f.rz) / 2;
  const edge = dishEdge(basket);
  // The napkin covers the inside up to here; the straw shows from here over the rim and down the outside.
  const tuck = 0.87;
  const wicker = [...dishProfile(basket, tuck).slice(0, 9), ...feltRun(basket, top.lip, tuck, 5).slice(1)];
  // How far each row is from the middle along the basket's surface, for the coils.
  const along: number[] = [];
  const centreToTuck = top.inner * mean + Math.hypot((tuck - top.inner) * mean, feltAt(basket, tuck) - top.well);
  for (let i = wicker.length - 1, d = centreToTuck; i >= 0; i--) {
    if (i < wicker.length - 1) d += Math.hypot((wicker[i][0] - wicker[i + 1][0]) * mean, wicker[i][1] - wicker[i + 1][1]);
    along[i] = d;
  }
  put(b, area, TOP.wicker, wicker, 64, at, (out, _x, _y, _z, th, row) => raw(out, th / (Math.PI * 2), along[row] / 400, 0));
  // The napkin: down the inside and across the floor, creased a little.
  const lining: [number, number][] = [...feltRun(basket, tuck + 0.015, top.inner, 7), [0.55, top.well], [0.3, top.well], [0, top.well]];
  const crease = (th: number, s: number) => {
    const u = Math.cos(th) * s * f.rx;
    const v = Math.sin(th) * s * f.rz;
    return 0.5 + 0.25 * Math.sin(u * 0.11 + v * 0.05) + 0.25 * Math.sin(-u * 0.045 + v * 0.13 + 1);
  };
  const lift = (th: number, s: number, last: boolean) => 0.15 + (last ? 0.05 : 0.28) * crease(th, s);
  const cloth = (out: THREE.Color, th: number, d: number) => raw(out, (Math.cos(th) * d) / 300 + 0.5, (Math.sin(th) * d) / 300 + 0.5, 0);
  const liningAlong = (row: number) => lining[row][0] * mean + Math.max(0, lining[row][1] - top.well);
  put(b, area, TOP.napkin, lining, 64, at, (out, _x, _y, _z, th, row) => cloth(out, th, liningAlong(row)), { push: (th, row) => lift(th, lining[row][0], row === 0) });
  // Its four corners, over the rim and hanging down the outside, narrowing to their points.
  const sAt = (y: number) => {
    let lo = top.lip;
    let hi = edge;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (feltAt(basket, mid) > y) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const hang = [796, 804, 812, 820, 826].map((y): [number, number] => [sAt(y), y]);
  const flap: [number, number][] = [...hang, [top.lip, top.rim], ...feltRun(basket, top.lip, tuck + 0.025, 3).slice(1)];
  for (let k = 0; k < 4; k++) {
    const mid = 0.35 + (k * Math.PI) / 2 + rnd.range(-0.15, 0.15);
    const drop = rnd.range(0, 10);
    const rows = flap.map(([s, y], i): [number, number] => (i < hang.length ? [sAt(y + drop * (1 - i / hang.length)), y + drop * (1 - i / hang.length)] : [s, y]));
    put(b, area, TOP.napkin, rows, 8, at, (out, _x, y, _z, th) => cloth(out, th, mean + (top.rim - y)), {
      span: (row) => {
        const w = 0.05 + 0.3 * THREE.MathUtils.smoothstep(rows[row][1], rows[0][1], top.rim - 2);
        return [mid - w, mid + w];
      },
      push: () => 0.3,
    });
  }
  // The heel, lying on the napkin.
  const h = roundOf(bread);
  const heel = domeRun(bread, 12);
  heel[0][1] -= 0.25;
  put(b, area, TOP.bread, heel, 40, { x: h.x, z: h.z, sx: h.rx, sz: h.rz, angle: h.angle }, (out, _x, _y, _z, th, row) => raw(out, Math.cos(th) * heel[row][0] * 0.5 + 0.5, Math.sin(th) * heel[row][0] * 0.5 + 0.5, 0));
  // Crumbs on the napkin where the world has them, and a few more about.
  const onCloth: Ground = (x, z) => {
    const dx = x - f.x;
    const dz = z - f.z;
    const u = (dx * Math.cos(f.angle) - dz * Math.sin(f.angle)) / f.rx;
    const v = (dx * Math.sin(f.angle) + dz * Math.cos(f.angle)) / f.rz;
    const s = Math.hypot(u, v);
    return top.well + lift(Math.atan2(v, u), s, false) - 0.05;
  };
  const placed: Placement[] = [];
  const color = crumbColor(rnd);
  strew(placed, rnd, crumbsAt.x, crumbsAt.z, crumbsAt.r, 70, onCloth, [0.3, 1.6], 0.34, color, 0.4);
  strew(placed, rnd, h.x - 20, h.z + 25, 30, 25, onCloth, [0.3, 1.2], 0.3, color, 0.4);
  crumbs(b, area, placed);
  far(b, area, KIND.matte, "#9a7442", [[edge, ground], [top.lip, top.rim], [top.inner, top.well], [0, top.well]], 8, at);
  far(b, area, KIND.bread, "#b06a2c", [[1, top.well], [0.6, feltAt(bread, 0.6)], [0, feltAt(bread, 0)]], 6, { x: h.x, z: h.z, sx: h.rx, sz: h.rz, angle: h.angle });
}

/** The espresso cup on its saucer: glazed white china, the coffee's dregs in it (tabletop-glsl.ts) and sugar in them, its handle an ear filling the world's slab. */
export function espresso(b: Builder, area: number, saucer: Solid, cup: Solid, handle: Solid, rnd: Rnd) {
  const sf = roundOf(saucer);
  const cf = roundOf(cup);
  const china = (out: THREE.Color, x: number, y: number, z: number) => raw(out, (x - sf.x) / 120 + 0.5, (z - sf.z) / 120 + 0.5, (y - 760) / 70);
  const st = saucer.top as { well: number; inner: number };
  const ct = cup.top as { well: number; rim: number; inner: number; lip: number };
  const under = dishEdge(cup) * cf.rx;
  put(b, area, TOP.china, [...dishProfile(saucer, st.inner), [(under + 0.2) / sf.rx, st.well]], 72, { x: sf.x, z: sf.z, sx: sf.rx, sz: sf.rz }, china);
  put(b, area, TOP.china, [...dishProfile(cup, ct.inner), [0.5, ct.well], [0.25, ct.well], [0, ct.well]], 64, { x: cf.x, z: cf.z, sx: cf.rx, sz: cf.rz }, china);
  // The handle: a round bar from the cup's side out and back, the loop as wide and as tall as the slab allows.
  const hf = handle.footprint as { x: number; z: number; hx: number; hz: number };
  const r = hf.hz * 0.9;
  const low = (handle.bottom ?? 0) + r + 1.2;
  const high = (handle.top as { y: number }).y - r - 0.6;
  const wall = (y: number) => {
    let lo = ct.lip;
    let hi = dishEdge(cup);
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (feltAt(cup, mid) > y) lo = mid;
      else hi = mid;
    }
    return lo * cf.rx - 0.4;
  };
  const out = hf.x + hf.hx - r - 0.3 - cf.x;
  const cx = wall((low + high) / 2) + 4;
  const ear: THREE.Vector3[] = [new THREE.Vector3(wall(high), high + 0.4, 0)];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI / 2 - (i / 12) * Math.PI;
    ear.push(new THREE.Vector3(cx + (out - cx) * Math.max(0, Math.cos(a)) ** 0.8, (low + high) / 2 + ((high - low) / 2) * Math.sin(a), 0));
  }
  ear.push(new THREE.Vector3(wall(low), low - 0.4, 0));
  for (const p of ear) p.set(cf.x + p.x, p.y, hf.z);
  b.detail(area, tube(ear, r, 10), (p) => china(new THREE.Color(), p.x, p.y, p.z), TOP.china);
  const placed: Placement[] = [];
  sugarRound(placed, rnd, cf.x + 1, cf.z - 1, 9, 40, ct.well);
  sugarRound(placed, rnd, sf.x - 34, sf.z + 18, 5, 8, st.well);
  sugar(b, area, placed);
  far(b, area, KIND.ceramic, "#f4f2ec", [[dishEdge(saucer), saucer.bottom ?? 0], [dishEdge(saucer), (saucer.top as { rim: number }).rim], [under / sf.rx, st.well]], 6, { x: sf.x, z: sf.z, sx: sf.rx, sz: sf.rz });
  far(b, area, KIND.ceramic, "#f4f2ec", [[dishEdge(cup), cup.bottom ?? 0], [dishEdge(cup), ct.rim], [0, ct.well + 2]], 6, { x: cf.x, z: cf.z, sx: cf.rx, sz: cf.rz });
}

/** The soda spilt on the floor: a thin film, sticky and darker at its edge, a few splashes round it. */
export function soda(b: Builder, area: number, spill: { x: number; z: number; r: number }, rnd: Rnd) {
  const edgeC = new THREE.Color("#2a1206");
  const body = new THREE.Color("#6a3812");
  const p0 = rnd.range(0, 6.3);
  const wobble = (th: number) => 1 + 0.1 * Math.sin(th * 3 + p0) + 0.06 * Math.sin(th * 5 + p0 * 2) + 0.03 * Math.sin(th * 11);
  const at = { x: spill.x, z: spill.z, sx: spill.r, sz: spill.r };
  put(b, area, KIND.film, [[1, 0.02], [0.99, 0.2], [0.965, 0.3], [0.88, 0.35], [0.5, 0.36], [0, 0.36]], 72, at, (out, x, _y, z) => {
    out.copy(body).lerp(edgeC, THREE.MathUtils.smoothstep(Math.hypot(x - spill.x, z - spill.z) / spill.r, 0.7, 1.05));
  }, { shape: wobble });
  for (let i = 0; i < 9; i++) {
    const a = rnd.range(0, 6.3);
    const d = spill.r * rnd.range(1.15, 1.6);
    const r = rnd.range(0.6, 2.2);
    put(b, area, KIND.film, [[r, 0.02], [r * 0.7, 0.25], [0, 0.32]], 12, { x: spill.x + Math.cos(a) * d, z: spill.z + Math.sin(a) * d }, body);
  }
  b.standIn(area, (() => {
    const g = new THREE.CircleGeometry(spill.r, 12).rotateX(-Math.PI / 2);
    return g.translate(spill.x, 0.3, spill.z);
  })(), "#6a3812", KIND.film);
}

/** A grape trodden flat on the floor: its skin burst into torn lobes, the pulp squeezed out of it, two pips. */
export function grape(b: Builder, area: number, at: { x: number; z: number; r: number }, rnd: Rnd) {
  const skin = new THREE.Color("#3a0a26");
  const bloom = new THREE.Color("#7a5c74");
  const p0 = rnd.range(0, 6.3);
  const lobes = (th: number) => 0.72 + 0.32 * Math.abs(Math.sin(th * 2.5 + p0)) + 0.06 * Math.sin(th * 9);
  put(b, area, KIND.grape, [[0.95, 0.02], [0.9, 0.32], [0.75, 0.36], [0.45, 0.24], [0, 0.3]], 40, { x: at.x, z: at.z, sx: at.r * 0.9, sz: at.r * 0.9 }, (out, x, _y, z) => {
    out.copy(skin).lerp(bloom, 0.5 + 0.5 * Math.sin(x * 2.3 + z * 1.7) * Math.sin(z * 3.1 - x));
  }, { shape: lobes });
  const px = at.x + 1.2;
  const pz = at.z + 0.6;
  put(b, area, KIND.film, [[1, 0.06], [0.8, 0.32], [0.5, 0.43], [0, 0.46]], 32, { x: px, z: pz, sx: at.r * 0.55, sz: at.r * 0.45, angle: 0.6 }, new THREE.Color("#a8b048"), { shape: (th) => 1 + 0.15 * Math.sin(th * 3 + p0) });
  for (const [dx, dz, a] of [[-0.8, 0.4, 0.3], [1.6, -0.6, 1.9]] as const) {
    b.detail(area, new THREE.SphereGeometry(1, 8, 6), "#6a4420", KIND.crumb, mat4({ x: px + dx, y: 0.24, z: pz + dz }, new THREE.Euler(0, a, 0), { x: 1.1, y: 0.18, z: 0.7 }));
  }
}

/** A pinch of crumbs on a table: what clearing it missed. */
export function leftCrumbs(b: Builder, area: number, x: number, z: number, y: number, rnd: Rnd, count: number, r = 40) {
  const placed: Placement[] = [];
  strew(placed, rnd, x, z, r, count, () => y, [0.3, 1.3], 0.3, crumbColor(rnd), 0.4);
  crumbs(b, area, placed);
}

