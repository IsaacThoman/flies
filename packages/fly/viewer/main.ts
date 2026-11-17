// A workbench for the fly model: every FlyPose value on a slider, presets
// for each behaviour, a turntable, slow motion, a fixed frame rate (to judge
// the wing blur at 30 and 60), and the in-game view: a 640×480 buffer with
// no antialiasing, stretched to 16:9 the way the TV shows it. It also
// exposes `window.viewer` so a script can pose, step and frame the fly
// deterministically for screenshots.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RESTING_POSE } from "@fly/contracts";
import type { FlyAnchor, FlyPose } from "@fly/contracts";
import { NERVE_PARTS, createFly, createNervesPanelMaterial } from "../src/index.ts";

const params = new URLSearchParams(location.search);
const stage = document.getElementById("stage")!;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

// A bright, glossy little world: sky, a pale ground with a faint grid (so a sliding foot shows), sun and sky light.
const scene = new THREE.Scene();
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(60, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec3 vDir; void main() { float y = vDir.y; vec3 c = mix(vec3(0.82, 0.93, 1.0), vec3(0.22, 0.55, 0.95), smoothstep(0.0, 0.7, y)); c = mix(vec3(0.75, 0.9, 0.8), c, smoothstep(-0.2, 0.02, y)); gl_FragColor = vec4(c, 1.0); }",
  }),
);
scene.add(sky);
const grid = new Uint8Array(64 * 64 * 4);
for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) {
  const line = i < 2 || j < 2 ? 0.86 : (i >> 4) % 2 === (j >> 4) % 2 ? 1 : 0.96;
  const o = (j * 64 + i) * 4;
  grid[o] = 236 * line; grid[o + 1] = 248 * line; grid[o + 2] = 232 * line; grid[o + 3] = 255;
}
const gridTexture = new THREE.DataTexture(grid, 64, 64);
gridTexture.wrapS = gridTexture.wrapT = THREE.RepeatWrapping;
gridTexture.repeat.set(40, 40);
gridTexture.magFilter = THREE.NearestFilter;
gridTexture.minFilter = THREE.LinearMipmapLinearFilter;
gridTexture.generateMipmaps = true;
gridTexture.colorSpace = THREE.SRGBColorSpace;
gridTexture.anisotropy = 8;
gridTexture.needsUpdate = true;
const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshPhysicalMaterial({ map: gridTexture, color: "#e8fff0", roughness: 0.35, clearcoat: 0.6 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
scene.add(new THREE.HemisphereLight("#dff1ff", "#9ccf8a", 1.6));
const sun = new THREE.DirectionalLight("#fff6e6", 2.6);
sun.position.set(-2, 4, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = sun.shadow.camera.bottom = -1.5;
sun.shadow.camera.right = sun.shadow.camera.top = 1.5;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 10;
sun.shadow.bias = -0.0005;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const fly = createFly();
// The nervous system is inside the body and casts no shadow of its own.
fly.object.traverse((o) => { o.castShadow = o.name !== "fly-nerves"; });
scene.add(fly.object);

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
camera.position.set(1.6, 1.0, 2.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.25, 0);
controls.enableDamping = true;

const pose: FlyPose = { ...RESTING_POSE };
const state = { turntable: false, roam: true, game: false, gamePx: 100, timescale: 1, fps: 0, heading: 0, height: 0, time: 0, glow: "none", part: 0 };

// --- Controls ---------------------------------------------------------------
type Slider = { key: keyof FlyPose; min: number; max: number; step: number };
const SLIDERS: Slider[] = [
  { key: "speed", min: -3, max: 10, step: 0.05 },
  { key: "turn", min: -6, max: 6, step: 0.05 },
  { key: "wings", min: 0, max: 1, step: 0.01 },
  { key: "groom", min: 0, max: 1, step: 0.01 },
  { key: "feed", min: 0, max: 1, step: 0.01 },
  { key: "crouch", min: 0, max: 1, step: 0.01 },
  { key: "sleep", min: 0, max: 1, step: 0.01 },
  { key: "pitch", min: -1, max: 1, step: 0.01 },
  { key: "roll", min: -1, max: 1, step: 0.01 },
  { key: "fullness", min: 0, max: 1, step: 0.01 },
];
const inputs = new Map<keyof FlyPose, { input: HTMLInputElement; out: HTMLOutputElement }>();
for (const s of SLIDERS) {
  const label = document.createElement("label");
  label.innerHTML = `${s.key}<input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="0" /><output>0</output>`;
  const input = label.querySelector("input")!, out = label.querySelector("output")!;
  input.addEventListener("input", () => {
    (pose[s.key] as number) = Number(input.value);
    out.textContent = Number(input.value).toFixed(2);
  });
  inputs.set(s.key, { input, out });
  document.getElementById("sliders")!.appendChild(label);
}
const airborneBox = document.getElementById("airborne") as HTMLInputElement;
airborneBox.addEventListener("change", () => { pose.airborne = airborneBox.checked; });
function syncInputs() {
  for (const [key, { input, out }] of inputs) {
    input.value = String(pose[key] ?? 0);
    out.textContent = ((pose[key] as number | undefined) ?? 0).toFixed(2);
  }
  airborneBox.checked = pose.airborne;
}

const PRESETS: Record<string, Partial<FlyPose>> = {
  rest: {},
  walk: { speed: 1.5 },
  run: { speed: 6 },
  "turn left": { speed: 1, turn: 2 },
  spin: { turn: 3 },
  back: { speed: -0.8 },
  groom: { groom: 0.8 },
  feed: { feed: 1 },
  "after a meal": { fullness: 1 },
  buzz: { wings: 0.4 },
  crouch: { crouch: 1, wings: 0 },
  sleep: { sleep: 1 },
  fly: { airborne: true, wings: 1, pitch: 0.5 },
  bank: { airborne: true, wings: 1, pitch: 0.4, roll: 0.5, speed: 4, turn: 1.5 },
};
for (const [name, values] of Object.entries(PRESETS)) {
  const button = document.createElement("button");
  button.textContent = name;
  button.addEventListener("click", () => setPose(values));
  document.getElementById("presets")!.appendChild(button);
}
function setPose(values: Partial<FlyPose>) {
  Object.assign(pose, RESTING_POSE, values);
  syncInputs();
}

const bind = (id: string, apply: (el: HTMLInputElement) => void) => {
  const el = document.getElementById(id) as HTMLInputElement;
  el.addEventListener("input", () => apply(el));
  el.addEventListener("change", () => apply(el));
};
bind("turntable", (el) => { state.turntable = el.checked; });
bind("roam", (el) => { state.roam = el.checked; });
bind("game", (el) => setGame(el.checked, state.gamePx));
bind("gamePx", (el) => { document.getElementById("gamePxOut")!.textContent = el.value; setGame(state.game, Number(el.value)); });
bind("xray", (el) => { fly.nerves.xray = Number(el.value); document.getElementById("xrayOut")!.textContent = el.value; });
bind("part", (el) => { state.part = Number(el.value); document.getElementById("partOut")!.textContent = NERVE_PARTS[state.part]?.id ?? ""; });
(document.getElementById("glow") as HTMLSelectElement).addEventListener("change", (e) => { state.glow = (e.target as HTMLSelectElement).value; });
bind("env", (el) => { scene.environment = el.checked ? environment : null; });
bind("shadows", (el) => { sun.castShadow = el.checked; });
(document.getElementById("timescale") as HTMLSelectElement).addEventListener("change", (e) => { state.timescale = Number((e.target as HTMLSelectElement).value); });
(document.getElementById("fps") as HTMLSelectElement).addEventListener("change", (e) => { state.fps = Number((e.target as HTMLSelectElement).value); });

const CAMERAS: Record<string, { from: [number, number, number]; to: [number, number, number] }> = {
  three: { from: [1.3, 0.85, 1.75], to: [0, 0.25, 0] },
  side: { from: [2.4, 0.3, 0], to: [0, 0.25, 0] },
  front: { from: [0, 0.35, 2.4], to: [0, 0.28, 0] },
  top: { from: [0, 2.6, 0.001], to: [0, 0.2, 0] },
  below: { from: [0.9, -0.05, 1.1], to: [0, 0.2, 0.1] },
  head: { from: [0.5, 0.5, 1.1], to: [0, 0.32, 0.4] },
  back: { from: [-0.9, 0.9, -1.6], to: [0, 0.3, 0] },
};
for (const name of Object.keys(CAMERAS)) {
  const button = document.createElement("button");
  button.textContent = name;
  button.addEventListener("click", () => setCamera(name));
  document.getElementById("cameras")!.appendChild(button);
}

/** Frames the camera relative to the fly: a preset name or explicit points in the fly's space. */
function setCamera(view: string | { from: [number, number, number]; to: [number, number, number] }) {
  const c = typeof view === "string" ? CAMERAS[view] : view;
  const o = fly.object;
  const toWorld = (p: [number, number, number]) => new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotation.y).add(o.position);
  camera.position.copy(toWorld(c.from));
  controls.target.copy(toWorld(c.to));
  controls.update();
}

// --- The in-game view -------------------------------------------------------
function setGame(on: boolean, px: number) {
  state.game = on;
  state.gamePx = px;
  stage.classList.toggle("game", on);
  if (on) {
    camera.fov = 50;
    // The game's camera is 16:9 squeezed into 640×480: a body length seen side-on spans px buffer pixels at this distance.
    const distance = 180 / (px * Math.tan(THREE.MathUtils.degToRad(25)));
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, distance);
  } else camera.fov = 35;
  resize();
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (state.game) {
    renderer.setPixelRatio(1);
    renderer.setSize(640, 480, false);
    const width = Math.min(w, (h * 16) / 9);
    renderer.domElement.style.width = `${width}px`;
    renderer.domElement.style.height = `${(width * 9) / 16}px`;
    camera.aspect = 16 / 9;
  } else {
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(w, h);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / h;
  }
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

// --- Simulation -------------------------------------------------------------
const before = new THREE.Vector3();
/** Advances the fly (and moves it over the ground as the pose says) by dt seconds. */
function advance(dt: number) {
  state.time += dt;
  const o = fly.object;
  before.copy(o.position);
  if (state.roam) {
    state.heading += pose.turn * dt;
    o.rotation.y = state.heading;
    o.position.x += Math.sin(state.heading) * pose.speed * dt;
    o.position.z += Math.cos(state.heading) * pose.speed * dt;
  }
  // In the air the viewer lifts the fly a little way; the model only poses it.
  const target = pose.airborne ? 0.7 : 0;
  state.height += (target - state.height) * (1 - Math.exp(-dt / (pose.airborne ? 0.25 : 0.12)));
  if (!pose.airborne && state.height < 0.002) state.height = 0;
  o.position.y = state.height;
  testGlow(state.time);
  fly.update(pose, dt);
  if (state.turntable) camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.5).add(controls.target);
  // The camera follows the fly over the ground.
  const moved = o.position.clone().sub(before).setY(0);
  camera.position.add(moved);
  controls.target.add(moved);
  sun.position.set(o.position.x - 2, 4, o.position.z + 2.5);
  sun.target.position.set(o.position.x, 0, o.position.z);
}

/**
 * Test patterns for looking at the drawing: every part, one role, one part,
 * or a wave travelling through the parts in their order (eyes inward, then
 * down the cord and out). The game lights it from the brain instead.
 */
function testGlow(t: number) {
  const glow = fly.nerves.glow;
  for (let i = 0; i < NERVE_PARTS.length; i++) {
    const role = NERVE_PARTS[i].role;
    let g = 0;
    if (state.glow === "all") g = 0.8;
    else if (state.glow === role) g = 0.9;
    else if (state.glow === "part") g = i === state.part ? 1 : 0;
    else if (state.glow === "levels") g = (i % 6) / 5;
    else if (state.glow === "wave") g = Math.max(0, 1 - Math.abs(((t * 12) % (NERVE_PARTS.length + 10)) - i) / 4);
    glow[i] = g;
  }
}

// The nervous system as the game's corner panel draws it (from above, at
// rest), large over the stage, to look at its drawing closely.
const panelScene = new THREE.Scene();
const panelUniforms = {
  uFrame: { value: new THREE.Vector2() },
  uPanel: { value: new THREE.Vector4() },
  uView: { value: new THREE.Vector4() },
  uPicture: { value: new THREE.Vector4() },
  uBackdrop: { value: null },
  uAlpha: { value: 1 },
};
let panelMesh: THREE.Mesh | null = null;
/** Shows the panel's view of the nervous system, `size` pixels square, showing `span` body lengths across; 0 hides it. */
function showPanel(size: number, span = 0.7, top = 0.6) {
  if (panelMesh) panelScene.remove(panelMesh);
  panelMesh = null;
  if (size <= 0) return;
  const frame = renderer.getDrawingBufferSize(new THREE.Vector2());
  panelUniforms.uFrame.value.copy(frame);
  const material = createNervesPanelMaterial(fly.nerves.glowUniform, fly.nerves.rest, panelUniforms);
  panelMesh = new THREE.Mesh(fly.nerves.geometry, material);
  panelMesh.frustumCulled = false;
  panelScene.add(panelMesh);
  const scale = size / span;
  panelUniforms.uPanel.value.set(0, 0, size, size);
  panelUniforms.uView.value.set(size / 2, top * scale, scale, scale);
  panelUniforms.uPicture.value.set(0, 0, size, size);
}

function render() {
  controls.update();
  renderer.render(scene, camera);
  if (panelMesh) {
    renderer.autoClear = false;
    renderer.render(panelScene, camera);
    renderer.autoClear = true;
  }
}

const statsEl = document.getElementById("stats")!;
let last = performance.now(), carry = 0, frames = 0, statsTime = 0, updateCost = 0;
function frame(now: number) {
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  carry += real;
  const step = state.fps > 0 ? 1 / state.fps : real;
  if (carry >= step - 1e-4) {
    const dt = (state.fps > 0 ? step : carry) * state.timescale;
    carry = state.fps > 0 ? carry - step : 0;
    const t0 = performance.now();
    advance(dt);
    updateCost += performance.now() - t0;
    render();
    frames++;
  }
  statsTime += real;
  if (statsTime > 0.5) {
    const info = renderer.info.render;
    statsEl.textContent = `draw calls ${info.calls}\ntriangles  ${info.triangles}\nupdate     ${((updateCost / frames) * 1000).toFixed(1)} µs\nsteps      ${[...fly.rig.gait.steps].join(" ")}`;
    statsTime = 0; frames = 0; updateCost = 0;
  }
  if (!paused) requestAnimationFrame(frame);
}

// --- Scripting ---------------------------------------------------------------
const paused = params.has("shot");
if (paused) document.body.classList.add("shot");
const anchor = new THREE.Vector3();
const api = {
  pose,
  set: (values: Partial<FlyPose>) => setPose(values),
  /** Steps the simulation by `seconds` at `fps`, then renders once. */
  step(seconds: number, fps = 60) {
    const n = Math.max(1, Math.round(seconds * fps));
    for (let i = 0; i < n; i++) advance(1 / fps);
    render();
  },
  /** Steps and renders one frame at a time, calling back after each (for frame sequences). */
  camera: setCamera,
  game: (on: boolean, px = 100) => setGame(on, px),
  environment: (on: boolean) => { scene.environment = on ? environment : null; },
  size(width: number, height: number) {
    stage.style.flex = "none";
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    resize();
  },
  anchor: (name: FlyAnchor) => fly.anchor(name, anchor).toArray(),
  xray(amount: number, glow = "all", part = 0) {
    fly.nerves.xray = amount;
    state.glow = glow;
    state.part = typeof part === "string" ? NERVE_PARTS.findIndex((p) => p.id === part) : part;
  },
  parts: () => NERVE_PARTS.map((p) => p.id),
  panel: showPanel,
  /** Shows only the meshes named (fly-body, fly-wings, fly-nerves), or all of them. */
  only(...names: string[]) {
    fly.object.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.visible = !names.length || names.includes(o.name); });
  },
  background(color: string | null) {
    sky.visible = ground.visible = color === null;
    scene.background = color === null ? null : new THREE.Color(color);
  },
  info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, steps: [...fly.rig.gait.steps] }),
  reset() {
    fly.object.position.set(0, 0, 0);
    state.heading = 0;
    state.height = 0;
    setPose({});
  },
  render,
  state,
};
Object.assign(window, { viewer: api });

resize();
setCamera("three");
syncInputs();
if (!paused) requestAnimationFrame(frame);
else {
  advance(0.5);
  render();
}
