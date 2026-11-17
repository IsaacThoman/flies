// The host's stand by the door, with the menus, the reservations book and
// the bowl of mints on it; and the service station against the back wall,
// with its tray of cutlery, its plates, the carafe of water (full into its
// open neck) and six tumblers upturned to dry on a cloth. Both are panelled mahogany: their panels, doors
// and drawers are sunk into their faces, never proud of them, and what lies
// in the tray lies flat.

import * as THREE from "three";
import { HOST_STAND, ON_HOST, ON_STATION, RESTAURANT_PATCHES, STATION, topHeight } from "@fly/world";
import type { Solid } from "@fly/world";
import { mat4 } from "../../scene/build.ts";
import { areaNamed } from "./areas.ts";
import type { Builder } from "./builder.ts";
import { box, scatter } from "./geometry.ts";
import { KIND } from "./kinds.ts";
import { stackShade } from "./rest-pass.ts";
import { Faces, REST_KIND, boxDish, cap, dishProfile, edges, film, flat, inset, plateStack, prism, recess, revolve, ring, simplify } from "./rest-shapes.ts";
import type { P, Plane, Rect } from "./rest-shapes.ts";
import { generic } from "./standins.ts";

const china = "#f4f2ec";
const groove = "#5a4a40";

type Box = { x: number; z: number; hx: number; hz: number };

/** The four faces of a box standing on the floor, each as a plane with its own along (left to right seen from outside). */
function sides(q: Box): { pl: Plane; half: number }[] {
  return [
    { pl: { o: [q.x, 0, q.z + q.hz], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] }, half: q.hx },
    { pl: { o: [q.x + q.hx, 0, q.z], u: [0, 0, -1], v: [0, 1, 0], n: [1, 0, 0] }, half: q.hz },
    { pl: { o: [q.x, 0, q.z - q.hz], u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, -1] }, half: q.hx },
    { pl: { o: [q.x - q.hx, 0, q.z], u: [0, 0, 1], v: [0, 1, 0], n: [-1, 0, 0] }, half: q.hz },
  ];
}

/** Round a box: its plinth and the shadow line over it, as one moulding mitred at the corners. */
const PLINTH: P[] = [[0, 0], [0, 86], [1.5, 88], [4, 88], [4, 95], [0, 95]];

/** A face between two heights with sunk, bevelled panels in `columns` side by side. */
function panels(wood: Faces, pl: Plane, half: number, v0: number, v1: number, columns: number) {
  const stile = 60;
  const rail = 70;
  const mid = 50;
  const w = (2 * half - 2 * stile - (columns - 1) * mid) / columns;
  const holes: Rect[] = [];
  for (let c = 0; c < columns; c++) {
    const u0 = -half + stile + c * (w + mid);
    holes.push({ u0, u1: u0 + w, v0: v0 + rail, v1: v1 - rail });
  }
  flat(wood, pl, { u0: -half, u1: half, v0, v1 }, holes);
  for (const h of holes) flat(wood, pl, recess(wood, pl, h, 6, 14), [], -6);
}

const horizontal = (q: Box): Plane => ({ o: [q.x, 0, q.z], u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0] });
const footprint = (q: Box): Rect => ({ u0: -q.hx, u1: q.hx, v0: -q.hz, v1: q.hz });

