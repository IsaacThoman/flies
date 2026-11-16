// Visitors to the picnic table. Each is in the fly's world only as something
// it can see (they are on its eyes' layer) or, rarely, feel brushing past;
// none is aimed at it, and the ones that move keep clear of it: a butterfly
// that flutters over and may settle on the fruit a while, a ladybird that
// walks across and around anything standing, and a leaf that comes down on a
// gust and lies where it lands until another blows it away. The table's own
// leaf lifts at its tip when a gust blows.

import * as THREE from "three";
import type { Looming } from "@fly/body";
import { DECOR, TABLE_RADIUS } from "@fly/world";
import type { Vec3, World } from "@fly/world";
import { canvas2d, canvasTexture, freeze, paint } from "../../scene/build.ts";
import { shaded } from "../../scene/shade.ts";

const TAU = Math.PI * 2;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const turnTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export type Gust = { x: number; z: number; strength: number };

/** Hides a visitor until it comes again: off the eyes' and the camera's way. */
function hide(mesh: THREE.Object3D, looming: Looming) {
  mesh.visible = false;
  looming.position.y = -1e4;
}

// The butterfly.

/** One wing's span, mm: a small tortoiseshell's, twenty times the fly. */
const WING = 24;
/** Where a butterfly may settle a while: the tops of the fruit, the jam's cover, the lemonade's lid. */
const PERCHES = [
  { x: 176, z: -12 },
  { x: 18, z: 52 },
  { x: 104, z: -98 },
  { x: -112, z: -64 },
  { x: -128, z: 54 },
];
/** It keeps this far from the fly, mm, and leaves a perch if the fly comes closer. */
const BUTTERFLY_CLEAR = 60;

/** The right forewing and hindwing, painted as a small tortoiseshell: root at the left, front at the top. */
function wingTexture() {
  const S = 256;
  const { canvas, g } = canvas2d(S, S);
  g.scale(2, 2);
  const fore = new Path2D("M0 34 C30 14 70 2 112 6 Q125 9 122 22 C116 40 104 58 92 66 C64 73 30 70 0 62 Z");
  const hind = new Path2D("M0 60 C40 58 80 62 100 80 C108 92 101 110 85 120 C64 130 34 126 16 116 C6 104 0 90 0 74 Z");
  const both = new Path2D();
  both.addPath(fore);
  both.addPath(hind);
  g.save();
  g.clip(both);
  const base = g.createLinearGradient(0, 0, 120, 0);
  base.addColorStop(0, "#d4580c");
  base.addColorStop(0.5, "#f57a12");
  base.addColorStop(1, "#ff9a2e");
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  // Dark at the root, where the body's fur runs onto the wings.
  const root = g.createRadialGradient(0, 64, 0, 0, 64, 44);
  root.addColorStop(0, "rgba(34, 20, 12, 1)");
  root.addColorStop(0.6, "rgba(56, 30, 14, 0.85)");
  root.addColorStop(1, "rgba(56, 30, 14, 0)");
  g.fillStyle = root;
  g.fillRect(0, 0, 128, 128);
  // Black blotches along the forewing's leading edge, a white one by its tip, one more inside.
  g.fillStyle = "#1c120c";
  for (const [x, y, rx, ry, a] of [[42, 14, 8, 7, 0.3], [66, 10, 10, 9, 0.1], [92, 9, 11, 7, -0.1], [56, 40, 5, 6, 0.4], [40, 48, 4, 5, 0]]) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, a, 0, TAU);
    g.fill();
  }
  g.fillStyle = "#fff4dc";
  g.beginPath();
  g.ellipse(108, 16, 5, 3.5, 0.5, 0, TAU);
  g.fill();
  // The dark margin, scalloped, with blue crescents along the hindwing's.
  g.lineWidth = 11;
  g.strokeStyle = "#24160e";
  g.stroke(fore);
  g.stroke(hind);
  g.fillStyle = "#5ab0ff";
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const x = 22 + t * 76;
    const y = 120 - t * 34 - Math.sin(t * Math.PI) * 6;
    g.beginPath();
    g.ellipse(x, y, 2.6, 1.8, -0.5, 0, TAU);
    g.fill();
  }
  g.fillStyle = "#ffcf8a";
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    g.beginPath();
    g.arc(118 - t * 26, 26 + t * 38, 1.3, 0, TAU);
    g.fill();
  }
  g.restore();
  return canvasTexture(canvas);
}

