// The countryside the road runs through, built in code and merged into a
// handful of meshes (scene/build.ts): the road with its markings, the
// striped rails, the grass, trees, houses and hills, a sky, and the other
// cars as one instanced mesh. The rails' stripes and the trees' trunks are
// what the fly's eyes get the most motion from.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Batch, mat4, paint, random } from "../scene/build.ts";
import { CAR } from "./car.ts";
import type { Traffic } from "./car.ts";
import { ROAD, Track, roadPoint } from "./track.ts";

export const SKY = { zenith: new THREE.Color("#3d8fe0"), horizon: new THREE.Color("#cfe9ff"), ground: new THREE.Color("#7fbf5e") };
const SUN = new THREE.Vector3(0.45, 0.62, 0.3).normalize();

const RAIL_HEIGHT = 0.85;
const STRIPE = 4;
const DASH = 3;

/** Pushes a quad (a, b, c, d anticlockwise seen from its front) as two triangles, with one colour and normal. */
function quad(out: { p: number[]; n: number[]; c: number[] }, a: number[], b: number[], c: number[], d: number[], color: THREE.Color) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  for (const v of [a, b, c, a, c, d]) {
    out.p.push(v[0], v[1], v[2]);
    out.n.push(nx, ny, nz);
    out.c.push(color.r, color.g, color.b);
  }
}

function geometryOf(out: { p: number[]; n: number[]; c: number[] }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out.p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(out.n, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(out.c, 3));
  return g;
}

/** The road, its markings and its rails, piece by piece along the centre line. */
function roadGeometry(track: Track) {
  const road = { p: [] as number[], n: [] as number[], c: [] as number[] };
  const rails = { p: [] as number[], n: [] as number[], c: [] as number[] };
  const asphalt = new THREE.Color("#596069");
  const asphaltLight = new THREE.Color("#636a73");
  const white = new THREE.Color("#f4f6f2");
  const yellow = new THREE.Color("#f2c84b");
  const red = new THREE.Color("#d8443a");
  const railWhite = new THREE.Color("#f1f1ec");
  const railTop = new THREE.Color("#9aa3ab");
  const a = roadPoint();
  const b = roadPoint();
  const at = (i: number, lateral: number, y: number, p = a) => {
    track.at(track.s[i], lateral, p);
    return [p.x, y, p.z];
  };
  const n = track.count;
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    const s = track.s[i];
    const edge = ROAD.half + 0.6;
    // Asphalt, a little patchy so its movement is seen.
    quad(road, at(i, -edge, 0.02), at(j, -edge, 0.02, b), at(j, edge, 0.02, b), at(i, edge, 0.02), Math.floor(s / 9) % 3 === 0 ? asphaltLight : asphalt);
    for (const side of [-1, 1]) {
      const line = side * (ROAD.half - 0.45);
      quad(road, at(i, line - 0.08, 0.035), at(j, line - 0.08, 0.035, b), at(j, line + 0.08, 0.035, b), at(i, line + 0.08, 0.035), white);
    }
    if (Math.floor(s / DASH) % 2 === 0) quad(road, at(i, -0.08, 0.035), at(j, -0.08, 0.035, b), at(j, 0.08, 0.035, b), at(i, 0.08, 0.035), yellow);
    const stripe = Math.floor(s / STRIPE) % 2 === 0 ? red : railWhite;
    for (const side of [-1, 1]) {
      const r = side * ROAD.half;
      const back = side * (ROAD.half + 0.35);
      // Facing the road, then its top, then its back toward the fields.
      if (side > 0) quad(rails, at(i, r, 0), at(j, r, 0, b), at(j, r, RAIL_HEIGHT, b), at(i, r, RAIL_HEIGHT), stripe);
      else quad(rails, at(j, r, 0, b), at(i, r, 0), at(i, r, RAIL_HEIGHT), at(j, r, RAIL_HEIGHT, b), stripe);
      if (side > 0) quad(rails, at(i, r, RAIL_HEIGHT), at(j, r, RAIL_HEIGHT, b), at(j, back, RAIL_HEIGHT, b), at(i, back, RAIL_HEIGHT), railTop);
      else quad(rails, at(j, r, RAIL_HEIGHT, b), at(i, r, RAIL_HEIGHT), at(i, back, RAIL_HEIGHT), at(j, back, RAIL_HEIGHT, b), railTop);
      if (side > 0) quad(rails, at(j, back, 0, b), at(i, back, 0), at(i, back, RAIL_HEIGHT), at(j, back, RAIL_HEIGHT, b), stripe);
      else quad(rails, at(i, back, 0), at(j, back, 0, b), at(j, back, RAIL_HEIGHT, b), at(i, back, RAIL_HEIGHT), stripe);
    }
  }
  return { road: geometryOf(road), rails: geometryOf(rails) };
}

