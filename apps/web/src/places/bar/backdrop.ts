// What is seen through the bar's window: the pavement and the road outside,
// a square with trees and lamp posts across it, a row of low houses beyond,
// and the sky over their roofs, where the sun goes down at golden hour.
// Everything here is metres away, in the far pass, in five draws. The bar's
// own walls (near pass) hide all of it but what the window shows.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { freeze, random } from "../../scene/build.ts";
import type { Daylight } from "../../scene/light.ts";
import type { SceneBackdrop } from "../types.ts";
import { ROOM } from "./light.ts";

/** The street: the bar's outside wall, the kerb, the far side of the road, the square, and the houses beyond it, along x (mm). */
const STREET = { wall: ROOM.left - 250, kerb: -4200, road: -10800, square: -13500, houses: -68_000, ground: ROOM.floor, roadway: ROOM.floor - 140 };
/** Street lamps, along both pavements, over this length of street (mm). */
const LAMPS = 11;
const LAMP_SPAN = 60_000;

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FS = /* glsl */ `
uniform vec3 uSky; uniform vec3 uLow; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uStars; uniform float uTime;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(uLow, uSky, smoothstep(0.0, 0.45, h));
  // The sun, when it is out there: low over the roofs, its glow wide at golden hour.
  float outside = smoothstep(0.3, 0.6, -uSunDir.x) * (1.0 - uStars);
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunColor * outside * (pow(s, 8.0) * 0.5 + pow(s, 90.0) * 0.6);
  c = mix(c, vec3(1.0, 0.96, 0.86), outside * smoothstep(0.9993, 0.9996, s));
  if (uStars > 0.0 && h > 0.05) {
    vec3 cell = floor(d * 300.0);
    float star = step(0.998, hash(cell)) * smoothstep(0.05, 0.3, h);
    c += vec3(star * uStars * (0.6 + 0.4 * sin(uTime * 2.0 + hash(cell + 1.0) * 30.0)));
  }
  gl_FragColor = vec4(c, 1.0);
}`;

/** The ground outside: flagstones on the pavements, asphalt on the road with its kerbs and a painted line, paving in the square. */
const GROUND_VS = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

const GROUND_FS = /* glsl */ `
uniform vec3 uLit; uniform vec3 uLamp; uniform float uStars; uniform vec3 uLow;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = vWorld.xz;
  float x = p.x;
  vec3 c;
  if (x > ${STREET.kerb.toFixed(1)} || (x < ${STREET.road.toFixed(1)} && x > ${STREET.square.toFixed(1)})) {
    // Flagstones.
    vec2 f = p / 600.0;
    vec2 e = abs(fract(f) - 0.5);
    float joint = smoothstep(0.47, 0.49, max(e.x, e.y));
    c = vec3(0.62, 0.6, 0.56) * (0.88 + hash(floor(f)) * 0.2) * (1.0 - joint * 0.35);
  } else if (x > ${STREET.road.toFixed(1)}) {
    c = vec3(0.24, 0.24, 0.26) * (0.92 + hash(floor(p / 300.0)) * 0.1);
    float mid = (${STREET.kerb.toFixed(1)} + ${STREET.road.toFixed(1)}) * 0.5;
    float line = (1.0 - smoothstep(60.0, 90.0, abs(x - mid))) * step(0.45, fract(p.y / 6000.0));
    c = mix(c, vec3(0.85, 0.82, 0.7), line);
    float kerb = 1.0 - smoothstep(150.0, 220.0, min(abs(x - ${STREET.kerb.toFixed(1)}), abs(x - ${STREET.road.toFixed(1)})));
    c = mix(c, vec3(0.7, 0.68, 0.64), kerb);
  } else {
    // The square: setts in rings.
    vec2 f = p / 260.0;
    vec2 e = abs(fract(f) - 0.5);
    c = vec3(0.55, 0.5, 0.46) * (0.85 + hash(floor(f)) * 0.25) * (1.0 - smoothstep(0.44, 0.49, max(e.x, e.y)) * 0.3);
  }
  c *= uLit;
  // Pools of light under the street lamps at night.
  float lamp = 0.0;
  for (int i = 0; i < ${LAMPS}; i++) {
    float lz = ${(-LAMP_SPAN / 2).toFixed(1)} + float(i) * ${(LAMP_SPAN / (LAMPS - 1)).toFixed(1)};
    vec2 at = vec2(mod(float(i), 2.0) < 0.5 ? ${(STREET.road + 50).toFixed(1)} : ${(STREET.kerb - 150).toFixed(1)}, lz);
    lamp += 1.0 / (1.0 + dot(p - at, p - at) / 6e6);
  }
  c += vec3(0.5, 0.48, 0.44) * uLamp * lamp * uStars;
  // Haze far off.
  c = mix(c, uLow, smoothstep(20000.0, 90000.0, -x) * 0.6);
  gl_FragColor = vec4(c, 1.0);
}`;

