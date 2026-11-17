// The bar's materials. Everything solid in the bar, the room included, is one
// material, and everything clear (glass, drinks, ice, foam, drops) another:
// each vertex says what it is (its `kind`), and the shader gives it its
// look: walnut under varnish, brass, an old mirror, bottles lit from behind,
// a cardboard coaster, the paper napkin. So the whole bar is a handful of
// draws, which is what the Apple TV's JavaScript pays for, and the detail a
// fly can see is in the shader, where it costs nothing to build.

import * as THREE from "three";
import { BAR_DECOR, BAR_TOP } from "@fly/world";
import { canvasTexture } from "../../scene/build.ts";
import { noiseTexture } from "../../scene/noise.ts";
import { CLOCK_GLSL, onDial } from "../../scene/clock.ts";
import type { Dial } from "../../scene/clock.ts";
import { casterUniforms, patch } from "./light.ts";
import type { Caster } from "./light.ts";

export const KIND = {
  plain: 0,
  wood: 1,
  /** The counter top: walnut, the napkin, old rings in the varnish, contact shadows. */
  top: 2,
  metal: 3,
  glossy: 4,
  mirror: 5,
  bottle: 6,
  card: 7,
  matte: 8,
  /** Lit by the lamps: bulbs and the insides of shades. */
  lamp: 9,
  wax: 10,
  /** The lime wedge: peel, pith and flesh, drawn in the shader. */
  lime: 11,
  /** The lime's cut faces. */
  flesh: 12,
  /** Roasted peanuts. */
  nut: 13,
  /** Maraschino cherries: glossy, and red light comes back out of them. */
  cherry: 14,
  /** The clock's face: its enamel, its markings and its hands, drawn in the shader. */
  dial: 15,
  /** The walls above the panelling: flocked paper, its damask drawn in the shader. */
  paper: 16,
  /** The paintings: brushwork and old varnish over the colours they are painted in. */
  canvas: 17,
  glass: 20,
  beer: 21,
  cocktail: 22,
  /** The top of a liquid, where rings spread. */
  surface: 23,
  foam: 24,
  ice: 25,
  drop: 26,
  /** A thin film of something spilt: syrup, beer. */
  film: 27,
} as const;

/** Says what a piece of painted geometry is made of (KIND). */
export function tag(geometry: THREE.BufferGeometry, kind: number) {
  geometry.setAttribute("kind", new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(kind), 1));
  return geometry;
}

const KINDS = Object.entries(KIND)
  .map(([name, value]) => `const int K_${name.toUpperCase()} = ${value};`)
  .join("\n");

/** How many rings can spread at once, on any liquid. */
export const RIPPLES = 4;

/** The warm lights of the room at night: the back bar's shelf lights (stopping either side of the pier, `gap`), the wall lights, and the little lamp over the clock, as positions. */
export type Wash = { shelves: readonly number[]; shelfX: readonly [number, number]; shelfZ: number; gap: readonly [number, number]; sconces: readonly THREE.Vector3Like[]; clockLamp: THREE.Vector3Like };

export type Shared = {
  time: { value: number };
  /** 0 to 1: how lit the lamps are. */
  lamps: { value: number };
  /** 0 to 1: how lit the candle is. */
  candle: { value: number };
  ripples: { value: Float32Array };
  sunSoft: { value: number };
  /** How much light shines through the drinks from round about. */
  through: { value: number };
};

const WOOD = /* glsl */ `
const float PLANK = 140.0;
vec3 barWood(vec2 p, out float figure) {
  float k = floor((p.y + 2100.0) / PLANK);
  float seed = barHash1(k + 3.0);
  float across = p.y + 2100.0 - (k + 0.5) * PLANK;
  float along = p.x + seed * 4000.0;
  // Flat-sawn: growth rings as long stripes that waver along the board and close into arches.
  float warp = barFbm(vec2(along * 0.0021, seed * 9.0 + across * 0.004)) * 34.0 + barNoise(vec2(along * 0.011, across * 0.03 + seed)) * 5.0;
  float arch = sqrt(abs(across - 30.0 * (seed - 0.5)) * 40.0 + (0.5 + 0.5 * sin(along * 0.0037 + seed * 6.0)) * 1600.0);
  float ring = (arch + warp) / (2.4 + seed * 1.6);
  float fr = fract(ring);
  // Latewood: a dark band at the end of each year, sharp on its outer side.
  float late = smoothstep(0.55, 0.86, fr) * (1.0 - smoothstep(0.93, 1.0, fr));
  late = mix(late, 0.24, smoothstep(0.2, 0.55, fwidth(ring)));
  // Walnut: chocolate and grey-brown, darker streaks of heartwood running along some boards.
  vec3 early = mix(vec3(0.25, 0.15, 0.09), vec3(0.33, 0.2, 0.12), seed);
  float streak = smoothstep(0.55, 0.8, barFbm(vec2(along * 0.0009, across * 0.012 + seed * 5.0)));
  early = mix(early, vec3(0.15, 0.09, 0.07), streak * 0.6);
  vec3 c = mix(early, vec3(0.085, 0.045, 0.03), late * 0.85);
  // Fibres: long streaks along the board, lighter and darker.
  vec2 fib = vec2(along * 0.09, across * 1.7);
  float fd = barDetail(fib);
  c *= 1.0 + (barNoise(fib) - 0.5) * 0.3 * fd + (barNoise(fib * vec2(0.5, 2.3)) - 0.5) * 0.18 * fd;
  // Open pores: thin dark flecks, a tenth of a millimetre wide and a millimetre long, following the grain, thickest in the earlywood.
  vec2 pore = vec2(along * 0.9 + across * 0.35, across * 7.0 + warp * 2.0);
  float pd = barDetail(pore);
  float pores = smoothstep(0.74, 0.86, barNoise(pore) * 0.75 + barNoise(pore * 1.9 + 3.7) * 0.25) * (1.0 - late * 0.6);
  c *= 1.0 - pores * 0.45 * pd;
  figure = late + pores * pd * 0.5;
  return c;
}`;

