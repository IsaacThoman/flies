// What each kind of surface in the restaurant looks like, as GLSL: the floor's
// penny rounds, marble, oak and the other woods, zinc, brass, the tin
// ceiling, leather, cane, chalk, china, paper, fruit, the lit things. Drawn
// from where each fragment is in the room (mm), so the detail holds however
// close the camera comes and fades where a pixel can't show it. The shader
// chooses by the vertex's kind (kinds.ts), and leaves its findings in a few
// variables the material then uses (materials.ts).

import { DINING_ROOM } from "@fly/world";
import { EXIT, ROOM } from "./plan.ts";

const f = (n: number) => n.toFixed(1);

/** Functions the surfaces share: wood, marble, the floor's lattice, the zinc's hammering. */
export const SURFACE_HEAD = /* glsl */ `
float rAO;
float rRough;
float rMetal;
float rCoat;
float rCoatRough;
// A tilt of the normal, in world space, added to the geometry's.
vec3 rBump;
vec3 rEmit;
uniform float uTime;
uniform float uNight;
uniform float uOpening;
uniform sampler2D uFloorAO;
uniform vec4 uRings[6];

// Wood: growth rings as long stripes along the board (u), wavering, closing into arches; fibres and pores.
vec3 rWood(vec2 p, vec3 early, vec3 late, float plank, out float figure) {
  float k = floor((p.y + 9000.0) / plank);
  float seed = rHash1(k + 3.0);
  float across = p.y + 9000.0 - (k + 0.5) * plank;
  float along = p.x + seed * 4000.0;
  float warp = rFbm(vec2(along * 0.0021, seed * 9.0 + across * 0.004)) * 30.0 + rNoise(vec2(along * 0.011, across * 0.03 + seed)) * 4.0;
  float arch = sqrt(abs(across - 20.0 * (seed - 0.5)) * 40.0 + (0.5 + 0.5 * sin(along * 0.0037 + seed * 6.0)) * 1600.0);
  float ring = (arch + warp) / (2.2 + seed * 1.4);
  float fr = fract(ring);
  float lw = smoothstep(0.55, 0.86, fr) * (1.0 - smoothstep(0.93, 1.0, fr));
  lw = mix(lw, 0.24, smoothstep(0.2, 0.55, fwidth(ring)));
  vec3 c = mix(early * (0.9 + 0.2 * seed), late, lw * 0.85);
  vec2 fib = vec2(along * 0.09, across * 1.7);
  float fd = rDetail(fib);
  c *= 1.0 + (rNoise(fib) - 0.5) * 0.28 * fd;
  vec2 pore = vec2(along * 0.9 + across * 0.35, across * 7.0 + warp * 2.0);
  float pd = rDetail(pore);
  float pores = smoothstep(0.74, 0.86, rNoise(pore) * 0.75 + rNoise(pore * 1.9 + 3.7) * 0.25) * (1.0 - lw * 0.6);
  c *= 1.0 - pores * 0.4 * pd;
  figure = lw + pores * pd * 0.5;
  return c;
}
// Where on a wooden thing its grain runs: along the longer way of a level face, up an upright one.
vec2 rGrain(vec3 p, vec3 n) {
  vec3 a = abs(n);
  if (a.y > 0.6) return p.xz;
  return a.z >= a.x ? vec2(p.y + p.x * 0.05, p.x) : vec2(p.y + p.z * 0.05, p.z);
}

// White marble: a soft cloud with grey veins, a few strong ones and many fine.
vec3 rMarble(vec2 p, float seed, out float vein) {
  vec2 q = p * 0.0042 + seed * 17.0;
  float warp = rFbm(q * 0.8 + 4.0) * 2.4;
  float v = rFbm(q * vec2(1.0, 0.6) + vec2(warp, warp * 0.7));
  float strong = 1.0 - smoothstep(0.0, 0.028 + fwidth(v) * 1.5, abs(v - 0.5));
  vec2 fq = q * 3.3 + warp * 1.4;
  float fv = rFbm(fq);
  float fine = (1.0 - smoothstep(0.0, 0.018 + fwidth(fv) * 1.5, abs(fv - 0.52))) * rDetail(fq * 6.0);
  vec3 c = mix(vec3(0.86, 0.86, 0.84), vec3(0.95, 0.945, 0.93), rFbm(q * 2.0 + 9.0));
  c = mix(c, vec3(0.6, 0.62, 0.64), strong * (0.45 + 0.35 * rNoise(q * 5.0)));
  c = mix(c, vec3(0.7, 0.71, 0.72), fine * 0.4);
  vein = strong;
  return c;
}

// The floor's penny rounds on a hexagonal lattice: the offset (mm) from the nearest round's middle, and its middle (lattice units).
const float PITCH = 21.0;
const float PENNY = 9.3;
vec4 rPenny(vec2 p) {
  vec2 q = p / PITCH;
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(q, r) - h;
  vec2 b = mod(q - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  return vec4(g * PITCH, q - g);
}
// Which rounds are black: a border of two bands round the walls, and a flower of seven every so often in the field.
float rBlack(vec2 middle) {
  float wall = min(${f(DINING_ROOM.hx)} - abs(middle.x), ${f(DINING_ROOM.hz)} - abs(middle.y));
  float border = rBand(wall, 140.0, 182.0, 0.5) + rBand(wall, 236.0, 258.0, 0.5);
  vec2 cell = vec2(441.0, 381.9);
  vec2 c = (floor(middle / cell + 0.5)) * cell;
  float flower = step(length(middle - c), 23.0);
  return clamp(border + flower * step(300.0, wall), 0.0, 1.0);
}

// Hammered zinc: shallow dimples of a hammer's face, each a cell; the way each tilts.
vec3 rDimples(vec2 p) {
  vec2 q = p / 7.0;
  vec2 cell = floor(q);
  vec2 fr = fract(q);
  float f1 = 9.0;
  vec2 to = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + vec2(rHash(cell + g), rHash(cell + g + 17.3)) * 0.8 - fr;
    float d = dot(r, r);
    if (d < f1) { f1 = d; to = r; }
  }
  return vec3(-to * 0.12, sqrt(f1));
}

// The pressed tin: squares of a raised bead round a medallion of rings and petals; its height (0 to 1) at a point.
float rTinHeight(vec2 p) {
  vec2 c = mod(p, 610.0) - 305.0;
  float d = max(abs(c.x), abs(c.y));
  float bead = smoothstep(296.0, 290.0, d) * smoothstep(272.0, 280.0, d);
  float r = length(c);
  float a = atan(c.y, c.x);
  float rings = smoothstep(4.0, 0.0, abs(r - 90.0)) + smoothstep(3.0, 0.0, abs(r - 150.0)) * 0.7;
  float petal = smoothstep(0.0, 0.6, cos(a * 8.0)) * smoothstep(150.0, 95.0, r) * smoothstep(20.0, 40.0, r);
  float field = smoothstep(272.0, 255.0, d) * (0.25 + 0.15 * sin(c.x * 0.105) * sin(c.y * 0.105));
  return max(max(bead, rings), max(petal * 0.8, field * smoothstep(170.0, 200.0, r)));
}
`;

