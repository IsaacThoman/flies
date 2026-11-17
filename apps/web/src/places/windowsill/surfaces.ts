// The windowsill's surfaces, worked out per pixel from where they are in the
// world, so that they stay crisp however close the camera comes: the painted
// wood's grain, brush marks and chips; terracotta's pores and salts; the
// fruit's freckles, fuzz and bloom; the glaze's speckles; the tiles' grout.
// Detail finer than a pixel fades into its average, so nothing shimmers.

import * as THREE from "three";
import { POSTCARD, SILL, WINDOW } from "@fly/world";
import { sunlit } from "./light.ts";
import type { Sunlight } from "./light.ts";

type Shader = THREE.WebGLProgramParametersWithUniforms;

/** Value noise in two and three dimensions, from a hash that keeps its precision at a few metres in millimetres. */
export const NOISE = /* glsl */ `
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), u.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), u.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z);
}
// 1 where detail of this size (mm) is several pixels across, fading to 0 as it nears one pixel.
float resolved(float size) { return 1.0 - smoothstep(0.35, 1.0, length(fwidth(vWorld)) / size); }
`;

/** A bump on a lit surface (view space, as three.js's standard materials work). */
export const BUMP = /* glsl */ `
// A bump's new normal (view space) from a height h over the surface, by its screen-space slopes.
vec3 bumped(vec3 n, float h) {
  vec3 p = -vViewPosition;
  vec3 dpx = dFdx(p);
  vec3 dpy = dFdy(p);
  vec3 r1 = cross(dpy, n);
  vec3 r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}
`;

/**
 * A colour by its hex, parsed once: colour functions run for every vertex,
 * and parsing a string each time is most of what building a place costs.
 * Read it, never change it.
 */
export const tone = (() => {
  const cache = new Map<string, THREE.Color>();
  return (hex: string) => {
    let c = cache.get(hex);
    if (!c) cache.set(hex, (c = new THREE.Color(hex)));
    return c;
  };
})();

const blended = new THREE.Color();
/** Between two colours by their hex, k of the way: for a colour function's answer, used before the next call. */
export const blend = (a: string, b: string, k: number) => blended.copy(tone(a)).lerp(tone(b), k);

/** Adds a float attribute to a geometry: every piece merged into one material needs the same attributes. */
export function tag(geometry: THREE.BufferGeometry, name: string, value: number) {
  geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(value), 1));
  return geometry;
}

