// The picnic's surfaces, worked out per pixel from where they are, so that
// they stay crisp however close the camera comes: the table's worn enamel,
// the apple's lenticels and russet, the orange's juice sacs, the jam's fruit
// and seeds. Detail finer than a pixel fades into its average, so nothing
// shimmers.

import * as THREE from "three";
import { SOLIDS } from "@fly/world";

type Shader = THREE.WebGLProgramParametersWithUniforms;

/** Hashes and value noise, in two and three dimensions; precise enough over a few metres in millimetres. */
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
// 1 where detail of this size (mm) spans several pixels of size px, fading to 0 as it nears one.
float resolved(float px, float size) { return 1.0 - smoothstep(0.35, 1.0, px / size); }
`;

/**
 * Gingham woven thread by thread: a plain weave of white threads and dyed
 * ones (a thread is dyed where it crosses a dyed band, so where dyed meets
 * dyed the square is dark and where dyed meets white it is light), at `uv`
 * (mm), in checks `check` mm across. Threads too fine for the pixels fade
 * into their average, so it never shimmers; from across the table it is plain
 * gingham.
 */
export const GINGHAM = /* glsl */ `
// 1 in the dyed half of each check, softened by how many checks a pixel covers.
float band(float x, float check) {
  float t = x / check;
  float tri = abs(fract(t) - 0.5) * 2.0;
  float w = fwidth(t) * 1.5 + 0.004;
  return smoothstep(0.5 - w, 0.5 + w, tri);
}
vec3 gingham(vec2 uv, float check, vec3 dye) {
  const vec3 WHITE = vec3(0.96);
  vec2 th = uv / 0.22;
  float detail = 1.0 - smoothstep(0.18, 0.42, max(fwidth(th.x), fwidth(th.y)));
  vec3 warp = mix(WHITE, dye, band(uv.y, check));
  vec3 weft = mix(WHITE, dye, band(uv.x, check));
  vec3 cloth = (warp + weft) * 0.5 * 0.95;
  if (detail > 0.0) {
    // Warp and weft take turns on top at each crossing; each thread is round, with a dark gap beside it.
    vec2 f = fract(th);
    bool warpOnTop = mod(floor(th.x) + floor(th.y), 2.0) < 1.0;
    float across = warpOnTop ? f.y : f.x;
    float along = warpOnTop ? f.x : f.y;
    float bulge = pow(sin(3.14159 * across), 0.55) * (0.88 + 0.12 * sin(3.14159 * along));
    // A thread's own colour shows a little through the one over it, as in real cloth seen close.
    vec3 thread = mix(warpOnTop ? warp : weft, (warp + weft) * 0.5, 0.55) * (0.8 + 0.2 * bulge);
    cloth = mix(cloth, thread, detail);
  }
  return cloth;
}
`;

/**
 * The table's white enamel, worn by use, as a colour to multiply it by and a
 * change to its roughness: faintly uneven; dulled in long arcs where it was
 * wiped; spotted where dew dried, each spot with a crisp rim of what was in
 * it; a sticky ring where a wet jar of lemonade once stood; hairline
 * scratches; specks of pollen and dust; and near the rim chips knocked out
 * to the dark steel, rust round them. `peel` is the gentle waviness of fired
 * enamel, as a slope, which breaks up what it reflects.
 */
export const ENAMEL = (rim: number, ring: { x: number; z: number; r: number }) => /* glsl */ `
vec4 enamel(vec2 p, float px) {
  vec3 c = vec3(0.965 + 0.05 * vnoise(p * 0.02));
  float rough = 0.0;
  vec2 w = p - vec2(-180.0, 520.0);
  float sweep = length(w) + vnoise(p * 0.01) * 25.0;
  rough += smoothstep(0.5, 0.9, vnoise(vec2(sweep * 0.3, atan(w.y, w.x) * 9.0))) * 0.16;

  vec2 cell = floor(p / 8.0);
  vec2 q = p - (cell + 0.5) * 8.0 - (vec2(hash21(cell), hash21(cell + 17.0)) - 0.5) * 2.4;
  float r = mix(0.5, 2.2, hash21(cell + 5.0));
  float a = atan(q.y, q.x);
  float d = length(q) - r * (1.0 + 0.1 * sin(a * 3.0 + r * 7.0) + 0.05 * sin(a * 7.0 - r * 3.0));
  float here = step(hash21(cell + 9.0), 0.28);
  float disc = (1.0 - smoothstep(-px, px, d)) * here;
  float edge = (1.0 - smoothstep(0.035, 0.035 + px, abs(d + 0.04))) * here;
  rough += disc * 0.2;
  c *= 1.0 - disc * 0.012 - edge * (0.03 + 0.12 * resolved(px, 0.07));

  vec2 jar = p - vec2(${ring.x.toFixed(1)}, ${ring.z.toFixed(1)});
  float stain = (1.0 - smoothstep(0.35, 0.45 + px, abs(length(jar) - ${ring.r.toFixed(1)}))) * smoothstep(-0.5, 0.6, sin(atan(jar.y, jar.x) + 0.8)) * (0.55 + 0.45 * vnoise(p * 0.35));
  c *= mix(vec3(1.0), vec3(0.9, 0.85, 0.7), stain);
  rough += stain * 0.25;

  vec2 sc = floor(p / 4.0);
  float sh = hash21(sc + 31.0);
  vec2 dir = vec2(cos(sh * 40.0), sin(sh * 40.0));
  vec2 sq = p - (sc + 0.5) * 4.0 - (vec2(hash21(sc + 33.0), hash21(sc + 35.0)) - 0.5);
  float len = mix(0.3, 1.4, hash21(sc + 37.0));
  float scratch = step(sh, 0.45) * (1.0 - smoothstep(0.012, 0.012 + px, abs(dot(sq, vec2(-dir.y, dir.x))))) * (1.0 - smoothstep(len * 0.6, len, abs(dot(sq, dir)))) * resolved(px, 0.03);
  c *= 1.0 - scratch * 0.35;
  rough += scratch * 0.3;

  vec2 kc = floor(p / 1.1);
  vec2 kq = p - (kc + 0.5) * 1.1 - (vec2(hash21(kc + 41.0), hash21(kc + 43.0)) - 0.5) * 0.7;
  float kr = mix(0.025, 0.08, hash21(kc + 45.0));
  float speck = step(hash21(kc + 47.0), 0.1) * (1.0 - smoothstep(kr - px * 0.5, kr + px * 0.5, length(kq))) * resolved(px, 0.05);
  c = mix(c, hash21(kc + 49.0) > 0.45 ? vec3(0.96, 0.76, 0.26) : vec3(0.55, 0.52, 0.5), speck);

  vec2 cc = floor(p / 6.0);
  vec2 cq = p - (cc + 0.5) * 6.0 - (vec2(hash21(cc + 51.0), hash21(cc + 53.0)) - 0.5) * 3.0;
  float cr = mix(0.15, 0.55, hash21(cc + 55.0));
  float cd = length(cq) - cr * (0.75 + 0.5 * vnoise(cq * 6.0 + cc));
  float chipped = step(hash21(cc + 57.0), 0.1 * smoothstep(${(rim - 24).toFixed(1)}, ${(rim - 4).toFixed(1)}, length(p)));
  float chip = (1.0 - smoothstep(-px, px, cd)) * chipped;
  float rust = (1.0 - smoothstep(0.0, 0.35 + px, cd)) * chipped * (1.0 - chip);
  c = mix(c, vec3(0.66, 0.44, 0.28), rust * 0.5);
  c = mix(c, vec3(0.2, 0.22, 0.25), chip);
  rough += chip * 0.4;
  return vec4(c, rough);
}
vec2 peel(vec2 p, float px) {
  float h = vnoise(p * 0.9);
  return vec2(vnoise((p + vec2(0.2, 0.0)) * 0.9) - h, vnoise((p + vec2(0.0, 0.2)) * 0.9) - h) * 0.15 * resolved(px, 1.5);
}
`;

/** A bump on a lit surface: its new normal (view space, as three.js's standard materials work) from a height h over it, by its screen-space slopes. */
export const BUMP = /* glsl */ `
vec3 bumped(vec3 n, float h) {
  vec3 p = -vViewPosition;
  vec3 dpx = dFdx(p);
  vec3 dpy = dFdy(p);
  vec3 r1 = cross(dpy, n);
  vec3 r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  // Seen exactly edge-on there is no slope to take: keep the normal as it is.
  return normalize(max(abs(det), 1e-9) * n - grad);
}
`;

/** Which skin a piece merged into the fruit's material has: its `skin` attribute. */
export const SKIN = { plain: 0, apple: 1, orange: 2, jam: 3, cherry: 4 } as const;

/** Says which skin a piece has: every piece merged into one material needs the same attributes. */
export function skin(geometry: THREE.BufferGeometry, kind: number) {
  geometry.setAttribute("skin", new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(kind), 1));
  return geometry;
}

const at = (name: string) => {
  const solid = SOLIDS.find((s) => s.name === name)!;
  const f = solid.footprint as { x: number; z: number; r: number };
  return { ...f, top: solid.top as { y?: number; base?: number } };
};

/** How many lenticels round the apple's middle, about 1.3 mm apart. */
const apple = at("apple");
const LENTICELS = Math.round((2 * Math.PI * apple.r) / 1.3);
const orange = at("orange slice");

/**
 * The fruit's skins, by `skin`: plain and glossy (the saucer, the lemon, the
 * honey); a green apple (streaks of blush from stem to eye, pale lenticels
 * freckling it, more on the blush, and rough brown russet round the stem); a
 * slice of orange (ten segments parted by thin membranes, each packed with
 * glistening juice sacs, inside the white pith and the peel, its edge dimpled
 * with oil glands); jam pressed against its jar's glass (pieces of fruit,
 * seeds); a cherry (its deep red a little uneven).
 */
export function fruitSkins(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader: Shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float skin;\nvarying float vSkin;\nvarying vec3 vWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSkin = skin;\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
varying float vSkin;
varying vec3 vWorld;
${NOISE}
${BUMP}
const vec4 APPLE = vec4(${apple.x.toFixed(1)}, ${apple.top.base!.toFixed(1)}, ${apple.z.toFixed(1)}, ${apple.r.toFixed(1)});
const vec3 ORANGE = vec3(${orange.x.toFixed(1)}, ${orange.z.toFixed(1)}, ${orange.r.toFixed(1)});
const float LENTICELS = ${LENTICELS.toFixed(1)};
float skinRough;
float skinHeight;`,
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
skinRough = 0.0;
skinHeight = 0.0;
{
  int kind = int(vSkin + 0.5);
  vec3 p = vWorld;
  float px = length(fwidth(p));
  vec3 c = diffuseColor.rgb;
  if (kind == 1) {
    vec3 d = p - APPLE.xyz;
    vec3 n = normalize(d);
    // How far this is into the blush the apple was painted with.
    float blush = smoothstep(0.35, 1.2, c.r / max(c.g, 0.01));
    float streak = smoothstep(0.45, 0.75, vnoise3(vec3(n.x * 16.0, n.y * 1.8, n.z * 16.0) + vnoise3(n * 3.0) * 1.5));
    c = mix(c, c * vec3(1.25, 0.66, 0.55), streak * (0.12 + 0.45 * blush));
    c *= 0.86 + 0.24 * vnoise3(p * 0.08) + 0.06 * vnoise3(p * 0.5);
    c = mix(c, c * vec3(1.12, 1.04, 0.7), smoothstep(0.5, 0.8, vnoise3(p * 0.04 + 11.0)) * (1.0 - blush) * 0.5);
    // Lenticels on a grid round the apple, fewer columns' worth of room toward the stem.
    float lat = asin(clamp(n.y, -1.0, 1.0));
    vec2 uv = vec2((atan(d.z, d.x) / 6.28318 + 0.5) * LENTICELS, lat * APPLE.w / 1.3);
    vec2 cell = floor(uv);
    cell.x = mod(cell.x, LENTICELS);
    vec2 f = fract(uv) - 0.5 - (vec2(hash21(cell), hash21(cell + 7.0)) - 0.5) * 0.5;
    vec2 mm = f * vec2(1.3 * cos(lat), 1.3);
    float lr = mix(0.08, 0.22, hash21(cell + 3.0));
    float lent = step(hash21(cell + 5.0), 0.3 + 0.4 * blush) * (1.0 - smoothstep(lr - px, lr + px, length(mm))) * resolved(px, 0.2) * (1.0 - smoothstep(0.75, 0.9, abs(n.y)));
    c = mix(c, mix(vec3(0.62, 0.72, 0.3), vec3(0.85, 0.6, 0.3), blush), lent * 0.8);
    // Russet, rough and brown, in rays out of the hollow round the stem.
    float top = smoothstep(0.97, 0.997, n.y);
    float rays = vnoise3(vec3(normalize(d.xz + 1e-4) * 7.0, n.y * 12.0));
    float russet = top * smoothstep(0.35, 0.65, rays + top * 0.35);
    c = mix(c, vec3(0.3, 0.17, 0.05), russet * 0.8);
    skinRough = 0.14 + lent * 0.2 + russet * 0.45;
    skinHeight = lent * 0.03;
  } else if (kind == 2) {
    vec2 o = p.xz - ORANGE.xy;
    float rho = length(o);
    vec3 wn = inverseTransformDirection(normalize(vNormal), viewMatrix);
    if (wn.y > 0.5) {
      float a = atan(o.y, o.x) / 6.28318 * 10.0;
      float seg = mod(floor(a), 10.0);
      float t = (fract(a) - 0.5) * 0.628318 * rho;
      // Juice sacs: teardrops pointing in to the middle, in staggered rows, glistening down their length.
      float row = floor(rho / 2.6);
      float tq = t + hash21(vec2(row, seg)) * 3.0;
      float h = hash21(vec2(row * 7.0 + floor(tq), seg));
      float u = clamp(fract(rho / 2.6) * (0.85 + 0.3 * h), 0.0, 1.0);
      float v = abs(fract(tq) - 0.5);
      float w = 0.46 * pow(sin(3.14159 * u), 0.6) - v;
      float sharp = resolved(px, 0.9);
      float sac = smoothstep(0.0, max(0.1, px * 1.5), w);
      vec3 flesh = mix(vec3(1.0, 0.6, 0.2), mix(vec3(0.96, 0.33, 0.01), vec3(1.0, 0.5, 0.03), h * 0.6 + smoothstep(0.0, 0.3, w) * 0.4), sac);
      flesh += vec3(0.2, 0.16, 0.08) * (1.0 - smoothstep(0.0, 0.07, v)) * sac * u;
      flesh = mix(vec3(0.98, 0.42, 0.04), flesh, sharp);
      float edgeMm = (0.5 - abs(fract(a) - 0.5)) * 0.628318 * rho;
      float membrane = 1.0 - smoothstep(0.12, 0.12 + px * 1.5, edgeMm);
      float core = (1.0 - smoothstep(ORANGE.z * 0.06 - px, ORANGE.z * 0.06 + px, rho)) * 0.8;
      float pith = smoothstep(ORANGE.z * 0.86 - px, ORANGE.z * 0.86 + px, rho);
      float peel = smoothstep(ORANGE.z * 0.94 - px, ORANGE.z * 0.94 + px, rho);
      vec3 white = vec3(1.0, 0.86, 0.6);
      c = mix(flesh, white * 0.95, max(membrane * 0.85, core));
      c = mix(c, white, pith);
      c = mix(c, vec3(1.0, 0.25, 0.0), peel);
      skinRough = mix(mix(-0.08, 0.3, max(membrane, core)), 0.3, pith);
      skinHeight = sac * 0.04 * sharp * (1.0 - pith);
    } else {
      float glands = smoothstep(0.6, 0.85, vnoise3(p * 5.0)) * resolved(px, 0.2);
      c = vec3(1.0, 0.3, 0.0) * (0.9 + 0.15 * vnoise3(p * 0.2)) * (1.0 - glands * 0.06);
      skinRough = 0.12;
      skinHeight = -glands * 0.006;
    }
  } else if (kind == 3) {
    float chunks = vnoise3(p * 0.3) * 0.7 + vnoise3(p * 1.2) * 0.3;
    float piece = smoothstep(0.52, 0.66, chunks);
    c = mix(vec3(0.46, 0.01, 0.05), vec3(0.26, 0.0, 0.035), piece);
    c = mix(c, vec3(0.72, 0.05, 0.1), smoothstep(0.34, 0.2, chunks) * 0.45);
    vec3 sc = floor(p / 1.1);
    vec3 sq = (fract(p / 1.1) - 0.5 - (vec3(hash31(sc), hash31(sc + 3.0), hash31(sc + 5.0)) - 0.5) * 0.4) * 1.1;
    float seed = step(hash31(sc + 9.0), 0.6) * (1.0 - smoothstep(0.13, 0.13 + px, length(sq * vec3(1.0, 0.7, 1.0)))) * resolved(px, 0.15);
    c = mix(c, vec3(0.75, 0.45, 0.08), seed * 0.8);
  } else if (kind == 4) {
    c *= 0.88 + 0.2 * vnoise3(p * 0.35);
    skinRough = -0.05;
  }
  diffuseColor.rgb = c;
}`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + skinRough, 0.04, 1.0);")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bumped(normal, skinHeight);");
  };
  material.customProgramCacheKey = () => "fruit";
  return material;
}
