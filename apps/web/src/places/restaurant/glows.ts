// What glows in the dark room, as the eye sees a light: a soft glow round
// the lit pendant's diffuser, the exit sign, the fridge's glass doors, the
// heat lamps and the strip light in the kitchen; and, far behind a fly the
// camera is focused on, each a disc of light out of focus. One instanced
// draw, added over what is behind it.

import * as THREE from "three";
import { PASS } from "@fly/world";
import { freeze } from "../../scene/build.ts";
import { EXIT, FRIDGE, HEAT, KITCHEN, PENDANT_LIGHT } from "./plan.ts";

const VS = /* glsl */ `
attribute vec3 aPos;
attribute vec3 aColor;
/** Its size (mm), whether it is a glow round a light (1) or the light itself, out of focus (0), and what lights it: the pendant (0), always on (1), the night (2). */
attribute vec3 aInfo;
uniform float uPendant;
uniform float uNight;
uniform float uFocus;
varying vec2 vUv;
varying vec3 vColor;
varying float vRing;
void main() {
  vUv = position.xy;
  float on = aInfo.z < 0.5 ? uPendant : (aInfo.z < 1.5 ? 1.0 : uNight);
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  float dist = max(-mv.z, 1.0);
  float size = aInfo.x;
  vRing = 0.0;
  if (aInfo.y < 0.5) {
    // Focused on the fly, a light far behind it spreads into a disc about as big on screen whatever its distance, larger the closer the camera is to the fly.
    float blur = clamp(1.4 * abs(1.0 / uFocus - 1.0 / dist), 0.0, 0.05);
    size = (blur * aInfo.x + 0.002) * dist;
    on *= 0.004 / (blur + 0.004) + 0.1;
    vRing = smoothstep(0.004, 0.02, blur);
  }
  mv.xy += position.xy * size;
  // A glow is light in the air round its lamp: brought forward of the lamp itself, so the lamp doesn't cut it in two.
  if (aInfo.y > 0.5) mv.z = min(mv.z + size * 0.6, -1.0);
  gl_Position = projectionMatrix * mv;
  vColor = aColor * on;
}`;

const FS = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vRing;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  // Out of focus: a disc, a little brighter at its rim; in focus, a soft glow.
  float disc = smoothstep(1.0, 0.82, r) * (0.7 + 0.3 * smoothstep(0.55, 0.92, r));
  float glow = exp(-r * r * 5.0);
  gl_FragColor = vec4(vColor * mix(glow, disc, vRing), 1.0);
}`;

type Glow = { x: number; y: number; z: number; color: THREE.ColorRepresentation; size: number; halo?: boolean; by: "pendant" | "always" | "night" };

export function buildGlows(night: { value: number }) {
  const list: Glow[] = [];
  const p = PENDANT_LIGHT;
  // The lit pendant: its diffuser, and the light it spreads in the air under the shade.
  list.push({ x: p.x, y: p.y - 6, z: p.z, color: "#ffd8a8", size: 0.9, by: "pendant" });
  list.push({ x: p.x, y: p.y - 30, z: p.z, color: "#5a3a1c", size: 380, halo: true, by: "pendant" });
  // The exit sign's face, just in front of it.
  list.push({ x: (EXIT.x0 + EXIT.x1) / 2, y: (EXIT.y0 + EXIT.y1) / 2, z: EXIT.z - 12, color: "#0c5a22", size: 260, halo: true, by: "always" });
  list.push({ x: (EXIT.x0 + EXIT.x1) / 2, y: (EXIT.y0 + EXIT.y1) / 2, z: EXIT.z - 12, color: "#30ff80", size: 0.5, by: "always" });
  // The fridge's glass doors, glowing cool behind the bar.
  for (let z = FRIDGE.z0 + 200; z < FRIDGE.z1; z += 450) list.push({ x: FRIDGE.x + 25, y: (FRIDGE.y0 + FRIDGE.y1) / 2, z, color: "#16222e", size: 520, halo: true, by: "always" });
  // The heat lamps' elements, a dull red under the pass's head, and the kitchen's strip light beyond.
  for (const x of [HEAT.x0 + 250, PASS.shelf.x, HEAT.x1 - 250]) list.push({ x, y: HEAT.y - 20, z: (HEAT.z0 + HEAT.z1) / 2, color: "#3a0c04", size: 240, halo: true, by: "night" });
  list.push({ x: (KITCHEN.x0 + KITCHEN.x1) / 2, y: KITCHEN.ceiling - 60, z: KITCHEN.line.z, color: "#1a2630", size: 900, halo: true, by: "always" });

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  const pos = new Float32Array(list.length * 3);
  const color = new Float32Array(list.length * 3);
  const info = new Float32Array(list.length * 3);
  const c = new THREE.Color();
  list.forEach((g, i) => {
    pos.set([g.x, g.y, g.z], i * 3);
    c.set(g.color);
    color.set([c.r, c.g, c.b], i * 3);
    info.set([g.size, g.halo ? 1 : 0, g.by === "pendant" ? 0 : g.by === "always" ? 1 : 2], i * 3);
  });
  geometry.setAttribute("aPos", new THREE.InstancedBufferAttribute(pos, 3));
  geometry.setAttribute("aColor", new THREE.InstancedBufferAttribute(color, 3));
  geometry.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 3));
  geometry.instanceCount = list.length;
  const pendant = { value: 0 };
  const focus = { value: 300 };
  const material = new THREE.ShaderMaterial({ uniforms: { uPendant: pendant, uNight: night, uFocus: focus }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  freeze(mesh);
  return {
    mesh,
    /** How lit the pendant is (0 to 1), and how far the camera is focused (mm: from it to the fly). */
    update(lit: number, focusAt: number) {
      pendant.value = lit;
      focus.value = Math.max(5, focusAt);
    },
  };
}
