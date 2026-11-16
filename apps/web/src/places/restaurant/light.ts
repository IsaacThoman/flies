// The restaurant's light, as its materials see it. The stage lights every
// place with a hemisphere and one "sun" (stage.ts); here the sun is the
// daylight at the shop front by day and the street lamp's light at night,
// and it gets in only through the glass: the frames, the mullions, the
// transom and the wall cast their shadows, and the tables and chairs cast
// theirs on the floor. The room's own lights are worked out here from a few
// uniforms, with no three.js lights and no shadow maps: the sky (or the
// lit street) seen through the shop front as a big window of light, the one
// pendant left on over the bar, the drinks fridge's glass doors, the exit
// sign, the heat lamps and the kitchen through the pass. The lamps and the
// sun are shadowed exactly by the few things that matter most where the
// camera is (the casters of the area it is in), and by the bar and the
// tables as blocks.

import * as THREE from "three";
import { CHAIR, PASS, STOOL, TABLES, TABLE_TOPS, ZINC_BAR } from "@fly/world";
import { EXIT, FRIDGE, FRONT, HEAT, PENDANT_LIGHT } from "./plan.ts";
import { NEAR_LAMP } from "./street/layout.ts";
import { STREET_LIGHT_GLSL } from "./traffic.ts";

/** How many things cast exact shadows at once: those of the area the camera is in. */
export const CASTERS = 16;

const f = (n: number) => n.toFixed(1);

/** Hash, value noise and a few octaves of it; and how much of a pattern a pixel can show. */
export const NOISE = /* glsl */ `
float rHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float rHash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float rNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  return mix(mix(rHash(i), rHash(i + vec2(1.0, 0.0)), u.x), mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float rFbm(vec2 p) { return rNoise(p) * 0.55 + rNoise(p * 2.1 + 3.1) * 0.3 + rNoise(p * 4.3 + 7.7) * 0.15; }
// 1 where a pattern this fine can be shown, fading to 0 where it would shimmer.
float rDetail(vec2 p) { return 1.0 - smoothstep(0.3, 0.8, max(fwidth(p.x), fwidth(p.y))); }
float rBand(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
vec3 rWorldPoint(vec3 v) { return (vec4(v - viewMatrix[3].xyz, 0.0) * viewMatrix).xyz; }
vec3 rWorldDir(vec3 v) { return normalize((vec4(v, 0.0) * viewMatrix).xyz); }
`;

/** Lambert's formula: how much of a surface's view a rectangle of light fills, 0 to 1 (exact for an unshadowed rectangle wholly above the surface). */
const RECT = /* glsl */ `
float rEdge(vec3 a, vec3 b, vec3 n) {
  vec3 c = cross(a, b);
  float l = length(c);
  return l < 1e-6 ? 0.0 : acos(clamp(dot(a, b), -0.9999, 0.9999)) * dot(n, c) / l;
}
float rRect(vec3 p, vec3 n, vec3 a, vec3 b, vec3 c, vec3 d) {
  vec3 va = normalize(a - p), vb = normalize(b - p), vc = normalize(c - p), vd = normalize(d - p);
  return max(0.0, (rEdge(va, vb, n) + rEdge(vb, vc, n) + rEdge(vc, vd, n) + rEdge(vd, va, n)) * 0.15915);
}`;

