// What the tables and chairs are made of, as GLSL: the four-tops' oak, worn
// at the edges and dulled where plates went; the bases' cast iron under its
// black paint, rubbed grey where feet catch it; the chairs' beech under black
// lacquer, worn through where hands and heels go. The wooden pieces carry the
// way their grain runs and how worn they are in their vertex colours
// (tables-mesh.ts), and their rings are cut in three dimensions, so a top
// shows flames, an edge stripes and an end its rings.

import { TABLES, TABLE_TOPS } from "@fly/world";
import type { PartGlsl } from "./parts.ts";

/** The kinds only the tables shade (kinds.ts PART_KINDS.tables). */
export const TBL = { oak: 56, iron: 57, bent: 58, stone: 59 } as const;

const f = (n: number) => n.toFixed(1);
const fours = TABLES.filter((t) => t.kind === "four");
const pedestals = TABLES.filter((t) => t.kind !== "four");

/** The nearest of some tables' middles to p, as unrolled GLSL (xy the middle, z 1 for a round one). */
const nearest = (name: string, list: typeof TABLES) => /* glsl */ `
vec3 ${name}(vec2 p) {
  vec3 best = vec3(${f(list[0].x)}, ${f(list[0].z)}, ${list[0].kind === "round" ? "1.0" : "0.0"});
  float d = 1e12;
  vec2 q;
${list.map((t) => `  q = p - vec2(${f(t.x)}, ${f(t.z)}); if (dot(q, q) < d) { d = dot(q, q); best = vec3(${f(t.x)}, ${f(t.z)}, ${t.kind === "round" ? "1.0" : "0.0"}); }`).join("\n")}
  return best;
}`;

const HEAD = /* glsl */ `
const int K_TBL_OAK = ${TBL.oak};
const int K_TBL_IRON = ${TBL.iron};
const int K_TBL_BENT = ${TBL.bent};
const int K_TBL_STONE = ${TBL.stone};
${nearest("tblFour", fours)}
${nearest("tblPedestal", pedestals)}

// The grain a vertex carries in its colour: along (x, z), or up the piece; and how worn its finish is. White: none given, so along a level face's x, or up.
vec3 tblAlong(vec3 c, vec3 n, out float wear) {
  wear = 0.0;
  if (c.g > 0.75) return abs(n.y) > 0.6 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  wear = c.g / 0.7;
  vec3 t = vec3(c.r * 2.0 - 1.0, 0.0, c.b * 2.0 - 1.0);
  return dot(t, t) > 0.25 ? normalize(t) : vec3(0.0, 1.0, 0.0);
}

// Growth rings round a pith running along the grain, somewhere outside each board: how far into a ring (late wood, 0 to 1), and the pores of the early wood.
float tblRings(vec3 p, vec3 along, float pitch, float board, out float pores) {
  vec3 h = abs(along.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : normalize(vec3(-along.z, 0.0, along.x));
  vec3 w = cross(along, h);
  float a = dot(p, along);
  vec2 q = vec2(dot(p, h), dot(p, w));
  vec2 cell = floor(q / board);
  float seed = rHash(cell + 0.37);
  // Mostly beside the board rather than under it: the rings meet its faces steeply, in close lines, now and then opening into a flame.
  vec2 pith = (cell + 0.5) * board + (vec2(rHash(cell + 4.1), rHash(cell + 9.3)) - 0.5) * board * vec2(3.0, 1.2);
  float warp = rFbm(vec2(a * 0.003 + seed * 7.0, seed * 3.0)) * pitch * 4.0 + rNoise(vec2(a * 0.025, seed * 11.0)) * pitch * 0.5;
  float ring = (length(q - pith) + warp) / pitch;
  float fr = fract(ring);
  float late = smoothstep(0.45, 0.8, fr) * (1.0 - smoothstep(0.9, 1.0, fr));
  late = mix(late, 0.3, smoothstep(0.25, 0.6, fwidth(ring)));
  vec2 pp = vec2(a * 1.1, ring * 16.0);
  pores = smoothstep(0.72, 0.88, rNoise(pp)) * (1.0 - late) * rDetail(pp);
  return late;
}

// A pattern's coordinates on any face: the plane the face mostly lies in.
vec2 tblPlane(vec3 p, vec3 n) {
  vec3 a = abs(n);
  return a.y > 0.6 ? p.xz : (a.x > a.z ? p.zy : p.xy);
}
`;

