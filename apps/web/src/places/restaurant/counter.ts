// The zinc bar: its top, its panelled front, the bartender's counter behind
// it, the brass foot rail, the stools, the pendants over it (the middle one
// left on), and what is left on the zinc. The shapes are in counter-bar.ts,
// counter-seats.ts and counter-things.ts; here, the look of the counter's own
// kinds: the stools' leather, the pendants' braided cords, enamel shades and
// frosted diffusers (the lit one glowing, brightest over its bulb), the cut
// lemon, the bruised peach, the cutting board and the cake.

import { ON_BAR, PENDANTS, STOOL, ZINC_BAR } from "@fly/world";
import type { Part } from "./parts.ts";
import { BODY, buildBarBody } from "./counter-bar.ts";
import { CTR, SEATS, buildSeats } from "./counter-seats.ts";
import { THINGS, buildThings } from "./counter-things.ts";
import { generic } from "./standins.ts";

const f = (n: number) => n.toFixed(2);
const v2 = (x: number, z: number) => `vec2(${f(x)}, ${f(z)})`;

/** The nearest of some values to `v`, as GLSL: which stool, which pendant. */
const nearest = (name: string, values: readonly number[]) =>
  `float ${name}(float v) {\n  float best = ${f(values[0])};\n${values
    .slice(1)
    .map((z) => `  if (abs(v - ${f(z)}) < abs(v - best)) best = ${f(z)};`)
    .join("\n")}\n  return best;\n}`;

const peach = ON_BAR.peach;
const peachY = ZINC_BAR.zinc.top + ON_BAR.bowl.well + peach.r * 0.9;
// The bruise, where the world's peach patch is: on the fruit, above that point.
const bruise = (() => {
  const dx = 18;
  const dz = 14;
  const dy = Math.sqrt(peach.r * peach.r - dx * dx - dz * dz);
  const l = Math.hypot(dx, dy, dz);
  return [dx / l, dy / l, dz / l].map(f).join(", ");
})();
const cuts = [...ON_BAR.slices.map((s) => ({ x: s.x, z: s.z, r: s.r })), { x: ON_BAR.halfLemon.x, z: ON_BAR.halfLemon.z, r: ON_BAR.halfLemon.r }];
const board = ON_BAR.board;
const cake = ON_BAR.cake;

const HEAD = /* glsl */ `
const int K_CTR_LEATHER = ${CTR.leather};
const int K_CTR_CORD = ${CTR.cord};
const int K_CTR_DIFFUSER = ${CTR.diffuser};
const int K_CTR_SHADE = ${CTR.shade};
const int K_CTR_CITRUS = ${CTR.citrus};
const int K_CTR_PEACH = ${CTR.peach};
const int K_CTR_BOARD = ${CTR.board};
const int K_CTR_CAKE = ${CTR.cake};
${nearest("ctrStoolZ", STOOL.zs)}
${nearest("ctrPendantZ", PENDANTS.zs)}
// The slice of lemon nearest a point (and the half lemon): its middle and radius.
vec3 ctrSlice(vec2 p) {
  vec3 best = vec3(${v2(ON_BAR.slices[0].x, ON_BAR.slices[0].z)}, ${f(ON_BAR.slices[0].r)});
${ON_BAR.slices
  .slice(1)
  .map((s) => `  if (distance(p, ${v2(s.x, s.z)}) < distance(p, best.xy)) best = vec3(${v2(s.x, s.z)}, ${f(s.r)});`)
  .join("\n")}
  return best;
}
// How wet the board is with juice: round the lemon and its slices, a soaked margin with a ragged edge.
float ctrJuice(vec2 p) {
  float wet = 0.0;
  float ragged = rNoise(p * 0.15) * 8.0;
${cuts.map((c) => `  wet = max(wet, 1.0 - smoothstep(${f(c.r + 2)}, ${f(c.r + 9)} + ragged, distance(p, ${v2(c.x, c.z)})));`).join("\n")}
  return wet;
}
`;

