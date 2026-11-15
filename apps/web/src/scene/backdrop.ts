// Everything far beyond the table: sky, clouds, rolling hills with lollipop
// trees, the lawn the table stands on, and the lake. Drawn in its own pass
// with its own depth range (the table is millimetres from the camera, the
// hills hundreds of metres), in six draws.

import * as THREE from "three";
import { Batch, canvas2d, canvasTexture, freeze, paint, random } from "./build.ts";
import type { Daylight } from "./light.ts";

/** The lawn is this far below the table top, mm (a café table is 75 cm tall). */
export const LAWN_Y = -760;
/** The lake's surface, mm. */
export const LAKE_Y = -3400;

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FS = /* glsl */ `
uniform vec3 zenith; uniform vec3 middle; uniform vec3 horizon;
uniform vec3 sunDir; uniform vec3 sunColor; uniform float glow; uniform float stars; uniform float time;
uniform vec3 ground;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(horizon, middle, smoothstep(0.0, 0.22, h));
  c = mix(c, zenith, smoothstep(0.18, 0.85, h));
  float s = max(dot(d, sunDir), 0.0);
  // The glow round the sun, wide at sunset.
  c += sunColor * (pow(s, 6.0) * glow + pow(s, 48.0) * 0.35);
  // The disc.
  c = mix(c, vec3(1.0, 0.99, 0.95), smoothstep(0.9994, 0.9997, s));
  if (stars > 0.0 && h > 0.0) {
    vec3 cell = floor(d * 360.0);
    float star = step(0.9975, hash(cell)) * smoothstep(0.02, 0.3, h);
    float twinkle = 0.6 + 0.4 * sin(time * 3.0 + hash(cell + 1.0) * 40.0);
    c += vec3(star * twinkle * stars);
  }
  if (h < 0.0) c = mix(horizon, ground, smoothstep(0.0, -0.08, h));
  gl_FragColor = vec4(c, 1.0);
}`;

