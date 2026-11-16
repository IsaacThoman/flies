// The kitchen's pass: the steel shelf through the wall, the heat lamps under
// its head with their elements glowing, the brackets they hang from, the
// ticket rail above with three orders hanging from it, the dessert sent back
// with crumbs of tart and a smear of coulis, and a stack of clean plates.

import * as THREE from "three";
import { ON_PASS, PASS, RESTAURANT_PATCHES } from "@fly/world";
import type { Solid } from "@fly/world";
import { mat4, random } from "../../scene/build.ts";
import { areaNamed } from "./areas.ts";
import type { Builder } from "./builder.ts";
import { box, scatter } from "./geometry.ts";
import { KIND } from "./kinds.ts";
import { generic } from "./standins.ts";
import { Faces, REST_KIND, cap, dishProfile, film, plateStack, prism, revolve } from "./rest-shapes.ts";
import type { P } from "./rest-shapes.ts";

const china = "#f4f2ec";

export function buildPass(b: Builder, solids: readonly Solid[]) {
  const area = areaNamed("pass").id;
  const { shelf, lamps, rail } = PASS;
  const steel = new Faces();

  // The shelf: a folded steel top, its nose rounded, out over the room and back into the kitchen.
  const top = shelf.top;
  const nose = shelf.z1;
  const section: P[] = [
    [shelf.z0, PASS.sill],
    [nose - 2, PASS.sill],
    [nose, PASS.sill + 2],
    [nose, top - 1.5],
    [nose - 1.5, top],
    [shelf.z0, top],
  ];
  prism(steel, section, "x", shelf.x - shelf.hx, shelf.x + shelf.hx);
  cap(steel, section, "x", shelf.x - shelf.hx, -1);
  cap(steel, section, "x", shelf.x + shelf.hx, 1);

  // The heat lamps: a long steel housing, a trough of reflector up into its underside, two elements along it.
  const lx0 = shelf.x - lamps.hx;
  const lx1 = shelf.x + lamps.hx;
  const zb = lamps.z0;
  const zf = lamps.z1;
  const y0 = lamps.bottom;
  const trough: P[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    trough.push([zb + 8 + t * (zf - zb - 16), y0 + 2 + 14 * Math.sin(Math.PI * t) ** 0.6]);
  }
  const shell: P[] = [[zf - 8, y0], [zf, y0], [zf, lamps.top - 4], [zf - 1.5, lamps.top - 1], [zf - 4, lamps.top], [zb + 4, lamps.top], [zb + 1.5, lamps.top - 1], [zb, lamps.top - 4], [zb, y0], [zb + 8, y0]];
  prism(steel, shell, "x", lx0, lx1, false);
  const outline = [...shell, ...trough];
  cap(steel, outline, "x", lx0, -1);
  cap(steel, outline, "x", lx1, 1);
  prism(steel, [[zb + 8, y0], ...trough, [zf - 8, y0]], "x", lx0, lx1, false);
  const element = new THREE.CylinderGeometry(4, 4, lx1 - lx0 - 40, 10, 1, true).rotateZ(Math.PI / 2);
  for (const z of [zb + 0.36 * (zf - zb), zb + 0.64 * (zf - zb)]) b.detail(area, element.clone().translate(shelf.x, y0 + 8, z), "#3a1410", REST_KIND.heat);
  element.dispose();

  // What the housing hangs from: a rod under each bracket's plate.
  for (const s of solids.filter((s) => s.name === "bracket")) {
    const f = s.footprint;
    revolve(steel, [[6, lamps.top - 0.5], [6, PASS.head - 3], [9.5, PASS.head - 2.5], [9.5, PASS.head]], 12, f.x, f.z);
  }

  // The ticket rail: an extrusion on the wall with a slot along its foot where the slips are held.
  const slot = { z0: rail.z0 + 11, z1: rail.z1 - 6 };
  const railSection: P[] = [
    [rail.z0, rail.bottom],
    [slot.z0, rail.bottom],
    [slot.z0, rail.bottom + 12],
    [slot.z1, rail.bottom + 12],
    [slot.z1, rail.bottom],
    [rail.z1 - 1.5, rail.bottom],
    [rail.z1, rail.bottom + 1.5],
    [rail.z1, rail.top - 1.5],
    [rail.z1 - 1.5, rail.top],
    [rail.z0, rail.top],
  ];
  prism(steel, railSection, "x", shelf.x - rail.hx, shelf.x + rail.hx);
  cap(steel, railSection, "x", shelf.x - rail.hx, -1);
  cap(steel, railSection, "x", shelf.x + rail.hx, 1);
  b.detail(area, steel.geometry(), "#ffffff", KIND.steel);

  // The orders: slips of paper as thin as the world's, printed with rows of something illegible.
  for (const s of solids.filter((s) => s.name === "ticket")) {
    const f = s.footprint;
    if (f.kind !== "box") continue;
    const x0 = f.x - f.hx;
    const y1 = s.top.kind === "flat" ? s.top.y : rail.bottom;
    const yb = s.bottom ?? 0;
    const seed = (f.x % 97) / 97;
    const slip = box(x0, yb, f.z - f.hz, f.x + f.hx, y1, f.z + f.hz);
    b.detail(area, slip, (p) => new THREE.Color((p.x - x0) / (2 * f.hx), (p.y - yb) / (y1 - yb), seed), REST_KIND.slip);
  }

  // The dessert plate sent back: the glaze at the world's own heights, crumbs of tart and a smear of coulis in its well.
  const dessert = solids.find((s) => s.name === "dessert plate")!;
  b.detail(area, revolve(new Faces(), dishProfile(dessert), 48, ON_PASS.dessert.x, ON_PASS.dessert.z).geometry(), china, KIND.ceramic);
  const well = top + ON_PASS.dessert.well;
  const coulis = RESTAURANT_PATCHES.find((p) => p.name === "coulis")!;
  // Dragged by a fork: a long smear, a blob where it began, a few drops.
  // Each a body of the purée's own colour under a wet film.
  const smear = (r: number, wobble: number, thick: number, matrix: () => THREE.Matrix4) => {
    b.detail(area, film(new Faces(), r * 0.96, wobble, thick * 0.7).geometry(), "#8c0c22", KIND.glossy, matrix());
    b.detail(area, film(new Faces(), r, wobble, thick).geometry(), "#a01028", KIND.film, matrix());
  };
  smear(coulis.r * 0.62, 1.3, 0.3, () => mat4({ x: coulis.x, y: well, z: coulis.z }, new THREE.Euler(0, 0.5, 0), { x: 1.7, y: 1, z: 0.55 }));
  smear(coulis.r * 0.42, 4.1, 0.34, () => mat4({ x: coulis.x + 14, y: well, z: coulis.z - 8 }));
  const rng = random(31);
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(coulis.r * 1.1, coulis.r * 1.6);
    const at = { x: coulis.x + Math.cos(a) * d, y: well, z: coulis.z + Math.sin(a) * d };
    smear(rng.range(1.2, 2.4), i, 0.22, () => mat4(at));
  }
  const crumbs = RESTAURANT_PATCHES.find((p) => p.name === "tart crumbs")!;
  const grain = new THREE.IcosahedronGeometry(1, 0);
  const placed: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
  const pastry = [new THREE.Color("#d9a35c"), new THREE.Color("#c48a44"), new THREE.Color("#e6c08a")];
  for (let i = 0; i < 46; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = crumbs.r * Math.sqrt(rng.next()) * 1.3;
    const size = i < 6 ? rng.range(1.4, 2.6) : rng.range(0.3, 1.1);
    // Flat enough not to matter to a fly: none stands more than 0.4 mm proud of the glaze.
    placed.push({ matrix: mat4({ x: crumbs.x + Math.cos(a) * d, y: well, z: crumbs.z + Math.sin(a) * d }, new THREE.Euler(0, rng.range(0, 6.3), 0), { x: size, y: 0.4, z: size * rng.range(0.6, 1) }), color: pastry[i % 3] });
  }
  b.detailPainted(area, scatter(grain, placed, KIND.crumb), KIND.crumb);
  grain.dispose();

  // The clean plates, stacked rim on rim.
  const stack = ON_PASS.stack;
  b.detail(area, revolve(new Faces(), plateStack(stack.r, top, stack.height, 13), 48, stack.x, stack.z).geometry(), stackShade(stack.x, stack.z, stack.r, top + stack.height, china), KIND.ceramic);

  for (const s of solids) if (s.name !== "bracket") generic(b, s, false, true);
}

/** The plates' glaze darker where each rim tucks in under the next. */
export function stackShade(x: number, z: number, r: number, top: number, color: string) {
  const c = new THREE.Color(color);
  const dark = c.clone().multiplyScalar(0.55);
  const out = new THREE.Color();
  return (p: THREE.Vector3) => {
    if (p.y > top - 0.05) return c;
    const dx = p.x - x;
    const dz = p.z - z;
    return out.copy(dark).lerp(c, Math.min(1, Math.max(0, (Math.sqrt(dx * dx + dz * dz) - (r - 3.6)) / 3.2)));
  };
}