/** Each kind's look, after the vertex colours: `diffuseColor`, and the variables above. */
export const SURFACE_COLOR = /* glsl */ `
int rK = int(vKind + 0.5);
rCasting = rInCast();
rAO = 1.0;
rRough = 0.6;
rMetal = 0.0;
rCoat = 0.0;
rCoatRough = 0.1;
rBump = vec3(0.0);
rEmit = vec3(0.0);
vec3 rN = normalize(vWorldNormal);
if (rK == K_TILE) {
  vec4 pc = rPenny(vWorld.xz);
  vec2 g = pc.xy;
  vec2 middle = pc.zw * PITCH;
  float r = length(g);
  float d = rDetail(vWorld.xz / PITCH);
  float h = rHash(pc.zw + 0.31);
  float black = rBlack(middle);
  vec3 penny = mix(vec3(0.83, 0.82, 0.78) * (0.95 + 0.08 * h), vec3(0.035, 0.035, 0.04) * (0.8 + 0.5 * h), black);
  // Grout, darker where dirt lies: in the corners and along the walls, round the bar's foot.
  float wall = min(${f(DINING_ROOM.hx)} - abs(vWorld.x), ${f(DINING_ROOM.hz)} - abs(vWorld.z));
  float grime = rFbm(vWorld.xz * 0.004) * 0.6 + (1.0 - smoothstep(0.0, 300.0, wall)) * 0.4;
  vec3 grout = mix(vec3(0.5, 0.48, 0.43), vec3(0.24, 0.22, 0.19), grime);
  // A round chipped at its rim now and then, and one in a few hundred gone, the bed showing.
  float chip = step(0.986, rHash(pc.zw + 7.7));
  vec2 cd = vec2(cos(h * 6.283), sin(h * 6.283));
  float chipped = chip * smoothstep(3.6, 2.6, length(g - cd * PENNY));
  float gone = step(0.9975, rHash(pc.zw + 3.1));
  float inside = 1.0 - smoothstep(PENNY - 0.35 - fwidth(r), PENNY + 0.15, r);
  inside *= 1.0 - chipped;
  inside *= 1.0 - gone;
  vec3 c = mix(grout, penny, inside);
  c = mix(c, vec3(0.32, 0.3, 0.27), gone * smoothstep(PENNY + 1.0, PENNY - 1.0, r));
  // Worn where feet go: dull, a little grey, along the bar and from the door.
  float worn = smoothstep(0.35, 0.8, rFbm(vWorld.xz * 0.0016)) * 0.6 + (1.0 - smoothstep(0.0, 500.0, abs(vWorld.x + 2050.0))) * 0.45;
  c = mix(c, c * 0.88 + vec3(0.03), worn * inside * 0.5);
  // From far off, the rounds and the grout blend into their average.
  vec3 average = mix(mix(vec3(0.72, 0.71, 0.67), vec3(0.04), black * 0.85), grout, 0.18);
  diffuseColor.rgb *= mix(average, c, d);
  // Each round glazed and a little domed; the grout sits lower and is matte.
  rRough = mix(0.85, 0.16 + worn * 0.25, inside * d + (1.0 - d) * 0.6);
  rCoat = inside * d * 0.5 * (1.0 - worn * 0.5);
  rBump = vec3(g.x, 0.0, g.y) / PENNY * 0.18 * inside * d * smoothstep(PENNY * 0.4, PENNY, r);
  rAO *= mix(1.0, 0.7, (1.0 - inside) * d);
}
if (rK == K_MARBLE) {
  float vein;
  float seed = rHash(floor(vWorld.xz / 1300.0 + 0.5));
  diffuseColor.rgb *= rMarble(vWorld.xz + vWorld.y * vec2(0.3, 0.7), seed, vein);
  // A faint polish, worn by years of plates and elbows.
  rRough = 0.3 + vein * 0.08;
  rCoat = 0.45;
  rCoatRough = 0.12;
  // Rings where glasses and cups stood, a wine stain, a smear: each the rim of a ring, a little dull.
  for (int i = 0; i < 6; i++) {
    vec4 ring = uRings[i];
    if (ring.z <= 0.0) continue;
    vec2 dd = vWorld.xz - ring.xy;
    float e = length(dd) - ring.z;
    float a = atan(dd.y, dd.x);
    float rim = (1.0 - smoothstep(0.4, 1.4 + fwidth(e), abs(e))) * (0.55 + 0.45 * rNoise(vec2(a * 5.0, ring.w)));
    float fill = (1.0 - smoothstep(-2.0, 0.0, e)) * 0.25;
    vec3 tint = ring.w < 1.0 ? vec3(0.62, 0.4, 0.44) : ring.w < 2.0 ? vec3(0.78, 0.66, 0.52) : vec3(0.85, 0.85, 0.85);
    float k = max(rim, fill) * (ring.w < 2.0 ? 0.55 : 0.3);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * tint, k);
    rCoat *= 1.0 - k * 0.6;
    rRough += k * 0.25;
  }
}
if (rK == K_OAK || rK == K_MAHOGANY || rK == K_BENTWOOD) {
  float figure;
  vec2 gp = rGrain(vWorld, rN);
  if (rK == K_OAK) {
    diffuseColor.rgb *= rWood(gp, vec3(0.62, 0.44, 0.27), vec3(0.36, 0.23, 0.12), 120.0, figure);
    rRough = 0.5 + figure * 0.1;
    rCoat = 0.35;
  } else if (rK == K_MAHOGANY) {
    diffuseColor.rgb *= rWood(gp, vec3(0.34, 0.15, 0.09), vec3(0.15, 0.06, 0.035), 180.0, figure);
    rRough = 0.45;
    rCoat = 0.7;
    rCoatRough = 0.12;
  } else {
    // Black lacquer over beech: the grain only a sheen in it, brown where it's worn through.
    vec3 wood = rWood(gp * vec2(1.0, 3.0), vec3(0.5, 0.36, 0.22), vec3(0.3, 0.2, 0.12), 60.0, figure);
    diffuseColor.rgb *= mix(vec3(0.03, 0.026, 0.024) * (1.0 + figure * 0.4), wood * 0.6, smoothstep(0.78, 0.95, rNoise(vWorld.xz * 0.08 + vWorld.y * 0.05)) * 0.35);
    rRough = 0.32;
    rCoat = 0.8;
    rCoatRough = 0.14;
  }
}
if (rK == K_IRON) {
  vec2 ip = vWorld.xz * 0.6 + vWorld.y * 0.4;
  diffuseColor.rgb *= vec3(0.06, 0.06, 0.06) * (0.85 + 0.3 * rNoise(ip) * rDetail(ip));
  rMetal = 0.6;
  rRough = 0.55;
}
if (rK == K_CANE) {
  // Woven cane: strands one way and the other and on the diagonals, the holes between them dark.
  vec2 cp = vWorld.xz / 3.2;
  float d = rDetail(cp);
  float s1 = abs(fract(cp.x) - 0.5);
  float s2 = abs(fract(cp.y) - 0.5);
  float s3 = abs(fract((cp.x + cp.y) * 0.7071) - 0.5);
  float strand = max(max(smoothstep(0.32, 0.18, s1), smoothstep(0.32, 0.18, s2)), smoothstep(0.3, 0.15, s3) * 0.9);
  float over = step(0.5, fract(cp.x * 0.5 + floor(cp.y) * 0.5));
  vec3 c = mix(vec3(0.07, 0.05, 0.03), vec3(0.78, 0.6, 0.34) * (0.85 + 0.25 * over), strand);
  diffuseColor.rgb *= mix(vec3(0.6, 0.46, 0.27), c, d);
  rRough = 0.55;
  rCoat = 0.25 * strand * d;
  rBump = vec3(s1 - 0.25, 0.0, s2 - 0.25) * 0.3 * d;
}
if (rK == K_ZINC) {
  vec3 dim = rDimples(vWorld.xz);
  float d = rDetail(vWorld.xz / 7.0);
  float patina = rFbm(vWorld.xz * 0.006) * 0.7 + rNoise(vWorld.xz * 0.05) * 0.3;
  vec3 c = mix(vec3(0.6, 0.62, 0.63), vec3(0.4, 0.42, 0.43), smoothstep(0.35, 0.75, patina));
  // Water marks: pale rings and runs left by wet glasses and cloths.
  vec2 wq = vWorld.xz * 0.012;
  float marks = (1.0 - smoothstep(0.0, 0.04 + fwidth(wq.x) * 4.0, abs(rFbm(wq) - 0.5))) * smoothstep(0.4, 0.7, rNoise(wq * 0.5 + 3.0));
  c = mix(c, vec3(0.78, 0.79, 0.78), marks * 0.45);
  // Elbows have polished the front edge bright.
  float edge = smoothstep(${f(-2570)} - 120.0, ${f(-2570)}, vWorld.x);
  diffuseColor.rgb *= c;
  // Old zinc is dull: grey, half metal, the hammering catching what light there is; only the front edge is bright.
  rMetal = mix(0.45, 0.75, edge);
  rRough = mix(0.46, 0.28, edge) + marks * 0.12 + patina * 0.1;
  rBump = vec3(dim.x, 0.0, dim.y) * d * (1.0 - edge * 0.6);
}
if (rK == K_BRASS) {
  float tarnish = rFbm(vWorld.xz * 0.02 + vWorld.y * 0.01);
  diffuseColor.rgb *= mix(vec3(0.95, 0.72, 0.36), vec3(0.5, 0.36, 0.18), smoothstep(0.45, 0.8, tarnish) * 0.6);
  rMetal = 1.0;
  rRough = 0.22 + tarnish * 0.2;
}
if (rK == K_STEEL) {
  vec2 sp = vec2(vWorld.x * 0.02, (vWorld.z + vWorld.y) * 3.0);
  diffuseColor.rgb *= vec3(0.75, 0.76, 0.78) * (0.92 + 0.12 * rNoise(sp) * rDetail(sp));
  rMetal = 1.0;
  rRough = 0.3 + 0.1 * rNoise(sp * 0.3);
}
if (rK == K_MIRROR) {
  // Old mirror: the silvering foxed and gone smoky, most at its edges.
  vec2 mp = (abs(rN.x) > 0.5 ? vWorld.zy : vWorld.xy) * 0.01;
  float fox = rFbm(mp) * 0.7 + rNoise(mp * 9.0) * 0.3;
  float spots = smoothstep(0.62, 0.85, fox);
  diffuseColor.rgb = mix(vec3(0.05, 0.05, 0.045), vec3(0.14, 0.1, 0.07), spots);
  rMetal = 1.0 - spots * 0.7;
  rRough = 0.05 + spots * 0.4;
}
if (rK == K_PLASTER) {
  vec2 pp = rGrain(vWorld, rN) * 0.004;
  float mottle = rFbm(pp) * 0.6 + rFbm(pp * 6.0) * 0.4;
  diffuseColor.rgb *= 0.9 + mottle * 0.16;
  // Years of the room's air have yellowed it toward the ceiling.
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.9, 0.82, 0.66), smoothstep(1800.0, 3200.0, vWorld.y) * 0.6);
  rRough = 0.88;
}
if (rK == K_TIN) {
  vec2 tp = vWorld.xz;
  float d = rDetail(tp / 6.0);
  float h0 = rTinHeight(tp);
  float hx = rTinHeight(tp + vec2(2.0, 0.0));
  float hz = rTinHeight(tp + vec2(0.0, 2.0));
  rBump = vec3(-(hx - h0), 0.0, -(hz - h0)) * 1.6 * d;
  diffuseColor.rgb *= (0.86 + 0.14 * h0) * (0.92 + 0.08 * rFbm(tp * 0.003));
  rRough = 0.4;
  rMetal = 0.25;
  rAO *= 0.85 + 0.15 * h0;
}
if (rK == K_LEATHER) {
  // Buttoned: the leather pulled into diamonds between the buttons, pillowed in between, creased toward each button.
  vec2 lp = vec2(vWorld.z, vWorld.y + vWorld.x * (abs(rN.y) > 0.6 ? 1.0 : 0.0)) / vec2(150.0, 130.0);
  vec2 cell = vec2(lp.x + lp.y, lp.x - lp.y);
  vec2 fr = fract(cell) - 0.5;
  float r = length(fr);
  bool back = abs(rN.x) > 0.6 && vWorld.y > ${f(470)};
  float pillow = back ? 1.0 - r * 1.4 : 0.0;
  diffuseColor.rgb *= (0.8 + 0.25 * pillow) * (0.9 + 0.15 * rFbm(vWorld.yz * 0.05));
  if (back) {
    rBump = vec3(0.0, -fr.y, fr.x) * 0.45;
    float button = 1.0 - smoothstep(0.035, 0.06, r);
    diffuseColor.rgb *= 1.0 - button * 0.6;
    rAO *= 1.0 - (1.0 - smoothstep(0.0, 0.18, r)) * 0.4;
  }
  rRough = 0.45;
  rCoat = 0.35;
  rCoatRough = 0.3;
}
if (rK == K_CHALK) {
  // A slate, wiped over and over, with lines of illegible chalk: short strokes along rows, and a smudged haze.
  vec2 cp = vec2(vWorld.x, vWorld.y);
  float haze = rFbm(cp * 0.006) * 0.12;
  float row = fract(cp.y / 70.0);
  float inRow = rBand(row, 0.3, 0.7, 0.04) * step(0.25, rHash1(floor(cp.y / 70.0)));
  float strokes = smoothstep(0.55, 0.75, rNoise(vec2(cp.x * 0.12, floor(cp.y / 70.0) * 3.0))) * smoothstep(0.35, 0.6, rNoise(vec2(cp.x * 0.6, cp.y * 0.6)));
  float words = inRow * strokes * rBand(cp.x, ${f(-880)} + rHash1(floor(cp.y / 70.0)) * 160.0, ${f(-140)} - rHash1(floor(cp.y / 70.0) + 4.0) * 260.0, 6.0);
  diffuseColor.rgb = mix(vec3(0.06, 0.075, 0.07) + haze, vec3(0.85, 0.85, 0.8), words * 0.75);
  rRough = 0.92;
}
if (rK == K_PRINT) {
  // An old poster's colour fields: a dark ground, a sun, a long shape and a band, faded.
  vec2 q = vec2(vWorld.x + 1700.0, vWorld.y - 1700.0) / 300.0;
  vec3 c = mix(vec3(0.12, 0.18, 0.24), vec3(0.78, 0.66, 0.42), smoothstep(0.02, -0.02, length(q - vec2(0.35, 0.45)) - 0.25));
  c = mix(c, vec3(0.64, 0.16, 0.1), rBand(q.y, -0.95, -0.55, 0.01));
  c = mix(c, vec3(0.08, 0.06, 0.05), rBand(q.x, -0.35, -0.12, 0.01) * rBand(q.y, -0.55, 0.65, 0.01));
  diffuseColor.rgb = c * (0.85 + 0.15 * rFbm(q * 8.0));
  rRough = 0.8;
}
if (rK == K_CERAMIC) {
  rRough = 0.12;
  rCoat = 1.0;
  rCoatRough = 0.04;
}
if (rK == K_PAPER) {
  vec2 pp = vWorld.xz * 3.0;
  diffuseColor.rgb *= 0.95 + (rFbm(pp) - 0.5) * 0.1 * rDetail(pp);
  rRough = 0.9;
}
if (rK == K_BREAD) {
  vec2 bp = vWorld.xz * 0.35 + vWorld.y * 0.5;
  float d = rDetail(bp);
  diffuseColor.rgb *= 0.75 + rFbm(bp) * 0.4 * d + 0.1;
  // Flour dust on the crust.
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.88, 0.8), smoothstep(0.65, 0.85, rNoise(bp * 2.0)) * 0.35 * d * step(0.3, rN.y));
  rRough = 0.8;
}
if (rK == K_SUGAR) {
  vec2 sp = vWorld.xz * 2.0 + vWorld.y;
  float glint = smoothstep(0.82, 0.95, rNoise(sp)) * rDetail(sp);
  diffuseColor.rgb *= 0.92 + glint * 0.2;
  rRough = 0.35 - glint * 0.2;
  rCoat = 0.5;
}
if (rK == K_FRUIT) {
  vec2 gp = vWorld.xz * 1.6 + vWorld.yy * 1.1;
  float d = rDetail(gp);
  rBump = (vec3(rNoise(gp), 0.0, rNoise(gp + 5.0)) - 0.5) * 0.3 * d;
  diffuseColor.rgb *= 0.9 + rNoise(gp * 0.2) * 0.2;
  rRough = 0.4;
  rCoat = 0.3;
}
if (rK == K_WAX) rRough = 0.55;
if (rK == K_LINEN) {
  vec2 lp = vWorld.xz * 2.2 + vWorld.y * 1.3;
  float d = rDetail(lp);
  diffuseColor.rgb *= 0.92 + (abs(fract(lp.x) - 0.5) + abs(fract(lp.y) - 0.5)) * 0.1 * d;
  rRough = 0.95;
}
if (rK == K_ENAMEL) {
  rRough = 0.2;
  rCoat = 1.0;
}
if (rK == K_PAINT) {
  rRough = 0.35;
  rCoat = 0.5;
  rCoatRough = 0.2;
  diffuseColor.rgb *= 0.95 + 0.05 * rNoise(vWorld.xy * 0.05 + vWorld.z * 0.05);
}
if (rK == K_GLOSSY) { rRough = 0.18; rCoat = 0.8; }
if (rK == K_MATTE) rRough = 0.92;
if (rK == K_RUBBER) {
  vec2 rp = vWorld.xz / 9.0;
  vec2 fr = fract(rp) - 0.5;
  float nub = 1.0 - smoothstep(0.18, 0.28, length(fr));
  rBump = vec3(fr.x, 0.0, fr.y) * nub * 0.8 * rDetail(rp);
  diffuseColor.rgb *= 0.8 + nub * 0.3;
  rRough = 0.7;
}
if (rK == K_LABEL) {
  vec2 lp = vWorld.xy * 0.4 + vWorld.z * 0.4;
  diffuseColor.rgb *= 0.9 + rFbm(lp) * 0.15;
  rRough = 0.7;
}
if (rK == K_CRUMB || rK == K_CAKE) {
  vec2 cp = vWorld.xz * 2.5 + vWorld.y * 2.0;
  diffuseColor.rgb *= 0.8 + rFbm(cp) * 0.35;
  rRough = 0.85;
}
if (rK == K_FLOWER) rRough = 0.5;
if (rK == K_GRAPE) {
  rRough = 0.12;
  rCoat = 0.9;
}
if (rK == K_BOTTLE_FAR) {
  rRough = 0.1;
  rCoat = 1.0;
}
if (rK == K_KITCHEN) rRough = 0.5;
if (rK == K_FLOWER || rK == K_BOTTLE_FAR) rCoatRough = 0.06;
`;

