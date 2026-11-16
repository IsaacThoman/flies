// The restaurant's materials. Everything solid, the room included, is one
// material, and everything clear (glass, wine, water, spills) another: each
// vertex says what it is (kinds.ts) and the shader gives it its look
// (surfaces.ts) and its light (light.ts). The far stand-ins are the same
// materials again with the near mask (set.ts): the vertex shader folds away
// the stand-ins of the areas being drawn in detail, so switching costs
// nothing but a uniform, and the fly's eyes get a copy that folds nothing.

import * as THREE from "three";
import type { WallClock } from "../../scene/clock.ts";
import { streetLightUniforms } from "./traffic.ts";
import { AREA_STRIDE, KINDS_GLSL } from "./kinds.ts";
import { CASTERS, NOISE, SHADE, hookedLights } from "./light.ts";
import { PARTS } from "./parts.ts";
import type { PartGlsl } from "./parts.ts";
import { SURFACE_COLOR, SURFACE_EMISSIVE, SURFACE_FINISH, SURFACE_HEAD } from "./surfaces.ts";

/** Every part's GLSL of one kind, for one material. */
const parts = (material: "solid" | "clear", key: keyof PartGlsl) =>
  Object.values(PARTS)
    .map((p) => p[material]?.[key] ?? "")
    .join("\n");

/** How many rings can spread at once, on any pool. */
export const RIPPLES = 4;

/** The uniforms every material in the room shares, filled by the set's update. */
export type Shared = ReturnType<typeof sharedUniforms>;

export function sharedUniforms(floorAO: THREE.Texture, clock: WallClock) {
  return {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uSunSoft: { value: 0.1 },
    /** The sky (or the street) through the glass: the light it would give a surface facing a window filling its view. */
    uWindow: { value: new THREE.Color() },
    uFridge: { value: new THREE.Color() },
    uExit: { value: new THREE.Color() },
    uKitchen: { value: new THREE.Color() },
    uHeat: { value: new THREE.Color() },
    /** The lit pendant: where it is, and how bright (0 off). */
    uPendant: { value: new THREE.Vector4() },
    uPendantColor: { value: new THREE.Color("#ffc890") },
    uOpening: { value: 0 },
    uFloorAO: { value: floorAO },
    /** The casters of the area the camera is in, and the box they shadow (x0, x1, z0, z1 and y0, y1). */
    uCast: { value: new Float32Array(CASTERS * 4) },
    uCastTint: { value: new Float32Array(CASTERS * 4) },
    uCastBottom: { value: new Float32Array(CASTERS) },
    uCastBox: { value: new THREE.Vector4(1, -1, 1, -1) },
    uCastY: { value: new THREE.Vector2(1, -1) },
    /** Rings, stains and smears on that area's table top: x, z, radius, and what (0 wine, 1 coffee, 2 water). */
    uRings: { value: new Float32Array(6 * 4) },
    uRipples: { value: new Float32Array(RIPPLES * 4).fill(-100) },
    /** The clock's hands (scene/clock.ts). */
    uClockHands: clock.hands,
    ...streetLightUniforms,
  };
}

/** Where each fragment is in the room, which way it faces there, and what it is; and the stand-ins folded away. */
const VERTEX_HEAD = /* glsl */ `
attribute float kind;
varying float vKind;
varying vec3 vWorld;
varying vec3 vWorldNormal;
uniform int uNear;
uniform float uEye;
${KINDS_GLSL}`;

const VERTEX_BODY = /* glsl */ `
{
  vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
  int rWhole = int(kind + 0.5);
  int rArea = rWhole / ${AREA_STRIDE};
  int rKind = rWhole - rArea * ${AREA_STRIDE};
  vKind = float(rKind);
  // An area drawn in detail has its stand-in folded to a point outside the view; the openings are the eyes' alone.
  if ((rArea > 0 && ((uNear >> rArea) & 1) == 1) || (rKind == K_OPENING && uEye < 0.5)) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}`;

