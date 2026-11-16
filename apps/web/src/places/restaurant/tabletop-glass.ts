// The glass on the tables, and what is in it: the wine glass left with red in
// its bowl, the bud vase with its rose, the votive with its tealight, the
// sugar caddy full of packets, the salt and pepper, the ketchup bottle. Each
// drawn to the world's felt shape (its outside where the world has it, its
// rim and inside the world's top), what is inside it within that, and a
// stand-in of a few faces for far off.

import * as THREE from "three";
import type { Solid } from "@fly/world";
import { mat4, paint, random } from "../../scene/build.ts";
import type { Builder } from "./builder.ts";
import { box, sweepRect } from "./geometry.ts";
import { KIND } from "./kinds.ts";
import { BOWL_BASE, TOP } from "./tabletop-glsl.ts";
import { dishEdge, dishProfile, domeRun, feltAt, feltRun, raw, revolve, roundOf, stamp, turned } from "./tabletop-shapes.ts";
import type { Paint, Place, Profile, RevolveOptions } from "./tabletop-shapes.ts";

const WHITE = new THREE.Color("#ffffff");

/** Near detail, revolved. */
export function put(b: Builder, area: number, kind: number, profile: Profile, segments: number, at: Place, paint: Paint, options?: RevolveOptions) {
  b.detailPainted(area, turned(kind, profile, segments, at, paint, options), kind);
}

/** A stand-in, revolved with few sides. */
export function far(b: Builder, area: number, kind: number, color: THREE.ColorRepresentation | ((p: THREE.Vector3) => THREE.ColorRepresentation), profile: Profile, segments: number, at: Place) {
  b.standIn(area, revolve(profile, segments, at, WHITE), color, kind);
}

const mm = (r: number, points: readonly (readonly [number, number])[]) => points.map(([s, y]) => [s * r, y] as [number, number]);