/** The napkin's own coordinates (u, v from its middle, its half size) and how far a point is inside its edge (negative inside). */
const NAPKIN = /* glsl */ `
uniform vec4 uNapkin;
vec3 barNapkin(vec2 p) {
  vec2 d = p - uNapkin.xy;
  float c = cos(uNapkin.w), s = sin(uNapkin.w);
  vec2 uv = vec2(d.x * c - d.y * s, d.x * s + d.y * c);
  return vec3(uv, max(abs(uv.x), abs(uv.y)) - uNapkin.z);
}`;

/** Rings in the varnish where wet glasses stood, long ago. */
const OLD_RINGS = [
  { x: 252, z: -128, r: 35, from: 0.6, to: 5.6 },
  { x: -268, z: 112, r: 33, from: 2.2, to: 7.4 },
  { x: 86, z: -150, r: 31, from: 3.5, to: 6.0 },
];

function solidHead(wash: Wash) {
  return /* glsl */ `
${KINDS}
${WOOD}
${NAPKIN}
${CLOCK_GLSL}
uniform sampler2D uContact;
// The two coasters: where, how big, and which print.
uniform vec4 uCoasters[2];
// The lime: where it lies, its half-length, and the height of its core.
uniform vec4 uLime;
uniform float uLimeAngle;
uniform float uLimeHeight;
uniform float uLamps;
uniform float uCandle;
uniform vec3 uFlame;
float barAO;
float barVarnish;
float barRough;
float barMetal;
vec2 barSlope;
float barFlat;
// Where a fragment of the clock's face is on it, in its radii.
vec2 barDial;
// The clock's hour and minute hands: blued steel, each a shaft through a hollow moon to a point, a round counterweight behind.
float barMoonHand(vec2 q, float angle, float len, float at, float moon, float w, float tail, float px) {
  vec2 c = clockAlong(angle, at);
  float ring = clockSpot(q, c, moon, px) * (1.0 - clockSpot(q, c, moon * 0.56, px));
  float shaft = clockHand(q, angle, at - moon * 0.7, tail, w, w * 0.7, px);
  float start = at + moon * 0.75;
  float tip = clockHand(q, angle, len, -start, w * 1.1 / (1.0 - start / len), 0.0, px);
  return max(max(ring, shaft), max(tip, clockSpot(q, clockAlong(angle, -tail), w * 1.05, px)));
}
float barHands(vec2 q, float px) {
  return max(barMoonHand(q, uClockHands.x, 0.57, 0.41, 0.095, 0.058, 0.13, px), barMoonHand(q, uClockHands.y, 0.86, 0.66, 0.072, 0.044, 0.17, px));
}
float barSecondHand(vec2 q, float px) {
  return max(clockHand(q, uClockHands.z, 0.88, 0.2, 0.015, 0.009, px), clockSpot(q, clockAlong(uClockHands.z, -0.17), 0.034, px));
}
// The room's warm lights at night, washing the walls and the back bar: the light they give to a surface here.
vec3 barWash(vec3 p, vec3 n) {
  vec3 w = vec3(0.0);
  if (p.z < ${(wash.shelfZ + 140).toFixed(1)} && p.x > ${wash.shelfX[0].toFixed(1)} && p.x < ${wash.shelfX[1].toFixed(1)}) {
    ${wash.shelves.map((y) => `{ float b = ${y.toFixed(1)} - 14.0 - p.y; if (b > -6.0) w += vec3(1.0, 0.62, 0.3) * exp(-max(b, 0.0) / 150.0) * smoothstep(-6.0, 4.0, b); }`).join("\n    ")}
    float ends = smoothstep(${wash.shelfX[0].toFixed(1)}, ${(wash.shelfX[0] + 260).toFixed(1)}, p.x) * smoothstep(${wash.shelfX[1].toFixed(1)}, ${(wash.shelfX[1] - 260).toFixed(1)}, p.x);
    // Where the shelves stop for the pier, so does their light.
    w *= 0.9 * ends * smoothstep(0.0, 40.0, abs(p.x - ${((wash.gap[0] + wash.gap[1]) / 2).toFixed(1)}) - ${((wash.gap[1] - wash.gap[0]) / 2).toFixed(1)});
  }
  {
    // The little lamp over the clock: down and out over its face, and a little round about.
    vec3 d = vec3(${wash.clockLamp.x.toFixed(1)}, ${wash.clockLamp.y.toFixed(1)}, ${wash.clockLamp.z.toFixed(1)}) - p;
    float dd = dot(d, d);
    w += vec3(1.0, 0.7, 0.42) * 1.3 * exp(-dd / 70000.0) * smoothstep(-6.0, 20.0, d.y) * (0.45 + 0.55 * max(dot(n, d) * inversesqrt(dd + 1.0), 0.0));
  }
  ${wash.sconces
    .map((s) => `{ vec3 d = vec3(${s.x.toFixed(1)}, ${s.y.toFixed(1)}, ${s.z.toFixed(1)}) - p; float dd = dot(d, d); w += vec3(1.0, 0.6, 0.3) * 60000.0 / (dd + 20000.0) * (0.35 + 0.65 * max(dot(n, d) * inversesqrt(dd), 0.0)); }`)
    .join("\n  ")}
  return w * uLamps;
}`;
}

