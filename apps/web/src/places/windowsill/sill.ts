// The windowsill and everything on it, the window, and the kitchen round it,
// built from the world's description (packages/world/src/windowsill.ts) so
// that what the fly stands on is exactly what is drawn. Merged by material
// into a few meshes; the small things are instanced.

import * as THREE from "three";
import { ALARM_CLOCK, BANANA, BASIL_CROWN, HONEY_JAR, POSTCARD, WINE_BOTTLE, FRUIT_BOWL, PEACH_PLATE, BASIL_POT, SILL, SILL_DECOR, SILL_PATCHES, SILL_SOLIDS, TEASPOON, WINDOW, bananaAt, inside, topHeight, topNormal, topPeak } from "@fly/world";
import type { Solid } from "@fly/world";
import { Batch, freeze, mat4, paint, random } from "../../scene/build.ts";
import { WallClock } from "../../scene/clock.ts";
import type { Daylight } from "../../scene/light.ts";
import type { Weather } from "../../scene/weather.ts";
import type { SceneSet } from "../types.ts";
import { ALARM_DIAL, CLOCK_FACES } from "./clocks.ts";
import { waterMaterial, windowGlass } from "./glass.ts";
import { FRAME_HEAD, createSunlight, sunlit } from "./light.ts";
import type { Ball, Column } from "./light.ts";
import { TILE_TOP, buildRoom } from "./room.ts";
import { buildSeen } from "./seen.ts";
import { blend, clayMaterial, fruitMaterial, glazeMaterial, leafMaterial, notLeaf, paintMaterial, plasterMaterial, tag, tileMaterial, tone, towelMaterial } from "./surfaces.ts";
import type { Contact } from "./surfaces.ts";

/** The room's warm walls and floor tint the sunlight they throw back at the window. */
const BOUNCE = new THREE.Color("#ffe2bc");

/** The room under its lamp, as glossy things on the sill reflect it at night. */
const LAMPLIT = new THREE.Color("#6a4a2c");

/** How far either side of the alarm clock's middle its feet stand. */
const CLOCK_FOOT = 25;

/** How many rings can spread on the pools at once. */
const RIPPLES = 4;

const byName = (name: string) => SILL_SOLIDS.filter((s) => s.name === name);
const one = (name: string) => byName(name)[0];
const patch = (name: string) => SILL_PATCHES.find((p) => p.name === name)!;

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

const UP = new THREE.Vector3(0, 1, 0);
/** A rod from a to b. */
const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, segments = 8) => {
  const along = b.clone().sub(a);
  return new THREE.CylinderGeometry(r, r, along.length(), segments, 1, true)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, along.normalize()))
    .translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
};

/** A round thing's surface turned from a profile of [radius, height] points, at (x, z). */
const lathe = (profile: readonly (readonly [number, number])[], segments: number, x: number, z: number) =>
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments).translate(x, 0, z);

/** A circular solid's top as a profile from radius r0 out to r1, at exactly its height. */
function topProfile(solid: Solid, r0: number, r1: number, steps: number): [number, number][] {
  const f = solid.footprint as { x: number; z: number; r: number };
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const r = r0 + ((r1 - r0) * i) / steps;
    out.push([r, topHeight(solid, f.x + Math.min(r, f.r * 0.99999), f.z)]);
  }
  return out;
}