export function buildHost(b: Builder, solids: readonly Solid[]) {
  const area = areaNamed("host").id;
  const h = HOST_STAND;
  const wood = new Faces();
  const dark = new Faces();
  const top = h.top;
  ring(dark, horizontal(h), footprint(h), PLINTH);
  for (const { pl, half } of sides(h)) panels(wood, pl, half, 95, top - 46, half > 250 ? 2 : 1);
  // Its top: a slab over a shadow line, the edge eased.
  ring(dark, horizontal(h), footprint(h), [[0, top - 46], [4, top - 46], [4, top - 40], [0, top - 40]]);
  ring(wood, horizontal(h), footprint(h), [[0, top - 40], [0, top - 1.5], [1.5, top]]);
  flat(wood, horizontal(h), inset(footprint(h), 1.5), [], top);
  b.detail(area, wood.geometry(), "#ffffff", KIND.mahogany);
  b.detail(area, dark.geometry(), "#c0a898", KIND.mahogany);

  // The menus, three leather-bound, the top one squarely over the others, a syrupy thumbprint on it.
  const m = ON_HOST.menus;
  const per = m.thick / 3;
  const leather: THREE.BufferGeometry[] = [];
  const paper: THREE.BufferGeometry[] = [];
  const shifts = [
    [-1.4, 1.1, 3],
    [1.1, -0.9, 2],
    [0, 0, 0],
  ];
  shifts.forEach(([dx, dz, shrink], i) => {
    const x0 = m.x - m.hx + shrink + dx;
    const x1 = m.x + m.hx - shrink + dx;
    const z0 = m.z - m.hz + shrink + dz;
    const z1 = m.z + m.hz - shrink + dz;
    const y0 = top + i * per - (i === 0 ? 0.1 : 0);
    const y1 = top + (i + 1) * per;
    const board = 1.8;
    const spine = (y1 - y0) / 2;
    leather.push(box(x0 + spine, y1 - board, z0, x1, y1, z1), box(x0 + spine, y0, z0, x1, y0 + board, z1));
    paper.push(box(x0 + spine, y0 + board, z0 + 1.5, x1 - 1.5, y1 - board, z1 - 1.5));
    leather.push(new THREE.CylinderGeometry(spine, spine, z1 - z0, 12).rotateX(Math.PI / 2).translate(x0 + spine, (y0 + y1) / 2, (z0 + z1) / 2));
  });
  for (const g of leather) b.detail(area, g, "#3a1d12", REST_KIND.cover);
  for (const g of paper) b.detail(area, g, "#efe6d2", REST_KIND.pages);
  const syrup = RESTAURANT_PATCHES.find((p) => p.name === "syrup" && (p.y ?? 0) > top)!;
  b.detail(area, film(new Faces(), syrup.r * 0.8, 2.2, 0.21).geometry(), "#a8600c", KIND.film, mat4({ x: syrup.x, y: top + m.thick, z: syrup.z }, new THREE.Euler(0, 0.8, 0), { x: 1.15, y: 1, z: 0.8 }));

  // The reservations book: cloth boards with leather corners and spine, the page block set back between them, its ribbon out at the foot.
  const k = ON_HOST.book;
  const bx0 = k.x - k.hx;
  const bx1 = k.x + k.hx;
  const bz0 = k.z - k.hz;
  const bz1 = k.z + k.hz;
  const by1 = top + k.thick;
  const board = 3;
  const round = 4;
  b.detail(area, box(bx0, by1 - board, bz0, bx1 - round, by1, bz1), "#7a2020", REST_KIND.cover);
  b.detail(area, box(bx0, top - 0.1, bz0, bx1 - round, top + board, bz1), "#7a2020", REST_KIND.cover);
  b.detail(area, box(bx0 + 3, top + board, bz0 + 3, bx1 - round, by1 - board, bz1 - 3), "#efe8d6", REST_KIND.pages);
  const spine: P[] = [[bx1 - round - 6, top], [bx1 - round, top]];
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    spine.push([bx1 - round + round * Math.sin(Math.PI * t), top + k.thick * t]);
  }
  spine.push([bx1 - round, by1], [bx1 - round - 6, by1]);
  const spineFaces = prism(new Faces(), spine, "z", bz0, bz1);
  cap(spineFaces, spine, "z", bz0, -1);
  cap(spineFaces, spine, "z", bz1, 1);
  b.detail(area, spineFaces.geometry(), "#4a1010", REST_KIND.cover);
  // The ribbon: down the page block's foot and out across the stand, as thin as paper.
  const ribbon = new Faces();
  const rx = k.x - 30;
  const foot = bz0 + 2;
  ribbon.quad([rx - 3.5, top + 0.2, foot, 0, 0, -1], [rx + 3.5, top + 0.2, foot, 0, 0, -1], [rx + 3.5, top + board + 8, foot, 0, 0, -1], [rx - 3.5, top + board + 8, foot, 0, 0, -1]);
  ribbon.quad([rx - 3.5, top + 0.25, foot, 0, 1, 0], [rx + 3.5, top + 0.25, foot, 0, 1, 0], [rx + 5, top + 0.25, bz0 - 26, 0, 1, 0], [rx - 2, top + 0.25, bz0 - 26, 0, 1, 0]);
  b.detail(area, ribbon.geometry(), "#8a1420", KIND.linen);

  // The bowl of mints: the glass at the world's heights, its floor under the mints that fill its well.
  const bowl = solids.find((s) => s.name === "mints")!;
  const mn = ON_HOST.mints;
  const floor = top + 1.5;
  const glass = dishProfile(bowl).map(([r, y]): P => (y >= top + mn.well - 0.01 && r < mn.r * 0.6 + 0.01 ? [r, floor] : [r, y]));
  b.detail(area, revolve(new Faces(), glass, 40, mn.x, mn.z).geometry(), "#eef4f6", KIND.glass);
  const sweet: P[] = [[0, 0], [8.6, 0], [9.3, 0.8], [9.5, 2], [9.1, 3.4], [7.8, 4.2], [4, 4.45], [0, 4.5]];
  const spots = [[0, 0], ...Array.from({ length: 6 }, (_, i) => [Math.cos(i * 1.047 + 0.3) * 18.8, Math.sin(i * 1.047 + 0.3) * 18.8])];
  spots.forEach(([dx, dz], i) => {
    const mx = mn.x + dx;
    const mz = mn.z + dz;
    const lift = floor + (i === 0 ? 0 : -0.05 * i);
    const g = revolve(new Faces(), sweet.map(([r, y]): P => [r, y + lift]), 24, mx, mz).geometry();
    // The vertex colour carries where on the sweet each point is, for its stripes.
    b.detail(area, g, (p) => new THREE.Color(0.5 + (p.x - mx) / 24, 0.5 + (p.z - mz) / 24, (i * 0.37) % 1), REST_KIND.mint);
  });

  for (const s of solids) generic(b, s, false, true);
}

