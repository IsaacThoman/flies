// three's physical material, taught to read the rig. The vertex stage moves
// each vertex by its joint's frame from a uniform array (rigid skinning: one
// joint per vertex, no weights) and keeps tube-like parts at least a pixel
// wide; the fragment stage takes roughness, clearcoat and sheen per vertex,
// draws the facets and the pseudopupil of the compound eyes, and, when the
// scene has no environment map, reflects a soft painted sky so that the
// cuticle and the eyes stay glossy under any lights. Everything else (lights,
// shadows, fog, tone mapping) is three's own, so the fly sits in whatever
// world the game builds.

import * as THREE from "three";
import { BODY_JOINTS, WING_JOINTS } from "./anatomy.ts";

/** Thin parts are drawn at least this wide (radius, in pixels), so they never break up into dots. */
const MIN_RADIUS_PX = "0.55";

export type FlyUniforms = {
  uJoints: { value: Float32Array };
  uWings: { value: Float32Array };
  uWingAlpha: { value: Float32Array };
  /** Opacity of the haze between the wing copies: zero unless the wings beat. */
  uWingHaze: { value: number };
  /** Half the height of the viewport in pixels: how big a body length looks. */
  uPixels: { value: number };
  /** Strength of the painted sky reflection used when there is no environment map. */
  uSky: { value: number };
  /** 0 to 1: how far the cuticle has turned to a glassy shell to show the nervous system inside (the X-ray). */
  uXray: { value: number };
  /** How brightly each part of the nervous system glows, 0 to 1, a float a part (nerves/parts.ts). */
  uGlow: { value: Float32Array };
};

/** The rig's joint frames as a uniform array of three vec4 rows a joint, and the two ways to apply one. */
export const JOINT_PARS = (uniform: string, count: number) => /* glsl */ `
attribute float aJoint;
uniform vec4 ${uniform}[${count * 3}];
vec3 flyApply(int j, vec3 p) {
  vec4 a = ${uniform}[j], b = ${uniform}[j + 1], c = ${uniform}[j + 2];
  return vec3(dot(a.xyz, p) + a.w, dot(b.xyz, p) + b.w, dot(c.xyz, p) + c.w);
}
vec3 flyRotate(int j, vec3 d) {
  return vec3(dot(${uniform}[j].xyz, d), dot(${uniform}[j + 1].xyz, d), dot(${uniform}[j + 2].xyz, d));
}
`;

const BODY_VERTEX_PARS = /* glsl */ `
${JOINT_PARS("uJoints", BODY_JOINTS)}
attribute vec4 aTube;
attribute vec4 aHair;
attribute vec4 aMat;
attribute vec2 aEye;
uniform float uPixels;
varying vec4 vFlyMat;
varying vec2 vFlyEye;
`;

const BODY_BEGIN_NORMAL = /* glsl */ `
vec3 objectNormal = normalize(flyRotate(int(aJoint + 0.5) * 3, normal));
`;

// Tubes are stored as an axis point and a radius. Measure the radius in
// pixels; if it is under the minimum, push the surface out from the axis.
// Fine hairs instead shrink back to their roots as they get too thin, so a
// small fly is not furred with one-pixel lines.
const BODY_BEGIN_VERTEX = /* glsl */ `
int flyJ = int(aJoint + 0.5) * 3;
vec3 transformed = position;
vFlyMat = aMat;
vFlyEye = aEye;
if (aTube.w > 0.0) {
  vec4 flyAxisView = modelViewMatrix * vec4(flyApply(flyJ, aTube.xyz), 1.0);
  float flyClipW = projectionMatrix[2][3] * flyAxisView.z + projectionMatrix[3][3];
  float flyPx = aTube.w * length(modelViewMatrix[0].xyz) * projectionMatrix[1][1] * uPixels / max(flyClipW, 1e-6);
  vec3 flyAxis = aTube.xyz;
  float flyGrow = max(1.0, ${MIN_RADIUS_PX} / max(flyPx, 1e-6));
  if (aHair.w > 0.0) {
    float flyShown = smoothstep(0.1, 0.35, flyPx * aHair.w / aTube.w);
    flyAxis = mix(aHair.xyz, aTube.xyz, flyShown);
    flyGrow *= flyShown;
  }
  transformed = flyAxis + (position - aTube.xyz) * flyGrow;
}
transformed = flyApply(flyJ, transformed);
`;

const SKY = /* glsl */ `
uniform float uSky;
vec3 flySky(vec3 d, float rough) {
  vec3 zenith = vec3(0.3, 0.55, 0.95), horizon = vec3(0.9, 0.95, 1.0), ground = vec3(0.28, 0.33, 0.24);
  vec3 c = mix(ground, mix(horizon, zenith, smoothstep(0.0, 0.9, d.y)), smoothstep(-0.3, 0.05, d.y));
  // A soft window up and in front: the studio light that puts the highlight on glossy things.
  float window = smoothstep(mix(0.96, 0.55, rough), 1.0, dot(d, vec3(-0.27, 0.77, 0.58)));
  return (c + window * mix(3.5, 0.5, rough)) * uSky;
}
`;