const withVarying = (shader: Shader, attribute: string, varying: string) => {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\nattribute float ${attribute};\nvarying float ${varying};`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${varying} = ${attribute};`);
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\nvarying float ${varying};`);
};

/** Where the bottoms of things stand on the sill, for the soft dark where they meet it: x, z, radius, how dark. */
export type Contact = { x: number; z: number; r: number; dark: number };
const MAX_CONTACTS = 40;
/** Crumbs and pebbles at the fly's scale, too small for the light's casters, which throw their own little shadows on the sill: where, how wide, how high. */
export type Lump = { x: number; z: number; r: number; height: number };
const MAX_LUMPS = 16;

/**
 * Painted timber: the sill and the window's frame. Gloss paint over pine,
 * its grain showing through as faint ridges, its brush marks along the
 * grain; where it has been knocked (most along the sill's front edge and its
 * corners) the top coat is chipped to the cream undercoat, and deeper to bare
 * wood. `grain` (an attribute) says which way the wood runs: 0 along x, 1 up.
 * On the sill's top the things standing on it darken it where they meet it,
 * and a glass once left a ring.
 */
export function paintMaterial(sunlight: Sunlight, contacts: readonly Contact[], ring: { x: number; z: number; r: number }, lumps: readonly Lump[]) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, envMapIntensity: 0.55 });
  const spots = Array.from({ length: MAX_CONTACTS }, (_, i) => (contacts[i] ? new THREE.Vector4(contacts[i].x, contacts[i].z, contacts[i].r, contacts[i].dark) : new THREE.Vector4(1e5, 1e5, 0, 0)));
  const shadows = Array.from({ length: MAX_LUMPS }, (_, i) => (lumps[i] ? new THREE.Vector4(lumps[i].x, lumps[i].z, lumps[i].r, lumps[i].height) : new THREE.Vector4(1e5, 1e5, 0, 0)));
  sunlit(material, sunlight, "paint", {
    extra: (shader) => {
      shader.uniforms.uContacts = { value: spots };
      shader.uniforms.uLumps = { value: shadows };
      shader.uniforms.uRing = { value: new THREE.Vector3(ring.x, ring.z, ring.r) };
      withVarying(shader, "grain", "vGrain");
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          /* glsl */ `#include <common>
${NOISE}\n${BUMP}
uniform vec4 uContacts[${MAX_CONTACTS}];
uniform vec4 uLumps[${MAX_LUMPS}];
uniform vec3 uRing;
float paintRough;
float paintHeight;
float paintHeightRail;
float sillTop;`,
        )
        .replace(
          "#include <color_fragment>",
          /* glsl */ `#include <color_fragment>
{
  vec3 wn = inverseTransformDirection(normalize(vNormal), viewMatrix);
  paintHeightRail = 0.0;
  // Bare, oiled wood (the worktop, the table) is 2 or 3; painted 0 or 1.
  bool bareWood = vGrain > 1.5;
  vec3 along = mod(vGrain, 2.0) < 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 acrossDir = cross(wn, along);
  if (dot(acrossDir, acrossDir) < 0.01) acrossDir = vec3(0.0, 0.0, 1.0);
  float u = dot(vWorld, along);
  float v = dot(vWorld, normalize(acrossDir));
  // The pine's grain: long streaks of early and late wood, a millimetre or two apart, unevenly, wavering along the board.
  float warp = vnoise(vec2(u * 0.003, v * 0.04)) * 9.0 + vnoise(vec2(u * 0.02, v * 0.2)) * 1.5;
  float rings = vnoise(vec2(u * 0.006, (v + warp) * 0.7));
  float grain = smoothstep(0.35, 0.75, rings) * (0.7 + 0.3 * vnoise(vec2(u * 0.05, v * 3.0)));
  // Brush marks along it: the bristles' furrows, fading in and out along each stroke.
  float stroke = vnoise(vec2(u * 0.008, v * 0.35));
  float brush = mix(0.5, vnoise(vec2(u * 0.02, v * 2.2 + stroke * 3.0)), smoothstep(0.3, 0.8, stroke)) * resolved(0.4) + (1.0 - resolved(0.4)) * 0.5;
  // Knocks: more toward the sill's front edge and the frame's corners.
  sillTop = step(0.9, wn.y) * (1.0 - step(0.5, abs(vWorld.y)));
  // Worn most along the rounded front edge, where hands and cups knock it, and at its ends.
  float arris = smoothstep(${SILL.hz - 18}.0, ${SILL.hz}.0, vWorld.z) * smoothstep(-24.0, -2.0, vWorld.y) * step(-40.0, vWorld.y);
  // The bottom rail of the window, where condensation runs down the glass and stands: its paint is worn most of all, and stained.
  float rail = step(${(WINDOW.glass - 1).toFixed(1)}, vWorld.z) * (1.0 - step(${(WINDOW.glass + WINDOW.rail.depth + 0.5).toFixed(1)}, vWorld.z)) * (1.0 - step(${(WINDOW.rail.top + 0.5).toFixed(1)}, vWorld.y)) * step(0.0, vWorld.y);
  float wear = arris + smoothstep(${SILL.hx - 24}.0, ${SILL.hx}.0, abs(vWorld.x)) * 0.5;
  vec3 w = vWorld + wn * 3.0;
  float knocks = vnoise3(w * 0.06) * 0.4 + vnoise3(w * 0.23) * 0.38 + vnoise3(w * 0.9) * 0.22 * resolved(1.2) + 0.11 * (1.0 - resolved(1.2));
  // The kitchen's cupboards and chairs, across the room, are sound: only the window and its sill have taken knocks and sun.
  float window = 1.0 - smoothstep(${SILL.hz + 60}.0, ${SILL.hz + 200}.0, vWorld.z);
  float top = 0.95 - wear * 0.27 + (1.0 - window);
  float aa = fwidth(knocks) * 1.2 + 0.002;
  float chipped = smoothstep(top - aa, top + aa, knocks);
  float bare = smoothstep(top + 0.07 - aa, top + 0.07 + aa, knocks);
  float lip = (1.0 - smoothstep(0.0, aa * 1.5 + 0.004, abs(knocks - top))) * resolved(0.15);
  vec3 paint = diffuseColor.rgb * (0.97 + 0.03 * grain) * (0.985 + 0.03 * brush);
  // Under the top coat, an older coat of sage green.
  vec3 undercoat = vec3(0.6, 0.7, 0.62) * (0.95 + 0.05 * grain);
  vec3 wood = mix(vec3(0.66, 0.45, 0.25), vec3(0.83, 0.62, 0.38), grain) * (0.9 + 0.1 * vnoise(vec2(u * 0.1, v * 2.0)));
  if (bareWood) {
    chipped = 0.0;
    bare = 1.0;
    lip = 0.0;
    wood = diffuseColor.rgb * mix(0.78, 1.08, grain) * (0.92 + 0.12 * vnoise(vec2(u * 0.004, v * 0.02)));
  }
  vec3 c = mix(mix(paint, undercoat, chipped), wood, bare);
  // The chip's edge: the top coat's thickness, catching dirt.
  c *= 1.0 - lip * 0.28;
  if (rail > 0.0) {
    // Flakes a millimetre or two across where the wet has lifted the paint, down to grey wood; tide lines along it where standing water dried; grime in the corner.
    vec2 rp = vec2(vWorld.x, vWorld.y + vWorld.z);
    float flake = smoothstep(0.67, 0.71, vnoise(rp * 0.45) * 0.7 + vnoise(rp * 1.9) * 0.3) * resolved(0.3);
    float lines = 0.0;
    for (int i = 0; i < 3; i++) {
      float h = 2.5 + float(i) * 3.4 + 1.1 * sin(vWorld.x * 0.07 + float(i) * 2.1);
      lines = max(lines, 1.0 - smoothstep(0.12, 0.22 + fwidth(vWorld.y), abs(vWorld.y - h)));
    }
    float grime = 1.0 - smoothstep(0.0, 2.5, vWorld.y);
    c = mix(c, vec3(0.52, 0.47, 0.4) * (0.9 + 0.2 * vnoise(rp * 3.0)), flake * 0.85);
    c *= 1.0 - lines * 0.22 * resolved(0.15) - grime * 0.3;
    paintHeightRail = -flake * 0.08;
  }
  // Where the sun has baked it, the old gloss has crazed into a fine net of cracks, long along the grain, with dirt in them.
  float crazed = smoothstep(0.6, 0.85, vnoise3(vWorld * 0.015 + 4.0)) * (1.0 - bare) * resolved(0.25) * window;
  float crack = 0.0;
  if (crazed > 0.0) {
    vec2 cp = vec2(u * 0.65 + vnoise(vec2(u, v) * 0.5) * 0.35, v * 2.8);
    vec2 ci = floor(cp);
    vec2 cf = fract(cp);
    float f1 = 8.0;
    float f2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = vec2(hash21(ci + g), hash21(ci + g + 17.31)) * 0.8 + 0.1;
        float d = length(g + o - cf);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
    }
    float e = f2 - f1;
    // Hairlines of varying width, some broken off: not every edge of the net has opened.
    float width = 0.006 + 0.009 * vnoise(cp * 3.0);
    float open = smoothstep(0.35, 0.6, vnoise(cp * 1.7 + 3.0));
    crack = (1.0 - smoothstep(width, width + fwidth(e) * 1.5, e)) * crazed * open;
    c *= 1.0 - crack * 0.12;
  }
  // Dust: a few pale specks and darker grains, a fraction of a millimetre across.
  vec2 dc = floor(vWorld.xz * 3.0);
  float dh = hash21(dc + 5.1);
  float speck = step(0.985, dh) * (1.0 - smoothstep(0.06, 0.12, length(fract(vWorld.xz * 3.0) - 0.5 - (vec2(hash21(dc), hash21(dc + 9.0)) - 0.5) * 0.5))) * resolved(0.2) * step(0.5, wn.y);
  c = mix(c, dh > 0.994 ? vec3(0.35, 0.3, 0.26) : vec3(0.86, 0.84, 0.8), speck * 0.6);
  paintRough = bareWood ? 0.42 + 0.1 * grain : mix(mix(0.32 + brush * 0.08, 0.5, chipped), 0.72, bare);
  // Gloss paint's orange-peel, the grain under it, the brush's furrows, the step down into a chip, the cracks.
  float peel = vnoise(vec2(u, v) * 1.3) * resolved(0.5);
  paintHeight = (grain * 0.003 + brush * 0.004 + peel * 0.004) * (1.0 - bare) * resolved(0.3) - chipped * 0.06 - bare * 0.05 - crack * 0.001 + speck * 0.04 + paintHeightRail;
  if (sillTop > 0.5) {
    // A ring left by a glass: a hairline of dried wine, darker where it pooled at its edge.
    float d = abs(length(vWorld.xz - uRing.xy) - uRing.z);
    float ringA = (1.0 - smoothstep(0.35, 0.35 + fwidth(d) + 0.2, d)) * (0.55 + 0.45 * vnoise(vWorld.xz * 0.2));
    float arc = smoothstep(-0.2, 0.4, sin(atan(vWorld.z - uRing.y, vWorld.x - uRing.x) * 1.0 + 0.8));
    c = mix(c, c * vec3(0.78, 0.6, 0.63), ringA * arc * 0.8);
    paintRough = mix(paintRough, 0.12, ringA * arc);
  }
  diffuseColor.rgb = c;
}`,
        )
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = paintRough;")
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bumped(normal, paintHeight);")
        .replace(
          "#include <aomap_fragment>",
          /* glsl */ `#include <aomap_fragment>
