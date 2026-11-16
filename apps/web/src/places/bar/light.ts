// The bar's light, as its materials see it. The game lights every place with
// a hemisphere and one "sun" (stage.ts); here the sun is the daylight at the
// street window by day and the glow of the back bar at night, and the set
// adds the pendant lamps over the counter (spot lights) and the candle (a
// point light). There are no shadow maps: shadows are worked out in the
// shaders, exactly, from the few things on the counter that cast them (each
// an upright column, as the world has them), from the window's frame, and
// from the counter itself, so they cost no draws and sway with the candle.

import * as THREE from "three";
import { BAR_TOP } from "@fly/world";

/** The room, in the counter's millimetres: its floor, ceiling and walls. */
export const ROOM = { floor: -1100, ceiling: 1600, left: -900, right: 2300, back: -1000, front: 2100 };

/**
 * The street window in the room's left wall: its plane, the opening (z0..z1
 * across, y0..y1 up), the two mullions and the transom, the frame's bars'
 * width, and the small panes above the transom.
 */
export const WINDOW = { x: ROOM.left, z0: -560, z1: 760, y0: -20, y1: 1240, mullions: [-120, 320], transom: 900, bar: 46, pane: 165 };

/** Something on the counter that casts a shadow: an upright column, and the colour of the light through it (and how much a glass of liquid focuses it). */
export type Caster = { x: number; z: number; r: number; h: number; tint: THREE.ColorRepresentation; focus?: number };

/** Hash, value noise and a few octaves of it. */
const NOISE = /* glsl */ `
float barHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float barHash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float barNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(barHash(i), barHash(i + vec2(1.0, 0.0)), u.x), mix(barHash(i + vec2(0.0, 1.0)), barHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float barFbm(vec2 p) { return barNoise(p) * 0.55 + barNoise(p * 2.1 + 3.1) * 0.3 + barNoise(p * 4.3 + 7.7) * 0.15; }
// How much of a pattern of this frequency a pixel can show: 1 where it is fine enough, fading to 0 where it would shimmer.
float barDetail(vec2 p) { return 1.0 - smoothstep(0.3, 0.8, max(fwidth(p.x), fwidth(p.y))); }
`;

const VIEW_TO_WORLD = /* glsl */ `
vec3 barWorldPoint(vec3 v) { return (vec4(v - viewMatrix[3].xyz, 0.0) * viewMatrix).xyz; }
vec3 barWorldDir(vec3 v) { return normalize((vec4(v, 0.0) * viewMatrix).xyz); }
`;

/** Where each fragment is in the room, which way it faces there, and what it is. */
const VERTEX_HEAD = /* glsl */ `
attribute float kind;
varying float vKind;
varying vec3 vWorld;
varying vec3 vWorldNormal;`;

const VERTEX_BODY = /* glsl */ `
{
  vec4 barW = vec4(transformed, 1.0);
  vec3 barN = objectNormal;
  #ifdef USE_INSTANCING
  barW = instanceMatrix * barW;
  barN = mat3(instanceMatrix) * barN;
  #endif
  vWorld = (modelMatrix * barW).xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * barN);
  vKind = kind;
}`;

/** Whether light from far along `s` gets to `p` through the window: its frame, mullions and bars cast their shadows. */
const THROUGH_WINDOW = /* glsl */ `
float barWindow(vec3 p, vec3 s) {
  if (s.x > -0.03) return 0.0;
  float t = (${WINDOW.x.toFixed(1)} - p.x) / s.x;
  if (t < 0.0) return 0.0;
  // The sky's light through a window falls away from it, as the window grows smaller to see; a sunbeam doesn't.
  float near = mix(1.0, 1.9 / (1.0 + (t / 900.0) * (t / 900.0)), smoothstep(0.05, 0.14, uSunSoft));
  vec3 q = p + s * t;
  // Sunbeams are crisp; daylight from a whole sky is soft.
  float w = 2.0 + t * (0.006 + uSunSoft * 0.6);
  float open = smoothstep(${WINDOW.z0.toFixed(1)} - w, ${WINDOW.z0.toFixed(1)} + w, q.z) * (1.0 - smoothstep(${WINDOW.z1.toFixed(1)} - w, ${WINDOW.z1.toFixed(1)} + w, q.z));
  open *= smoothstep(${WINDOW.y0.toFixed(1)} - w, ${WINDOW.y0.toFixed(1)} + w, q.y) * (1.0 - smoothstep(${WINDOW.y1.toFixed(1)} - w, ${WINDOW.y1.toFixed(1)} + w, q.y));
  float bar = ${(WINDOW.bar / 2).toFixed(1)};
  ${WINDOW.mullions.map((m) => `open *= smoothstep(bar - w, bar + w, abs(q.z - ${m.toFixed(1)}));`).join("\n  ")}
  open *= smoothstep(bar - w, bar + w, abs(q.y - ${WINDOW.transom.toFixed(1)}));
  if (q.y > ${WINDOW.transom.toFixed(1)}) open *= smoothstep(6.0 - w * 0.5, 6.0 + w * 0.5, ${(WINDOW.pane / 2).toFixed(1)} - abs(mod(q.z - ${WINDOW.z0.toFixed(1)}, ${WINDOW.pane.toFixed(1)}) - ${(WINDOW.pane / 2).toFixed(1)}));
  return open * near;
}`;