/** The shop front's openings: how much of the light from far along `s` gets to `p` through the glass, between the frames. */
const THROUGH_GLASS = /* glsl */ `
uniform float uSunSoft;
float rGlass(vec3 p, vec3 s) {
  if (s.z < 0.02 || p.z > ${f(FRONT.z)}) return 0.0;
  float t = (${f(FRONT.z)} - p.z) / s.z;
  vec3 q = p + s * t;
  // The sun's edge is sharp; the sky's (and a lamp's, near) light soft, the softer the further it has come.
  float w = 2.0 + t * (0.004 + uSunSoft * 0.5);
  float windows = rBand(q.x, ${f(FRONT.x0)}, ${f(FRONT.x1)}, w) * rBand(q.y, ${f(FRONT.sill)}, ${f(FRONT.head)}, w);
  float door = rBand(q.x, ${f(FRONT.door.x0 + FRONT.door.stile)}, ${f(FRONT.door.x1 - FRONT.door.stile)}, w) * rBand(q.y, ${f(FRONT.door.bottom)}, ${f(FRONT.door.top)}, w)
    + rBand(q.x, ${f(FRONT.door.x0)}, ${f(FRONT.door.x1)}, w) * rBand(q.y, ${f(FRONT.transom.y1)}, ${f(FRONT.head)}, w);
  float open = max(windows, door);
  ${FRONT.bars.map((m) => `open *= smoothstep(${f(FRONT.bar)} - w, ${f(FRONT.bar)} + w, abs(q.x - ${f(m)}));`).join("\n  ")}
  open *= smoothstep(20.0 - w, 20.0 + w, abs(q.y - ${f((FRONT.transom.y0 + FRONT.transom.y1) / 2)}));
  // The small panes above the transom, their glazing bars.
  if (q.y > ${f(FRONT.transom.y1)}) open *= smoothstep(9.0 - w * 0.5, 9.0 + w * 0.5, ${f(FRONT.pane / 2)} - abs(mod(q.x + 4200.0, ${f(FRONT.pane)}) - ${f(FRONT.pane / 2)}));
  return open;
}`;

const pedestals = TABLES.filter((t) => t.kind !== "four");
const fours = TABLES.filter((t) => t.kind === "four");
const seats = TABLES.flatMap((t) => t.chairs.filter((c) => c.upturned === undefined));

/**
 * The big things in the light's way, as blocks: the zinc and the bar's body,
 * every table top, every chair's seat and the stools'. A light from `p` along
 * `d` (as far as `far`) gets through, 1, or not, 0, softly at the edges.
 */
const BLOCKS = /* glsl */ `
float rBox(vec3 o, vec3 d, vec3 lo, vec3 hi, float far) {
  vec3 inv = 1.0 / (d + vec3(1e-6));
  vec3 a = (lo - o) * inv;
  vec3 b = (hi - o) * inv;
  vec3 mn = min(a, b);
  vec3 mx = max(a, b);
  float t0 = max(max(mn.x, mn.y), mn.z);
  float t1 = min(min(mx.x, mx.y), mx.z);
  return (t1 > max(t0, 0.0) && t0 < far) ? 0.0 : 1.0;
}
// A level disc (or square) at height y in the way: crossed at t, and how far from its middle there.
float rDisc(vec3 o, vec3 d, vec2 c, float y, float r, bool square, float soft, float far) {
  if (abs(d.y) < 1e-4) return 1.0;
  float t = (y - o.y) / d.y;
  if (t < 0.5 || t > far) return 1.0;
  vec2 q = o.xz + d.xz * t - c;
  float k = square ? max(abs(q.x), abs(q.y)) : length(q);
  float w = 1.5 + t * soft;
  return smoothstep(r - w, r + w, k);
}
float rBlocks(vec3 p, vec3 d, float far, float soft) {
  float lit = rBox(p, d, vec3(${f(ZINC_BAR.zinc.x - ZINC_BAR.zinc.hx)}, ${f(ZINC_BAR.zinc.bottom)}, ${f(ZINC_BAR.zinc.z - ZINC_BAR.zinc.hz)}), vec3(${f(ZINC_BAR.zinc.x + ZINC_BAR.zinc.hx)}, ${f(ZINC_BAR.zinc.top)}, ${f(ZINC_BAR.zinc.z + ZINC_BAR.zinc.hz)}), far)
    * rBox(p, d, vec3(${f(ZINC_BAR.front.x - ZINC_BAR.front.hx)}, 0.0, ${f(ZINC_BAR.zinc.z - ZINC_BAR.front.hz)}), vec3(${f(ZINC_BAR.front.x + ZINC_BAR.front.hx)}, ${f(ZINC_BAR.zinc.bottom)}, ${f(ZINC_BAR.zinc.z + ZINC_BAR.front.hz)}), far);
  if (p.y < ${f(TABLE_TOPS.round.bottom)}) {
    ${pedestals.map((t) => `lit *= rDisc(p, d, vec2(${f(t.x)}, ${f(t.z)}), ${f(TABLE_TOPS.round.bottom)}, ${f(t.kind === "round" ? TABLE_TOPS.round.r : TABLE_TOPS.square.half)}, ${t.kind === "square"}, soft, far);`).join("\n    ")}
    ${fours.map((t) => `lit *= rDisc(p, d, vec2(${f(t.x)}, ${f(t.z)}), ${f(TABLE_TOPS.four.bottom)}, ${f(TABLE_TOPS.four.half)}, true, soft, far);`).join("\n    ")}
  }
  if (p.y < ${f(CHAIR.seat.bottom)}) {
    ${seats.map((c) => `lit *= rDisc(p, d, vec2(${f(c.x)}, ${f(c.z)}), ${f(CHAIR.seat.bottom)}, ${f(CHAIR.seat.r)}, false, soft, far);`).join("\n    ")}
  }
  if (p.y < ${f(STOOL.seat.bottom)}) {
    ${STOOL.zs.map((z) => `lit *= rDisc(p, d, vec2(${f(STOOL.x)}, ${f(z)}), ${f(STOOL.seat.bottom)}, ${f(STOOL.seat.r)}, false, soft, far);`).join("\n    ")}
  }
  return lit;
}`;

