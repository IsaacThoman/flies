// What the tables and chairs are made of, as GLSL: the four-tops' oak, worn
// at the edges, dulled where plates went, scratched, ringed where glasses
// stood, dust in its pores; the bases' cast iron, its sand under black paint
// chipped to grey where feet rest; the chairs' beech under black lacquer,
// worn through where hands and heels go. The wooden pieces carry the way
// their grain runs and how worn they are in their vertex colours
// (tables-mesh.ts), and their rings are cut in three dimensions, so a top
// shows flames, an edge stripes and an end its rings. What the fly walks on
// has its detail down to a tenth of a millimetre, each scale fading where a
// pixel can't show it.

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
  float warp = rFbm(vec2(a * 0.003 + seed * 7.0, seed * 3.0)) * pitch * 4.0 + rNoise(vec2(a * 0.025, seed * 11.0)) * pitch * 1.2 + rNoise(vec2(a * 0.09, seed * 5.0)) * pitch * 0.3;
  float ring = (length(q - pith) + warp) / pitch;
  // Good years and lean ones: each ring its own width, and its own share of late wood.
  ring += 1.2 * rNoise(vec2(ring * 0.45, seed * 13.0));
  float fr = fract(ring);
  float lean = rHash1(floor(ring) + seed * 31.0);
  float late = smoothstep(0.35 + 0.25 * lean, 0.8, fr) * (1.0 - smoothstep(0.9, 1.0, fr)) * (0.55 + 0.45 * rHash1(floor(ring) * 1.7 + seed * 9.0));
  late = mix(late, 0.3, smoothstep(0.25, 0.6, fwidth(ring)));
  // Slender: a millimetre long, a tenth across.
  vec2 pp = vec2(a * 1.4, ring * 30.0);
  pores = smoothstep(0.7, 0.86, rNoise(pp)) * (1.0 - late) * rDetail(pp);
  return late;
}

// Cells packed together (paint's chips, a casting's sand): the offset to the nearest cell's middle, its own number, and how near the wall to the next (0 on it).
vec4 tblCells(vec2 p) {
  vec2 cell = floor(p);
  vec2 fr = fract(p);
  float f1 = 9.0;
  float f2 = 9.0;
  vec2 to = vec2(0.0);
  vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + vec2(rHash(cell + g + 0.13), rHash(cell + g + 21.7)) * 0.9 - fr;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; to = r; id = cell + g; } else if (d < f2) f2 = d;
  }
  return vec4(to, rHash(id + 0.71), sqrt(f2) - sqrt(f1));
}

// Short straight scratches, one to a cell (size mm) where one falls (a share, keep, of the cells have none), width mm wide: how much of a pixel each covers.
float tblScratch(vec2 p, float size, float keep, float width) {
  vec2 sc = p / size;
  vec2 cell = floor(sc);
  float an = rHash(cell) * 6.2832;
  vec2 dir = vec2(cos(an), sin(an));
  vec2 lc = fract(sc) - 0.5;
  float line = abs(dot(lc, vec2(-dir.y, dir.x)));
  float w = width / size;
  float fw = fwidth(line);
  float len = 0.2 + 0.28 * rHash(cell + 8.1);
  return step(keep, rHash(cell + 3.3)) * (1.0 - smoothstep(len - 0.05, len, abs(dot(lc, dir)))) * (1.0 - smoothstep(w, w + fw, line)) * min(1.0, w / max(fw, 1e-5) + 0.15) * rDetail(sc * 4.0);
}

