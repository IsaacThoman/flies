// Glass and water: the window's panes, the bottle, the drops on the sill and
// on the glass.

import * as THREE from "three";
import { LAMP } from "./light.ts";
import { NOISE } from "./surfaces.ts";

const f = (n: number) => n.toFixed(1);

/**
 * The window's panes, seen from the room. Glass hardly shows by day: a faint
 * reflection of the room, more at a glancing angle, and the dust and a
 * smear on it lit up when the sun is behind them. At night, with the dark
 * outside, it is a mirror of the warm room with the lamp in it. On cold
 * mornings and evenings it mists at its foot. In the rain, drops bead on the
 * outside of the pane and run down it, and when it has been raining it stays
 * streaked where they ran.
 */
export function windowGlass() {
  const uniforms = {
    uSun: { value: new THREE.Vector3(0, 1, -1) },
    uSunColor: { value: new THREE.Color() },
    uNight: { value: 0 },
    uMist: { value: 0 },
    uRoom: { value: new THREE.Color("#e0c8a0") },
    uLampColor: { value: new THREE.Color("#ffd29a") },
    uRain: { value: 0 },
    uWet: { value: 0 },
    uTime: { value: 0 },
    /** The light outside, as a drop shows it (a drop is a lens: the sky in it is at its foot). */
    uOutside: { value: new THREE.Color() },
    /** The glint in each drop: the sky's by day, the lamp's at night. */
    uGlint: { value: new THREE.Color() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform float uNight;
uniform float uMist;
uniform vec3 uRoom;
uniform vec3 uLampColor;
uniform float uRain;
uniform float uWet;
uniform float uTime;
uniform vec3 uOutside;
uniform vec3 uGlint;
varying vec3 vWorld;
${NOISE}
// A drop at d (its own coordinates, 1 at its edge, y up): how much of the pixel it covers, and its colour, a lens of the outside: dark round its rim, the sky bright in its lower part (upside down), a glint up on the side the light comes from.
vec4 drop(vec2 d, float aa) {
  float l = length(d);
  aa += 0.02;
  float inside = 1.0 - smoothstep(1.0 - aa, 1.0, l);
  if (inside <= 0.0) return vec4(0.0);
  float rim = smoothstep(0.45, 0.95, l);
  vec3 c = uOutside * mix(0.55, 1.25, smoothstep(0.3, -0.7, d.y)) * (1.0 - rim * 0.65);
  c += uGlint * (1.0 - smoothstep(0.0, 0.22, length(d - vec2(-0.32, 0.45)))) * 1.4;
  // In the dark a drop is seen by its glint, its body hardly at all.
  float body = (0.55 + 0.4 * rim) * (1.0 - 0.7 * uNight);
  float glint = 1.0 - smoothstep(0.0, 0.22, length(d - vec2(-0.32, 0.45)));
  return vec4(c, inside * max(body, glint * 0.9));
}
// Rain on the outside of the pane, at p (mm in its plane): beads that sit, more of them the wetter it is, and drops running down, as many as it rains, each leaving a wet trail.
vec4 rain(vec2 p) {
  vec4 out4 = vec4(0.0);
  // A pixel's size here, mm: taken once, as derivatives inside branches are not to be trusted.
  float px = length(fwidth(p));
  // Beads, in cells 6 mm across: one in some cells, a millimetre or two across.
  vec2 cell = floor(p / 6.0);
  float h = hash21(cell);
  if (h < uWet * 0.55) {
    vec2 o = vec2(hash21(cell + 7.1), hash21(cell + 3.3)) * 2.4 + 1.8;
    float r = 0.5 + 1.2 * hash21(cell + 1.9);
    vec2 d = (p - cell * 6.0 - o) / vec2(r, r * 1.12);
    out4 = drop(d, px / r);
  }
  // Running drops, one to a column 14 mm wide where it rains enough: each slides down, wavering, at its own pace, and starts again at the top.
  float col = floor(p.x / 14.0);
  float n = hash21(vec2(col, 9.0));
  float x = (col + 0.5 + 0.22 * sin(p.y * 0.045 + n * 30.0)) * 14.0;
  if (n < uRain * 0.7) {
    float speed = 18.0 + 70.0 * hash21(vec2(col, 4.0));
    float y = 560.0 - mod(uTime * speed + n * 900.0, 640.0);
    float r = 1.6 + 1.4 * hash21(vec2(col, 2.0));
    vec2 d = vec2(p.x - x, p.y - y) / vec2(r, r * 1.25);
    // A little flattened underneath, drawn out above: a drop running.
    d.x *= 1.0 + max(d.y, 0.0) * 0.35;
    vec4 running = drop(d, px / r);
    // Its trail: a thin film of water up behind it, thinning out.
    float above = p.y - y;
    float trail = step(0.0, above) * (1.0 - smoothstep(0.0, 140.0 + 200.0 * n, above));
    float width = r * 0.35 * trail;
    float onTrail = (1.0 - smoothstep(width * 0.6, width + px, abs(p.x - x))) * trail;
    if (running.a <= 0.0) running = vec4(uOutside * 1.1, onTrail * 0.3);
    if (running.a > out4.a) out4 = running;
  }
  // Where drops have run, once it has rained: faint streaks down the pane.
  float streak = (1.0 - smoothstep(0.2, 0.9 + px, abs(p.x - x))) * step(n, 0.7) * uWet * 0.12;
  if (streak > out4.a) out4 = vec4(uOutside * 1.1, streak);
  return out4;
}
void main() {
  vec3 v = normalize(vWorld - cameraPosition);
  float facing = abs(v.z);
  float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
  vec3 r = reflect(v, vec3(0.0, 0.0, 1.0));
  // The room behind the camera: the far wall and the floor darker, and at night the lamp's bright spot.
  vec3 room = uRoom * (0.55 + 0.45 * smoothstep(-0.5, 0.3, r.y));
  vec3 toLamp = normalize(vec3(${f(LAMP.x)}, ${f(LAMP.y)}, ${f(LAMP.z)}) - vWorld);
  float lampDot = max(dot(r, toLamp), 0.0);
  room += uLampColor * (pow(lampDot, 2000.0) * 8.0 + pow(lampDot, 60.0) * 0.5) * uNight;
  // Dust, and the smear of a hand, lit from behind by the sun.
  float dust = vnoise(vWorld.xy * 0.07) * vnoise(vWorld.xy * 0.9 + 3.0) * resolved(1.2) + 0.12 * (1.0 - resolved(1.2));
  float smear = smoothstep(0.58, 0.95, vnoise(vWorld.xy * vec2(0.012, 0.022) + 11.0)) * (0.6 + 0.4 * vnoise(vWorld.xy * vec2(0.4, 0.08)));
  float haze = dust * 0.5 + smear * 0.5;
  float day = 1.0 - uNight;
  float behind = pow(max(dot(v, normalize(uSun)), 0.0), 5.0) * day * step(0.0, -uSun.z);
  vec3 glow = uSunColor * haze * behind;
  // The mist's top edge wanders; where a drop has run down through it, the glass is clear.
  float edge = 95.0 + 55.0 * vnoise(vec2(vWorld.x * 0.025, 1.0));
  float mist = uMist * (1.0 - smoothstep(edge - 50.0, edge, vWorld.y)) * (0.65 + 0.35 * vnoise(vWorld.xy * 0.06));
  float run = smoothstep(0.8, 0.84, vnoise(vec2(vWorld.x * 0.22, 3.0))) * (1.0 - smoothstep(edge - 90.0, edge, vWorld.y + 50.0 * vnoise(vec2(vWorld.x * 0.22, 7.0))));
  mist *= 1.0 - run * 0.9;
  // Misted glass is lit by the day behind it, or at night by the kitchen in front.
  vec3 fog = mix(uRoom * 0.55, vec3(0.9, 0.93, 0.95), day);
  float mirror = fresnel * (0.3 + 0.7 * uNight) + uNight * 0.16;
  float a = clamp(mirror + haze * 0.05 + mist * 0.55 + dot(glow, vec3(0.3)) * 0.4, 0.0, 0.92);
  vec3 c = room * mirror + glow + vec3(0.9, 0.93, 0.95) * haze * 0.05 + fog * mist * 0.55;
  // Rain outside the glass, the room's reflection over it as over the pane.
  if (uWet + uRain > 0.0) {
    vec4 wet = rain(vWorld.xy);
    c = c * (1.0 - wet.a) + (wet.rgb + room * mirror) * wet.a;
    a = a + wet.a * (1.0 - a);
  }
  gl_FragColor = vec4(c / max(a, 1e-3), a);
}`,
  });
  return { material, uniforms };
}

/**
 * Water: drops on the sill and on the glass. Clear where you look straight
 * through, mirror-bright at the edge, with the dark band a lens makes of
 * what is behind it.
 */
export function waterMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: "#d8ecf5", roughness: 0.04, transparent: true, envMapIntensity: 2.2, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      /* glsl */ `float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
float edge = pow(1.0 - facing, 2.0);
float lens = smoothstep(0.25, 0.55, 1.0 - facing) * (1.0 - smoothstep(0.75, 0.97, 1.0 - facing));
outgoingLight *= 1.0 - lens * 0.45;
outgoingLight += vec3(0.08, 0.1, 0.12) * (1.0 - edge);
diffuseColor.a = clamp(0.16 + edge * 0.85 + lens * 0.25 + dot(outgoingLight, vec3(0.3)) * 0.15, 0.0, 1.0);
#include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => "windowsill-water";
  return material;
}
