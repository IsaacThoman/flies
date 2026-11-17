// The lab bench's materials. Almost everything opaque on the bench is one
// material, so it merges into a couple of draws: each piece carries its own
// finish per vertex (how rough, how metallic, foam pores or grains of
// cornmeal, and whether it glows when the lamp is on), and the fine detail is
// worked out in the shader, in millimetres of the world, so it stays crisp
// however close the camera comes.

import * as THREE from "three";

/** The lab's back wall, mm from the bench's middle, and its windows: their middles across, their open part, and where the blinds begin. */
export const BACK_Z = -2300;
export const WINDOWS = { xs: [-1550, 0, 1550], hw: 640, frame: 25, y0: 120, y1: 1560, blinds: 1080 };
/** The ceiling, mm above the bench, and the middles of its light panels (x, z), each 640 by 1240. */
export const CEILING_Y = 1800;
export const PANELS: readonly (readonly [number, number])[] = [[-1300, -900], [1300, -900], [-1300, 1300], [1300, 1300], [0, 200]];

/**
 * The sun through the windows: how much of it falls on a point, facing a
 * way. A point is lit if the way to the sun from it passes through a
 * window's glass; the frames cast their shadows, and the blinds over the
 * windows' tops let it through in slits. The room's patches and the
 * bench's are worked out alike, so a beam crosses both.
 */
