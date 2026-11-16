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
 * mornings and evenings it mists at its foot.
 */
export function windowGlass() {
  const uniforms = {
    uSun: { value: new THREE.Vector3(0, 1, -1) },
    uSunColor: { value: new THREE.Color() },
    uNight: { value: 0 },
    uMist: { value: 0 },
    uRoom: { value: new THREE.Color("#e0c8a0") },
    uLampColor: { value: new THREE.Color("#ffd29a") },
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
varying vec3 vWorld;
${NOISE}
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
