// What is seen through the restaurant's shop windows: a city street at night,
// or on a quiet morning. The restaurant's own pavement with a bicycle at its
// rack, a bin and the terrace stacked away; the road, its parked cars and now
// and then one going by; the far pavement with its plane trees; the row of
// houses across, shuttered shops along their feet, a corner bar still lit
// with a wine glass in neon in its window, a late shop further along, flats
// above with windows lit and going dark through the night; a side street
// running away opposite, its lanterns on brackets; and a strip of sky over
// the roofs, stars in it and the city's glow. By day the same street in
// daylight, the rows' shadows across it, a van unloading. The rain falls
// through the lamplight and leaves the road shining, puddles holding the
// lights; mist hazes the far side; overcast greys it.
//
// In the far pass in five draws (six in the rain): the sky; the ground; the
// buildings and everything standing (merged); the cars going by (instanced);
// the lights' glows (instanced); the rain. Windows, shopfronts, paving and
// the wet are worked out per pixel.

import * as THREE from "three";
import { freeze } from "../../scene/build.ts";
import type { Daylight } from "../../scene/light.ts";
import type { SceneBackdrop } from "../types.ts";
import { buildBuildings, rowOfBuildings } from "./street/buildings.ts";
import { f, lighting, NOISE, SHOP_FLOOR, STOREY, VERTEX } from "./street/glsl.ts";
import { CORNER_BAR, LAMPS, LATE_SHOP, STREET } from "./street/layout.ts";
import { KIND, Pieces } from "./street/pieces.ts";
import { car, PAINTS, buildProps } from "./street/props.ts";
import { traffic } from "./traffic.ts";

const LAMP = new THREE.Color(1.0, 0.74, 0.44);
const NEON = new THREE.Color(1.0, 0.2, 0.5);
const BAR = new THREE.Color(1.0, 0.56, 0.26);
const SHOP = new THREE.Color(0.82, 0.92, 1.0);
const HOME = new THREE.Color(1.0, 0.7, 0.42);
const CAR_LENGTH = 4400;

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