export function buildStation(b: Builder, solids: readonly Solid[]) {
  const area = areaNamed("station").id;
  const st = STATION;
  const top = st.top;
  const wood = new Faces();
  const dark = new Faces();
  const shadow = new Faces();
  ring(dark, horizontal(st), footprint(st), PLINTH);
  ring(dark, horizontal(st), footprint(st), [[0, top - 40], [4, top - 40], [4, top - 33], [0, top - 33]]);
  const marble = new Faces();
  ring(marble, horizontal(st), footprint(st), [[0, top - 33], [0, top - 1.5], [1.5, top]]);
  flat(marble, horizontal(st), inset(footprint(st), 1.5), [], top);

  // The front: drawers over doors, each set into the carcass's frame with a gap round it, a brass knob on each.
  const [front, right, , left] = sides(st);
  const pl = front.pl;
  const v0 = 95;
  const v1 = top - 40;
  const stile = 50;
  const mid = 30;
  const w = (2 * st.hx - 2 * stile - 2 * mid) / 3;
  const rows = [
    { v0: v0 + 30, v1: 705, door: true },
    { v0: 735, v1: v1 - 25, door: false },
  ];
  const openings: { r: Rect; door: boolean }[] = [];
  for (const row of rows) for (let c = 0; c < 3; c++) {
    const u0 = -st.hx + stile + c * (w + mid);
    openings.push({ r: { u0, u1: u0 + w, v0: row.v0, v1: row.v1 }, door: row.door });
  }
  flat(wood, pl, { u0: -st.hx, u1: st.hx, v0, v1 }, openings.map((o) => o.r));
  const knobs: THREE.Matrix4[] = [];
  for (const { r, door } of openings) {
    const gap = recess(shadow, pl, r, 14);
    const leaf = inset(gap, 2.5);
    flat(shadow, pl, gap, [leaf], -14);
    edges(wood, pl, leaf, -4, -14);
    if (door) {
      const field = inset(leaf, 55);
      flat(wood, pl, leaf, [field], -4);
      flat(wood, pl, recess(wood, pl, field, 5, 12, -4), [], -9);
    } else flat(wood, pl, leaf, [], -4);
    const cu = (r.u0 + r.u1) / 2;
    const cv = door ? r.v1 - 70 : (r.v0 + r.v1) / 2;
    knobs.push(mat4({ x: st.x + cu, y: cv, z: st.z + st.hz - 4 }, new THREE.Euler(Math.PI / 2, 0, 0)));
  }
  for (const side of [right, left]) panels(wood, side.pl, side.half, v0, v1, 1);
  b.detail(area, wood.geometry(), "#ffffff", KIND.mahogany);
  b.detail(area, dark.geometry(), "#c0a898", KIND.mahogany);
  b.detail(area, shadow.geometry(), groove, KIND.mahogany);
  b.detail(area, marble.geometry(), "#ffffff", KIND.marble);
  const knob = revolve(new Faces(), [[0, 0], [5, 0], [5, 1.2], [8.6, 2.4], [9.4, 3.2], [7, 3.95], [0, 4]], 16).geometry();
  b.detailPainted(area, scatter(knob, knobs.map((matrix) => ({ matrix, color: new THREE.Color(1, 1, 1) })), KIND.brass), KIND.brass);
  knob.dispose();

  // The tray, its wood at the world's heights, and the cutlery lying flat in its well.
  const tray = solids.find((s) => s.name === "cutlery tray")!;
  b.detail(area, boxDish(new Faces(), tray).geometry(), "#ffffff", REST_KIND.tray);
  const t = ON_STATION.tray;
  const floor = top + t.well;
  const cutlery: { g: THREE.BufferGeometry; at: [number, number, number][] }[] = [
    { g: knifeShape(), at: [[0, -12, 0.01], [3, 12, -0.015]] },
    { g: forkShape(), at: [[-4, -66, 0.012], [2, -38, -0.01]] },
    { g: spoonShape(), at: [[2, 44, Math.PI + 0.01], [-6, 76, -0.012]] },
  ];
  for (const { g, at } of cutlery) {
    const placed = at.map(([dx, dz, a]) => ({ matrix: mat4({ x: t.x + dx, y: floor - 3.4, z: t.z + dz }, new THREE.Euler(0, a, 0)), color: new THREE.Color(1, 1, 1) }));
    b.detailPainted(area, scatter(g, placed, REST_KIND.polish), REST_KIND.polish);
    g.dispose();
  }

  // The clean plates.
  const plates = ON_STATION.plates;
  b.detail(area, revolve(new Faces(), plateStack(plates.r, top, plates.height, 18), 48, plates.x, plates.z).geometry(), stackShade(plates.x, plates.z, plates.r, top + plates.height, china), KIND.ceramic);

  // The carafe: glass a few millimetres thick under the world's shape, full of water up into its neck, where the water is the mouth's floor.
  const c = ON_STATION.carafe;
  const body = solids.find((s) => s.name === "carafe")!;
  const mouth = solids.find((s) => s.name === "carafe neck")!;
  const dome = (r: number) => topHeight(body, c.x + r, c.z);
  const felt = (r: number) => Math.max(dome(r), r <= c.neck ? topHeight(mouth, c.x + r, c.z) : -Infinity);
  // Finely over the neck's walls, where they rise steeply; the water's floor and the shoulder are gentle.
  const step = 0.05;
  const steep = Math.floor(c.neck * 0.7);
  const samples: P[] = [];
  for (let r = 0; r < steep; r += 0.5) samples.push([r, felt(r)]);
  for (let i = 0; steep + i * step < c.neck + 1; i++) samples.push([steep + i * step, felt(steep + i * step)]);
  for (let r = Math.ceil(c.neck + 1); r <= c.r; r++) samples.push([r, felt(r)]);
  // Where the neck's inside comes down to the water: the lowest point inside its lip.
  let lip = 0;
  for (let i = 0; samples[i][0] <= c.neck; i++) if (samples[i][1] > samples[lip][1]) lip = i;
  let low = 0;
  for (let i = 0; i < lip; i++) if (samples[i][1] < samples[low][1]) low = i;
  const rw = samples[low][0];
  const t2 = 2.4;
  // The shoulder's inside, from the neck out to the body's wall, `by` further in.
  const shoulderIn = (r0: number, r1: number, by: number) => Array.from({ length: 9 }, (_, i): P => {
    const r = r0 + ((r1 - r0) * i) / 8;
    return [r, dome(r) - t2 - by];
  });
  const inner = c.r - t2;
  const glass: P[] = [[c.r - 1.4, top - 0.1], [c.r, top + 1.4], ...simplify(samples.slice(low).reverse(), 0.1), ...shoulderIn(rw, inner, 0), [inner, top + c.shoulder - 2], [inner, top + 5], [inner - 3, top + 4], [0, top + 4]];
  b.detail(area, revolve(new Faces(), glass, 36, c.x, c.z).geometry(), "#eef6f4", KIND.glass);
  // The water's edge just into the glass, so no ring of air is left round it.
  const wet = rw + 0.15;
  const water: P[] = [[0, top + 4.1], [inner - 0.3, top + 4.1], [inner - 0.3, top + c.shoulder - 2.3], ...shoulderIn(wet, inner - 0.3, 0.3).reverse(), ...simplify(samples.filter(([r]) => r <= wet).reverse(), 0.1)];
  b.detail(area, revolve(new Faces(), water, 36, c.x, c.z).geometry(), "#cfe4e4", KIND.water);

  // The tumblers upturned to dry, on a cloth: each a thick base up top and its rim down on the linen.
  const tb = ON_STATION.tumbler;
  const ty = top + tb.height;
  const tumbler = revolve(new Faces(), [
    [0, ty - 9],
    [tb.r - 4, ty - 9],
    [tb.r - 2.6, ty - 11],
    [tb.r - 2.4, top + 0.8],
    [tb.r - 1.8, top],
    [tb.r - 0.6, top],
    [tb.r, top + 1],
    [tb.r, ty - 1.5],
    [tb.r - 1.5, ty],
    [0, ty],
  ], 28).geometry();
  b.detailPainted(area, scatter(tumbler, ON_STATION.tumblers.map((p) => ({ matrix: new THREE.Matrix4().makeTranslation(p.x, 0, p.z), color: new THREE.Color("#eef6f4") })), KIND.glass), KIND.glass);
  tumbler.dispose();
  const xs = ON_STATION.tumblers.map((p) => p.x);
  const zs = ON_STATION.tumblers.map((p) => p.z);
  b.detail(area, box(Math.min(...xs) - tb.r - 22, top - 0.05, Math.min(...zs) - tb.r - 18, Math.max(...xs) + tb.r + 18, top + 0.3, Math.max(...zs) + tb.r + 10), "#ece6da", KIND.linen);

  for (const s of solids) generic(b, s, false, true);
}