/**
 * Shadows cast by the casters on a point, from far along `l` (`sun`) or from
 * a lamp at `l` the size of `size`: the colour of the light that gets
 * through. Each caster is an upright column (x, z, radius, top) over its
 * bottom, with how much light it lets through and in what colour.
 */
const CAST = /* glsl */ `
uniform vec4 uCast[${CASTERS}];
uniform vec4 uCastTint[${CASTERS}];
uniform float uCastBottom[${CASTERS}];
uniform vec4 uCastBox;
uniform vec2 uCastY;
bool rInCast() { return vWorld.x > uCastBox.x && vWorld.x < uCastBox.y && vWorld.z > uCastBox.z && vWorld.z < uCastBox.w && vWorld.y > uCastY.x && vWorld.y < uCastY.y; }
vec3 rCast(vec3 p, vec3 l, float size, bool sun) {
  vec3 through = vec3(1.0);
  vec3 d = sun ? l * 4000.0 : l - p;
  vec2 dxz = d.xz;
  float dd = max(dot(dxz, dxz), 1e-6);
  float len = sqrt(dd + d.y * d.y);
  for (int i = 0; i < ${CASTERS}; i++) {
    vec4 o = uCast[i];
    // Nothing on or above a caster's top is in its shadow (a flat thing's top is wider than its disc).
    if (o.z <= 0.0 || p.y > o.w - 0.5) continue;
    vec2 c = o.xy - p.xz;
    if (dot(c, c) < (o.z + 0.4) * (o.z + 0.4)) continue;
    float along = dot(c, dxz) / dd;
    if (along <= 0.0) continue;
    // Where along the way the light is between the column's bottom and its top.
    float lo = d.y > 1e-3 ? (uCastBottom[i] - p.y) / d.y : -1.0;
    float hi = d.y > 1e-3 ? (o.w - p.y) / d.y : 1.0;
    float t = clamp(along, max(lo, 0.0), min(hi, 1.0));
    if (hi < 0.0 || lo > 1.0) continue;
    float dist = length(c - dxz * t);
    float w = (sun ? size * t * len : size * t / max(1.0 - t, 0.03)) + 0.35;
    float s = 1.0 - smoothstep(o.z - w, o.z + w, dist);
    vec4 tint = uCastTint[i];
    // Glass with something in it gathers the light into a bright line down its shadow.
    float focus = tint.w * (1.0 - smoothstep(0.0, o.z * 0.3 + w * 0.5, dist)) * smoothstep(0.02, 0.2, t);
    through *= mix(vec3(1.0), tint.rgb * (1.0 + focus * 2.5), s);
  }
  return through;
}
// Soft contact shadow round the casters' feet, on what they stand on.
float rCastAO(vec3 p) {
  float ao = 1.0;
  for (int i = 0; i < ${CASTERS}; i++) {
    vec4 o = uCast[i];
    if (o.z <= 0.0) continue;
    float above = p.y - uCastBottom[i];
    if (above < -1.0 || above > o.z) continue;
    float e = length(p.xz - o.xy) - o.z;
    if (e < 0.0) continue;
    ao *= 1.0 - 0.55 * exp(-max(e, 0.0) / (1.0 + o.z * 0.18)) * (1.0 - smoothstep(0.0, o.z, above)) * (1.0 - uCastTint[i].x * 0.5);
  }
  return ao;
}`;