/** The houses across the square: plaster and brick, rows of windows, shops below, lit windows at night. */
const HOUSES_VS = /* glsl */ `
attribute vec3 color;
varying vec3 vWorld;
varying vec3 vColor;
varying vec3 vNormal;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vColor = color;
  vNormal = normal;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

const HOUSES_FS = /* glsl */ `
uniform vec3 uLit; uniform vec3 uLamp; uniform float uStars; uniform vec3 uLow; uniform vec3 uSky;
varying vec3 vWorld;
varying vec3 vColor;
varying vec3 vNormal;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = vColor * uLit * (vNormal.y > 0.5 ? 0.7 : (abs(vNormal.z) > 0.5 ? 0.75 : 1.0));
  if (vNormal.x > 0.5) {
    // Windows on the fronts: a grid of them, three metres apart, a storey of three; shopfronts on the ground floor.
    vec2 w = vec2(vWorld.z / 3000.0, (vWorld.y - ${STREET.ground.toFixed(1)}) / 3000.0);
    vec2 cell = floor(w);
    vec2 f = fract(w);
    float upper = step(1.0, cell.y);
    float win = step(0.32, f.x) * step(f.x, 0.7) * step(0.28, f.y) * step(f.y, 0.78) * upper;
    // A pale frame and sill round each window, a cornice under the eaves, a band over the shops.
    float frame = step(0.29, f.x) * step(f.x, 0.73) * step(0.22, f.y) * step(f.y, 0.81) * upper * (1.0 - win);
    c = mix(c, vec3(0.92, 0.9, 0.84) * uLit, frame * 0.7);
    float band = step(0.82, f.y) * step(f.y, 0.92) * step(cell.y, 0.5);
    float awning = step(hash(vec2(floor(vWorld.z / 4500.0), 5.0)), 0.5);
    vec3 stripes = mix(vec3(0.6, 0.12, 0.1), vec3(0.9, 0.86, 0.78), step(0.5, fract(vWorld.z / 500.0)));
    c = mix(c, mix(vec3(0.3, 0.25, 0.2), stripes, awning) * uLit, band);
    float bay = floor(vWorld.z / 4500.0);
    float shop = step(cell.y, 0.5) * step(0.12, fract(vWorld.z / 4500.0)) * step(fract(vWorld.z / 4500.0), 0.78) * step(0.08, f.y) * step(f.y, 0.7) * step(0.35, hash(vec2(bay, 3.0)));
    float lit = step(hash(cell + floor(vWorld.z / 9000.0)), 0.45);
    vec3 glass = mix(uSky * 0.55, uLow * 0.4, 0.5) * (1.0 - uStars * 0.85);
    vec3 glow = uLamp * (0.6 + 0.4 * hash(cell * 1.7));
    c = mix(c, glass + glow * lit * uStars, win);
    c = mix(c, glass + glow * uStars * step(0.5, hash(vec2(bay, 7.0))) * 1.1, shop);
  }
  c = mix(c, uLow, smoothstep(30000.0, 160000.0, -vWorld.x) * 0.5);
  gl_FragColor = vec4(c, 1.0);
}`;

const GLOW_VS = /* glsl */ `
attribute vec4 aLight;
attribute vec4 aMove;
uniform float uTime;
uniform float uStars;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  vUv = position.xy;
  vec3 at = aLight.xyz;
  // Cars come along the road now and then; lamps just stand there.
  float moving = step(0.5, abs(aMove.x));
  at.z = mix(at.z, mod(aMove.y + uTime * aMove.x, 240000.0) - 120000.0, moving);
  vec4 mv = modelViewMatrix * vec4(at, 1.0);
  float dist = max(-mv.z, 1.0);
  vec3 forward = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float focus = clamp(cameraPosition.y / max(0.03, -forward.y), 6.0, 900.0);
  float blur = clamp(1.4 * abs(1.0 / focus - 1.0 / dist), 0.0, 0.05);
  float size = (blur * aLight.w + 0.0035) * dist;
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
  float on = smoothstep(0.15, 0.6, uStars) * (0.008 / (blur + 0.008) + 0.15) * 1.3;
  vColor = (aMove.z > 0.5 ? vec3(1.0, 0.95, 0.85) : (aMove.z < -0.5 ? vec3(1.0, 0.15, 0.08) : vec3(1.0, 0.7, 0.35))) * on;
}`;

const GLOW_FS = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  gl_FragColor = vec4(vColor * smoothstep(1.0, 0.8, r) * (0.7 + 0.3 * smoothstep(0.5, 0.92, r)), 1.0);
}`;