const SKY_REFLECTION = /* glsl */ `
#ifndef USE_ENVMAP
  radiance += flySky(inverseTransformDirection(reflect(-geometryViewDir, geometryNormal), viewMatrix), material.roughness);
  #ifdef USE_CLEARCOAT
    clearcoatRadiance += flySky(inverseTransformDirection(reflect(-geometryViewDir, geometryClearcoatNormal), viewMatrix), material.clearcoatRoughness);
  #endif
#endif
`;

// Fine hairs (microchaetae) on the thorax: a jittered lattice of short dark
// hairs lying back along the body, fading out like the facets do.
const HAIRS = /* glsl */ `
if (vFlyMat.w > 1.5) {
  vec2 g = vFlyEye;
  vec2 gw = fwidth(g);
  float detail = 1.0 - smoothstep(0.2, 0.55, max(gw.x, gw.y));
  vec2 cell = floor(g);
  vec2 jitter = fract(sin(vec2(dot(cell, vec2(127.1, 311.7)), dot(cell, vec2(269.5, 183.3)))) * 43758.5453) - 0.5;
  vec2 f = fract(g) - 0.5 - jitter * 0.5;
  float hair = 1.0 - smoothstep(0.1, 0.18, length(vec2(f.x * 2.4, f.y * 0.8)));
  diffuseColor.rgb *= 1.0 - 0.5 * hair * detail;
}
`;

// Compound eye: a hexagonal lattice of facets, each a little dome, fading
// out when facets get smaller than a pixel (by their screen-space
// derivatives), plus the pseudopupil: the dark spot where you look straight
// down the ommatidia, which follows the viewer across the eye.
const EYE = /* glsl */ `
if (vFlyMat.w > 0.5 && vFlyMat.w < 1.5) {
  vec2 g = vFlyEye;
  vec2 gw = fwidth(g);
  float detail = 1.0 - smoothstep(0.3, 0.85, max(gw.x, gw.y));
  const vec2 hexStep = vec2(1.0, 1.7320508);
  vec2 ha = mod(g, hexStep) - hexStep * 0.5;
  vec2 hb = mod(g - hexStep * 0.5, hexStep) - hexStep * 0.5;
  vec2 cell = dot(ha, ha) < dot(hb, hb) ? ha : hb;
  float edge = length(cell) * 2.0;
  vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
  vec2 st0 = dFdx(g), st1 = dFdy(g);
  vec3 q1perp = cross(q1, normal), q0perp = cross(normal, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x;
  vec3 B = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float tScale = det == 0.0 ? 0.0 : inversesqrt(det);
  normal = normalize(normal + (T * cell.x + B * cell.y) * tScale * 0.7 * detail);
  diffuseColor.rgb *= mix(1.0, 0.8 + 0.2 * (1.0 - smoothstep(0.75, 1.0, edge)), detail);
  float facing = dot(nonPerturbedNormal, normalize(vViewPosition));
  diffuseColor.rgb *= 1.0 - 0.55 * smoothstep(0.93, 0.995, facing);
}
`;

function bodyVertex(shader: THREE.WebGLProgramParametersWithUniforms, withNormal: boolean) {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${BODY_VERTEX_PARS}`)
    .replace("#include <begin_vertex>", BODY_BEGIN_VERTEX);
  if (withNormal) shader.vertexShader = shader.vertexShader.replace("#include <beginnormal_vertex>", BODY_BEGIN_NORMAL);
}

// The X-ray: the cuticle fades to a smoky glass shell, faint and dark across
// its face and stronger at its edge as glass is, so the fly keeps its outline
// and colours while what is inside shows through, a little darker than the
// world behind it so that it stands out in daylight. Its reflections stay at full strength
// (added to the blend, as the wings do), so it still reads as a hard, glossy
// surface. The eyes stay a little more tinted than the rest. At uXray 0 it is
// the opaque body exactly.
const GLASS = /* glsl */ `
{
  float flyEdge = 1.0 - abs(dot(normal, normalize(vViewPosition)));
  float flyClear = (vFlyMat.w > 0.5 && vFlyMat.w < 1.5 ? 0.18 : 0.16) + 0.55 * flyEdge * flyEdge * flyEdge;
  float flyA0 = mix(1.0, flyClear, uXray);
  vec3 flyShine = max(outgoingLight - totalDiffuse, vec3(0.0));
  float flyA1 = min(1.0, flyA0 + dot(flyShine, vec3(0.2126, 0.7152, 0.0722)) * uXray);
  // Smoky across its face, so what is inside sits a little darker than the world behind.
  vec3 flyGlass = totalDiffuse * mix(0.35, 1.0, flyEdge);
  outgoingLight = mix(outgoingLight, (flyGlass * flyA0 + flyShine) / max(flyA1, 1e-4), uXray);
  diffuseColor.a = flyA1;
}
`;

/**
 * The body: everything but the wings. Opaque; or, with `glass`, the same
 * body as the X-ray's clear shell, drawn with the transparent things.
 */
export function createBodyMaterial(uniforms: FlyUniforms, glass = false): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.5, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.22,
    sheen: 1, sheenRoughness: 0.55, sheenColor: 0xffffff, ior: 1.5, transparent: glass,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uJoints: uniforms.uJoints, uPixels: uniforms.uPixels, uSky: uniforms.uSky, uXray: uniforms.uXray });
    bodyVertex(shader, true);
    if (glass) shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `${GLASS}\n#include <opaque_fragment>`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec4 vFlyMat;\nvarying vec2 vFlyEye;\nuniform float uXray;\n${SKY}`)
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vFlyMat.x;")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${EYE}\n${HAIRS}`)
      .replace(
        "#include <lights_physical_fragment>",
        `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat = vFlyMat.y;
#endif
#ifdef USE_SHEEN
  material.sheenColor = mix(vec3(1.0), diffuseColor.rgb, 0.5) * vFlyMat.z * 0.45;
#endif`,
      )
      .replace("#include <lights_fragment_maps>", `#include <lights_fragment_maps>\n${SKY_REFLECTION}`);
  };
  material.customProgramCacheKey = () => (glass ? "fly-body-glass" : "fly-body");
  return material;
}