export const WINDOW_LIGHT = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunBeam;
float labWindowLight(vec3 p, vec3 n) {
  if (uSunBeam <= 0.0 || uSunDir.z > -0.05) return 0.0;
  float t = (${BACK_Z.toFixed(1)} - p.z) / uSunDir.z;
  vec3 at = p + uSunDir * t;
  // A finite sun and the distance from the pane soften every frame edge; subpixel slats merge into their average.
  vec2 edge = max(fwidth(at.xy), vec2(4.0 + max(t, 0.0) * 0.006));
  float glass = 0.0;
  ${WINDOWS.xs.map((x) => `glass += (1.0 - smoothstep(${(WINDOWS.hw - WINDOWS.frame).toFixed(1)} - edge.x, ${(WINDOWS.hw - WINDOWS.frame).toFixed(1)} + edge.x, abs(at.x - (${x.toFixed(1)})))) * smoothstep(${WINDOWS.frame.toFixed(1)} - edge.x, ${WINDOWS.frame.toFixed(1)} + edge.x, abs(at.x - (${x.toFixed(1)})));`).join("\n  ")}
  float open = smoothstep(${(WINDOWS.y0 + WINDOWS.frame).toFixed(1)} - edge.y, ${(WINDOWS.y0 + WINDOWS.frame).toFixed(1)} + edge.y, at.y) * (1.0 - smoothstep(${(WINDOWS.y1 - WINDOWS.frame).toFixed(1)} - edge.y, ${(WINDOWS.y1 - WINDOWS.frame).toFixed(1)} + edge.y, at.y));
  float stripe = abs(fract(at.y / 24.0) - 0.775);
  float slat = 1.0 - smoothstep(0.225 - edge.y / 24.0, 0.225 + edge.y / 24.0, stripe);
  slat = mix(slat, 0.45, smoothstep(0.2, 0.6, edge.y / 24.0));
  float slats = mix(1.0, slat * 0.8, smoothstep(${WINDOWS.blinds.toFixed(1)} - edge.y, ${WINDOWS.blinds.toFixed(1)} + edge.y, at.y));
  return min(glass, 1.0) * open * slats * step(0.0, t) * max(dot(n, uSunDir), 0.0);
}`;

/** The direct sun through the windows, against the palette's "sun" (the daylight from them all round): this many times as bright. */
export const SUNBEAM = 2.2;

/** The sun through the windows, for a material's shader: its uniforms. */
export type Sunbeam = { uSunDir: { value: THREE.Vector3 }; uSunColor: { value: THREE.Color }; uSunBeam: { value: number } };
export const sunbeam = (): Sunbeam => ({ uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uSunBeam: { value: 0 } });

/** Adds the sun through the windows to a standard material's light, at its world position `vWorld`. */
const BEAM_FRAGMENT = /* glsl */ `
reflectedLight.directDiffuse += uSunColor * uSunBeam * labWindowLight(vWorld, normalize((vec4(normal, 0.0) * viewMatrix).xyz)) * BRDF_Lambert(diffuseColor.rgb);`;

/** A piece's finish: roughness, metalness, texture (above 0 foam pores, below 0 grains of cornmeal), glow (lit by the lamp's bulb). */
export type Finish = { rough: number; metal?: number; texture?: number; glow?: number };

/** Gives every vertex of a painted piece its finish, for the surface material. */
export function finish(geometry: THREE.BufferGeometry, f: Finish): THREE.BufferGeometry {
  const n = geometry.attributes.position.count;
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) data.set([f.rough, f.metal ?? 0, f.texture ?? 0, f.glow ?? 0], i * 4);
  geometry.setAttribute("surface", new THREE.BufferAttribute(data, 4));
  return geometry;
}

/** World position, for patterns laid out in millimetres; instanced meshes too. */
const WORLD_VS = /* glsl */ `
vec4 labWorld = modelMatrix * vec4(transformed, 1.0);
#ifdef USE_INSTANCING
labWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
#endif
vWorld = labWorld.xyz;`;

/** Hashes and smooth noise, shared by the shaders. */
const NOISE = /* glsl */ `
// Hashes without trigonometry (Dave Hoskins'), cheap on the TV's GPU.
float labHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 labHash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// Smooth value noise.
float labNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(labHash(i), labHash(i + vec3(1, 0, 0)), f.x), mix(labHash(i + vec3(0, 1, 0)), labHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(labHash(i + vec3(0, 0, 1)), labHash(i + vec3(1, 0, 1)), f.x), mix(labHash(i + vec3(0, 1, 1)), labHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}`;

/**
 * What a glossy thing on the bench sees reflected, besides the sky-like
 * gradient of the room the stage gives every place: the windows behind the
 * bench, the colour of the sky outside them (bright by day, glowing at dusk,
 * dark at night), the ceiling's panels by day, the lamp's bulb at night.
 * In world directions from the bench; `soft` widens them for rougher things.
 */
export const GLINTS = /* glsl */ `
uniform float uGlow;
uniform vec3 uLampDir;
uniform vec3 uWindow;
float labBox(vec2 p, vec2 lo, vec2 hi, float soft) {
  vec2 a = smoothstep(lo - soft, lo + soft, p) * (1.0 - smoothstep(hi - soft, hi + soft, p));
  return a.x * a.y;
}
vec3 labGlints(vec3 r, float soft) {
  vec3 c = vec3(0.0);
  float day = 1.0 - uGlow;
  if (r.z < -0.05) {
    // The windows, seen from the bench: three of them, their frames dark, blinds over their tops.
    vec2 p = vec2(r.x, r.y) / -r.z;
    float w = 0.0;
    for (int i = -1; i <= 1; i++) w += labBox(p, vec2(float(i) * ${(WINDOWS.xs[2] / -BACK_Z).toFixed(4)} - ${(WINDOWS.hw / -BACK_Z).toFixed(4)}, ${(WINDOWS.y0 / -BACK_Z).toFixed(4)}), vec2(float(i) * ${(WINDOWS.xs[2] / -BACK_Z).toFixed(4)} + ${(WINDOWS.hw / -BACK_Z).toFixed(4)}, ${(WINDOWS.y1 / -BACK_Z).toFixed(4)}), soft);
    float frame = 1.0 - (1.0 - smoothstep(0.004, 0.012 + soft, abs(fract(p.x / ${(WINDOWS.hw / -BACK_Z).toFixed(4)} + 0.5) - 0.5) * ${(WINDOWS.hw / -BACK_Z).toFixed(4)})) * 0.9;
    float blinds = p.y > ${(WINDOWS.blinds / -BACK_Z).toFixed(4)} ? 0.45 : 1.0;
    c += uWindow * w * frame * blinds;
  }
  if (r.y > 0.2) {
    // The panels overhead, in metres across the ceiling.
    vec2 p = r.xz / r.y * ${(CEILING_Y / 1000).toFixed(2)};
    float panels = ${PANELS.map(([x, z]) => `labBox(p, vec2(${((x - 320) / 1000).toFixed(2)}, ${((z - 620) / 1000).toFixed(2)}), vec2(${((x + 320) / 1000).toFixed(2)}, ${((z + 620) / 1000).toFixed(2)}), soft * 2.0)`).join(" + ")};
    c += vec3(1.0, 1.0, 0.98) * panels * day * 1.6;
  }
  // The lamp's bulb, at night.
  c += vec3(1.0, 0.8, 0.55) * smoothstep(0.985 - soft * 4.0, 0.997, dot(r, uLampDir)) * uGlow * 3.0;
  return c;
}
/** The reflected direction in the world, from three's view-space normal and position. */
vec3 labReflect(vec3 n) {
  vec3 v = reflect(normalize(-vViewPosition), n);
  return normalize((vec4(v, 0.0) * viewMatrix).xyz);
}`;

/**
 * The glints' uniforms: how brightly the lamp's bulb and the inside of its
 * shade glow (set from the darkness each frame), which way the lamp is from
 * the bench (a unit vector in the world), and the windows' light as glossy
 * things see it (set from the sky each frame).
 */
export type Glints = { uGlow: { value: number }; uLampDir: { value: THREE.Vector3 }; uWindow: { value: THREE.Color } };
export const glints = (): Glints => ({ uGlow: { value: 0 }, uLampDir: { value: new THREE.Vector3(0, 1, 0) }, uWindow: { value: new THREE.Color() } });

/**
 * The one material for nearly everything opaque on the bench: three's
 * standard material with its finish per vertex. Foam (the plugs, the fly pad,
 * the wipe) is open-celled: round pores a tenth to a third of a millimetre
 * across. Fly
 * food is grains of cornmeal set in molasses: bumps of about the same size.
 * Both fade to their average where a pixel covers several, so they never
 * shimmer.
 */
export function surfaceMaterial(shine: Glints, beam: Sunbeam): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, envMapIntensity: 0.7 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shine, beam);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 surface;\nvarying vec4 vSurface;\nvarying vec3 vWorld;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvSurface = surface;\n${WORLD_VS}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec4 vSurface;\nvarying vec3 vWorld;\n${NOISE}`)
      .replace("#include <lights_pars_begin>", `#include <lights_pars_begin>\n${GLINTS}\n${WINDOW_LIGHT}`)
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
// Derivatives outside the branches, where they are defined.
vec3 q = vWorld / 0.34;
float size = max(max(length(dFdx(q)), length(dFdy(q))), 1e-4);
float labDetail = 1.0 - smoothstep(0.35, 0.9, size);
float labBump = 0.0;
float labFinish = 0.0;
if (vSurface.y > 0.5) {
  // The brushed finish breaks broad steel highlights without introducing a repeating line pattern.
  labFinish = (labNoise(vec3(vWorld.x * 0.06, vWorld.y * 8.0, vWorld.z * 0.06)) - 0.5) * labDetail;
  diffuseColor.rgb *= 0.97 + labFinish * 0.04;
}
if (vSurface.z != 0.0) {
  // Two octaves of smooth noise, cut into blobs: pores in foam, grains in cornmeal, irregular as both are.
  float n = labNoise(q) * 0.65 + labNoise(q * 2.3 + 7.1) * 0.35;
  if (vSurface.z > 0.0) {
    // Foam: round open pores where the cell walls part, a tenth to a third of a millimetre across, some cells without, and the odd larger one.
    vec3 c1 = q * 1.6;
    vec3 h1 = labHash3(floor(c1) + 0.5);
    float d1 = length(fract(c1) - 0.5 - (h1 - 0.5) * 0.45);
    float pit = (1.0 - smoothstep(0.1 + h1.x * 0.16, 0.17 + h1.x * 0.18, d1)) * step(0.3, h1.y);
    vec3 c2 = q * 0.55 + 3.7;
    vec3 h2 = labHash3(floor(c2) + 0.5);
    float d2 = length(fract(c2) - 0.5 - (h2 - 0.5) * 0.4);
    pit = max(pit, (1.0 - smoothstep(0.09 + h2.x * 0.08, 0.15 + h2.x * 0.1, d2)) * step(0.7, h2.y));
    // Fading to their average where a pixel spans several, so they never shimmer.
    float fine = 1.0 - smoothstep(0.25, 0.6, size * 1.6);
    diffuseColor.rgb *= mix(1.0, mix(0.95, 1.0 - pit * (0.32 - n * 0.12), fine), vSurface.z);
    labBump = -pit * vSurface.z * fine;
  } else {
    // Cornmeal: rounded grains, some lighter, some darker, with molasses between.
    float grain = smoothstep(0.5, 0.66, n);
    float tone = labNoise(q * 0.7 + 3.3);
    vec3 lit = diffuseColor.rgb * mix(0.85, 1.25, tone);
    diffuseColor.rgb = mix(diffuseColor.rgb * 0.95, mix(diffuseColor.rgb * 0.74, lit, grain), labDetail * -vSurface.z);
    labBump = grain * -vSurface.z * labDetail;
  }
}`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp(vSurface.x + labFinish * 0.12, 0.04, 1.0);")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = vSurface.y;")
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
{
  // A bump map from the pits or grains, a tenth of a millimetre deep (three's perturbNormalArb, with the height worked out here).
  vec3 sx = dFdx(-vViewPosition);
  vec3 sy = dFdy(-vViewPosition);
  float h = labBump * 0.1;
  vec3 r1 = cross(sy, normal);
  vec3 r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  normal = normalize(abs(det) * normal - grad);
}`,
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vSurface.w * uGlow;")
      .replace(
        "#include <lights_fragment_end>",
        /* glsl */ `#include <lights_fragment_end>
${BEAM_FRAGMENT}
// Glossy things (the agar, wet food, the lacquer, chrome) show the room's bright things in them.
if (vSurface.x < 0.35) {
  float f = pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 3.0);
  vec3 spec = mix(vec3(0.04), diffuseColor.rgb, vSurface.y);
  reflectedLight.indirectSpecular += labGlints(labReflect(normal), vSurface.x * 0.25) * (spec + (1.0 - spec) * f) * (1.0 - vSurface.x * 2.2) * mix(0.55, 1.0, vSurface.y);
}`,
      )
  };
  material.customProgramCacheKey = () => "lab-surface";
  return material;
}