/** The s where a dish's inside first rises `above` its well: where what is left in it meets it. */
function wetEdge(solid: Solid, above: number) {
  const top = solid.top as { well: number; inner: number; lip: number };
  let lo = top.inner;
  let hi = top.lip;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (feltAt(solid, mid) < top.well + above) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The wine glass: a foot, a stem and the bowl as the world has them, the
 * bowl's glass thick at its rim, wine film and tears up its inside, and the
 * red left in it: a pool whose surface is the world's well, deeper in the
 * middle where the bowl dips under it, so darker there, and climbing the
 * glass a little at its edge.
 */
export function wineGlass(b: Builder, area: number, foot: Solid, stem: Solid, bowl: Solid) {
  const g = roundOf(bowl);
  const at = { x: g.x, z: g.z };
  const R = g.rx;
  const top = bowl.top as { well: number; rim: number; lip: number };
  const footR = roundOf(foot).rx;
  const stemR = roundOf(stem).rx;
  const under = bowl.bottom ?? 0;
  const ground = foot.bottom ?? 0;
  const footTop = (r: number) => feltAt(foot, r / footR);
  const edge = dishEdge(bowl) * R;
  const outer: [number, number][] = [
    [footR, ground - 0.1],
    [footR, footTop(footR) - 0.7],
    [footR - 0.3, footTop(footR) - 0.15],
    ...Array.from({ length: 7 }, (_, i): [number, number] => {
      const r = footR - 1 - (footR - 1 - stemR - 0.6) * (i / 6) ** 0.7;
      return [r, footTop(r)];
    }),
    [stemR, (stem.bottom ?? 0) + 0.5],
    [stemR, under - 0.5],
    [stemR + 0.5, under],
    [edge - 0.8, under],
    [edge - 0.3, under + 0.3],
    ...mm(R, feltRun(bowl, dishEdge(bowl), top.lip, 8, (t) => t * t)).slice(1),
  ];
  put(b, area, KIND.glass, outer, 64, at, WHITE);
  // The inside, down to where the wine meets it; under the wine the glass dips to a well of its own.
  const wet = wetEdge(bowl, 0.45);
  const rW = wet * R;
  const depth = 7;
  const dip = (r: number) => feltAt(bowl, r / R) - depth * (1 - (r / rW) ** 2) ** 2;
  const inside: [number, number][] = [
    ...mm(R, feltRun(bowl, top.lip, wet, 16, (t) => 0.5 - 0.5 * Math.cos(Math.PI * t))),
    ...Array.from({ length: 6 }, (_, i): [number, number] => {
      const r = rW * (1 - (i + 1) / 6);
      return [r, dip(r)];
    }),
  ];
  const stain = (out: THREE.Color, x: number, y: number, z: number) => raw(out, (x - g.x) / 84 + 0.5, (z - g.z) / 84 + 0.5, (y - BOWL_BASE) / 120);
  put(b, area, TOP.bowl, inside, 64, at, stain);
  // The wine: its underside on the glass, its edge pinched where it meets it, its surface level but for the meniscus.
  const wine: [number, number][] = [];
  for (let i = 0; i <= 4; i++) {
    const r = (rW - 0.15) * (i / 4) ** 0.8;
    wine.push([r, dip(r) + 0.05]);
  }
  for (const [back, up] of [[0.15, 0.4], [0.35, 0.24], [0.75, 0.1], [1.5, 0.025], [3, 0], [rW, 0]] as const) wine.push([Math.max(0, rW - back), top.well + up]);
  const deep = new THREE.Color("#1c0206");
  const garnet = new THREE.Color("#7a1424");
  put(b, area, KIND.wine, wine, 64, at, (out, x, _y, z) => {
    const r = Math.hypot(x - g.x, z - g.z);
    out.copy(garnet).lerp(deep, THREE.MathUtils.smoothstep(top.well - dip(Math.min(r, rW)), 0.2, 4.5));
  });
  far(b, area, KIND.glass, "#ffffff", [[footR, ground], [footR, ground + 2.5], [stemR, ground + 3], [stemR, under], [edge, under], [edge, top.rim], [0, top.well + 10]], 6, at);
  far(b, area, KIND.wine, "#3a0610", [[rW, top.well], [0, top.well]], 6, at);
}

/**
 * The bud vase: thick glass, its shoulder the world's dome closing to a
 * narrow mouth, water in it; the rose's stem down through the mouth into the
 * water, and the bloom on top of it.
 */
export function budVase(b: Builder, area: number, vase: Solid, stem: Solid, flower: Solid) {
  const v = roundOf(vase);
  const at = { x: v.x, z: v.z };
  const R = v.rx;
  const base = vase.bottom ?? 0;
  const shoulder = (r: number) => feltAt(vase, r / R);
  const mouth = roundOf(stem).rx + 0.9;
  const glass: [number, number][] = [
    [R - 0.5, base - 0.1],
    [R, base + 0.6],
    [R, shoulder(R) - 1.2],
    [R - 0.15, shoulder(R - 0.15) - 0.4],
    ...Array.from({ length: 9 }, (_, i): [number, number] => {
      const r = R - 0.5 - (R - 0.5 - mouth) * (i / 8) ** 0.8;
      return [r, shoulder(r)];
    }),
    [mouth - 0.35, shoulder(mouth) - 0.3],
    [mouth - 0.5, shoulder(mouth) - 1.5],
    [mouth - 0.5, shoulder(mouth) - 2.4],
    ...Array.from({ length: 5 }, (_, i): [number, number] => {
      const r = mouth + 0.2 + (R - 2.6 - mouth) * (i / 4);
      return [r, shoulder(r) - 2.6];
    }),
    [R - 2.4, base + 7.5],
    [R - 3.2, base + 7],
    [0, base + 6.8],
  ];
  put(b, area, KIND.glass, glass, 40, at, WHITE);
  const level = base + 75;
  const wall = R - 2.55;
  put(b, area, KIND.water, [[wall, base + 7.6], [wall, level + 0.4], [wall - 0.5, level + 0.12], [wall - 1.6, level], [0, level]], 40, at, new THREE.Color("#cfe4dc"));
  // The stem, cut at the bottom of the water, up through the mouth to the bloom.
  const sf = roundOf(stem);
  const sr = sf.rx - 0.1;
  const green = new THREE.Color("#3c6a2a");
  const pale = new THREE.Color("#8aa860");
  put(b, area, KIND.flower, [[0, base + 12], [sr, base + 12], [sr, base + 12], [sr, (flower.bottom ?? 0) + 0.4]], 10, { x: sf.x, z: sf.z }, (out, _x, y) => {
    out.copy(green).lerp(pale, y < base + 12.5 ? 0.6 : 0.12 * Math.sin(y * 0.21) + 0.08);
  });
  // The bloom.
  const fl = roundOf(flower);
  const fr = fl.rx;
  const fb = flower.bottom ?? 0;
  const side = feltAt(flower, 0.9999);
  const bloom: [number, number][] = [
    [0, fb],
    [fr - 1.2, fb],
    [fr - 0.4, fb + 0.35],
    [fr, fb + 1],
    [fr, side - 0.01],
    ...mm(fr, domeRun(flower, 12)).slice(1),
  ];
  put(b, area, TOP.rose, bloom, 48, { x: fl.x, z: fl.z }, (out, x, y, z) => raw(out, (x - fl.x) / (2 * fr) + 0.5, (z - fl.z) / (2 * fr) + 0.5, (y - fb) / 28));
  far(b, area, KIND.glass, "#ffffff", [[R, base], [R, shoulder(R)], [0, shoulder(0)]], 6, at);
  far(b, area, KIND.flower, "#3c6a2a", [[sf.rx, shoulder(0)], [sf.rx, fb]], 3, { x: sf.x, z: sf.z });
  far(b, area, KIND.flower, "#9a1426", [[0, fb], [fr, fb], [fr, side], [0, feltAt(flower, 0)]], 6, { x: fl.x, z: fl.z });
}

/** The votive: a cup of amber glass, a tealight in its aluminium cup sitting level with the world's well, its wick burnt short. */
export function votive(b: Builder, area: number, solid: Solid) {
  const f = roundOf(solid);
  const at = { x: f.x, z: f.z, sx: f.rx, sz: f.rz };
  const top = solid.top as { well: number; rim: number; inner: number };
  const ground = solid.bottom ?? 0;
  const cupR = top.inner * f.rx - 0.2;
  const s = (r: number) => r / f.rx;
  const glass: [number, number][] = [...dishProfile(solid, top.inner, 0.1, 10), [s(cupR), top.well - 0.5], [s(cupR), ground + 8.5], [0, ground + 8]];
  put(b, area, TOP.tint, glass, 48, at, new THREE.Color("#e0a060"));
  const floor = ground + 8.1;
  const w = top.well;
  const tin: [number, number][] = [[0, floor], [cupR - 0.35, floor], [cupR, floor + 0.4], [cupR, w + 0.22], [cupR - 0.15, w + 0.42], [cupR - 0.4, w + 0.38], [cupR - 0.6, w + 0.1], [cupR - 0.65, w - 0.4]];
  put(b, area, KIND.steel, tin, 48, { x: f.x, z: f.z }, new THREE.Color("#dcdee0"));
  const waxR = cupR - 0.62;
  const wax: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const r = waxR * (1 - i / 10) ** 0.9;
    wax.push([r, w - 0.35 * (1 - (r / waxR) ** 2) ** 1.5 + (i === 0 ? 0.02 : 0)]);
  }
  const cream = new THREE.Color("#efe6d2");
  const pooled = new THREE.Color("#e4d2a8");
  put(b, area, KIND.wax, wax, 40, { x: f.x, z: f.z }, (out, x, _y, z) => {
    const r = Math.hypot(x - f.x, z - f.z);
    out.copy(cream).lerp(pooled, 1 - THREE.MathUtils.smoothstep(r, 3, 7)).multiplyScalar(r < 1.4 ? 0.55 : 1);
  });
  put(b, area, KIND.plain, [[0.42, w - 0.4], [0.42, w + 0.12], [0.3, w + 0.27], [0, w + 0.32]], 8, { x: f.x, z: f.z }, new THREE.Color("#141010"));
  far(b, area, TOP.tint, "#e0a060", [[dishEdge(solid), ground], [dishEdge(solid), top.rim], [0, w + 2]], 6, at);
}

