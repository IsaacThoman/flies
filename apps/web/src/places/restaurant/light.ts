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
import { CORNER_BAR, NEAR_LAMP } from "./street/layout.ts";
import { STREET_LIGHT_GLSL } from "./traffic.ts";
import { litOnly } from "../../scene/lit.ts";
import { noiseGlsl } from "../../scene/noise.ts";

/** How many things cast exact shadows at once: those of the area the camera is in. */
export const CASTERS = 16;

const f = (n: number) => n.toFixed(1);

/** Hash, value noise (scene/noise.ts) and a few octaves of it; and how much of a pattern a pixel can show. */
export const NOISE = /* glsl */ `
float rHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float rHash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
${noiseGlsl("rNoise", "uNoise")}
float rFbm(vec2 p) { return rNoise(p) * 0.55 + rNoise(p * 2.1 + 3.1) * 0.3 + rNoise(p * 4.3 + 7.7) * 0.15; }
// 1 where a pattern this fine can be shown, fading to 0 where it would shimmer.
float rDetail(vec2 p) { return 1.0 - smoothstep(0.3, 0.8, max(fwidth(p.x), fwidth(p.y))); }
float rBand(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
vec3 rWorldPoint(vec3 v) { return (vec4(v - viewMatrix[3].xyz, 0.0) * viewMatrix).xyz; }
vec3 rWorldDir(vec3 v) { return normalize((vec4(v, 0.0) * viewMatrix).xyz); }
`;

/**
 * Lambert's formula: how much of a surface's view a rectangle of light fills,
 * 0 to 1 (exact for an unshadowed rectangle wholly above the surface). Each
 * edge's angle over its sine is the rational fit three.js's own area lights
 * use (LTC_EdgeVectorFormFactor, with the 1/2π in it), well within a
 * thousandth of acos and without its cost.
 */