if (sillTop > 0.5) {
  // Where things meet the sill it is darker: less of the room's light reaches in under them.
  float open = 1.0;
  for (int i = 0; i < ${MAX_CONTACTS}; i++) {
    vec4 c = uContacts[i];
    float d = length(vWorld.xz - c.xy) - c.z;
    open *= 1.0 - c.w * (1.0 - smoothstep(-0.2, c.z * 0.35 + 1.0, d));
  }
  reflectedLight.indirectDiffuse *= open;
  reflectedLight.indirectSpecular *= open;
  // The crumbs' and pebbles' shadows, each a ball half sunk in the sill, soft-edged.
  vec3 toSun = normalize(uSun);
  float lit = 1.0;
  for (int i = 0; i < ${MAX_LUMPS}; i++) {
    vec4 c = uLumps[i];
    vec3 d = vec3(c.x, c.w * 0.3, c.y) - vWorld;
    float along = dot(d, toSun);
    if (along <= 0.0) continue;
    float miss = length(d - toSun * along);
    lit *= 1.0 - (1.0 - smoothstep(c.z * 0.55, c.z * 0.95 + along * 0.02, miss)) * 0.75;
  }
  reflectedLight.directDiffuse *= mix(1.0, open, 0.35) * lit;
  reflectedLight.directSpecular *= lit;
}`,
        );
    },
  });
  return material;
}

/**
 * Leaves: the basil's, glossy and quilted between their veins, and the
 * tulips' in the kitchen. `vein` (a two-float attribute) is where a point is
 * on its leaf: along it from stalk to tip (0 to 1) and across it from the
 * midrib (-1 to 1); below -1 along, it isn't a leaf's blade (a stem, a
 * flower). Lit from behind, a leaf glows green with the sun through it; its
 * underside is paler.
 */
export function leafMaterial(sunlight: Sunlight) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0, envMapIntensity: 0.3, side: THREE.DoubleSide });
  sunlit(material, sunlight, "leaf", {
    extra: (shader) => {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 vein;\nvarying vec2 vVein;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvVein = vein;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${NOISE}\n${BUMP}\nvarying vec2 vVein;\nfloat leafHeight;\nfloat leafRough;`)
        .replace(
          "#include <color_fragment>",
          /* glsl */ `#include <color_fragment>
leafHeight = 0.0;
leafRough = 0.36;
if (vVein.x > -1.0) {
  float u = vVein.x;
  float w = abs(vVein.y);
  float aa = fwidth(w) + 0.004;
  // The midrib, pale and raised; side veins running from it toward the tip, five or six a side; the blade puckered between them.
  float rib = 1.0 - smoothstep(0.035, 0.035 + aa * 1.5, w);
  float along = (u - 0.42 * pow(w, 1.15)) * 6.0;
  float va = fwidth(along) + 0.02;
  float side = (1.0 - smoothstep(0.05, 0.05 + va, abs(fract(along) - 0.5) * 2.0 - 0.9)) * smoothstep(0.04, 0.1, w) * (1.0 - smoothstep(0.82, 0.95, w)) * smoothstep(0.06, 0.16, u);
  float pucker = sin(3.14159 * fract(along)) * sin(3.14159 * min(w * 1.15, 1.0));
  vec3 c = diffuseColor.rgb * (0.9 + 0.16 * pucker);
  c = mix(c, c * vec3(1.25, 1.3, 1.05) + vec3(0.05, 0.06, 0.0), max(rib, side * 0.55));
  if (!gl_FrontFacing) c = mix(c, vec3(dot(c, vec3(0.3, 0.55, 0.15))) * vec3(0.95, 1.08, 0.85), 0.3) * 1.12;
  diffuseColor.rgb = c;
  leafHeight = (pucker * 0.25 + rib * 0.2 - side * 0.12) * resolved(0.6);
  leafRough = 0.24 + 0.12 * (1.0 - pucker);
}`,
        )
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = leafRough;")
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bumped(normal, leafHeight);")
        .replace(
          "#include <lights_fragment_end>",
          /* glsl */ `#include <lights_fragment_end>
{
  vec3 wn = inverseTransformDirection(normal, viewMatrix);
  vec3 sunDirView = normalize((viewMatrix * vec4(uSun, 0.0)).xyz);
  float behind = max(dot(-normal, sunDirView), 0.0) * max(dot(normalize(-vViewPosition), -sunDirView), 0.0);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.9, 1.1, 0.5) * behind * 0.6 * sunReach(vWorld, -wn) * directionalLights[0].color;
}`,
        );
    },
  });
  return material;
}