/**
 * The sugar caddy: a box of thick glass, its corners rounded, full of
 * packets standing on end, their tops level with its rim, where the fly
 * walks on them; most white, a run of brown and of pink.
 */
export function sugarCaddy(b: Builder, area: number, solid: Solid) {
  const f = solid.footprint as { x: number; z: number; hx: number; hz: number; angle: number };
  const top = (solid.top as { y: number }).y;
  const ground = solid.bottom ?? 0;
  const place = mat4({ x: f.x, y: 0, z: f.z }, new THREE.Euler(0, f.angle, 0));
  const corner = 3.5;
  const wall = 2.5;
  const floor = ground + 6;
  const rim: [number, number][] = [
    [corner - wall, floor],
    [corner - wall, top - 0.8],
    [corner - wall + 0.25, top - 0.2],
    [corner - wall + 0.7, top],
    [corner - 0.7, top],
    [corner - 0.25, top - 0.25],
    [corner, top - 0.8],
    [corner, ground - 0.1],
  ];
  b.detail(area, sweepRect(f.hx - corner, f.hz - corner, rim, 5), WHITE, KIND.glass, place);
  const ix = f.hx - wall;
  const iz = f.hz - wall;
  b.detail(area, box(-ix, floor - 0.6, -iz, ix, floor, iz), WHITE, KIND.glass, place);
  const rnd = random(64);
  const rows = 21;
  // Runs of white, brown and pink, as they were pushed in.
  const DESIGNS = [1, 1, 1, 2, 2, 1, 1, 3, 3, 3, 1, 2, 1, 1, 1, 2, 2, 2, 1, 3, 1, 1, 2, 1, 1, 1, 3, 3];
  const pitch = (iz * 2) / rows;
  const width = ix - 0.35;
  // One packet, a unit box coded across and up it, stamped out for each.
  const unit = paint(new THREE.BoxGeometry(1, 1, 1), (p) => raw(new THREE.Color(), p.x + 0.5, p.y + 0.5, 0));
  const packets: { matrix: THREE.Matrix4; blue: number }[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < rows; i++) {
      const height = top - 0.15 - rnd.range(0, 0.35) - (floor + 0.2);
      const local = mat4({ x: (side * (ix + 0.1)) / 2, y: floor + 0.2 + height / 2, z: -iz + pitch * (i + 0.5) }, new THREE.Euler(rnd.range(-0.012, 0.012), rnd.range(-0.01, 0.01), 0), { x: width, y: height, z: pitch - 0.12 });
      packets.push({ matrix: place.clone().multiply(local), blue: DESIGNS[(i + (side > 0 ? 9 : 0)) % DESIGNS.length] / 8 });
    }
  }
  b.detailPainted(area, stamp(unit, packets, TOP.print), TOP.print);
  b.standIn(area, box(-f.hx, ground, -f.hz, f.hx, top, f.hz), "#e8e2d4", KIND.paper, place);
}

