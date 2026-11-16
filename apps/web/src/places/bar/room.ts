// The room round the counter: a small, warm bar. Bottles on glass shelves
// before an old mirror behind the bar, lit from under each shelf, and a clock
// in the pier between them that tells the real time; pendant
// lamps over the counter; stools, a banquette and two tables; dark green
// walls over walnut panelling; a street window off the counter's end. All of
// it is in the near pass (it is within a few metres), merged into the same
// two materials as the counter. The lights glowing in it, out of focus
// behind a fly a few millimetres from the camera, are one instanced draw.

import * as THREE from "three";
import { BAR_TOP } from "@fly/world";
import { Batch, freeze, mat4, random } from "../../scene/build.ts";
import type { Dial } from "../../scene/clock.ts";
import type { Daylight } from "../../scene/light.ts";
import { lathe, part, scatter } from "./geometry.ts";
import { ROOM, WINDOW } from "./light.ts";
import { KIND } from "./materials.ts";
import type { Shared, Wash } from "./materials.ts";

/** The back bar: its counter's top, its glass shelves, and the bays between its pilasters and the pier. */
const BACK = { top: -190, front: -640, shelves: [70, 370, 670], cornice: 1000, bays: [[-690, -150], [150, 1290]] as const, depth: 200 };
/** The pier between the bays, across from the middle of the counter: its sides and its face. */
const PIER = { x0: BACK.bays[0][1], x1: BACK.bays[1][0], front: ROOM.back + 100 };
/**
 * The clock's dial, set in the pier facing the counter. Seen past a fly on
 * the counter the back bar shows from the counter's height to about 150 mm
 * above it, so that is where the clock hangs.
 */
export const DIAL: Dial = { centre: { x: (PIER.x0 + PIER.x1) / 2, y: 95, z: PIER.front + 39.5 }, up: { x: 0, y: 1, z: 0 }, right: { x: 1, y: 0, z: 0 }, radius: 88 };
/** The little brass lamp over the clock. */
const CLOCK_LAMP = { x: DIAL.centre.x, y: 252, z: PIER.front + 74 };
/** The pendant lamps over the counter: where each bulb hangs. */
const PENDANTS = [-262, 40, 342].map((x) => ({ x, y: 600, z: -24 }));
const SCONCES = [
  { x: 400, y: 520, z: ROOM.front - 70 },
  { x: 1500, y: 520, z: ROOM.front - 70 },
  { x: ROOM.right - 70, y: 520, z: 450 },
  { x: ROOM.left + 70, y: 520, z: 1400 },
];
/** The room's warm light at night, for the material to wash its walls with (materials.ts). */
export const WASH: Wash = { shelves: BACK.shelves, shelfX: [-720, 1320], shelfZ: ROOM.back, gap: [PIER.x0, PIER.x1], sconces: SCONCES, clockLamp: CLOCK_LAMP };
/** Light from a pendant, candela-like for a millimetre world: about as bright on the counter as the daylight. */
const PENDANT_LIGHT = 300_000;

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
/** A turned shape standing out of the back wall toward the room: (radius, out from the wall) pairs, from the wall out. */
const turned = (profile: readonly (readonly [number, number])[], segments: number, at: THREE.Vector3Like) => lathe(profile, segments).rotateX(Math.PI / 2).translate(at.x, at.y, at.z);

const GLOW_VS = /* glsl */ `
attribute vec3 aPos;
attribute vec3 aColor;
/** Its size, whether it is a glow round a light (1) or a light out of focus (0), and what lights it: the lamps (0), a candle (1), or the day (2). */
attribute vec3 aInfo;
uniform float uLamps;
uniform float uCandle;
uniform float uDay;
uniform float uTime;
varying vec2 vUv;
varying vec3 vColor;
varying float vRing;
void main() {
  vUv = position.xy;
  float on = aInfo.z < 0.5 ? uLamps : (aInfo.z < 1.5 ? uCandle * (0.9 + 0.1 * sin(uTime * 9.0 + aPos.x)) : uDay);
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  float dist = max(-mv.z, 1.0);
  float size = aInfo.x;
  vRing = 0.0;
  if (aInfo.y < 0.5) {
    // The camera is focused on the fly, on the counter: a light far behind it spreads into a disc about the same size on
    // screen whatever its distance, larger the closer the camera is to the fly.
    vec3 forward = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    float focus = clamp(cameraPosition.y / max(0.03, -forward.y), 6.0, 900.0);
    float blur = clamp(1.4 * abs(1.0 / focus - 1.0 / dist), 0.0, 0.055);
    size = (blur * aInfo.x + 0.003) * dist;
    on *= 0.006 / (blur + 0.006) + 0.12;
    vRing = smoothstep(0.004, 0.02, blur);
  }
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
  vColor = aColor * on;
}`;