/** After every kind's look (the parts' too): the shadows gathered where things meet. */
export const SURFACE_FINISH = /* glsl */ `
// The floor: soft shadows under everything that stands on it, painted once from the layout.
if (vWorld.y < 3.0 && rN.y > 0.5 && abs(vWorld.x) < ${f(DINING_ROOM.hx)} && abs(vWorld.z) < ${f(DINING_ROOM.hz)}) rAO *= texture2D(uFloorAO, vec2((vWorld.x + ${f(DINING_ROOM.hx)}) / ${f(DINING_ROOM.hx * 2)}, (vWorld.z + ${f(DINING_ROOM.hz)}) / ${f(DINING_ROOM.hz * 2)})).r;
// Where walls meet the floor and the ceiling, the corners gather shadow.
{
  float wall = min(${f(DINING_ROOM.hx)} - abs(vWorld.x), ${f(DINING_ROOM.hz)} - abs(vWorld.z));
  float low = vWorld.y;
  float high = ${f(ROOM.height)} - vWorld.y;
  rAO *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 260.0, wall)) * (1.0 - smoothstep(0.0, 220.0, min(low, high)) * 0.6);
  rAO *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 380.0, high));
}
if (rCasting) rAO *= rCastAO(vWorld);
`;

/** What glows of itself. */
export const SURFACE_EMISSIVE = /* glsl */ `
if (rK == K_LAMP) rEmit += diffuseColor.rgb * (0.02 + uPendant.w * 2.2e-6);
if (rK == K_FRIDGE) {
  // Cool white light from the top of the fridge, falling on rows of bottles: brightest up high, the bottles darker shapes.
  float row = fract((vWorld.y - 120.0) / 230.0);
  float bottle = step(0.5, fract(vWorld.z / 92.0 + floor((vWorld.y - 120.0) / 230.0) * 0.37)) * smoothstep(0.1, 0.25, row) * (1.0 - smoothstep(0.7, 0.85, row));
  vec3 glow = vec3(0.72, 0.86, 1.0) * (0.55 + 0.45 * smoothstep(0.0, 1.0, row));
  rEmit += mix(glow, glow * vec3(0.4, 0.55, 0.45), bottle * 0.8) * uFridge.b * 0.18;
}
if (rK == K_EXIT) {
  // A green panel, a white figure running out through a white door; no words.
  vec2 q = vec2((vWorld.x - ${f(EXIT.x0)}) / ${f(EXIT.x1 - EXIT.x0)}, (vWorld.y - ${f(EXIT.y0)}) / ${f(EXIT.y1 - EXIT.y0)});
  vec2 a = vec2(q.x * 2.0, q.y);
  float doorway = rBand(a.x, 1.35, 1.75, 0.01) * rBand(a.y, 0.18, 0.84, 0.01) * (1.0 - rBand(a.x, 1.42, 1.68, 0.01) * rBand(a.y, 0.24, 0.84, 0.01));
  float head = 1.0 - smoothstep(0.055, 0.075, length(a - vec2(0.98, 0.76)));
  float body = 1.0 - smoothstep(0.035, 0.055, abs((a.x - 0.92) - (a.y - 0.48) * 0.35)) ;
  body *= rBand(a.y, 0.38, 0.68, 0.01);
  float leg1 = (1.0 - smoothstep(0.03, 0.05, abs((a.x - 0.8) + (a.y - 0.25) * 1.1))) * rBand(a.y, 0.12, 0.4, 0.01);
  float leg2 = (1.0 - smoothstep(0.03, 0.05, abs((a.x - 1.05) - (a.y - 0.25) * 0.9))) * rBand(a.y, 0.12, 0.4, 0.01);
  float arm1 = (1.0 - smoothstep(0.025, 0.045, abs((a.y - 0.6) + (a.x - 1.0) * 0.6))) * rBand(a.x, 0.95, 1.2, 0.01);
  float arm2 = (1.0 - smoothstep(0.025, 0.045, abs((a.y - 0.58) - (a.x - 0.85) * 0.8))) * rBand(a.x, 0.7, 0.9, 0.01);
  float arrow = (1.0 - smoothstep(0.03, 0.05, abs(a.y - 0.5))) * rBand(a.x, 0.18, 0.5, 0.01) + (1.0 - smoothstep(0.03, 0.05, abs(abs(a.y - 0.5) - (0.6 - a.x) * 0.9))) * rBand(a.x, 0.42, 0.6, 0.01);
  float white = clamp(doorway + head + body + leg1 + leg2 + arm1 + arm2 + arrow, 0.0, 1.0);
  vec3 face = mix(vec3(0.04, 0.85, 0.32), vec3(0.85, 1.0, 0.9), white);
  diffuseColor.rgb = face * 0.2;
  rEmit += face * uExit.g * 0.6;
}
if (rK == K_OPENING) rEmit += vec3(1.0) * uOpening;
if (rK == K_KITCHEN) rEmit += diffuseColor.rgb * (uKitchen * 0.6 + uHeat * 0.15 * smoothstep(1500.0, 1100.0, abs(vWorld.y - 1100.0)) * step(${f(-3400)}, vWorld.z));
`;