const COLOR = /* glsl */ `
if (rK == K_TBL_OAK) {
  float wear;
  vec3 along = tblAlong(diffuseColor.rgb, rN, wear);
  float pores;
  float late = tblRings(vWorld, along, 2.8, 130.0, pores);
  vec3 c = mix(vec3(0.6, 0.43, 0.26), vec3(0.37, 0.24, 0.12), late * 0.8);
  c *= 1.0 - pores * 0.3;
  vec2 fib = vec2(dot(vWorld, along) * 0.06, dot(vWorld, cross(rN, along)) * 1.4);
  c *= 1.0 + (rNoise(fib) - 0.5) * 0.22 * rDetail(fib);
  // Each board a little lighter or darker than the next.
  vec3 across = abs(along.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : normalize(vec3(-along.z, 0.0, along.x));
  c *= 0.9 + 0.2 * rHash(vec2(floor(dot(vWorld, across) / 130.0), 2.0));
  vec2 d = abs(vWorld.xz - tblFour(vWorld.xz).xy);
  float edge = ${f(TABLE_TOPS.four.half)} - max(d.x, d.y);
  float slab = step(${f(TABLE_TOPS.four.bottom - 1)}, vWorld.y);
  // The edges rubbed pale and dull by hands, sleeves and chairs; the middle dulled where plates were slid and the cloth went round.
  float worn = slab * (1.0 - smoothstep(0.0, 22.0, edge)) * (0.55 + 0.45 * rNoise(vWorld.xz * 0.06 + vWorld.y * 0.1));
  float used = slab * step(0.5, rN.y) * smoothstep(0.35, 0.75, rFbm(vWorld.xz * 0.005));
  // Fine scratches every way, a few to a hand's breadth.
  vec2 sc = vWorld.xz / 28.0;
  vec2 cell = floor(sc);
  float an = rHash(cell) * 6.2832;
  vec2 lc = fract(sc) - 0.5;
  float line = abs(dot(lc, vec2(-sin(an), cos(an))));
  float scratch = slab * step(0.5, rN.y) * step(0.55, rHash(cell + 3.3)) * step(abs(dot(lc, vec2(cos(an), sin(an)))), 0.2 + 0.25 * rHash(cell + 8.1)) * (1.0 - smoothstep(0.0, 0.012 + fwidth(line), line)) * rDetail(sc * 40.0);
  // Low on the legs, scuffs from feet and the mop.
  float scuff = (1.0 - slab) * (1.0 - smoothstep(30.0, 140.0, vWorld.y)) * smoothstep(0.5, 0.8, rNoise(tblPlane(vWorld, rN) * 0.08));
  c = mix(c, c * 1.18 + vec3(0.05, 0.04, 0.02), worn * 0.7 + scratch * 0.5);
  c = mix(c, c * 0.92 + vec3(0.02, 0.015, 0.01), used * 0.4);
  c *= 1.0 - scuff * 0.35;
  diffuseColor.rgb = c;
  rRough = 0.42 + late * 0.08 + worn * 0.3 + used * 0.18 + scratch * 0.2;
  rCoat = 0.45 * (1.0 - worn * 0.85) * (1.0 - used * 0.5) * (1.0 - scratch);
  rCoatRough = 0.12 + used * 0.2;
}
if (rK == K_TBL_IRON) {
  // Sand-cast iron under black paint gone satin: the casting's skin grainy and pitted, the paint rubbed to grey iron where feet and the mop catch the foot, a little rust where it meets the floor.
  vec2 q = tblPlane(vWorld, rN);
  float dd = rDetail(q * 1.4);
  float sand = rNoise(q * 1.4) * 0.6 + rNoise(q * 3.3 + 2.0) * 0.4;
  float pits = smoothstep(0.74, 0.9, rNoise(q * 0.8 + 5.0)) * dd;
  rBump = (vec3(rNoise(q * 1.4 + 1.3), rNoise(q * 1.4 + 7.1), rNoise(q * 1.4 + 3.7)) - 0.5) * 0.2 * dd;
  vec3 c = vec3(0.045, 0.044, 0.045) * (0.85 + 0.35 * sand * dd);
  c *= 1.0 - pits * 0.45;
  vec3 pc = tblPedestal(vWorld.xz);
  vec2 rel = vWorld.xz - pc.xy;
  float r = length(rel);
  float low = 1.0 - smoothstep(25.0, 60.0, vWorld.y);
  // The round foot's turned rings: shallow grooves in its dome.
  if (pc.z > 0.5 && low > 0.0 && r > 30.0) {
    float g = 0.0;
    for (int i = 0; i < 4; i++) {
      float R = 64.0 + float(i) * 48.0;
      float e = r - R;
      g += e * exp(-e * e * 0.6);
    }
    rBump += vec3(rel.x, 0.0, rel.y) / r * g * 0.35 * low;
  }
  float rub = low * step(0.3, rN.y) * smoothstep(0.6, 0.85, rFbm(vWorld.xz * 0.05) + (pc.z > 0.5 ? smoothstep(205.0, 229.0, r) : smoothstep(225.0, 258.0, r)) * 0.45);
  c = mix(c, vec3(0.2, 0.2, 0.21) * (0.85 + 0.3 * sand), rub * 0.6);
  float rust = (1.0 - smoothstep(0.0, 9.0, vWorld.y)) * smoothstep(0.55, 0.8, rNoise(q * 0.12 + 9.0));
  c = mix(c, vec3(0.13, 0.055, 0.025) * (0.8 + 0.4 * sand), rust * 0.7);
  diffuseColor.rgb = c;
  rMetal = mix(0.2, 0.85, rub) * (1.0 - rust);
  rRough = mix(0.45, 0.32, rub) + pits * 0.2 + rust * 0.3;
  rCoat = 0.5 * (1.0 - rub) * (1.0 - rust);
  rCoatRough = 0.22 + sand * 0.08;
}
if (rK == K_TBL_STONE) {
  // A marble slab's sawn underside: the same veins as its top (the seed is the shared marble's), dull, with the saw's faint sweeps.
  float vein;
  float seed = rHash(floor(vWorld.xz / 1300.0 + 0.5));
  vec3 c = rMarble(vWorld.xz + vWorld.y * vec2(0.3, 0.7), seed, vein);
  vec2 sp = vec2(length(vWorld.xz - vec2(-6000.0, 9000.0)) * 0.8, 0.0);
  c *= 0.86 + 0.06 * rNoise(sp + vec2(0.0, vWorld.x * 0.002)) * rDetail(sp);
  diffuseColor.rgb *= c;
  rRough = 0.78;
}
if (rK == K_TBL_BENT) {
  // Steam-bent beech under black lacquer: the grain only a ripple in the gloss, the lacquer thin and brown at the edges hands and heels rub, worn through to the wood here and there.
  float wear;
  vec3 along = tblAlong(diffuseColor.rgb, rN, wear);
  float pores;
  float late = tblRings(vWorld, along, 1.7, 60.0, pores);
  vec3 beech = mix(vec3(0.56, 0.39, 0.24), vec3(0.42, 0.27, 0.15), late);
  vec2 q = tblPlane(vWorld, rN);
  float through = wear * smoothstep(0.58, 0.8, rFbm(q * 0.12 + vWorld.y * 0.03));
  vec3 lacquer = vec3(0.021, 0.018, 0.016) * (1.0 + late * 0.4);
  diffuseColor.rgb = mix(mix(lacquer, beech * 0.16, wear * 0.45), beech * 0.75, through);
  float dd = rDetail(q * 0.9);
  rBump = (vec3(rNoise(q * 0.9), rNoise(q * 0.9 + 4.2), rNoise(q * 0.9 + 8.4)) - 0.5) * 0.035 * dd;
  rRough = 0.3 + late * 0.1 + through * 0.35;
  rCoat = 0.85 * (1.0 - through);
  rCoatRough = 0.07 + wear * 0.18 + late * 0.03;
}
`;

export const TABLES_GLSL: PartGlsl = { head: HEAD, color: COLOR };