export function buildBackdrop(light: Daylight): SceneBackdrop {
  const scene = new THREE.Scene();
  scene.matrixWorldAutoUpdate = true;
  const rnd = random(61);
  const time = { value: 0 };
  const lamp = { value: light.cloud };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2_000_000, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: { uSky: { value: light.middle }, uLow: { value: light.haze }, uSunDir: { value: light.sunDirection }, uSunColor: { value: light.sunColor }, uStars: { value: light.stars }, uTime: time },
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  const skyUniforms = (sky.material as THREE.ShaderMaterial).uniforms;

  const lit = { value: light.water };
  const stars = { value: light.stars };
  // The pavements, and the road a kerb below them.
  const strips: THREE.BufferGeometry[] = [];
  const strip = (x0: number, x1: number, y: number) => strips.push(new THREE.PlaneGeometry(x1 - x0, 400_000).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, 0));
  strip(STREET.kerb, STREET.wall, STREET.ground);
  strip(STREET.road, STREET.kerb, STREET.roadway);
  strip(-400_000, STREET.road, STREET.ground);
  for (const x of [STREET.kerb, STREET.road]) strips.push(new THREE.PlaneGeometry(400_000, STREET.ground - STREET.roadway).rotateY(x === STREET.kerb ? -Math.PI / 2 : Math.PI / 2).translate(x, (STREET.ground + STREET.roadway) / 2, 0));
  const ground = new THREE.Mesh(merge(strips, false), new THREE.ShaderMaterial({ uniforms: { uLit: lit, uLamp: lamp, uStars: stars, uLow: { value: light.haze } }, vertexShader: GROUND_VS, fragmentShader: GROUND_FS }));
  freeze(ground);
  scene.add(ground);

  // The houses: a row of boxes of different widths and heights, with a gap where a street runs off toward the sunset.
  const houses: THREE.BufferGeometry[] = [];
  const palette = ["#d8c8a8", "#c89878", "#b0705a", "#e0d4c0", "#a8a090", "#c8b088", "#9a6050"].map((c) => new THREE.Color(c));
  for (let z = -160_000; z < 160_000; ) {
    const w = rnd.range(7000, 16000);
    if (z > -6000 && z < 2000) {
      z = 4000;
      continue;
    }
    const h = rnd.range(7500, 13500);
    const depth = rnd.range(9000, 14000);
    const x = STREET.houses - rnd.range(0, 2500);
    const g = new THREE.BoxGeometry(depth, h, w).translate(x - depth / 2, STREET.ground + h / 2, z + w / 2);
    const color = palette[Math.floor(rnd.next() * palette.length)];
    paintAll(g, color);
    houses.push(g);
    // A gable roof, its ridge along the street, and a chimney or two.
    const pitch = depth * rnd.range(0.32, 0.45);
    const shape = new THREE.Shape([new THREE.Vector2(-depth / 2 - 300, 0), new THREE.Vector2(depth / 2 + 300, 0), new THREE.Vector2(0, pitch)]);
    const roof = new THREE.ExtrudeGeometry(shape, { depth: w + 200, bevelEnabled: false }).translate(x - depth / 2, STREET.ground + h, z - 100).toNonIndexed();
    roof.computeVertexNormals();
    const tile = new THREE.Color(rnd.next() < 0.55 ? "#7a4030" : "#4a4a56");
    paintAll(roof, tile);
    houses.push(roof);
    for (let c = 0; c < (w > 11000 ? 2 : 1); c++) {
      const chimney = new THREE.BoxGeometry(900, pitch + 1600, 1300).translate(x - depth * rnd.range(0.3, 0.7), STREET.ground + h + (pitch + 1600) / 2 - 200, z + w * (c + 0.5) / (w > 11000 ? 2 : 1));
      paintAll(chimney, color.clone().multiplyScalar(0.8));
      houses.push(chimney);
    }
    z += w + rnd.range(0, 1200);
  }
  const houseMesh = new THREE.Mesh(
    merge(houses, true),
    new THREE.ShaderMaterial({ uniforms: { uLit: lit, uLamp: lamp, uStars: stars, uLow: { value: light.haze }, uSky: { value: light.middle } }, vertexShader: HOUSES_VS, fragmentShader: HOUSES_FS }),
  );
  freeze(houseMesh);
  scene.add(houseMesh);

  // Trees in the square and lamp posts along the road: dark shapes, one draw.
  const trees: THREE.BufferGeometry[] = [];
  const crown = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 16; i++) {
    const x = rnd.range(STREET.square - 9000, STREET.houses + 14000);
    const z = rnd.range(-60000, 60000);
    const s = rnd.range(1800, 2800);
    trees.push(new THREE.CylinderGeometry(160, 240, s * 1.4, 6).translate(x, STREET.ground + s * 0.7, z));
    for (let k = 0; k < 3; k++) trees.push(crown.clone().scale(s, s * 0.85, s).translate(x + rnd.range(-900, 900), STREET.ground + s * 1.6 + k * s * 0.35, z + rnd.range(-900, 900)));
  }
  // Lamp posts along both pavements, staggered.
  const lampPosts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < LAMPS; i++) {
    const far = i % 2 === 0;
    const z = -LAMP_SPAN / 2 + (i * LAMP_SPAN) / (LAMPS - 1);
    const x = far ? STREET.road - 600 : STREET.kerb + 500;
    const tall = far ? 4600 : 3600;
    // An arm reaches out over the road, and the light hangs under its head.
    const reach = far ? 650 : -650;
    trees.push(new THREE.CylinderGeometry(55, 85, tall, 6).translate(x, STREET.ground + tall / 2, z));
    trees.push(new THREE.CylinderGeometry(30, 30, Math.abs(reach), 5).rotateZ(Math.PI / 2).translate(x + reach / 2, STREET.ground + tall - 60, z));
    trees.push(new THREE.CylinderGeometry(220, 100, 360, 6).translate(x + reach, STREET.ground + tall - 120, z));
    lampPosts.push({ x: x + reach, y: STREET.ground + tall - 330, z });
  }
  const treeMesh = new THREE.Mesh(
    merge(trees, false),
    new THREE.MeshLambertMaterial({ color: "#4a6a34" }),
  );
  freeze(treeMesh);
  scene.add(treeMesh);
  const hemi = new THREE.HemisphereLight(light.skyColor, light.groundColor, 1);
  scene.add(hemi);

  // Lights out there: the street lamps, and now and then a car going by.
  const lights: number[] = [];
  const moves: number[] = [];
  for (const p of lampPosts) {
    lights.push(p.x, p.y, p.z, 1);
    moves.push(0, 0, 0, 0);
  }
  for (let i = 0; i < 3; i++) {
    const lane = STREET.kerb - 1800;
    const phase = rnd.range(0, 240000);
    for (const dz of [0, 1600]) {
      lights.push(lane, STREET.roadway + 700, 0, 0.6);
      moves.push(14000, phase + dz, -1, 0);
    }
    const other = STREET.road + 1800;
    const back = rnd.range(0, 240000);
    for (const dz of [0, 1600]) {
      lights.push(other, STREET.roadway + 650, 0, 0.8);
      moves.push(-12500, back + dz, 1, 0);
    }
  }
  const glowGeometry = new THREE.InstancedBufferGeometry();
  glowGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  glowGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  glowGeometry.setAttribute("aLight", new THREE.InstancedBufferAttribute(new Float32Array(lights), 4));
  glowGeometry.setAttribute("aMove", new THREE.InstancedBufferAttribute(new Float32Array(moves), 4));
  glowGeometry.instanceCount = lights.length / 4;
  const glow = new THREE.Mesh(glowGeometry, new THREE.ShaderMaterial({ uniforms: { uTime: time, uStars: stars }, vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor }));
  glow.frustumCulled = false;
  glow.renderOrder = 5;
  freeze(glow);
  scene.add(glow);

  return {
    scene,
    update(t, camera, daylight) {
      sky.position.copy(camera.position);
      sky.updateMatrixWorld();
      time.value = t;
      skyUniforms.uStars.value = daylight.stars;
      stars.value = daylight.stars;
      hemi.color.copy(daylight.middle);
      hemi.groundColor.copy(daylight.water);
      hemi.intensity = 0.25 + (1 - daylight.stars) * 0.6;
    },
  };
}

/** Gives every vertex one colour. */
function paintAll(geometry: THREE.BufferGeometry, color: THREE.Color) {
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** One geometry from many: positions and normals, and colours if they have them. */
function merge(list: THREE.BufferGeometry[], colored: boolean) {
  const flat = list.map((g) => {
    const out = g.index ? g.toNonIndexed() : g;
    if (out !== g) g.dispose();
    for (const name of Object.keys(out.attributes)) if (name !== "position" && name !== "normal" && !(colored && name === "color")) out.deleteAttribute(name);
    return out;
  });
  const geometry = mergeGeometries(flat);
  for (const g of flat) g.dispose();
  return geometry;
}