type Patch = {
  key: string;
  uniforms: Record<string, THREE.IUniform>;
  head: string;
  color: string;
  surface: string;
  /** After the normal maps (and the surface's bump): change `normal` (view space). */
  normal?: string;
  emissive?: string;
  physical?: string;
  /** After the environment's light: add the room's lights. */
  ambient: string;
  /** After the lights are summed. */
  after?: string;
  final?: string;
};

/** Adds to a physical material's shader, keeping everything three.js does. */
function patch(material: THREE.MeshPhysicalMaterial, p: Patch) {
  // Where the stage finds the textures among them to free when the fly leaves (scene/build.ts disposeAll).
  material.userData.uniforms = p.uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, p.uniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${VERTEX_HEAD}`).replace("#include <project_vertex>", `#include <project_vertex>\n${VERTEX_BODY}`);
    const at = (fs: string, chunk: string, add: string | undefined) => {
      if (!add) return fs;
      const find = `#include <${chunk}>`;
      if (!fs.includes(find)) throw new Error(`three.js shader changed: ${find}`);
      return fs.replace(find, `${find}\n${add}`);
    };
    let fs = shader.fragmentShader.replace("#include <common>", `#include <common>\nvarying float vKind;\nvarying vec3 vWorld;\nvarying vec3 vWorldNormal;\n${KINDS_GLSL}\n${NOISE}\n${SHADE}\n${p.head}`);
    fs = at(fs, "color_fragment", p.color);
    fs = at(fs, "metalnessmap_fragment", p.surface);
    fs = at(fs, "normal_fragment_maps", "if (dot(rBump, rBump) > 0.0) normal = normalize(normal + (viewMatrix * vec4(rBump, 0.0)).xyz);\n" + (p.normal ?? ""));
    fs = at(fs, "emissivemap_fragment", p.emissive);
    fs = at(fs, "lights_physical_fragment", p.physical);
    fs = fs.replace("#include <lights_fragment_begin>", hookedLights());
    fs = at(fs, "lights_fragment_maps", p.ambient);
    fs = at(fs, "lights_fragment_end", p.after);
    if (p.final) fs = fs.replace("#include <opaque_fragment>", `${p.final}\n#include <opaque_fragment>`);
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => `restaurant-${p.key}`;
}

/**
 * The room's own lights, added where the environment's are: the window, the
 * fridge, the exit sign, the kitchen as diffuse light; the pendant as a lamp
 * with its highlights; the street's light, shadowed by the room.
 */
const ROOM_LIGHTS = /* glsl */ `
{
  vec3 wn = rWorldDir(geometryNormal);
  // The stage's reflections are a soft sky round everything: as diffuse light indoors they would fill every shadow.
  iblIrradiance *= 0.15;
  irradiance += rRoomLight(vWorld, wn);
  if (uPendant.w > 0.0) {
    IncidentLight lamp;
    vec3 color;
    vec3 dir = rPendantDir(vWorld, color);
    lamp.direction = normalize((viewMatrix * vec4(dir, 0.0)).xyz);
    lamp.color = color * rPendantShadow(vWorld);
    lamp.visible = true;
    RE_Direct(lamp, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  }
  vec3 street = streetLight(vWorld, wn);
  if (street.r + street.g + street.b > 0.0) reflectedLight.directDiffuse += street * rStreetShadow(vWorld) * diffuseColor.rgb;
}`;

const SOLID_AFTER = /* glsl */ `
reflectedLight.indirectDiffuse *= rAO;
reflectedLight.directDiffuse *= mix(1.0, rAO, 0.5);
reflectedLight.indirectSpecular *= rAO * 0.6;
#ifdef USE_CLEARCOAT
clearcoatSpecularIndirect *= rAO * 0.5;
#endif`;