/**
 * Clear glass and plastic: nearly invisible face on, bright at the edges where
 * it turns away, as a vial or a beaker is. Vertex colours tint each piece.
 */
export function clearMaterial(shine: Glints): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0, transparent: true, depthWrite: false, envMapIntensity: 1.5, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shine);
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_pars_begin>", `#include <lights_pars_begin>\n${GLINTS}`).replace(
      "#include <opaque_fragment>",
      /* glsl */ `float facing = abs(dot(normal, normalize(vViewPosition)));
float edge = pow(1.0 - facing, 2.5);
// The windows and the panels, bright in the glass.
outgoingLight += labGlints(labReflect(normal), 0.01) * (0.04 + edge * 0.65);
diffuseColor.a = clamp(0.055 + edge * 0.6 + dot(outgoingLight, vec3(0.33)) * 0.07, 0.0, 0.85);
#include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => "lab-clear";
  return material;
}

/** A separate liquid surface sorts beneath the vessel wall, so its meniscus stays distinct from glass rims. */
export function liquidMaterial(shine: Glints): THREE.MeshStandardMaterial {
  const material = clearMaterial(shine);
  material.side = THREE.FrontSide;
  const compile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      "clamp(0.055 + edge * 0.6 + dot(outgoingLight, vec3(0.33)) * 0.07, 0.0, 0.85)",
      "clamp(0.08 + edge * 0.55 + dot(outgoingLight, vec3(0.33)) * 0.06, 0.0, 0.8)",
    );
  };
  material.customProgramCacheKey = () => "lab-liquid";
  return material;
}

/**
 * The bench's epoxy top: pale grey resin, flecked finely darker and lighter
 * as cast resin is, satin, with the soft shadows and old stains of the
 * painted map over it. The flecks are worked out per pixel, a tenth of a
 * millimetre and up, and fade to their average from further off. Its satin
 * shows the windows and the panels softly, more as it turns away.
 */
export function benchMaterial(map: THREE.Texture, beam: Sunbeam, shine: Glints): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ map, roughness: 0.42, metalness: 0, envMapIntensity: 0.5 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, beam, shine);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${WORLD_VS}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWorld;\n${NOISE}`)
      .replace("#include <lights_pars_begin>", `#include <lights_pars_begin>\n${GLINTS}\n${WINDOW_LIGHT}`)
      .replace(
        "#include <lights_fragment_end>",
        /* glsl */ `#include <lights_fragment_end>
${BEAM_FRAGMENT}
reflectedLight.indirectSpecular += labGlints(labReflect(normal), 0.06) * (0.02 + 0.22 * pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 4.0));`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
{
  // Fine flecks a tenth of a millimetre across, of greys a little darker and lighter, a fifth of the cells.
  vec2 q = vWorld.xz * 4.0;
  float size = max(max(length(dFdx(q)), length(dFdy(q))), 1e-4);
  float detail = 1.0 - smoothstep(0.3, 0.8, size);
  vec3 cell = vec3(floor(q), 0.0);
  vec3 h = labHash3(cell + 0.5);
  float d = length(fract(q) - 0.5 - (h.xy - 0.5) * 0.6);
  float fleck = (1.0 - smoothstep(0.06 + h.z * 0.14, 0.1 + h.z * 0.16, d)) * step(0.8, labHash(cell));
  float tone = mix(1.0, h.z > 0.85 ? 1.05 : 0.8 + h.x * 0.12, fleck);
  // Fewer, larger, softer grains, half a millimetre across.
  vec2 q2 = vWorld.xz * 1.1;
  float size2 = max(max(length(dFdx(q2)), length(dFdy(q2))), 1e-4);
  vec3 cell2 = vec3(floor(q2), 1.0);
  vec3 h2 = labHash3(cell2 + 0.5);
  float d2 = length(fract(q2) - 0.5 - (h2.xy - 0.5) * 0.5);
  float grain = (1.0 - smoothstep(0.08, 0.2, d2)) * step(0.9, h2.z) * (1.0 - smoothstep(0.3, 0.8, size2));
  // A soft mottle, a few millimetres across, as poured resin has.
  float mottle = labNoise(vWorld * 0.09) * 0.6 + labNoise(vWorld * 0.31) * 0.4;
  diffuseColor.rgb *= mix(0.982, tone, detail) * (1.0 - grain * 0.1) * (0.975 + mottle * 0.05);
}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        /* glsl */ `#include <roughnessmap_fragment>
// Wiped smoother in long arcs where the bench is cleaned.
roughnessFactor *= 0.85 + 0.3 * labNoise(vec3(vWorld.x * 0.012, 0.0, vWorld.z * 0.05));`,
      );
  };
  material.customProgramCacheKey = () => "lab-bench";
  return material;
}

export { NOISE };