const SOLID_COLOR = /* glsl */ `
int barK = int(vKind + 0.5);
barOnCounter = abs(vWorld.x) < ${BAR_TOP.hx + 45}.0 && abs(vWorld.z) < ${BAR_TOP.hz + 45}.0 && vWorld.y > -2.0 && vWorld.y < 330.0;
barAO = 1.0;
barVarnish = 0.0;
barRough = 0.6;
barMetal = 0.0;
barSlope = vec2(0.0);
barFlat = 0.0;
if (barK == K_WOOD || barK == K_TOP) {
  vec3 an = abs(vWorldNormal);
  vec2 wp = an.y > 0.6 ? vWorld.xz : (an.z >= an.x ? vec2(vWorld.x, vWorld.y - 7000.0) : vec2(vWorld.z + 5000.0, vWorld.y - 7000.0));
  float figure;
  diffuseColor.rgb *= barWood(wp, figure);
  barRough = 0.5 + figure * 0.15;
  barVarnish = 1.0;
}
if (barK == K_TOP) {
  barFlat = 1.0;
  barAO = texture2D(uContact, vWorld.xz / vec2(${BAR_TOP.hx * 2}.0, ${BAR_TOP.hz * 2}.0) + 0.5).r;
  // The seams between the boards: a hairline groove.
  float k = (vWorld.z + 2100.0) / PLANK;
  float sd = (0.5 - abs(fract(k) - 0.5)) * PLANK;
  float sw = fwidth(vWorld.z) + 0.04;
  float seam = 1.0 - smoothstep(0.1, 0.1 + sw * 1.5, sd);
  diffuseColor.rgb *= 1.0 - seam * 0.6;
  barSlope.y += (fract(k) < 0.5 ? 1.0 : -1.0) * (1.0 - smoothstep(0.0, 0.45 + sw, sd)) * 0.5;
  // Long ago, wet glasses left rings in the varnish: a little milky, a little dull.
  float worn = 0.0;
  ${OLD_RINGS.map((r) => `{ vec2 d = vWorld.xz - vec2(${r.x.toFixed(1)}, ${r.z.toFixed(1)}); float a = atan(d.y, d.x) + 3.14159; float arc = smoothstep(${r.from.toFixed(2)}, ${(r.from + 0.5).toFixed(2)}, a) * (1.0 - smoothstep(${(r.to - 0.5).toFixed(2)}, ${r.to.toFixed(2)}, a)); float e = abs(length(d) - ${r.r.toFixed(1)}); worn = max(worn, arc * (1.0 - smoothstep(0.5, 1.6 + fwidth(e), e)) * (0.6 + 0.4 * barNoise(d * 0.3))); }`).join("\n  ")}
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.5, 0.42), worn * 0.22);
  barVarnish *= 1.0 - worn * 0.6;
  barRough += worn * 0.2;
  // Fine scratches in the varnish, along the boards mostly.
  vec2 sp = vec2(vWorld.x * 0.12 + barNoise(vWorld.xz * 0.05) * 3.0, vWorld.z * 2.2);
  float scratch = (1.0 - smoothstep(0.0, 0.03, abs(barNoise(sp) - 0.5))) * barDetail(sp);
  barRough += scratch * 0.25;
  barVarnish *= 1.0 - scratch * 0.3;
  // Elbows have dulled the varnish along the patrons' edge.
  barVarnish *= 1.0 - smoothstep(${BAR_TOP.hz - 70}.0, ${BAR_TOP.hz}.0, vWorld.z) * 0.35 * barNoise(vWorld.xz * 0.02);
  // The napkin: folded paper, an embossed border on its open edges, the folds along the others, its layers showing at the edge.
  vec3 nap = barNapkin(vWorld.xz);
  float aa = fwidth(nap.z) + 0.03;
  float inside = 1.0 - smoothstep(-aa, aa, nap.z);
  if (inside > 0.0) {
    vec2 uv = nap.xy;
    vec2 fib = uv * 6.0;
    float paper = 0.94 + (barFbm(fib) - 0.5) * 0.08 * barDetail(fib) + (barNoise(uv * 0.15) - 0.5) * 0.03;
    vec3 col = vec3(0.97, 0.93, 0.86) * paper;
    // Open edges (+u, +v) show the layers as hairlines; folded edges (-u, -v) are rounded and catch the light.
    float openU = uv.x > 0.0 ? 1.0 : 0.0;
    float openV = uv.y > 0.0 ? 1.0 : 0.0;
    float eu = uNapkin.z - abs(uv.x);
    float ev = uNapkin.z - abs(uv.y);
    float layers = 0.0;
    for (int i = 1; i <= 3; i++) {
      float o = float(i) * 0.45;
      layers += openU * (1.0 - smoothstep(0.05, 0.05 + aa, abs(eu - o)));
      layers += openV * (1.0 - smoothstep(0.05, 0.05 + aa, abs(ev - o)));
    }
    col *= 1.0 - min(layers, 1.0) * 0.12;
    // The embossed border: a band of little raised diamonds, pressed into the paper.
    vec2 ns = vec2(0.0);
    float band = smoothstep(4.0, 4.8, min(eu, ev)) * (1.0 - smoothstep(10.5, 11.3, min(eu, ev)));
    float emboss = barDetail(uv / 1.6);
    if (band * emboss > 0.0) {
      vec2 dia = uv / 1.6;
      float h0 = 1.0 - smoothstep(0.3, 0.46, abs(fract(dia.x + dia.y) - 0.5) + abs(fract(dia.x - dia.y) - 0.5) - 0.25);
      vec2 dx = dia + vec2(0.06, 0.0);
      vec2 dy = dia + vec2(0.0, 0.06);
      float hx = 1.0 - smoothstep(0.3, 0.46, abs(fract(dx.x + dx.y) - 0.5) + abs(fract(dx.x - dx.y) - 0.5) - 0.25);
      float hy = 1.0 - smoothstep(0.3, 0.46, abs(fract(dy.x + dy.y) - 0.5) + abs(fract(dy.x - dy.y) - 0.5) - 0.25);
      ns += vec2(hx - h0, hy - h0) / 0.1 * 0.12 * band * emboss;
      col *= 1.0 - (1.0 - h0) * band * emboss * 0.05;
    }
    // The folds: rounded edges where it was folded, and the creases of the folds inside, crossing in the middle.
    ns.x += (1.0 - openU) * (1.0 - smoothstep(0.0, 1.8, eu)) * 0.7;
    ns.y += (1.0 - openV) * (1.0 - smoothstep(0.0, 1.8, ev)) * 0.7;
    ns += vec2(sign(uv.x) * exp(-uv.x * uv.x * 0.6), sign(uv.y) * exp(-uv.y * uv.y * 0.6)) * 0.22;
    col *= 1.0 - (exp(-uv.x * uv.x * 0.6) + exp(-uv.y * uv.y * 0.6)) * 0.035;
    float c = cos(uNapkin.w), s = sin(uNapkin.w);
    barSlope = mix(barSlope, vec2(ns.x * c + ns.y * s, -ns.x * s + ns.y * c), inside);
    diffuseColor.rgb = mix(diffuseColor.rgb, col, inside);
    barVarnish *= 1.0 - inside;
    barRough = mix(barRough, 0.92, inside);
  }
  // A hairline of shadow where the paper stands off the wood.
  barAO *= 1.0 - (1.0 - inside) * (1.0 - smoothstep(0.0, 0.8, nap.z)) * 0.4;
}
if (barK == K_METAL) { barMetal = 1.0; barRough = 0.3; }
if (barK == K_GLOSSY) {
  barRough = 0.25;
  barVarnish = 0.8;
}
if (barK == K_MATTE) barRough = 0.88;
if (barK == K_PAPER || barK == K_CANVAS) {
  vec3 an = abs(vWorldNormal);
  vec2 wp = vec2(an.z > an.x ? vWorld.x : vWorld.z, vWorld.y);
  if (barK == K_PAPER) {
    // Flocked paper: ogees in a half drop, a quatrefoil in each, in velvet a shade darker than the satin ground.
    vec2 t = wp / vec2(170.0, 240.0);
    float col = floor(t.x + 0.5);
    float x = t.x - col;
    float y = fract(t.y + 0.5 * mod(col, 2.0));
    float aa = fwidth(t.x) * 1.5;
    float lattice = 1.0 - smoothstep(0.03, 0.045 + aa, abs(abs(x) - 0.47 * sin(3.14159 * y)));
    vec2 c = vec2(x, (y - 0.5) * 1.41);
    float petals = 1.0 - smoothstep(-aa, aa, length(c) - 0.15 * (0.78 + 0.22 * cos(atan(c.y, c.x) * 4.0)));
    float flock = mix(0.25, max(lattice, petals), barDetail(t * 14.0));
    diffuseColor.rgb *= mix(1.08, 0.74, flock);
    barRough = mix(0.5, 0.95, flock);
  } else {
    // Oil paint: strokes laid across, a little raised, under varnish gone amber, darkest toward the frame.
    vec2 sp = wp * vec2(0.05, 0.2);
    diffuseColor.rgb *= (0.8 + barNoise(sp) * 0.3 + (barNoise(sp * 3.1 + 7.0) - 0.5) * 0.25 * barDetail(sp * 3.1)) * vec3(1.0, 0.94, 0.8);
    barRough = 0.35;
    barVarnish = 0.4;
  }
}
if (barK == K_MIRROR) {
  // An old mirror: the silvering gone smoky and spotted, most at its edges and corners, where the damp got in.
  vec2 mp = vWorld.xy * 0.012;
  float edge = min(min(vWorld.x - ${-BAR_TOP.hx - 400}.0, ${BAR_TOP.hx + 1000}.0 - vWorld.x), min(vWorld.y + 190.0, 1000.0 - vWorld.y));
  float fox = barFbm(mp) * 0.7 + barNoise(vWorld.xy * 0.09) * 0.3 + (1.0 - smoothstep(0.0, 260.0, edge)) * 0.45;
  float spots = smoothstep(0.62, 0.85, fox);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.12, 0.08), spots);
  barMetal = 1.0 - spots * 0.7;
  barRough = 0.06 + spots * 0.4;
}
if (barK == K_BOTTLE) {
  // Glass with spirit in it: deepest where you look straight through it, the glass itself toward its edges, pale with what it reflects.
  float facing = abs(dot(normalize(vWorldNormal), normalize(cameraPosition - vWorld)));
  diffuseColor.rgb = mix(diffuseColor.rgb * mix(0.6, 1.15, facing), vec3(0.62, 0.68, 0.66), pow(1.0 - facing, 3.0) * 0.55);
  barRough = 0.08;
  barVarnish = 1.0;
}
if (barK == K_CARD) {
  // Printed card: the cocktail's cream with an oxblood band and a star, the beer's bottle green with a cream ring and a ring of dots,
  // damp where the cold glass stands. Drawn by distance from the middle, so the print stays sharp however close.
  vec4 co = vWorld.x < 0.0 ? uCoasters[0] : uCoasters[1];
  vec2 d = vWorld.xz - co.xy;
  float s = length(d) / co.z;
  float a = atan(d.y, d.x);
  float aa = fwidth(s) * 1.5 + 0.002;
  vec3 ink;
  if (co.w < 0.5) {
    float band = smoothstep(0.76 - aa, 0.76 + aa, s) * (1.0 - smoothstep(0.86 - aa, 0.86 + aa, s));
    float line = 1.0 - smoothstep(0.01, 0.01 + aa, abs(s - 0.69));
    float star = 1.0 - smoothstep(-aa, aa, s - 0.2 - 0.14 * pow(abs(cos(a * 4.0)), 8.0));
    ink = mix(vec3(0.93, 0.88, 0.78), vec3(0.42, 0.05, 0.07), max(max(band, line), star));
  } else {
    float ring = smoothstep(0.78 - aa, 0.78 + aa, s) * (1.0 - smoothstep(0.85 - aa, 0.85 + aa, s));
    float turn = (fract(a / 6.2832 * 20.0) - 0.5) * 6.2832 / 20.0;
    float dots = 1.0 - smoothstep(0.03, 0.03 + aa, length(vec2(s - 0.5, turn * 0.5)));
    ink = mix(vec3(0.05, 0.19, 0.11), vec3(0.9, 0.84, 0.68), max(ring, dots));
    float damp = smoothstep(0.08, 0.0, abs(s - 0.66 + (barNoise(vec2(a * 6.0, 1.0)) - 0.5) * 0.06));
    ink *= 1.0 - damp * 0.35;
    barRough -= damp * 0.4;
  }
  // The board shows at its cut edge.
  ink = mix(ink, vec3(0.8, 0.76, 0.68), smoothstep(0.93, 0.95, s));
  // Board fibres, and the print a little worn.
  vec2 fp = vWorld.xz * 4.0;
  diffuseColor.rgb *= ink * (1.0 + (barFbm(fp) - 0.5) * 0.3 * barDetail(fp)) * (1.0 - (barNoise(vWorld.xz * 0.4) - 0.5) * 0.12);
  barRough += 0.25;
  barFlat = 1.0;
}
if (barK == K_WAX) barRough = 0.5;
if (barK == K_CHERRY) {
  barRough = 0.12;
  barVarnish = 1.0;
}
if (barK == K_NUT) {
  // Roasted: mottled, with fine dark veins, a little oily.
  vec2 np = vWorld.xz * 1.4 + vWorld.y * 0.7;
  diffuseColor.rgb *= 0.86 + barFbm(np) * 0.28;
  vec2 vp = vWorld.xz * 0.8 + vec2(vWorld.y * 0.6, 0.0);
  diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.0, 0.05, abs(barNoise(vp) - 0.5))) * 0.3 * barDetail(vp);
  barRough = 0.38;
  barVarnish = 0.35;
}
if (barK == K_LIME || barK == K_FLESH) {
  // The wedge's own frame: along it, across it, and up from its core.
  vec2 d = vWorld.xz - uLime.xy;
  float c = cos(uLimeAngle), s = sin(uLimeAngle);
  float u = d.x * c - d.y * s;
  float w = d.x * s + d.y * c;
  float up = vWorld.y - uLime.w;
  float reach = uLimeHeight * sqrt(max(0.02, 1.0 - u * u / (uLime.z * uLime.z)));
  float rim = length(vec2(w, up)) / reach;
  if (barK == K_LIME) {
    // The peel, dimpled with oil glands.
    vec2 gp = vec2(u, atan(w, up) * reach) * 2.4;
    diffuseColor.rgb = mix(vec3(0.06, 0.2, 0.02), vec3(0.2, 0.44, 0.06), barNoise(gp) * 0.65 + barNoise(gp * 3.1) * 0.35 * barDetail(gp * 3.1));
    barRough = 0.3;
    barVarnish = 0.5;
  } else {
    // A cut face: rind, white pith, then the flesh, juice cells running out from the core between thin membranes, wet.
    vec2 cp = vec2(u * 1.3, rim * 14.0);
    float cell = barNoise(cp) * 0.6 + barNoise(cp * 2.4) * 0.4 * barDetail(cp * 2.4);
    vec3 flesh = mix(vec3(0.52, 0.68, 0.14), vec3(0.88, 0.95, 0.46), cell);
    float membrane = 1.0 - smoothstep(0.0, 0.05, abs(fract(u / 7.0 + rim * 0.4) - 0.5));
    flesh = mix(flesh, vec3(0.95, 0.97, 0.84), membrane * 0.55 * smoothstep(0.15, 0.3, rim));
    flesh = mix(flesh, vec3(0.97, 0.98, 0.9), 1.0 - smoothstep(0.0, 0.12, rim));
    diffuseColor.rgb = mix(mix(flesh, vec3(0.93, 0.95, 0.82), smoothstep(0.84, 0.88, rim)), vec3(0.1, 0.3, 0.03), smoothstep(0.94, 0.97, rim));
    barRough = 0.1;
    barVarnish = 0.9;
  }
}`;