/** Marks a geometry's points as not on a leaf's blade, for the leaf material. */
export const notLeaf = (geometry: THREE.BufferGeometry) => {
  geometry.setAttribute("vein", new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2).fill(-9), 2));
  return geometry;
};

/**
 * Terracotta, and the soil in the pot: unglazed clay with fine pores and a
 * mottle from the kiln, and the white bloom of salts that soak through it.
 */
export function clayMaterial(sunlight: Sunlight) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.25 });
  sunlit(material, sunlight, "clay", {
    extra: (shader) => {
      withVarying(shader, "salt", "vSalt");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${NOISE}\n${BUMP}\nfloat clayHeight;`).replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
{
  vec3 p = vWorld;
  float mottle = vnoise3(p * 0.03) * 0.6 + vnoise3(p * 0.12) * 0.4;
  float pores = vnoise3(p * 1.6) * resolved(0.6) + 0.5 * (1.0 - resolved(0.6));
  float grit = step(0.93, hash31(floor(p * 2.5))) * resolved(0.4);
  vec3 c = diffuseColor.rgb * (0.92 + 0.14 * mottle) * (0.94 + 0.1 * pores);
  c = mix(c, c * 0.72, grit * 0.6);
  // Salts: chalky white, in drifts, where water has soaked up through the clay.
  float salts = smoothstep(0.62, 0.95, vnoise3(p * vec3(0.05, 0.1, 0.05)) * 0.7 + vnoise3(p * 0.4) * 0.3) * vSalt * (0.35 + 0.65 * (1.0 - smoothstep(0.0, 50.0, p.y)));
  c = mix(c, vec3(0.88, 0.84, 0.76), salts * 0.45);
  diffuseColor.rgb = c;
  clayHeight = pores * 0.08 - grit * 0.05;
}`,
      ).replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bumped(normal, clayHeight);");
    },
  });
  return material;
}