const WATER_VS = /* glsl */ `
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WATER_FS = /* glsl */ `
uniform vec3 water; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float time;
varying vec3 vWorld;
#include <fog_pars_fragment>
float wave(vec2 p) {
  return sin(p.x * 0.011 + time * 0.9) * 0.5 + sin(p.y * 0.017 - time * 1.3) * 0.35 + sin((p.x + p.y) * 0.031 + time * 2.1) * 0.15;
}
void main() {
  vec3 view = normalize(vWorld - cameraPosition);
  vec2 p = vWorld.xz;
  float e = 3.0;
  vec3 n = normalize(vec3(wave(p + vec2(e, 0.0)) - wave(p - vec2(e, 0.0)), 6.0, wave(p + vec2(0.0, e)) - wave(p - vec2(0.0, e))));
  vec3 r = reflect(view, n);
  float fres = pow(1.0 - max(dot(-view, n), 0.0), 3.0);
  vec3 sky = mix(horizon, zenith, smoothstep(0.0, 0.5, r.y));
  vec3 c = mix(water, sky, 0.25 + 0.65 * fres);
  float glint = pow(max(dot(r, sunDir), 0.0), 220.0);
  float sparkle = step(0.6, fract(sin(dot(floor(p * 0.02), vec2(12.9, 78.2))) * 4375.5 + time * 0.7));
  c += sunColor * glint * (1.5 + sparkle * 2.5);
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
}`;

const CLOUD_VS = /* glsl */ `
attribute vec4 cloud;
attribute float layer;
varying vec2 vUv;
varying float vLayer;
void main() {
  vUv = uv;
  vLayer = layer;
  vec4 mv = modelViewMatrix * vec4(cloud.xyz, 1.0);
  mv.xy += position.xy * vec2(cloud.w, cloud.w * 0.55);
  gl_Position = projectionMatrix * mv;
}`;

const CLOUD_FS = /* glsl */ `
uniform sampler2D map; uniform vec3 tint; uniform vec3 shade;
varying vec2 vUv;
varying float vLayer;
void main() {
  vec2 uv = vec2((vUv.x + vLayer) * 0.25, vUv.y);
  vec4 t = texture2D(map, uv);
  vec3 c = mix(shade, tint, t.r);
  gl_FragColor = vec4(c, t.a);
}`;

/** Four puffy cumulus pictures side by side: white where lit, the red channel darker toward the shaded base. */
function cloudTexture() {
  const W = 1024;
  const H = 256;
  const { canvas, g } = canvas2d(W, H);
  const rnd = random(77);
  for (let k = 0; k < 4; k++) {
    const ox = k * 256;
    for (let i = 0; i < 26; i++) {
      const x = ox + 128 + rnd.range(-80, 80) * (1 - i / 40);
      const y = 150 + rnd.range(-36, 18) - Math.max(0, 46 - Math.abs(x - ox - 128) * 0.55) * rnd.next();
      const r = rnd.range(26, 54);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.6, "rgba(255,255,255,0.88)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  // Shade toward the base: darken red (the shader reads red as how lit it is).
  g.globalCompositeOperation = "source-atop";
  const shade = g.createLinearGradient(0, 90, 0, 210);
  shade.addColorStop(0, "rgba(255,255,255,0)");
  shade.addColorStop(1, "rgba(0,255,255,0.55)");
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "source-over";
  return canvasTexture(canvas, { srgb: false });
}

function grassTexture() {
  const { canvas, g } = canvas2d(256, 256);
  g.fillStyle = "#7fd14a";
  g.fillRect(0, 0, 256, 256);
  const rnd = random(3);
  for (let i = 0; i < 2600; i++) {
    const x = rnd.range(0, 256);
    const y = rnd.range(0, 256);
    const shade = rnd.next();
    g.strokeStyle = shade > 0.6 ? "rgba(190, 240, 110, 0.7)" : shade > 0.3 ? "rgba(70, 160, 50, 0.6)" : "rgba(120, 210, 70, 0.6)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + rnd.range(-2, 2), y - rnd.range(4, 9));
    g.stroke();
  }
  const texture = canvasTexture(canvas, { repeat: true });
  texture.repeat.set(160, 160);
  return texture;
}

function daisyTexture() {
  const { canvas, g } = canvas2d(64, 64);
  g.fillStyle = "#ffffff";
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    g.beginPath();
    g.ellipse(32 + Math.cos(a) * 15, 32 + Math.sin(a) * 15, 13, 5, a, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#ffd21a";
  g.beginPath();
  g.arc(32, 32, 8, 0, Math.PI * 2);
  g.fill();
  return canvasTexture(canvas);
}

/** The lake: an ellipse toward -z, its centre and radii (mm). */
const LAKE = { z: -210_000, rx: 340_000, rz: 150_000 };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The height of the land at a point (mm): the lawn round the table, sloping down to the lake toward -z, rolling hills elsewhere, mountains far off. */
export function hillHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const a = Math.atan2(x, -z);
  // How much this direction looks out over the lake (1 straight toward it).
  const lakeward = 1 - smooth(0.7, 1.3, Math.abs(a));
  const rolling = 7000 * Math.sin(a * 3 + 1.3) + 5000 * Math.sin(a * 7 + r * 0.00002) + 3000 * Math.sin(x * 0.000031 + z * 0.000017);
  const hills = smooth(18_000, 120_000, r) * (rolling + 11_000) + Math.max(0, r - 500_000) * 0.16;
  // Down toward the shore on the lake side.
  const lx = x / LAKE.rx;
  const lz = (z - LAKE.z) / LAKE.rz;
  const toLake = Math.sqrt(lx * lx + lz * lz);
  const shore = LAWN_Y - 2600 * smooth(1.6, 1.0, toLake);
  if (toLake < 1) return LAKE_Y - 2500 * smooth(1, 0.7, toLake);
  // Beyond the lake the hills rise again.
  const beyond = smooth(1.0, 1.6, toLake);
  return lakeward > 0 && z < 0 ? shore * lakeward + (LAWN_Y + hills * (1 - lakeward * (1 - beyond))) * (1 - lakeward) + hills * beyond * lakeward : LAWN_Y + hills;
}

export type Backdrop = {
  scene: THREE.Scene;
  /** Keeps the sky round the camera and moves the light, water and clouds. */
  update(time: number, camera: THREE.Camera, light: Daylight): void;
};

export function buildBackdrop(light: Daylight): Backdrop {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(light.haze.getHex(), 120_000, 1_400_000);
  scene.matrixWorldAutoUpdate = true;

  const skyUniforms = {
    zenith: { value: light.zenith },
    middle: { value: light.middle },
    horizon: { value: light.horizon },
    sunDir: { value: light.sunDirection },
    sunColor: { value: light.sunColor },
    glow: { value: light.glow },
    stars: { value: light.stars },
    time: { value: 0 },
    ground: { value: light.groundColor },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2_000_000, 32, 16),
    new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // Lights for the hills and trees.
  const hemi = new THREE.HemisphereLight(light.skyColor, light.groundColor, light.hemiIntensity);
  const sun = new THREE.DirectionalLight(light.sunColor, light.sunIntensity);
  scene.add(hemi, sun);

  // Hills and lawn: one mesh, a polar grid with heights and colours.
  const rings = 56;
  const segments = 120;
  const radii: number[] = [];
  for (let i = 0; i <= rings; i++) radii.push(1500 * Math.pow(1_500_000 / 1500, i / rings));
  const positions: number[] = [];
  const colors: number[] = [];
  const grass = new THREE.Color("#79d64b");
  const meadow = new THREE.Color("#b8ec5a");
  const dark = new THREE.Color("#4fae3e");
  const sand = new THREE.Color("#f2e6b8");
  const far = new THREE.Color("#8fb8d8");
  const c = new THREE.Color();
  const vertex = (r: number, a: number) => {
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = hillHeight(x, z);
    positions.push(x, y, z);
    const shore = y < LAKE_Y + 600 ? 1 : 0;
    const k = 0.5 + 0.5 * Math.sin(x * 0.00011 + z * 0.00007) * Math.cos(z * 0.00013);
    c.copy(grass).lerp(meadow, k * 0.7).lerp(dark, Math.min(1, Math.max(0, (y - 4000) / 30000)) * 0.5);
    if (shore) c.copy(sand);
    c.lerp(far, smooth(250_000, 1_200_000, r) * 0.85);
    colors.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a0 = (j / segments) * Math.PI * 2;
      const a1 = ((j + 1) / segments) * Math.PI * 2;
      const r0 = radii[i];
      const r1 = radii[i + 1];
      vertex(r0, a0);
      vertex(r1, a1);
      vertex(r1, a0);
      vertex(r0, a0);
      vertex(r0, a1);
      vertex(r1, a1);
    }
  }
  const hillGeometry = new THREE.BufferGeometry();
  hillGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  hillGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  hillGeometry.computeVertexNormals();
  const hills = new THREE.Mesh(hillGeometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  freeze(hills);
  scene.add(hills);

  // The lawn round the table: grass you can almost see the blades of, and daisies.
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(26_000, 48).rotateX(-Math.PI / 2).translate(0, LAWN_Y + 4, 0), new THREE.MeshLambertMaterial({ map: grassTexture(), color: "#ffffff" }));
  freeze(lawn);
  scene.add(lawn);
  const daisyRnd = random(31);
  const daisies = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: daisyTexture(), transparent: true, alphaTest: 0.4 }), 260);
  for (let i = 0; i < 260; i++) {
    const a = daisyRnd.range(0, Math.PI * 2);
    const r = 500 + Math.pow(daisyRnd.next(), 0.7) * 9000;
    const size = daisyRnd.range(28, 46);
    daisies.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r, LAWN_Y + 10 + daisyRnd.range(0, 40), Math.sin(a) * r), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), daisyRnd.range(0, 6)), new THREE.Vector3(size, 1, size)));
  }
  daisies.computeBoundingSphere();
  freeze(daisies);
  scene.add(daisies);

  // The lake.
  const waterUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 } }]);
  Object.assign(waterUniforms, { water: { value: light.water }, zenith: { value: light.zenith }, horizon: { value: light.horizon }, sunDir: { value: light.sunDirection }, sunColor: { value: light.sunColor } });
  const lake = new THREE.Mesh(
    new THREE.PlaneGeometry(700_000, 420_000).rotateX(-Math.PI / 2).translate(0, LAKE_Y, -240_000),
    new THREE.ShaderMaterial({ uniforms: waterUniforms, vertexShader: WATER_VS, fragmentShader: WATER_FS, fog: true }),
  );
  freeze(lake);
  scene.add(lake);

  // Lollipop trees on the hills, one instanced draw.
  const rnd = random(5);
  const tree = new Batch();
  const treeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  tree.add(treeMaterial, paint(new THREE.CylinderGeometry(0.05, 0.08, 1, 6).translate(0, 0.5, 0), "#9a6a40"));
  tree.add(treeMaterial, paint(new THREE.IcosahedronGeometry(0.55, 2).translate(0, 1.25, 0), (p) => (p.y > 1.45 ? "#b6f070" : p.y > 1.15 ? "#78d84a" : "#4fb83a")));
  const holder = new THREE.Group();
  const [treeMesh] = tree.build(holder);
  const placed: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let tries = 0; tries < 2000 && placed.length < 160; tries++) {
    const a = rnd.range(0, Math.PI * 2);
    const r = rnd.range(45_000, 420_000);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = hillHeight(x, z);
    if (y < LAKE_Y + 1200) continue;
    const size = rnd.range(3500, 6500) * (r > 200_000 ? 1.8 : 1);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd.range(0, 6.28));
    placed.push(m.compose(p.set(x, y - 200, z), q, s.set(size, size * rnd.range(0.9, 1.3), size)).clone());
  }
  const trees = new THREE.InstancedMesh(treeMesh.geometry, treeMaterial, placed.length);
  placed.forEach((matrix, i) => trees.setMatrixAt(i, matrix));
  trees.computeBoundingSphere();
  freeze(trees);
  scene.add(trees);

  // Clouds: camera-facing puffs in one instanced draw, far off round the sky.
  const cloudCount = 26;
  const cloudGeometry = new THREE.InstancedBufferGeometry();
  cloudGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  cloudGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  cloudGeometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  const cloudData = new Float32Array(cloudCount * 4);
  const layers = new Float32Array(cloudCount);
  const cloudRnd = random(19);
  for (let i = 0; i < cloudCount; i++) {
    const a = cloudRnd.range(-Math.PI, Math.PI);
    const r = cloudRnd.range(500_000, 1_100_000);
    cloudData.set([Math.sin(a) * r, cloudRnd.range(90_000, 260_000), -Math.cos(a) * r, cloudRnd.range(260_000, 520_000)], i * 4);
    layers[i] = Math.floor(cloudRnd.next() * 4);
  }
  // Farthest first, so they overlap properly from the table.
  const order = [...Array(cloudCount).keys()].sort((i, j) => Math.hypot(cloudData[j * 4], cloudData[j * 4 + 2]) - Math.hypot(cloudData[i * 4], cloudData[i * 4 + 2]));
  const sortedClouds = new Float32Array(cloudCount * 4);
  const sortedLayers = new Float32Array(cloudCount);
  order.forEach((from, to) => {
    sortedClouds.set(cloudData.subarray(from * 4, from * 4 + 4), to * 4);
    sortedLayers[to] = layers[from];
  });
  const cloudAttr = new THREE.InstancedBufferAttribute(sortedClouds, 4);
  cloudGeometry.setAttribute("cloud", cloudAttr);
  cloudGeometry.setAttribute("layer", new THREE.InstancedBufferAttribute(sortedLayers, 1));
  cloudGeometry.instanceCount = cloudCount;
  const cloudUniforms = { map: { value: cloudTexture() }, tint: { value: light.cloud }, shade: { value: new THREE.Color() } };
  const clouds = new THREE.Mesh(cloudGeometry, new THREE.ShaderMaterial({ uniforms: cloudUniforms, vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false }));
  clouds.frustumCulled = false;
  clouds.renderOrder = -5;
  scene.add(clouds);

  const drift = new Float32Array(sortedClouds);
  return {
    scene,
    update(time, camera, daylight) {
      sky.position.copy(camera.position);
      sky.updateMatrixWorld();
      skyUniforms.glow.value = daylight.glow;
      skyUniforms.stars.value = daylight.stars;
      skyUniforms.time.value = time;
      waterUniforms.time.value = time;
      hemi.color.copy(daylight.skyColor);
      hemi.groundColor.copy(daylight.groundColor);
      hemi.intensity = daylight.hemiIntensity * 0.9;
      sun.color.copy(daylight.sunColor);
      sun.intensity = daylight.sunIntensity * 0.8;
      sun.position.copy(daylight.sunDirection);
      (scene.fog as THREE.Fog).color.copy(daylight.haze);
      cloudUniforms.shade.value.copy(daylight.cloud).lerp(daylight.middle, 0.45);
      // The clouds drift slowly with the breeze.
      const arr = cloudAttr.array as Float32Array;
      for (let i = 0; i < cloudCount; i++) arr[i * 4] = drift[i * 4] + Math.sin(time * 0.004 + i) * 60_000;
      cloudAttr.needsUpdate = true;
    },
  };
}