/** Cutlery as the fly finds it: flat, stamped out, standing a few tenths of a millimetre proud of the tray. */
function flatPiece(shape: THREE.Shape) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: 3.4, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2);
  // Its face shaded as if rounded across its width, so the light runs along it as along polished metal.
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    if (n.getY(i) < 0.9) continue;
    const tilt = p.getZ(i) * 0.06;
    const l = Math.hypot(1, tilt);
    n.setXYZ(i, 0, 1 / l, tilt / l);
  }
  return g;
}

function knifeShape() {
  const s = new THREE.Shape();
  s.moveTo(-108, -7);
  s.lineTo(-12, -6);
  s.lineTo(-6, -8);
  s.lineTo(80, -9.5);
  s.quadraticCurveTo(104, -9, 106, 0);
  s.quadraticCurveTo(100, 7, 70, 8);
  s.lineTo(-6, 8);
  s.lineTo(-12, 6);
  s.lineTo(-108, 7);
  s.quadraticCurveTo(-114, 0, -108, -7);
  return flatPiece(s);
}

function forkShape() {
  const s = new THREE.Shape();
  s.moveTo(-96, -9);
  s.quadraticCurveTo(-30, -6, 20, -3.5);
  s.quadraticCurveTo(45, -4, 52, -11);
  s.lineTo(94, -11);
  const tine = 4;
  const gap = (22 - 4 * tine) / 3;
  let z = -11 + tine;
  for (let i = 0; i < 3; i++) {
    s.lineTo(94, z);
    s.lineTo(62, z);
    s.lineTo(62, z + gap);
    s.lineTo(94, z + gap);
    z += gap + tine;
  }
  s.lineTo(94, 11);
  s.lineTo(52, 11);
  s.quadraticCurveTo(45, 4, 20, 3.5);
  s.quadraticCurveTo(-30, 6, -96, 9);
  s.quadraticCurveTo(-103, 0, -96, -9);
  return flatPiece(s);
}

function spoonShape() {
  const s = new THREE.Shape();
  s.moveTo(-92, -8.5);
  s.quadraticCurveTo(-20, -5, 22, -3.5);
  s.bezierCurveTo(30, -18, 95, -22, 97, 0);
  s.bezierCurveTo(95, 22, 30, 18, 22, 3.5);
  s.quadraticCurveTo(-20, 5, -92, 8.5);
  s.quadraticCurveTo(-99, 0, -92, -8.5);
  return flatPiece(s);
}