/** The solid things' material: the room, the furniture, everything on it. */
export function solidMaterial(shared: Shared, near: { value: number }, eye = false) {
  const material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.8 });
  patch(material, {
    key: "solid",
    uniforms: { ...shared, uNear: near, uEye: { value: eye ? 1 : 0 } },
    head: SURFACE_HEAD + parts("solid", "head"),
    color: SURFACE_COLOR + parts("solid", "color") + SURFACE_FINISH,
    surface: "roughnessFactor = rRough;\nmetalnessFactor = rMetal;",
    emissive: SURFACE_EMISSIVE + parts("solid", "emissive") + "\ntotalEmissiveRadiance += rEmit;",
    physical: "material.clearcoat = rCoat;\nmaterial.clearcoatRoughness = max(material.clearcoatRoughness, rCoatRough);",
    ambient: ROOM_LIGHTS,
    after: SOLID_AFTER,
  });
  return material;
}

const CLEAR_HEAD = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform vec4 uRipples[${RIPPLES}];
float rAlpha;
float rRough;
vec3 rBump;
`;

const CLEAR_COLOR = /* glsl */ `
int rK = int(vKind + 0.5);
rCasting = rInCast();
rAlpha = 1.0;
rRough = 0.04;
rBump = vec3(0.0);
if (rK == K_GLASS || rK == K_FRIDGE_GLASS) diffuseColor.rgb *= 0.04;
if (rK == K_WINE) rAlpha = 0.86;
if (rK == K_WHITE_WINE) rAlpha = 0.45;
if (rK == K_WATER) { diffuseColor.rgb *= 0.15; rAlpha = 0.2; }
if (rK == K_FILM) { rAlpha = 0.45; rRough = 0.03; }
if (rK == K_BOTTLE) rAlpha = 0.82;
`;

const CLEAR_NORMAL = /* glsl */ `
if (rK == K_FILM || rK == K_WINE || rK == K_WHITE_WINE) {
  // Rings spreading from where a foot touched, a millimetre apart, dying away.
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
  if (abs(vWorldNormal.y) > 0.7) {
    diffuseColor.rgb *= 1.0 + shade * 0.2;
    normal = normalize((viewMatrix * vec4(normalize(vec3(-slope.x, 1.0, -slope.y)), 0.0)).xyz);
  }
}`;

const CLEAR_FINAL = /* glsl */ `
{
  float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float edge = pow(1.0 - facing, 2.5);
  if (rK == K_GLASS) rAlpha = 0.04 + edge * 0.7 + min(dot(outgoingLight, vec3(0.1)), 0.15);
  if (rK == K_FRIDGE_GLASS) rAlpha = 0.08 + edge * 0.5;
  if (rK == K_WINE || rK == K_WHITE_WINE || rK == K_BOTTLE) rAlpha = min(1.0, rAlpha + edge * 0.3);
  if (rK == K_FILM || rK == K_WATER) rAlpha = min(1.0, rAlpha + edge * 0.5 + dot(outgoingLight, vec3(0.05)));
  ${parts("clear", "final")}
  diffuseColor.a = clamp(rAlpha, 0.0, 1.0);
}`;

/** The clear things' material: glass, wine, water and spills. */
export function clearMaterial(shared: Shared, near: { value: number }) {
  const material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.04, metalness: 0, transparent: true, depthWrite: false, envMapIntensity: 1.4 });
  patch(material, {
    key: "clear",
    uniforms: { ...shared, uNear: near, uEye: { value: 0 } },
    head: CLEAR_HEAD + parts("clear", "head"),
    color: CLEAR_COLOR + parts("clear", "color"),
    surface: "roughnessFactor = rRough;",
    normal: CLEAR_NORMAL,
    ambient: ROOM_LIGHTS.replace("iblIrradiance *= 0.15;", "iblIrradiance *= 0.3;"),
    // Light from all round comes through wine and out toward you: it glows its own colour a little.
    emissive: "if (rK == K_WINE || rK == K_WHITE_WINE || rK == K_BOTTLE) totalEmissiveRadiance += diffuseColor.rgb * 0.04;\n" + parts("clear", "emissive"),
    final: CLEAR_FINAL,
  });
  return material;
}
