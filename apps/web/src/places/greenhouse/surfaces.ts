import * as THREE from "three";
import { GREENHOUSE_PATCHES, GREENHOUSE_SOLIDS, topPeak } from "@fly/world";
import { BUMP, NOISE } from "../windowsill/surfaces.ts";

export const K = { wood: 0, clay: 1, soil: 2, leaf: 3, tomato: 4, fig: 5, metal: 6, paint: 7, label: 8, string: 9, juice: 10, fallen: 11 };

/** One material keeps all the bench's opaque detail in a single draw. */
export function surfaces() {
  const fig = GREENHOUSE_PATCHES.find(p => p.name === "fig flesh")!;
  const uniforms = {
    uCrowns: { value: GREENHOUSE_SOLIDS.filter(s => s.name === "greenhouse leaves" || s.name === "seedling crown").map(s => {
      const f = s.footprint;
      return new THREE.Vector4(f.x, f.z, f.kind === "circle" ? f.r : f.kind === "ellipse" ? f.rx : f.hx, s.top.kind === "dome" ? s.top.height : 1);
    }) },
    uWet: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uDirect: { value: 1 },
    uContacts: { value: GREENHOUSE_SOLIDS.filter(s => ["terracotta pot", "watering can", "water saucer", "fallen tomato", "split fig", "trowel blade"].includes(s.name)).map(s => {
      const f = s.footprint;
      return new THREE.Vector4(f.x, f.z, f.kind === "circle" ? f.r : f.kind === "ellipse" ? f.rx : f.hx, topPeak(s.top));
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
// First intersection with the pitched roof or the four glazed walls.
float glazingShadow(vec3 p) {
 if (uSun.y < 0.06) return 0.0;
 float nearest = 1e6;
 vec3 hit = p;
 float roofHit = 1.0;
 for (int side=0; side<2; side++) {
  float signX = float(side)*2.0-1.0;
  float slope = 340.0/760.0;
  float den = uSun.y+signX*slope*uSun.x;
  float t = (1220.0-signX*slope*p.x-p.y)/den;
  vec3 q = p+uSun*t;
  if (den > 0.001 && t > 0.0 && t < nearest && q.x*signX >= 0.0 && abs(q.x) <= 760.0 && abs(q.z) <= 640.0) { nearest=t;hit=q; }
 }
 if (abs(uSun.z)>0.001) {
  float t = (sign(uSun.z)*640.0-p.z)/uSun.z;
  vec3 q = p+uSun*t;
  if (t>0.0 && t<nearest && abs(q.x)<760.0 && q.y<880.0) { nearest=t;hit=q;roofHit=0.0; }
 }
 if (abs(uSun.x)>0.001) {
  float t = (sign(uSun.x)*760.0-p.x)/uSun.x;
  vec3 q = p+uSun*t;
  if (t>0.0 && t<nearest && abs(q.z)<640.0 && q.y<880.0) { nearest=t;hit=q;roofHit=-1.0; }
 }
 float across = abs(mod(hit.x+760.0+126.6665,253.333)-126.6665);
 float along = abs(mod(hit.z+640.0+160.0,320.0)-160.0);
 if (roofHit>0.5) return 1.0-smoothstep(7.0,11.0,min(across,along));
 float height = min(abs(hit.y+160.0),min(abs(hit.y-320.0),abs(hit.y-880.0)));
 return 1.0-smoothstep(9.0,13.0,min(height,roofHit< -0.5 ? along : across));
}
float relief = 0.0;
float rough = 0.8;
float shine = 0.0;
float sat(float a) { return clamp(a, 0.0, 1.0); }
vec3 surface(vec3 c) {
 vec3 p = vWorld;
 float fine = vnoise3(p * 7.0) * resolved(0.35);
 if (vKind < 0.5) {
   float knot = exp(-length((p.xz - vec2(-52.0, 74.0)) * vec2(0.035, 0.17)));
   float grain = vnoise(vec2(p.x*0.025,p.z*1.8+knot*3.0));
   float fibre = vnoise(vec2(p.x*0.14,p.z*7.0+grain*2.0));
   float stripe = fract((p.z + 200.0) / 66.6667);
   float seam = 1.0 - smoothstep(0.002, 0.012, min(stripe, 1.0 - stripe));
   float wear = vnoise(p.xz * vec2(0.016, 0.06));
   c *= 0.76 + 0.30 * wear + 0.10 * (grain-0.5) * resolved(2.0);
   c = mix(c, vec3(0.19, 0.24, 0.17), smoothstep(0.65, 0.9, wear) * 0.35);
   c *= 1.0 - seam * 0.8;
   float wet = uWet * (0.3 + 0.5 * vnoise(p.xz * 0.035));
   c *= 1.0 - wet * 0.32; rough = 0.85 - wet * 0.55;
   relief = (fibre-0.5) * 0.025 * resolved(0.7) - seam * 0.1;
   // Rusted nail heads and their dark halos at the ends of each plank.
   vec2 nail = vec2(abs(p.x) - 300.0, mod(p.z + 200.0, 66.6667) - 9.0);
   float n = 1.0 - smoothstep(1.1, 1.65, length(nail));
   c = mix(c, vec3(0.055, 0.039, 0.022), n); relief -= n * 0.08;
 } else if (vKind < 1.5) {
   float salt = smoothstep(0.56, 0.85, vnoise(p.xz * 0.11 + p.y * 0.025));
   c *= 0.87 + fine * 0.35;
   c = mix(c, vec3(0.65, 0.59, 0.44), salt * (0.06 + 0.24 * exp(-pow((p.y - (p.x < -130.0 ? 63.0 : p.x < 0.0 ? 41.0 : 1.0)) * 0.35,2.0))));
   c *= 1.0 - uWet * 0.2;
   relief = fine * 0.055; rough = 0.94 - uWet * 0.12;
 } else if (vKind < 2.5) {
   c *= 0.65 + fine * 0.8 + vnoise3(p * 0.9) * 0.35;
   relief = fine * 0.16; rough = 1.0;
 } else if (vKind < 3.5) {
   vec2 q = p.xz;
   float reach = 20.0, height = 40.0;
   float best = 1e6;
   for (int i=0; i<14; i++) {
     vec4 crown = uCrowns[i];
     float d = length(p.xz - crown.xy) / crown.z;
     if (d < best) { best = d; q = p.xz - crown.xy; reach = crown.z; height=crown.w; }
   }
   // A rosette of overlapping pointed leaves, with paired side veins.
   float r = length(q);
   float ring = height<15.0 ? 0.0 : floor(r / (reach * 0.3));
   float count = height<15.0 ? 4.0 : 3.0 + ring * 2.0;
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
   vec2 centre = p.z > 25.0 ? vec2(-82.0,51.0) : vec2(-50.0,-12.0);
   float radius = p.z > 25.0 ? 4.0 : 7.0;
   float split = 1.0-smoothstep(radius*0.72,radius,length(p.xz-centre)+vnoise(p.xz*1.4)*0.7);
   c = mix(c,vec3(0.39,0.055,0.018),split*0.65); rough = mix(rough,0.16,split);
 } else if (vKind < 5.5) {
   vec2 d = p.xz-vec2(${fig.x.toFixed(1)},${fig.z.toFixed(1)});
   float radius = length(d)/${fig.r.toFixed(1)};
   float flesh = 1.0-smoothstep(0.975,1.0,radius);
   float fibres = vnoise(p.xz*vec2(4.2,2.1)+vnoise(p.xz*0.7)*1.7) * resolved(0.25);
   vec3 inside = mix(vec3(0.24,0.025,0.032),vec3(0.61,0.14,0.12),fibres*0.55+vnoise(p.xz*0.85)*0.3);
   vec2 cell = floor(p.xz * 2.1);
   vec2 seedPoint = fract(p.xz * 2.1) - vec2(hash21(cell+1.7),hash21(cell+6.1))*0.5-0.25;
   float angle = hash21(cell+3.2)*6.28318;
   seedPoint = mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*seedPoint;
   float size = 0.08+hash21(cell+4.3)*0.13;
   float seed = 1.0-smoothstep(size,size+0.05,length(seedPoint*vec2(0.85,1.5)));
   float cluster = smoothstep(0.32,0.65,vnoise(p.xz*0.55+7.0));
   seed *= cluster*step(0.25,hash21(cell+9.1))*smoothstep(0.03,0.18,radius)*resolved(0.22);
   inside = mix(inside,vec3(0.74,0.48,0.20),seed*0.7);
   float pith = smoothstep(0.97,1.0,radius)*(1.0-smoothstep(1.08,1.18,radius));
   c = mix(c,vec3(0.61,0.40,0.31),pith*0.8);
   c = mix(c * (0.8 + fine * 0.4), inside, flesh);
   rough = mix(0.75,0.5,flesh); relief = (fibres*0.035+seed*0.055)*flesh + fine*0.012;
 } else if (vKind < 6.5) {
   rough = 0.27 + fine * 0.2; shine = 0.72; relief = fine * 0.012;
 } else if (vKind < 7.5) {
   float chip = smoothstep(0.72, 0.85, vnoise3(p * 0.3));
   c = mix(c, vec3(0.14, 0.085, 0.028), chip * 0.45 * resolved(3.0)); rough = 0.45; shine = 0.35;
 } else if (vKind < 8.5) {
   float line = step(0.7, sin(p.z * 6.0 + sin(p.x * 2.7))) * step(0.45, vnoise(p.xz * 0.5));
   c *= 1.0 - line * 0.6 * resolved(0.7); rough = 1.0;
 } else if (vKind < 9.5) { relief = sin(p.x * 14.0 + p.z * 7.0) * 0.035 * resolved(0.5); }
 else if (vKind < 10.5) {
   vec2 q = (p.xz-vec2(-14.0,8.0))/6.0;
   float r = length(q), a = atan(q.y,q.x);
   float edge = 0.9+sin(a*3.0)*0.07+sin(a*7.0+1.0)*0.03;
   float body = r<1.01 ? 1.0-smoothstep(edge-0.06,edge,r) : 1.0;
   float rim = r<1.01 ? exp(-pow((r-edge)*28.0,2.0)) : 0.0;
   c = mix(vec3(0.287,0.191,0.076)*vec3(1.15,0.85,0.7),c,0.18+body*0.82);
   c *= 1.0-rim*0.28;
   vec2 piece = fract(p.xz*2.0)-0.5;
   float pulp = step(0.94,hash21(floor(p.xz*2.0)))*(1.0-smoothstep(0.2,0.35,length(piece*vec2(1.0,1.8))))*resolved(0.35)*body;
   c = mix(c,vec3(0.6,0.28,0.055),pulp*0.4);
   rough = mix(0.2,0.1,body);
 }
 else {
   float u = (p.x + 6.0) / 15.0;
   float mid = p.z - 15.0 - sin(u * 3.14159) * 1.2;
   float vein = exp(-abs(mid) * 18.0) + pow(max(0.0,cos((p.x+abs(mid)*1.5)*5.0)),14.0)*0.35;
   c *= 0.85 + 0.15 * vnoise(p.xz * 2.0);
   c += vec3(0.08,0.09,0.025)*vein*resolved(0.7);
   rough = 0.65;
 }
 return c;
}
`)
    .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = surface(diffuseColor.rgb);")
    .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = rough;")
    .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = shine;")
    .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bumped(normal, relief);")
    .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
float transmitted = 1.0-glazingShadow(vWorld)*uDirect*0.75;
reflectedLight.directDiffuse *= transmitted;
reflectedLight.directSpecular *= transmitted;
if (vKind>9.5 && vKind<10.5) reflectedLight.indirectSpecular *= 0.25;
if (vKind>4.5 && vKind<5.5) {
 reflectedLight.indirectSpecular *= 0.45;
 reflectedLight.directSpecular *= 0.65;
}`)
    .replace("#include <opaque_fragment>", `
float shadow = 0.0;
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
