// The picnic's surfaces, worked out per pixel from where they are, so that
// they stay crisp however close the camera comes. Detail finer than a pixel
// fades into its average, so nothing shimmers.

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