/** The top of a round or oval solid as a mesh: a polar grid over its footprint, from `from` to `to` of the way out, at exactly its height. */
function topGeometry(solid: Solid, rings: number, segments: number, from = 0, to = 1) {
  const f = solid.footprint;
  if (f.kind === "box") throw new Error("Boxes are flat");
  const rx = f.kind === "circle" ? f.r : f.rx;
  const rz = f.kind === "circle" ? f.r : f.rz;
  const angle = f.kind === "circle" ? 0 : f.angle;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Each point of the grid worked out once, then laid into its triangles.
  const grid = new Float32Array((rings + 1) * (segments + 1) * 6);
  const n = { x: 0, y: 1, z: 0 };
  for (let si = 0; si <= rings; si++) {
    const sv = Math.min(0.9999, from + ((to - from) * si) / rings);
    for (let ti = 0; ti <= segments; ti++) {
      const th = (ti / segments) * Math.PI * 2;
      const u = Math.cos(th) * rx * sv;
      const v = Math.sin(th) * rz * sv;
      const x = f.x + u * c + v * s;
      const z = f.z - u * s + v * c;
      topNormal(solid, x, z, n);
      grid.set([x, topHeight(solid, x, z), z, n.x, n.y, n.z], (si * (segments + 1) + ti) * 6);
    }
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const point = (si: number, ti: number) => {
    const k = (si * (segments + 1) + ti) * 6;
    positions.push(grid[k], grid[k + 1], grid[k + 2]);
    normals.push(grid[k + 3], grid[k + 4], grid[k + 5]);
  };
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      point(i, j);
      point(i + 1, j + 1);
      point(i + 1, j);
      if (i > 0 || from > 0) {
        point(i, j);
        point(i, j + 1);
        point(i + 1, j + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

/**
 * The banana: a grid along its middle line and round across it, each point
 * at the height of the banana's own rounds in the world there, so the skin
 * the fly walks on is exactly the skin drawn. Across, the points crowd toward
 * its sides, where it curves down steeply to the sill.
 */
function bananaGeometry() {
  const rings = byName("banana");
  const along = 80;
  const across = 22;
  const p = { x: 0, z: 0 };
  const q = { x: 0, z: 0 };
  // Only the rounds near t along it can be under a point: the rest are too far along it.
  const height = (x: number, z: number, t: number) => {
    let y = 0;
    const k = Math.round(t * (rings.length - 1));
    for (let i = Math.max(0, k - 6); i <= Math.min(rings.length - 1, k + 6); i++) if (inside(rings[i].footprint, x, z)) y = Math.max(y, topHeight(rings[i], x, z));
    return y;
  };
  // Past each end it rounds off over the end ring's radius.
  const r0 = BANANA.radius(0);
  const r1 = BANANA.radius(1);
  const grid: THREE.Vector3[][] = [];
  const colors: THREE.Color[][] = [];
  const t0 = bananaAt(0, { x: 0, z: 0 });
  const tEnd = bananaAt(1, { x: 0, z: 0 });
  const startDir = new THREE.Vector2(bananaAt(0.01, q).x - t0.x, q.z - t0.z).normalize();
  const endDir = new THREE.Vector2(tEnd.x - bananaAt(0.99, q).x, tEnd.z - q.z).normalize();
  for (let i = 0; i <= along + 12; i++) {
    let cx: number;
    let cz: number;
    let dirX: number;
    let dirZ: number;
    let w: number;
    if (i < 6) {
      // The rounded tip.
      const k = Math.cos(((6 - i) / 6) * (Math.PI / 2));
      cx = t0.x - startDir.x * r0 * (1 - k) * 0.98;
      cz = t0.z - startDir.y * r0 * (1 - k) * 0.98;
      dirX = startDir.x;
      dirZ = startDir.y;
      w = r0 * Math.sqrt(Math.max(0, 1 - (1 - k) * (1 - k))) * 0.999;
    } else if (i > along + 6) {
      const k = Math.cos(((i - along - 6) / 6) * (Math.PI / 2));
      cx = tEnd.x + endDir.x * r1 * (1 - k) * 0.98;
      cz = tEnd.z + endDir.y * r1 * (1 - k) * 0.98;
      dirX = endDir.x;
      dirZ = endDir.y;
      w = r1 * Math.sqrt(Math.max(0, 1 - (1 - k) * (1 - k))) * 0.999;
    } else {
      const t = (i - 6) / along;
      bananaAt(t, p);
      bananaAt(Math.min(1, t + 0.002), q);
      const a = bananaAt(Math.max(0, t - 0.002), { x: 0, z: 0 });
      cx = p.x;
      cz = p.z;
      dirX = q.x - a.x;
      dirZ = q.z - a.z;
      const l = Math.hypot(dirX, dirZ);
      dirX /= l;
      dirZ /= l;
      w = BANANA.radius(t) * 0.999;
    }
    const at = i < 6 ? 0 : i > along + 6 ? 1 : (i - 6) / along;
    const row: THREE.Vector3[] = [];
    const tint: THREE.Color[] = [];
    for (let j = 0; j <= across; j++) {
      const s = Math.sin(((j / across) * 2 - 1) * (Math.PI / 2));
      const x = cx - dirZ * w * s;
      const z = cz + dirX * w * s;
      const y = height(x, z, at);
      row.push(new THREE.Vector3(x, y, z));
      tint.push(bananaColor(at, Math.abs(s), y));
    }
    grid.push(row);
    colors.push(tint);
  }
  const positions: number[] = [];
  const tints: number[] = [];
  const push = (i: number, j: number) => {
    const v = grid[i][j];
    const c = colors[i][j];
    positions.push(v.x, v.y, v.z);
    tints.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < grid.length - 1; i++) {
    for (let j = 0; j < across; j++) {
      push(i, j);
      push(i, j + 1);
      push(i + 1, j);
      push(i, j + 1);
      push(i + 1, j + 1);
      push(i + 1, j);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(tints, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** The banana's skin at t along it (0 the tip, 1 the stalk's end), s out to its side (0 on top, 1 at the sill), y high: black at the tip, green-brown at the stalk, faint darker ridges along it, duller underneath. */
function bananaColor(t: number, s: number, y: number): THREE.Color {
  if (t < 0.025) return tone("#2e1e10");
  if (t > BANANA.stalk + 0.01) return t > 0.985 ? tone("#3e301c") : blend("#8a8240", "#5e5a2c", (t - BANANA.stalk) * 6).clone();
  const ridge = Math.abs(s - 0.45) < 0.06 || Math.abs(s - 0.85) < 0.05 ? 0.86 : 1;
  const greenish = Math.max(0, 1 - t / 0.12) * 0.5 + Math.max(0, (t - BANANA.stalk + 0.08) / 0.08) * 0.4;
  return blend("#f0c43c", "#c9a640", Math.max(0, 1 - y / 5) * 0.5).lerp(tone("#9a9a3a"), greenish).multiplyScalar(ridge).clone();
}

/** What standing on the sill casts its shadow there: the rounds, and the columns. */
function casters(): { balls: Ball[]; columns: Column[] } {
  const p = { x: 0, z: 0 };
  const balls: Ball[] = [
    { x: FRUIT_BOWL.x - 8, y: 32, z: FRUIT_BOWL.z - 6, r: 26 },
    { x: FRUIT_BOWL.x + 32, y: 28, z: FRUIT_BOWL.z - 24, r: 17 },
    { x: FRUIT_BOWL.x + 20, y: 24.5, z: FRUIT_BOWL.z + 30, r: 17 },
    // The basil's leaves let some light through.
    { x: BASIL_POT.x, y: BASIL_POT.rim + 30, z: BASIL_POT.z, r: BASIL_CROWN[0].r, density: 0.85 },
    { x: BASIL_POT.x, y: BASIL_CROWN[1].top - 40, z: BASIL_POT.z, r: 40, density: 0.8 },
    // The alarm clock's drum: seen from the window, a disc.
    { x: ALARM_CLOCK.x, y: ALARM_CLOCK.y, z: ALARM_CLOCK.z, r: ALARM_CLOCK.r },
    { x: PEACH_PLATE.x - 5, y: -12, z: PEACH_PLATE.z - 3, r: 27 },
  ];
  for (const t of [0.22, 0.42, 0.6, 0.76]) {
    bananaAt(t, p);
    const r = BANANA.radius(t);
    balls.push({ x: p.x, y: r * 0.25, z: p.z, r: r * 0.8 });
  }
  const columns: Column[] = [
    { x: BASIL_POT.x, z: BASIL_POT.z, r: BASIL_POT.r + 1.5, top: BASIL_POT.rim },
    { x: WINE_BOTTLE.x, z: WINE_BOTTLE.z, r: WINE_BOTTLE.r, top: WINE_BOTTLE.shoulder + 14 },
    { x: WINE_BOTTLE.x, z: WINE_BOTTLE.z, r: WINE_BOTTLE.neck, top: WINE_BOTTLE.top },
    { x: FRUIT_BOWL.x, z: FRUIT_BOWL.z, r: FRUIT_BOWL.r * 0.78, top: 28 },
    { x: HONEY_JAR.x, z: HONEY_JAR.z, r: HONEY_JAR.r, top: HONEY_JAR.top },
    { x: PEACH_PLATE.x, z: PEACH_PLATE.z, r: PEACH_PLATE.r * 0.9, top: 5 },
  ];
  return { balls, columns };
}

/** Where the bottoms of things meet the sill. */
function contacts(): Contact[] {
  const out: Contact[] = [
    { x: BASIL_POT.x, z: BASIL_POT.z, r: BASIL_POT.saucer, dark: 0.45 },
    { x: FRUIT_BOWL.x, z: FRUIT_BOWL.z, r: FRUIT_BOWL.r * 0.92, dark: 0.45 },
    { x: WINE_BOTTLE.x, z: WINE_BOTTLE.z, r: WINE_BOTTLE.r, dark: 0.55 },
    { x: PEACH_PLATE.x, z: PEACH_PLATE.z, r: PEACH_PLATE.r * 0.95, dark: 0.35 },
    { x: TEASPOON.x, z: TEASPOON.z, r: TEASPOON.rx, dark: 0.25 },
    { x: HONEY_JAR.x, z: HONEY_JAR.z, r: HONEY_JAR.r, dark: 0.45 },
    // Under the alarm clock's belly, and its feet.
    { x: ALARM_CLOCK.x, z: ALARM_CLOCK.z, r: ALARM_CLOCK.r * 0.7, dark: 0.3 },
    ...[-1, 1].map((side) => ({ x: ALARM_CLOCK.x + side * CLOCK_FOOT, z: ALARM_CLOCK.z, r: 4, dark: 0.45 })),
  ];
  const p = { x: 0, z: 0 };
  for (const t of [0.05, 0.18, 0.32, 0.46, 0.6, 0.74, 0.88, 0.97]) {
    bananaAt(t, p);
    out.push({ x: p.x, z: p.z, r: BANANA.radius(t) * 0.75, dark: 0.32 });
  }
  for (const s of [...byName("crumb"), ...byName("drop"), ...byName("pebble"), ...byName("shell"), ...byName("sea glass")]) {
    const f = s.footprint as { x: number; z: number; r?: number; rx?: number };
    out.push({ x: f.x, z: f.z, r: (f.r ?? f.rx ?? 1) * 0.9, dark: s.name === "drop" ? 0.2 : 0.45 });
  }
  return out;
}

/** A soft-edged blob on a flat place, for puddles: an outline wobbling round a circle. */
function blob(x: number, z: number, r: number, y: number, wobble: number, clamp?: (x: number, z: number) => [number, number]) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const rr = r * (0.94 + Math.sin(a * 3 + wobble) * 0.08 + Math.sin(a * 5 + wobble * 2) * 0.04);
    let px = x + Math.cos(a) * rr;
    let pz = z + Math.sin(a) * rr;
    if (clamp) [px, pz] = clamp(px, pz);
    if (i === 0) shape.moveTo(px, -pz);
    else shape.lineTo(px, -pz);
  }
  return new THREE.ShapeGeometry(shape, 1).rotateX(-Math.PI / 2).translate(0, y, 0);
}

export function buildSill(): SceneSet {
  const group = new THREE.Group();
  const rnd = random(23);
  const { balls, columns } = casters();
  const sunlight = createSunlight(balls, columns);
  const paintM = paintMaterial(sunlight, contacts(), SILL_DECOR.ring, [...byName("crumb"), ...byName("pebble"), ...byName("shell"), ...byName("sea glass")].map((c) => ({ x: c.footprint.x, z: c.footprint.z, r: (c.footprint as { rx: number }).rx, height: topPeak(c.top) })));
  const plaster = plasterMaterial(sunlight);
  const tiles = tileMaterial(sunlight);
  const clay = clayMaterial(sunlight);
  const stone = new THREE.Vector2(PEACH_PLATE.x - 5, PEACH_PLATE.z - 3);
  const fruit = fruitMaterial(sunlight, stone);
  const clock = new WallClock();
  const glaze = glazeMaterial(sunlight, { hands: clock.hands, ...CLOCK_FACES });
  const leaf = leafMaterial(sunlight);
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 1, envMapIntensity: 1.1 });
  sunlit(metal, sunlight, "metal");
  const towel = towelMaterial(sunlight, SILL_DECOR.towel.hx * 2);
  const bottleGlass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false, envMapIntensity: 1.6 });
  const water = waterMaterial();
  const batch = new Batch();
  const add = (m: THREE.Material, g: THREE.BufferGeometry, matrix?: THREE.Matrix4) => batch.add(m, g, matrix);
  const painted = (g: THREE.BufferGeometry, color: THREE.ColorRepresentation, grain: 0 | 1) => add(paintM, tag(paint(g, color), "grain", grain));
  const clayed = (g: THREE.BufferGeometry, color: THREE.ColorRepresentation | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.ColorRepresentation), salt = 0) => add(clay, tag(paint(g, color as THREE.ColorRepresentation), "salt", salt));
  const fruity = (g: THREE.BufferGeometry, color: THREE.ColorRepresentation | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.ColorRepresentation | THREE.Color), skin: number) => add(fruit, tag(paint(g, color as THREE.ColorRepresentation), "skin", skin));
  const glazed = (g: THREE.BufferGeometry, color: THREE.ColorRepresentation | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.ColorRepresentation | THREE.Color), speckle = 1) => add(glaze, tag(paint(g, color as THREE.ColorRepresentation), "speckle", speckle));

  // The sill: a thick painted board with a rounded front edge, and a moulding under it.
  const PAINT = "#efe8d6";
  const sillTop = new THREE.PlaneGeometry(SILL.hx * 2, SILL.hz * 2, 1, 1).rotateX(-Math.PI / 2);
  painted(sillTop, PAINT, 0);
  {
    const r = 9;
    const depth = 34;
    const shape: [number, number][] = [];
    // The front edge's profile (z, y), from the top round to the bottom, and in under the board to the wall.
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      shape.push([SILL.hz - r + Math.sin(a) * r, -r + Math.cos(a) * r]);
    }
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      shape.push([SILL.hz - r + Math.cos(a) * r, -depth + r - Math.sin(a) * r]);
    }
    shape.push([WINDOW.wall, -depth]);
    const nose = new THREE.Shape(shape.map(([z, y]) => new THREE.Vector2(z, y)));
    nose.lineTo(WINDOW.wall, 0);
    // The profile is drawn in (z, y); turned a quarter the other way round y, its x becomes the world's z and it runs along -x.
    const nosing = new THREE.ExtrudeGeometry(nose, { depth: SILL.hx * 2, bevelEnabled: false, curveSegments: 1 }).rotateY(-Math.PI / 2).translate(SILL.hx, 0, 0);
    painted(nosing, PAINT, 0);
    // A cove moulding where the board meets the wall below it, ending in a fillet that stands just proud of the tiles rather than meeting them on the slant.
    const cove: [number, number][] = [[WINDOW.wall, -depth]];
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2) * 0.9;
      cove.push([WINDOW.wall + 15.5 - Math.sin(a) * 14, -depth - 14 + Math.cos(a) * 14]);
    }
    cove.push([WINDOW.wall + 1.5, -depth - 19], [WINDOW.wall, -depth - 19]);
    const coveShape = new THREE.Shape(cove.map(([z, y]) => new THREE.Vector2(z, y)));
    painted(new THREE.ExtrudeGeometry(coveShape, { depth: SILL.hx * 2 - 10, bevelEnabled: false, curveSegments: 1 }).rotateY(-Math.PI / 2).translate(SILL.hx - 5, 0, 0), PAINT, 0);
  }

  // The window: its frame, the rail at the foot of the glass, the mullion where the sashes meet, the glazing bars, and putty along the glass.
  const FRAME = "#ece6d8";
  const back = WINDOW.glass - 40;
  const { rail, jamb, mullion, bar, transom } = WINDOW;
  painted(box(-SILL.hx, SILL.hx, 0, rail.top, back, WINDOW.glass + rail.depth), FRAME, 0);
  for (const side of [-1, 1]) {
    painted(box(side < 0 ? -SILL.hx : SILL.hx - jamb.width, side < 0 ? -SILL.hx + jamb.width : SILL.hx, rail.top, WINDOW.head, back, WINDOW.glass + jamb.depth), FRAME, 1);
  }
  painted(box(-SILL.hx, SILL.hx, FRAME_HEAD, WINDOW.head, back, WINDOW.glass + jamb.depth), FRAME, 0);
  painted(box(-mullion.half, mullion.half, rail.top, FRAME_HEAD, back, WINDOW.glass + mullion.depth), FRAME, 1);
  for (const x of bar.at) painted(box(x - bar.half, x + bar.half, rail.top, FRAME_HEAD, WINDOW.glass - 12, WINDOW.glass + bar.depth), FRAME, 1);
  // Each column of panes, between the jambs, the glazing bars and the mullion: the transom across it, and putty where its panes meet the wood below.
  const panes = [[-SILL.hx + jamb.width, bar.at[0] - bar.half], [bar.at[0] + bar.half, -mullion.half], [mullion.half, bar.at[1] - bar.half], [bar.at[1] + bar.half, SILL.hx - jamb.width]];
  // Putty beds into the rail: its bevel must not add an unfelt step on top.
  const bevel = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(5, 0), new THREE.Vector2(0, 5)]);
  for (const [x0, x1] of panes) {
    painted(box(x0, x1, transom.y - transom.half, transom.y + transom.half, WINDOW.glass - 12, WINDOW.glass + bar.depth), FRAME, 0);
    for (const y of [rail.top, transom.y + transom.half]) painted(new THREE.ExtrudeGeometry(bevel, { depth: x1 - x0, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(x1, y - 5, WINDOW.glass), "#e6e0cf", 0);
  }
  // A brass catch on the mullion.
  {
    const y = 330;
    add(metal, paint(box(-9, 9, y - 22, y + 22, WINDOW.glass + mullion.depth, WINDOW.glass + mullion.depth + 3), "#c9a14a"));
    add(metal, paint(new THREE.CylinderGeometry(3.2, 3.2, 14, 12).rotateX(Math.PI / 2).translate(0, y, WINDOW.glass + mullion.depth + 9), "#c9a14a"));
    add(metal, paint(new THREE.CapsuleGeometry(3, 34, 4, 10).rotateZ(Math.PI / 2 - 0.35).translate(-12, y - 5, WINDOW.glass + mullion.depth + 15), "#d4ad55"));
  }

  // The wall the window is set in: its reveals either side, tiled as the wall round the window is up to the tiles' rounded edge, the soffit over the sill, and the reveals outside the glass.
  const WALL = "#f4ead8";
  for (const side of [-1, 1]) {
    const x = side * SILL.hx;
    const reveal = (y0: number, y1: number) => new THREE.PlaneGeometry(WINDOW.wall - back, y1 - y0).rotateY((-side * Math.PI) / 2).translate(x, (y0 + y1) / 2, (WINDOW.wall + back) / 2);
    add(tiles, paint(reveal(-40, TILE_TOP), "#f7f5ef"));
    add(plaster, paint(reveal(TILE_TOP, WINDOW.head), WALL));
    glazed(new THREE.CylinderGeometry(4, 4, WINDOW.wall - back, 8).rotateX(Math.PI / 2).translate(x, TILE_TOP, (WINDOW.wall + back) / 2), "#f2efe6", 0);
    glazed(new THREE.CylinderGeometry(4, 4, TILE_TOP + 48, 8).translate(x, (TILE_TOP - 48) / 2, WINDOW.wall), "#f2efe6", 0);
    add(plaster, paint(new THREE.PlaneGeometry(back + 420, WINDOW.head + 80).rotateY((-side * Math.PI) / 2).translate(x, WINDOW.head / 2 - 40, (back - 420) / 2), "#e9dcc6"));
  }
  add(plaster, paint(new THREE.PlaneGeometry(SILL.hx * 2, WINDOW.wall + 420).rotateX(Math.PI / 2).translate(0, WINDOW.head, (WINDOW.wall - 420) / 2), "#efe4d0"));
  // Outside, the stone sill under the window.
  add(plaster, paint(box(-SILL.hx - 20, SILL.hx + 20, -70, -40, -440, back), "#cfc7b8"));

  const room = buildRoom({ plaster, tiles, glaze, paint: paintM, metal, leaf });
  for (const [m, g] of room.pieces) add(m, m === leaf ? notLeaf(g) : g);
  for (const object of room.objects) {
    freeze(object);
    group.add(object);
  }

  // The basil in its terracotta pot, standing in a saucer.
  const saucer = one("saucer");
  const pot = one("pot");
  {
    const TERRACOTTA = "#c8714a";
    const profile = topProfile(saucer, BASIL_POT.r - 1, BASIL_POT.saucer, 16);
    profile.reverse();
    clayed(lathe(profile, 64, BASIL_POT.x, BASIL_POT.z), TERRACOTTA, 0.6);
    // The pot: its rim from where the soil meets it, exactly as the world has it, then its rolled lip and its side down to the saucer.
    const top = pot.top as { inner: number; lip: number };
    const rim = topProfile(pot, top.inner * BASIL_POT.r, top.lip * BASIL_POT.r, 10);
    const outside: [number, number][] = [[BASIL_POT.r - 2.4, 95.6], [BASIL_POT.r - 0.6, 94.2], [BASIL_POT.r + 0.8, 92.2], [BASIL_POT.r + 1.4, 89.5], [BASIL_POT.r + 1.4, 81.5], [BASIL_POT.r + 0.6, 80], [BASIL_POT.r - 0.2, 79.6], [BASIL_POT.r - 0.2, 4], [BASIL_POT.r - 0.5, 1.2]];
    const wall = [...rim, ...outside].reverse();
    clayed(lathe(wall, 72, BASIL_POT.x, BASIL_POT.z), (p) => (p.y > 79.5 ? tone("#cf7a52") : TERRACOTTA), 1);
  }

  // The basil: a mound of shoots filling the pot, each tipped with opposite pairs of broad, cupped, glossy leaves, every pair turned a quarter from the last, round a tight bud; two shoots have run up to flower. Its outermost leaves reach the crown the fly lands on (packages/world/src/windowsill.ts) and none stands out of it; inside them the crown is dark foliage, hiding the stems and the soil.
  {
    const crowns = byName("basil");
    const { x: px, z: pz, rim } = BASIL_POT;
    const reach = (crowns[0].footprint as { r: number }).r;
    const brnd = random(5);
    const n = { x: 0, y: 1, z: 0 };
    for (const c of crowns) {
      const f = c.footprint as { x: number; z: number };
      // Deep among the leaves, so that between them the bush looks deep.
      const inner = (c === crowns[0] ? topGeometry(c, 6, 32) : topGeometry(c, 3, 12)).translate(-f.x, -rim, -f.z).scale(0.84, 0.8, 0.84).translate(f.x, rim, f.z);
      add(leaf, notLeaf(paint(inner, (p) => blend("#10260b", "#1f4515", Math.min(1, (p.y - rim) / 60)))));
    }
    /** The crown's top over a point, and the solid it is (for its slope), or the rim's height off it. */
    let under = crowns[0];
    const height = (x: number, z: number) => {
      let y = rim;
      for (const c of crowns) {
        if (!inside(c.footprint, x, z)) continue;
        const h = topHeight(c, x, z);
        if (h > y) {
          y = h;
          under = c;
        }
      }
      return y;
    };
    /** Draws a point back onto the crown (a little proud of it) if it stands out of it, along the line from inside the pot. */
    const hold = (v: THREE.Vector3) => {
      const cy = rim - 10;
      const out = (k: number) => {
        const x = px + (v.x - px) * k;
        const z = pz + (v.z - pz) * k;
        const y = cy + (v.y - cy) * k;
        return Math.hypot(x - px, z - pz) > reach + 1 || y > height(x, z) + 1;
      };
      if (!out(1)) return;
      let lo = 0;
      let hi = 1;
      // To within a hundredth of the way, always on the inside.
      for (let i = 0; i < 7; i++) {
        const m = (lo + hi) / 2;
        if (out(m)) hi = m;
        else lo = m;
      }
      v.set(px + (v.x - px) * lo, cy + (v.y - cy) * lo, pz + (v.z - pz) * lo);
    };
    // Every leaf goes into one geometry, written point by point: made as a geometry each, they took longer to build than all the rest of the sill.
    const leafPoints: number[] = [];
    const leafNormals: number[] = [];
    const leafColors: number[] = [];
    const leafVeins: number[] = [];
    const grid: THREE.Vector3[] = Array.from({ length: 40 }, () => new THREE.Vector3());
    const gridNormals: THREE.Vector3[] = Array.from({ length: 40 }, () => new THREE.Vector3());
    const top = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    /** A basil leaf `length` long, placed by `matrix`: broad, ovate to a point, domed over its midrib with its edges curled under, its tip dipping by `droop`; `vein` says where each point is on it. Held to the crown unless it is a flowering tip's bract, within the tip's own column. */
    const basilLeaf = (length: number, droop: number, matrix: THREE.Matrix4, color: THREE.Color, held: boolean) => {
      // Small leaves need fewer points to be as smooth.
      const nu = length > 12 ? 8 : 4;
      const nw = length > 12 ? 5 : 3;
      const at = (i: number, j: number) => grid[i * nw + j];
      for (let i = 0; i < nu; i++) {
        const u = i / (nu - 1);
        const half = length * 0.36 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.85) * (1 - 0.15 * u) + length * 0.015;
        for (let j = 0; j < nw; j++) {
          const w = (j / (nw - 1)) * 2 - 1;
          const y = -droop * u * u - Math.pow(Math.abs(w), 2.2) * half * 0.45 + Math.sin(Math.PI * u) * length * 0.05;
          const v = at(i, j).set(u * length, y, w * half).applyMatrix4(matrix);
          if (held) hold(v);
        }
      }
      // Each point's normal from its neighbours along and across, turned to the leaf's upper side.
      top.set(0, 1, 0).transformDirection(matrix);
      for (let i = 0; i < nu; i++) {
        for (let j = 0; j < nw; j++) {
          e1.subVectors(at(Math.min(i + 1, nu - 1), j), at(Math.max(i - 1, 0), j));
          e2.subVectors(at(i, Math.min(j + 1, nw - 1)), at(i, Math.max(j - 1, 0)));
          const n = gridNormals[i * nw + j].crossVectors(e1, e2).normalize();
          if (n.dot(top) < 0) n.negate();
        }
      }
      // Wound so that its front faces the way its normals do.
      e1.subVectors(at(1, 0), at(0, 0));
      e2.subVectors(at(1, 1), at(0, 0));
      const flip = e1.cross(e2).dot(gridNormals[nw]) < 0;
      const corner = (i: number, j: number) => {
        at(i, j).toArray(leafPoints, leafPoints.length);
        gridNormals[i * nw + j].toArray(leafNormals, leafNormals.length);
        leafColors.push(color.r, color.g, color.b);
        leafVeins.push(i / (nu - 1), (j / (nw - 1)) * 2 - 1);
      };
      for (let i = 0; i < nu - 1; i++) {
        for (let j = 0; j < nw - 1; j++) {
          for (const [a, b] of flip ? [[i, j], [i + 1, j + 1], [i + 1, j], [i, j], [i, j + 1], [i + 1, j + 1]] : [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]) corner(a, b);
        }
      }
    };
    const X = new THREE.Vector3();
    const Y = new THREE.Vector3();
    const Z = new THREE.Vector3();
    /** A leaf from `node`, out along `dir` in the plane square to `normal`, raised `rise` toward it. */
    const leafAt = (node: THREE.Vector3, normal: THREE.Vector3, dir: THREE.Vector3, rise: number, length: number, droop: number, color: THREE.Color, held = true) => {
      X.copy(dir).multiplyScalar(Math.cos(rise)).addScaledVector(normal, Math.sin(rise)).normalize();
      Y.copy(normal).addScaledVector(X, -X.dot(normal)).normalize();
      Z.crossVectors(X, Y);
      basilLeaf(length, droop, new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(node), color, held);
    };
    const stem = (a: THREE.Vector3, b: THREE.Vector3, r: number) => add(leaf, notLeaf(paint(rod(a, b, r, 4), "#5e9a34")));
    // Older leaves low on each shoot, big, held out level with their tips drooping; the next pair a quarter round, smaller and held up; the bud.
    const PAIRS = [
      { depth: 20, length: 46, rise: 0.12, droop: 9, color: "#2c8422" },
      { depth: 11, length: 36, rise: 0.22, droop: 6, color: "#389a2a" },
      { depth: 4, length: 21, rise: 0.5, droop: 2.5, color: "#56b43a" },
      { depth: 0.5, length: 10, rise: 1.0, droop: 0.4, color: "#7fcf52" },
    ];
    // A shoot on the crest of each clump, where a fly lands, and the rest spread evenly over the crown from its top down its sides to the rim.
    const SHOOTS = 18;
    const shoots = crowns.slice(1).map((c) => ({ x: c.footprint.x + 1, z: c.footprint.z + 1 }));
    for (let i = 0; i < SHOOTS; i++) {
      const polar = Math.acos(1 - ((i + 0.5) / SHOOTS) * 0.86);
      const a = i * 2.39996 + brnd.range(-0.2, 0.2);
      const s = Math.min(0.95, Math.sin(polar));
      shoots.push({ x: px + Math.cos(a) * s * reach, z: pz + Math.sin(a) * s * reach });
    }
    for (const at of shoots) {
      const a = Math.atan2(at.z - pz, at.x - px);
      const tip = new THREE.Vector3(at.x, height(at.x, at.z), at.z);
      topNormal(under, tip.x, tip.z, n);
      // Shoots grow up, leaning out a little as the crown does.
      const normal = new THREE.Vector3(n.x, n.y, n.z).lerp(new THREE.Vector3(0, 1, 0), 0.7).normalize();
      const radial = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const outward = radial.addScaledVector(normal, -radial.dot(normal)).normalize();
      const across = new THREE.Vector3().crossVectors(normal, outward);
      const turn = brnd.range(0, Math.PI);
      const size = brnd.range(0.88, 1.1);
      stem(tip.clone().addScaledVector(normal, -22), tip.clone().addScaledVector(normal, -1), 1.4);
      PAIRS.forEach((pair, k) => {
        const node = tip.clone().addScaledVector(normal, -pair.depth);
        const angle = turn + (k % 2) * (Math.PI / 2);
        const tint = tone(k < 2 && brnd.next() < 0.3 ? "#45a630" : pair.color).clone().multiplyScalar(brnd.range(0.9, 1.06));
        for (const side of [-1, 1]) {
          const dir = outward.clone().multiplyScalar(Math.cos(angle) * side).addScaledVector(across, Math.sin(angle) * side);
          leafAt(node, normal, dir, pair.rise + brnd.range(-0.12, 0.12), pair.length * size, pair.droop * size, tint);
        }
      });
    }
    // The flowering tips: a square stem up out of the leaves, and up it whorls of little white flowers over pairs of small bracts, closer and smaller to the green buds at the top.
    const up = new THREE.Vector3(0, 1, 0);
    const petal = new THREE.OctahedronGeometry(1, 0).attributes.position;
    const flowers: number[] = [];
    const flowerColors: number[] = [];
    const fm = new THREE.Matrix4();
    const fp = new THREE.Vector3();
    for (const tipSolid of byName("basil tip")) {
      const f = tipSolid.footprint as { x: number; z: number; r: number };
      const crest = topPeak(tipSolid.top);
      const base = height(f.x, f.z);
      stem(new THREE.Vector3(f.x, base - 16, f.z), new THREE.Vector3(f.x, crest - 2.5, f.z), 1.3);
      const tiers = 4;
      for (let t = 0; t < tiers; t++) {
        const k = t / (tiers - 1);
        const y = base + 4 + (crest - 6 - base) * Math.pow(k, 0.8);
        const spread = (f.r - 1.2) * (1 - k * 0.45);
        const bract = new THREE.Vector3(Math.cos(t * 1.57), 0, Math.sin(t * 1.57));
        for (const side of [-1, 1]) leafAt(new THREE.Vector3(f.x, y - 1, f.z), up, bract.clone().multiplyScalar(side), 0.35, spread + 1, 0.5, tone("#4c9a30"), false);
        const bud = t === tiers - 1;
        const color = tone(bud ? "#a8d47c" : "#f7f4ef");
        for (let j = 0; j < 5; j++) {
          const fa = (j / 5) * Math.PI * 2 + t * 0.7;
          fm.makeRotationY(-fa).multiply(new THREE.Matrix4().makeRotationZ(0.6)).scale(fp.set(0.9, bud ? 1.1 : 1.7, 0.9)).setPosition(f.x + Math.cos(fa) * spread * 0.62, y + 1, f.z + Math.sin(fa) * spread * 0.62);
          for (let q = 0; q < petal.count; q++) {
            fp.fromBufferAttribute(petal, q).applyMatrix4(fm).toArray(flowers, flowers.length);
            flowerColors.push(color.r, color.g, color.b);
          }
        }
      }
    }
    const blossom = new THREE.BufferGeometry();
    blossom.setAttribute("position", new THREE.Float32BufferAttribute(flowers, 3));
    blossom.computeVertexNormals();
    blossom.setAttribute("color", new THREE.Float32BufferAttribute(flowerColors, 3));
    add(leaf, notLeaf(blossom));
    const leaves = new THREE.BufferGeometry();
    leaves.setAttribute("position", new THREE.Float32BufferAttribute(leafPoints, 3));
    leaves.setAttribute("normal", new THREE.Float32BufferAttribute(leafNormals, 3));
    leaves.setAttribute("color", new THREE.Float32BufferAttribute(leafColors, 3));
    leaves.setAttribute("vein", new THREE.Float32BufferAttribute(leafVeins, 2));
    add(leaf, leaves);
  }

  // The fruit bowl: speckled stoneware, its glaze teal inside and oatmeal outside, thin and toasted brown at the rim.
  const bowl = one("bowl");
  {
    const profile = topProfile(bowl, 0, FRUIT_BOWL.r, 34);
    profile.reverse();
    const top = bowl.top as { inner: number; lip: number };
    const geometry = paint(lathe(profile, 60, FRUIT_BOWL.x, FRUIT_BOWL.z), (p) => {
      const s = Math.hypot(p.x - FRUIT_BOWL.x, p.z - FRUIT_BOWL.z) / FRUIT_BOWL.r;
      // A bare clay foot where it stands; a cobalt band round its rim.
      if (s > 0.975) return tone("#b89a78");
      if (Math.abs(s - top.lip) < 0.03) return tone("#2c4f96");
      return s < top.lip ? blend("#f3ead6", "#e8dcc0", Math.max(0, 1 - (p.y - 6) / 10) * 0.6) : tone("#f1e6cf");
    });
    // Sponged blue outside; inside, where the fruit lies, plain glaze with the clay's specks.
    const pos = geometry.attributes.position;
    const speckle = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) speckle[i] = Math.hypot(pos.getX(i) - FRUIT_BOWL.x, pos.getZ(i) - FRUIT_BOWL.z) / FRUIT_BOWL.r > top.lip - 0.04 ? 2 : 1;
    geometry.setAttribute("speckle", new THREE.BufferAttribute(speckle, 1));
    add(glaze, geometry);
  }
  // A peach and two plums in it.
  {
    const peach = one("peach").footprint as { x: number; z: number; r: number };
    const peachY = (one("peach").top as { base: number }).base;
    const sunSide = new THREE.Vector3(0.3, 0.55, -0.78).normalize();
    fruity(new THREE.SphereGeometry(peach.r, 34, 22).translate(peach.x, peachY, peach.z), (p, n) => {
      // Blushed deep red on the side that faced the sun, mottling into gold; the crease down one side.
      const mottle = Math.sin(p.x * 0.31 + p.y * 0.17) * Math.sin(p.z * 0.27 - p.y * 0.21) * 0.25;
      const blush = THREE.MathUtils.smoothstep(n.dot(sunSide) + mottle, -0.55, 0.45);
      const crease = Math.max(0, 1 - Math.abs(Math.atan2(p.z - peach.z, p.x - peach.x) - 0.6) / 0.06) * Math.max(0, n.y + 0.3);
      return blend("#f7b445", "#b8242a", blush * 0.92).multiplyScalar(1 - crease * 0.25);
    }, 2);
    fruity(new THREE.CylinderGeometry(1.2, 1.6, 6, 6).rotateZ(0.4).translate(peach.x + 1, peachY + peach.r + 1.5, peach.z), "#6b4a2a", 0);
    for (const plum of byName("plum")) {
      const f = plum.footprint as { x: number; z: number; r: number };
      const y = (plum.top as { base: number }).base;
      fruity(new THREE.SphereGeometry(f.r, 26, 16).scale(1, 1, 0.96).translate(f.x, y, f.z), (_p, n) => blend("#3a1240", "#6a2a5c", Math.max(0, n.y) * 0.5), 3);
      fruity(new THREE.CylinderGeometry(0.5, 0.7, 4, 5).rotateX(0.3).translate(f.x, y + f.r - 2.2, f.z), "#5a4a2a", 0);
    }
    // Plum juice run into the bowl from a split.
    const juice = patch("plum juice");
    fruity(blob(juice.x, juice.z, juice.r, topHeight(bowl, juice.x, juice.z) + 0.12, 2), "#5a0e2e", 0);
  }

  // The alarm clock: a drum of red enamel on two chrome feet, its back domed, its front rolled in to a chrome bezel round the dial (clocks.ts draws the hands), two bells on top and the hammer between them.
  {
    const { x, y, z, r, depth, bells, hammer } = ALARM_CLOCK;
    const RED = "#c63a2b";
    const CHROME = "#e2e5ea";
    const front = z + depth / 2;
    const back = z - depth / 2;
    const shell = (top: number) => y + Math.sqrt(Math.max(0, r * r - top * top));
    // Turned about the clock's axis (z), from `at` along it: a lathe's profile is [radius, along].
    const turned = (profile: [number, number][], at: number, segments = 44) => lathe(profile, segments, 0, 0).rotateX(Math.PI / 2).translate(x, y, at);
    glazed(new THREE.CylinderGeometry(r, r, depth, 64, 1, true).rotateX(Math.PI / 2).translate(x, y, z), RED, 0);
    glazed(turned([[r, 0], [r - 0.6, 1.4], [r - 2.2, 2.4], [r - 4.5, 2.6]], front), RED, 0);
    glazed(lathe([[r - 0.6, 0], [r - 3, 1], [r * 0.55, 2.6], [0, 3.2]], 40, 0, 0).rotateX(-Math.PI / 2).translate(x, y, back), RED, 0);
    add(metal, paint(new THREE.TorusGeometry(r - 0.2, 1.1, 3, 40).translate(x, y, back), CHROME));
    add(metal, paint(turned([[r - 4.3, 2.4], [r - 4.6, 4], [r - 5.6, 4.9], [r - 7.2, 4.6], [r - 8.2, 3.5], [r - 8.6, 1.6]], front), CHROME));
    glazed(new THREE.CircleGeometry(ALARM_DIAL.radius + 0.4, 48).translate(x, y, ALARM_DIAL.centre.z), "#f5eedb", 0);
    for (const side of [-1, 1]) {
      const sx = x + side * CLOCK_FOOT;
      add(metal, paint(rod(new THREE.Vector3(x + side * 14, y - 33, z), new THREE.Vector3(sx, 3, z), 2.2), CHROME));
      add(metal, paint(new THREE.SphereGeometry(1, 8, 5).scale(3.6, 2.6, 7).translate(sx, 2.3, z), CHROME));
      const bell = byName("bell").find((b) => Math.sign(b.footprint.x - x) === side)!;
      const bx = x + side * bells.x;
      add(metal, paint(topGeometry(bell, 5, 24), CHROME));
      add(metal, paint(new THREE.TorusGeometry(bells.r - 0.6, 0.8, 3, 24).rotateX(Math.PI / 2).translate(bx, bells.base + 0.4, z), CHROME));
      add(metal, paint(new THREE.CircleGeometry(bells.r - 0.8, 24).rotateX(Math.PI / 2).translate(bx, bells.base + 1.2, z), "#5c6066"));
      add(metal, paint(rod(new THREE.Vector3(bx, shell(bells.x) - 1, z), new THREE.Vector3(bx, bells.base + 2, z), 1.6), CHROME));
    }
    add(metal, paint(rod(new THREE.Vector3(x, shell(0) - 1, z), new THREE.Vector3(x, hammer.base, z), 1.1), CHROME));
    add(metal, paint(new THREE.SphereGeometry(hammer.r, 8, 6).translate(x, hammer.base, z), CHROME));
  }

  // The banana: ripe past yellow, freckled, its tip black and its stalk green-brown.
  add(fruit, tag(bananaGeometry(), "skin", 1));

  // The bottle of wine: green glass, the wine dark inside it, a cream label, a cork. Its glass and the honey jar's are one draw.
  const glassBatch = new Batch();
  {
    const { x, z, r, shoulder, neck, top } = WINE_BOTTLE;
    const glassProfile: [number, number][] = [[0, 2], [r - 6, 2], [r - 1, 0.5], [r, 4], [r, shoulder]];
    for (let i = 1; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      glassProfile.push([neck + (r - neck) * Math.cos(a), shoulder + Math.sin(a) * 28]);
    }
    glassProfile.push([neck, top - 22], [neck + 1.6, top - 20], [neck + 1.6, top - 12], [neck, top - 10]);
    glassBatch.add(bottleGlass, paint(lathe(glassProfile, 48, x, z), (p) => (p.y > top - 22 ? tone("#2e5a2a") : tone("#2f6b34"))));
    fruity(lathe([[0, 3], [r - 2, 3], [r - 2, 95], [0, 95]], 40, x, z), "#2a0710", 0);
    // The label, facing the room: cream paper, a claret band along its top, gilt rules, and a crest.
    add(plaster, paint(new THREE.CylinderGeometry(r + 0.4, r + 0.4, 84, 48, 24, true, -1.2, 2.4).translate(x, 112, z), (p) => {
      const across = Math.atan2(p.x - x, p.z - z);
      if (p.y > 141) return tone("#6e1424");
      if (Math.abs(p.y - 138) < 1.1 || Math.abs(p.y - 76) < 1.1) return tone("#b8913a");
      if (Math.hypot(across * 30, p.y - 116) < 12) return Math.hypot(across * 30, p.y - 116) > 10 ? tone("#b8913a") : tone("#7a1a2a");
      if (Math.abs(across) < 0.55 && (Math.abs(p.y - 96) < 1.4 || Math.abs(p.y - 89) < 0.9)) return tone("#4a3a34");
      return tone("#f2ead6");
    }));
    clayed(new THREE.CylinderGeometry(neck - 2.6, neck - 2.6, 22, 16).translate(x, top - 11, z), "#c79a64", 0);
  }

  // The jar of honey, full: the honey glowing through the glass with the light through it, clear glass at its shoulder, a gold lid, a paper label.
  {
    const { x, z, r, top } = HONEY_JAR;
    const lid = top - 9;
    fruity(lathe([[0, 0], [r - 2.5, 0], [r - 0.3, 1.2], [r, 4], [r, lid - 7], [r - 1, lid - 6], [0, lid - 6]], 36, x, z), "#d0861a", 7);
    glassBatch.add(bottleGlass, paint(lathe([[r, lid - 7.5], [r, lid - 6], [r - 2.4, lid - 3], [r - 3.4, lid - 1]], 36, x, z), "#d9e0d8"));
    add(metal, paint(lathe([[r - 3.6, lid - 1], [r - 0.2, lid], [r, lid + 1], [r, top - 1], [r - 0.2, top], [0, top]], 36, x, z), "#d0a64e"));
    add(plaster, paint(new THREE.CylinderGeometry(r + 0.15, r + 0.15, 24, 36, 12, true, -2.4, 2.4).translate(x, 26, z), (p) => (Math.abs(p.y - 26) > 9.5 ? tone("#8a5a22") : tone("#f2e6c8"))));
  }
  const [glassMesh] = glassBatch.build(group);
  glassMesh.renderOrder = 4;

  // The postcard, propped at the end of the sill against the wall of the window's opening: card, its picture painted on its face (surfaces.ts).
  {
    const { foot, z, width, length } = POSTCARD;
    const lean = Math.asin(foot / length);
    add(plaster, paint(new THREE.BoxGeometry(0.4, length, width).translate(0, length / 2, 0).rotateZ(-lean).translate(SILL.hx - foot + 0.2, 0, z), "#f6f2e6"));
  }

  // Half a peach, cut face up on a small plate, its stone in it.
  const plate = one("plate");
  {
    const profile = topProfile(plate, 0, PEACH_PLATE.r, 22);
    profile.reverse();
    const top = plate.top as { lip: number };
    glazed(lathe(profile, 52, PEACH_PLATE.x, PEACH_PLATE.z), (p) => {
      const s = Math.hypot(p.x - PEACH_PLATE.x, p.z - PEACH_PLATE.z) / PEACH_PLATE.r;
      return Math.abs(s - top.lip - 0.05) < 0.012 ? tone("#2a4f9a") : tone("#f6f2ea");
    }, 0.5);
    const half = one("peach half");
    const hf = half.footprint as { x: number; z: number; r: number };
    const face = 0.62;
    // The cut face: red and fibrous round the stone, then golden flesh out to a pale rim under the skin.
    fruity(topGeometry(half, 8, 48, 0, face), (p) => {
      const d = Math.hypot(p.x - hf.x, p.z - hf.z) / (hf.r * face);
      if (d < 0.45) return blend("#b52c1c", "#f39a3a", Math.pow(d / 0.45, 1.4));
      return blend("#ffb636", "#ffd774", (d - 0.45) / 0.55);
    }, 4);
    // Its skin, rounding down to the plate: velvety, blushed red over gold.
    fruity(topGeometry(half, 12, 48, face, 1), (p, n) => {
      if (Math.hypot(p.x - hf.x, p.z - hf.z) < hf.r * (face + 0.04)) return tone("#ffd27a");
      return blend("#f0a03a", "#c4321f", Math.min(1, 0.35 + Math.max(0, n.z * 0.4 - n.x * 0.5)));
    }, 2);
    fruity(topGeometry(one("stone"), 8, 32), "#8a4a2c", 5);
  }

  // The teaspoon, on its back: its bowl shaped exactly as the world has it, honey in it, and its handle.
  {
    const spoon = one("spoon");
    add(metal, paint(topGeometry(spoon, 16, 48), "#c9ced4"));
    const axis = { x: Math.sin(TEASPOON.angle), z: Math.cos(TEASPOON.angle) };
    const shape = new THREE.Shape();
    const L = TEASPOON.handle;
    const half = (s: number) => (s < 0.2 ? 1.6 + s * 4 : 2.4 + (s - 0.2) * 1.0);
    shape.moveTo(0, -half(0));
    for (let i = 1; i <= 20; i++) shape.lineTo((i / 20) * L, -half(i / 20));
    shape.absarc(L, 0, half(1), -Math.PI / 2, Math.PI / 2, false);
    for (let i = 20; i >= 0; i--) shape.lineTo((i / 20) * L, half(i / 20));
    const handle = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.15, bevelSegments: 1 }).rotateX(Math.PI / 2).translate(0, 0.7, 0);
    const turn = Math.atan2(-axis.z, axis.x);
    add(metal, paint(handle, "#c9ced4"), mat4({ x: TEASPOON.x + axis.x * (TEASPOON.rz - 2), y: 0, z: TEASPOON.z + axis.z * (TEASPOON.rz - 2) }, new THREE.Euler(0, turn, 0)));
    const honey = patch("honey");
    const well = (spoon.top as { well: number }).well;
    fruity(blob(honey.x, honey.z, 4.6, well + 0.25, 1), "#e08a10", 0);
  }

  // Crumbs of toast at the fly's scale, and specks of it too small to feel underfoot (SILL_DECOR.crumbs), each a little different, resting on the sill: golden, toasted darker in patches, paler where the crumb is open.
  {
    const toastColor = (p: THREE.Vector3) => {
      const speck = Math.sin(p.x * 13.1 + p.z * 7.7) * Math.sin(p.z * 11.3 - p.x * 5.1 + p.y * 9);
      return speck > 0.5 ? tone("#9a5520") : speck < -0.65 ? tone("#f0d293") : p.y > 0.7 ? tone("#dcaa62") : tone("#c08440");
    };
    for (const crumb of byName("crumb")) fruity(topGeometry(crumb, 6, 18), toastColor, 6);
    // The specks are written straight into one geometry, each a lumpy twenty-faced chip flat underneath.
    const ico = new THREE.IcosahedronGeometry(1, 0).attributes.position;
    const points: number[] = [];
    const v = new THREE.Vector3();
    const m = new THREE.Matrix4();
    for (const cluster of SILL_DECOR.crumbs) {
      for (let i = 0; i < cluster.count; i++) {
        const a = rnd.range(0, Math.PI * 2);
        const r = Math.sqrt(rnd.next()) * cluster.r;
        const size = rnd.range(0.12, 0.42) * (r < cluster.r * 0.4 ? 1.25 : 1);
        m.compose(v.set(cluster.x + Math.cos(a) * r, 0, cluster.z + Math.sin(a) * r), new THREE.Quaternion().setFromAxisAngle(UP, rnd.range(0, 6.3)), new THREE.Vector3(size, size, size * rnd.range(0.7, 1.3)));
        for (let k = 0; k < ico.count; k++) {
          const j = 0.75 + 0.5 * Math.abs(Math.sin(ico.getX(k) * 5.3 + ico.getZ(k) * 3.1 + i));
          v.set(ico.getX(k) * j, Math.max(-0.1, ico.getY(k)) * j * 0.7, ico.getZ(k) * j).applyMatrix4(m).toArray(points, points.length);
        }
      }
    }
    const specks = new THREE.BufferGeometry();
    specks.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    specks.computeVertexNormals();
    fruity(specks, toastColor, 6);
  }

  // Beach finds, smooth and dry: pebbles (grey granite with a band of white quartz across it, a white one, dark slate), shells (cockles, ribbed and banded, and a whelk, its whorls striped), and a piece of green sea glass, frosted, that glows with the light through it.
  {
    const along = (f: { x: number; z: number; angle: number }, p: THREE.Vector3) => (p.x - f.x) * Math.cos(f.angle) - (p.z - f.z) * Math.sin(f.angle);
    const pebbles: ((p: THREE.Vector3, f: { x: number; z: number; angle: number }) => THREE.Color)[] = [
      (p, f) => (Math.abs(along(f, p) * 0.6 + 1.2) < 1.4 ? tone("#f0eee6") : tone("#8e8a83")),
      () => tone("#e4dfd3"),
      () => tone("#5c6269"),
      () => tone("#9a948a"),
    ];
    byName("pebble").forEach((pebble, i) => {
      const f = pebble.footprint as { x: number; z: number; angle: number };
      clayed(topGeometry(pebble, 4, 20), (p) => pebbles[i % pebbles.length](p, f), 0);
    });
    byName("shell").forEach((shell, i) => {
      const f = shell.footprint as { x: number; z: number; angle: number };
      const whelk = i === 0;
      glazed(topGeometry(shell, 4, 36), (p) => {
        const a = Math.atan2(p.z - f.z, p.x - f.x);
        const r = Math.hypot(p.x - f.x, p.z - f.z);
        if (whelk) return Math.sin(a + r * 1.3) > 0.3 ? tone("#8a5a3a") : tone("#e8dcc6");
        const rib = Math.cos(a * 18) > 0.2;
        return Math.sin(r * 1.6) > 0.55 ? tone(i % 2 ? "#d9846a" : "#c3895a") : rib ? tone("#efe1c8") : tone("#dcc4a2");
      }, 0);
    });
    for (const glass of byName("sea glass")) fruity(topGeometry(glass, 4, 20), "#7fb89a", 7);
  }

  // The tea towel, folded on the sill, its end hanging over the front edge.
  {
    const { towel: t } = SILL_DECOR;
    const width = t.hx * 2;
    const z0 = t.z - t.hz;
    const flat = SILL.hz - 9 - z0;
    const path: { y: number; z: number; v: number }[] = [];
    let v = 0;
    let last: { y: number; z: number } | null = null;
    const step = (y: number, z: number) => {
      if (last) v += Math.hypot(y - last.y, z - last.z);
      path.push({ y, z, v });
      last = { y, z };
    };
    for (let i = 0; i <= 10; i++) step(0.12, z0 + (flat * i) / 10);
    for (let i = 1; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      step(-9 + Math.cos(a) * 9.4, SILL.hz - 9 + Math.sin(a) * 9.4);
    }
    for (let i = 1; i <= 10; i++) step(-9 - i * 8.5, SILL.hz + 0.4 + i * 0.25);
    const positions: number[] = [];
    const uvs: number[] = [];
    const across = 16;
    for (let i = 0; i < path.length - 1; i++) {
      for (let j = 0; j < across; j++) {
        const quad = [[i, j], [i, j + 1], [i + 1, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]];
        for (const [a, b] of quad) {
          const u = (b / across) * width;
          const hang = Math.max(0, -path[a].y - 9) / 85;
          const fold = Math.sin((u / width) * Math.PI * 3) * 2.2 * hang;
          positions.push(t.x - t.hx + u, path[a].y, path[a].z + fold);
          uvs.push(u, path[a].v);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, towel);
    towel.polygonOffset = true;
    towel.polygonOffsetFactor = -1;
    towel.polygonOffsetUnits = -1;
    freeze(mesh);
    group.add(mesh);
  }

  // A fallen basil leaf, dried flat.
  {
    const { leaf: dry } = SILL_DECOR;
    const shape = new THREE.Shape();
    shape.moveTo(0, -dry.length / 2);
    shape.quadraticCurveTo(dry.length * 0.36, 0, 0, dry.length / 2);
    shape.quadraticCurveTo(-dry.length * 0.36, 0, 0, -dry.length / 2);
    const g = paint(new THREE.ShapeGeometry(shape, 10), "#7a7a3e");
    const pos = g.attributes.position;
    const vein = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getY(i) / dry.length + 0.5;
      vein[i * 2] = u;
      vein[i * 2 + 1] = pos.getX(i) / Math.max(1e-3, 0.72 * dry.length * u * (1 - u));
    }
    g.setAttribute("vein", new THREE.BufferAttribute(vein, 2));
    add(leaf, g.rotateX(-Math.PI / 2), mat4({ x: dry.x, y: 0.1, z: dry.z }, new THREE.Euler(0, dry.angle, 0)));
  }

  // The pools: wine run down the bottle onto the sill, and water standing in the basil's saucer. Rings spread on them from drips and the fly's feet.
  const wine = patch("wine");
  const waterPatch = patch("water");
  const ripples = new Float32Array(RIPPLES * 4).fill(-100);
  const poolUniforms = { uRipples: { value: ripples } };
  {
    const poolMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.03, transparent: true, opacity: 0.86, envMapIntensity: 2, depthWrite: false });
    sunlit(poolMaterial, sunlight, "pool", {
      extra: (shader) => {
        Object.assign(shader.uniforms, poolUniforms);
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\nuniform vec4 uRipples[${RIPPLES}];`).replace(
          "#include <normal_fragment_maps>",
          /* glsl */ `#include <normal_fragment_maps>
{
  // Rings spreading from each disturbance at 6 mm/s, a millimetre apart, dying away.
  vec2 slope = vec2(0.0);
  float shade = 0.0;
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (age < 0.0 || age > 4.0) continue;
    vec2 d = vWorld.xz - r.xy;
    float dist = length(d) + 1e-4;
    float behind = age * 6.0 - dist;
    if (behind < 0.0) continue;
    float fade = exp(-behind * 0.5) * exp(-age * 0.8) * r.w * smoothstep(0.0, 0.5, behind);
    slope += d / dist * sin(behind * 6.0) * fade * 0.6;
    shade += cos(behind * 6.0) * fade;
  }
  diffuseColor.rgb *= 1.0 + shade * 0.22;
  normal = normalize((viewMatrix * vec4(normalize(vec3(-slope.x, 1.0, -slope.y)), 0.0)).xyz);
}`,
        );
      },
    });
    const wineGeometry = paint(blob(wine.x, wine.z, wine.r, 0.08, 4), "#4a0618");
    const sf = saucer.footprint as { x: number; z: number; r: number };
    const sTop = saucer.top as { well: number; inner: number };
    const inMoat = (x: number, z: number): [number, number] => {
      const dx = x - sf.x;
      const dz = z - sf.z;
      const d = Math.hypot(dx, dz);
      const k = Math.min(sTop.inner * sf.r - 0.3, Math.max(BASIL_POT.r + 0.3, d)) / d;
      return [sf.x + dx * k, sf.z + dz * k];
    };
    const waterGeometry = paint(blob(waterPatch.x, waterPatch.z, 3.4, sTop.well + 0.06, 1, inMoat), "#9fb8b0");
    const merged = new Batch();
    merged.add(poolMaterial, wineGeometry);
    merged.add(poolMaterial, waterGeometry);
    const [poolMesh] = merged.build(group);
    poolMesh.renderOrder = 2;
  }
  let nextRipple = 0;
  let nextDrip = 3;
  const ripple = (x: number, z: number, strength: number) => {
    ripples.set([x, z, sunlight.uTime.value, strength], nextRipple * 4);
    nextRipple = (nextRipple + 1) % RIPPLES;
  };

  // Drops of water on the sill, and beads of condensation on the glass.
  {
    const drops: THREE.Matrix4[] = [];
    for (const drop of byName("drop")) {
      const f = drop.footprint as { x: number; z: number; r: number };
      drops.push(mat4({ x: f.x, y: 0, z: f.z }, new THREE.Euler(), { x: f.r, y: (drop.top as { height: number }).height, z: f.r }));
    }
    const face = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
    for (const [x0, x1] of panes) {
      for (let i = 0; i < 34; i++) {
        const y = rail.top + 4 + Math.pow(rnd.next(), 2.6) * 110;
        const r = rnd.range(0.35, 1.3) * (1 - (y - rail.top) / 180);
        drops.push(new THREE.Matrix4().compose(new THREE.Vector3(rnd.range(x0 + 3, x1 - 3), y, WINDOW.glass + 0.05), face, new THREE.Vector3(r, r * 0.55, r * 1.15)));
      }
    }
    const dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 9, 3, 0, Math.PI * 2, 0, Math.PI / 2), water, drops.length);
    drops.forEach((m, i) => dropMesh.setMatrixAt(i, m));
    dropMesh.computeBoundingSphere();
    dropMesh.renderOrder = 5;
    freeze(dropMesh);
    group.add(dropMesh);
  }

  // Grains of spilt sugar, too small to feel.
  {
    const bits: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const sugar = patch("spilt sugar");
    for (let i = 0; i < 50; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const r = Math.sqrt(rnd.next()) * sugar.r * 1.3;
      const size = rnd.range(0.18, 0.28);
      bits.push({ m: mat4({ x: sugar.x + Math.cos(a) * r, y: size * 0.7, z: sugar.z + Math.sin(a) * r }, new THREE.Euler(rnd.range(0, 3), rnd.range(0, 3), rnd.range(0, 3)), { x: size, y: size, z: size }), c: new THREE.Color("#ffffff") });
    }
    const bitMaterial = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0, envMapIntensity: 0.4 });
    sunlit(bitMaterial, sunlight, "bits");
    const bitMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), bitMaterial, bits.length);
    bits.forEach((b, i) => {
      bitMesh.setMatrixAt(i, b.m);
      bitMesh.setColorAt(i, b.c);
    });
    bitMesh.computeBoundingSphere();
    freeze(bitMesh);
    group.add(bitMesh);
  }

  // The window's glass.
  const glazing = windowGlass();
  {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(SILL.hx * 2 - jamb.width * 2, FRAME_HEAD - rail.top).translate(0, (FRAME_HEAD + rail.top) / 2, WINDOW.glass), glazing.material);
    glass.renderOrder = 3;
    freeze(glass);
    group.add(glass);
  }

  batch.build(group);
  const eyes = buildSeen(sunlight, { sill: PAINT, frame: FRAME, wall: WALL });
  freeze(eyes.mesh);
  group.add(eyes.mesh);
  const materials = [paintM, plaster, tiles, clay, fruit, glaze, leaf, metal, towel, bottleGlass, water, eyes.material];
  let mist = 0;
  let lastTime = 0;
  return {
    group,
    materials,
    seen: [eyes.mesh],
    update(time: number, light: Daylight, weather: Weather) {
      sunlight.uSun.value = light.sunDirection;
      sunlight.uTime.value = time;
      // The "sun" is the lamp once it comes from the room rather than through the window.
      const inRoom = Math.min(1, Math.max(0, light.sunDirection.z * 4 + 0.2));
      // The lamp goes on as it gets dark.
      const lamp = Math.max(inRoom, Math.min(1, Math.max(0, (light.stars - 0.15) / 0.5)));
      sunlight.uLamp.value = lamp;
      // Under cloud the window's light is the sky's, not the sun's: its shadows go soft.
      sunlight.uSoft.value = weather.cloud * (1 - inRoom);
      sunlight.uRoom.value.copy(light.skyColor).multiplyScalar(light.hemiIntensity * 0.45).lerp(LAMPLIT, lamp * 0.5);
      sunlight.uBounce.value.copy(light.sunColor).multiplyScalar(light.sunIntensity * 0.16 * (1 - inRoom)).multiply(BOUNCE);
      const u = glazing.uniforms;
      u.uSun.value = light.sunDirection;
      u.uSunColor.value.copy(light.sunColor);
      // The glass becomes a mirror of the lit room as it gets dark outside.
      u.uNight.value = lamp * Math.min(1, light.stars * 1.2);
      u.uRain.value = weather.rain;
      u.uFrost.value = weather.snowCover;
      u.uWet.value = weather.wet;
      u.uTime.value = time;
      u.uOutside.value.copy(light.horizon).lerp(light.middle, 0.4).multiplyScalar(1 - 0.85 * light.stars);
      u.uGlint.value.setScalar(0.8).lerp(u.uLampColor.value, lamp).multiplyScalar(1 - 0.4 * light.stars);
      // Cold glass mists in the morning and at night, and on a damp day.
      const goal = Math.max(light.time === "morning" ? 1 : light.time === "night" ? 0.4 : 0, weather.mist * 0.7, weather.wet * 0.35);
      mist += (goal - mist) * Math.min(1, Math.max(0, time - lastTime) * 0.5);
      lastTime = time;
      u.uMist.value = mist;
      room.update(lamp);
      clock.update();
      // Now and then a drop runs down the bottle into the wine.
      if (time > nextDrip) {
        const a = rnd.range(0, Math.PI * 2);
        const r = Math.sqrt(rnd.next()) * wine.r * 0.6;
        ripple(wine.x + Math.cos(a) * r, wine.z + Math.sin(a) * r, rnd.range(0.3, 0.8));
        nextDrip = time + rnd.range(6, 16);
      }
    },
    ripple,
  };
}