/**
 * Fruit skins, by `skin` (an attribute): 0 plain and glossy (the wine, the
 * honey), 1 a banana (freckles, darker brown where it is bruised, ridged), 2 a
 * peach's fuzz (a soft sheen at its edges), 3 a plum's bloom (dusty pale over
 * deep purple), 4 a peach's cut flesh (fibres running out from the stone,
 * wet), 5 the peach's stone (deeply wrinkled), 6 toast (a dry, open crumb,
 * its little holes dark), 7 honey in its jar and sea glass (glowing with the
 * light through them).
 */
export function fruitMaterial(sunlight: Sunlight, stone: THREE.Vector2) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, envMapIntensity: 0.6 });
  sunlit(material, sunlight, "fruit", {
    extra: (shader) => {
      withVarying(shader, "skin", "vSkin");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${NOISE}\n${BUMP}\nuniform vec2 uStone;\nfloat skinRough;\nfloat skinHeight;\nfloat sheen;`)
        .replace(
          "#include <color_fragment>",
          /* glsl */ `#include <color_fragment>
{
  vec3 p = vWorld;
  vec3 c = diffuseColor.rgb;
  skinRough = 0.3;
  skinHeight = 0.0;
  sheen = 0.0;
  int kind = int(vSkin + 0.5);
  if (kind == 0) {
    skinRough = 0.08;
  } else if (kind == 1) {
    // Sugar spots: little brown freckles, in clusters, bigger and darker as it ripens.
    float cluster = vnoise3(p * 0.06);
    float f = vnoise3(p * 0.9);
    float spot = smoothstep(0.78 - cluster * 0.22, 0.86 - cluster * 0.22, f) * resolved(0.7);
    // Where freckles crowd they merge into brown patches, seen from across the room.
    float patchy = smoothstep(0.5, 0.8, vnoise3(p * 0.16) * 0.6 + cluster * 0.4);
    float fine = step(0.86, hash31(floor(p * 3.0))) * resolved(0.25) * 0.6;
    float bruise = smoothstep(0.55, 0.85, vnoise3(p * 0.035 + 7.0));
    c = mix(c, vec3(0.36, 0.2, 0.08), max(max(spot, fine) * 0.85, patchy * 0.45 + (1.0 - resolved(0.7)) * cluster * 0.25));
    c = mix(c, vec3(0.42, 0.28, 0.12), bruise * 0.55);
    skinRough = 0.42 + spot * 0.2;
    skinHeight = vnoise3(p * 0.5) * 0.05 * resolved(0.5) - spot * 0.04;
  } else if (kind == 2) {
    float blush = vnoise3(p * 0.05) * 0.5 + 0.5;
    c *= 0.94 + 0.12 * vnoise3(p * 0.4);
    skinRough = 0.62;
    sheen = 0.55;
    skinHeight = vnoise3(p * 3.0) * 0.03 * resolved(0.3);
  } else if (kind == 3) {
    float bloom = vnoise3(p * 0.12) * 0.6 + vnoise3(p * 0.5) * 0.4;
    c = mix(c, vec3(0.55, 0.5, 0.68), smoothstep(0.35, 0.8, bloom) * 0.35);
    skinRough = 0.32 + bloom * 0.3;
    sheen = 0.25;
  } else if (kind == 4) {
    // Fibres radiating from the stone, and wet.
    float fibres = vnoise(vec2(atan(vWorld.z - uStone.y, vWorld.x - uStone.x) * 40.0, length(vWorld.xz - uStone.xy) * 0.6)) * resolved(0.3);
    c *= 0.92 + 0.16 * fibres;
    skinRough = 0.1;
    skinHeight = fibres * 0.04;
  } else if (kind == 5) {
    float wrinkle = abs(vnoise3(p * 0.9) - 0.5) * 2.0;
    c *= 0.65 + 0.5 * wrinkle;
    skinRough = 0.8;
    skinHeight = -wrinkle * 0.5 * resolved(0.4);
  } else if (kind == 7) {
    skinRough = 0.12;
  } else {
    // Toast: the crumb's open cells, a tenth of a millimetre and more across, dark where they open; matte and dry.
    float cells = vnoise3(p * 3.1) * 0.65 + vnoise3(p * 7.3) * 0.35;
    float hole = smoothstep(0.6, 0.74, cells) * resolved(0.25);
    c *= (0.88 + 0.2 * vnoise3(p * 1.1)) * (1.0 - hole * 0.5);
    skinRough = 0.88;
    skinHeight = (vnoise3(p * 2.0) * 0.05 - hole * 0.06) * resolved(0.3);
  }
  diffuseColor.rgb = c;
}`,
        )
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = skinRough;")
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bumped(normal, skinHeight);")
        .replace(
          "#include <lights_fragment_end>",
          /* glsl */ `#include <lights_fragment_end>
// Fuzz and bloom catch the light at the skin's edge.
reflectedLight.indirectDiffuse += sheen * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0) * diffuseColor.rgb * 0.9;
if (int(vSkin + 0.5) == 7) {
  // Honey and sea glass let the light through: lit from behind, they glow.
  vec3 sunDirView = normalize((viewMatrix * vec4(uSun, 0.0)).xyz);
  float behind = max(dot(-normal, sunDirView), 0.0) * (0.35 + 0.65 * max(dot(normalize(vViewPosition), sunDirView), 0.0));
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, 0.8, 0.45) * behind * 1.4 * sunReach(vWorld, -inverseTransformDirection(normal, viewMatrix)) * directionalLights[0].color;
}`,
        );
      shader.uniforms.uStone = { value: stone };
    },
  });
  return material;
}

/**
 * Glazed things: speckled stoneware, the fridge, the plates on the dresser,
 * the clocks' enamel and their dials, on which `faces` draws the hands
 * (clocks.ts) turned by `hands`.
 */
export function glazeMaterial(sunlight: Sunlight, faces: { hands: { value: THREE.Vector3 }; common: string; color: string }) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.24, metalness: 0, envMapIntensity: 0.45 });
  sunlit(material, sunlight, "glaze", {
    lamp: true,
    extra: (shader) => {
      withVarying(shader, "speckle", "vSpeckle");
      shader.uniforms.uClockHands = faces.hands;
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${NOISE}\n${BUMP}\n${faces.common}`).replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
{
  // Iron in the clay coming through the glaze as specks.
  vec3 cell = floor(vWorld * 1.4);
  float speck = step(0.955, hash31(cell)) * min(vSpeckle, 1.0);
  vec3 f = fract(vWorld * 1.4) - 0.5;
  speck *= 1.0 - smoothstep(0.1, 0.3, length(f));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.45, 0.35, 0.28), speck * resolved(0.7));
  if (vSpeckle > 1.5) {
    // Spongeware: cobalt dabbed on with a sponge, in a band, each dab a ring of open cells.
    vec3 q = vWorld * 0.22;
    float dab = vnoise3(q) * 0.6 + vnoise3(q * 2.7) * 0.3 + vnoise3(q * 9.0) * 0.1;
    float aa = fwidth(dab) + 0.004;
    float inDab = smoothstep(0.53 - aa, 0.53 + aa, dab);
    // A sponge's open cells: the colour lies in a lace of little dots, solid toward each dab's middle.
    float lace = vnoise3(vWorld * 1.6) * resolved(0.5) + 0.55 * (1.0 - resolved(0.5));
    float laceAa = fwidth(lace) + 0.01;
    float blue = inDab * mix(smoothstep(0.42 - laceAa, 0.42 + laceAa, lace), 1.0, smoothstep(0.58, 0.68, dab));
    float band = smoothstep(8.0, 13.0, vWorld.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.22, 0.5), blue * band * 0.8);
  }
}
${faces.color}`,
      );
    },
  });
  return material;
}

/**
 * Wall tiles and the floor's: glossy white metro tiles laid in courses on
 * the walls (75 by 150 mm), and terracotta quarry tiles on the floor (300 mm),
 * with grout between, each tile a little different and its edges rounded.
 */
export function tileMaterial(sunlight: Sunlight) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0, envMapIntensity: 0.7 });
  sunlit(material, sunlight, "tiles", {
    lamp: true,
    extra: (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${NOISE}\n${BUMP}\nfloat tileRough;\nfloat tileHeight;`)
        .replace(
          "#include <color_fragment>",
          /* glsl */ `#include <color_fragment>
{
  vec3 wn = inverseTransformDirection(normalize(vNormal), viewMatrix);
  bool floorTile = wn.y > 0.7;
  // On the walls the courses run from the window's corners, round them into its reveals and out along the wall.
  vec2 q = floorTile ? vWorld.xz / 300.0 : vec2(abs(wn.x) > 0.7 ? ${WINDOW.wall.toFixed(1)} - vWorld.z : abs(vWorld.x) - ${SILL.hx.toFixed(1)}, vWorld.y + 180.0) / vec2(150.0, 75.0);
  // Every other course shifted by half a tile on the walls.
  if (!floorTile) q.x += 0.5 * mod(floor(q.y), 2.0);
  vec2 id = floor(q);
  vec2 f = fract(q);
  vec2 size = floorTile ? vec2(300.0) : vec2(150.0, 75.0);
  vec2 edge = min(f, 1.0 - f) * size;
  float e = min(edge.x, edge.y);
  float groutW = floorTile ? 4.0 : 1.5;
  float aa = fwidth(e) + 0.05;
  float grout = 1.0 - smoothstep(groutW - aa, groutW + aa, e);
  float shade = hash21(id + 3.7);
  vec3 tile = floorTile ? mix(vec3(0.62, 0.3, 0.18), vec3(0.72, 0.4, 0.24), shade) * (0.9 + 0.1 * vnoise(vWorld.xz * 0.05)) : diffuseColor.rgb * (0.97 + 0.04 * shade);
  vec3 groutColor = floorTile ? vec3(0.55, 0.5, 0.44) : vec3(0.82, 0.8, 0.76);
  diffuseColor.rgb = mix(tile, groutColor, grout);
  tileRough = mix(floorTile ? 0.45 : 0.1, 0.9, grout);
  // Rounded edges: the tile's face curves down into the grout.
  tileHeight = smoothstep(groutW, groutW + (floorTile ? 6.0 : 3.0), e) * (floorTile ? 1.0 : 0.6);
}`,
        )
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = tileRough;")
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bumped(normal, tileHeight);");
    },
  });
  return material;
}