/** Whether (x, z) is clear of the road by `margin` metres. */
function clear(track: Track, x: number, z: number, margin: number) {
  const p = track.nearest(x, z, roadPoint(), false);
  return Math.abs(p.lateral) > ROAD.half + margin;
}

export function buildScenery(track: Track): THREE.Group {
  const root = new THREE.Group();
  root.name = "scenery";
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
  // Both faces: seen from the road and from across the fields.
  const railMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const batch = new Batch();
  const rng = random(7);

  const { road, rails } = roadGeometry(track);
  batch.add(lambert, road);
  batch.add(railMaterial, rails);

  // Grass, mottled.
  const grass = new THREE.PlaneGeometry(2400, 2400, 48, 48).rotateX(-Math.PI / 2);
  const light = new THREE.Color("#8fd16a");
  const dark = new THREE.Color("#5fae4c");
  const tint = new THREE.Color();
  batch.add(lambert, paint(grass, (p) => tint.copy(dark).lerp(light, 0.5 + 0.5 * Math.sin(p.x * 0.031 + Math.cos(p.z * 0.017) * 2) * Math.cos(p.z * 0.027))));

  // Trees: a trunk and two cones, in a few greens; thick near the road, where they pass the windows.
  const greens = ["#3f9a4a", "#4fae4f", "#2f8a4f", "#6cb84a"].map((c) => new THREE.Color(c));
  const trunk = new THREE.Color("#7a5236");
  const p = roadPoint();
  for (let k = 0; k < 520; k++) {
    track.at(rng.range(0, track.length), (rng.next() < 0.5 ? -1 : 1) * (ROAD.half + 4 + rng.next() ** 2 * 90), p);
    if (!clear(track, p.x, p.z, 3)) continue;
    const h = rng.range(5, 11);
    const green = greens[Math.floor(rng.next() * greens.length)];
    batch.add(lambert, paint(new THREE.CylinderGeometry(0.22, 0.3, h * 0.45, 5), trunk), mat4({ x: p.x, y: h * 0.22, z: p.z }));
    batch.add(lambert, paint(new THREE.ConeGeometry(h * 0.28, h * 0.6, 6), green), mat4({ x: p.x, y: h * 0.55, z: p.z }));
    batch.add(lambert, paint(new THREE.ConeGeometry(h * 0.2, h * 0.45, 6), green.clone().offsetHSL(0, 0, 0.05)), mat4({ x: p.x, y: h * 0.82, z: p.z }));
  }

  // Houses in bright paint, back from the road, facing it.
  const walls = ["#f3d36b", "#f29c7a", "#a8d8f0", "#f6f1e6", "#c7a6e8"].map((c) => new THREE.Color(c));
  const roof = new THREE.Color("#b5523f");
  for (let k = 0; k < 36; k++) {
    track.at(rng.range(0, track.length), (rng.next() < 0.5 ? -1 : 1) * rng.range(ROAD.half + 18, ROAD.half + 70), p);
    if (!clear(track, p.x, p.z, 14)) continue;
    const w = rng.range(7, 12);
    const d = rng.range(6, 9);
    const h = rng.range(4, 6.5);
    const rotation = new THREE.Euler(0, p.yaw, 0);
    batch.add(lambert, paint(new THREE.BoxGeometry(w, h, d), walls[k % walls.length]), mat4({ x: p.x, y: h / 2, z: p.z }, rotation));
    batch.add(lambert, paint(new THREE.ConeGeometry(Math.hypot(w, d) / 2, h * 0.6, 4).rotateY(Math.PI / 4), roof), mat4({ x: p.x, y: h + h * 0.3, z: p.z }, rotation, { x: 1, y: 1, z: d / w }));
  }

  // Hills all round, far off, bluer with distance.
  const hill = new THREE.Color("#79b86a");
  const far = new THREE.Color("#9cc7c9");
  for (let k = 0; k < 40; k++) {
    const angle = (k / 40) * Math.PI * 2 + rng.range(-0.05, 0.05);
    const r = rng.range(520, 900);
    const size = rng.range(90, 220);
    const color = hill.clone().lerp(far, (r - 520) / 380);
    batch.add(lambert, paint(new THREE.SphereGeometry(size, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), color), mat4({ x: Math.cos(angle) * r, y: -size * 0.55, z: Math.sin(angle) * r }, undefined, { x: 1, y: rng.range(0.35, 0.6), z: 1 }));
  }
  batch.build(root);
  root.add(buildSky());
  return root;
}