export class Butterfly {
  readonly mesh: THREE.Mesh;
  /** Where its chances come from: its own, or at a shared table the room's for this visit (packages/net), so every device sees the same visit. */
  random: () => number = Math.random;
  readonly looming: Looming = { id: 3001, position: { x: 0, y: -1e4, z: 0 }, r: WING };
  active = false;
  readonly #flap = { value: 0 };
  readonly #p = new THREE.Vector3();
  readonly #v = new THREE.Vector3();
  readonly #to = new THREE.Vector3();
  #legs: { x: number; y: number; z: number; perch: boolean }[] = [];
  #leg = 0;
  #perched = 0;
  #beat = 0;
  #open = 0;
  #heading = 0;

  constructor() {
    // Wings: a quad each side of the body, the right drawn and the left its mirror. The body is a dark spindle with a head.
    const pieces: THREE.BufferGeometry[] = [];
    for (const side of [1, -1]) {
      const wing = new THREE.BufferGeometry();
      wing.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 14, side * WING, 0, 14, side * WING, 0, -13, 0, 0, -13], 3));
      wing.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      wing.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
      wing.setAttribute("aWing", new THREE.Float32BufferAttribute([side, side, side, side], 1));
      wing.setIndex([0, 1, 2, 0, 2, 3]);
      pieces.push(wing.toNonIndexed());
    }
    const body = new THREE.SphereGeometry(1, 10, 6).scale(1.2, 1.1, 9).translate(0, 0, -1).toNonIndexed();
    const head = new THREE.SphereGeometry(1.4, 8, 6).translate(0, 0.2, 8.4).toNonIndexed();
    for (const part of [body, head]) {
      const n = part.attributes.position.count;
      part.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2).fill(0.02).map((v, i) => (i % 2 ? 0.5 : v)), 2));
      part.setAttribute("aWing", new THREE.Float32BufferAttribute(new Float32Array(n), 1));
      pieces.push(part);
    }
    const geometry = mergeAll(pieces);
    const material = shaded(new THREE.MeshLambertMaterial({ map: wingTexture(), alphaTest: 0.5, side: THREE.DoubleSide }));
    const before = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      shader.uniforms.uFlap = this.#flap;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aWing;\nuniform float uFlap;")
        .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nif (aWing != 0.0) objectNormal = vec3(-aWing * sin(uFlap), cos(uFlap), 0.0);")
        // Each wing turns up about the body's long axis.
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nif (aWing != 0.0) { float span = abs(transformed.x); transformed.x = aWing * span * cos(uFlap); transformed.y += span * sin(uFlap); }");
      before(shader, renderer);
    };
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.order = "YXZ";
    this.mesh.visible = false;
  }

  /** Comes in from off the table, over a point or two (perhaps settling on one), and away the other side. */
  start(world: World, fly: Vec3) {
    const a = this.random() * TAU;
    const out = 620;
    const clear = (x: number, z: number) => Math.hypot(x - fly.x, z - fly.z) > BUTTERFLY_CLEAR + 20;
    this.#legs = [];
    const stops = 1 + Math.floor(this.random() * 2.5);
    let perched = false;
    for (let i = 0; i < 20 && this.#legs.length < stops; i++) {
      if (!perched && this.random() < 0.6) {
        const perch = PERCHES[Math.floor(this.random() * PERCHES.length)];
        if (clear(perch.x, perch.z)) {
          // Settling from above it.
          const top = world.heightAt(perch.x, perch.z);
          this.#legs.push({ x: perch.x, y: top + 40, z: perch.z, perch: false });
          this.#legs.push({ x: perch.x, y: top + 0.6, z: perch.z, perch: true });
          perched = true;
          continue;
        }
      }
      const r = Math.sqrt(this.random()) * 250;
      const b = this.random() * TAU;
      const x = Math.cos(b) * r;
      const z = Math.sin(b) * r;
      if (clear(x, z)) this.#legs.push({ x, y: world.heightAt(x, z) + 30 + this.random() * 70, z, perch: false });
    }
    const away = a + Math.PI + (this.random() - 0.5) * 2;
    this.#legs.push({ x: Math.cos(away) * out, y: 120 + this.random() * 80, z: Math.sin(away) * out, perch: false });
    this.#p.set(Math.cos(a) * out, 90 + this.random() * 80, Math.sin(a) * out);
    this.#v.set(0, 0, 0);
    this.#leg = 0;
    this.#perched = 0;
    this.#heading = Math.atan2(-this.#p.x, -this.#p.z);
    this.active = true;
    this.mesh.visible = true;
  }

  step(dt: number, time: number, world: World, fly: Vec3) {
    if (!this.active) return;
    const p = this.#p;
    const leg = this.#legs[this.#leg];
    const near = Math.hypot(p.x - fly.x, p.y - fly.y, p.z - fly.z);
    let wings: number;
    if (this.#perched > 0) {
      // Settled: wings mostly closed up over its back, opened flat now and then to bask.
      this.#perched -= dt;
      if (near < BUTTERFLY_CLEAR) this.#perched = 0;
      if (this.#perched <= 0) this.#leg++;
      this.#open = (this.#open + dt) % 5;
      const basking = this.#open > 3.2 ? Math.sin(((this.#open - 3.2) / 1.8) * Math.PI) : 0;
      wings = 1.45 - basking * 1.35;
      this.#v.set(0, 0, 0);
    } else {
      const to = this.#to.set(leg.x, leg.y, leg.z).sub(p);
      const d = to.length();
      const last = this.#leg === this.#legs.length - 1;
      if (d < (leg.perch ? 1.2 : 12)) {
        if (last) {
          this.active = false;
          hide(this.mesh, this.looming);
          return;
        }
        if (leg.perch) {
          p.set(leg.x, leg.y, leg.z);
          this.#perched = 6 + this.random() * 9;
          this.#open = this.random() * 3;
        } else this.#leg++;
      }
      // Toward the next point, slowing to settle; away from the fly if it is close.
      const speed = leg.perch ? Math.min(200, 40 + d * 2.5) : 210;
      to.multiplyScalar(speed / Math.max(d, 1e-3));
      if (near < BUTTERFLY_CLEAR) to.add(this.#to.set(p.x - fly.x, p.y - fly.y + 20, p.z - fly.z).multiplyScalar(((BUTTERFLY_CLEAR - near) * 10) / Math.max(near, 1)));
      this.#v.lerp(to, Math.min(1, dt * 2.2));
      // Up over anything ahead before it gets there, and never into anything.
      const clearance = leg.perch && d < 20 ? 0.6 : 8;
      const ahead = Math.max(world.heightAt(p.x, p.z), world.heightAt(p.x + this.#v.x * 0.3, p.z + this.#v.z * 0.3)) + clearance;
      if (p.y < ahead) this.#v.y += (ahead - p.y) * 25 * dt;
      p.addScaledVector(this.#v, dt);
      p.y = Math.max(p.y, world.heightAt(p.x, p.z) + 0.6);
      this.#beat += dt * TAU * 9;
      wings = 0.45 + 0.85 * Math.sin(this.#beat);
      if (Math.hypot(this.#v.x, this.#v.z) > 20) this.#heading += turnTo(this.#heading, Math.atan2(this.#v.x, this.#v.z)) * Math.min(1, dt * 5);
    }
    this.#flap.value = wings;
    // A butterfly's flight bobs: each beat lifts it a little.
    const bob = this.#perched > 0 ? 0 : Math.sin(this.#beat) * 1.6 + Math.sin(time * 5.1) * 3;
    this.mesh.position.set(p.x, p.y + bob, p.z);
    this.mesh.rotation.set(this.#perched > 0 ? 0 : clamp(-this.#v.y / 400, -0.4, 0.4), this.#heading, 0);
    const l = this.looming.position;
    l.x = p.x;
    l.y = p.y + bob;
    l.z = p.z;
  }
}

// The ladybird.

/** How fast it walks, mm/s, and how much faster when the fly comes near. */
const LADYBIRD_SPEED = 9;
/** It keeps this far from the fly, mm, hurrying away inside it. */
const LADYBIRD_CLEAR = 45;
/** Anything standing taller than this it walks round, mm. */
const LADYBIRD_STEP = 0.35;

/** A seven-spot ladybird, 7 mm long, nose along +z: red domed wing cases with black spots, a black and white shield and head, six legs. */
function ladybirdGeometry() {
  const pieces: THREE.BufferGeometry[] = [];
  const legs = (g: THREE.BufferGeometry, leg: number, hip: THREE.Vector3) => {
    const n = g.attributes.position.count;
    const along = new Float32Array(n);
    const pos = g.attributes.position;
    for (let i = 0; i < n; i++) along[i] = clamp(Math.hypot(pos.getX(i) - hip.x, pos.getZ(i) - hip.z) / 2.2, 0, 1);
    g.setAttribute("aLeg", new THREE.Float32BufferAttribute(new Float32Array(n).fill(leg), 1));
    g.setAttribute("aAlong", new THREE.Float32BufferAttribute(along, 1));
    g.setAttribute("aHip", new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [hip.x, hip.y, hip.z]).flat(), 3));
    pieces.push(g);
  };
  const still = (g: THREE.BufferGeometry) => legs(g, -1, new THREE.Vector3());
  // The wing cases are plain red here; their spots and seam are drawn in the shader (LADYBIRD_SPOTS), round however close.
  still(paint(new THREE.SphereGeometry(1, 32, 14, 0, TAU, 0, Math.PI / 2).scale(2.65, 2.3, 3.1).translate(0, 0.45, -0.55), (p) => (p.y > 1.9 ? "#ff3a2a" : "#d01818")));
  still(paint(new THREE.SphereGeometry(1, 24, 10, 0, TAU, 0, Math.PI / 2).scale(1.95, 1.15, 1.2).translate(0, 0.45, 2.3), (p) => (Math.abs(p.x) > 1.2 && p.z > 2.45 ? "#f4f0e6" : "#141010")));
  still(paint(new THREE.SphereGeometry(0.8, 12, 8).scale(1.15, 0.8, 0.8).translate(0, 0.45, 3.35), (p) => (Math.abs(p.x) > 0.42 && Math.abs(p.x) < 0.7 && p.y > 0.8 && p.z > 3.5 ? "#f4f0e6" : "#141010")));
  // Legs: from under the body out to the feet on the table, three a side.
  const hips = [1.5, 0.3, -0.9];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? 1 : -1;
    const hip = new THREE.Vector3(side * 0.8, 0.45, hips[i % 3]);
    const foot = new THREE.Vector3(side * 2.75, 0, hips[i % 3] + (i % 3 === 0 ? 0.9 : i % 3 === 2 ? -0.9 : 0));
    const knee = hip.clone().lerp(foot, 0.5).add(new THREE.Vector3(0, 0.55, 0));
    legs(paint(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(hip, knee, foot), 6, 0.13, 4), "#141010"), i, hip);
  }
  return mergeAll(pieces);
}

/** Its legs step in two tripods (left front, right middle, left hind; then the others), swinging about the hip and lifting as they swing forward. */
const LEG_VERTEX = /* glsl */ `
if (aLeg >= 0.0) {
  float tripod = mod(aLeg, 2.0) < 0.5 ? 0.0 : 3.14159;
  float s = sin(uStride + tripod);
  float swing = s * 0.38 * aAlong * sign(aHip.x);
  vec3 d = transformed - aHip;
  float c = cos(swing), sn = sin(swing);
  transformed = aHip + vec3(d.x * c + d.z * sn, d.y, -d.x * sn + d.z * c);
  transformed.y += max(0.0, -cos(uStride + tripod)) * 0.35 * aAlong;
}`;

/** The seven spots and the seam between the wing cases, on whatever is painted red, from where it is on the body. */
const LADYBIRD_SPOTS = /* glsl */ `
if (vColor.r > 0.5 && vColor.g < 0.4) {
  vec2 uv = vec2(vBug.x / 2.65, (vBug.z + 0.55) / 3.1);
  float aa = fwidth(uv.x) * 1.5;
  float dark = 1.0 - smoothstep(0.02, 0.02 + aa, abs(uv.x));
  const vec3 SPOTS[7] = vec3[7](vec3(0.0, 0.84, 0.21), vec3(0.48, 0.45, 0.17), vec3(0.62, -0.05, 0.17), vec3(0.42, -0.55, 0.16), vec3(-0.48, 0.45, 0.17), vec3(-0.62, -0.05, 0.17), vec3(-0.42, -0.55, 0.16));
  for (int i = 0; i < 7; i++) {
    float d = length(vec2(uv.x - SPOTS[i].x, (uv.y - SPOTS[i].y) * 0.9));
    dark = max(dark, 1.0 - smoothstep(SPOTS[i].z - aa, SPOTS[i].z + aa, d));
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.02, 0.02), dark);
}`;

export class Ladybird {
  readonly mesh: THREE.Mesh;
  /** Where its chances come from: its own, or at a shared table the room's for this visit (packages/net), so every device sees the same visit. */
  random: () => number = Math.random;
  readonly looming: Looming = { id: 3002, position: { x: 0, y: -1e4, z: 0 }, r: 3.5 };
  active = false;
  readonly #stride = { value: 0 };
  readonly #p: Vec3 = { x: 0, y: 0, z: 0 };
  #heading = 0;
  #exit = 0;
  /** Over the rim: 0 coming up over it, 1 on the table; and back down when leaving. */
  #rim = 0;
  #leaving = false;
  #age = 0;
  #seed = 0;
  readonly #probe: Vec3 = { x: 0, y: 0, z: 0 };

  constructor() {
    const material = shaded(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, envMapIntensity: 0.9 }));
    const before = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      shader.uniforms.uStride = this.#stride;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aLeg;\nattribute float aAlong;\nattribute vec3 aHip;\nuniform float uStride;\nvarying vec3 vBug;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>\nvBug = position;${LEG_VERTEX}`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vBug;")
        .replace("#include <color_fragment>", `#include <color_fragment>${LADYBIRD_SPOTS}`);
      before(shader, renderer);
    };
    material.customProgramCacheKey = () => "ladybird+shade";
    this.mesh = new THREE.Mesh(ladybirdGeometry(), material);
    this.mesh.rotation.order = "YXZ";
    this.mesh.visible = false;
  }

  /** Comes up over the table's edge somewhere well away from the fly, to cross to the far side. */
  start(fly: Vec3) {
    let a = 0;
    for (let i = 0; i < 20; i++) {
      a = this.random() * TAU;
      if (Math.hypot(Math.cos(a) * TABLE_RADIUS - fly.x, Math.sin(a) * TABLE_RADIUS - fly.z) > 140) break;
    }
    this.#exit = a + Math.PI + (this.random() - 0.5) * 1.6;
    this.#p.x = Math.cos(a) * (TABLE_RADIUS - 3);
    this.#p.z = Math.sin(a) * (TABLE_RADIUS - 3);
    this.#heading = Math.atan2(-this.#p.x, -this.#p.z);
    this.#rim = 0;
    this.#leaving = false;
    this.#age = 0;
    this.#seed = this.random() * 100;
    this.active = true;
    this.mesh.visible = true;
  }

  /** Leaves by the nearest edge (rain is coming, or it has been here long enough). */
  hurryOff() {
    if (this.active) this.#exit = Math.atan2(this.#p.z, this.#p.x);
  }

  step(dt: number, time: number, world: World, fly: Vec3) {
    if (!this.active) return;
    const p = this.#p;
    this.#age += dt;
    if (this.#age > 150) this.hurryOff();
    const near = flat(p, fly);
    const speed = near < 20 ? LADYBIRD_SPEED * 2.2 : LADYBIRD_SPEED;
    this.#stride.value += (dt * speed * TAU) / 2.4;
    let pitch = 0;
    let lift = 0;
    let out = 0;
    if (this.#rim < 1 && !this.#leaving) {
      // Up the side of the table and over its rounded rim.
      this.#rim = Math.min(1, this.#rim + dt * speed / 14);
      ({ out, lift, pitch } = rimPath(this.#rim));
    } else if (this.#leaving) {
      this.#rim -= dt * speed / 14;
      if (this.#rim <= 0) {
        this.active = false;
        hide(this.mesh, this.looming);
        return;
      }
      ({ out, lift, pitch } = rimPath(this.#rim));
      pitch = -pitch;
    } else {
      // Toward the far edge, wandering a little, round whatever stands, away from the fly.
      const tx = Math.cos(this.#exit) * TABLE_RADIUS;
      const tz = Math.sin(this.#exit) * TABLE_RADIUS;
      let want = Math.atan2(tx - p.x, tz - p.z) + Math.sin(time * 0.37 + this.#seed) * 0.5 + Math.sin(time * 1.1 + this.#seed * 2) * 0.25;
      if (near < LADYBIRD_CLEAR) {
        const away = Math.atan2(p.x - fly.x, p.z - fly.z);
        want += turnTo(want, away) * clamp((LADYBIRD_CLEAR - near) / 25, 0, 1);
      }
      const blocked = (turn: number) => {
        const h = this.#heading + turn;
        this.#probe.x = p.x + Math.sin(h) * 6;
        this.#probe.z = p.z + Math.cos(h) * 6;
        return world.heightAt(this.#probe.x, this.#probe.z) > LADYBIRD_STEP;
      };
      if (blocked(0)) {
        const left = blocked(0.7);
        const right = blocked(-0.7);
        const way = !left && right ? 1 : left && !right ? -1 : turnTo(this.#heading, want) >= 0 ? 1 : -1;
        want = this.#heading + way * 1.2;
      }
      this.#heading += clamp(turnTo(this.#heading, want), -1.6 * dt, 1.6 * dt);
      const nx = p.x + Math.sin(this.#heading) * speed * dt;
      const nz = p.z + Math.cos(this.#heading) * speed * dt;
      if (world.heightAt(nx, nz) <= LADYBIRD_STEP) {
        p.x = nx;
        p.z = nz;
      }
      if (this.#age > 5 && Math.hypot(p.x, p.z) > TABLE_RADIUS - 3) {
        this.#leaving = true;
        this.#rim = 1;
        this.#heading = Math.atan2(p.x, p.z);
      }
    }
    const r = Math.hypot(p.x, p.z) || 1;
    const atRim = this.#rim < 1 || this.#leaving;
    const x = atRim ? (p.x / r) * (TABLE_RADIUS - 3 + out) : p.x;
    const z = atRim ? (p.z / r) * (TABLE_RADIUS - 3 + out) : p.z;
    const y = atRim ? lift : world.heightAt(p.x, p.z);
    if (atRim) this.#heading = this.#leaving ? Math.atan2(p.x, p.z) : Math.atan2(-p.x, -p.z);
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(pitch, this.#heading, 0);
    const l = this.looming.position;
    l.x = x;
    l.y = y + 1.5;
    l.z = z;
  }
}

/** Over the table's rim (the rounded edge stands 2.5 mm proud, the side drops away below it): 0 on the side, 1 on the table. Distance out from just inside the edge, height, and pitch (nose up). */
function rimPath(k: number) {
  const points = [
    [5.4, -9, -1.45],
    [8.3, -1.5, -0.9],
    [4.5, 2.55, 0],
    [0.8, 0.05, 0.55],
    [0, 0, 0],
  ];
  const t = clamp(k, 0, 1) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(t));
  const f = t - i;
  const [o0, y0, p0] = points[i];
  const [o1, y1, p1] = points[i + 1];
  return { out: o0 + (o1 - o0) * f, lift: y0 + (y1 - y0) * f, pitch: p0 + (p1 - p0) * f };
}

// Leaves.

/** A leaf as a fine grid, so it can bend: along x from stem (0) to tip (1), across z; darker at the middle of each half, lighter toward its edge (the veins are drawn in its shader). */
export function leafGeometry(length: number, dark: string, edge: string) {
  const ALONG = 16;
  const ACROSS = 4;
  const positions: number[] = [];
  const along: number[] = [];
  const across: number[] = [];
  const colors: number[] = [];
  const cd = new THREE.Color(dark);
  const ce = new THREE.Color(edge);
  const c = new THREE.Color();
  for (let i = 0; i <= ALONG; i++) {
    const u = i / ALONG;
    const half = length * 0.17 * Math.pow(Math.sin(Math.PI * u), 0.85) + 0.01;
    for (let j = -ACROSS; j <= ACROSS; j++) {
      const v = j / ACROSS;
      positions.push((u - 0.5) * length, 0, v * half);
      along.push(u);
      across.push(v);
      c.copy(cd).lerp(ce, Math.max(0, Math.abs(v) - 0.5) * 1.4 + (1 - Math.sin(Math.PI * u)) * 0.2);
      colors.push(c.r, c.g, c.b);
    }
  }
  const index: number[] = [];
  const row = ACROSS * 2 + 1;
  for (let i = 0; i < ALONG; i++) {
    for (let j = 0; j < row - 1; j++) {
      const a = i * row + j;
      index.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(index);
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute("aAlong", new THREE.Float32BufferAttribute(along, 1));
  g.setAttribute("aAcross", new THREE.Float32BufferAttribute(across, 1));
  g.computeVertexNormals();
  return g;
}

/** A leaf lifts at its tip and flutters in a gust, and its edges curl. */
const LEAF_VERTEX = /* glsl */ `
float tip = smoothstep(0.3, 1.0, aAlong);
float rise = uLift * tip * tip * uLength * 0.16;
rise += uLift * tip * sin(uTime * 19.0 + aAlong * 7.0) * 0.5;
rise += aAcross * aAcross * (0.25 + uLift * 0.8);
transformed.y += rise;`;

/** Its midrib and the veins running out from it toward the tip, lighter than the blade, as fine as the pixels allow. */
export const LEAF_FRAGMENT = /* glsl */ `
float midrib = 1.0 - smoothstep(0.0, 0.05 + fwidth(vLeaf.y) * 1.5, abs(vLeaf.y));
float rib = vLeaf.x * 9.0 - abs(vLeaf.y) * 1.6;
float lateral = 1.0 - smoothstep(0.0, 0.07 + fwidth(rib) * 1.5, abs(fract(rib) - 0.5) - 0.42);
lateral *= smoothstep(0.06, 0.18, abs(vLeaf.y)) * (1.0 - smoothstep(0.8, 0.98, abs(vLeaf.y))) * smoothstep(0.04, 0.12, vLeaf.x);
diffuseColor.rgb = mix(diffuseColor.rgb, uVein, max(midrib * 0.9, lateral * 0.45));`;

function leafMaterial(length: number, vein: string) {
  const uniforms = { uLift: { value: 0 }, uTime: { value: 0 }, uLength: { value: length }, uVein: { value: new THREE.Color(vein) } };
  const material = shaded(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide, envMapIntensity: 0.5 }));
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aAlong;\nattribute float aAcross;\nuniform float uLift;\nuniform float uTime;\nuniform float uLength;\nvarying vec2 vLeaf;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>${LEAF_VERTEX}\nvLeaf = vec2(aAlong, aAcross);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uVein;\nvarying vec2 vLeaf;")
      .replace("#include <color_fragment>", `#include <color_fragment>${LEAF_FRAGMENT}`);
    before(shader, renderer);
  };
  material.customProgramCacheKey = () => "leaf+shade";
  return { material, uniforms };
}

type LooseState = "off" | "falling" | "lying" | "sliding" | "dropping";

/** The table's own leaf, and a loose one that comes down on a gust. */
export class Leaves {
  readonly resting: THREE.Mesh;
  /** Where its chances come from: its own, or at a shared table the room's for this visit (packages/net), so every device sees the same visit. */
  random: () => number = Math.random;
  readonly loose: THREE.Mesh;
  readonly looming: Looming = { id: 3003, position: { x: 0, y: -1e4, z: 0 }, r: 15 };
  state: LooseState = "off";
  readonly #rest: ReturnType<typeof leafMaterial>;
  readonly #free: ReturnType<typeof leafMaterial>;
  readonly #from = new THREE.Vector3();
  readonly #to = new THREE.Vector3();
  readonly #p = new THREE.Vector3();
  readonly #v = new THREE.Vector3();
  #t = 0;
  #fall = 0;
  #spin = 0;
  #yaw = 0;
  #side = 0;
  #brushed = false;
  #lift = 0;
  #looseLift = 0;

  constructor() {
    const { leaf } = DECOR;
    this.#rest = leafMaterial(leaf.length, "#c6ef7a");
    this.resting = new THREE.Mesh(leafGeometry(leaf.length, "#5fc236", "#7fd64a"), this.#rest.material);
    // Lying along its angle, the stem toward the table's middle.
    this.resting.position.set(leaf.x, 0.12, leaf.z);
    this.resting.rotation.y = leaf.angle + Math.PI / 2;
    freeze(this.resting);
    this.#free = leafMaterial(38, "#f4ec9a");
    this.loose = new THREE.Mesh(leafGeometry(38, "#a9cc3e", "#d9b23c"), this.#free.material);
    this.loose.rotation.order = "YXZ";
    this.loose.visible = false;
  }

  /** Whether one can come down now: none is lying loose on the table. */
  get free() {
    return this.state === "off";
  }

  /**
   * Comes down on the wind onto a clear spot on the table (not under the fly,
   * and clear of anything standing all the way down), from upwind and high.
   * False if there's no such spot this time.
   */
  start(world: World, fly: Vec3, gust: Gust) {
    const speed = Math.hypot(gust.x, gust.z) || 1;
    const wx = gust.x / speed;
    const wz = gust.z / speed;
    this.#fall = 2.6 + this.random() * 1.2;
    const drift = Math.min(420, speed * 0.35 * this.#fall);
    for (let tries = 0; tries < 12; tries++) {
      const r = Math.sqrt(this.random()) * (TABLE_RADIUS - 40);
      const a = this.random() * TAU;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.hypot(x - fly.x, z - fly.z) < 30 || Math.hypot(x - DECOR.leaf.x, z - DECOR.leaf.z) < 50) continue;
      this.#to.set(x, 0.14, z);
      this.#from.set(x - wx * drift, 240 + this.random() * 80, z - wz * drift);
      if (!this.#clearAllWay(world)) continue;
      this.#side = Math.atan2(wx, wz) + Math.PI / 2;
      this.#yaw = this.random() * TAU;
      this.#spin = (this.random() - 0.5) * 1.5;
      this.#t = 0;
      this.#brushed = false;
      this.state = "falling";
      this.loose.visible = true;
      return true;
    }
    return false;
  }

  /** Nothing in the way of its fall, and room to lie flat where it lands. */
  #clearAllWay(world: World) {
    for (let i = 0; i <= 24; i++) {
      const k = i / 24;
      const x = this.#from.x + (this.#to.x - this.#from.x) * k;
      const z = this.#from.z + (this.#to.z - this.#from.z) * k;
      const y = this.#from.y + (this.#to.y - this.#from.y) * k;
      if (world.heightAt(x, z) > y - (k > 0.95 ? -0.1 : 25)) return false;
    }
    for (let a = 0; a < TAU; a += TAU / 8) if (world.heightAt(this.#to.x + Math.cos(a) * 20, this.#to.z + Math.sin(a) * 20) > 0.3) return false;
    return true;
  }

  /** Moves the leaves on; returns how hard a loose leaf brushed the fly this frame (0 if not). */
  step(dt: number, time: number, world: World, fly: Vec3, gust: Gust): number {
    // The table's leaf lifts in a gust, less with the fly on it.
    const onIt = flat(fly, DECOR.leaf) < DECOR.leaf.length * 0.45 ? 0.25 : 1;
    this.#lift += (gust.strength * onIt - this.#lift) * Math.min(1, dt * 3);
    this.#rest.uniforms.uLift.value = this.#lift;
    this.#rest.uniforms.uTime.value = time;
    this.#free.uniforms.uTime.value = time;
    if (this.state === "off") return 0;
    let touch = 0;
    const p = this.#p;
    let roll = 0;
    if (this.state === "falling") {
      // Down on a slant with the wind, swinging side to side as a falling leaf does, the swing dying as it settles.
      this.#t += dt;
      const k = Math.min(1, this.#t / this.#fall);
      const settle = 1 - k * k;
      const swing = Math.sin(this.#t * 4.6);
      p.lerpVectors(this.#from, this.#to, k);
      p.x += Math.sin(this.#side) * swing * 28 * settle;
      p.z += Math.cos(this.#side) * swing * 28 * settle;
      p.y += Math.abs(Math.cos(this.#t * 4.6)) * 10 * settle;
      roll = Math.cos(this.#t * 4.6) * 0.8 * settle;
      this.#yaw += this.#spin * dt * settle;
      this.#looseLift = 0.5 * settle;
      if (!this.#brushed && p.distanceTo(scratch.set(fly.x, fly.y + 0.8, fly.z)) < 8) {
        this.#brushed = true;
        touch = 0.4;
      }
      if (k >= 1) {
        this.state = "lying";
        // Landing on the fly, it slides off it.
        if (flat(p, fly) < 10) {
          this.#v.set(p.x - fly.x, 0, p.z - fly.z).setLength(25);
          this.state = "sliding";
          if (!this.#brushed) touch = 0.4;
        }
      }
    } else if (this.state === "lying") {
      this.#looseLift += (gust.strength - this.#looseLift) * Math.min(1, dt * 3);
      // A strong gust takes it on, if it isn't under the fly.
      if (gust.strength > 0.55 && flat(p, fly) > 22) {
        this.state = "sliding";
        this.#v.set(gust.x, 0, gust.z).multiplyScalar(0.12);
      }
    } else if (this.state === "sliding") {
      this.#looseLift += (Math.max(0.4, gust.strength) - this.#looseLift) * Math.min(1, dt * 3);
      this.#v.lerp(scratch.set(gust.x * 0.12, 0, gust.z * 0.12), Math.min(1, dt * 2)).multiplyScalar(gust.strength > 0.3 ? 1 : Math.max(0, 1 - dt * 3));
      const nx = p.x + this.#v.x * dt;
      const nz = p.z + this.#v.z * dt;
      if (world.heightAt(nx, nz) > 0.3 || flat(scratch.set(nx, 0, nz), fly) < 10) this.#v.set(0, 0, 0);
      else {
        p.x = nx;
        p.z = nz;
      }
      this.#yaw += this.#v.length() * 0.004 * dt * 60;
      if (Math.hypot(p.x, p.z) > TABLE_RADIUS + 4) {
        this.state = "dropping";
        this.#v.y = 0;
      } else if (this.#v.lengthSq() < 1) this.state = "lying";
    } else {
      // Off the edge and down to the lawn, tumbling.
      this.#v.y -= 900 * dt;
      p.addScaledVector(this.#v, dt);
      roll += dt * 6;
      this.#yaw += dt * 3;
      if (p.y < -300) {
        this.state = "off";
        hide(this.loose, this.looming);
        return touch;
      }
    }
    this.#free.uniforms.uLift.value = this.#looseLift;
    this.loose.position.copy(p);
    this.loose.rotation.set(0, this.#yaw, roll);
    const l = this.looming.position;
    l.x = p.x;
    l.y = this.state === "falling" ? p.y : -1e4;
    l.z = p.z;
    return touch;
  }
}

const scratch = new THREE.Vector3();

/** Merges pieces that share the same attributes. */
function mergeAll(pieces: THREE.BufferGeometry[]) {
  const names = Object.keys(pieces[0].attributes);
  const merged = new THREE.BufferGeometry();
  for (const name of names) {
    const size = pieces[0].attributes[name].itemSize;
    const total = pieces.reduce((n, p) => n + p.attributes[name].count, 0);
    const array = new Float32Array(total * size);
    let at = 0;
    for (const p of pieces) {
      array.set(p.attributes[name].array as Float32Array, at);
      at += p.attributes[name].count * size;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  for (const p of pieces) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}
