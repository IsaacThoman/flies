// Soap bubbles drifting over the table on the breeze, in one instanced draw.
// They are part of the fly's world, not decoration painted over it: a bubble
// drifting close grows in the fly's eyes like anything else, and one that
// touches something pops. A few small ones bob low past the fly, bursting
// if they dip onto the table or meet anything on it. Walking or flying into
// a bubble bursts it, and the fly feels the film break as a light touch. In
// the rain the drops burst them, and few new ones come.

import * as THREE from "three";
import { FLY_LENGTH } from "@fly/body";
import type { Looming } from "@fly/body";
import { POP_SECONDS } from "@fly/net";
import type { TableBubbles } from "@fly/net";
import { BREEZE, createSurface } from "@fly/world";
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

type Bubble = { x: number; y: number; z: number; r: number; phase: number; speed: number; age: number; popping: number; low: boolean; wait: number };

/** How many bubbles drift at once. */
export const BUBBLES = 12;
/** How many of them drift low, near the fly. */
const LOW = 4;
/** How hard a bubble bursting on the fly touches it (the feather resting is 0.4). */
export const BUBBLE_TOUCH = 0.3;

export class Bubbles {
  readonly mesh: THREE.InstancedMesh;
  /** As things the fly could see looming, refreshed each frame. */
  readonly looming: Looming[] = [];
  #bubbles: Bubble[] = [];
  #rnd = random(23);
  #uniforms = { light: { value: new THREE.Vector3() }, time: { value: 0 } };
  #order: number[] = [];
  #distance = new Float64Array(BUBBLES);
  #world: World;
  #surface = createSurface();
  /** A bubble burst on the fly this frame: how hard it felt it (0 if none). */
  brushed = 0;
  /** Bubbles drift over this place (Scene.bubbles). Without them there is nothing to see or feel of them. */
  enabled = true;
  /** How hard it is raining (the weather's rain, 0 to 1). */
  rain = 0;
  /**
   * At a table with others the high bubbles are the table's, the same on
   * every device (@fly/net, TableBubbles), at its clock (room seconds); this
   * device's fly bursting one is told with `burst`. The low ones that bob
   * past the fly stay each device's own.
   */
  table: { bubbles: TableBubbles; time: number; burst: (slot: number, cycle: number, at: number) => void } | null = null;

  constructor(parent: THREE.Object3D, world: World) {
    this.#world = world;
    const material = new THREE.ShaderMaterial({ uniforms: this.#uniforms, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 24, 16), material, BUBBLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    parent.add(this.mesh);
    for (let i = 0; i < BUBBLES; i++) {
      const b = this.#spawn(undefined, i < LOW ? { x: 0, y: 0, z: 0 } : null);
      // Spread out along their path at the start.
      b.x += this.#rnd.range(0, 900);
      this.#bubbles.push(b);
      this.looming.push({ id: 1000 + i, position: { x: 0, y: 0, z: 0 }, r: b.r });
      this.#order.push(i);
    }
  }

  /** A new bubble upwind: high over the table, or, with `near`, small and low a little upwind of that point. */
  #spawn(into?: Bubble, near: { x: number; y: number; z: number } | null = null): Bubble {
    const rnd = this.#rnd;
    const b = into ?? { x: 0, y: 0, z: 0, r: 0, phase: 0, speed: 0, age: 0, popping: 0, low: false, wait: 0 };
    b.low = near !== null;
    if (near) {
      b.x = near.x - rnd.range(50, 160);
      b.z = near.z + rnd.range(-14, 14);
      b.r = rnd.range(2.2, 6);
      // Over whatever stands there at the fly's height, not over something above it.
      b.y = this.#world.heightAt(b.x, b.z, this.#world.topAbove(b.x, near.y, b.z)) + b.r + rnd.range(1.8, 4);
    } else {
      b.x = -520 + rnd.range(-80, 0);
      b.z = rnd.range(-260, 260);
      b.y = rnd.range(25, 260);
      b.r = rnd.range(6, 26);
    }
    b.phase = rnd.range(0, Math.PI * 2);
    b.speed = rnd.range(0.7, 1.3);
    b.age = 0;
    b.popping = 0;
    b.wait = 0;
    return b;
  }

  /** A bubble that has burst or drifted away comes round again, unless it is raining: then often not for a while. */
  #renew(b: Bubble, fly: THREE.Vector3Like) {
    if (this.#rnd.next() < this.rain) {
      b.popping = Math.max(b.popping, 0.2);
      b.wait = this.#rnd.range(6, 20);
      return;
    }
    this.#spawn(b, b.low ? fly : null);
  }