/**
 * The salt and pepper shakers, in pairs: fluted glass with a thick foot,
 * salt or pepper two thirds up it, and a steel cap whose crown is the
 * world's dome, holes in it. Each is the same shaker, so one of each is
 * built and copied, turned a little, to every table that has them.
 */
export function shakers(b: Builder, solids: readonly Solid[], areaOf: (s: Solid) => number) {
  if (!solids.length) return;
  const model = solids[0];
  const R = roundOf(model).rx;
  const ground = model.bottom ?? 0;
  const dome = model.top as { base: number; height: number };
  const capFoot = dome.base - 11;
  const gr = R - 0.3;
  const inner = R - 2.7;
  const at = { x: 0, z: 0 };
  const glass: [number, number][] = [
    [gr - 0.5, ground - 0.1],
    [gr, ground + 0.5],
    [gr, ground + 2],
    [gr, capFoot - 1],
    [gr, capFoot + 0.3],
    [inner + 0.3, capFoot + 0.3],
    [inner, capFoot - 0.2],
    [inner, ground + 7.2],
    [inner - 0.8, ground + 6.6],
    [0, ground + 6.3],
  ];
  const flute = (th: number, row: number) => (row === 2 || row === 3 ? 1 - (0.35 / gr) * (0.5 + 0.5 * Math.cos(th * 9)) : 1);
  const cap: [number, number][] = [[R - 0.45, capFoot - 0.1], [R - 0.05, capFoot + 0.3], [R, capFoot + 0.8], [R, dome.base - 0.2], ...mm(R, domeRun(model, 7))];
  const templates = [false, true].map((pepper) => {
    const fill = ground + (pepper ? 40 : 46);
    const grains: [number, number][] = [[inner - 0.1, ground + 7], [inner - 0.1, fill + 0.7], [inner - 0.6, fill + 0.55], [inner * 0.7, fill + 0.3], [inner * 0.35, fill], [0, fill - 0.2]];
    const heap = (th: number, row: number) => (row >= 2 ? 0.6 * Math.sin(th * 2 + (pepper ? 2 : 0)) * Math.min(1, (5 - row) / 2) : 0);
    const near: [THREE.BufferGeometry, number][] = [
      [turned(KIND.glass, glass, 36, at, WHITE, { shape: flute }), KIND.glass],
      pepper ? [turned(TOP.shaker, grains, 24, at, (out) => raw(out, 0.5, 0.5, 2 / 3), { lift: heap }), TOP.shaker] : [turned(KIND.sugar, grains, 24, at, new THREE.Color("#f2f0ea"), { lift: heap }), KIND.sugar],
      [turned(TOP.shaker, cap, 28, at, (out, x, _y, z) => raw(out, x / 40 + 0.5, z / 40 + 0.5, pepper ? 1 / 3 : 0)), TOP.shaker],
    ];
    const salt = pepper ? "#2a2826" : "#ecebe6";
    const color = (p: THREE.Vector3) => (p.y > capFoot + 0.5 ? "#b8babc" : salt);
    return { near, far: revolve([[R, ground], [R, capFoot], [R, dome.base], [0, dome.base + dome.height]], 4, at, WHITE), color };
  });
  const rnd = random(85);
  solids.forEach((s, i) => {
    const t = templates[i % 2];
    const f = roundOf(s);
    const area = areaOf(s);
    const place = mat4({ x: f.x, y: (s.bottom ?? 0) - ground, z: f.z }, new THREE.Euler(0, rnd.range(0, Math.PI * 2), 0));
    for (const [g, kind] of t.near) b.detailPainted(area, g.clone().applyMatrix4(place), kind);
    b.standIn(area, t.far.clone(), t.color, KIND.matte, place);
  });
}