/**
 * The room's own light at a point, as irradiance: the sky or street through
 * the glass, the fridge, the exit sign, the kitchen through the pass and the
 * heat lamps over it. Each a rectangle of light (Lambert's formula), as
 * bright as its uniform says.
 */
const ROOM_LIGHT = /* glsl */ `
uniform vec3 uWindow;
uniform vec3 uFridge;
uniform vec3 uExit;
uniform vec3 uKitchen;
uniform vec3 uHeat;
uniform vec4 uPendant;
uniform vec3 uPendantColor;
vec3 rRoomLight(vec3 p, vec3 n) {
  vec3 e = vec3(0.0);
  if (dot(uWindow, uWindow) > 0.0 && p.z < ${f(FRONT.z)}) {
    // The glass between the ledge and the head, as one window: the frames take little of it.
    e += uWindow * 0.86 * rRect(p, n, vec3(${f(FRONT.x0)}, ${f(FRONT.sill)}, ${f(FRONT.z)}), vec3(${f(FRONT.x0)}, ${f(FRONT.head)}, ${f(FRONT.z)}), vec3(${f(FRONT.door.x1)}, ${f(FRONT.head)}, ${f(FRONT.z)}), vec3(${f(FRONT.door.x1)}, ${f(FRONT.sill)}, ${f(FRONT.z)}));
  }
  if (p.x > ${f(FRIDGE.x - 40)} && abs(p.z - ${f((FRIDGE.z0 + FRIDGE.z1) / 2)}) < 3500.0) {
    // The bar's front hides the fridge from the room below the zinc.
    float hidden = (p.x > ${f(ZINC_BAR.front.x + ZINC_BAR.front.hx)} && p.y < ${f(ZINC_BAR.zinc.top)}) ? 0.0 : 1.0;
    e += uFridge * hidden * rRect(p, n, vec3(${f(FRIDGE.x)}, ${f(FRIDGE.y0)}, ${f(FRIDGE.z0)}), vec3(${f(FRIDGE.x)}, ${f(FRIDGE.y1)}, ${f(FRIDGE.z0)}), vec3(${f(FRIDGE.x)}, ${f(FRIDGE.y1)}, ${f(FRIDGE.z1)}), vec3(${f(FRIDGE.x)}, ${f(FRIDGE.y0)}, ${f(FRIDGE.z1)}));
  }
  if (p.z < ${f(EXIT.z)} && p.z > ${f(EXIT.z - 3500)} && p.x > 0.0) {
    e += uExit * rRect(p, n, vec3(${f(EXIT.x0)}, ${f(EXIT.y0)}, ${f(EXIT.z)}), vec3(${f(EXIT.x1)}, ${f(EXIT.y0)}, ${f(EXIT.z)}), vec3(${f(EXIT.x1)}, ${f(EXIT.y1)}, ${f(EXIT.z)}), vec3(${f(EXIT.x0)}, ${f(EXIT.y1)}, ${f(EXIT.z)}));
  }
  if (p.z > ${f(-3000)} && p.z < 1500.0) {
    e += uKitchen * rRect(p, n, vec3(${f(PASS.x0)}, ${f(PASS.shelf.top + 20)}, -3000.0), vec3(${f(PASS.x1)}, ${f(PASS.shelf.top + 20)}, -3000.0), vec3(${f(PASS.x1)}, ${f(PASS.head)}, -3000.0), vec3(${f(PASS.x0)}, ${f(PASS.head)}, -3000.0));
  }
  if (p.y < ${f(HEAT.y)} && p.z < -1500.0 && p.x > 0.0) {
    e += uHeat * rRect(p, n, vec3(${f(HEAT.x0)}, ${f(HEAT.y)}, ${f(HEAT.z0)}), vec3(${f(HEAT.x1)}, ${f(HEAT.y)}, ${f(HEAT.z0)}), vec3(${f(HEAT.x1)}, ${f(HEAT.y)}, ${f(HEAT.z1)}), vec3(${f(HEAT.x0)}, ${f(HEAT.y)}, ${f(HEAT.z1)}));
  }
  return e;
}
// The pendant left on over the bar: a disc of light facing down, its shade cutting it off above.
vec3 rPendantDir(vec3 p, out vec3 color) {
  vec3 l = vec3(${f(PENDANT_LIGHT.x)}, ${f(PENDANT_LIGHT.y)}, ${f(PENDANT_LIGHT.z)}) - p;
  float dd = dot(l, l);
  float d = sqrt(dd);
  vec3 dir = l / d;
  // The diffuser glows evenly: brightest straight down, falling off toward the shade's rim.
  float below = clamp(dir.y, 0.0, 1.0);
  float spread = smoothstep(0.05, 0.4, below) * (0.35 + 0.65 * below);
  color = uPendantColor * uPendant.w * spread / (dd + ${f(PENDANT_LIGHT.r * PENDANT_LIGHT.r)});
  return dir;
}`;