// A ring a glass or a cup left: its rim, broken here and there, a little uneven.
float tblRing(vec2 p, vec2 at, float r, float seed) {
  vec2 d = p - at;
  float e = length(d) - r;
  float a = atan(d.y, d.x);
  float w = 0.4 + 1.1 * rNoise(vec2(a * 9.0, seed + 3.0));
  return (1.0 - smoothstep(w, w + 0.6 + fwidth(e), abs(e))) * smoothstep(0.2, 0.5, rNoise(vec2(a * 3.0, seed)));
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
  vec3 c = mix(vec3(0.62, 0.45, 0.26), vec3(0.4, 0.26, 0.13), late * 0.7);
  // On the face: along the grain, and across it.
  vec3 side = normalize(cross(rN, along) + vec3(1e-4, 0.0, 0.0));
  float ga = dot(vWorld, along);
  float gc = dot(vWorld, side);
  // Fibres at three scales: streaks a hand long, a thumbnail long, and a millimetre.
  vec2 f1 = vec2(ga * 0.06, gc * 1.4);
  vec2 f2 = vec2(ga * 0.35, gc * 9.0);
  vec2 f3 = vec2(ga * 1.6, gc * 34.0);
  c *= 1.0 + (rNoise(f1) - 0.5) * 0.22 * rDetail(f1) + (rNoise(f2) - 0.5) * 0.16 * rDetail(f2) + (rNoise(f3) - 0.5) * 0.12 * rDetail(f3);
  // The rays: on a face, short dark streaks along the grain, and now and then a satin fleck across it where the cut runs with one.
  vec2 rq = vec2(ga / 2.6, gc / 0.42);
  vec2 rc = floor(rq);
  vec2 rf = fract(rq) - 0.5;
  float rh = rHash(rc + 5.1);
  float ray = step(0.72, rh) * (1.0 - smoothstep(0.1 + 0.3 * (rh - 0.72), 0.16 + 0.3 * (rh - 0.72), abs(rf.x + (rHash(rc + 1.7) - 0.5) * 0.3))) * (1.0 - smoothstep(0.05, 0.13, abs(rf.y))) * rDetail(rq * 2.5);
  vec2 fq = vec2(ga / 11.0, gc / 4.5);
  vec2 fc = floor(fq);
  vec2 ff = (fract(fq) - 0.5) * vec2(11.0, 4.5);
  float fh = rHash(fc + 2.3);
  float fa = (rHash(fc + 7.7) - 0.5) * 0.7;
  vec2 lr = vec2(cos(fa) * ff.x + sin(fa) * ff.y, -sin(fa) * ff.x + cos(fa) * ff.y);
  float fleck = step(0.62, fh) * (1.0 - smoothstep(0.6, 1.0, length(lr / vec2(0.3 + 0.4 * fh, 1.3 + 0.9 * fh)))) * rDetail(fq * 5.0);
  c *= 1.0 - ray * 0.13;
  c = mix(c, c * 1.15 + vec3(0.035, 0.028, 0.012), fleck * 0.55);
  // Each board a little lighter or darker than the next.
  vec3 across = abs(along.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : normalize(vec3(-along.z, 0.0, along.x));
  c *= 0.9 + 0.2 * rHash(vec2(floor(dot(vWorld, across) / 130.0), 2.0));
  vec3 pc = tblFour(vWorld.xz);
  vec2 d = abs(vWorld.xz - pc.xy);
  float edge = ${f(TABLE_TOPS.four.half)} - max(d.x, d.y);
  float slab = step(${f(TABLE_TOPS.four.bottom - 1)}, vWorld.y);
  float top = slab * step(0.5, rN.y);
  // The pores of the early wood, open grooves: dark, and on the top grey with years of dust and wax in them.
  float dusty = top * smoothstep(0.35, 0.75, rNoise(vec2(ga * 0.4, gc * 2.5) + 11.0));
  c = mix(c * (1.0 - pores * 0.4), mix(c, vec3(0.6, 0.54, 0.44), 0.45), pores * dusty);
  // The edges rubbed pale and dull by hands, sleeves and chairs, in patches; the middle dulled where plates were slid and the cloth went round.
  float worn = slab * (1.0 - smoothstep(0.0, 22.0, edge)) * (0.45 + 0.35 * rNoise(vWorld.xz * 0.06 + vWorld.y * 0.1) + 0.2 * rNoise(vWorld.xz * 0.7));
  float used = top * smoothstep(0.35, 0.75, rFbm(vWorld.xz * 0.005));
  // Fine scratches every way, at three scales; pale where they break the finish.
  float scratch = top * clamp(tblScratch(vWorld.xz, 28.0, 0.55, 0.25) + tblScratch(vWorld.xz + 3.7, 8.0, 0.45, 0.07) * 0.7 + tblScratch(vWorld.xz + 9.1, 2.6, 0.62, 0.025) * 0.5, 0.0, 1.0);
  // A ring or two where glasses stood, out toward the sides an upturned chair's seat leaves bare: a water ring's white blush in the finish, a wine ring's dark rim.
  float th = rHash(pc.xy * 0.01 + 0.5);
  float toward = th < 0.5 ? -1.0 : 1.0;
  vec2 w0 = pc.xy + vec2(toward * (200.0 + 120.0 * th), (th - 0.5) * 160.0);
  vec2 w1 = pc.xy + vec2(-toward * (230.0 + 90.0 * rHash(pc.xy * 0.01 + 3.0)), (0.5 - th) * 120.0);
  float blush = top * (tblRing(vWorld.xz, w0, 37.0, th * 40.0) + (1.0 - smoothstep(31.0, 37.0, length(vWorld.xz - w0))) * 0.3 * rFbm(vWorld.xz * 0.15));
  float wine = top * step(0.4, th) * tblRing(vWorld.xz, w1, 33.0, th * 70.0);
  // Low on the legs, scuffs from feet and the mop.
  float scuff = (1.0 - slab) * (1.0 - smoothstep(30.0, 140.0, vWorld.y)) * smoothstep(0.5, 0.8, rNoise(tblPlane(vWorld, rN) * 0.08));
  c = mix(c, c * 1.18 + vec3(0.05, 0.04, 0.02), worn * 0.7 + scratch * 0.45);
  c = mix(c, c * 0.92 + vec3(0.02, 0.015, 0.01), used * 0.4);
  c = mix(c, vec3(0.76, 0.72, 0.64), blush * 0.45);
  c = mix(c, c * vec3(0.55, 0.36, 0.33), wine * 0.6);
  c *= 1.0 - scuff * 0.35;
  // A little dust on the top: grains a tenth of a millimetre, grey and pale.
  vec2 dp = vWorld.xz / 0.3;
  float speck = top * step(0.993, rHash(floor(dp))) * (1.0 - smoothstep(0.2, 0.42, length(fract(dp) - 0.5))) * rDetail(dp);
  c = mix(c, mix(vec3(0.5, 0.48, 0.45), vec3(0.85, 0.83, 0.8), rHash(floor(dp) + 4.0)), speck * 0.8);
  diffuseColor.rgb = c;
  rRough = 0.42 + late * 0.08 + worn * 0.3 + used * 0.18 + scratch * 0.2 + pores * 0.15 + blush * 0.2 + speck * 0.4;
  rCoat = 0.45 * (1.0 - worn * 0.85) * (1.0 - used * 0.5) * (1.0 - scratch) * (1.0 - pores * 0.4) * (1.0 - blush * 0.5) * (1.0 - speck);
  rCoatRough = 0.12 + used * 0.2 + blush * 0.15;
}
if (rK == K_TBL_IRON) {
  // Sand-cast iron under black paint gone satin: the casting's skin grainy and pitted at two scales, the paint a little orange-peeled over it.
  vec2 q = tblPlane(vWorld, rN);
  float dd = rDetail(q * 1.4);
  float df = rDetail(q * 5.0);
  float sand = rNoise(q * 1.4) * 0.6 + rNoise(q * 3.3 + 2.0) * 0.4;
  float grit = rNoise(q * 5.0 + 4.0);
  float pits = smoothstep(0.74, 0.9, rNoise(q * 0.8 + 5.0)) * dd + smoothstep(0.82, 0.95, rNoise(q * 2.6 + 1.0)) * df * 0.6;
  rBump = (vec3(rNoise(q * 1.4 + 1.3), rNoise(q * 1.4 + 7.1), rNoise(q * 1.4 + 3.7)) - 0.5) * 0.08 * dd;
  rBump += (vec3(rNoise(q * 5.0 + 2.3), rNoise(q * 5.0 + 6.1), rNoise(q * 5.0 + 9.7)) - 0.5) * 0.04 * df;
  rBump += (vec3(rNoise(q * 0.35 + 1.0), 0.0, rNoise(q * 0.35 + 4.0)) - 0.5) * 0.012 * rDetail(q * 0.35);
  vec3 c = vec3(0.045, 0.044, 0.045) * (0.85 + 0.35 * sand * dd + 0.2 * (grit - 0.5) * df);
  c *= 1.0 - pits * 0.45;
  vec3 pc = tblPedestal(vWorld.xz);
  vec2 rel = vWorld.xz - pc.xy;
  float r = length(rel);
  float low = 1.0 - smoothstep(25.0, 60.0, vWorld.y);
  float up = low * step(0.3, rN.y);
  // The round foot's turned rings: shallow grooves in its dome.
  float groove = 0.0;
  if (pc.z > 0.5 && low > 0.0 && r > 30.0) {
    float g = 0.0;
    for (int i = 0; i < 4; i++) {
      float R = 64.0 + float(i) * 48.0;
      float e = r - R;
      g += e * exp(-e * e * 0.6);
      groove += exp(-e * e * 0.3);
    }
    rBump += vec3(rel.x, 0.0, rel.y) / r * g * 0.35 * low;
  }
  // Where feet rest (the foot's outer dome on the chairs' sides, the bars' ends), the paint is rubbed thin and chipped through to grey iron, in flakes with sharp edges.
  float rest = pc.z > 0.5 ? smoothstep(140.0, 215.0, r) * (0.3 + 0.7 * abs(rel.x) / max(r, 1.0)) : smoothstep(170.0, 245.0, r);
  float rub = up * clamp(smoothstep(0.6, 0.9, rFbm(vWorld.xz * 0.05)) * 0.5 + rest * smoothstep(0.3, 0.6, rFbm(vWorld.xz * 0.02 + 5.0)), 0.0, 1.0);
  vec4 chip = tblCells(vWorld.xz / 2.2 + rNoise(vWorld.xz * 0.3) * 0.5);
  vec4 flake = tblCells(vWorld.xz / 0.7);
  float cd = rDetail(vWorld.xz / 2.2);
  // A chip goes through the black to the red primer, and in its middle to the iron.
  float through = rub * 0.6 - 0.15;
  float big = (1.0 - smoothstep(through - 0.04, through, chip.z)) * cd;
  float chipped = clamp(big + (1.0 - step(rub * 0.35 - 0.2, flake.z)) * rDetail(vWorld.xz / 0.7), 0.0, 1.0);
  float bare = big * step(chip.z, through - 0.08) * smoothstep(0.08, 0.18, chip.w);
  // Scuffs round the foot and along the bars, where shoes slide.
  float scuffs = up * rest * tblScratch(vWorld.xz, 6.0, 0.35, 0.06);
  c = mix(c, vec3(0.12, 0.12, 0.125) * (0.85 + 0.3 * sand), rub * 0.4);
  c = mix(c, vec3(0.2, 0.075, 0.04) * (0.85 + 0.3 * grit), chipped * 0.85);
  c = mix(c, vec3(0.2, 0.195, 0.19) * (0.8 + 0.4 * grit), max(bare, scuffs * 0.6));
  // The paint's edge round a chip stands a little proud.
  rBump += vec3(chip.x, 0.0, chip.y) * 0.25 * (1.0 - smoothstep(0.0, 0.08, abs(chip.w))) * rub * cd;
  float rust = (1.0 - smoothstep(0.0, 9.0, vWorld.y)) * smoothstep(0.55, 0.8, rNoise(q * 0.12 + 9.0));
  rust = max(rust, bare * smoothstep(0.6, 0.9, rNoise(vWorld.xz * 0.9 + 3.0)) * 0.6);
  c = mix(c, vec3(0.13, 0.055, 0.025) * (0.8 + 0.4 * sand), rust * 0.7);
  // Dust settled on its tops, thickest in the grooves and where no shoe reaches.
  float dust = step(0.75, rN.y) * low * (smoothstep(0.4, 0.8, rFbm(vWorld.xz * 0.09 + 2.0)) * 0.4 + groove * 0.5) * (1.0 - rub * 0.8);
  vec2 dp = vWorld.xz / 0.25;
  float speck = step(0.75, rN.y) * low * step(0.995, rHash(floor(dp) + 2.0)) * (1.0 - smoothstep(0.1, 0.12 + 0.3 * rHash(floor(dp) + 6.0), length(fract(dp) - 0.5))) * rDetail(dp);
  c = mix(c, vec3(0.3, 0.29, 0.27), dust * 0.4);
  c = mix(c, vec3(0.55, 0.53, 0.5), speck * 0.8);
  diffuseColor.rgb = c;
  float metal = max(rub * 0.4, max(bare, scuffs * 0.8));
  rMetal = mix(0.05, 0.8, metal) * (1.0 - rust) * (1.0 - dust * 0.6) * (1.0 - (chipped - bare) * 0.8);
  rRough = mix(0.65, 0.42, metal) + pits * 0.2 + rust * 0.3 + dust * 0.3 + speck * 0.4 + (chipped - bare) * 0.25;
  rCoat = 0.35 * (1.0 - max(rub * 0.6, chipped)) * (1.0 - rust) * (1.0 - dust);
  rCoatRough = 0.28 + sand * 0.08;
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