/** The counter as blocks in the light's way, for the room round it: the top, and the bar's body under it. */
const COUNTER_BLOCK = /* glsl */ `
float barBox(vec3 o, vec3 d, vec3 lo, vec3 hi, float far) {
  vec3 inv = 1.0 / (d + vec3(1e-6));
  vec3 a = (lo - o) * inv;
  vec3 b = (hi - o) * inv;
  vec3 mn = min(a, b);
  vec3 mx = max(a, b);
  float t0 = max(max(mn.x, mn.y), mn.z);
  float t1 = min(min(mx.x, mx.y), mx.z);
  return (t1 > max(t0, 0.0) && t0 < far) ? 0.0 : 1.0;
}
float barBlock(vec3 p, vec3 d, float far) {
  return barBox(p, d, vec3(${-BAR_TOP.hx - 30}.0, -60.0, ${-BAR_TOP.hz - 30}.0), vec3(${BAR_TOP.hx + 30}.0, -1.0, ${BAR_TOP.hz + 30}.0), far)
    * barBox(p, d, vec3(${-BAR_TOP.hx + 15}.0, ${ROOM.floor}.0, ${-BAR_TOP.hz + 40}.0), vec3(${BAR_TOP.hx - 15}.0, -45.0, ${BAR_TOP.hz - 175}.0), far);
}`;

/**
 * Shadows cast on a point by the casters, from a light at `l` (a ball of
 * radius `size`), or from far along `l` when `sun` (`size` its angular
 * radius): the colour of the light that gets through.
 */
const CAST = (count: number) => /* glsl */ `
uniform vec4 uCast[${count}];
uniform vec4 uCastTint[${count}];
vec3 barCast(vec3 p, vec3 l, float size, bool sun) {
  vec3 through = vec3(1.0);
  vec3 d = sun ? l * 4000.0 : l - p;
  vec2 dxz = d.xz;
  float dd = max(dot(dxz, dxz), 1e-6);
  float len = sqrt(dd + d.y * d.y);
  for (int i = 0; i < ${count}; i++) {
    vec4 o = uCast[i];
    if (p.y > o.w) continue;
    // A light inside a caster (the candle in its lantern) isn't shadowed by it.
    if (!sun && length(l.xz - o.xy) < o.z) continue;
    vec2 c = o.xy - p.xz;
    // Inside a caster's own column is the caster itself (a drink in its glass).
    if (dot(c, c) < (o.z + 0.5) * (o.z + 0.5)) continue;
    float along = dot(c, dxz) / dd;
    // Lit sides of the caster itself, and anything with the caster behind it.
    if (along <= 0.0) continue;
    float top = d.y > 1e-3 ? clamp((o.w - p.y) / d.y, 0.0, 1.0) : 1.0;
    float t = min(along, top);
    float dist = length(c - dxz * t);
    float w = (sun ? size * t * len : size * t / max(1.0 - t, 0.03)) + 0.35;
    float s = 1.0 - smoothstep(o.z - w, o.z + w, dist);
    vec4 tint = uCastTint[i];
    // A glass of liquid is a lens: it gathers the light into a bright line down the middle of its shadow.
    float focus = tint.w * (1.0 - smoothstep(0.0, o.z * 0.3 + w * 0.5, dist)) * smoothstep(0.02, 0.2, t);
    through *= mix(vec3(1.0), tint.rgb * (1.0 + focus * 2.5), s);
  }
  return through;
}`;

