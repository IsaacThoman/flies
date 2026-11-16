// The shop front's glass: the big panes from the ledge to the transom, the
// small ones over it, and the door's, in the plane of the glass, one draw in
// the near pass, drawn after everything opaque. The frames, mullions and
// transom are the room's and stand in front of it, covering its edges.
//
// By day it hardly shows: a faint reflection of the room at a slant. At
// night, with the dark outside, it is a dim mirror of the room, the lamp left
// on over the bar a soft glint in it. In the rain, drops bead on the outside
// and run down, each a little lens with the street's lights in it; after the
// rain it stays streaked where they ran; on a damp day and on cold nights it
// mists at its foot, inside. The drops are millimetres across: close up the
// fly sees each one, from across the room they melt into a sheen.

import * as THREE from "three";
import { PENDANTS, SHOPFRONT } from "@fly/world";
import type { Daylight } from "../../scene/light.ts";
import type { Weather } from "../../scene/weather.ts";
import { NOISE } from "./street/glsl.ts";
import { DOOR_RAIL } from "./street/layout.ts";

const f = (n: number) => n.toFixed(1);
/** The lamp left on over the bar, where its diffuser is. */
const LAMP = { x: PENDANTS.x, y: PENDANTS.bottom, z: PENDANTS.zs[PENDANTS.lit] };

const VS = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FS = /* glsl */ `
uniform float uNight;
uniform float uMist;
uniform vec3 uRoom;
uniform vec3 uLampColor;
uniform float uRain;
uniform float uWet;
uniform float uTime;
uniform vec3 uOutside;
uniform vec3 uGlint;
uniform vec3 uNeon;
varying vec3 vWorld;
${NOISE}
// A drop at d (its own coordinates, 1 at its edge, y up): how much of the pixel it covers, and its colour, a lens of the street: dark round its rim, the street's light in its lower part (upside down), a glint up on one side, now a lamp's, now the neon's.
vec4 drop(vec2 d, float aa, float which) {
  float l = length(d);
  aa += 0.03;
  float inside = 1.0 - smoothstep(1.0 - aa, 1.0, l);
  if (inside <= 0.0) return vec4(0.0);
  float rim = smoothstep(0.45, 0.95, l);
  vec3 c = uOutside * mix(0.55, 1.3, smoothstep(0.3, -0.7, d.y)) * (1.0 - rim * 0.65);
  float glint = 1.0 - smoothstep(0.0, 0.24, length(d - vec2(-0.3, 0.42)));
  float low = 1.0 - smoothstep(0.0, 0.3, length(d - vec2(0.2, -0.5)));
  c += uGlint * glint * 1.5 + mix(uGlint, uNeon, step(0.7, which)) * low * uNight * 0.8;
  // In the dark a drop is seen by its lights, its body hardly at all.
  float body = (0.35 + 0.35 * rim) * (1.0 - 0.8 * uNight);
  return vec4(c, inside * max(body, max(glint, low * uNight) * 0.9));
}
// Rain on the outside of the glass at p (mm in its plane), px a pixel's size there: beads that sit, more of them the wetter it is, and drops running down, as many as it rains, each leaving a wet trail. Smaller than a pixel, they are a sheen.
vec4 rain(vec2 p, float px) {
  vec4 out4 = vec4(0.0);
  vec2 cell = floor(p / 6.0);
  float h = hash21(cell);
  if (h < uWet * 0.55) {
    vec2 o = vec2(hash21(cell + 7.1), hash21(cell + 3.3)) * 2.4 + 1.8;
    float r = 0.5 + 1.2 * hash21(cell + 1.9);
    vec2 d = (p - cell * 6.0 - o) / vec2(r, r * 1.12);
    out4 = drop(d, px / r, hash21(cell + 5.5));
  }
  // Running drops, one to a column 14 mm wide where it rains enough: each slides down, wavering, at its own pace, and starts again at the top.
  float col = floor(p.x / 14.0);
  float n = hash21(vec2(col, 9.0));
  float x = (col + 0.5 + 0.22 * sin(p.y * 0.045 + n * 30.0)) * 14.0;
  if (n < uRain * 0.7) {
    float speed = 25.0 + 90.0 * hash21(vec2(col, 4.0));
    float y = ${f(SHOPFRONT.head + 40)} - mod(uTime * speed + n * 2900.0, ${f(SHOPFRONT.head - SHOPFRONT.ledge.top + 400)});
    float r = 1.6 + 1.4 * hash21(vec2(col, 2.0));
    vec2 d = vec2(p.x - x, p.y - y) / vec2(r, r * 1.25);
    d.x *= 1.0 + max(d.y, 0.0) * 0.35;
    vec4 running = drop(d, px / r, n * 3.0);
    float above = p.y - y;
    float trail = step(0.0, above) * (1.0 - smoothstep(0.0, 160.0 + 260.0 * n, above));
    float width = r * 0.35 * trail;
    float onTrail = (1.0 - smoothstep(width * 0.6, width + px, abs(p.x - x))) * trail;
    if (running.a <= 0.0) running = vec4(uOutside * 1.1, onTrail * 0.3);
    if (running.a > out4.a) out4 = running;
  }
  float streak = (1.0 - smoothstep(0.2, 0.9 + px, abs(p.x - x))) * step(n, 0.7) * uWet * 0.12;
  if (streak > out4.a) out4 = vec4(uOutside * 1.1, streak);
  // From further off the drops are smaller than a pixel: their average, a sheen.
  vec4 sheen = vec4(uOutside * 1.1 + uGlint * 0.08, uWet * 0.08 + uRain * 0.06);
  return mix(out4, sheen, smoothstep(1.2, 5.0, px));
}
void main() {
  vec3 v = normalize(vWorld - cameraPosition);
  float px = length(fwidth(vWorld));
  float facing = abs(v.z);
  float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
  vec3 r = reflect(v, vec3(0.0, 0.0, -1.0));
  // The room behind the camera, dim; at night the lamp over the bar a soft spot in it.
  vec3 room = uRoom * (0.5 + 0.5 * smoothstep(-0.5, 0.3, r.y));
  vec3 toLamp = normalize(vec3(${f(LAMP.x)}, ${f(LAMP.y)}, ${f(LAMP.z)}) - vWorld);
  float lampDot = max(dot(r, toLamp), 0.0);
  room += uLampColor * (pow(lampDot, 900.0) * 3.0 + pow(lampDot, 40.0) * 0.25) * uNight;
  // Dust on the outside, the smear of a hand at door height.
  float dust = vnoise(vWorld.xy * 0.05) * vnoise(vWorld.xy * 0.7 + 3.0);
  float smear = smoothstep(0.62, 0.95, vnoise(vWorld.xy * vec2(0.01, 0.018) + 11.0)) * (1.0 - smoothstep(1300.0, 1700.0, vWorld.y));
  float haze = (dust * 0.5 + smear * 0.5) * mix(1.0, 0.25, smoothstep(2.0, 8.0, px));
  // Mist on the inside: its top edge wanders over the ledge; where a drop has run down through it the glass is clear.
  float edge = ${f(SHOPFRONT.ledge.top + 160)} + 120.0 * vnoise(vec2(vWorld.x * 0.006, 1.0));
  float mist = uMist * (1.0 - smoothstep(edge - 120.0, edge, vWorld.y)) * (0.65 + 0.35 * vnoise(vWorld.xy * 0.03));
  float run = smoothstep(0.8, 0.84, vnoise(vec2(vWorld.x * 0.1, 3.0))) * (1.0 - smoothstep(edge - 200.0, edge, vWorld.y + 90.0 * vnoise(vec2(vWorld.x * 0.1, 7.0))));
  mist *= 1.0 - run * 0.9 * (1.0 - smoothstep(1.5, 4.0, px));
  float day = 1.0 - uNight;
  vec3 fog = mix(uRoom * 0.8, vec3(0.86, 0.88, 0.9), day);
  // The dark glass tints the street a little at night.
  float mirror = fresnel * (0.25 + 0.6 * uNight) + uNight * 0.08;
  float a = clamp(mirror + haze * 0.035 + mist * 0.5, 0.0, 0.92);
  vec3 c = room * mirror + vec3(0.8, 0.82, 0.84) * haze * 0.035 * (day + 0.2) + fog * mist * 0.5;
  if (uWet + uRain > 0.0) {
    vec4 wet = rain(vWorld.xy, px);
    c = c * (1.0 - wet.a) + (wet.rgb + room * mirror) * wet.a;
    a = a + wet.a * (1.0 - a);
  }
  gl_FragColor = vec4(c / max(a, 1e-3), a);
  #include <colorspace_fragment>
}`;