/**
 * The clock's face: enamel gone the colour of old ivory, a railway track of
 * minutes, tapered batons for the hours (a pair at twelve), and the hands,
 * each casting a soft shadow down onto the face from the lamp above it.
 */
const dialColor = (dial: Dial) => /* glsl */ `
if (barK == K_DIAL) {
  vec2 q = ${onDial(dial)}.xy;
  barDial = q;
  float px = length(fwidth(q));
  float r = length(q);
  vec3 face = mix(vec3(0.95, 0.91, 0.8), vec3(0.84, 0.76, 0.58), clamp(smoothstep(0.5, 1.02, r) * 0.6 + (barFbm(q * 5.0 + 3.0) - 0.5) * 0.3, 0.0, 1.0));
  float ink = clockRing(q, 0.872, 0.884, px) + clockRing(q, 0.952, 0.964, px) + clockTicks(q, 60.0, 0.884, 0.952, 0.011, px);
  float sector = 0.5235988;
  float at = floor(atan(q.x, q.y) / sector + 0.5) * sector;
  float hour = abs(at) < 0.01
    ? max(clockHand(q, -0.07, 0.86, -0.66, -0.13, 0.045, px), clockHand(q, 0.07, 0.86, -0.66, -0.13, 0.045, px))
    : clockHand(q, at, 0.86, -0.66, -0.15, 0.06, px);
  vec3 c = mix(face, vec3(0.1, 0.075, 0.06), min(ink + hour, 1.0) * 0.92);
  vec2 off = vec2(-0.02, 0.035);
  float spx = px * 3.0 + 0.015;
  c *= 1.0 - max(barHands(q + off, spx), barSecondHand(q + off * 1.3, spx)) * 0.32;
  float hands = barHands(q, px);
  c = mix(c, vec3(0.03, 0.04, 0.08), hands);
  c = mix(c, vec3(0.5, 0.05, 0.04), barSecondHand(q, px));
  c = mix(c, vec3(0.62, 0.45, 0.2), clockSpot(q, vec2(0.0), 0.05, px));
  c = mix(c, vec3(0.08, 0.06, 0.04), clockSpot(q, vec2(0.0), 0.017, px));
  diffuseColor.rgb = c;
  barRough = mix(0.34, 0.22, hands);
  barVarnish = 0.25;
}`;

