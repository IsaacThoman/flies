import * as THREE from "three";
import { GREENHOUSE_SOLIDS } from "@fly/world";
import { BUMP, NOISE } from "../windowsill/surfaces.ts";

export const K = { wood: 0, clay: 1, soil: 2, leaf: 3, tomato: 4, fig: 5, metal: 6, paint: 7, label: 8, string: 9 };

/** One material keeps all the bench's opaque detail in a single draw. */
export function surfaces() {
  const uniforms = {
    uCrowns: { value: GREENHOUSE_SOLIDS.filter(s => s.name === "greenhouse leaves" || s.name === "seedling crown").map(s => {
      const f = s.footprint;
      return new THREE.Vector4(f.x, f.z, f.kind === "circle" ? f.r : f.kind === "ellipse" ? f.rx : f.hx, s.top.kind === "dome" ? s.top.height : 1);
    }) },
    uWet: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uDirect: { value: 1 },
    uContacts: { value: GREENHOUSE_SOLIDS.filter(s => ["terracotta pot", "watering can", "water saucer", "fallen tomato", "split fig", "trowel blade"].includes(s.name)).map(s => {
      const f = s.footprint;
      return new THREE.Vector4(f.x, f.z, f.kind === "circle" ? f.r : f.kind === "ellipse" ? f.rx : f.hx, s.top.kind === "flat" ? s.top.y : s.top.kind === "dish" ? s.top.rim : s.top.base + s.top.height);
    }) },
  };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, envMapIntensity: 0.7 });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float kind; varying float vKind; varying vec3 vWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvKind = kind; vWorld = (modelMatrix * vec4(position, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
varying float vKind; varying vec3 vWorld;
uniform float uWet; uniform vec3 uSun; uniform float uDirect;
uniform vec4 uCrowns[14];
uniform vec4 uContacts[${uniforms.uContacts.value.length}];
${NOISE}
${BUMP}
float relief = 0.0;
float rough = 0.8;
float shine = 0.0;
float sat(float a) { return clamp(a, 0.0, 1.0); }
vec3 surface(vec3 c) {
 vec3 p = vWorld;
 float fine = vnoise3(p * 7.0) * resolved(0.35);
 if (vKind < 0.5) {
   float knot = exp(-length((p.xz - vec2(-52.0, 74.0)) * vec2(0.035, 0.17)));
   float grain = sin(p.z * 5.2 + vnoise(p.xz * vec2(0.025, 0.14)) * 7.0 + knot * 9.0);
   float stripe = fract((p.z + 200.0) / 66.6667);
   float seam = 1.0 - smoothstep(0.002, 0.012, min(stripe, 1.0 - stripe));
   float wear = vnoise(p.xz * vec2(0.016, 0.06));
   c *= 0.76 + 0.30 * wear + 0.1 * grain * resolved(1.2);
   c = mix(c, vec3(0.19, 0.24, 0.17), smoothstep(0.65, 0.9, wear) * 0.35);
   c *= 1.0 - seam * 0.8;
   float wet = uWet * (0.3 + 0.5 * vnoise(p.xz * 0.035));
   c *= 1.0 - wet * 0.32; rough = 0.85 - wet * 0.55;
   relief = grain * 0.035 * resolved(1.2) - seam * 0.1;
   // Rusted nail heads and their dark halos at the ends of each plank.
   vec2 nail = vec2(abs(p.x) - 300.0, mod(p.z + 200.0, 66.6667) - 9.0);
   float n = 1.0 - smoothstep(1.1, 1.65, length(nail));
   c = mix(c, vec3(0.055, 0.039, 0.022), n); relief -= n * 0.08;
 } else if (vKind < 1.5) {
   float salt = smoothstep(0.56, 0.85, vnoise(p.xz * 0.11 + p.y * 0.025));
   c *= 0.87 + fine * 0.35;
   c = mix(c, vec3(0.65, 0.59, 0.44), salt * 0.3);
   c *= 1.0 - uWet * 0.2;
   relief = fine * 0.055; rough = 0.94 - uWet * 0.12;
 } else if (vKind < 2.5) {
   c *= 0.65 + fine * 0.8 + vnoise3(p * 0.9) * 0.35;
   relief = fine * 0.16; rough = 1.0;
 } else if (vKind < 3.5) {
   vec2 q = p.xz;
   float reach = 20.0;
   float best = 1e6;
   for (int i=0; i<14; i++) {
     vec4 crown = uCrowns[i];
     float d = length(p.xz - crown.xy) / crown.z;
     if (d < best) { best = d; q = p.xz - crown.xy; reach = crown.z; }
   }
   // A rosette of overlapping pointed leaves, with paired side veins.
   float r = length(q);
   float ring = floor(r / (reach * 0.3));
   float count = 5.0 + ring * 3.0;
   float around = atan(q.y,q.x) / 6.28318 * count + ring * 0.37;
   float w = (fract(around) - 0.5) * 2.0;
   float along = fract(r / (reach * 0.3));
   float edge = abs(w) / max(0.08, pow(sin(along * 3.14159),0.6));
   float leaf = 1.0 - smoothstep(0.65,1.2,edge);
   float vein = exp(-abs(w) * 60.0) + pow(max(0.0,cos((along + abs(w) * 0.25) * 42.0)),18.0) * 0.28;
   c *= 0.55 + leaf * 0.5 + hash21(vec2(floor(around),ring)) * 0.22;
   c += vec3(0.035,0.055,0.012) * vein * resolved(0.8);
   relief = leaf * 0.18 * resolved(2.0); rough = 0.56;
 } else if (vKind < 4.5) {
   float bruise = smoothstep(0.57, 0.8, vnoise(p.xz * 0.17 + 7.0));
   c = mix(c, vec3(0.2, 0.037, 0.012), bruise * 0.7);
   c *= 0.9 + fine * 0.22; rough = 0.3 + bruise * 0.2; relief = fine * 0.018;
 } else if (vKind < 5.5) {
   vec2 q = (p.xz - vec2(20.0, 56.0)) / vec2(19.0, 25.0);
   float flesh = 1.0 - smoothstep(0.62, 0.78, length(q));
   float fibres = pow(abs(sin(atan(q.y, q.x) * 34.0 + length(q) * 18.0)), 9.0) * resolved(0.6);
   vec3 inside = mix(vec3(0.45, 0.055, 0.09), vec3(0.83, 0.29, 0.26), fibres * 0.7 + 0.2);
   float seeds = step(0.86, hash21(floor(p.xz * 3.2))) * resolved(0.3);
   inside = mix(inside, vec3(0.85, 0.65, 0.31), seeds * 0.7);
   c = mix(c * (0.8 + fine * 0.4), inside, flesh);
   rough = mix(0.75, 0.32, flesh); relief = fine * 0.02;
 } else if (vKind < 6.5) {
   rough = 0.27 + fine * 0.2; shine = 0.72; relief = fine * 0.012;
 } else if (vKind < 7.5) {
   float chip = smoothstep(0.65, 0.78, vnoise3(p * 0.3));
   c = mix(c, vec3(0.14, 0.085, 0.028), chip * 0.7 * resolved(3.0)); rough = 0.45; shine = 0.35;
 } else if (vKind < 8.5) {
   float line = step(0.7, sin(p.z * 6.0 + sin(p.x * 2.7))) * step(0.45, vnoise(p.xz * 0.5));
   c *= 1.0 - line * 0.6 * resolved(0.7); rough = 1.0;
 } else { relief = sin(p.x * 14.0 + p.z * 7.0) * 0.035 * resolved(0.5); }
 return c;
}
`)
    .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = surface(diffuseColor.rgb);")
    .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = rough;")
    .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = shine;")
    .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bumped(normal, relief);")
    .replace("#include <opaque_fragment>", `
// Glazing bars intercept the sun at the roof plane. Overcast softens them.
vec2 roof = vWorld.xz + uSun.xz * (880.0 - vWorld.y) / max(0.08, uSun.y);
vec2 bars = abs(fract((roof + vec2(760.0, 640.0)) / vec2(253.333, 320.0)) - 0.5);
float shadow = max(smoothstep(0.465, 0.49, bars.x), smoothstep(0.465, 0.49, bars.y));
float ao = 1.0;
for (int i = 0; i < ${uniforms.uContacts.value.length}; i++) {
 vec4 a = uContacts[i];
 float d = length(vWorld.xz - a.xy);
 ao *= 1.0 - exp(-pow(d / max(1.0, a.z), 4.0)) * 0.24 * (1.0 - smoothstep(0.0, 5.0, vWorld.y));
 if (vWorld.y < a.w - 0.1) {
  vec2 at = vWorld.xz + uSun.xz * (a.w * 0.65 - vWorld.y) / max(0.12, uSun.y);
  float block = (1.0 - smoothstep(a.z * 0.7, a.z * 1.1, length(at - a.xy))) * step(vWorld.y, a.w * 0.65);
  shadow = max(shadow, block * 0.8);
 }
}
outgoingLight *= ao * (1.0 - shadow * uDirect * 0.45);
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => "greenhouse-surfaces";
  return { material, uniforms };
}