function buildSky() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { zenith: { value: SKY.zenith }, horizon: { value: SKY.horizon }, ground: { value: SKY.ground }, sunDir: { value: SUN } },
      vertexShader: "varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 c = d.y > 0.0 ? mix(horizon, zenith, smoothstep(0.0, 0.5, d.y)) : ground;
          c += vec3(1.0, 0.95, 0.8) * pow(max(dot(d, sunDir), 0.0), 300.0) * 2.0;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.name = "sky";
  return sky;
}

/** The lights: a low sun and the sky's fill. */
export function buildLights(scene: THREE.Scene) {
  const hemi = new THREE.HemisphereLight(SKY.horizon, SKY.ground, 1.6);
  const sun = new THREE.DirectionalLight("#fff4dc", 1.8);
  sun.position.copy(SUN).multiplyScalar(100);
  scene.add(hemi, sun);
  scene.fog = new THREE.Fog(SKY.horizon, 120, 900);
}

/** A car, `CAR` sized, facing +z: white where its paint goes (the instance's colour), dark glass and tyres. */
function carGeometry() {
  const batch: THREE.BufferGeometry[] = [];
  const w = CAR.width;
  const l = CAR.length;
  const add = (g: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => batch.push(paint(g, color).applyMatrix4(mat4({ x, y, z })));
  add(new THREE.BoxGeometry(w, 0.7, l), "#ffffff", 0, 0.65, 0);
  add(new THREE.BoxGeometry(w * 0.86, 0.55, l * 0.5), "#ffffff", 0, 1.25, -0.2);
  add(new THREE.BoxGeometry(w * 0.88, 0.42, l * 0.52), "#26323f", 0, 1.22, -0.2);
  for (const x of [-1, 1]) for (const z of [-1, 1]) add(new THREE.BoxGeometry(0.3, 0.6, 0.6), "#1d1f22", x * (w / 2 - 0.1), 0.3, z * l * 0.32);
  add(new THREE.BoxGeometry(w * 0.9, 0.12, 0.05), "#fff3c4", 0, 0.75, l / 2);
  add(new THREE.BoxGeometry(w * 0.9, 0.12, 0.05), "#e0453a", 0, 0.75, -l / 2);
  const geometry = mergeGeometries(batch);
  for (const g of batch) g.dispose();
  return geometry;
}

const PAINT = ["#2f7de1", "#f2b632", "#7a49c9", "#2fb39a", "#f06292", "#ececec", "#ff7a2f"];

/** The other cars, one draw for all of them. */
export class TrafficView {
  readonly mesh: THREE.InstancedMesh;
  readonly #m = new THREE.Matrix4();
  readonly #q = new THREE.Quaternion();
  readonly #p = new THREE.Vector3();
  readonly #one = new THREE.Vector3(1, 1, 1);

  constructor(cars: readonly Traffic[]) {
    this.mesh = new THREE.InstancedMesh(carGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), cars.length);
    this.mesh.frustumCulled = false;
    this.mesh.name = "traffic";
    const color = new THREE.Color();
    for (let i = 0; i < cars.length; i++) this.mesh.setColorAt(i, color.set(PAINT[i % PAINT.length]));
    this.update(cars);
  }

  update(cars: readonly Traffic[]) {
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      this.#q.setFromAxisAngle(UP, car.yaw);
      this.#m.compose(this.#p.set(car.x, 0, car.z), this.#q, this.#one);
      this.mesh.setMatrixAt(i, this.#m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