/** The light loop with a hook after the sun is found. */
export function hookedLights() {
  let chunk = THREE.ShaderChunk.lights_fragment_begin;
  const find = "getDirectionalLightInfo( directionalLight, directLight );";
  if (!chunk.includes(find)) throw new Error(`three.js light chunk changed: ${find}`);
  chunk = chunk.replace(find, `${find}\n\t\tdirectLight.color *= rSun( directionalLight.direction );`);
  return chunk;
}

/**
 * Light for the sun: through the glass, past the blocks, and on the casters'
 * area shadowed by them. The pendant: past the blocks and the casters.
 */
export const SHADE = /* glsl */ `
${RECT}
${THROUGH_GLASS}
${BLOCKS}
${CAST}
${ROOM_LIGHT}
${STREET_LIGHT_GLSL}
bool rCasting;
vec3 rSun(vec3 dirView) {
  vec3 s = rWorldDir(dirView);
  float lit = rGlass(vWorld, s);
  if (lit <= 0.0) return vec3(0.0);
  lit *= rBlocks(vWorld, s, 1e5, uSunSoft * 0.6 + 0.004);
  if (rCasting) return lit * rCast(vWorld, s, uSunSoft * 0.7 + 0.002, true);
  return vec3(lit);
}
// The street's light (traffic.ts) comes mostly from the lamp outside: the tables, the chairs and the casters shadow it as if all of it did.
vec3 rStreetShadow(vec3 p) {
  vec3 l = vec3(${f(NEAR_LAMP.x)}, ${f(NEAR_LAMP.y)}, ${f(NEAR_LAMP.z)});
  vec3 d = l - p;
  float far = length(d);
  float lit = rBlocks(p, d / far, far, 0.05);
  if (rCasting) return lit * rCast(p, l, 140.0, false);
  return vec3(lit);
}
vec3 rPendantShadow(vec3 p) {
  vec3 l = vec3(${f(PENDANT_LIGHT.x)}, ${f(PENDANT_LIGHT.y)}, ${f(PENDANT_LIGHT.z)});
  vec3 d = l - p;
  float far = length(d);
  // Things on the zinc don't shadow it by the zinc itself.
  float lit = p.y > ${f(ZINC_BAR.zinc.top - 2)} ? 1.0 : rBlocks(p, d / far, far - 20.0, 0.12);
  if (rCasting) return lit * rCast(p, l, ${f(PENDANT_LIGHT.r * 0.6)}, false);
  return vec3(lit);
}`;