  /** Pops the bubble nearest a point, if one is within `reach` of its skin (a puff, a tool). */
  popNear(point: THREE.Vector3Like, reach: number) {
    if (!this.enabled) return;
    for (const b of this.#bubbles) {
      // The table's are burst by the table: a ball's path is known to every device.
      if (b.popping > 0 || (this.table && !b.low)) continue;
      if (Math.hypot(b.x - point.x, b.y - point.y, b.z - point.z) < b.r + reach) b.popping = 0.001;
    }
  }

  /** A high bubble at a table with others: where the table's is now, burst as it is, or burst by this fly. */
  #fromTable(i: number, b: Bubble, fly: THREE.Vector3Like) {
    const table = this.table!;
    const slot = i - LOW;
    const s = table.bubbles.slots[slot];
    const t = table.time;
    if (!s) return;
    b.r = s.r;
    b.phase = s.phase;
    if (table.bubbles.alive(s, t)) {
      table.bubbles.position(s, t, b);
      b.popping = 0;
      if (Math.hypot(b.x - fly.x, b.y - fly.y, b.z - fly.z) >= b.r + FLY_LENGTH / 2 || !table.bubbles.pop(slot, s.cycle, t)) return;
      this.brushed = BUBBLE_TOUCH;
      table.burst(slot, s.cycle, t);
    }
    if (s.poppedAt >= 0 && t - s.poppedAt < POP_SECONDS) {
      table.bubbles.position(s, s.poppedAt, b);
      b.popping = t - s.poppedAt + 0.001;
    } else b.popping = 1;
  }

  /** Moves the bubbles on. `fly` is the fly's middle: a bubble that reaches it bursts on it. */
  update(time: number, dt: number, camera: THREE.Camera, sun: THREE.Vector3, gust: THREE.Vector3Like, fly: THREE.Vector3Like) {
    this.#uniforms.time.value = time;
    this.#uniforms.light.value.copy(sun).transformDirection(camera.matrixWorldInverse);
    this.brushed = 0;
    this.mesh.visible = this.enabled;
    if (!this.enabled) return;
    const world = this.#world;
    for (let i = 0; i < this.#bubbles.length; i++) {
      const b = this.#bubbles[i];
      b.age += dt;
      if (this.table && !b.low) {
        this.#fromTable(i, b, fly);
        continue;
      }
      if (b.popping > 0) {
        b.popping += dt;
        b.wait -= dt;
        if (b.popping > 0.12 && b.wait <= 0) this.#renew(b, fly);
        continue;
      }
      b.x += (BREEZE.x * b.speed + gust.x * 0.4) * dt;
      b.z += (BREEZE.z * b.speed + gust.z * 0.4 + Math.sin(time * 0.3 + b.phase) * 10) * dt;
      // Low ones bob without sinking, so most pass the fly before touching the table.
      b.y += ((b.low ? Math.sin(time * 0.5 + b.phase) * 0.6 : Math.sin(time * 0.5 + b.phase) * 6 - 2) + gust.y * 0.4) * dt;
      // Under it, or the top of what it has drifted into.
      const s = world.surface(b.x, b.z, this.#surface, world.topAbove(b.x, b.y, b.z));
      let burst = b.y - b.r < s.y + 0.5 || b.y < b.r;
      // Raindrops hitting it.
      if (!burst && this.rain > 0 && this.#rnd.next() < this.rain * dt * 0.5) burst = true;
      // Into the fly, or the fly into it (the fly about as round as half its length).
      else if (!burst && Math.hypot(b.x - fly.x, b.y - fly.y, b.z - fly.z) < b.r + FLY_LENGTH / 2) {
        burst = true;
        this.brushed = BUBBLE_TOUCH;
      }
      if (burst) {
        b.popping = 0.001;
        continue;
      }
      if (b.x > 640 || Math.abs(b.z) > 700) this.#renew(b, fly);
      // A low one that has drifted well past the fly comes round again.
      else if (b.low && b.x - fly.x > 120) this.#renew(b, fly);
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