/** Light for the things on the counter: shadowed by the casters, the sun only through the window when it is the daylight. Light for the room: through the window, and never through the counter. */
const SHADE = (count: number) => /* glsl */ `
uniform float uSunSoft;
${CAST(count)}
${THROUGH_WINDOW}
${COUNTER_BLOCK}
bool barOnCounter;
vec3 barSun(vec3 dirView) {
  vec3 s = barWorldDir(dirView);
  float win = mix(1.0, barWindow(vWorld, s), smoothstep(0.35, 0.7, -s.x));
  if (barOnCounter) return win * barCast(vWorld, s, uSunSoft, true);
  return vec3(win * barBlock(vWorld, s, 1e5));
}
vec3 barLamp(vec3 posView, float size) {
  vec3 l = barWorldPoint(posView);
  if (barOnCounter) return barCast(vWorld, l, size, false);
  vec3 d = l - vWorld;
  float far = length(d);
  return vec3(barBlock(vWorld, d / far, far - size));
}`;

/** The light loop with a hook after each light is found. The candle is small; the pendants' shades are wide. */
function hookedLights() {
  let chunk = THREE.ShaderChunk.lights_fragment_begin;
  const hooks: [string, string][] = [
    ["getPointLightInfo( pointLight, geometryPosition, directLight );", "directLight.color *= barLamp( pointLight.position, 4.0 );"],
    ["getSpotLightInfo( spotLight, geometryPosition, directLight );", "directLight.color *= barLamp( spotLight.position, 70.0 );"],
    ["getDirectionalLightInfo( directionalLight, directLight );", "directLight.color *= barSun( directionalLight.direction );"],
  ];
  for (const [find, add] of hooks) {
    if (!chunk.includes(find)) throw new Error(`three.js light chunk changed: ${find}`);
    chunk = chunk.replace(find, `${find}\n\t\t${add}`);
  }
  return chunk;
}

export type Patch = {
  /** A name for the compiled program. */
  key: string;
  uniforms: Record<string, THREE.IUniform>;
  /** How many casters there are: the lights are shadowed by them (`barOnCounter` says where). */
  casters: number;
  /** GLSL after the fragment shader's common chunk: uniforms and functions. */
  head: string;
  /** After the vertex colours: change `diffuseColor`, set `barOnCounter`. */
  color: string;
  /** After the metalness: change `roughnessFactor`, `metalnessFactor`. */
  surface: string;
  /** After the normal maps: change `normal` (view space). */
  normal?: string;
  emissive?: string;
  /** After the physical material is set up: change `material` (its clearcoat). */
  physical?: string;
  /** After the environment's light is gathered: scale `iblIrradiance`, the diffuse light from the reflections' surroundings. */
  ambient?: string;
  /** After the lights are summed: change `reflectedLight`. */
  after?: string;
  /** Before the colour is written: change `outgoingLight` and `diffuseColor.a`. */
  final?: string;
};

/** Adds to a physical material's shader, keeping everything three.js does, with the `kind` of each vertex. */
export function patch(material: THREE.MeshPhysicalMaterial, p: Patch) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, p.uniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${VERTEX_HEAD}`).replace("#include <project_vertex>", `#include <project_vertex>\n${VERTEX_BODY}`);
    const at = (fs: string, chunk: string, add: string | undefined) => {
      if (!add) return fs;
      const find = `#include <${chunk}>`;
      if (!fs.includes(find)) throw new Error(`three.js shader changed: ${find}`);
      return fs.replace(find, `${find}\n${add}`);
    };
    let fs = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>\nvarying float vKind;\nvarying vec3 vWorld;\nvarying vec3 vWorldNormal;\n${NOISE}\n${VIEW_TO_WORLD}\n${SHADE(p.casters)}\n${p.head}`,
    );
    fs = at(fs, "color_fragment", p.color);
    fs = at(fs, "metalnessmap_fragment", p.surface);
    fs = at(fs, "normal_fragment_maps", p.normal);
    fs = at(fs, "emissivemap_fragment", p.emissive);
    fs = at(fs, "lights_physical_fragment", p.physical);
    fs = fs.replace("#include <lights_fragment_begin>", hookedLights());
    fs = at(fs, "lights_fragment_maps", p.ambient);
    fs = at(fs, "lights_fragment_end", p.after);
    if (p.final) fs = fs.replace("#include <opaque_fragment>", `${p.final}\n#include <opaque_fragment>`);
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => `bar-${p.key}`;
}

/** The casters' uniforms. */
export function casterUniforms(casters: readonly Caster[]) {
  const color = new THREE.Color();
  return {
    uCast: { value: casters.map((c) => new THREE.Vector4(c.x, c.z, c.r, c.h)) },
    uCastTint: { value: casters.map((c) => (color.set(c.tint), new THREE.Vector4(color.r, color.g, color.b, c.focus ?? 0))) },
  };
}