/** The sky over the roofs: the palette's, the overcast's cloud moving over, stars where it is dark and clear, and the city's glow low down at night, warm on the cloud. */
const SKY_FS = /* glsl */ `
uniform vec3 uSkyHigh; uniform vec3 uSkyLow; uniform float uStars; uniform float uCloud; uniform float uTime; uniform vec3 uGlow; uniform vec3 uSunDir; uniform vec3 uSunColor;
varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 c = mix(uSkyLow, uSkyHigh, smoothstep(0.0, 0.5, h));
  vec2 uv = d.xz / (h + 0.08) * 1.4 + vec2(uTime * 0.004, 0.0);
  float n = vnoise(uv) * 0.55 + vnoise(uv * 2.3 + 4.1) * 0.3 + vnoise(uv * 5.1 + 9.7) * 0.15;
  float cloud = smoothstep(0.62 - 0.55 * uCloud, 0.85 - 0.3 * uCloud, n) * smoothstep(0.0, 0.1, h);
  vec3 grey = vec3(dot(uSkyLow, vec3(0.3, 0.59, 0.11))) * vec3(0.97, 0.98, 1.0);
  c = mix(c, mix(uSkyLow, grey, uCloud) * (0.75 + 0.35 * n), cloud * 0.85);
  c += uSunColor * pow(max(dot(d, uSunDir), 0.0), 12.0) * 0.35 * (1.0 - uCloud);
  // The city's light on the haze and the undersides of the clouds.
  c += uGlow * (1.0 - smoothstep(0.0, 0.45, h)) * (0.5 + cloud + uCloud * 0.6);
  vec3 cell = floor(d * 260.0);
  // Few stars over a city: the brightest, through its glow.
  float star = step(0.9993, hash21(cell.xy + cell.z * 7.31)) * smoothstep(0.08, 0.35, h);
  c += vec3(star * uStars * (1.0 - uCloud) * (1.0 - cloud) * (0.45 + 0.25 * sin(uTime * 2.3 + cell.x)));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

const SURFACE_VS = /* glsl */ `
${VERTEX}
uniform float uByDay;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vKind = aKind;
  vBuilding = aBuilding;
  gl_Position = projectionMatrix * viewMatrix * w;
  // What is there only by day goes at dusk.
  if (aKind >= ${f(10 - 0.5)}) {
    vKind = aKind - 10.0;
    if (uByDay < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
}`;

/** The ways the street's surfaces see what they reflect: the houses across (their lit windows and shops at night), the street lamps, the cars' lamps, the neon, and the sky. */
const REFLECTIONS = /* glsl */ `
vec3 skyIn(vec3 r) { return mix(uSkyLow, uSkyHigh, smoothstep(0.0, 0.5, r.y)); }
// What a ray from p along r meets across the street, softly.
vec3 seen(vec3 p, vec3 r) {
  if (r.z > 0.02) {
    float t = (${f(STREET.facades)} - p.z) / r.z;
    vec3 h = p + r * t;
    vec4 b = rowAt(h.x);
    float v = h.y - ${f(STREET.pavement)};
    if (h.y < b.z || b.z == 0.0) {
      vec3 c = uSky * 0.35 + uBounce * 0.2;
      if (b.z == 0.0) c *= 0.5;
      if (v > ${f(SHOP_FLOOR)}) {
        float s = floor((v - ${f(SHOP_FLOOR)}) / ${f(STOREY)});
        float nb = max(2.0, floor((b.y - b.x) / 2500.0));
        float cell = floor((h.x - b.x) / (b.y - b.x) * nb);
        float fx = fract((h.x - b.x) / (b.y - b.x) * nb);
        float fy = fract((v - ${f(SHOP_FLOOR)}) / ${f(STOREY)});
        float win = band(fx, 0.3, 0.7, 0.06) * band(fy, 0.22, 0.82, 0.06) * step(v, b.z - ${f(STREET.pavement + 900)});
        c += vec3(1.0, 0.68, 0.38) * 0.9 * win * windowLit(vec2(cell, s), b.w);
      } else {
        float bar = band(h.x, ${f(CORNER_BAR.x0)}, ${f(CORNER_BAR.x1)}, 200.0) * band(v, 500.0, 3200.0, 200.0);
        float shop = band(h.x, ${f(LATE_SHOP.x0)}, ${f(LATE_SHOP.x1)}, 200.0) * band(v, 300.0, 3100.0, 200.0);
        c += uBarLight * bar * 0.14 + uShopLight * shop * 0.14;
      }
      return c;
    }
  } else if (r.z < -0.02) {
    // Back at the restaurant: its dark front, the room dimly lit behind the glass.
    float t = (${f(STREET.front)} - p.z) / r.z;
    vec3 h = p + r * t;
    if (h.y < ${f(STREET.nearRow)}) return uSky * 0.25 + uHomeLight * 0.1 * band(h.x, -4200.0, 3750.0, 150.0) * band(h.y, 450.0, 2750.0, 150.0);
  }
  return skyIn(r);
}
// A light's image in a wet surface at p, seen along r: drawn out toward the eye, a little across.
vec3 streak(vec3 p, vec3 r, vec3 l, vec3 colour, vec2 spread) {
  vec3 a = normalize(l - p);
  float across = 1.0 - dot(normalize(r.xz), normalize(a.xz));
  float up = r.y - a.y;
  return colour * exp(-across * spread.x - up * up * spread.y);
}
vec3 glints(vec3 p, vec3 r, vec2 spread) {
  vec3 c = vec3(0.0);
  if (uLampLight.r > 0.0) for (int i = 0; i < ${LAMPS.length}; i++) c += streak(p, r, uLamps[i], uLampLight * 0.08, spread);
  for (int i = 0; i < 2; i++) {
    vec4 car = uCars[i];
    if (car.w <= 0.0) continue;
    float toward = sign(cameraPosition.x - car.x) * car.z;
    vec3 l = vec3(car.x + car.z * 2250.0, ${f(STREET.road + 650)}, car.y);
    c += streak(p, r, l, vec3(1.0, 0.95, 0.86) * car.w * 0.05 * (0.3 + 0.7 * step(0.0, toward)), spread);
    c += streak(p, r, l - vec3(car.z * 4500.0, -100.0, 0.0), vec3(1.0, 0.08, 0.04) * car.w * 0.02, spread);
  }
  c += streak(p, r, vec3(${f(CORNER_BAR.neon.x)}, ${f(CORNER_BAR.neon.y)}, ${f(STREET.facades)}), uNeon * 0.4, spread * vec2(0.4, 0.6));
  return c;
}
`;

/** The ground: the pavements' flags, the kerbs, the road with its lines and a zebra crossing, the side street's setts; wet, puddled and shining in the rain. */
const GROUND_FS = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
${REFLECTIONS}
float lines(float x, float period, float width, float px) {
  float d = abs(fract(x / period + 0.5) - 0.5) * period;
  return mix(1.0 - smoothstep(width * 0.5, width * 0.5 + px, d), width / period, smoothstep(period * 0.1, period * 0.4, px));
}
void main() {
  vec3 p = vWorld;
  vec3 n = normalize(vNormal);
  vec3 v = normalize(p - cameraPosition);
  float px = length(fwidth(p));
  vec3 albedo;
  float rough = 1.0;
  float puddle = 0.0;
  float hold = 0.0;
  if (n.y < 0.5) {
    // The kerbs' faces.
    albedo = vec3(0.42, 0.41, 0.4) * (0.9 + 0.2 * hash21(floor(p.xx / 900.0)));
  } else if (p.z > ${f(STREET.facades - 1)}) {
    // Setts down the side street.
    vec2 q = p.xz / vec2(110.0, 190.0);
    q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
    albedo = vec3(0.3, 0.285, 0.27) * (0.75 + 0.4 * hash21(floor(q))) * (1.0 - 0.5 * max(lines(q.x * 110.0, 110.0, 14.0, px), lines(q.y * 190.0, 190.0, 14.0, px)));
    hold = 0.5;
  } else if (p.z < ${f(STREET.kerb)} || p.z > ${f(STREET.farKerb)}) {
    // Flagstones, a row of granite kerbstones along the edge.
    float edge = p.z < ${f(STREET.kerb)} ? ${f(STREET.kerb)} - p.z : p.z - ${f(STREET.farKerb)};
    vec2 q = p.xz / vec2(750.0, 600.0);
    q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
    float h = hash21(floor(q) + 3.0);
    albedo = vec3(0.38, 0.365, 0.345) * (0.82 + 0.3 * h);
    albedo *= 1.0 - 0.35 * max(lines(q.x * 750.0, 750.0, 10.0, px), lines(q.y * 600.0, 600.0, 10.0, px));
    if (edge < 300.0) albedo = vec3(0.36, 0.355, 0.35) * (0.9 + 0.2 * hash21(floor(p.xx / 900.0))) * (1.0 - 0.4 * lines(p.x, 900.0, 10.0, px));
    // Old gum and stains.
    albedo *= 1.0 - 0.15 * smoothstep(0.7, 0.9, vnoise(p.xz / 300.0));
    hold = 0.2 * smoothstep(0.6, 0.8, vnoise(p.xz / 900.0 + 7.0));
  } else {
    // Asphalt: grain, patches, the gutters.
    albedo = vec3(0.105, 0.105, 0.11) * (0.85 + 0.25 * vnoise(p.xz / 1400.0)) * (0.9 + 0.2 * mix(hash21(floor(p.xz / 40.0)), 0.5, smoothstep(10.0, 30.0, px)));
    float mid = ${f((STREET.lanes[0] + STREET.lanes[1]) / 2)};
    // The centre line, dashed; the parking lane's edge, dashed short; the zebra at the side street's mouth.
    float paint = band(p.z, mid - 55.0, mid + 55.0, px) * step(0.45, fract(p.x / 6000.0));
    paint = max(paint, band(p.z, ${f(STREET.kerb + 2150)}, ${f(STREET.kerb + 2250)}, px) * step(0.5, fract(p.x / 2000.0)));
    paint = max(paint, band(p.x, 1700.0, 4700.0, px) * (1.0 - lines(p.z, 1000.0, 500.0, px)) * band(p.z, ${f(STREET.kerb + 300)}, ${f(STREET.farKerb - 300)}, px));
    albedo = mix(albedo, vec3(0.7, 0.7, 0.66), paint * (0.85 + 0.15 * vnoise(p.xz / 200.0)));
    // A drain grate in the gutter every so often.
    vec2 g = vec2(mod(p.x + 600.0, 12000.0) - 600.0, p.z - ${f(STREET.kerb + 250)});
    float grate = band(g.x, -400.0, 400.0, px) * band(g.y, -150.0, 150.0, px);
    albedo *= 1.0 - grate * (0.6 + 0.4 * lines(g.x, 60.0, 25.0, px));
    float gutter = max(1.0 - smoothstep(200.0, 700.0, p.z - ${f(STREET.kerb)}), 1.0 - smoothstep(200.0, 700.0, ${f(STREET.farKerb)} - p.z));
    hold = max(gutter * 0.8, smoothstep(0.55, 0.75, vnoise(p.xz / 2300.0) * 0.7 + vnoise(p.xz / 700.0) * 0.3));
    rough = 0.7;
  }
  // The wet: darker, and shining; water lies in the hollows the wetter it is.
  float wet = uWet;
  puddle = smoothstep(0.7 - 0.35 * wet, 0.9 - 0.35 * wet, hold) * smoothstep(0.3, 0.8, wet);
  albedo *= 1.0 - 0.45 * wet - 0.3 * puddle;
  vec3 c = outsideLight(p, n, v, albedo, 8.0, 0.0);
  float gloss = (wet * 0.55 * rough + puddle * 0.45) * step(0.5, n.y);
  if (gloss > 0.001) {
    vec3 up = vec3(0.0, 1.0, 0.0);
    // Rain rings in the puddles, and the road's own grain breaking up what it shows.
    vec2 cell = floor(p.xz / 160.0);
    float age = fract(uTime * 1.3 + hash21(cell));
    float ring = sin((length(fract(p.xz / 160.0) - 0.5) * 160.0 - age * 70.0) * 0.25) * (1.0 - age) * uRain * puddle * (1.0 - smoothstep(4.0, 12.0, px));
    up.xz += vec2(vnoise(p.xz / 90.0) - 0.5, vnoise(p.xz / 90.0 + 5.0) - 0.5) * 0.06 * (1.0 - puddle) + vec2(ring) * 0.08;
    vec3 r = reflect(v, normalize(up));
    float fres = 0.04 + 0.96 * pow(1.0 - max(-v.y, 0.0), 5.0);
    vec2 spread = mix(vec2(900.0, 22.0), vec2(30000.0, 2500.0), puddle);
    vec3 shown = seen(p, r) + glints(p, r, spread) * mix(1.0, 6.0, puddle);
    c = mix(c, shown, gloss * fres);
  }
  gl_FragColor = vec4(hazed(c, p), 1.0);
  #include <colorspace_fragment>
}`;

/** Everything standing: the houses' faces with their windows and shops, the cars, lamp posts, trees and things on the pavements. */
const SOLID_FS = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vKind;
varying vec4 vBuilding;
uniform vec3 uCarLamp;
uniform vec3 uLantern;
${REFLECTIONS}
float lines(float x, float period, float width, float px) {
  float d = abs(fract(x / period + 0.5) - 0.5) * period;
  return mix(1.0 - smoothstep(width * 0.5, width * 0.5 + px, d), width / period, smoothstep(period * 0.1, period * 0.4, px));
}
// The neon in the corner bar's window: a wine glass, a little wine in it. Distances (mm) to its tubes, the glass's and the wine's.
vec2 neonSign(vec2 q) {
  vec2 b = q - vec2(0.0, 120.0);
  float bowl = b.y < 0.0 ? abs(length(b) - 300.0) : length(vec2(abs(b.x) - (300.0 - 0.3 * min(b.y, 230.0)), max(b.y - 230.0, 0.0)));
  float stem = length(vec2(q.x, q.y - clamp(q.y, -480.0, -180.0)));
  float foot = length(vec2(q.x - clamp(q.x, -210.0, 210.0), q.y + 480.0));
  float wine = length(vec2(q.x - clamp(q.x, -255.0, 255.0), q.y - 10.0));
  return vec2(min(bowl, min(stem, foot)), wine);
}
// A shop's window at night: what is behind its glass. u along the face, v up from the pavement, px the pixel's size.
vec3 interior(float u, float v, float px, float which) {
  if (which > 1.5) {
    // The late shop: bright, its shelves in rows, packets of every colour on them.
    float shelf = lines(v, 420.0, 40.0, px);
    vec3 goods = mix(vec3(0.9), vec3(hash21(floor(vec2(u / 130.0, v / 420.0))), hash21(floor(vec2(u / 130.0, v / 420.0)) + 3.0), hash21(floor(vec2(u / 130.0, v / 420.0)) + 7.0)), 0.6 * (1.0 - smoothstep(20.0, 60.0, px)));
    vec3 c = mix(goods * 0.8, vec3(0.25), shelf) * step(v, 2300.0) + vec3(1.0) * step(2300.0, v);
    return c * uShopLight * 0.16;
  }
  // The corner bar, lit low: its counter dark across the bottom, bottles on the back bar's shelves against the light, pendants over it.
  float counter = 1.0 - smoothstep(1050.0, 1100.0, v);
  float bottles = band(v, 1500.0, 1820.0, 10.0) * step(0.35, fract(u / 95.0)) * step(v - 1500.0, 160.0 + 160.0 * hash21(vec2(floor(u / 95.0), 1.0)));
  bottles = mix(bottles, 0.3, smoothstep(15.0, 40.0, px));
  vec3 c = vec3(0.35 + 0.65 * smoothstep(400.0, 2600.0, v)) * (1.0 - 0.85 * counter) * (1.0 - 0.7 * bottles);
  float pendant = 1.0 - smoothstep(30.0, 160.0, length(vec2(mod(u + 800.0, 1600.0) - 800.0, v - 2650.0)));
  return uBarLight * (c * 0.12 + pendant * 0.8);
}
// A building's face at p: its windows over the shops, the shops' fronts, the courses of its stone.
vec3 facade(vec3 p, vec3 n, vec3 v, vec3 wall, float px, inout vec3 emit, inout float sharp, inout float shine) {
  if (n.y > 0.5) return wall * 0.45;
  bool side = abs(n.x) > 0.5;
  float u = side ? p.z : p.x;
  float h = p.y - ${f(STREET.pavement)};
  float top = vBuilding.z - ${f(STREET.pavement)};
  float u0 = vBuilding.x;
  float u1 = vBuilding.y;
  float seed = vBuilding.w;
  float k = fract(seed * 7.31);
  vec3 c = wall;
  // Dressed stone in courses on some, render on others, and the grime of the street low down.
  if (k > 0.5) c *= 1.0 - 0.18 * max(lines(h, 450.0, 12.0, px), lines(u + step(1.0, mod(floor(h / 450.0), 2.0)) * 450.0, 900.0, 12.0, px) * 0.6);
  else c *= 0.92 + 0.12 * vnoise(vec2(u, h) / 700.0);
  c *= 0.8 + 0.2 * smoothstep(0.0, 2500.0, h);
  float glass = 0.0;
  vec3 lit = vec3(0.0);
  if (h > ${f(SHOP_FLOOR + 250)} && h < top - 800.0) {
    float s = floor((h - ${f(SHOP_FLOOR)}) / ${f(STOREY)});
    float wy = h - ${f(SHOP_FLOOR)} - s * ${f(STOREY)};
    float nb = max(2.0, floor((u1 - u0) / 2500.0));
    float bay = (u1 - u0) / nb;
    float cell = floor((u - u0) / bay);
    float wx = abs((u - u0) - (cell + 0.5) * bay);
    float hw = 480.0 + 80.0 * fract(seed * 3.7);
    float open = band(wx, -1.0, hw, px) * band(wy, 700.0, 2500.0, px);
    float surround = band(wx, -1.0, hw + 110.0, px) * band(wy, 620.0, 2620.0, px) * (1.0 - open);
    c = mix(c, mix(wall, vec3(0.92, 0.9, 0.85), 0.55), surround);
    // The sill's shadow under its ledge, and the shutters folded back beside the windows of some houses.
    c *= 1.0 - 0.35 * band(wy, 520.0, 600.0, px) * band(wx, -1.0, hw + 150.0, px);
    if (fract(seed * 13.1) > 0.45) {
      float shutter = band(wx, hw + 120.0, hw * 2.0 + 110.0, px) * band(wy, 700.0, 2500.0, px);
      vec3 paint = mix(vec3(0.22, 0.34, 0.28), vec3(0.42, 0.5, 0.56), step(0.7, fract(seed * 5.3)));
      c = mix(c, paint * (1.0 - 0.3 * lines(wy, 70.0, 25.0, px)), shutter);
    }
    if (open > 0.0) {
      float bars = max(lines(wx, hw * 2.0, 40.0, px) * step(wx, 30.0), band(wy, 1640.0, 1700.0, px));
      vec2 id = vec2(cell + floor(u0 / 100.0), s);
      float on = windowLit(id, seed);
      float tone = hash21(id + 0.5);
      vec3 room = tone < 0.2 ? vec3(0.62, 0.72, 1.0) : (tone < 0.3 ? vec3(1.0, 0.85, 0.65) : vec3(1.0, 0.64, 0.34));
      // A television's flicker in a few.
      if (tone > 0.93) room = vec3(0.45, 0.6, 1.0) * (0.55 + 0.45 * vnoise(vec2(uTime * 6.0, id.x)));
      float curtain = step(0.45, hash21(id + 9.0));
      float folds = 0.75 + 0.25 * sin(wx * 0.035 + id.x);
      vec3 inside = room * mix(0.5 + 0.5 * smoothstep(700.0, 2500.0, wy), folds * 0.8, curtain) * (0.7 + 0.5 * tone);
      lit = inside * on * uDark * open * (1.0 - bars);
      glass = open * (1.0 - bars);
      c = mix(c, vec3(0.9, 0.88, 0.84) * 0.7, open * bars);
      // A wrought-iron balcony across the first floor of some.
      if (s < 0.5 && fract(seed * 17.7) > 0.5) {
        float rail = band(wy, 650.0, 1550.0, px) * max(lines(wx, 110.0, 16.0, px), band(wy, 1500.0, 1550.0, px)) * band(wx, -1.0, hw + 60.0, px);
        c = mix(c, vec3(0.06), rail);
        glass *= 1.0 - rail;
        lit *= 1.0 - rail;
      }
    }
  } else if (h < ${f(SHOP_FLOOR)}) {
    if (side) {
      // Down the side street: doors and small windows at street level, barred.
      float bay = 3600.0;
      float wx = abs(mod(u, bay) - bay * 0.5);
      float door = band(wx, -1.0, 520.0, px) * band(h, 0.0, 2400.0, px) * step(0.5, hash21(vec2(floor(u / bay), 3.0)));
      float win = band(wx, -1.0, 600.0, px) * band(h, 1200.0, 2700.0, px) * (1.0 - door);
      c = mix(c, vec3(0.16, 0.12, 0.1), door);
      glass = win * (1.0 - lines(wx, 160.0, 20.0, px));
    } else {
      float bar = step(${f(CORNER_BAR.x0)}, u) * step(u, ${f(CORNER_BAR.x1)});
      float late = step(${f(LATE_SHOP.x0)}, u) * step(u, ${f(LATE_SHOP.x1)});
      float kind = bar > 0.5 ? 2.0 : (late > 0.5 ? 3.0 : floor(fract(seed * 23.3) * 3.0));
      vec3 front = vec3(0.12, 0.22, 0.17);
      float pick = fract(seed * 31.7);
      if (pick < 0.2) front = vec3(0.32, 0.08, 0.08);
      else if (pick < 0.4) front = vec3(0.09, 0.12, 0.22);
      else if (pick < 0.6) front = vec3(0.06, 0.06, 0.06);
      else if (pick < 0.75) front = vec3(0.72, 0.68, 0.58);
      if (bar > 0.5) front = vec3(0.3, 0.06, 0.07);
      // Pilasters at either end, the fascia board along the top (signs without words), the opening between.
      float pil = 1.0 - band(u, u0 + 320.0, u1 - 320.0, px);
      float fascia = band(h, 3300.0, 4050.0, px);
      c = mix(c, front * (1.0 - 0.25 * band(h, 3330.0, 3360.0, px)), max(pil * 0.85, fascia));
      if (pil < 0.5 && h < 3300.0) {
        if (kind < 0.5) {
          // A roller shutter down for the night, its box over it.
          c = vec3(0.45, 0.46, 0.45) * (1.0 - 0.3 * lines(h, 85.0, 20.0, px)) * (0.75 + 0.25 * smoothstep(0.0, 1500.0, h)) * (0.85 + 0.15 * vnoise(vec2(u, h) / 800.0));
          c *= 1.0 - 0.25 * band(h, 2950.0, 3300.0, px);
          sharp = 20.0;
          shine = 0.25;
        } else {
          // A shop window: its riser, the glass, the frame bars, the door at one end.
          float riser = 1.0 - smoothstep(470.0 - px, 470.0 + px, h);
          float frame = max(lines(u - u0, 1700.0, 50.0, px), band(h, 2950.0, 3010.0, px));
          c = mix(vec3(0.05), front, max(riser, frame));
          glass = (1.0 - riser) * (1.0 - frame);
          if (kind > 1.5) {
            vec2 sign = neonSign(vec2(u, h) - vec2(${f(CORNER_BAR.neon.x)}, ${f(CORNER_BAR.neon.y - STREET.pavement)}));
            // The tubes: a white-hot line down their middles, their colour round it, and their glow on the glass.
            float tube = 1.0 - smoothstep(11.0, 11.0 + px, sign.x);
            float wine = 1.0 - smoothstep(11.0, 11.0 + px, sign.y);
            vec3 neon = (uNeon + vec3(0.25) * length(uNeon)) * tube + uNeon * vec3(0.9, 0.2, 0.6) * wine;
            neon += uNeon * (exp(-sign.x / 45.0) * 0.18 + exp(-sign.y / 45.0) * 0.1);
            lit = (kind > 2.5 ? interior(u, h, px, 2.0) : interior(u, h, px, 1.0)) * glass + neon * glass;
            // The late shop's sign: a lit box over its door, a stripe of colour on white.
            if (kind > 2.5) lit += uShopLight * 0.1 * band(h, 3350.0, 4000.0, px) * (0.6 + 0.4 * band(h, 3550.0, 3800.0, px));
          }
        }
      }
    }
  }
  if (glass > 0.0) {
    // Glass: the sky and the street in it, the lamps' glints, whatever is lit behind.
    vec3 r = reflect(v, n);
    float fres = 0.08 + 0.92 * pow(1.0 - abs(dot(v, n)), 4.0);
    c = mix(c, vec3(0.012, 0.014, 0.018), glass);
    emit += (seen(vWorld, r) * fres * 0.8 + lit) * glass;
    sharp = mix(sharp, 160.0, glass);
    shine = mix(shine, 1.0, glass);
  }
  return c;
}
void main() {
  vec3 p = vWorld;
  vec3 n = normalize(vNormal);
  vec3 v = normalize(p - cameraPosition);
  float px = length(fwidth(p));
  float kind = floor(vKind + 0.5);
  vec3 albedo = vColor;
  vec3 emit = vec3(0.0);
  float sharp = 4.0;
  float shine = 0.0;
  if (kind == ${f(KIND.facade)}) {
    albedo = facade(p, n, v, vColor, px, emit, sharp, shine);
  } else if (kind == ${f(KIND.paint)} || kind == ${f(KIND.glass)}) {
    // Paint and glass: the street and the sky in them, more at a slant.
    bool glass = kind > ${f(KIND.paint + 0.5)};
    float fres = (glass ? 0.06 : 0.04) + 0.6 * pow(1.0 - abs(dot(v, n)), 4.0);
    emit += seen(p, reflect(v, n)) * fres;
    sharp = glass ? 200.0 : 70.0;
    shine = glass ? 1.4 : 0.9;
  } else if (kind == ${f(KIND.metal)}) {
    sharp = 24.0;
    shine = 0.3;
  } else if (kind == ${f(KIND.lantern)}) {
    albedo *= 0.6;
    emit += uLantern;
  } else if (kind == ${f(KIND.lens)}) {
    albedo *= 0.5;
    #ifdef MOVING
    emit += vColor * uCarLamp;
    #endif
    sharp = 80.0;
    shine = 1.0;
  } else if (kind == ${f(KIND.leaves)}) {
    albedo *= 0.75 + 0.5 * vnoise(p.xy / 260.0 + p.z / 400.0);
    // Leaves let the lamp's light through: lit from underneath, they glow.
    n = normalize(mix(n, vec3(0.0, -1.0, 0.0), 0.35));
  }
  // Out in the rain things shine.
  shine += uWet * 0.3 * step(0.5, n.y);
  vec3 c = outsideLight(p, n, v, albedo, sharp, shine) + emit;
  gl_FragColor = vec4(hazed(c, p), 1.0);
  #include <colorspace_fragment>
}`;

/** The cars going by: the same car mesh, one per lane, put where the timetable says, in its own colour. */
const CARS_VS = /* glsl */ `
${VERTEX}
attribute float aSlot;
uniform vec4 uCarAt[2];
uniform vec4 uCarLook[2];
void main() {
  vec4 at = aSlot < 0.5 ? uCarAt[0] : uCarAt[1];
  vec4 look = aSlot < 0.5 ? uCarLook[0] : uCarLook[1];
  vec3 q = position;
  q.x *= look.w / ${f(CAR_LENGTH)};
  q.xz *= at.z;
  vec3 w = vec3(at.x, ${f(STREET.road)}, at.y) + q;
  vWorld = w;
  vNormal = normal * vec3(at.z, 1.0, at.z);
  vColor = aKind > ${f(KIND.paint - 0.5)} && aKind < ${f(KIND.paint + 0.5)} ? color * look.rgb : color;
  vKind = aKind;
  vBuilding = aBuilding;
  gl_Position = at.w > 0.0 ? projectionMatrix * viewMatrix * vec4(w, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

/** The lights' glows: each lamp's lantern, the neon's halo, the cars' head and tail lights; wider in mist and rain. */
const GLOW_VS = /* glsl */ `
attribute vec4 aAt;
attribute vec4 aLook;
uniform vec4 uCarAt[2];
uniform vec4 uCarLook[2];
uniform float uLampOn;
uniform float uNeonOn;
uniform float uHeadOn;
uniform float uHalo;
varying vec2 vUv;
varying vec3 vColor;
varying float vSpread;
void main() {
  vec3 at = aAt.xyz;
  float on = aAt.w < -0.5 ? uLampOn : uNeonOn;
  if (aAt.w > -0.5 && aAt.w < 0.5) on = uNeonOn;
  if (aAt.w > 0.5) {
    // A car's lamp: along the car (a share of its length), up, across.
    vec4 car = aAt.w < 1.5 ? uCarAt[0] : uCarAt[1];
    vec4 look = aAt.w < 1.5 ? uCarLook[0] : uCarLook[1];
    at = vec3(car.x + at.x * look.w * car.z, ${f(STREET.road)} + at.y, car.y + at.z * car.z);
    on = step(0.0, car.w) * uHeadOn * min(car.w, 1.0);
  }
  vec4 mv = modelViewMatrix * vec4(at, 1.0);
  float dist = max(-mv.z, 1.0);
  float core = max(aLook.w, dist * 0.0035);
  vSpread = 3.0 + 5.0 * uHalo;
  mv.xy += position.xy * core * vSpread;
  vUv = position.xy * vSpread;
  vColor = aLook.rgb * on;
  gl_Position = on > 0.001 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const GLOW_FS = /* glsl */ `
uniform float uHalo;
varying vec2 vUv;
varying vec3 vColor;
varying float vSpread;
void main() {
  float r = length(vUv);
  if (r > vSpread) discard;
  float core = 1.0 - smoothstep(0.6, 1.0, r);
  float halo = exp(-r * (1.6 - 0.9 * uHalo)) * (0.25 + 0.5 * uHalo) * (1.0 - smoothstep(vSpread * 0.7, vSpread, r));
  gl_FragColor = vec4(vColor * (core + halo), 1.0);
  #include <colorspace_fragment>
}`;

/** Rain: streaks falling on sheets across the street, near and far, lit where they fall through a lamp's light or a car's beam. */
const RAIN_FS = /* glsl */ `
uniform float uTime;
uniform float uRain;
uniform float uWind;
uniform vec3 uAir;
uniform vec3 uLamps[${LAMPS.length}];
uniform vec3 uLampLight;
uniform vec4 uCars[2];
varying vec3 vWorld;
${NOISE}
void main() {
  vec3 p = vWorld;
  // Sheets further off have bigger cells, so the streaks look alike wherever they fall.
  float size = 9.0 + (p.z - 3000.0) * 0.003;
  vec2 q = vec2(p.x + p.y * (0.05 + 0.15 * uWind), p.y + uTime * 7000.0) / vec2(size, size * 50.0);
  vec2 cell = floor(q);
  vec2 fq = fract(q);
  float x = 0.2 + 0.6 * hash21(cell + 4.1);
  float y = hash21(cell + 9.3);
  float wide = fwidth(q.x) * 1.2 + 0.04;
  // Each drop a streak, as the eye sees one falling: long, thin, faint at its ends.
  float streak = (1.0 - smoothstep(0.0, wide, abs(fq.x - x))) * smoothstep(0.0, 0.1, fq.y - y) * (1.0 - smoothstep(0.1, 0.3, fq.y - y));
  float a = streak * step(hash21(cell), uRain * 0.3);
  vec3 lit = uAir;
  for (int i = 0; i < ${LAMPS.length}; i++) {
    vec3 d = p - uLamps[i];
    lit += uLampLight * 0.25 / (1.0 + dot(d, d) * 6e-7);
  }
  for (int i = 0; i < 2; i++) {
    vec4 car = uCars[i];
    if (car.w <= 0.0) continue;
    vec3 d = p - vec3(car.x + car.z * 2300.0, ${f(STREET.road + 650)}, car.y);
    float ahead = max(d.x * car.z, 0.0) / (length(d) + 1.0);
    lit += vec3(1.0, 0.95, 0.86) * car.w * 0.02 * pow(ahead, 6.0) / (1.0 + dot(d, d) * 1e-7);
  }
  // Rain is seen where it is lit: in front of the lamps and the headlamps, hardly at all in the dark between.
  gl_FragColor = vec4(lit, a * clamp(dot(lit, vec3(1.0)), 0.04, 0.4));
  #include <colorspace_fragment>
}`;

export function buildStreet(light: Daylight): SceneBackdrop {
  const scene = new THREE.Scene();
  scene.matrixWorldAutoUpdate = true;
  const row = rowOfBuildings();
  const LIGHTING = lighting(row);

  const u = {
    uSunDir: { value: light.sunDirection },
    uSun: { value: new THREE.Color() },
    uSky: { value: new THREE.Color() },
    uBounce: { value: new THREE.Color() },
    uLamps: { value: LAMPS.map((l) => new THREE.Vector3(l.x, l.y, l.z)) },
    uLampLight: { value: new THREE.Color() },
    uCars: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uNeon: { value: new THREE.Color() },
    uBarLight: { value: new THREE.Color() },
    uShopLight: { value: new THREE.Color() },
    uHomeLight: { value: new THREE.Color() },
    uDark: { value: 0 },
    uLit: { value: 0 },
    uTime: { value: 0 },
    uWet: { value: 0 },
    uRain: { value: 0 },
    uFog: { value: new THREE.Color() },
    uFogDensity: { value: 0 },
    uSkyHigh: { value: new THREE.Color() },
    uSkyLow: { value: new THREE.Color() },
    uByDay: { value: 1 },
    uCarLamp: { value: new THREE.Color() },
    uLantern: { value: new THREE.Color() },
    uCarAt: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uCarLook: { value: [new THREE.Vector4(1, 1, 1, CAR_LENGTH), new THREE.Vector4(1, 1, 1, CAR_LENGTH)] },
  };

  // The sky.
  const skyUniforms = { uSkyHigh: u.uSkyHigh, uSkyLow: u.uSkyLow, uStars: { value: 0 }, uCloud: { value: 0 }, uTime: u.uTime, uGlow: { value: new THREE.Color() }, uSunDir: u.uSunDir, uSunColor: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2_000_000, 24, 12), new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false }));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // The ground: the pavements, the kerbs' faces, the road, the far pavement, the side street, and a dark plain under everything beyond.
  const ground = new THREE.Mesh(groundGeometry(), new THREE.ShaderMaterial({ uniforms: u, vertexShader: `varying vec3 vWorld; varying vec3 vNormal; void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; vNormal = normal; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0); }`, fragmentShader: `${LIGHTING}\n${GROUND_FS}` }));
  freeze(ground);
  scene.add(ground);

  // The buildings and everything standing, merged.
  const pieces = new Pieces();
  buildBuildings(pieces, row);
  buildProps(pieces);
  const solids = new THREE.Mesh(pieces.merge(), new THREE.ShaderMaterial({ uniforms: u, vertexShader: SURFACE_VS, fragmentShader: `${LIGHTING}\n${SOLID_FS}`, vertexColors: true }));
  freeze(solids);
  scene.add(solids);

  // The cars going by.
  const one = new Pieces();
  car(one, CAR_LENGTH, "#ffffff", 0, 0, 0);
  const body = one.merge();
  const carGeometry = new THREE.InstancedBufferGeometry();
  for (const name of Object.keys(body.attributes)) carGeometry.setAttribute(name, body.attributes[name]);
  carGeometry.setAttribute("aSlot", new THREE.InstancedBufferAttribute(new Float32Array([0, 1]), 1));
  carGeometry.instanceCount = 2;
  const cars = new THREE.Mesh(carGeometry, new THREE.ShaderMaterial({ defines: { MOVING: 1 }, uniforms: u, vertexShader: CARS_VS, fragmentShader: `${LIGHTING}\n${SOLID_FS}`, vertexColors: true }));
  cars.frustumCulled = false;
  freeze(cars);
  scene.add(cars);

  // The glows: the lamps (slot -1), the neon (0), each car's two head and two tail lights (slot 1 or 2: along, up, across).
  const at: number[] = [];
  const look: number[] = [];
  for (const l of LAMPS) {
    at.push(l.x, l.y, l.z, -1);
    look.push(LAMP.r * 1.6, LAMP.g * 1.6, LAMP.b * 1.6, 150);
  }
  at.push(CORNER_BAR.neon.x, CORNER_BAR.neon.y, STREET.facades - 150, 0);
  look.push(NEON.r * 0.12, NEON.g * 0.12, NEON.b * 0.12, 500);
  for (const slot of [1, 2]) {
    for (const s of [-1, 1]) {
      at.push(0.505, 650, s * 620, slot);
      look.push(3, 2.9, 2.7, 70);
      at.push(-0.505, 760, s * 620, slot);
      look.push(1.6, 0.05, 0.03, 50);
    }
  }
  const glowGeometry = new THREE.InstancedBufferGeometry();
  glowGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  glowGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  glowGeometry.setAttribute("aAt", new THREE.InstancedBufferAttribute(new Float32Array(at), 4));
  glowGeometry.setAttribute("aLook", new THREE.InstancedBufferAttribute(new Float32Array(look), 4));
  glowGeometry.instanceCount = at.length / 4;
  const glowUniforms = { uCarAt: u.uCarAt, uCarLook: u.uCarLook, uLampOn: { value: 0 }, uNeonOn: { value: 0 }, uHeadOn: { value: 0 }, uHalo: { value: 0 } };
  const glow = new THREE.Mesh(
    glowGeometry,
    new THREE.ShaderMaterial({ uniforms: glowUniforms, vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor }),
  );
  glow.frustumCulled = false;
  glow.renderOrder = 5;
  freeze(glow);
  scene.add(glow);

  // The rain: four sheets across the street, from the pavement outside to the far side.
  const sheets: THREE.BufferGeometry[] = [];
  for (const z of [4300, 7600, 11_800, 16_500]) sheets.push(new THREE.PlaneGeometry(70_000, 9000).rotateY(Math.PI).translate(0, STREET.road + 4500, z));
  const rainUniforms = { uTime: u.uTime, uRain: u.uRain, uWind: { value: 0 }, uAir: { value: new THREE.Color() }, uLamps: u.uLamps, uLampLight: u.uLampLight, uCars: u.uCars };
  const rain = new THREE.Mesh(mergeSheets(sheets), new THREE.ShaderMaterial({ uniforms: rainUniforms, vertexShader: `varying vec3 vWorld; void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0); }`, fragmentShader: RAIN_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  rain.frustumCulled = false;
  rain.renderOrder = 4;
  rain.visible = false;
  freeze(rain);
  scene.add(rain);

  const scratch = new THREE.Color();
  return {
    scene,
    update(time, camera, daylight, weather) {
      sky.position.copy(camera.position);
      sky.updateMatrixWorld();
      const t = traffic(time, daylight, weather);
      const dark = t.dark;
      const day = 1 - dark;
      u.uTime.value = time;
      // Lit windows show after dark, and a few on a grey day.
      u.uDark.value = Math.max(dark, 0.35 * weather.cloud);
      const up = THREE.MathUtils.smoothstep(daylight.sunDirection.y, -0.02, 0.12);
      u.uSun.value.copy(daylight.sunColor).multiplyScalar(1.7 * day * up * (1 - 0.85 * weather.cloud) * (1 - 0.6 * weather.mist));
      u.uSkyHigh.value.copy(daylight.middle);
      u.uSkyLow.value.copy(daylight.haze);
      // The sky's light, and at night the city's own glow; the sunlit street throws some back up.
      u.uSky.value.copy(daylight.middle).lerp(daylight.haze, 0.55);
      const lum = u.uSky.value.r * 0.3 + u.uSky.value.g * 0.59 + u.uSky.value.b * 0.11;
      u.uSky.value.lerp(scratch.setRGB(lum, lum, lum * 1.03), 0.8 * weather.cloud).multiplyScalar(0.12 + 0.3 * day).add(scratch.setRGB(0.012, 0.011, 0.012).multiplyScalar(dark));
      u.uBounce.value.copy(daylight.sunColor).multiplyScalar(0.14 * day * up * (1 - 0.7 * weather.cloud)).add(scratch.copy(u.uSky.value).multiplyScalar(0.4));
      u.uLampLight.value.copy(LAMP).multiplyScalar(13 * t.lamps);
      u.uNeon.value.copy(NEON).multiplyScalar(1.4 * t.neon);
      u.uBarLight.value.copy(BAR).multiplyScalar(5 * dark);
      u.uShopLight.value.copy(SHOP).multiplyScalar(7 * dark);
      u.uHomeLight.value.copy(HOME).multiplyScalar(1.5 * dark);
      u.uLit.value = 0.05 + 0.4 * dark + 0.1 * weather.cloud;
      u.uWet.value = weather.wet;
      u.uRain.value = weather.rain;
      u.uByDay.value = day > 0.5 ? 1 : 0;
      u.uLantern.value.copy(LAMP).multiplyScalar(1.15 * t.lamps);
      u.uCarLamp.value.setScalar(1.6 * t.headlamps);
      // Mist and rain bring the far side in, and glow where the lamps light them.
      u.uFogDensity.value = 1 / 400_000 + weather.mist / 28_000 + weather.rain / 90_000;
      u.uFog.value.copy(daylight.haze).lerp(scratch.copy(LAMP).multiplyScalar(0.05 * t.lamps), dark * (0.5 + 0.5 * weather.mist));
      for (let i = 0; i < t.cars.length; i++) {
        const c = t.cars[i];
        u.uCars.value[i].set(c.x, c.z, c.heading, c.on * t.headlamps);
        u.uCarAt.value[i].set(c.x, c.z, c.heading, c.on);
        scratch.set(PAINTS[c.look % PAINTS.length]);
        u.uCarLook.value[i].set(scratch.r, scratch.g, scratch.b, c.length);
      }
      skyUniforms.uStars.value = daylight.stars;
      skyUniforms.uCloud.value = weather.cloud;
      skyUniforms.uSunColor.value.copy(daylight.sunColor).multiplyScalar(day * up);
      skyUniforms.uGlow.value.setRGB(0.09, 0.05, 0.03).multiplyScalar(dark * (1 + weather.mist));
      glowUniforms.uLampOn.value = t.lamps;
      glowUniforms.uNeonOn.value = t.neon;
      glowUniforms.uHeadOn.value = t.headlamps;
      glowUniforms.uHalo.value = Math.min(1, weather.mist + weather.rain * 0.6);
      rain.visible = weather.rain > 0.01;
      rainUniforms.uWind.value = weather.wind;
      rainUniforms.uAir.value.copy(daylight.haze).multiplyScalar(0.35);
    },
  };
}

/** The ground's surfaces: pavements, kerbs' faces and the road, out to the street's ends; the side street's setts down to its end. */
function groundGeometry() {
  const reach = STREET.reach;
  const flat = (x0: number, x1: number, z0: number, z1: number, y: number) => new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const face = (z: number, facing: number) => new THREE.PlaneGeometry(reach * 2, STREET.pavement - STREET.road).rotateY(facing > 0 ? Math.PI : 0).translate(0, (STREET.pavement + STREET.road) / 2, z);
  const parts = [
    flat(-reach, reach, STREET.front, STREET.kerb, STREET.pavement),
    face(STREET.kerb, -1),
    flat(-reach, reach, STREET.kerb, STREET.farKerb, STREET.road),
    face(STREET.farKerb, 1),
    flat(-reach, reach, STREET.farKerb, STREET.facades, STREET.pavement),
    flat(STREET.side.x0, STREET.side.x1, STREET.facades, 76_000, STREET.pavement),
  ];
  return mergeSheets(parts);
}

function mergeSheets(parts: THREE.BufferGeometry[]) {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const g of parts) {
    const flat = g.toNonIndexed();
    positions.push(...(flat.attributes.position.array as Float32Array));
    normals.push(...(flat.attributes.normal.array as Float32Array));
    flat.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return out;
}