/**
 * The ketchup bottle: glass, a paper label, ketchup to its shoulder and
 * lumpy on top; a white screw cap, knurled, crusted where it was poured
 * from and dripped down its side.
 */
export function ketchup(b: Builder, area: number, body: Solid, neck: Solid, cap: Solid) {
  const f = roundOf(body);
  const at = { x: f.x, z: f.z };
  const R = f.rx;
  const ground = body.bottom ?? 0;
  const dome = body.top as { base: number; height: number };
  const nr = roundOf(neck).rx;
  const shoulder = (r: number) => feltAt(body, r / R);
  const capBottom = cap.bottom ?? 0;
  const capTop = (cap.top as { y: number }).y;
  const cr = roundOf(cap).rx;
  const gr = R - 0.45;
  const glass: [number, number][] = [
    [gr - 0.5, ground - 0.1],
    [gr, ground + 0.6],
    [gr, dome.base - 1],
    ...Array.from({ length: 10 }, (_, i): [number, number] => {
      const r = gr - (gr - nr - 0.2) * (i / 9);
      return [r, shoulder(r) - 0.3];
    }),
    [nr - 0.25, shoulder(nr) + 0.4],
    [nr - 0.25, capBottom - 0.2],
    [nr - 2, capBottom - 0.2],
  ];
  put(b, area, KIND.glass, glass, 64, at, WHITE);
  const kr = R - 2.8;
  const rnd = random(71);
  const lumps = [rnd.range(0, 6.3), rnd.range(0, 6.3)];
  const sauce: [number, number][] = [[kr, ground + 3], [kr, dome.base - 3]];
  for (let i = 1; i <= 4; i++) {
    const r = kr - i * 1.2;
    sauce.push([r, shoulder(r + 2.8) - 2.8]);
  }
  const level = sauce[sauce.length - 1][1];
  sauce.push([kr * 0.6, level - 0.8], [kr * 0.3, level - 1.2], [0, level - 1.3]);
  const lumpy = (th: number, row: number) => (row >= 5 && row < sauce.length - 1 ? 0.9 * Math.sin(th * 3 + lumps[0]) * Math.sin(th * 5 + lumps[1]) : 0);
  put(b, area, TOP.ketchup, sauce, 48, at, new THREE.Color("#8a0a08"), { lift: lumpy });
  // The label: cream, a red band round it, a green block on the band facing the room.
  const lr = R - 0.2;
  const cream = new THREE.Color("#ece2c8");
  const red = new THREE.Color("#a8160e");
  put(b, area, KIND.label, [[lr, ground + 32], [lr, ground + 58], [lr, ground + 58], [lr, ground + 76], [lr, ground + 76], [lr, ground + 102]], 64, at, (out, _x, _y, _z, _t, row) => {
    out.copy(row === 2 || row === 3 ? red : cream);
  });
  const face = Math.atan2(-f.z, -f.x);
  put(b, area, KIND.label, [[R - 0.05, ground + 54], [R - 0.05, ground + 80]], 8, at, new THREE.Color("#1f4a24"), { span: () => [face - 0.42, face + 0.42] });
  // The cap.
  const knurl = (th: number, row: number) => (row === 2 || row === 3 ? 1 - (0.3 / cr) * (0.5 + 0.5 * Math.cos(th * 24)) : 1);
  const lid: [number, number][] = [[nr, capBottom], [cr - 0.4, capBottom], [cr, capBottom + 0.4], [cr, capTop - 1], [cr - 0.4, capTop - 0.15], [cr - 1.2, capTop], [0, capTop]];
  const c = roundOf(cap);
  put(b, area, KIND.glossy, lid, 72, { x: c.x, z: c.z }, new THREE.Color("#ebe7de"), { shape: knurl });
  // The crust on it, and two drips down its side.
  const crust = new THREE.Color("#2a0604");
  const wet = new THREE.Color("#5c0806");
  const blob = (th: number) => 1 + 0.14 * Math.sin(th * 3 + 0.7) + 0.08 * Math.sin(th * 7 + 2);
  put(b, area, TOP.ketchup, [[5.5, capTop - 0.08], [5.1, capTop + 0.14], [3.8, capTop + 0.24], [2.1, capTop + 0.26], [1.6, capTop + 0.08], [0, capTop + 0.03]], 40, { x: c.x + 0.8, z: c.z - 0.6 }, (out, x, _y, z) => {
    out.copy(crust).lerp(wet, 1 - THREE.MathUtils.smoothstep(Math.hypot(x - c.x - 0.8, z - c.z + 0.6), 1.9, 2.8)).multiplyScalar(Math.hypot(x - c.x - 0.8, z - c.z + 0.6) < 1.7 ? 0.25 : 1);
  }, { shape: blob });
  for (const [a, low] of [[0.6, capBottom + 5], [2.9, capBottom + 9]] as const) {
    put(b, area, TOP.ketchup, [[cr + 0.12, low], [cr + 0.12, capTop - 0.6], [cr - 0.3, capTop + 0.1]], 4, { x: c.x, z: c.z }, crust, { span: (row) => (row === 0 ? [a + 0.03, a + 0.09] : [a, a + 0.12]) });
  }
  far(b, area, KIND.glossy, "#9a120c", [[R, ground], [R, dome.base], [nr + 1, shoulder(nr)], [nr + 1, capTop], [0, capTop]], 5, at);
}