const COLOR = /* glsl */ `
if (rK == K_CTR_LEATHER) {
  vec2 q = vWorld.xz - vec2(${f(STOOL.x)}, ctrStoolZ(vWorld.z));
  float r = length(q);
  float a = atan(q.y, q.x);
  float top = smoothstep(0.4, 0.8, rN.y);
  vec2 gp = vWorld.xz * 1.7 + vWorld.y * 1.3;
  float d = rDetail(gp);
  float grain = rNoise(gp);
  // Sat on for years: the middle rubbed paler and glossy, the dye gone toward brown; creases run in from the edge.
  float worn = top * (1.0 - smoothstep(30.0, 150.0, r + (rFbm(q * 0.03) - 0.5) * 60.0));
  float crease = smoothstep(0.72, 0.95, rNoise(vec2(a * 22.0, r * 0.015))) * smoothstep(110.0, 172.0, r) * top;
  // Stitching just inside the top piping, a stitch every 3.5 mm.
  float stitch = rBand(r, 171.6, 172.8, 0.25) * smoothstep(0.35, 0.5, fract(a * r / 3.5)) * top * rDetail(vec2(a * r / 3.5));
  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.5, 1.2, 0.95), worn * 0.75) * (0.92 + (grain - 0.5) * 0.18 * d) * (1.0 - crease * 0.4);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.5, 0.38), stitch * 0.6);
  rRough = mix(0.5, 0.3, worn) + crease * 0.2;
  rCoat = 0.45 * (1.0 - crease) * (1.0 - stitch);
  rCoatRough = 0.22;
  rBump = vec3(grain - 0.5, 0.0, rNoise(gp + 7.0) - 0.5) * 0.18 * d;
}
if (rK == K_CTR_CORD) {
  // Braided cloth: strands wound round each way, over and under.
  vec2 q = vWorld.xz - vec2(${f(PENDANTS.x)}, ctrPendantZ(vWorld.z));
  float a = atan(q.y, q.x) * 4.0;
  float y = vWorld.y * 1.1;
  float d = rDetail(vec2(y, a));
  float one = sin(a + y);
  float two = sin(a - y);
  float over = step(0.0, sin(a * 0.5 + y * 0.5) * sin(a * 0.5 - y * 0.5));
  float weave = mix(one, two, over);
  diffuseColor.rgb *= 0.8 + weave * 0.25 * d;
  rRough = 0.8;
  rBump = (vec3(-q.y, 0.0, q.x) * 0.25 * (one - two) + vec3(0.0, one + two, 0.0)) * 0.12 * d;
}
if (rK == K_CTR_DIFFUSER) {
  // Opal glass, frosted under: a faint mottle, a soft sheen.
  vec2 q = vWorld.xz - vec2(${f(PENDANTS.x)}, ctrPendantZ(vWorld.z));
  diffuseColor.rgb *= 0.94 + 0.06 * rNoise(q * 0.2);
  rRough = 0.75;
}
if (rK == K_CTR_SHADE) {
  vec2 q = vWorld.xz - vec2(${f(PENDANTS.x)}, ctrPendantZ(vWorld.z));
  float r = length(q);
  float a = atan(q.y, q.x);
  rRough = 0.16;
  rCoat = 1.0;
  rCoatRough = 0.04;
  bool inside = r < ${f(PENDANTS.r - 3.6)} && vWorld.y < ${f(PENDANTS.bottom + 4.5)} && dot(rN.xz, q) < 0.0;
  if (inside) {
    // The white inside, seen at the rim.
    diffuseColor.rgb = vec3(0.86, 0.84, 0.8);
  } else if (r < 25.0) {
    // The brass cap where the cord goes in.
    diffuseColor.rgb = vec3(0.8, 0.6, 0.3) * (0.85 + 0.2 * rNoise(q * 0.4));
    rMetal = 1.0;
    rRough = 0.3;
    rCoat = 0.0;
  } else {
    // Chipped here and there at the rim, where it has been knocked, the iron black under the enamel; a film of dust on top.
    float chip = smoothstep(0.84, 0.86, rNoise(vec2(a * 24.0, vWorld.y * 0.35))) * smoothstep(${f(PENDANTS.r - 14)}, ${f(PENDANTS.r - 3)}, r);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03), chip);
    float dust = smoothstep(0.55, 0.95, rN.y) * (0.12 + 0.08 * rFbm(q * 0.05));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.4, 0.36), dust);
    rRough = mix(0.16, 0.6, max(chip, dust * 2.0));
    rCoat = (1.0 - chip) * (1.0 - dust * 2.0);
  }
}
if (rK == K_CTR_CITRUS) {
  vec3 s = ctrSlice(vWorld.xz);
  vec2 q = vWorld.xz - s.xy;
  float r = length(q) / s.z;
  float a = atan(q.y, q.x);
  if (rN.y > 0.5 && r < 1.02) {
    // The cut face: ten segments of flesh in their membranes, the pith's white ring, the peel; wet.
    float k = fract(a / 6.2832 * 10.0 + 0.04 * sin(r * 9.0));
    float membrane = 1.0 - smoothstep(0.0, 0.035 + fwidth(k) * 1.5, min(k, 1.0 - k) * (0.4 + r));
    vec2 vp = vec2(r * 14.0, k * 5.0 + floor(a / 6.2832 * 10.0) * 3.1);
    float cells = rNoise(vp) * rDetail(vp);
    vec3 flesh = vec3(1.0, 0.86, 0.32) * (0.78 + 0.35 * cells);
    vec3 c = mix(flesh, vec3(1.0, 0.97, 0.82), membrane * 0.8);
    c = mix(c, vec3(1.0, 0.97, 0.84), 1.0 - smoothstep(0.08, 0.14, r));
    c = mix(c, vec3(0.98, 0.95, 0.82), rBand(r, 0.82, 0.94, 0.012));
    c = mix(c, vec3(1.0, 0.82, 0.12), smoothstep(0.93, 0.95, r));
    diffuseColor.rgb = c;
    rRough = mix(0.08, 0.3, membrane);
    rCoat = 0.8;
    rCoatRough = 0.03;
    rBump = vec3(cos(a), 0.0, sin(a)) * (cells - 0.5) * 0.12;
  } else {
    // Peel, the fruit's own colour: pitted all over with oil glands, waxed to a sheen.
    vec3 w = abs(rN) / (abs(rN.x) + abs(rN.y) + abs(rN.z));
    vec3 gp = vWorld * 1.7;
    float gx = rNoise(gp.yz);
    float gy = rNoise(gp.xz + 3.1);
    float gz = rNoise(gp.xy + 6.7);
    float pits = gx * w.x + gy * w.y + gz * w.z;
    float d = rDetail(gp.xz + gp.y);
    diffuseColor.rgb *= 0.88 + 0.2 * pits * d + 0.08 * rFbm(vWorld.xz * 0.08 + vWorld.y * 0.05);
    rBump = (vec3(gx, gy, gz) - 0.5) * 0.4 * d;
    rRough = 0.4;
    rCoat = 0.5;
    rCoatRough = 0.18;
  }
}
if (rK == K_CTR_PEACH) {
  vec3 p = vWorld - vec3(${f(peach.x)}, ${f(peachY)}, ${f(peach.z)});
  vec3 n = normalize(p);
  // A red blush on the side that had the sun, mottled into the yellow.
  float blush = smoothstep(-0.4, 0.7, dot(n, normalize(vec3(-0.5, 0.5, 0.7)))) * (0.55 + 0.45 * rFbm(n.xz * 5.0 + n.y * 3.0));
  vec3 c = mix(vec3(1.0, 0.74, 0.36), vec3(0.72, 0.13, 0.1), blush * 0.9);
  // The cleft down one side from the stem, and the stem's hollow.
  vec3 stem = normalize(vec3(-0.25, 1.0, 0.3));
  vec3 plane = normalize(cross(stem, vec3(1.0, 0.0, 0.0)));
  float cleft = (1.0 - smoothstep(0.0, 0.06, abs(dot(n, plane)))) * smoothstep(0.0, 0.2, dot(n, cross(plane, stem)));
  float hollow = smoothstep(0.94, 0.99, dot(n, stem));
  c *= 1.0 - cleft * 0.3 - hollow * 0.35;
  // The bruise, where the world's food is: soft and brown, a little sunk.
  vec3 bd = vec3(${bruise});
  float e = dot(n, bd);
  float bruise = smoothstep(0.93, 0.975, e + (rNoise(n.xz * 30.0) - 0.5) * 0.02);
  c = mix(c, vec3(0.42, 0.22, 0.09) * (0.8 + 0.4 * rNoise(n.xz * 60.0)), bruise * 0.85);
  // Fuzz: a pale sheen where it turns away from you.
  float facing = abs(dot(rN, normalize(cameraPosition - vWorld)));
  diffuseColor.rgb = c + vec3(0.32, 0.26, 0.22) * pow(1.0 - facing, 2.5) * (1.0 - bruise);
  rRough = mix(0.7, 0.9, bruise);
  rBump = (plane * cleft * sign(dot(n, plane)) * -0.6) - (n - bd * e) * bruise * 2.0;
}
if (rK == K_CTR_BOARD) {
  // Beech, end to end along the board, scored by the knife every which way, dark where the lemon's juice has soaked in.
  vec2 q = vWorld.xz - ${v2(board.x, board.z)};
  float c = ${f(Math.cos(board.angle))};
  float s = ${f(Math.sin(board.angle))};
  vec2 lq = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  float figure;
  vec2 gp = abs(rN.y) > 0.5 ? lq : vec2(lq.x + lq.y, vWorld.y * 2.0);
  vec3 wood = rWood(gp, vec3(0.8, 0.62, 0.42), vec3(0.64, 0.46, 0.28), 70.0, figure);
  vec2 cp = lq / 7.0;
  vec2 cell = floor(cp);
  vec2 fc = fract(cp) - 0.5;
  float h = rHash(cell);
  float ang = h * 6.2832;
  vec2 dir = vec2(cos(ang), sin(ang));
  float across = dot(fc, vec2(-dir.y, dir.x));
  float cut = (1.0 - smoothstep(0.0, 0.025 + fwidth(across) * 1.5, abs(across))) * step(abs(dot(fc, dir)), 0.45) * step(0.35, h) * rDetail(cp * 6.0) * step(0.5, rN.y);
  float wet = ctrJuice(vWorld.xz) * step(0.5, rN.y);
  diffuseColor.rgb *= wood * (1.0 - wet * 0.35) * (1.0 - cut * 0.25);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.82, 0.66), cut * 0.35);
  rRough = mix(0.62, 0.18, wet) + cut * 0.2;
  rCoat = wet * 0.7;
  rCoatRough = 0.05;
}
if (rK == K_CTR_CAKE) {
  vec2 q = vWorld.xz - ${v2(cake.x, cake.z)};
  float y = vWorld.y - ${f(ZINC_BAR.zinc.top + cake.plate.top)};
  vec2 radial = normalize(q + 1e-4);
  float cut = step(abs(rN.y), 0.5) * step(abs(dot(rN.xz, radial)), 0.5);
  vec2 sp = vec2(length(q), y) * 0.9 + vWorld.xz * 0.2;
  float pores = rNoise(sp) * rDetail(sp);
  vec3 sponge = vec3(0.3, 0.15, 0.07) * (0.7 + 0.5 * pores);
  vec3 cream = vec3(0.88, 0.76, 0.6);
  vec3 ganache = vec3(0.1, 0.045, 0.025);
  float layers = rBand(y, 20.0, 26.0, 0.4) + rBand(y, 45.0, 51.0, 0.4);
  float coat = max(step(66.0, y), step(98.0, length(q)));
  vec3 c = mix(mix(sponge, cream, layers), ganache, coat);
  diffuseColor.rgb = mix(ganache, c, cut);
  rRough = mix(0.22, mix(0.85, 0.5, layers), cut * (1.0 - coat));
  rCoat = (1.0 - cut) * 0.7;
  rCoatRough = 0.08;
}
`;

