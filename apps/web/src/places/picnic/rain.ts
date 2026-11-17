// Rain at the picnic, in three draws, each only while there is something to
// show: drops falling round the camera as streaks (all worked out in the
// shader from the time), splashes where they land (a crown of droplets and a
// ring spreading in the wet), and beads of water left lying on the fruit and
// the lid, gathering as things get wet and going as they dry (the table's
// own are in its shader, table.ts).

import * as THREE from "three";
import { PICNIC, SOLIDS, World, createSurface } from "@fly/world";
import { random } from "../../scene/build.ts";
import type { Daylight } from "../../scene/light.ts";
import { shaded } from "../../scene/shade.ts";
import type { Weather } from "../../scene/weather.ts";

/** How fast the drops fall, mm/s: light rain. */
export const FALL_SPEED = 3800;
/**
 * The drops fill boxes round the camera, each a size and a count: a few big
 * close ones, more in the middle distance, many fine ones out over the whole
 * table. Every size divides the largest, so the fall can wrap round it.
 */
const LAYERS = [
  { size: 400, count: 500 },
  { size: 800, count: 900 },
  { size: 3200, count: 1400 },
] as const;
const WRAP = 3200;
const BASE_DROPS = LAYERS.reduce((n, l) => n + l.count, 0);
const HEAVY_DROPS = 5600;
/** How many splashes can be under way at once. */
const SPLASHES = 56;
/** Seconds a splash's ring takes to spread and fade; its crown is quicker. */
export const SPLASH_LIFE = 0.6;
/** Beads of water left lying on the fruit, the saucer and the lid when it is wet. */
const BEADS = 90;

const STREAK_VS = /* glsl */ `
attribute vec4 drop;
uniform vec3 uOffset;
uniform vec3 uFall;
uniform float uRain;
uniform float uHeavy;
uniform float uTime;
uniform float uHalfHeight;
varying vec3 vWorld;
varying float vSheet;
uniform vec4 uJars[2];
varying vec2 vUv;
varying float vAlpha;
const float WIDTH = 0.45;
const float SHUTTER = 0.011;
float hash(vec3 p) { return fract(sin(dot(p, vec3(91.7, 13.1, 47.3))) * 43758.5453); }
void main() {
  vSheet = 0.0;
  if (drop.w == 0.0) {
    vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
    vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
    vec3 ahead=-vec3(viewMatrix[0][2],viewMatrix[1][2],viewMatrix[2][2]);
    float distance=900.0+drop.x*850.0;
    vWorld=cameraPosition+ahead*distance+right*position.x*distance*1.2/projectionMatrix[0][0]+up*(position.y*2.0-1.0)*distance*1.2/projectionMatrix[1][1];
    vSheet=drop.x+1.0;
    vUv=vec2(0.0); vAlpha=0.0;
    gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);
    return;
  }
  vWorld=vec3(0.0);
  float size = abs(drop.w);
  // Where the drop is in the box round the camera, the box moving with the camera and the rain falling through it.
  vec3 rel = mod(drop.xyz * size + uOffset - cameraPosition + 0.5 * size, size) - 0.5 * size;
  vec3 head = cameraPosition + rel;
  vec3 axis = normalize(uFall);
  vec3 at = head - axis * length(uFall) * mix(SHUTTER, 0.0035, uHeavy) * position.y;
  vec3 toEye = cameraPosition - at;
  float dist = length(toEye);
  vec3 side = normalize(cross(toEye, axis));
  // At least a pixel and a bit wide, fainter for it, so far drops are fine lines and never break up.
  float perPixel = dist / (projectionMatrix[1][1] * uHalfHeight);
  float width = max(WIDTH, perPixel * 1.3);
  at += side * position.x * width * 0.5;
  vec3 edge = abs(rel) / (0.5 * size);
  float inBox = 1.0 - smoothstep(0.7, 1.0, max(edge.x, max(edge.y, edge.z)));
  float dry = 1.0;
  for (int i = 0; i < 2; i++) {
    vec2 d = head.xz - uJars[i].xy;
    if (dot(d, d) < uJars[i].z * uJars[i].z && head.y < uJars[i].w) dry = 0.0;
  }
  float sheet = 0.55 + 0.45 * sin(head.x * 0.004 + head.z * 0.001 + uTime * 0.55);
  float coverage = uRain * mix(1.0, 0.3 + 0.7 * sheet, uHeavy);
  coverage *= drop.w < 0.0 ? uHeavy : 1.0;
  float shown = step(hash(drop.xyz), coverage);
  vAlpha = shown * inBox * dry * smoothstep(mix(5.0, 80.0, uHeavy), mix(30.0, 200.0, uHeavy), dist) * (WIDTH / width * (1.0 + uHeavy * 0.5));
  vUv = position.xy;
  gl_Position = projectionMatrix * viewMatrix * vec4(at, 1.0);
}`;