const SOLID_EMISSIVE = /* glsl */ `
if (barK == K_LAMP) totalEmissiveRadiance += diffuseColor.rgb * (0.04 + uLamps * 1.15);
// The clock's face is lit round its rim from behind the bezel, a soft ring of light in the evening.
if (barK == K_DIAL) totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.66, 0.34) * uLamps * (0.05 + 0.45 * smoothstep(0.93, 1.0, length(barDial)));
if (barK == K_BOTTLE && !barOnCounter) {
  // Lit from behind by the shelf lights: the liquid glows where you look through it, the glass shines at its edges.
  float facing = abs(dot(normalize(vWorldNormal), normalize(cameraPosition - vWorld)));
  totalEmissiveRadiance += diffuseColor.rgb * uLamps * (0.06 + 0.55 * facing * facing * facing);
}
// Citrus flesh glows a little with the light inside it.
if (barK == K_FLESH) totalEmissiveRadiance += diffuseColor.rgb * (0.05 + uLamps * 0.08);
if (barK == K_CHERRY) totalEmissiveRadiance += diffuseColor.rgb * vec3(0.5, 0.06, 0.08) * (0.06 + uLamps * 0.14 + uCandle * 0.1);
// The candle's wax glows round its flame.
if (barK == K_WAX) totalEmissiveRadiance += vec3(1.0, 0.55, 0.2) * uCandle * 0.9 * exp(-max(0.0, uFlame.y - vWorld.y) / 9.0) * smoothstep(-1.0, 3.0, uFlame.y - vWorld.y);
if (!barOnCounter && barK != K_LAMP && barK != K_BOTTLE) totalEmissiveRadiance += diffuseColor.rgb * barWash(vWorld, normalize(vWorldNormal)) * (barK == K_MIRROR ? 0.35 : 1.0);`;