export function buildShopGlass(): { mesh: THREE.Object3D; update(time: number, light: Daylight, weather: Weather): void } {
  const uniforms = {
    uNight: { value: 0 },
    uMist: { value: 0 },
    uRoom: { value: new THREE.Color() },
    uLampColor: { value: new THREE.Color(1.0, 0.78, 0.5) },
    uRain: { value: 0 },
    uWet: { value: 0 },
    uTime: { value: 0 },
    uOutside: { value: new THREE.Color() },
    uGlint: { value: new THREE.Color() },
    uNeon: { value: new THREE.Color(1.0, 0.25, 0.55) },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false });
  const { glass, ledge, door, head } = SHOPFRONT;
  // The panes' openings, facing the room: the windows from the ledge to the head, and the door's.
  const panes = [
    { x0: -4200, x1: door.x0, y0: ledge.top, y1: head },
    { x0: door.x0, x1: door.x1, y0: DOOR_RAIL, y1: head },
  ];
  const positions: number[] = [];
  for (const p of panes) positions.push(p.x1, p.y0, glass, p.x0, p.y0, glass, p.x0, p.y1, glass, p.x1, p.y0, glass, p.x0, p.y1, glass, p.x1, p.y1, glass);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 3;
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  let mist = 0;
  let last = 0;
  const night = new THREE.Color(0.1, 0.07, 0.045);
  const lamp = new THREE.Color(1.0, 0.72, 0.42);
  return {
    mesh,
    update(time, light, weather) {
      const dark = THREE.MathUtils.smoothstep(light.stars, 0.08, 0.6);
      uniforms.uNight.value = dark;
      uniforms.uRoom.value.copy(light.skyColor).multiplyScalar(0.25 * (1 - dark)).lerp(night, dark);
      uniforms.uRain.value = weather.rain;
      uniforms.uWet.value = weather.wet;
      uniforms.uTime.value = time;
      // What a drop shows of the street: the day's light, or at night the dark with its lamps.
      uniforms.uOutside.value.copy(light.haze).lerp(light.middle, 0.4).multiplyScalar(1 - 0.92 * dark);
      uniforms.uGlint.value.setScalar(0.8 * (1 - dark)).lerp(lamp, dark);
      // Cold glass mists at its foot at night and in the morning, and on a damp day.
      const goal = Math.max(light.time === "morning" ? 0.6 : light.time === "night" ? 0.35 : 0, weather.mist * 0.7, weather.wet * 0.4);
      mist += (goal - mist) * Math.min(1, Math.max(0, time - last) * 0.3);
      last = time;
      uniforms.uMist.value = mist;
    },
  };
}