const STREAK_FS = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uShade;
uniform float uTime; uniform float uRain; uniform float uHeavy; uniform float uSheetDrift;
varying vec3 vWorld; varying float vSheet;
float hash(vec2 p) { return fract(sin(dot(mod(p,16.0),vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);
}
varying vec2 vUv;
varying float vAlpha;
void main() {
  // Three distant veils share the drop batch: heavy rain loses contrast in sheets.
  if (vSheet>0.5) {
    float seed=(vSheet-1.0)*4.7;
    vec2 p=vec2(vWorld.x*0.002-uSheetDrift,vWorld.y*0.0008+uTime*0.2)+seed;
    float curtain=smoothstep(0.3,0.85,noise(p));
    float fine=noise(p*vec2(5.0,1.0)+vec2(seed,uTime*0.5));
    float alpha=(0.035+0.09*curtain)*(0.65+0.35*fine)*uHeavy*uRain;
    gl_FragColor=vec4(uColor,alpha);
    return;
  }
  // A drop is a lens: a bright line down its middle, the world behind it darker and turned over at its sides, so it shows against the white table as against the hills.
  float x = abs(vUv.x);
  float core = 1.0 - smoothstep(0.0, 0.45, x);
  float rim = smoothstep(0.25, 0.6, x) * (1.0 - smoothstep(0.75, 1.0, x));
  // Brightest at the drop itself, the streak behind it fading.
  float along = smoothstep(0.0, 0.08, vUv.y) * (1.0 - vUv.y * 0.7);
  vec3 c = mix(uShade, uColor, core / max(core + rim, 1e-3));
  gl_FragColor = vec4(c, vAlpha * along * (core * 0.75 + rim * 0.45));
}`;

const SPLASH_VS = /* glsl */ `
attribute vec4 aSplash;
attribute vec2 aShape;
attribute float aPart;
uniform float uTime;
varying vec2 vUv;
varying float vFade;
varying float vRing;
const float LIFE = ${SPLASH_LIFE.toFixed(2)};
const float CROWN = 0.26;
void main() {
  float age = uTime - aSplash.w;
  float size = aShape.x;
  vec3 world;
  vUv = position.xy;
  if (aPart < 0.5) {
    // The ring, spreading in the wet and fading.
    float k = clamp(age / LIFE, 0.0, 1.0);
    float r = size * (0.4 + 2.6 * sqrt(k));
    world = aSplash.xyz + vec3(position.x * r, 0.03, position.y * r);
    vFade = 1.0 - k;
    vRing = 1.0;
  } else {
    // A droplet of the crown, thrown out and up and falling back.
    float t = clamp(age / CROWN, 0.0, 1.0);
    float jitter = fract(aShape.y * 13.0 + aPart * 0.37);
    float a = aPart * 1.0472 + aShape.y * 6.2832 + jitter * 0.6;
    float reach = size * (0.25 + 1.9 * t) * (0.75 + 0.5 * jitter);
    float up = size * 3.4 * t * (1.0 - t) * (0.6 + 0.8 * fract(aShape.y * 7.0 + aPart * 0.71));
    vec3 c = aSplash.xyz + vec3(cos(a) * reach, up, sin(a) * reach);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 above = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    world = c + (right * position.x + above * position.y) * size * 0.17 * (1.0 - 0.4 * t);
    vFade = (1.0 - t * t) * step(age, CROWN);
    vRing = 0.0;
  }
  if (age < 0.0 || age > LIFE) world = vec3(0.0, -1e5, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const SPLASH_FS = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uShine;
varying vec2 vUv;
varying float vFade;
varying float vRing;
void main() {
  float d = length(vUv);
  if (d > 1.0) discard;
  if (vRing > 0.5) {
    // The ring's crest catches the light; a darker trough runs inside it, where the water is drawn up.
    float crest = smoothstep(0.7, 0.86, d) * (1.0 - smoothstep(0.88, 1.0, d));
    float trough = smoothstep(0.4, 0.72, d) * (1.0 - smoothstep(0.72, 0.84, d));
    vec3 c = mix(uColor * 0.8, uShine, crest);
    gl_FragColor = vec4(c, (crest * 0.7 + trough * 0.15) * vFade);
  } else {
    float body = 1.0 - smoothstep(0.5, 1.0, d);
    float glint = 1.0 - smoothstep(0.0, 0.45, length(vUv - vec2(-0.3, 0.3)));
    gl_FragColor = vec4(mix(uColor, uShine, 0.5 + 0.5 * glint), body * vFade * 0.9);
  }
}`;

/** Water: clear where you look straight through it, mirror-bright at its edge, with the dark band a lens makes (as the dew on the table). */
const BEAD_FRAGMENT = /* glsl */ `float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
float edge = pow(1.0 - facing, 2.0);
float lens = smoothstep(0.25, 0.55, 1.0 - facing) * (1.0 - smoothstep(0.75, 0.97, 1.0 - facing));
outgoingLight *= 1.0 - lens * 0.45;
outgoingLight += vec3(0.08, 0.1, 0.12) * (1.0 - edge);
diffuseColor.a = clamp(0.18 + edge * 0.85 + lens * 0.25 + dot(outgoingLight, vec3(0.3)) * 0.15, 0.0, 1.0);
#include <opaque_fragment>`;

export class Rain {
  readonly group = new THREE.Group();
  readonly #streaks: THREE.Mesh;
  readonly #splashes: THREE.Mesh;
  readonly #beads: THREE.InstancedMesh;
  readonly #streakUniforms = {
    uOffset: { value: new THREE.Vector3() },
    uFall: { value: new THREE.Vector3(0, -FALL_SPEED, 0) },
    uRain: { value: 0 },
    uHeavy: { value: 0 },
    uTime: { value: 0 },
    uSheetDrift: { value: 0 },
    uHalfHeight: { value: 240 },
    uJars: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uColor: { value: new THREE.Color() },
    uShade: { value: new THREE.Color() },
  };
  readonly #splashUniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color() }, uShine: { value: new THREE.Color() } };
  readonly #wet = { value: 0 };
  readonly #splash: THREE.InstancedBufferAttribute;
  readonly #shape: THREE.InstancedBufferAttribute;
  #next = 0;
  #last = -1;

  constructor() {
    // The streaks: one quad per drop, x across it (-1 to 1) and y from its head (0) back along its trail (1).
    const rnd = random(61);
    const streaks = new THREE.InstancedBufferGeometry();
    streaks.setIndex([0, 1, 2, 0, 2, 3]);
    streaks.setAttribute("position", new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    const total = BASE_DROPS + HEAVY_DROPS + 3;
    const drops = new Float32Array(total * 4);
    // A zero box size selects a veil; the rest are ordinary falling drops.
    for (let i=0;i<3;i++) drops.set([i,0,0,0],i*4);
    let k = 3;
    for (const layer of LAYERS) {
      for (let i = 0; i < layer.count; i++, k++) drops.set([rnd.next(), rnd.next(), rnd.next(), layer.size], k * 4);
    }
    for (; k < total; k++) {
      const size = k < BASE_DROPS + 1403 ? 400 : k < BASE_DROPS + 3503 ? 800 : 3200;
      drops.set([rnd.next(), rnd.next(), rnd.next(), -size], k * 4);
    }
    streaks.setAttribute("drop", new THREE.InstancedBufferAttribute(drops, 4));
    streaks.instanceCount = BASE_DROPS + 3;
    const jars = SOLIDS.filter((s) => s.name === "lemonade" || s.name === "jam");
    jars.forEach((jar, i) => {
      const f = jar.footprint as { x: number; z: number; r: number };
      this.#streakUniforms.uJars.value[i].set(f.x, f.z, f.r + 1, (jar.top as { y: number }).y);
    });
    this.#streaks = new THREE.Mesh(streaks, new THREE.ShaderMaterial({ uniforms: this.#streakUniforms, vertexShader: STREAK_VS, fragmentShader: STREAK_FS, transparent: true, depthWrite: false }));
    this.#streaks.frustumCulled = false;
    this.#streaks.renderOrder = 5;
    this.#streaks.visible = false;
    this.group.add(this.#streaks);
    // The splashes: per splash a ring lying on the surface, and six droplets facing the camera.
    const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
    const position: number[] = [];
    const part: number[] = [];
    const index: number[] = [];
    for (let p = 0; p < 7; p++) {
      for (let c = 0; c < 4; c++) {
        position.push(corners[c * 2], corners[c * 2 + 1], 0);
        part.push(p);
      }
      index.push(p * 4, p * 4 + 2, p * 4 + 1, p * 4, p * 4 + 3, p * 4 + 2);
    }
    const splashes = new THREE.InstancedBufferGeometry();
    splashes.setIndex(index);
    splashes.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
    splashes.setAttribute("aPart", new THREE.Float32BufferAttribute(part, 1));
    this.#splash = new THREE.InstancedBufferAttribute(new Float32Array(SPLASHES * 4).fill(-1e4), 4);
    this.#shape = new THREE.InstancedBufferAttribute(new Float32Array(SPLASHES * 2), 2);
    this.#splash.setUsage(THREE.DynamicDrawUsage);
    this.#shape.setUsage(THREE.DynamicDrawUsage);
    splashes.setAttribute("aSplash", this.#splash);
    splashes.setAttribute("aShape", this.#shape);
    splashes.instanceCount = SPLASHES;
    this.#splashes = new THREE.Mesh(splashes, new THREE.ShaderMaterial({ uniforms: this.#splashUniforms, vertexShader: SPLASH_VS, fragmentShader: SPLASH_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.#splashes.frustumCulled = false;
    this.#splashes.renderOrder = 4;
    this.#splashes.visible = false;
    this.group.add(this.#splashes);

    this.#beads = beads(this.#wet);
    this.group.add(this.#beads);
  }

  /** A drop landing at a point: a crown and a ring, `size` mm across or so. */
  splash(x: number, y: number, z: number, size: number) {
    const i = this.#next;
    this.#next = (this.#next + 1) % SPLASHES;
    this.#splash.setXYZW(i, x, y, z, this.#splashUniforms.uTime.value);
    this.#shape.setXY(i, size, Math.random());
    this.#splash.needsUpdate = true;
    this.#shape.needsUpdate = true;
    this.#last = this.#splashUniforms.uTime.value;
  }

  /** `wind` is the air's velocity over the table (mm/s), slanting the rain and carrying it. */
  update(time: number, dt: number, light: Daylight, weather: Weather, wind: { x: number; z: number }) {
    const rain = weather.rain;
    const s = this.#streakUniforms;
    this.#streaks.visible = rain > 0.01;
    if (this.#streaks.visible) {
      s.uRain.value = Math.min(1, rain * 1.1);
      const speed = FALL_SPEED * (1 + weather.heavy * 0.7);
      s.uHeavy.value = weather.heavy;
      (this.#streaks.geometry as THREE.InstancedBufferGeometry).instanceCount = BASE_DROPS + 3 + Math.ceil(HEAVY_DROPS * weather.heavy);
      s.uTime.value = time;
      // The noise repeats every 16 cells, matching this integrated wrap.
      s.uSheetDrift.value = (s.uSheetDrift.value + (wind.x + wind.z * 0.35) * dt * 0.002) % 16;
      s.uFall.value.set(wind.x, -speed, wind.z);
      const o = s.uOffset.value;
      o.set((o.x + wind.x * dt) % WRAP, (o.y - speed * dt) % WRAP, (o.z + wind.z * dt) % WRAP);
      // Drops are lit by the sky behind and round them: pale, a little brighter than the haze.
      s.uColor.value.copy(light.haze).lerp(light.skyColor, 0.5).multiplyScalar(1.25 + light.sunIntensity * 0.15);
      s.uShade.value.copy(light.groundColor).lerp(light.haze, 0.3).multiplyScalar(0.45);
    }
    const u = this.#splashUniforms;
    u.uTime.value = time;
    this.#splashes.visible = time - this.#last < SPLASH_LIFE;
    if (this.#splashes.visible) {
      u.uColor.value.copy(light.horizon).lerp(light.skyColor, 0.5);
      u.uShine.value.copy(light.sunColor).multiplyScalar(0.4 + light.sunIntensity * 0.4).add(u.uColor.value).multiplyScalar(0.8);
    }
    this.#wet.value = weather.wet;
    this.#beads.visible = weather.wet > 0.02;
  }

  /** The renderer's frame, for the streaks' pixel width. */
  set halfHeight(pixels: number) {
    this.#streakUniforms.uHalfHeight.value = pixels;
  }
}

/** Beads of water on the fruit, the saucer and the lid, each appearing at its own wetness. */
function beads(wet: { value: number }) {
  const world = new World(PICNIC);
  const surface = createSurface();
  const rnd = random(83);
  const matrices: THREE.Matrix4[] = [];
  const thresholds: number[] = [];
  const tops = SOLIDS.filter((s) => ["strawberry", "strawberry half", "cherry", "apple", "orange slice", "lemonade", "saucer"].includes(s.name));
  const up = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3();
  const q = new THREE.Quaternion();
  for (let tries = 0; tries < 2000 && matrices.length < BEADS; tries++) {
    const solid = tops[Math.floor(rnd.next() * tops.length)];
    const f = solid.footprint as { x: number; z: number; r?: number; rx?: number; rz?: number };
    const reach = (f.r ?? Math.min(f.rx!, f.rz!)) * Math.sqrt(rnd.next()) * 0.9;
    const a = rnd.range(0, Math.PI * 2);
    const x = f.x + Math.cos(a) * reach;
    const z = f.z + Math.sin(a) * reach;
    const s = world.surface(x, z, surface);
    // Only where it's level enough for a drop to sit.
    if (s.normal.y < 0.6 || s.solid < 0) continue;
    const r = rnd.range(0.3, 1.1);
    n.set(s.normal.x, s.normal.y, s.normal.z);
    q.setFromUnitVectors(up, n);
    matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(x, s.y, z), q, new THREE.Vector3(r, Math.min(0.45, r * 0.55), r)));
    thresholds.push(rnd.range(0.04, 0.8));
  }
  const geometry = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  geometry.setAttribute("aAppear", new THREE.InstancedBufferAttribute(Float32Array.from(thresholds), 1));
  const material = shaded(new THREE.MeshStandardMaterial({ color: "#cfe6f5", roughness: 0.04, transparent: true, envMapIntensity: 2.4, depthWrite: false }));
  const beforeShade = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    shader.uniforms.uWet = wet;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aAppear;\nuniform float uWet;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed *= smoothstep(aAppear, aAppear + 0.15, uWet);");
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", BEAD_FRAGMENT);
    beforeShade(shader, renderer);
  };
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.computeBoundingSphere();
  mesh.renderOrder = 4;
  mesh.visible = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrixWorld(true);
  mesh.matrixWorldAutoUpdate = false;
  return mesh;
}