const EMISSIVE = /* glsl */ `
if ((rK == K_CTR_DIFFUSER || rK == K_CTR_SHADE) && abs(ctrPendantZ(vWorld.z) - ${f(PENDANTS.zs[PENDANTS.lit])}) < 1.0) {
  vec2 q = vWorld.xz - ${v2(PENDANTS.x, PENDANTS.zs[PENDANTS.lit])};
  float r = length(q);
  float on = uPendant.w * 2.2e-6;
  // The lit diffuser: brightest over the bulb, falling to its edge; the white inside of the shade lit at the rim.
  if (rK == K_CTR_DIFFUSER) rEmit += vec3(1.0, 0.84, 0.62) * on * (0.7 + 1.5 * exp(-r * r / 2600.0)) * (0.97 + 0.03 * rNoise(q * 0.2));
  else if (r < ${f(PENDANTS.r - 3.6)} && vWorld.y < ${f(PENDANTS.bottom + 4.5)} && dot(rN.xz, q) < 0.0) rEmit += vec3(1.0, 0.86, 0.66) * on * 0.6;
}
`;

export const counter: Part = {
  build(b, solids) {
    buildBarBody(
      b,
      solids.filter((s) => BODY.has(s.name)),
    );
    buildSeats(
      b,
      solids.filter((s) => SEATS.has(s.name)),
    );
    buildThings(
      b,
      solids.filter((s) => THINGS.has(s.name)),
    );
    for (const s of solids) if (!BODY.has(s.name) && !SEATS.has(s.name) && !THINGS.has(s.name)) generic(b, s, true, true);
  },
  solid: { head: HEAD, color: COLOR, emissive: EMISSIVE },
};