/**
 * Limewashed plaster and painted wood in the room: soft, a little uneven
 * where it was trowelled, sandy up close. Paper too: the bottle's label, the
 * honey's, and the postcard propped at the end of the sill, whose picture
 * (a lighthouse on a headland over a blue sea, a red sail, a beach) is
 * painted here on its face.
 */
export function plasterMaterial(sunlight: Sunlight) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, envMapIntensity: 0.35 });
  const { foot, z, width, length } = POSTCARD;
  const lean = Math.asin(foot / length);
  const v3 = (x: number, y: number, z: number) => `vec3(${x.toFixed(4)}, ${y.toFixed(4)}, ${z.toFixed(4)})`;
  sunlit(material, sunlight, "plaster", {
    lamp: true,
    extra: (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${NOISE}\n${BUMP}\nfloat plasterHeight;`)
        .replace(
          "#include <color_fragment>",
          /* glsl */ `#include <color_fragment>
{
  vec3 p = vWorld;
  float trowel = vnoise3(p * 0.012) * 0.6 + vnoise3(p * 0.05) * 0.4;
  float sand = vnoise3(p * 1.3) * resolved(0.5) + 0.5 * (1.0 - resolved(0.5));
  diffuseColor.rgb *= 0.95 + 0.07 * trowel + 0.03 * sand;
  plasterHeight = trowel * 0.6 + sand * 0.05;
  // The postcard's face: across it (0 to 1, left to right seen from the sill) and up it (0 at its foot).
  vec3 d = p - ${v3(SILL.hx - foot, 0, z - width / 2)};
  float u = d.z / ${width.toFixed(1)};
  float v = dot(d, ${v3(Math.sin(lean), Math.cos(lean), 0)}) / ${length.toFixed(1)};
  float n = dot(d, ${v3(-Math.cos(lean), Math.sin(lean), 0)});
  if (n > 0.05 && n < 0.6 && u > 0.0 && u < 1.0 && v > 0.0 && v < 1.0) {
    plasterHeight = 0.0;
    // The picture inside a white border, wider at its foot.
    vec2 q = vec2((u - 0.06) / 0.88, (v - 0.1) / 0.84);
    vec3 c = vec3(0.97, 0.96, 0.92);
    if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) {
      float horizon = 0.5 + 0.015 * sin(q.x * 9.0);
      vec3 sky = mix(vec3(0.66, 0.84, 0.97), vec3(0.12, 0.42, 0.86), smoothstep(horizon, 0.95, q.y));
      // A cloud.
      float cloud = smoothstep(0.62, 0.5, length((q - vec2(0.3, 0.84)) * vec2(1.0, 2.2))) + smoothstep(0.5, 0.38, length((q - vec2(0.44, 0.88)) * vec2(1.2, 2.6)));
      sky = mix(sky, vec3(1.0), clamp(cloud, 0.0, 1.0) * 0.9);
      // The sea, deep blue with white horses, paler toward the shore.
      float waves = smoothstep(0.75, 0.95, sin(q.x * 60.0 + sin(q.y * 90.0) * 2.0) * sin(q.y * 140.0)) * resolved(0.4);
      vec3 sea = mix(vec3(0.16, 0.42, 0.66), vec3(0.06, 0.24, 0.5), smoothstep(0.26, horizon, q.y));
      sea = mix(sea, vec3(0.92, 0.96, 1.0), waves * 0.7);
      vec3 sand = mix(vec3(0.93, 0.84, 0.62), vec3(0.8, 0.68, 0.46), smoothstep(0.18, 0.26, q.y));
      c = q.y > horizon ? sky : q.y > 0.24 + 0.02 * sin(q.x * 14.0) ? sea : sand;
      // The headland on the right, green over grey rock, and the lighthouse on it, banded red and white, its lamp lit.
      float land = 0.4 + 0.24 * smoothstep(0.5, 0.95, q.x) - 0.03 * sin(q.x * 23.0);
      if (q.y < land && q.x > 0.48) c = mix(vec3(0.52, 0.48, 0.42), vec3(0.3, 0.62, 0.22), smoothstep(land - 0.2, land - 0.12, q.y));
      float tower = abs(q.x - 0.78) - mix(0.065, 0.045, (q.y - 0.6) / 0.24);
      if (tower < 0.0 && q.y > 0.6 && q.y < 0.84) c = mod(floor((q.y - 0.6) / 0.06), 2.0) < 1.0 ? vec3(0.95, 0.94, 0.9) : vec3(0.78, 0.12, 0.1);
      if (abs(q.x - 0.78) < 0.045 && q.y > 0.84 && q.y < 0.89) c = vec3(1.0, 0.86, 0.4);
      if (abs(q.x - 0.78) < 0.055 - (q.y - 0.89) * 0.9 && q.y > 0.89 && q.y < 0.94) c = vec3(0.15, 0.14, 0.13);
      // A red sail out on the sea.
      vec2 b = q - vec2(0.26, 0.4);
      if (b.y > 0.0 && b.y < 0.1 && b.x > 0.0 && b.x < 0.07 * (1.0 - b.y / 0.1)) c = vec3(0.82, 0.18, 0.12);
      if (abs(b.y + 0.008) < 0.008 && abs(b.x - 0.03) < 0.05) c = vec3(0.3, 0.2, 0.15);
    }
    // Printed: a fine dot screen, and the card's own cream.
    c *= 0.96 + 0.04 * vnoise(vec2(u, v) * 900.0) * resolved(0.2);
    diffuseColor.rgb = c;
  }
}`,
        )
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bumped(normal, plasterHeight);");
    },
  });
  return material;
}

/**
 * A linen tea towel: oatmeal linen in a plain weave, its threads uneven as
 * linen's are, with a red stripe either side, hemmed and stitched. `uv` runs
 * across it (u) and along it (v, in millimetres), over the sill and down
 * over its edge.
 */
export function towelMaterial(sunlight: Sunlight, width: number) {
  const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, metalness: 0, envMapIntensity: 0.3, side: THREE.DoubleSide });
  sunlit(material, sunlight, "towel", {
    extra: (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vCloth;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCloth = uv;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${NOISE}\n${BUMP}\nuniform float uTowelWidth;\nvarying vec2 vCloth;\nfloat clothHeight;`)
        .replace(
          "#include <color_fragment>",
          /* glsl */ `#include <color_fragment>
{
  // Millimetres across and along, and the threads: 0.3 mm apart, each a little thicker or thinner along its length (linen's slubs).
  vec2 mm = vCloth;
  vec2 th = mm / 0.3;
  float detail = 1.0 - smoothstep(0.2, 0.5, max(fwidth(th.x), fwidth(th.y)));
  // The stripes run along it: a broad red one and a thin one near each long edge.
  float edgeDist = min(mm.x, uTowelWidth - mm.x);
  float stripe = smoothstep(9.0, 9.4, edgeDist) * (1.0 - smoothstep(15.0, 15.4, edgeDist)) + smoothstep(18.0, 18.3, edgeDist) * (1.0 - smoothstep(19.6, 19.9, edgeDist));
  vec3 linen = vec3(0.86, 0.81, 0.71) * (0.94 + 0.08 * vnoise(vec2(mm.x * 0.05, mm.y * 0.8)));
  vec3 red = vec3(0.72, 0.13, 0.12);
  vec3 cloth = mix(linen, red, stripe);
  if (detail > 0.0) {
    vec2 f = fract(th);
    bool warpOnTop = mod(floor(th.x) + floor(th.y), 2.0) < 1.0;
    float across = warpOnTop ? f.x : f.y;
    float slub = 0.75 + 0.5 * vnoise(warpOnTop ? vec2(floor(th.x) * 7.1, mm.y * 0.3) : vec2(floor(th.y) * 5.3, mm.x * 0.3));
    float bulge = pow(max(sin(3.14159 * across), 0.0), 0.6 / slub);
    vec3 thread = cloth * (0.78 + 0.26 * bulge);
    cloth = mix(cloth, thread, detail);
    clothHeight = bulge * 0.06 * detail;
  } else clothHeight = 0.0;
  // The hem along each long edge, turned under and stitched.
  float hem = 1.0 - smoothstep(3.5, 3.8, edgeDist);
  cloth *= 1.0 - hem * 0.08;
  float stitch = (1.0 - smoothstep(0.12, 0.12 + fwidth(edgeDist) + 0.05, abs(edgeDist - 2.6))) * step(0.4, fract(mm.y / 2.2));
  cloth = mix(cloth, cloth * 0.7, stitch * 0.8);
  diffuseColor.rgb = cloth;
}`,
        )
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bumped(normal, clothHeight);");
      shader.uniforms.uTowelWidth = { value: width };
    },
  });
  return material;
}