const GLOW_FS = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vRing;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  // Out of focus: a disc, a little brighter at its rim; in focus, a soft glow.
  float disc = smoothstep(1.0, 0.82, r) * (0.7 + 0.3 * smoothstep(0.55, 0.92, r));
  float glow = exp(-r * r * 5.0);
  gl_FragColor = vec4(vColor * mix(glow, disc, vRing), 1.0);
}`;

type Glow = { x: number; y: number; z: number; color: THREE.ColorRepresentation; size: number; halo?: boolean; by: "lamps" | "candle" | "day" };

/** Every glowing thing in the room, one instanced draw: bulbs, their glow, and lights out of focus. */
function glows(list: readonly Glow[], shared: Shared) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  const pos = new Float32Array(list.length * 3);
  const color = new Float32Array(list.length * 3);
  const info = new Float32Array(list.length * 3);
  const c = new THREE.Color();
  list.forEach((g, i) => {
    pos.set([g.x, g.y, g.z], i * 3);
    c.set(g.color);
    color.set([c.r, c.g, c.b], i * 3);
    info.set([g.size, g.halo ? 1 : 0, g.by === "lamps" ? 0 : g.by === "candle" ? 1 : 2], i * 3);
  });
  geometry.setAttribute("aPos", new THREE.InstancedBufferAttribute(pos, 3));
  geometry.setAttribute("aColor", new THREE.InstancedBufferAttribute(color, 3));
  geometry.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 3));
  geometry.instanceCount = list.length;
  const uniforms = { uLamps: shared.lamps, uCandle: shared.candle, uDay: { value: 0 }, uTime: shared.time };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  freeze(mesh);
  return { mesh, day: uniforms.uDay };
}

/** Bottle shapes, (radius, height) up the outside: whisky, gin, a squat liqueur, rum, a tall wine-shaped one. */
const BOTTLES: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 0], [40, 0], [42, 4], [42, 160], [36, 188], [15, 210], [13, 228], [15, 230], [15, 246], [0, 246]],
  [[0, 0], [36, 0], [38, 4], [38, 180], [29, 200], [13, 212], [12, 238], [14, 240], [14, 256], [0, 256]],
  [[0, 0], [46, 0], [48, 5], [48, 110], [38, 138], [13, 160], [11, 186], [13, 188], [13, 200], [0, 200]],
  [[0, 0], [38, 0], [40, 4], [40, 140], [25, 168], [12, 186], [11, 232], [13, 234], [13, 246], [0, 246]],
  [[0, 0], [34, 0], [35, 4], [35, 170], [28, 192], [13, 210], [12, 252], [14, 254], [14, 262], [0, 262]],
];
const SPIRITS = ["#c8701e", "#d6e6dc", "#2a7a3a", "#c0101c", "#6a2c0c", "#2a5ec8", "#e0b42a", "#2a1408", "#e86a10", "#b4d8c8", "#8a1a40", "#d89a3a"];

/** A bottle as a template: liquid up to `fill` of its height takes the bottle's colour, the empty neck is pale glass, the cap dark. */
function bottleTemplate(profile: readonly (readonly [number, number])[], fill: number) {
  const height = profile[profile.length - 1][1];
  // The lathe's own normals, smooth round the bottle.
  const geometry = lathe(profile, 14).toNonIndexed();
  const pos = geometry.attributes.position;
  const tint = new Float32Array(pos.count);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const cap = y > height - 17;
    const liquid = y < height * fill;
    tint[i] = liquid && !cap ? 1 : 0;
    const col = cap ? [0.08, 0.06, 0.04] : [0.32, 0.36, 0.33];
    colors.set(col, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("tint", new THREE.BufferAttribute(tint, 1));
  geometry.deleteAttribute("uv");
  return geometry;
}

/** Many bottles from a template, each its own spirit. */
function bottles(template: THREE.BufferGeometry, placed: readonly { matrix: THREE.Matrix4; color: THREE.Color }[]) {
  const geometry = scatter(template, placed, KIND.bottle);
  // Only the liquid takes the bottle's colour (scatter coloured it all).
  const tint = template.attributes.tint.array as Float32Array;
  const base = template.attributes.color.array as Float32Array;
  const colors = geometry.attributes.color.array as Float32Array;
  const n = tint.length;
  for (let k = 0; k < placed.length; k++) {
    for (let i = 0; i < n; i++) {
      if (tint[i] > 0.5) continue;
      const o = (k * n + i) * 3;
      colors[o] = base[i * 3];
      colors[o + 1] = base[i * 3 + 1];
      colors[o + 2] = base[i * 3 + 2];
    }
  }
  return geometry;
}

type Label = { matrix: THREE.Matrix4; paper: THREE.Color; ink: THREE.Color };

/** Labels: a band of paper half round the front of each bottle, printed with a rule at its head and foot and a band across its middle. Each stands far enough off the glass that its flat faces clear the bottle's between their corners. */
function labels(placed: readonly Label[]) {
  const template = new THREE.LatheGeometry([0, 0.045, 0.41, 0.59, 0.955, 1].map((v) => new THREE.Vector2(1, v - 0.5)), 8, 0, Math.PI).toNonIndexed();
  const geometry = scatter(template, placed.map(({ matrix, paper }) => ({ matrix, color: paper })), KIND.plain);
  // Inked: the faces whose middle is in a printed band.
  const ys = template.attributes.position.array as Float32Array;
  const n = ys.length / 3;
  const inked: boolean[] = [];
  for (let i = 0; i < n; i += 3) {
    const v = (ys[i * 3 + 1] + ys[i * 3 + 4] + ys[i * 3 + 7]) / 3 + 0.5;
    const ink = v < 0.045 || v > 0.955 || (v > 0.41 && v < 0.59);
    inked.push(ink, ink, ink);
  }
  const colors = geometry.attributes.color.array as Float32Array;
  placed.forEach(({ ink }, k) => {
    for (let i = 0; i < n; i++) if (inked[i]) colors.set([ink.r, ink.g, ink.b], (k * n + i) * 3);
  });
  template.dispose();
  return geometry;
}

export function buildRoom(around: Batch, solid: THREE.Material, clear: THREE.Material, group: THREE.Group, shared: Shared) {
  const rnd = random(41);
  const { floor, ceiling, left, right, back, front } = ROOM;
  const add = (geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.ColorRepresentation | THREE.Color), kind: number, matrix?: THREE.Matrix4) =>
    around.add(kind >= KIND.glass ? clear : solid, part(geometry, color, kind), matrix);
  const green = "#2a4a3c";

  // The floor: oak boards. The ceiling: dark boards between beams.
  add(new THREE.PlaneGeometry(right - left, front - back).rotateX(-Math.PI / 2).translate((left + right) / 2, floor, (back + front) / 2), "#b49a88", KIND.wood);
  add(new THREE.PlaneGeometry(right - left, front - back).rotateX(Math.PI / 2).translate((left + right) / 2, ceiling, (back + front) / 2), "#3a2a20", KIND.matte);
  for (const x of [-480, 320, 1120, 1920]) add(box(x - 70, ceiling - 170, back, x + 70, ceiling, front), "#6a4a38", KIND.wood);

  // The walls: dark green flocked paper over walnut panelling.
  const rail = floor + 950;
  const wall = (geometry: THREE.BufferGeometry) => add(geometry, green, KIND.paper);
  wall(new THREE.PlaneGeometry(right - left, ceiling - rail).translate((left + right) / 2, (rail + ceiling) / 2, back));
  wall(new THREE.PlaneGeometry(right - left, ceiling - rail).rotateY(Math.PI).translate((left + right) / 2, (rail + ceiling) / 2, front));
  wall(new THREE.PlaneGeometry(front - back, ceiling - rail).rotateY(-Math.PI / 2).translate(right, (rail + ceiling) / 2, (back + front) / 2));
  // The street wall, round the window.
  const side = (z0: number, z1: number, y0: number, y1: number) => wall(new THREE.PlaneGeometry(z1 - z0, y1 - y0).rotateY(Math.PI / 2).translate(left, (y0 + y1) / 2, (z0 + z1) / 2));
  side(back, WINDOW.z0 - 60, rail, ceiling);
  side(WINDOW.z1 + 60, front, rail, ceiling);
  side(WINDOW.z0 - 60, WINDOW.z1 + 60, WINDOW.y1 + 60, ceiling);
  side(WINDOW.z0 - 60, WINDOW.z1 + 60, rail, WINDOW.y0 - 20);
  // Panelling: raised panels below a rail, on every wall.
  const panelled = (length: number, place: (along: number) => THREE.Matrix4) => {
    add(new THREE.PlaneGeometry(length, rail - floor).translate(0, (floor + rail) / 2, 0), "#8a6a58", KIND.wood, place(length / 2));
    add(box(0, rail - 10, -6, length, rail + 40, 26), "#7a5a48", KIND.wood, place(0));
    add(box(0, floor, -2, length, floor + 120, 14), "#5a4034", KIND.wood, place(0));
    const n = Math.max(1, Math.round(length / 650));
    const w = length / n;
    for (let i = 0; i < n; i++) add(box(i * w + 60, floor + 200, 0, (i + 1) * w - 60, rail - 90, 10), "#a07a64", KIND.wood, place(0));
  };
  panelled(right - left, (a) => mat4({ x: left + a, y: 0, z: back }, new THREE.Euler()));
  panelled(right - left, (a) => mat4({ x: right - a, y: 0, z: front }, new THREE.Euler(0, Math.PI, 0)));
  panelled(front - back, (a) => mat4({ x: right, y: 0, z: back + a }, new THREE.Euler(0, -Math.PI / 2, 0)));
  panelled(front - back, (a) => mat4({ x: left, y: 0, z: front - a }, new THREE.Euler(0, Math.PI / 2, 0)));

  // The window: a dark painted frame, two mullions and a transom, small panes above, a wide sill, old glass.
  {
    const x = left;
    const paint = "#16241c";
    const { z0, z1, y0, y1, transom, bar, pane } = WINDOW;
    const frame = (za: number, zb: number, ya: number, yb: number) => add(box(x, ya, za, x + 34, yb, zb), paint, KIND.plain);
    frame(z0 - 60, z0, y0 - 20, y1 + 60);
    frame(z1, z1 + 60, y0 - 20, y1 + 60);
    frame(z0 - 60, z1 + 60, y1, y1 + 60);
    for (const m of WINDOW.mullions) frame(m - bar / 2, m + bar / 2, y0, y1);
    frame(z0, z1, transom - bar / 2, transom + bar / 2);
    for (let z = z0 + pane; z < z1 - 10; z += pane) add(box(x, transom, z - 6, x + 22, y1, z + 6), paint, KIND.plain);
    add(box(x - 10, y0 - 34, z0 - 90, x + 130, y0 - 6, z1 + 90), "#c0a090", KIND.wood);
    add(new THREE.PlaneGeometry(z1 - z0, y1 - y0).rotateY(Math.PI / 2).translate(x + 12, (y0 + y1) / 2, (z0 + z1) / 2), "#e8f0f4", KIND.glass);
  }

  // The back bar: a panelled cabinet with a walnut top, pilasters and a cornice, and an old mirror behind glass shelves.
  {
    const x0 = BACK.bays[0][0] - 70;
    const x1 = BACK.bays[1][1] + 70;
    add(box(x0, floor, back, x1, BACK.top - 30, BACK.front), "#9a7a68", KIND.wood);
    add(box(x0 - 20, BACK.top - 30, back, x1 + 20, BACK.top, BACK.front + 20), "#ffffff", KIND.wood);
    const doors = 6;
    const w = (x1 - x0) / doors;
    for (let i = 0; i < doors; i++) {
      add(box(x0 + i * w + 40, floor + 160, BACK.front, x0 + (i + 1) * w - 40, BACK.top - 90, BACK.front + 10), "#b08a74", KIND.wood);
      add(box(x0 + (i + 0.5) * w - 8, BACK.top - 260, BACK.front + 10, x0 + (i + 0.5) * w + 8, BACK.top - 200, BACK.front + 22), "#c89648", KIND.metal);
    }
    add(new THREE.PlaneGeometry(x1 - x0, BACK.cornice - BACK.top).translate((x0 + x1) / 2, (BACK.top + BACK.cornice) / 2, back + 6), "#4a443a", KIND.mirror);
    for (const x of [x0 + 35, x1 - 35]) add(box(x - 32, BACK.top, back, x + 32, BACK.cornice, back + 70), "#a88a74", KIND.wood);
    add(box(x0 - 30, BACK.cornice, back, x1 + 30, BACK.cornice + 70, back + 110), "#8a6a58", KIND.wood);
    add(box(x0 - 50, BACK.cornice + 70, back, x1 + 50, BACK.cornice + 95, back + 135), "#7a5a48", KIND.wood);
    for (const y of BACK.shelves) {
      for (const [a, b] of BACK.bays) {
        add(box(a, y - 10, back + 6, b, y, back + BACK.depth), "#dff0ea", KIND.glass);
        add(box(a + 10, y - 16, back + 8, b - 10, y - 11, back + 22), "#ffd9a0", KIND.lamp);
        for (const x of [a + 40, b - 40]) add(box(x - 6, y - 40, back + 6, x + 6, y - 10, back + BACK.depth - 30), "#c89648", KIND.metal);
      }
    }
  }

  // The pier between the bays and its clock: an old drop-dial in a turned walnut case with a brass bezel and an ivory face (its
  // hands are drawn on the face, materials.ts), and a little brass lamp over it for the evening.
  {
    const { x0, x1, front: f } = PIER;
    add(box(x0, BACK.top, back, x1, BACK.cornice, f), "#a88a74", KIND.wood);
    add(box(x0 - 12, BACK.top, back, x1 + 12, BACK.top + 46, f + 12), "#7a5a48", KIND.wood);
    add(box(x0 - 12, BACK.cornice - 56, back, x1 + 12, BACK.cornice, f + 12), "#7a5a48", KIND.wood);
    add(box(x0 + 30, 330, f, x1 - 30, BACK.cornice - 96, f + 10), "#b08a74", KIND.wood);
    const c = DIAL.centre;
    const wall = { x: c.x, y: c.y, z: f };
    add(turned([[124, 0], [124, 12], [121, 17], [116, 20], [113, 22], [112, 27], [108, 30], [103, 31], [101, 33]], 64, wall), "#8a6a58", KIND.wood);
    add(turned([[101, 32], [102, 36], [100, 40], [96, 42.5], [92, 42], [89.5, 40]], 64, wall), "#d0a050", KIND.metal);
    add(new THREE.CircleGeometry(92, 64).translate(c.x, c.y, c.z), "#ffffff", KIND.dial);
    // The drop below the dial, with a brass keyhole.
    const drop = new THREE.Shape([new THREE.Vector2(-82, 0), new THREE.Vector2(82, 0), new THREE.Vector2(64, -112)]);
    drop.quadraticCurveTo(0, -158, -64, -112);
    add(new THREE.ExtrudeGeometry(drop, { depth: 24, bevelEnabled: true, bevelThickness: 3, bevelSize: 3, bevelSegments: 2, curveSegments: 10 }).translate(c.x, c.y - 80, f), "#8a6a58", KIND.wood);
    add(new THREE.CylinderGeometry(7, 7, 4, 16).rotateX(Math.PI / 2).translate(c.x, c.y - 165, f + 28), "#d0a050", KIND.metal);
    const l = CLOCK_LAMP;
    add(box(l.x - 30, l.y - 8, f, l.x + 30, l.y + 32, f + 8), "#c8964a", KIND.metal);
    for (const dx of [-60, 60]) add(new THREE.CylinderGeometry(4, 4, 52, 8).rotateX(Math.PI / 2).translate(l.x + dx, l.y + 14, f + 30), "#c8964a", KIND.metal);
    // A brass trough along x, open underneath, a bulb's strip inside.
    add(new THREE.CylinderGeometry(24, 24, 210, 16, 1, true, -0.35, Math.PI + 0.7).rotateZ(Math.PI / 2).translate(l.x, l.y + 6, f + 74), "#c8964a", KIND.metal);
    add(box(l.x - 96, l.y + 4, f + 64, l.x + 96, l.y + 12, f + 84), "#ffe0b0", KIND.lamp);
  }

  // Bottles on every shelf and on the back counter, each its own spirit, lit from below by the shelf lights.
  const templates = BOTTLES.flatMap((p) => [bottleTemplate(p, 0.88), bottleTemplate(p, 0.55)]);
  const placed: { matrix: THREE.Matrix4; color: THREE.Color }[][] = templates.map(() => []);
  const printed: Label[] = [];
  const papers = ["#f2e8d0", "#1a1a1a", "#d8c890", "#8a1a1a", "#f0f0e8", "#2a3a5a"].map((c) => new THREE.Color(c));
  // Dark inks on pale paper, gold on dark.
  const inks = ["#7a1414", "#1a2a4a", "#141414", "#9a7424"].map((c) => new THREE.Color(c));
  const gold = new THREE.Color("#c8a050");
  const place = (x: number, y: number, z: number, scale: number) => {
    const t = Math.floor(rnd.next() * templates.length);
    const r = BOTTLES[t >> 1][2][0];
    placed[t].push({ matrix: mat4({ x, y, z }, new THREE.Euler(0, rnd.range(0, 6.3), 0), { x: scale, y: scale, z: scale }), color: new THREE.Color(SPIRITS[Math.floor(rnd.next() * SPIRITS.length)]) });
    if (rnd.next() < 0.8) {
      const h = rnd.range(50, 90) * scale;
      const paper = papers[Math.floor(rnd.next() * papers.length)];
      const ink = paper.r + paper.g + paper.b > 1.5 ? inks[Math.floor(rnd.next() * inks.length)] : gold;
      printed.push({ matrix: mat4({ x, y: y + rnd.range(40, 70) * scale + h / 2, z }, new THREE.Euler(0, rnd.range(-0.5, 0.5) - Math.PI / 2, 0), { x: (r + 1.4) * scale, y: h, z: (r + 1.4) * scale }), paper, ink });
    }
    return r * scale;
  };
  for (const y of BACK.shelves) {
    for (const [a, b] of BACK.bays) {
      let x = a + 30;
      while (x < b - 100) {
        const scale = rnd.range(0.82, 0.95);
        const r = place(x + 45 * scale, y, back + 60 + rnd.range(0, 70), scale);
        x += r * 2 + rnd.range(6, 22);
      }
    }
  }
  // None in front of the clock.
  for (let x = BACK.bays[0][0]; x < BACK.bays[1][1] - 60; x += rnd.range(120, 260)) if (x < PIER.x0 - 60 || x > PIER.x1 + 60) place(x, BACK.top, back + 80 + rnd.range(0, 120), 0.9);
  templates.forEach((template, i) => {
    if (placed[i].length) around.add(solid, bottles(template, placed[i]));
  });
  around.add(solid, labels(printed));

  // On the back counter: the beer taps, two shakers, a bowl of lemons and limes.
  {
    const x = 520;
    const y = BACK.top;
    const z = BACK.front - 70;
    add(new THREE.CylinderGeometry(26, 34, 310, 20).translate(x, y + 155, z), "#c89648", KIND.metal);
    add(new THREE.CylinderGeometry(20, 20, 380, 16).rotateZ(Math.PI / 2).translate(x, y + 300, z), "#c89648", KIND.metal);
    for (const dx of [-140, 0, 140]) {
      add(new THREE.CylinderGeometry(9, 12, 70, 10).rotateX(Math.PI / 2).translate(x + dx, y + 300, z + 40), "#d8a656", KIND.metal);
      add(new THREE.CylinderGeometry(8, 10, 60, 10).translate(x + dx, y + 260, z + 72), "#d8a656", KIND.metal);
      add(new THREE.CylinderGeometry(9, 12, 130, 10).translate(x + dx, y + 375, z + 40), dx === 0 ? "#1a1410" : "#5a2a14", KIND.glossy);
    }
    for (const [sx, sz] of [[-300, 0], [-215, 30]]) add(lathe([[0, 0], [42, 0], [46, 120], [40, 150], [30, 175], [12, 205], [0, 210]], 20, sx, z + sz).translate(0, y, 0), "#c8ccd0", KIND.metal);
    add(lathe([[0, 0], [70, 0], [120, 60], [124, 66], [0, 30]], 24, 1050, z).translate(0, y, 0), "#e8e4dc", KIND.glossy);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      add(new THREE.SphereGeometry(1, 14, 10).scale(32, 30, 40), i % 3 === 0 ? "#6aa82a" : "#f0d030", KIND.glossy, mat4({ x: 1050 + Math.cos(a) * 50, y: y + 70 + (i % 2) * 18, z: z + Math.sin(a) * 50 }, new THREE.Euler(0.3, a, 0.2)));
    }
  }

  // Three stools at the counter: leather seats, iron pedestals, brass foot rings.
  for (const sx of [-250, 50, 350]) {
    const z = BAR_TOP.hz + 190;
    add(lathe([[0, -410], [176, -410], [186, -396], [190, -372], [184, -350], [164, -338], [0, -334]], 36, sx, z), "#6a1c14", KIND.glossy);
    add(new THREE.CylinderGeometry(30, 34, 680, 16).translate(sx, floor + 350, z), "#2a2420", KIND.metal);
    add(lathe([[0, floor], [230, floor], [228, floor + 14], [200, floor + 26], [0, floor + 30]], 32, sx, z), "#2a2420", KIND.metal);
    add(new THREE.TorusGeometry(190, 9, 8, 40).rotateX(Math.PI / 2).translate(sx, floor + 330, z), "#c89648", KIND.metal);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      add(new THREE.CylinderGeometry(6, 6, 170, 6).rotateZ(Math.PI / 2).rotateY(a).translate(sx + Math.cos(a) * 100, floor + 330, z - Math.sin(a) * 100), "#2a2420", KIND.metal);
    }
  }

  // Pendant lamps over the counter: brass shades, warm bulbs, cords up to the ceiling.
  const spots: THREE.SpotLight[] = [];
  for (const p of PENDANTS) {
    add(lathe([[150, p.y - 40], [146, p.y - 30], [120, p.y + 10], [70, p.y + 60], [24, p.y + 90], [14, p.y + 104], [0, p.y + 106]], 40, p.x, p.z), "#b8863e", KIND.metal);
    add(lathe([[0, p.y + 100], [14, p.y + 98], [68, p.y + 56], [118, p.y + 8], [144, p.y - 30], [148, p.y - 38]], 40, p.x, p.z), (q) => new THREE.Color("#fff0d0").lerp(new THREE.Color("#7a4a20"), Math.min(1, Math.hypot(q.x - p.x, q.z - p.z) / 150)), KIND.lamp);
    add(new THREE.SphereGeometry(30, 16, 10).translate(p.x, p.y + 10, p.z), "#fff6e0", KIND.lamp);
    add(new THREE.CylinderGeometry(3, 3, ceiling - p.y - 104, 6).translate(p.x, (ceiling + p.y + 104) / 2, p.z), "#14100c", KIND.plain);
    add(new THREE.CylinderGeometry(40, 46, 20, 20).translate(p.x, ceiling - 180, p.z), "#b8863e", KIND.metal);
    const spot = new THREE.SpotLight("#ffc488", 0, 2600, 0.95, 0.85, 2);
    spot.position.set(p.x, p.y, p.z);
    spot.target.position.set(p.x, -200, p.z);
    spot.layers.enable(1);
    freeze(spot);
    freeze(spot.target);
    group.add(spot, spot.target);
    spots.push(spot);
  }

  // Wall lights: a brass plate and a little amber shade.
  for (const s of SCONCES) {
    const facing = s.z > front - 100 ? Math.PI : s.x > right - 100 ? -Math.PI / 2 : s.x < left + 100 ? Math.PI / 2 : 0;
    const m = mat4(s, new THREE.Euler(0, facing, 0));
    add(box(-40, -70, -70, 40, 50, -60), "#b8863e", KIND.metal, m);
    add(new THREE.CylinderGeometry(2, 2, 60, 6).rotateX(Math.PI / 2).translate(0, -20, -40), "#b8863e", KIND.metal, m);
    add(lathe([[60, -30], [40, 40], [0, 42]], 20).translate(0, 0, -10), "#ffb870", KIND.lamp, m);
  }

  // A banquette along the far wall, two tables and their chairs, pictures on the walls.
  add(box(80, floor, front - 560, 2200, floor + 450, front - 40), "#5a1a14", KIND.glossy);
  add(box(80, floor + 450, front - 200, 2200, floor + 950, front - 40), "#4a140f", KIND.glossy);
  for (let x = 220; x < 2200; x += 260) add(new THREE.SphereGeometry(1, 8, 6).scale(10, 10, 4), "#2a0a08", KIND.glossy, mat4({ x, y: floor + 760, z: front - 200 }, new THREE.Euler()));
  const tables = [
    { x: 650, z: 1300 },
    { x: 1650, z: 1250 },
  ];
  for (const t of tables) {
    add(new THREE.CylinderGeometry(300, 300, 36, 40).translate(t.x, floor + 732, t.z), "#ffffff", KIND.wood);
    add(new THREE.CylinderGeometry(40, 50, 720, 12).translate(t.x, floor + 360, t.z), "#2a2420", KIND.metal);
    add(new THREE.CylinderGeometry(260, 280, 24, 24).translate(t.x, floor + 12, t.z), "#2a2420", KIND.metal);
    add(lathe([[0, 0], [34, 0], [36, 70], [33, 72], [0, 60]], 16, t.x + 60, t.z - 40).translate(0, floor + 750, 0), "#c86a2a", KIND.lamp);
    for (const a of [0.3, 0.3 + Math.PI]) {
      const cx = t.x + Math.sin(a) * 420;
      const cz = t.z + Math.cos(a) * 420;
      const m = mat4({ x: cx, y: floor, z: cz }, new THREE.Euler(0, a + Math.PI, 0));
      add(box(-210, 440, -200, 210, 480, 200), "#ffffff", KIND.wood, m);
      for (const [lx, lz] of [[-180, -170], [180, -170], [-180, 170], [180, 170]]) add(box(lx - 16, 0, lz - 16, lx + 16, 440, lz + 16), "#e0d0c0", KIND.wood, m);
      add(box(-200, 480, 170, 200, 900, 200), "#ffffff", KIND.wood, m);
    }
  }
  // Hung at the height pictures are, their middles about 1.45 m from the floor, where the band of wall seen past the fly reaches them.
  const picture = (x: number, y: number, z: number, w: number, h: number, facing: number, colors: readonly string[]) => {
    const m = mat4({ x, y, z }, new THREE.Euler(0, facing, 0));
    add(box(-w / 2 - 40, -h / 2 - 40, 0, w / 2 + 40, h / 2 + 40, 30), "#b8904a", KIND.metal, m);
    add(new THREE.PlaneGeometry(w, h, 12, 8).translate(0, 0, 32), (p) => {
      const u = (p.x + w / 2) / w;
      const v = (p.y + h / 2) / h;
      const k = Math.min(0.999, Math.max(0, v * 0.7 + u * 0.3 + Math.sin(u * 5) * 0.08)) * (colors.length - 1);
      return new THREE.Color(colors[Math.floor(k)]).lerp(new THREE.Color(colors[Math.floor(k) + 1]), k - Math.floor(k));
    }, KIND.canvas, m);
  };
  picture(950, 360, front - 6, 620, 440, Math.PI, ["#2a3a5a", "#c86a2a", "#e8c070", "#8aa8c0"]);
  picture(1900, 360, front - 6, 380, 500, Math.PI, ["#3a1a14", "#a03020", "#e0a050"]);
  // Clear of the door.
  picture(right - 6, 340, 930, 520, 380, -Math.PI / 2, ["#1a2a1a", "#4a6a3a", "#c8c088", "#e8e0c0"]);
  picture(left + 6, 360, 1650, 360, 460, Math.PI / 2, ["#5a2a3a", "#c87a6a", "#f0d0b0"]);
  // A door in the right wall, panelled, with a brass handle.
  add(box(right - 50, floor, 1250, right, floor + 2150, 2000), "#7a5a48", KIND.wood);
  add(box(right - 60, floor + 1050, 1880, right - 50, floor + 1080, 1950), "#c89648", KIND.metal);

  // Fairy lights strung along the back bar's cornice.
  const string: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
  const list: Glow[] = [];
  {
    const x0 = BACK.bays[0][0] - 60;
    const x1 = BACK.bays[1][1] + 60;
    const n = 34;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = x0 + (x1 - x0) * u;
      const sag = Math.sin((u * 4) % 1 * Math.PI) * 70;
      const at = { x, y: BACK.cornice - 10 - sag, z: back + 150 };
      string.push({ matrix: mat4(at, new THREE.Euler(), { x: 6, y: 6, z: 6 }), color: new THREE.Color("#fff0c0") });
      list.push({ ...at, color: "#a06a30", size: 0.22, by: "lamps" });
    }
  }
  around.add(solid, scatter(new THREE.SphereGeometry(1, 8, 6), string, KIND.lamp));

  // What glows: the bulbs, out of focus, the shelf lights catching the bottles, the sconces, the candles on the tables.
  for (const p of PENDANTS) {
    list.push({ x: p.x, y: p.y + 10, z: p.z, color: "#ffd9a0", size: 0.9, by: "lamps" });
    list.push({ x: p.x, y: p.y + 5, z: p.z, color: "#ff9a40", size: 90, halo: true, by: "lamps" });
  }
  // Each glow just outside what holds it, or that would hide it.
  for (const s of SCONCES) {
    const out = s.z > front - 100 ? { x: 0, z: -1 } : s.x > right - 100 ? { x: -1, z: 0 } : { x: 1, z: 0 };
    list.push({ x: s.x + out.x * 75, y: s.y - 10, z: s.z + out.z * 75, color: "#ffaa50", size: 0.8, by: "lamps" });
  }
  for (const y of BACK.shelves) {
    for (const [a, b] of BACK.bays) {
      for (let x = a + 40; x < b; x += rnd.range(60, 150)) list.push({ x, y: y + rnd.range(30, 200), z: back + rnd.range(60, 140), color: rnd.next() < 0.5 ? "#ffb060" : "#ffd8a0", size: rnd.range(0.2, 0.5), by: "lamps" });
    }
  }
  list.push({ x: CLOCK_LAMP.x, y: CLOCK_LAMP.y, z: CLOCK_LAMP.z + 4, color: "#ffc070", size: 0.35, by: "lamps" });
  for (const t of tables) {
    list.push({ x: t.x + 60, y: floor + 840, z: t.z - 40, color: "#ff8a30", size: 0.7, by: "candle" });
    list.push({ x: t.x + 60, y: floor + 830, z: t.z - 40, color: "#ff7020", size: 80, halo: true, by: "candle" });
  }
  // By day, the light from the window catching the brass and glass.
  for (let i = 0; i < 18; i++) {
    const x = rnd.range(BACK.bays[0][0], BACK.bays[1][1] - (PIER.x1 - PIER.x0));
    list.push({ x: x < PIER.x0 ? x : x + PIER.x1 - PIER.x0, y: BACK.shelves[i % 3] + rnd.range(150, 240), z: back + rnd.range(50, 160), color: "#fff4e0", size: rnd.range(0.15, 0.35), by: "day" });
  }
  const glow = glows(list, shared);
  group.add(glow.mesh);

  return {
    update(_time: number, light: Daylight) {
      const lamps = light.glow;
      for (const spot of spots) spot.intensity = PENDANT_LIGHT * lamps;
      glow.day.value = (1 - light.stars) * (1 - lamps) * 0.35;
    },
  };
}

