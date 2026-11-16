// The street's shading, shared by its ground, its buildings and things, and
// the cars going by: light by day from the sun and the sky, shadows the rows
// of buildings cast, light at night from the street lamps, the headlamps, the
// neon and the lit shops, the lit windows that come and go through the
// night, and the haze of distance, mist and rain.

import { CORNER_BAR, LAMPS, LATE_SHOP, STREET } from "./layout.ts";
import type { Building } from "./buildings.ts";

export const f = (n: number) => n.toFixed(1);

/** How tall the shops' floor is, and each storey over it (mm). */
export const SHOP_FLOOR = 4200;
export const STOREY = 3100;

export const VERTEX = /* glsl */ `
attribute float aKind;
attribute vec4 aBuilding;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vKind;
varying vec4 vBuilding;
`;

export const NOISE = /* glsl */ `
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
// 1 inside [a, b], with edges w wide.
float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
`;

/** The row of buildings across, as a function of x: (x0, x1, its top, its seed); a top of 0 is the side street's mouth. */
function rowGlsl(row: readonly Building[]) {
  const lines = row.slice(0, -1).map((b) => `  if (x < ${f(b.x1)}) return vec4(${f(b.x0)}, ${f(b.x1)}, ${f(b.top)}, ${b.seed.toFixed(4)});`);
  const last = row[row.length - 1];
  return `vec4 rowAt(float x) {\n${lines.join("\n")}\n  return vec4(${f(last.x0)}, ${f(last.x1)}, ${f(last.top)}, ${last.seed.toFixed(4)});\n}`;
}

export function lighting(row: readonly Building[]) {
  return /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSun;
uniform vec3 uSky;
uniform vec3 uBounce;
uniform vec3 uLamps[${LAMPS.length}];
uniform vec3 uLampLight;
uniform vec4 uCars[2];
uniform vec3 uNeon;
uniform vec3 uBarLight;
uniform vec3 uShopLight;
uniform vec3 uHomeLight;
uniform float uDark;
uniform float uLit;
uniform float uTime;
uniform float uWet;
uniform float uRain;
uniform vec3 uFog;
uniform float uFogDensity;
uniform vec3 uSkyHigh;
uniform vec3 uSkyLow;
${NOISE}
${rowGlsl(row)}

// Whether the window in a cell of a building is lit now: each keeps its own hours, on and off every quarter of an hour or so, more of them in the evening.
float windowLit(vec2 cell, float seed) {
  float h = hash21(cell + seed * 37.0);
  float period = 500.0 + 1100.0 * hash21(cell * 1.3 + seed * 5.0);
  float era = floor(uTime / period + h * 7.0);
  return step(hash21(cell * 0.7 + vec2(era * 3.1, seed * 11.0)), uLit);
}

// The sun's light on p: the rows either side of the street shade it.
float sunlit(vec3 p) {
  vec3 s = uSunDir;
  float lit = 1.0;
  if (s.z > 0.02 && p.z < ${f(STREET.facades - 5)}) {
    float t = (${f(STREET.facades)} - p.z) / s.z;
    vec3 h = p + s * t;
    lit = smoothstep(-200.0, 200.0, h.y - rowAt(h.x).z);
  }
  if (s.z < -0.02 && p.z > ${f(STREET.front + 5)} && p.z < ${f(STREET.facades)}) {
    float t = (${f(STREET.front)} - p.z) / s.z;
    lit = smoothstep(-200.0, 200.0, p.y + s.y * t - ${f(STREET.nearRow)});
  }
  return lit;
}

// A light at l, this strong at a metre, on p facing n: diffuse into d, a highlight of this sharpness into sp.
void pointLight(vec3 p, vec3 n, vec3 v, vec3 l, vec3 colour, float sharp, inout vec3 d, inout vec3 sp) {
  vec3 to = l - p;
  float dd = dot(to, to) * 1e-6;
  to = normalize(to);
  float k = 1.0 / (dd + 0.6);
  d += colour * max(dot(n, to), 0.0) * k;
  sp += colour * pow(max(dot(n, normalize(to - v)), 0.0), sharp) * k * sharp * 0.04;
}

// The light on a point outside: the day's, and at night the lamps', the cars', the neon's and the shops'. v is the way from the camera to it.
vec3 outsideLight(vec3 p, vec3 n, vec3 v, vec3 albedo, float sharp, float shine) {
  vec3 d = uSky * (0.62 + 0.38 * n.y) + uBounce * (0.5 - 0.5 * n.y);
  vec3 sp = vec3(0.0);
  float sun = max(dot(n, uSunDir), 0.0);
  if (sun > 0.0 && uSun.r > 0.001) {
    float lit = sunlit(p);
    d += uSun * sun * lit;
    sp += uSun * pow(max(dot(n, normalize(uSunDir - v)), 0.0), sharp) * lit * sharp * 0.03;
  }
  if (uLampLight.r > 0.0) {
    for (int i = 0; i < ${LAMPS.length}; i++) {
      vec3 l = uLamps[i];
      vec3 to = l - p;
      // Each lantern lights a pool round its foot: most of its light goes down.
      float down = 0.35 + 0.65 * smoothstep(0.0, 0.7, to.y / length(to));
      pointLight(p, n, v, l, uLampLight * down, sharp, d, sp);
    }
  }
  for (int i = 0; i < 2; i++) {
    vec4 car = uCars[i];
    if (car.w <= 0.0) continue;
    vec3 l = vec3(car.x + car.z * 2300.0, ${f(STREET.road + 680)}, car.y);
    vec3 to = normalize(p - l);
    float beam = max(to.x * car.z, 0.0);
    beam *= beam;
    beam *= beam;
    beam *= beam;
    pointLight(p, n, v, l, vec3(1.0, 0.95, 0.86) * (60.0 * beam * car.w), sharp, d, sp);
  }
  if (uNeon.r + uBarLight.r > 0.0) {
    pointLight(p, n, v, vec3(${f(CORNER_BAR.neon.x)}, ${f(CORNER_BAR.neon.y)}, ${f(STREET.facades - 300)}), uNeon, sharp, d, sp);
    // The shops lit inside light the pavement in front of them through their windows.
    if (p.z < ${f(STREET.facades)}) {
      pointLight(p, n, v, vec3(clamp(p.x, ${f(CORNER_BAR.x0)}, ${f(CORNER_BAR.x1)}), ${f(STREET.pavement + 1700)}, ${f(STREET.facades + 900)}), uBarLight, sharp, d, sp);
      pointLight(p, n, v, vec3(clamp(p.x, ${f(LATE_SHOP.x0)}, ${f(LATE_SHOP.x1)}), ${f(STREET.pavement + 1700)}, ${f(STREET.facades + 900)}), uShopLight, sharp, d, sp);
    }
    // The restaurant's own windows, its one lamp left on.
    if (p.z < ${f(STREET.kerb + 1500)}) pointLight(p, n, v, vec3(clamp(p.x, -4000.0, 3600.0), 1600.0, 1800.0), uHomeLight, sharp, d, sp);
  }
  return albedo * d + sp * shine;
}

vec3 hazed(vec3 c, vec3 p) {
  float k = 1.0 - exp(-length(p - cameraPosition) * uFogDensity);
  return mix(c, uFog, k);
}
`;
}