/** Shadow-map materials for the body, so it casts shadows in its pose. */
export function createBodyDepthMaterials(uniforms: FlyUniforms) {
  const inject = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, { uJoints: uniforms.uJoints, uPixels: uniforms.uPixels });
    bodyVertex(shader, false);
  };
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = inject;
  depth.customProgramCacheKey = () => "fly-body-depth";
  const distance = new THREE.MeshDistanceMaterial();
  distance.onBeforeCompile = inject;
  distance.customProgramCacheKey = () => "fly-body-distance";
  return { depth, distance };
}

const WING_VERTEX_PARS = /* glsl */ `
${JOINT_PARS("uWings", WING_JOINTS)}
attribute float aFan;
uniform float uWingAlpha[${WING_JOINTS}];
uniform float uWingHaze;
varying float vFlyAlpha;
`;

function wingShaders(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: FlyUniforms, shadow: boolean) {
  Object.assign(shader.uniforms, { uWings: uniforms.uWings, uWingAlpha: uniforms.uWingAlpha, uWingHaze: uniforms.uWingHaze });
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${WING_VERTEX_PARS}`)
    .replace(
      "#include <begin_vertex>",
      `int flyJ = int(aJoint + 0.5);\nvFlyAlpha = aFan > 0.0 ? aFan * uWingHaze : uWingAlpha[flyJ];\nvec3 transformed = flyApply(flyJ * 3, position);`,
    );
  if (!shadow) shader.vertexShader = shader.vertexShader.replace("#include <beginnormal_vertex>", "vec3 objectNormal = flyRotate(int(aJoint + 0.5) * 3, normal);");
  // The shadow pass copies the wing material's alphaTest (none) over its own, so it cuts out the faint parts itself.
  const cut = shadow ? "0.3" : "0.004";
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying float vFlyAlpha;")
    .replace("#include <map_fragment>", `#include <map_fragment>\ndiffuseColor.a *= vFlyAlpha;\nif (diffuseColor.a < ${cut}) discard;`);
}

/**
 * The wings: clear membrane with a thin-film shimmer. Reflections are added
 * to the blend rather than scaled by the membrane's low opacity, as glass
 * reflects whatever it lets through.
 */
export function createWingMaterial(uniforms: FlyUniforms, map: THREE.Texture): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    map, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    roughness: 0.28, metalness: 0, ior: 1.45, iridescence: 1, iridescenceIOR: 1.33, iridescenceThicknessRange: [200, 380],
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uSky: uniforms.uSky });
    wingShaders(shader, uniforms, false);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${SKY}`)
      .replace("#include <lights_fragment_maps>", `#include <lights_fragment_maps>\n${SKY_REFLECTION}`)
      .replace(
        "#include <opaque_fragment>",
        `{
  float flyA0 = diffuseColor.a;
  vec3 flyShine = totalSpecular * vFlyAlpha;
  float flyA1 = min(1.0, flyA0 + dot(flyShine, vec3(0.2126, 0.7152, 0.0722)));
  outgoingLight = (totalDiffuse * flyA0 + flyShine) / max(flyA1, 1e-4);
  diffuseColor.a = flyA1;
}
#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "fly-wing";
  return material;
}

/** The wings cast shadows from their veins only: the membrane lets the light through. */
export function createWingDepthMaterial(uniforms: FlyUniforms, map: THREE.Texture): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => wingShaders(shader, uniforms, true);
  material.customProgramCacheKey = () => "fly-wing-depth";
  return material;
}