const RECT = /* glsl */ `
vec3 rEdge(vec3 a, vec3 b) {
  float x = dot(a, b);
  float y = abs(x);
  float v = (0.8543985 + (0.4965155 + 0.0145206 * y) * y) / (3.4175940 + (4.1616724 + y) * y);
  return cross(a, b) * (x > 0.0 ? v : 0.5 * inversesqrt(max(1.0 - x * x, 1e-7)) - v);
}
float rRect(vec3 p, vec3 n, vec3 a, vec3 b, vec3 c, vec3 d) {
  vec3 va = normalize(a - p), vb = normalize(b - p), vc = normalize(c - p), vd = normalize(d - p);
  return max(0.0, dot(n, rEdge(va, vb) + rEdge(vb, vc) + rEdge(vc, vd) + rEdge(vd, va)));
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

type Disc = { x: number; z: number; r: number; square: boolean };

const pedestals: Disc[] = TABLES.filter((t) => t.kind !== "four").map((t) => ({ x: t.x, z: t.z, r: t.kind === "round" ? TABLE_TOPS.round.r : TABLE_TOPS.square.half, square: t.kind === "square" }));
const fours: Disc[] = TABLES.filter((t) => t.kind === "four").map((t) => ({ x: t.x, z: t.z, r: TABLE_TOPS.four.half, square: true }));
const seats: Disc[] = TABLES.flatMap((t) => t.chairs.filter((c) => c.upturned === undefined)).map((c) => ({ x: c.x, z: c.z, r: CHAIR.seat.r, square: false }));
const stools: Disc[] = STOOL.zs.map((z) => ({ x: STOOL.x, z, r: STOOL.seat.r, square: false }));

/**
 * The level discs (or squares) at height `y` in a light's way: where the way
 * crosses that height (q, at t along it, its penumbra w there), and each disc
 * shadowing by how far q is from its middle. They are gathered by where they
 * stand into a few groups, each with a circle round all of it, and a group
 * the way crosses well clear of is passed over: every disc in it would have
 * let all the light through (a square's corner is √2 of its half out).
 */
function discs(y: number, list: readonly Disc[], cell = 1500) {
  const groups = new Map<string, Disc[]>();
  for (const d of list) {
    const key = `${Math.floor(d.x / cell)},${Math.floor(d.z / cell)}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const tests = [...groups.values()].map((group) => {
    const xs = group.map((d) => Number(f(d.x)));
    const zs = group.map((d) => Number(f(d.z)));
    const cx = Number(f((Math.min(...xs) + Math.max(...xs)) / 2));
    const cz = Number(f((Math.min(...zs) + Math.max(...zs)) / 2));
    const bound = Math.max(...group.map((d, i) => Math.hypot(xs[i] - cx, zs[i] - cz) + (d.square ? Math.SQRT2 : 1) * Number(f(d.r))));
    const shade = group.map((d) => {
      const at = `vec2(${f(d.x)}, ${f(d.z)})`;
      const k = d.square ? `max(abs(q.x - ${f(d.x)}), abs(q.y - ${f(d.z)}))` : `length(q - ${at})`;
      return `lit *= smoothstep(${f(d.r)} - w, ${f(d.r)} + w, ${k});`;
    });
    return `if (length(q - vec2(${f(cx)}, ${f(cz)})) < ${f(bound + 0.1)} + w * ${group.some((d) => d.square) ? "1.4143" : "1.0"}) {\n        ${shade.join("\n        ")}\n      }`;
  });
  return `t = (${f(y)} - p.y) / d.y;
    if (t >= 0.5 && t <= far) {
      q = p.xz + d.xz * t;
      w = 1.5 + t * soft;
      ${tests.join("\n      ")}
    }`;
}

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
float rBlocks(vec3 p, vec3 d, float far, float soft) {
  float lit = rBox(p, d, vec3(${f(ZINC_BAR.zinc.x - ZINC_BAR.zinc.hx)}, ${f(ZINC_BAR.zinc.bottom)}, ${f(ZINC_BAR.zinc.z - ZINC_BAR.zinc.hz)}), vec3(${f(ZINC_BAR.zinc.x + ZINC_BAR.zinc.hx)}, ${f(ZINC_BAR.zinc.top)}, ${f(ZINC_BAR.zinc.z + ZINC_BAR.zinc.hz)}), far)
    * rBox(p, d, vec3(${f(ZINC_BAR.front.x - ZINC_BAR.front.hx)}, 0.0, ${f(ZINC_BAR.zinc.z - ZINC_BAR.front.hz)}), vec3(${f(ZINC_BAR.front.x + ZINC_BAR.front.hx)}, ${f(ZINC_BAR.zinc.bottom)}, ${f(ZINC_BAR.zinc.z + ZINC_BAR.front.hz)}), far);
  // A level way crosses no level disc.
  if (abs(d.y) < 1e-4) return lit;
  float t;
  vec2 q;
  float w;
  if (p.y < ${f(TABLE_TOPS.round.bottom)}) {
    ${discs(TABLE_TOPS.round.bottom, pedestals)}
    ${discs(TABLE_TOPS.four.bottom, fours)}
  }
  if (p.y < ${f(CHAIR.seat.bottom)}) {
    ${discs(CHAIR.seat.bottom, seats)}
  }
  if (p.y < ${f(STOOL.seat.bottom)}) {
    ${discs(STOOL.seat.bottom, stools)}
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
// How many of them there are: the rest of the slots are empty.
uniform int uCastCount;
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
  float across = 1.0 / dd;
  float up = d.y > 1e-3 ? 1.0 / d.y : 0.0;
  for (int i = 0; i < uCastCount; i++) {
    vec4 o = uCast[i];
    // Nothing on or above a caster's top is in its shadow (a flat thing's top is wider than its disc).
    if (p.y > o.w - 0.5) continue;
    vec2 c = o.xy - p.xz;
    float along = dot(c, dxz) * across;
    if (along <= 0.0 || dot(c, c) < (o.z + 0.4) * (o.z + 0.4)) continue;
    // Where along the way the light is between the column's bottom and its top.
    float lo = d.y > 1e-3 ? (uCastBottom[i] - p.y) * up : -1.0;
    float hi = d.y > 1e-3 ? (o.w - p.y) * up : 1.0;
    if (hi < 0.0 || lo > 1.0) continue;
    float t = clamp(along, max(lo, 0.0), min(hi, 1.0));
    float dist = length(c - dxz * t);
    float w = (sun ? size * t * len : size * t / max(1.0 - t, 0.03)) + 0.35;
    // Clear of its penumbra, it lets all the light by.
    if (dist >= o.z + w) continue;
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
  for (int i = 0; i < uCastCount; i++) {
    vec4 o = uCast[i];
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
    // In the room, the heat lamps are seen only through the pass.
    vec3 h = vec3(${f((HEAT.x0 + HEAT.x1) / 2)}, ${f(HEAT.y)}, ${f((HEAT.z0 + HEAT.z1) / 2)}) - p;
    vec2 through = p.xy + h.xy * clamp((-3000.0 - p.z) / min(h.z, -1.0), 0.0, 1.0);
    float seen = p.z < -3000.0 ? 1.0 : rBand(through.x, ${f(PASS.x0)}, ${f(PASS.x1)}, 40.0) * rBand(through.y, ${f(PASS.sill)}, ${f(PASS.head)}, 40.0);
    if (seen > 0.0) e += seen * uHeat * rRect(p, n, vec3(${f(HEAT.x0)}, ${f(HEAT.y)}, ${f(HEAT.z0)}), vec3(${f(HEAT.x1)}, ${f(HEAT.y)}, ${f(HEAT.z0)}), vec3(${f(HEAT.x1)}, ${f(HEAT.y)}, ${f(HEAT.z1)}), vec3(${f(HEAT.x0)}, ${f(HEAT.y)}, ${f(HEAT.z1)}));
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

/**
 * The main lights falling on a point as if it faced up: the sun (or the
 * street lamp's glint) through the glass, the street's light, the lit
 * pendant, each shadowed. For things the light goes into and comes out of
 * again on every side (sugar, salt, wax, petals): placed after three.js's
 * light uniforms.
 */
export const KEY_LIGHT = /* glsl */ `
vec3 rKeyLight(vec3 p) {
  vec3 k = vec3(0.0);
  #if NUM_DIR_LIGHTS > 0
  vec3 s = rWorldDir(directionalLights[0].direction);
  k += directionalLights[0].color * max(s.y, 0.0) * rSun(directionalLights[0].direction);
  #endif
  k += streetLight(p, vec3(0.0, 1.0, 0.0)) * rStreetShadow() * 3.14159;
  if (uPendant.w > 0.0) {
    vec3 c;
    vec3 d = rPendantDir(p, c);
    k += c * max(d.y, 0.0) * rPendantShadow();
  }
  return k;
}`;

/** The light loop with a hook after the sun is found, its shadow and shading worked out only where it can add anything (scene/lit.ts). */
export function hookedLights() {
  return litOnly(THREE.ShaderChunk.lights_fragment_begin, [["getDirectionalLightInfo( directionalLight, directLight );", "rSun( directionalLight.direction )"]]);
}

/**
 * The room as a polished or glass surface sees it along a reflected ray:
 * the shop front (the sky by day, the dark street by night, its lamp and the
 * neon across the road as bright spots), the lit pendant's diffuser
 * overhead, and the room's own dim tone round them; blurred by how rough the
 * surface is. This stands in for the stage's reflections, which are a sky
 * all round, so that the marble, the zinc, the glaze and the glass show the
 * room's lights moving over them as the camera moves.
 */
const ROOM_SEEN = /* glsl */ `
uniform vec3 uRoomTone;
uniform vec3 uWindowSeen;
vec3 rRoom(vec3 p, vec3 r, float rough) {
  float blur = 0.004 + rough * rough * 0.9;
  // The room round about: the floor dark below, the walls, the ceiling a little brighter.
  vec3 c = uRoomTone * (0.55 + 0.35 * smoothstep(-0.6, 0.8, r.y));
  if (r.z > 0.01 && p.z < ${f(FRONT.z)}) {
    float t = (${f(FRONT.z)} - p.z) / r.z;
    vec3 q = p + r * t;
    float w = 3.0 + t * blur;
    float open = rBand(q.x, ${f(FRONT.x0)}, ${f(FRONT.door.x1)}, w) * rBand(q.y, q.x < ${f(FRONT.door.x0)} ? ${f(FRONT.sill)} : ${f(FRONT.door.bottom)}, ${f(FRONT.head)}, w);
    ${FRONT.bars.map((m) => `open *= smoothstep(${f(FRONT.bar)} - w, ${f(FRONT.bar)} + w, abs(q.x - ${f(m)}));`).join("\n    ")}
    open *= smoothstep(20.0 - w, 20.0 + w, abs(q.y - ${f((FRONT.transom.y0 + FRONT.transom.y1) / 2)}));
    // Brighter up the glass, where the sky is, than down it, where the street is.
    vec3 outside = uWindowSeen * mix(0.55, 1.15, smoothstep(${f(FRONT.sill)}, ${f(FRONT.head)}, q.y));
    c = mix(c, outside, open);
    // The lamp outside and the neon across the road, small and bright, through the glass.
    vec3 l = vec3(${f(NEAR_LAMP.x)}, ${f(NEAR_LAMP.y)}, ${f(NEAR_LAMP.z)}) - p;
    float ld = length(l);
    float a = acos(clamp(dot(r, l / ld), -1.0, 1.0));
    c += uStreetLamp * 6.0 * (1.0 - smoothstep(180.0 / ld, 180.0 / ld + blur * 0.6 + 0.004, a)) * open;
    vec3 n = vec3(${f(CORNER_BAR.neon.x)}, ${f(CORNER_BAR.neon.y)}, ${f(CORNER_BAR.neon.z)}) - p;
    float nd = length(n);
    float na = acos(clamp(dot(r, n / nd), -1.0, 1.0));
    c += uStreetFar * 0.012 * (1.0 - smoothstep(450.0 / nd, 450.0 / nd + blur * 0.25 + 0.002, na)) * open;
  }
  // The lit pendant's diffuser overhead, and the glow round it.
  if (uPendant.w > 0.0 && r.y > 0.02 && p.y < ${f(PENDANT_LIGHT.y)}) {
    float t = (${f(PENDANT_LIGHT.y)} - p.y) / r.y;
    vec2 q = p.xz + r.xz * t - vec2(${f(PENDANT_LIGHT.x)}, ${f(PENDANT_LIGHT.z)});
    float w = 3.0 + t * blur;
    float d = length(q);
    c += uPendantColor * uPendant.w * ${(1 / 620_000).toExponential(3)} * ((1.0 - smoothstep(${f(PENDANT_LIGHT.r)} - w, ${f(PENDANT_LIGHT.r)} + w, d)) * 1.6 + exp(-d * d / (t * t * 0.02 + 40000.0)) * 0.08);
  }
  return c;
}`;

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
${ROOM_SEEN}
bool rCasting;
// Each light's shadow at the fragment, worked out once: the light loop, the room's lights and
// what glows with the light through it (rKeyLight) all ask for it, at the fragment's own point.
// There is the one sun (stage.ts).
bool rSunAsked = false;
vec3 rSunLit;
vec3 rSun(vec3 dirView) {
  if (rSunAsked) return rSunLit;
  rSunAsked = true;
  vec3 s = rWorldDir(dirView);
  float lit = rGlass(vWorld, s);
  if (lit > 0.0) lit *= rBlocks(vWorld, s, 1e5, uSunSoft * 0.6 + 0.004);
  rSunLit = rCasting && lit > 0.0 ? lit * rCast(vWorld, s, uSunSoft * 0.7 + 0.002, true) : vec3(max(lit, 0.0));
  return rSunLit;
}
// The street's light (traffic.ts) comes mostly from the lamp outside: the tables, the chairs and the casters shadow it as if all of it did.
bool rStreetAsked = false;
vec3 rStreetLit;
vec3 rStreetShadow() {
  if (rStreetAsked) return rStreetLit;
  rStreetAsked = true;
  vec3 l = vec3(${f(NEAR_LAMP.x)}, ${f(NEAR_LAMP.y)}, ${f(NEAR_LAMP.z)});
  vec3 d = l - vWorld;
  float far = length(d);
  float lit = rBlocks(vWorld, d / far, far, 0.05);
  rStreetLit = rCasting && lit > 0.0 ? lit * rCast(vWorld, l, 140.0, false) : vec3(lit);
  return rStreetLit;
}
bool rPendantAsked = false;
vec3 rPendantLit;
vec3 rPendantShadow() {
  if (rPendantAsked) return rPendantLit;
  rPendantAsked = true;
  vec3 l = vec3(${f(PENDANT_LIGHT.x)}, ${f(PENDANT_LIGHT.y)}, ${f(PENDANT_LIGHT.z)});
  vec3 d = l - vWorld;
  float far = length(d);
  // Things on the zinc don't shadow it by the zinc itself.
  float lit = vWorld.y > ${f(ZINC_BAR.zinc.top - 2)} ? 1.0 : rBlocks(vWorld, d / far, far - 20.0, 0.12);
  rPendantLit = rCasting && lit > 0.0 ? lit * rCast(vWorld, l, ${f(PENDANT_LIGHT.r * 0.6)}, false) : vec3(lit);
  return rPendantLit;
}`;
