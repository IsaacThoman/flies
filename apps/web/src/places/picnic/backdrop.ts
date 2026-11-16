import { snowDust } from "../../scene/snow.ts";
// Everything far beyond the table: sky, clouds, rolling hills with lollipop
// trees, the lawn the table stands on, and the lake. Drawn in its own pass
// with its own depth range (the table is millimetres from the camera, the
// hills hundreds of metres), in six draws, and one more for each of a gull
// gliding over or a sailboat on the lake while they're there. Under the
// weather the sky closes over, the distance whitens in mist, rain speckles
// the lake and a rainbow stands opposite the sun as it clears; a gust sways
// the trees and runs across the grass and the water.

import * as THREE from "three";
import { TABLE_RADIUS } from "@fly/world";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Batch, canvas2d, canvasTexture, freeze, paint, random } from "../../scene/build.ts";
import type { Daylight } from "../../scene/light.ts";
import type { Weather } from "../../scene/weather.ts";
import type { SceneBackdrop } from "../types.ts";
import { outside } from "./outside.ts";

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
uniform float flash;
uniform float cover; uniform float mist; uniform float bow; uniform vec2 drift;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + 1.0), f.x), f.y);
}
// Spectral colours, violet (0) to red (1).
vec3 spectrum(float t) { return clamp(abs(fract(0.8 - t * 0.8 + vec3(0.0, 0.667, 0.333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(horizon, middle, smoothstep(0.0, 0.22, h));
  c = mix(c, zenith, smoothstep(0.18, 0.85, h));
  float s = max(dot(d, sunDir), 0.0);
  // The underside of an overcast: soft rolls of cloud drifting on the wind, lighter where the sun is behind them.
  float deck = 0.5;
  if (cover > 0.01 && h > -0.05) {
    vec2 p = d.xz / (max(h, 0.0) + 0.1) * 1.4 + drift;
    deck = noise(p) * 0.5 + noise(p * 2.3 + 7.0) * 0.3 + noise(p * 5.1 + 3.0) * 0.2;
    float shade = mix(1.0, 0.82 + 0.3 * deck, cover);
    c *= mix(shade, 1.0, smoothstep(0.25, -0.02, h) * 0.6);
    c += sunColor * pow(s, 4.0) * 0.18 * cover * deck;
  }
  // The glow round the sun, wide at sunset.
  c += sunColor * (pow(s, 6.0) * glow + pow(s, 48.0) * 0.35);
  // The disc: behind cloud it goes, in mist it is a pale disc you can look at.
  float disc = smoothstep(0.9994, 0.9997, s) * (1.0 - smoothstep(0.3, 0.75, cover) * (0.55 + 0.45 * deck));
  c = mix(c, mix(vec3(1.0, 0.99, 0.95), horizon * 1.1, mist * 0.45), disc);
  if (stars > 0.0 && h > 0.0) {
    vec3 cell = floor(d * 360.0);
    float star = step(0.9975, hash(cell)) * smoothstep(0.02, 0.3, h);
    float twinkle = 0.6 + 0.4 * sin(time * 3.0 + hash(cell + 1.0) * 40.0);
    c += vec3(star * twinkle * stars * (1.0 - cover) * (1.0 - cover) * (1.0 - mist));
  }
  // A rainbow opposite the sun, 40 to 42 degrees round, the sky a little brighter inside it.
  if (bow > 0.0 && h > 0.0) {
    float a = acos(clamp(dot(d, -sunDir), -1.0, 1.0));
    float t = (a - 0.698) / 0.046;
    float band = smoothstep(0.0, 0.18, t) * smoothstep(1.0, 0.82, t);
    float fade = smoothstep(0.0, 0.12, h);
    c += spectrum(clamp(t, 0.0, 1.0)) * band * bow * 0.3 * fade;
    c += vec3(0.04) * bow * fade * smoothstep(0.72, 0.6, a);
  }
  if (h < 0.0) c = mix(horizon, ground, smoothstep(0.0, -0.08, h));
  if (flash > 0.02 && h > 0.025 && h < 0.4) {
    float y = h;
    float fork = 0.13 + sin(floor(y * 85.0) * 5.3) * 0.012 + y * 0.3;
    float bolt = 1.0 - smoothstep(0.001, 0.003 + fwidth(d.x), abs(d.x - fork));
    float branch = 1.0 - smoothstep(0.001, 0.003 + fwidth(d.x), abs(d.x - (0.15 - y * 0.5 + sin(floor(y * 100.0)) * 0.008)));
    c += vec3(0.7, 0.8, 1.0) * (bolt + branch * step(y, 0.18)) * flash * 2.5;
  }
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
uniform float rain; uniform float rough; uniform vec3 gust; uniform vec2 drift;
varying vec3 vWorld;
#include <fog_pars_fragment>
float wave(vec2 p) {
  return (sin(p.x * 0.011 + time * 0.9) * 0.5 + sin(p.y * 0.017 - time * 1.3) * 0.35 + sin((p.x + p.y) * 0.031 + time * 2.1) * 0.15) * rough;
}
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + 1.0), f.x), f.y);
}
void main() {
  vec3 view = normalize(vWorld - cameraPosition);
  vec2 p = vWorld.xz;
  float e = 3.0;
  vec3 n = normalize(vec3(wave(p + vec2(e, 0.0)) - wave(p - vec2(e, 0.0)), 6.0, wave(p + vec2(0.0, e)) - wave(p - vec2(0.0, e))));
  // A gust darkens the water in patches as it ruffles it, running downwind ("cat's paws").
  float paws = smoothstep(0.45, 0.8, noise(p * 0.00006 - drift)) * gust.z;
  // Rain roughens it all over: duller, less of the sky in it.
  float matte = clamp(paws * 0.8 + rain * 0.6, 0.0, 1.0);
  vec3 r = reflect(view, n);
  float fres = pow(1.0 - max(dot(-view, n), 0.0), 3.0) * (1.0 - matte * 0.6);
  vec3 sky = mix(horizon, zenith, smoothstep(0.0, 0.5, r.y));
  vec3 c = mix(water, sky, 0.25 + 0.65 * fres);
  c *= 1.0 - paws * 0.22;
  float glint = pow(max(dot(r, sunDir), 0.0), 220.0) * (1.0 - matte);
  float sparkle = step(0.6, fract(sin(dot(floor(p * 0.02), vec2(12.9, 78.2))) * 4375.5 + time * 0.7));
  c += sunColor * glint * (1.5 + sparkle * 2.5);
  // Drops landing: a speckle of tiny bright rings, each there for an instant.
  float drop = step(1.0 - 0.06 * rain, hash2(floor(p * 0.0025) + floor(time * 9.0) * 17.0));
  c = mix(c, mix(horizon, vec3(1.0), 0.4), drop * 0.5);
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
uniform sampler2D map; uniform vec3 tint; uniform vec3 shade; uniform float clear;
varying vec2 vUv;
varying float vLayer;
void main() {
  vec2 uv = vec2((vUv.x + vLayer) * 0.25, vUv.y);
  vec4 t = texture2D(map, uv);
  vec3 c = mix(shade, tint, t.r);
  gl_FragColor = vec4(c, t.a * clear);
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

/** A gull, 1.1 m across the wings as built (shown smaller), nose along +z: white body, pale grey wings with black tips, a yellow bill. */
function gullGeometry() {
  const pieces: THREE.BufferGeometry[] = [];
  pieces.push(paint(new THREE.SphereGeometry(1, 12, 8).scale(62, 56, 230), "#f4f6f8"));
  pieces.push(paint(new THREE.SphereGeometry(46, 10, 8).translate(0, 26, 205), "#f6f8fa"));
  pieces.push(paint(new THREE.ConeGeometry(12, 60, 6).rotateX(Math.PI / 2).translate(0, 20, 270), "#f2c230"));
  pieces.push(paint(new THREE.BoxGeometry(110, 12, 110).translate(0, 0, -260), "#e8ecf0"));
  for (const side of [1, -1]) {
    // Root, elbow and tip: the bent wing of a gull gliding.
    const v = [
      [40, 0, 70], [40, 0, -60], [300, 45, 60], [300, 45, -70], [540, -5, -10], [560, -10, -70],
    ].map(([x, y, z]) => new THREE.Vector3(x * side, y, z));
    const tris = [[0, 2, 1], [1, 2, 3], [2, 4, 3], [3, 4, 5]];
    const wing = new THREE.BufferGeometry().setFromPoints(tris.flat().map((i) => v[i]));
    wing.computeVertexNormals();
    pieces.push(paint(wing, (p) => (Math.abs(p.x) > 470 ? "#22252a" : "#c9d1d8")));
  }
  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  return geometry;
}

/** A sailing dinghy, 4.2 m long, bow along +z, its sails out to the left (+x): white hull with a navy stripe, a mast and two sails. */
function boatGeometry() {
  const hull = new THREE.BoxGeometry(1500, 520, 4200, 1, 2, 6);
  const pos = hull.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const y = pos.getY(i);
    // A pointed bow, a narrower bottom.
    const bow = Math.max(0, (z - 900) / 1200);
    pos.setX(i, pos.getX(i) * (1 - Math.min(0.95, bow * bow)) * (y < 0 ? 0.6 : 1));
    pos.setY(i, y + bow * 120);
  }
  const pieces = [paint(hull.translate(0, 120, 0), (p) => (p.y > 300 && p.y < 380 ? "#22407a" : "#fbfcfd")), paint(new THREE.CylinderGeometry(40, 55, 6600, 6).translate(0, 3500, 500), "#9aa3ad")];
  const sail = (points: number[][]) => {
    const g = new THREE.BufferGeometry().setFromPoints(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    g.computeVertexNormals();
    return paint(g, "#fbfaf4");
  };
  // The mainsail bellied out to the left of the boom, and the jib forward of the mast.
  pieces.push(sail([[0, 650, 500], [700, 750, -2000], [380, 2600, -900], [0, 650, 500], [380, 2600, -900], [0, 3600, 500], [0, 3600, 500], [380, 2600, -900], [0, 6600, 500]]));
  pieces.push(sail([[0, 700, 1900], [260, 800, 600], [0, 5200, 520]]));
  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  return geometry;
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

export function buildBackdrop(light: Daylight): SceneBackdrop {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(light.haze.getHex(), 120_000, 1_400_000);
  scene.matrixWorldAutoUpdate = true;

  const skyUniforms = {
    flash: { value: 0 },
    zenith: { value: light.zenith },
    middle: { value: light.middle },
    horizon: { value: light.horizon },
    sunDir: { value: light.sunDirection },
    sunColor: { value: light.sunColor },
    glow: { value: light.glow },
    stars: { value: light.stars },
    time: { value: 0 },
    ground: { value: light.groundColor },
    cover: { value: 0 },
    mist: { value: 0 },
    bow: { value: 0 },
    drift: { value: new THREE.Vector2() },
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

  // The lawn round the table: grass you can almost see the blades of, mown in stripes, and daisies.
  // A gust runs across it in waves of lighter and darker grass, as the blades bend.
  // The table shades it, where the sunlight carried up from the grass meets the table top or the
  // pedestal, and under the table less of the sky reaches it.
  const lawnUniforms = { uWave: { value: new THREE.Vector3() }, uTime: { value: 0 }, uSunDir: { value: light.sunDirection } };
  const lawnMaterial = new THREE.MeshLambertMaterial({ map: grassTexture(), color: "#ffffff" });
  lawnMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lawnUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vLawn;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLawn = position.xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vLawn;\nuniform vec3 uWave;\nuniform float uTime;\nuniform vec3 uSunDir;")
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
float along = dot(vLawn, uWave.xy);
diffuseColor.rgb *= 1.0 + uWave.z * 0.16 * sin(along * 0.0021 - uTime * 3.2) * (0.6 + 0.4 * sin(dot(vLawn, vec2(-uWave.y, uWave.x)) * 0.0009));
diffuseColor.rgb *= 1.0 + 0.05 * smoothstep(-0.15, 0.15, sin(dot(vLawn, vec2(0.96, 0.28)) * 0.0036)) - 0.025 + 0.04 * sin(vLawn.x * 0.0011 + sin(vLawn.y * 0.0013) * 2.0) * sin(vLawn.y * 0.0009 + 1.7);`,
      )
      .replace(
        "#include <lights_fragment_end>",
        /* glsl */ `#include <lights_fragment_end>
{
  vec3 sd = normalize(uSunDir);
  float rise = ${(-(LAWN_Y + 4)).toFixed(1)};
  vec2 slant = sd.xz / max(sd.y, 0.04);
  float top = 1.0 - smoothstep(${(TABLE_RADIUS - 18).toFixed(1)}, ${(TABLE_RADIUS + 18).toFixed(1)}, length(vLawn + slant * rise));
  float t = clamp(-dot(vLawn, slant) / max(dot(slant, slant), 1e-4), 0.0, rise);
  float post = 1.0 - smoothstep(22.0, 40.0, length(vLawn + slant * t));
  reflectedLight.directDiffuse *= 1.0 - max(top, post) * 0.88;
  reflectedLight.indirectDiffuse *= 0.6 + 0.4 * smoothstep(${(TABLE_RADIUS * 0.4).toFixed(1)}, ${(TABLE_RADIUS * 1.5).toFixed(1)}, length(vLawn));
}`,
      );
  };
  lawnMaterial.customProgramCacheKey = () => "lawn";
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(26_000, 48).rotateX(-Math.PI / 2).translate(0, LAWN_Y + 4, 0), lawnMaterial);
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
  const waterUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 }, rain: { value: 0 }, rough: { value: 1 }, gust: { value: new THREE.Vector3() }, drift: { value: new THREE.Vector2() } }]);
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
  // Trees sway in the breeze, each in its own time, and bend with a gust; the crown more than the trunk.
  const swayUniforms = { uSway: { value: new THREE.Vector4() }, uTime: { value: 0 } };
  treeMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, swayUniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform vec4 uSway;\nuniform float uTime;").replace(
      "#include <project_vertex>",
      `vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
float own = dot(instanceMatrix[3].xz, vec2(0.00031, 0.00017));
float bend = max(0.0, position.y - 0.2);
float sway = uSway.z * (0.5 + 0.5 * sin(uTime * 1.3 + own)) + uSway.w * (0.75 + 0.25 * sin(uTime * 3.1 + own));
mvPosition.xz += uSway.xy * sway * bend * bend * instanceMatrix[1][1];
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  treeMaterial.customProgramCacheKey = () => "tree";
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
  const cloudUniforms = { map: { value: cloudTexture() }, tint: { value: light.cloud }, shade: { value: new THREE.Color() }, clear: { value: 1 } };
  const clouds = new THREE.Mesh(cloudGeometry, new THREE.ShaderMaterial({ uniforms: cloudUniforms, vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false }));
  clouds.frustumCulled = false;
  clouds.renderOrder = -5;
  scene.add(clouds);

  // A gull gliding over, and a sailboat on the lake: each drawn only while it is there (life.ts).
  const gullUniforms = { uBeat: { value: 0 }, uFlap: { value: 0 } };
  const gullMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  gullMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, gullUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uBeat;\nuniform float uFlap;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.y += sin(uBeat) * uFlap * smoothstep(70.0, 560.0, abs(position.x)) * abs(position.x) * 0.6;");
  };
  gullMaterial.customProgramCacheKey = () => "gull";
  const gull = new THREE.Mesh(gullGeometry(), gullMaterial);
  // As big as its shadow (life.ts): 80 cm across.
  gull.scale.setScalar(0.72);
  gull.rotation.order = "YXZ";
  gull.visible = false;
  const boat = new THREE.Mesh(boatGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  boat.rotation.order = "YXZ";
  boat.visible = false;
  scene.add(gull, boat);

  const snowCover = { value: 0 };
  const snowy = new Set<THREE.Material>();
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material;
    if ((m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshLambertMaterial) && !snowy.has(m)) {
      snowy.add(m); snowDust(m, snowCover);
    }
  });
  const drift = new Float32Array(sortedClouds);
  let last = -1;
  const deck = skyUniforms.drift.value;
  const paws = waterUniforms.drift.value as THREE.Vector2;
  return {
    scene,
    update(time, camera, daylight, weather: Weather) {
      snowCover.value = weather.snowCover;
      skyUniforms.flash.value = weather.lightning;
      const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, time - last));
      last = time;
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

      // The weather.
      const gust = outside.gust;
      const speed = Math.hypot(gust.x, gust.z);
      const wx = speed > 1 ? gust.x / speed : 0.97;
      const wz = speed > 1 ? gust.z / speed : -0.23;
      skyUniforms.cover.value = weather.cloud;
      skyUniforms.mist.value = weather.mist;
      deck.x += wx * dt * (0.004 + weather.wind * 0.01 + gust.strength * 0.02);
      deck.y += wz * dt * (0.004 + weather.wind * 0.01 + gust.strength * 0.02);
      // A rainbow, as the rain clears with the sun out and not too high.
      const day = 1 - Math.min(1, daylight.stars * 3);
      skyUniforms.bow.value = smooth(0.15, 0.55, weather.wet) * (1 - smooth(0.2, 0.55, weather.cloud)) * (1 - weather.mist) * day * smooth(0, 0.08, daylight.sunUp) * (1 - smooth(0.6, 0.75, daylight.sunUp));
      // Rain and mist close the distance in.
      const fog = scene.fog as THREE.Fog;
      fog.near = THREE.MathUtils.lerp(THREE.MathUtils.lerp(120_000, 35_000, weather.rain), 5_000, weather.mist);
      fog.far = THREE.MathUtils.lerp(THREE.MathUtils.lerp(1_400_000, 450_000, weather.rain), 80_000, weather.mist) * (1 - 0.3 * weather.cloud);
      cloudUniforms.clear.value = 1 - weather.mist * 0.9;
      waterUniforms.rain.value = weather.rain;
      waterUniforms.rough.value = 0.7 + weather.wind * 0.8;
      (waterUniforms.gust.value as THREE.Vector3).set(wx, wz, gust.strength);
      paws.x += wx * dt * 0.18;
      paws.y += wz * dt * 0.18;
      swayUniforms.uSway.value.set(wx, wz, weather.wind * 0.012, gust.strength * 0.05);
      swayUniforms.uTime.value = time;
      lawnUniforms.uWave.value.set(wx, wz, gust.strength + weather.wind * 0.15);
      lawnUniforms.uTime.value = time;

      const g = outside.gull;
      gull.visible = g.on;
      if (g.on) {
        gull.position.set(g.x, g.y, g.z);
        gull.rotation.set(0, Math.atan2(Math.cos(g.heading), Math.sin(g.heading)), Math.sin(time * 0.3) * 0.12);
        gullUniforms.uBeat.value = time * Math.PI * 2 * 2.6;
        gullUniforms.uFlap.value = g.flap;
      }
      const b = outside.boat;
      boat.visible = b.on;
      if (b.on) {
        // Its sails out on the side away from the wind, heeling that way.
        const side = Math.sin(b.heading) > 0 ? 1 : -1;
        boat.position.set(b.x, LAKE_Y + Math.sin(time * 1.2) * 30, b.z);
        boat.scale.set(side, 1, 1);
        boat.rotation.set(Math.sin(time * 0.9) * 0.03, b.heading, -b.heel * side);
      }
    },
  };
}
