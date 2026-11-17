// The glass on the tables, and what is in it: the tumbler left with orange
// juice in it, the bud vase with its rose, the votive with its tealight, the
// salt and pepper, the ketchup bottle. Each drawn to the world's felt shape
// (its outside where the world has it, its rim and inside the world's top),
// what is inside it within that, and a stand-in of a few faces for far off.

import * as THREE from "three";
import type { Solid } from "@fly/world";
import { mat4, random } from "../../scene/build.ts";
import type { Builder } from "./builder.ts";
import { KIND } from "./kinds.ts";
import { TOP } from "./tabletop-glsl.ts";
import { dishEdge, dishProfile, domeRun, feltAt, feltRun, raw, revolve, roundOf, turned } from "./tabletop-shapes.ts";
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

/** What is left in a tumbler: its kind, its colour at the edge and in the middle, and whether it has filmed the glass above it. */
export type Drink = { kind: number; color: THREE.ColorRepresentation; middle: THREE.ColorRepresentation; film: boolean };
// Bright and cloudy, so that neither could be taken for anything stronger.
export const ORANGE_JUICE: Drink = { kind: KIND.juice, color: "#ffa21e", middle: "#ffb43c", film: true };
export const LEMONADE: Drink = { kind: KIND.lemonade, color: "#f6ecaa", middle: "#fbf4c8", film: false };

/**
 * A tumbler, as the world has it: a straight side, a rounded rim, the inside
 * running down to the drink, whose surface is the world's well; under it the
 * glass's thick bottom. Orange juice films the glass a little above where
 * it stands.
 */
export function juiceGlass(b: Builder, area: number, glass: Solid, drink: Drink) {
  const g = roundOf(glass);
  const at = { x: g.x, z: g.z };
  const R = g.rx;
  const top = glass.top as { well: number; rim: number; lip: number };
  const on = glass.bottom ?? 0;
  const outer = mm(R, feltRun(glass, dishEdge(glass), top.lip, 10, (t) => t * t));
  put(b, area, KIND.glass, [[outer[0][0], on - 0.1], ...outer], 48, at, WHITE);
  // The inside, down to where the drink meets it, then straight down to the bottom's thick glass.
  const wet = wetEdge(glass, 0.45);
  const rW = wet * R;
  const floor = on + 7;
  const inside: [number, number][] = [...mm(R, feltRun(glass, top.lip, wet, 16, (t) => 0.5 - 0.5 * Math.cos(Math.PI * t))), [rW - 0.4, floor + 1.5], [rW - 2, floor], [0, floor - 0.6]];
  const film = (out: THREE.Color, _x: number, y: number) => raw(out, 0, 0, (y - on) / 120);
  put(b, area, drink.film ? TOP.inside : KIND.glass, inside, 48, at, drink.film ? film : WHITE);
  // The drink: its underside on the bottom, its edge pinched where it meets the glass, its surface level but for the meniscus.
  const d: [number, number][] = [[0, floor - 0.55], [rW - 2.05, floor + 0.05], [rW - 0.45, floor + 1.5]];
  for (const [back, up] of [[0.15, 0.4], [0.35, 0.24], [0.75, 0.1], [1.5, 0.025], [3, 0], [rW, 0]] as const) d.push([Math.max(0, rW - back), top.well + up]);
  const edge = new THREE.Color(drink.color);
  const middle = new THREE.Color(drink.middle);
  put(b, area, drink.kind, d, 48, at, (out, x, _y, z) => {
    out.copy(edge).lerp(middle, 1 - Math.hypot(x - g.x, z - g.z) / rW);
  });
  far(b, area, KIND.glass, "#ffffff", [[R, on], [R, top.rim], [rW, top.well + 10]], 6, at);
  far(b, area, drink.kind, drink.color, [[rW, on + 2], [rW, top.well], [0, top.well]], 6, at);
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
      [turned(TOP.shaker, grains, 36, at, (out, x, _y, z) => raw(out, x / 40 + 0.5, z / 40 + 0.5, pepper ? 0.4 : 0.6), { lift: heap }), TOP.shaker],
      [turned(TOP.shaker, cap, 28, at, (out, x, _y, z) => raw(out, x / 40 + 0.5, z / 40 + 0.5, pepper ? 0.2 : 0)), TOP.shaker],
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
