// Soap bubbles drifting over the table on the breeze, in one instanced draw.
// They are part of the fly's world, not decoration painted over it: a bubble
// drifting close grows in the fly's eyes like anything else, and one that
// touches something pops.

import * as THREE from "three";
import type { Looming } from "@fly/body";
import type { World } from "@fly/world";
import { random } from "./build.ts";

const VS = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;
void main() {
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = -mv.xyz;
  vLocal = normal;
  gl_Position = projectionMatrix * mv;
}`;

const FS = /* glsl */ `
uniform vec3 light;
uniform float time;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);
  float facing = clamp(dot(n, v), 0.0, 1.0);
  float rim = pow(1.0 - facing, 2.2);
  // Thin-film colours, swirling slowly.
  vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + rim * 1.6 + vLocal.y * 0.35 + time * 0.04));
  vec3 c = mix(vec3(0.88, 0.96, 1.0), film, 0.55);
  vec3 h = normalize(light + v);
  float spec = pow(max(dot(n, h), 0.0), 160.0) * 1.8 + pow(max(dot(n, h), 0.0), 16.0) * 0.12;
  vec3 h2 = normalize(vec3(-light.x, -light.y * 0.3, light.z) + v);
  float spec2 = pow(max(dot(n, h2), 0.0), 50.0) * 0.4;
  float alpha = clamp(rim * 0.8 + 0.04 + spec + spec2, 0.0, 1.0);
  gl_FragColor = vec4(c * (0.6 + rim * 0.6) + vec3(spec + spec2), alpha);
}`;

type Bubble = { x: number; y: number; z: number; r: number; phase: number; speed: number; age: number; popping: number };

/** How many bubbles drift at once. */
export const BUBBLES = 12;
/** The breeze they drift on, mm/s (toward +x and a little toward the lake). */
const BREEZE = { x: 38, z: -9 };

export class Bubbles {
  readonly mesh: THREE.InstancedMesh;
  /** As things the fly could see looming, refreshed each frame. */
  readonly looming: Looming[] = [];
  /** Bubbles that popped this frame, for a sound and a sparkle: their positions. */
  readonly popped: THREE.Vector3[] = [];
  #bubbles: Bubble[] = [];
  #rnd = random(23);
  #uniforms = { light: { value: new THREE.Vector3() }, time: { value: 0 } };
  #order: number[] = [];
  #distance = new Float64Array(BUBBLES);
  #world: World;
  #pool = Array.from({ length: BUBBLES }, () => new THREE.Vector3());

  constructor(parent: THREE.Object3D, world: World) {
    this.#world = world;
    const material = new THREE.ShaderMaterial({ uniforms: this.#uniforms, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 24, 16), material, BUBBLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    parent.add(this.mesh);
    for (let i = 0; i < BUBBLES; i++) {
      const b = this.#spawn();
      // Spread out along their path at the start.
      b.x += this.#rnd.range(0, 900);
      this.#bubbles.push(b);
      this.looming.push({ id: 1000 + i, position: { x: 0, y: 0, z: 0 }, r: b.r });
      this.#order.push(i);
    }
  }

  #spawn(into?: Bubble): Bubble {
    const rnd = this.#rnd;
    const b = into ?? { x: 0, y: 0, z: 0, r: 0, phase: 0, speed: 0, age: 0, popping: 0 };
    b.x = -520 + rnd.range(-80, 0);
    b.z = rnd.range(-260, 260);
    b.y = rnd.range(25, 260);
    b.r = rnd.range(6, 26);
    b.phase = rnd.range(0, Math.PI * 2);
    b.speed = rnd.range(0.7, 1.3);
    b.age = 0;
    b.popping = 0;
    return b;
  }

  /** Pops the bubble nearest a point, if one is within `reach` of its skin (a puff, a tool). */
  popNear(point: THREE.Vector3Like, reach: number) {
    for (const b of this.#bubbles) {
      if (b.popping > 0) continue;
      if (Math.hypot(b.x - point.x, b.y - point.y, b.z - point.z) < b.r + reach) b.popping = 0.001;
    }
  }

  update(time: number, dt: number, camera: THREE.Camera, sun: THREE.Vector3, gust: THREE.Vector3Like) {
    this.#uniforms.time.value = time;
    this.#uniforms.light.value.copy(sun).transformDirection(camera.matrixWorldInverse);
    this.popped.length = 0;
    const world = this.#world;
    for (let i = 0; i < this.#bubbles.length; i++) {
      const b = this.#bubbles[i];
      b.age += dt;
      if (b.popping > 0) {
        b.popping += dt;
        if (b.popping > 0.12) this.#spawn(b);
        continue;
      }
      b.x += (BREEZE.x * b.speed + gust.x * 0.4) * dt;
      b.z += (BREEZE.z * b.speed + gust.z * 0.4 + Math.sin(time * 0.3 + b.phase) * 10) * dt;
      b.y += (Math.sin(time * 0.5 + b.phase) * 6 + gust.y * 0.4 - 2) * dt;
      // Touching the table or anything on it pops it.
      if (b.y - b.r < world.heightAt(b.x, b.z) + 0.5 || b.y < b.r) {
        b.popping = 0.001;
        const v = this.#pool[i].set(b.x, b.y, b.z);
        this.popped.push(v);
      }
      if (b.x > 640 || Math.abs(b.z) > 700) this.#spawn(b);
    }
    // Far to near, for the transparency.
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const bubbles = this.#bubbles;
    const order = this.#order;
    const d = this.#distance;
    for (let i = 0; i < bubbles.length; i++) d[i] = (bubbles[i].x - cx) ** 2 + (bubbles[i].y - cy) ** 2 + (bubbles[i].z - cz) ** 2;
    // Insertion sort, far to near: a dozen bubbles, nearly in order from the last frame.
    for (let i = 1; i < order.length; i++) {
      const k = order[i];
      let j = i - 1;
      while (j >= 0 && d[order[j]] < d[k]) {
        order[j + 1] = order[j];
        j--;
      }
      order[j + 1] = k;
    }
    const m = this.mesh.instanceMatrix.array as Float32Array;
    for (let k = 0; k < this.#order.length; k++) {
      const b = bubbles[this.#order[k]];
      const wobble = 1 + Math.sin(time * 3 + b.phase) * 0.02;
      const r = b.popping > 0 ? b.r * (1 + b.popping * 4) : b.r;
      const o = k * 16;
      m[o] = r * wobble;
      m[o + 5] = r / wobble;
      m[o + 10] = r * wobble;
      m[o + 15] = 1;
      m[o + 12] = b.x;
      m[o + 13] = b.popping > 0 ? -1e6 * (b.popping > 0.04 ? 1 : 0) + b.y : b.y;
      m[o + 14] = b.z;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      const l = this.looming[i];
      l.position.x = b.x;
      l.position.y = b.popping > 0 ? -1e4 : b.y;
      l.position.z = b.z;
      l.r = b.r;
    }
  }
}