/** Tilts horizontal surfaces by a world-space slope (napkin folds, board seams). */
const SOLID_NORMAL = /* glsl */ `
if (barFlat > 0.5 && dot(barSlope, barSlope) > 0.0) normal = normalize((viewMatrix * vec4(normalize(vec3(-barSlope.x, 1.0, -barSlope.y)), 0.0)).xyz);`;

const SOLID_PHYSICAL = /* glsl */ `
material.clearcoat = barVarnish;
material.clearcoatRoughness = max(material.clearcoatRoughness, 0.09 + (1.0 - barVarnish) * 0.2);`;

const SOLID_AFTER = /* glsl */ `
reflectedLight.indirectDiffuse *= barAO;
reflectedLight.directDiffuse *= mix(1.0, barAO, 0.55);
reflectedLight.indirectSpecular *= mix(1.0, barAO, 0.8);
#ifdef USE_CLEARCOAT
// The reflections are a soft sky, not the room: on the varnish, at a fly's grazing angle, they would veil the wood. Let the lamps, the candle and the window shine in it instead.
// The counter mirrors the room, which is dark but for the window: by day a bright sky all round would grey the walnut.
float barRoom = barK == K_TOP ? mix(0.3, 1.0, smoothstep(0.1, 0.75, -barWorldDir(reflect(-geometryViewDir, geometryClearcoatNormal)).x)) : 1.0;
clearcoatSpecularIndirect *= mix(1.0, barAO, 0.8) * (barK == K_TOP || barK == K_WOOD ? 0.3 * barRoom : 1.0);
#endif
if (barK == K_TOP || barK == K_WOOD) reflectedLight.indirectSpecular *= 0.5;`;

/** Soft shadows on the counter where things touch it, and under the small things: painted once. */
function contactTexture(casters: readonly { x: number; z: number; r: number; strength: number }[]) {
  const W = 1024;
  const H = Math.round((W * BAR_TOP.hz) / BAR_TOP.hx);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  const k = W / (BAR_TOP.hx * 2);
  for (const c of casters) {
    const x = (c.x + BAR_TOP.hx) * k;
    // The canvas's first row is the texture's last (it is flipped as it is uploaded): +z at the top.
    const y = (BAR_TOP.hz - c.z) * k;
    const r = c.r * k;
    const grad = g.createRadialGradient(x, y, r * 0.55, x, y, r * 1.45 + 2);
    grad.addColorStop(0, `rgba(0,0,0,${c.strength})`);
    grad.addColorStop(0.45, `rgba(0,0,0,${c.strength * 0.4})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - r * 1.5 - 2, y - r * 1.5 - 2, r * 3 + 4, r * 3 + 4);
  }
  return canvasTexture(canvas, { srgb: false });
}

/** The solid things' material: one for the counter, everything on it and the room. */
export function solidMaterial(casters: readonly Caster[], contact: readonly { x: number; z: number; r: number; strength: number }[], wash: Wash, shared: Shared, flame: THREE.Vector3, lime: { x: number; z: number; rx: number; angle: number; base: number; height: number }, coasters: readonly { x: number; z: number; r: number }[], clock: { dial: Dial; hands: { value: THREE.Vector3 } }) {
  const material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9 });
  const uniforms = {
    ...casterUniforms(casters),
    uNoise: { value: noiseTexture() },
    uSunSoft: shared.sunSoft,
    uContact: { value: contactTexture(contact) },
    uNapkin: { value: new THREE.Vector4(BAR_DECOR.napkin.x, BAR_DECOR.napkin.z, BAR_DECOR.napkin.size / 2, BAR_DECOR.napkin.angle) },
    uLamps: shared.lamps,
    uCandle: shared.candle,
    uFlame: { value: flame },
    uLime: { value: new THREE.Vector4(lime.x, lime.z, lime.rx, lime.base) },
    uLimeAngle: { value: lime.angle },
    uLimeHeight: { value: lime.height },
    uCoasters: { value: [...coasters].sort((a, b) => a.x - b.x).map((c, i) => new THREE.Vector4(c.x, c.z, c.r, i)) },
    uClockHands: clock.hands,
  };
  patch(material, {
    key: "solid",
    uniforms,
    casters: casters.length,
    head: solidHead(wash),
    color: SOLID_COLOR + dialColor(clock.dial),
    surface: "roughnessFactor = barRough;\nmetalnessFactor = barMetal;",
    normal: SOLID_NORMAL,
    emissive: SOLID_EMISSIVE,
    physical: SOLID_PHYSICAL,
    // The stage's reflections are a soft sky round everything; as diffuse light they would fill every shadow. The hemisphere is the room's ambient light.
    ambient: "iblIrradiance *= 0.2;",
    after: SOLID_AFTER,
  });
  return { material, uniforms };
}

const CLEAR_HEAD = /* glsl */ `
${KINDS}
uniform float uTime;
uniform vec4 uBeer;
uniform vec4 uRipples[${RIPPLES}];
uniform float uThrough;
uniform float uDrink;
float barAlpha;
float barRough;
float barBubble;
// Bubbles packed together: how far from the middle of the nearest (0 to 1), how close to the wall between two, and a slope to tilt the light by.
vec3 barCells(vec2 p) {
  vec2 cell = floor(p);
  vec2 fr = fract(p);
  float f1 = 9.0;
  float f2 = 9.0;
  vec2 to = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + vec2(barHash(cell + g), barHash(cell + g + 17.3)) - fr;
    float d = dot(r, r) * (0.6 + barHash(cell + g + 5.1) * 0.8);
    if (d < f1) { f2 = f1; f1 = d; to = r; } else if (d < f2) f2 = d;
  }
  float wall = 1.0 - smoothstep(0.0, 0.14, sqrt(f2) - sqrt(f1));
  return vec3(sqrt(f1), wall, 0.5 + to.x * 0.5);
}
`;

const CLEAR_COLOR = /* glsl */ `
int barK = int(vKind + 0.5);
barOnCounter = abs(vWorld.x) < ${BAR_TOP.hx + 45}.0 && abs(vWorld.z) < ${BAR_TOP.hz + 45}.0 && vWorld.y > -2.0 && vWorld.y < 330.0;
barAlpha = 1.0;
barRough = 0.05;
barBubble = 0.0;
if (barK == K_BEER) {
  // Bubbles rising through the beer, from the glass's walls: specks moving up a millimetre or two apart.
  vec2 rel = vWorld.xz - uBeer.xy;
  float ang = atan(rel.y, rel.x);
  vec2 bp = vec2(ang * uBeer.z, vWorld.y - uTime * 14.0) / 1.7;
  vec2 bc = floor(bp);
  vec2 bf = fract(bp) - 0.5 - (vec2(barHash(bc + 3.1), barHash(bc + 7.7)) - 0.5) * 0.6;
  float has = step(0.82, barHash(bc));
  float speck = has * (1.0 - smoothstep(0.07, 0.15, length(bf))) * barDetail(bp);
  // Deeper amber low in the glass, where you look through more of it.
  float depth = clamp(vWorld.y / uBeer.w, 0.0, 1.0);
  diffuseColor.rgb *= mix(0.7, 1.1, depth);
  // Looking through the middle of the glass you see more beer than at its sides: deeper there, clearer at the edges.
  float through = abs(dot(normalize(vWorldNormal), normalize(cameraPosition - vWorld)));
  diffuseColor.rgb *= mix(1.25, 0.8, through);
  diffuseColor.rgb += speck * vec3(0.8, 0.7, 0.45);
  barAlpha = mix(0.6, 0.9, through);
}
if (barK == K_COCKTAIL) barAlpha = 0.74;
if (barK == K_FOAM) {
  // A head of foam: big bubbles and small, each a little dome with a bright wall round it; on the side, seen through the glass, the same wrapped round.
  vec2 rel = vWorld.xz - uBeer.xy;
  vec2 fp = abs(vWorldNormal.y) > 0.5 ? vWorld.xz : vec2(atan(rel.y, rel.x) * uBeer.z, vWorld.y);
  vec3 big = barCells(fp / 1.7);
  vec3 small = barCells(fp / 0.5 + 11.0);
  float db = barDetail(fp / 1.7);
  float ds = barDetail(fp / 0.5);
  // Each bubble is clear in the middle (darker, you see into the foam) and white at its wall.
  float shade = 1.0 - big.x * big.x * 0.45 * db + big.y * 0.18 * db - small.x * 0.25 * ds + small.y * 0.12 * ds;
  diffuseColor.rgb *= shade;
  barBubble = (big.z - 0.5) * db * 1.6 + (small.z - 0.5) * ds;
  barRough = mix(0.75, 0.2, max(db, ds));
}
if (barK == K_SURFACE || barK == K_FILM) {
  barAlpha = barK == K_FILM ? 0.3 : 0.5;
  barRough = 0.02;
}
if (barK == K_ICE) {
  // Ice: clear, crazed inside, frosted at its edges; seen faintly through the drink below its surface.
  vec2 ip = vWorld.xz * 0.35 + vWorld.yy * 0.25;
  float crack = 1.0 - smoothstep(0.0, 0.06, abs(barNoise(ip) - 0.5));
  diffuseColor.rgb = mix(vec3(0.5, 0.6, 0.7), vec3(1.0), crack * 0.6);
  barAlpha = (0.12 + crack * 0.25) * (vWorld.y > uDrink ? 1.0 : 0.3);
  barRough = 0.08;
}
// Glass scatters no light of its own: all you see of it is what it reflects.
if (barK == K_GLASS) diffuseColor.rgb *= 0.04;`;

const CLEAR_NORMAL = /* glsl */ `
if (barK == K_SURFACE || barK == K_FILM) {
  // Rings spreading from each disturbance at 6 mm/s, a millimetre apart, dying away: they bend the reflection and catch the light.
  vec2 slope = vec2(0.0);
  float shade = 0.0;
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (age < 0.0 || age > 4.0) continue;
    vec2 d = vWorld.xz - r.xy;
    float dist = length(d) + 1e-4;
    float behind = age * 6.0 - dist;
    if (behind < 0.0) continue;
    float fade = exp(-behind * 0.5) * exp(-age * 0.8) * r.w * smoothstep(0.0, 0.5, behind);
    slope += d / dist * sin(behind * 6.0) * fade * 0.6;
    shade += cos(behind * 6.0) * fade;
  }
  diffuseColor.rgb *= 1.0 + shade * 0.2;
  normal = normalize((viewMatrix * vec4(normalize(vec3(-slope.x, 1.0, -slope.y)), 0.0)).xyz);
}
if (barK == K_FOAM) normal = normalize(normal + (viewMatrix * vec4(barBubble * 0.6, 0.0, barBubble * 0.45, 0.0)).xyz);
// Old window glass is a little wavy.
if (barK == K_GLASS && vWorld.x < ${-BAR_TOP.hx - 300}.0) {
  vec2 wp = vWorld.zy * 0.012;
  vec3 tilt = vec3(0.0, barNoise(wp) - 0.5, barNoise(wp + 9.0) - 0.5) * 0.04;
  normal = normalize(normal + (viewMatrix * vec4(tilt, 0.0)).xyz);
}`;

const CLEAR_FINAL = /* glsl */ `
{
  float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float edge = pow(1.0 - facing, 2.5);
  if (barK == K_GLASS) barAlpha = 0.05 + edge * 0.7 + min(dot(outgoingLight, vec3(0.1)), 0.15);
  if (barK == K_DROP) {
    // Water: clear where you look straight through it, mirror-bright at its edge, with the dark band a lens makes of what's behind it.
    float lens = smoothstep(0.25, 0.55, 1.0 - facing) * (1.0 - smoothstep(0.75, 0.97, 1.0 - facing));
    outgoingLight *= 1.0 - lens * 0.45;
    outgoingLight += vec3(0.08, 0.1, 0.12) * (1.0 - edge);
    barAlpha = 0.18 + edge * 0.85 + lens * 0.25 + dot(outgoingLight, vec3(0.3)) * 0.15;
  }
  if (barK == K_BEER || barK == K_COCKTAIL) barAlpha = min(1.0, barAlpha + edge * 0.3);
  // A liquid's top is a mirror at a low angle and clear looking down into it.
  if (barK == K_SURFACE) barAlpha = min(1.0, barAlpha * (0.8 + 0.2 * facing) + edge * 0.6 + dot(outgoingLight, vec3(0.05)));
  // A spilt film is mostly the wood seen through it, wet, and what it reflects.
  if (barK == K_FILM) barAlpha = min(1.0, barAlpha + edge * 0.5 + dot(outgoingLight, vec3(0.04)));
  if (barK == K_ICE) barAlpha = min(1.0, barAlpha + edge * (vWorld.y > uDrink ? 0.75 : 0.2));
  diffuseColor.a = clamp(barAlpha, 0.0, 1.0);
}`;

/** The clear things' material: glass, the drinks, ice, foam and drops. */
export function clearMaterial(casters: readonly Caster[], shared: Shared, beer: THREE.Vector4, drink: number) {
  const material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.05, metalness: 0, transparent: true, depthWrite: false, envMapIntensity: 1.6 });
  const uniforms = { ...casterUniforms(casters), uNoise: { value: noiseTexture() }, uSunSoft: shared.sunSoft, uTime: shared.time, uBeer: { value: beer }, uRipples: shared.ripples, uThrough: shared.through, uDrink: { value: drink } };
  patch(material, {
    key: "clear",
    uniforms,
    casters: casters.length,
    head: CLEAR_HEAD,
    color: CLEAR_COLOR,
    surface: "roughnessFactor = barRough;",
    ambient: "iblIrradiance *= 0.3;",
    normal: CLEAR_NORMAL,
    // Light from all round comes through a drink and out toward you: it glows its own colour.
    emissive: "if (barK == K_BEER || barK == K_COCKTAIL) totalEmissiveRadiance += diffuseColor.rgb * uThrough;\nif (barK == K_SURFACE) totalEmissiveRadiance += diffuseColor.rgb * uThrough * 0.5;\nif (barK == K_FILM) totalEmissiveRadiance += diffuseColor.rgb * uThrough * 0.2;\nif (barK == K_FOAM) totalEmissiveRadiance += diffuseColor.rgb * uThrough * 0.35;",
    final: CLEAR_FINAL,
  });
  return material;
}
