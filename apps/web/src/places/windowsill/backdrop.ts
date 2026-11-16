import { Snow, snowDust } from "../../scene/snow.ts";
// The view from the kitchen window: a back garden with a striped lawn, an
// apple tree and a washing line, a fence with hollyhocks, and over it the
// backs of a little street of houses, their chimneys and roofs against the
// sky, with a church spire and hills far off. Through the day the light
// changes on it, clouds drift, birds pass; at night its windows light up,
// the stars come out and the moon is up. On a grey day the cloud closes over,
// mist and rain bring the distance in, and the wind moves the tree and the
// washing. Drawn in the far pass, in five draws, and a sixth for rain.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Batch, paint, random } from "../../scene/build.ts";
import type { Daylight } from "../../scene/light.ts";
import type { Weather } from "../../scene/weather.ts";
import type { SceneBackdrop } from "../types.ts";
import { NOISE, tone } from "./surfaces.ts";

/** The garden's ground, mm below the sill. */
export const GARDEN_Y = -1250;

const WHITE = new THREE.Color(1, 1, 1);

/** Where the moon is, when it is night. */
const MOON = new THREE.Vector3(0.3, 0.5, -0.81).normalize();

const SKY_VS = /* glsl */ `
varying vec3 vDir;
varying vec3 vWorld;
void main() {
  vDir = position;
  vWorld = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FS = /* glsl */ `
uniform vec3 zenith; uniform vec3 middle; uniform vec3 horizon;
uniform vec3 sunDir; uniform vec3 sunColor; uniform float glow; uniform float stars; uniform float time;
uniform vec3 cloudLit; uniform vec3 cloudShade; uniform vec3 moonDir; uniform float day; uniform float cover; uniform float mist; uniform vec3 veil;
varying vec3 vDir;
varying vec3 vWorld;
${NOISE}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(horizon, middle, smoothstep(0.0, 0.25, h));
  c = mix(c, zenith, smoothstep(0.2, 0.9, h));
  float s = max(dot(d, sunDir), 0.0);
  float sunny = day * (1.0 - cover * 0.9);
  c += sunColor * (pow(s, 6.0) * glow + pow(s, 64.0) * 0.4) * sunny;
  c = mix(c, vec3(1.0, 0.99, 0.94), smoothstep(0.9993, 0.9996, s) * sunny);
  // Clouds: drifting fair-weather cumulus on a plane above, lit on the sun's side; on a grey day they close over into a lid, darker underneath.
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 2.2 + vec2(time * 0.006, time * 0.002);
    float n = fbm(uv);
    float amount = smoothstep(0.52 - 0.5 * cover, 0.78 - 0.3 * cover, n) * smoothstep(0.0, 0.12, h);
    float lit = clamp(0.55 + (fbm(uv + sunDir.xz * 0.08) - n) * -4.0, 0.0, 1.0) * (1.0 - cover * 0.6);
    vec3 cloud = mix(cloudShade, cloudLit, lit);
    c = mix(c, cloud, amount * 0.92);
  }
  // Mist: the sky fades to white, most of all low down.
  c = mix(c, veil, mist * (0.95 - 0.45 * smoothstep(0.0, 0.7, h)));
  // Night: stars, and the moon.
  if (stars > 0.0 && h > 0.0) {
    vec3 cell = floor(d * 300.0);
    float star = step(0.9972, hash31(cell)) * smoothstep(0.03, 0.3, h);
    float twinkle = 0.6 + 0.4 * sin(time * 2.6 + hash31(cell + 1.0) * 40.0);
    c += vec3(star * twinkle * stars * (1.0 - cover) * (1.0 - mist));
    float m = dot(d, moonDir);
    float disc = smoothstep(0.99955, 0.99968, m);
    vec3 face = vec3(0.92, 0.93, 0.88) * (0.82 + 0.18 * vnoise(d.xy * 900.0));
    c = mix(c, face, disc * stars * (1.0 - cover * 0.95) * (1.0 - mist * 0.6));
    c += vec3(0.5, 0.55, 0.7) * (pow(max(m, 0.0), 300.0) * 0.35 + pow(max(m, 0.0), 40.0) * 0.25 * mist) * stars * (1.0 - cover * 0.8);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

/** One house at the back of the street: its width, wall height, colour, roof, and whether it shows its gable. */
type House = { x: number; width: number; height: number; wall: string; roof: string; gable: boolean };

export function buildBackdrop(light: Daylight): SceneBackdrop {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(light.haze.getHex(), 20_000, 260_000);
  scene.matrixWorldAutoUpdate = true;
  const rnd = random(41);

  const snow = new Snow(14000, GARDEN_Y, true);
  scene.add(snow.mesh);
  const snowCover = { value: 0 };
  const skyUniforms = {
    zenith: { value: light.zenith },
    middle: { value: light.middle },
    horizon: { value: light.horizon },
    sunDir: { value: light.sunDirection },
    sunColor: { value: light.sunColor },
    glow: { value: light.glow },
    stars: { value: light.stars },
    time: { value: 0 },
    cloudLit: { value: new THREE.Color() },
    cloudShade: { value: new THREE.Color() },
    moonDir: { value: MOON },
    day: { value: 1 },
    cover: { value: 0 },
    mist: { value: 0 },
    veil: { value: new THREE.Color() },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2_000_000, 32, 16), new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // Outdoors the light is the sun's by day and the moon's at night (indoors at night the "sun" is the lamp).
  const hemi = new THREE.HemisphereLight(light.skyColor, light.groundColor, light.hemiIntensity);
  const sun = new THREE.DirectionalLight(light.sunColor, light.sunIntensity);
  scene.add(hemi, sun);

  // The garden, the fence, the houses and the hills, merged; windows glow at night.
  const nightUniform = { value: 0 };
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
  lambert.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightUniform;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float glow;\nvarying float vGlow;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = glow;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uNight;\nvarying float vGlow;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.72, 0.36) * vGlow * uNight * 1.3;");
  };
  lambert.customProgramCacheKey = () => "windowsill-outside";
  snowDust(lambert, snowCover);
  const batch = new Batch();
  const lit = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.ColorRepresentation | THREE.Color), glow = 0) => {
    const painted = paint(g, c as THREE.ColorRepresentation);
    painted.setAttribute("glow", new THREE.BufferAttribute(new Float32Array(painted.attributes.position.count).fill(glow), 1));
    batch.add(lambert, painted);
  };
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const G = GARDEN_Y;

  // The lawn, mown in stripes; a gravel path down the middle to the gate; beds along the fence.
  const FENCE_Z = -9500;
  {
    const lawn = new THREE.PlaneGeometry(14_000, -FENCE_Z - 600, 28, 1).rotateX(-Math.PI / 2).translate(0, G, (FENCE_Z - 600) / 2);
    lit(lawn.toNonIndexed(), (p) => {
      const stripe = Math.floor((p.x + 7000) / 500 + 0.001) % 2;
      return stripe ? tone("#7cc456") : tone("#6ab246");
    });
    lit(new THREE.PlaneGeometry(900, -FENCE_Z - 600).rotateX(-Math.PI / 2).translate(800, G + 6, (FENCE_Z - 600) / 2), "#d9c9a4");
    lit(new THREE.PlaneGeometry(14_000, 1400).rotateX(-Math.PI / 2).translate(0, G + 4, FENCE_Z + 700), "#6a4a32");
    // Beyond the fence: the lane, and the far side of the street, and the land out to the hills.
    lit(new THREE.PlaneGeometry(400_000, 400_000).rotateX(-Math.PI / 2).translate(0, G - 20, -200_000), "#7aa85a");
    lit(new THREE.PlaneGeometry(40_000, 4000).rotateX(-Math.PI / 2).translate(0, G - 10, FENCE_Z - 2200), "#a8a39a");
    // Under the window: a strip of gravel, and the house's own wall below the window.
    lit(new THREE.PlaneGeometry(14_000, 700).rotateX(-Math.PI / 2).translate(0, G + 2, -780), "#cdbf9f");
    lit(box(-7000, 7000, G, -70, -480, -420), "#d9cbb2");
  }
  // The fence: white pickets with rails behind, and hollyhocks against it.
  {
    const picket = new THREE.Shape([new THREE.Vector2(-45, 0), new THREE.Vector2(45, 0), new THREE.Vector2(45, 1250), new THREE.Vector2(0, 1340), new THREE.Vector2(-45, 1250)]);
    for (let x = -7000; x < 7000; x += 160) {
      if (Math.abs(x - 800) < 450) continue;
      lit(new THREE.ExtrudeGeometry(picket, { depth: 40, bevelEnabled: false }).translate(x, G + Math.sin(x * 0.01) * 20, FENCE_Z - 20), "#f4f1e8");
    }
    for (const y of [G + 300, G + 1000]) lit(box(-7000, 7000, y, y + 90, FENCE_Z - 70, FENCE_Z - 20), "#e6e1d4");
    // The gate, a little open.
    lit(box(400, 1200, G + 50, G + 1150, FENCE_Z - 20, FENCE_Z + 20).rotateY(0.3).translate(-120, 0, 260), "#e8e4d8");
    // The border along the fence: rounded shrubs, some in flower, and hollyhocks and foxgloves standing over them.
    const greens = ["#4a8a38", "#3c7632", "#5c9842", "#69a64b"].map((c) => new THREE.Color(c));
    const blooms = ["#f2a0b8", "#e8607a", "#fbe6ea", "#f6c45a", "#c8376a", "#ffffff"];
    for (let x = -6900; x < 6900; x += rnd.range(650, 1000)) {
      if (Math.abs(x - 800) < 700) continue;
      const size = rnd.range(420, 720);
      const z = FENCE_Z + 520 + rnd.range(-120, 180);
      const green = greens[Math.floor(rnd.next() * greens.length)];
      const bush = new THREE.Vector3(x, G + size * 0.72, z);
      lit(new THREE.IcosahedronGeometry(size, 1).scale(1.25, rnd.range(0.85, 1.15), 0.9).translate(bush.x, bush.y, bush.z), (p) => green.clone().multiplyScalar(0.72 + 0.5 * THREE.MathUtils.clamp((p.y - G) / (size * 1.7), 0, 1)));
      if (rnd.next() < 0.55) {
        const bloom = blooms[Math.floor(rnd.next() * blooms.length)];
        for (let k = 0; k < 9; k++) {
          const a = rnd.range(-Math.PI * 0.9, Math.PI * 0.1);
          const b = rnd.range(-0.2, 1.2);
          lit(new THREE.IcosahedronGeometry(rnd.range(60, 95), 0).translate(bush.x + Math.cos(a) * Math.cos(b) * size * 1.15, bush.y + Math.sin(b) * size * 0.85, bush.z + Math.sin(a) * size * 0.2 + size * 0.75), bloom);
        }
      }
    }
    for (let i = 0; i < 18; i++) {
      const x = rnd.range(-6600, 6600);
      if (Math.abs(x - 800) < 750) continue;
      const height = rnd.range(1700, 2500);
      const foxglove = rnd.next() < 0.4;
      const color = foxglove ? ["#c870b8", "#e6a0d8", "#f2e2ee"][Math.floor(rnd.next() * 3)] : ["#e8607a", "#f2a0b4", "#c8376a", "#fbe0e6", "#9a2a5a"][Math.floor(rnd.next() * 5)];
      const z = FENCE_Z + 300 + rnd.range(-100, 100);
      lit(new THREE.CylinderGeometry(16, 24, height, 5).translate(x, G + height / 2, z), "#4f8a36");
      const flowers = foxglove ? 12 : 9;
      for (let k = 0; k < flowers; k++) {
        const y = G + height - 80 - k * (foxglove ? 75 : 120);
        const r = (foxglove ? 55 : 100) + k * (foxglove ? 3 : 4);
        const side = k % 2 ? 1 : -1;
        lit(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.75, 0.9).translate(x + side * r * 0.45, y, z + r * 0.6), k < 2 ? "#7cb84e" : color);
      }
      for (let k = 0; k < 3; k++) lit(new THREE.IcosahedronGeometry(260, 0).scale(1.2, 0.45, 1).translate(x + (k - 1) * 180, G + 200 + k * 90, z + 120), "#4c8f39");
    }
  }
  // A shed in the corner of the garden: tarred boards, a felt roof, a window and a door.
  {
    const x0 = -6600;
    const x1 = -4300;
    const z0 = -8900;
    const z1 = -7300;
    for (let x = x0; x < x1; x += 140) lit(box(x, x + 130, G, G + 2050, z1 - 10, z1 + 20), Math.floor(x / 140) % 2 ? "#5e4a3c" : "#544234");
    lit(box(x0, x1, G, G + 2050, z0, z1 - 10), "#4e3e32");
    const roof = new THREE.BufferGeometry();
    roof.setAttribute("position", new THREE.Float32BufferAttribute([x0 - 150, G + 2050, z1 + 200, x1 + 150, G + 2050, z1 + 200, x1 + 150, G + 2450, z0 - 100, x0 - 150, G + 2050, z1 + 200, x1 + 150, G + 2450, z0 - 100, x0 - 150, G + 2450, z0 - 100], 3));
    lit(roof, "#3a3a3e");
    lit(box(x0 + 300, x0 + 1100, G + 900, G + 1600, z1 + 20, z1 + 40), "#9fb6c4");
    lit(box(x0 + 1400, x1 - 200, G, G + 1850, z1 + 20, z1 + 45), "#6f8a76");
  }

  // The backs of the houses across the lane.
  const houses: House[] = [
    { x: -10_200, width: 4600, height: 6400, wall: "#f3d6c8", roof: "#7c5f56", gable: false },
    { x: -5600, width: 4200, height: 6000, wall: "#f6e3a8", roof: "#a85a3c", gable: true },
    { x: -1500, width: 4000, height: 6600, wall: "#d8e6ee", roof: "#5f6a78", gable: false },
    { x: 2600, width: 4300, height: 6200, wall: "#f2cfd6", roof: "#a85a3c", gable: true },
    { x: 6900, width: 4400, height: 6500, wall: "#e9efe0", roof: "#6a6f78", gable: false },
    { x: 11_200, width: 4200, height: 6100, wall: "#f6dfb9", roof: "#9a5236", gable: true },
  ];
  const HOUSE_Z = -15_000;
  const chimneys: THREE.Vector3[] = [];
  for (const house of houses) {
    const x0 = house.x - house.width / 2;
    const x1 = house.x + house.width / 2;
    const top = G + house.height;
    lit(box(x0, x1, G, top, HOUSE_Z - 7000, HOUSE_Z), house.wall);
    // Windows, two storeys, some lit at night; a back door.
    for (const [row, y] of [[0, G + 900], [1, G + 3700]] as const) {
      for (let k = 0; k < 2; k++) {
        const wx = house.x + (k ? 1 : -1) * house.width * 0.24;
        if (row === 0 && k === 0) {
          lit(box(wx - 450, wx + 450, G, G + 2100, HOUSE_Z, HOUSE_Z + 40), ["#3f6a8a", "#8a3f4a", "#3f7a5a"][Math.floor(rnd.next() * 3)]);
          continue;
        }
        const glow = rnd.next() < 0.6 ? rnd.range(0.6, 1) : 0;
        // A sash window: its frame, glass, glazing bars, a stone sill under it and a lintel over it; curtains drawn back.
        lit(box(wx - 560, wx + 560, y - 60, y + 1560, HOUSE_Z, HOUSE_Z + 30), "#f7f5ef");
        lit(box(wx - 480, wx + 480, y, y + 1480, HOUSE_Z + 30, HOUSE_Z + 50), glow ? "#4a5a6a" : "#3a4858", glow);
        lit(box(wx - 30, wx + 30, y, y + 1480, HOUSE_Z + 50, HOUSE_Z + 70), "#f7f5ef");
        lit(box(wx - 480, wx + 480, y + 720, y + 780, HOUSE_Z + 50, HOUSE_Z + 70), "#f7f5ef");
        lit(box(wx - 660, wx + 660, y - 160, y - 60, HOUSE_Z, HOUSE_Z + 150), "#e8e2d4");
        lit(box(wx - 640, wx + 640, y + 1560, y + 1720, HOUSE_Z, HOUSE_Z + 60), "#e8e2d4");
        const curtain = ["#c8574a", "#e8c25a", "#6a8ac8", "#f2e6d2"][Math.floor(rnd.next() * 4)];
        for (const side of [-1, 1]) lit(box(wx + side * 480 - (side > 0 ? 200 : 0), wx + side * 480 + (side < 0 ? 200 : 0), y + 200, y + 1480, HOUSE_Z + 35, HOUSE_Z + 45), curtain, glow * 0.7);
      }
    }
    // The roof: courses of tiles; a gable end shows a triangle, otherwise the roof's back slope.
    const pitch = 3200;
    const roofColor = new THREE.Color(house.roof);
    const dark = roofColor.clone().multiplyScalar(0.82);
    if (house.gable) {
      const shape = new THREE.Shape([new THREE.Vector2(x0 - 150, top), new THREE.Vector2(x1 + 150, top), new THREE.Vector2(house.x, top + pitch)]);
      lit(new THREE.ShapeGeometry(shape).translate(0, 0, HOUSE_Z + 10), house.wall);
      // Bargeboards along its slopes, and a little round window.
      for (const s of [-1, 1]) {
        const len = Math.hypot(house.width / 2 + 200, pitch);
        lit(box(-len / 2, len / 2, -90, 90, 0, 120).rotateZ(s * Math.atan2(pitch, house.width / 2 + 200)).translate(house.x - (s * (house.width / 2 + 200)) / 2, top + pitch / 2, HOUSE_Z + 60), roofColor.clone().multiplyScalar(0.7));
      }
      lit(new THREE.CircleGeometry(420, 20).translate(house.x, top + pitch * 0.42, HOUSE_Z + 70), "#3e4c5c", rnd.next() < 0.5 ? 0.8 : 0);
      for (let z = HOUSE_Z; z > HOUSE_Z - 7000; z -= 875) {
        for (const s of [-1, 1]) lit(box(0, Math.hypot(house.width / 2 + 150, pitch), -60, 60, z - 875, z).rotateZ(s > 0 ? Math.PI - Math.atan2(pitch, house.width / 2 + 150) : Math.atan2(pitch, house.width / 2 + 150)).translate(s > 0 ? x1 + 150 : x0 - 150, top, 0), Math.round(z / 875) % 2 ? roofColor : dark);
      }
    } else {
      const depth = 3800;
      for (let i = 0; i < 12; i++) {
        const a = i / 12;
        const b = (i + 1) / 12;
        const quad = new THREE.BufferGeometry();
        const y0 = top + pitch * a;
        const y1 = top + pitch * b;
        const z0 = HOUSE_Z + 300 - depth * a;
        const z1 = HOUSE_Z + 300 - depth * b;
        quad.setAttribute("position", new THREE.Float32BufferAttribute([x0 - 100, y0, z0, x1 + 100, y0, z0, x1 + 100, y1, z1, x0 - 100, y0, z0, x1 + 100, y1, z1, x0 - 100, y1, z1], 3));
        lit(quad, i % 2 ? roofColor : dark);
      }
      lit(box(x0 - 100, x1 + 100, top - 120, top + 40, HOUSE_Z + 200, HOUSE_Z + 380), "#f7f5ef");
    }
    // A gutter along the eaves and a downpipe.
    lit(box(x0 - 120, x1 + 120, top - 40, top + 80, HOUSE_Z + 100, HOUSE_Z + 260), "#3a3f44");
    lit(box(x1 - 200, x1 - 110, G, top, HOUSE_Z + 60, HOUSE_Z + 150), "#3a3f44");
    // A climbing rose up some of them.
    if (house.x === -1500 || house.x === 6900) {
      for (let k = 0; k < 11; k++) {
        const at = new THREE.Vector3(x0 + 300 + rnd.range(0, 900), G + 200 + rnd.range(0, 3800) * Math.sqrt(k / 11), HOUSE_Z + 80);
        lit(new THREE.IcosahedronGeometry(rnd.range(260, 420), 0).scale(1, 1, 0.35).translate(at.x, at.y, at.z), k % 3 ? "#3f7a36" : "#4f8a3e");
        if (k % 2) lit(new THREE.IcosahedronGeometry(80, 0).translate(at.x + rnd.range(-150, 150), at.y + rnd.range(-150, 150), at.z + 150), house.x === -1500 ? "#f2a0b8" : "#fff4e0");
      }
    }
    // A chimney stack with pots.
    const cx = house.x + (house.gable ? 0 : house.width * 0.32);
    const cz = house.gable ? HOUSE_Z - 3500 : HOUSE_Z - 3400;
    const cy = top + pitch - 300;
    lit(box(cx - 380, cx + 380, cy - 600, cy + 1500, cz - 300, cz + 300), house.gable ? "#b4644a" : "#a86a52");
    for (const dx of [-170, 170]) lit(new THREE.CylinderGeometry(85, 110, 420, 8).translate(cx + dx, cy + 1710, cz), "#c27a50");
    chimneys.push(new THREE.Vector3(cx + 170, cy + 1950, cz));
  }

  // Far off: hills with trees on them, and the church's spire.
  {
    const hill = new THREE.PlaneGeometry(800_000, 1, 200, 1);
    const pos = hill.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const top = pos.getY(i) > 0;
      const h = 9000 + 6000 * Math.sin(x * 0.00004 + 1) + 3000 * Math.sin(x * 0.00013 + 2) + 1500 * Math.sin(x * 0.0005);
      pos.setXYZ(i, x, top ? G + h : G - 100, -120_000);
    }
    hill.computeVertexNormals();
    lit(hill.toNonIndexed(), (p) => (p.y > G + 8000 ? tone("#7d9f78") : tone("#6f9468")));
    for (let i = 0; i < 46; i++) {
      const x = rnd.range(-60_000, 60_000);
      const z = rnd.range(-70_000, -25_000);
      const s = rnd.range(2500, 5200);
      lit(new THREE.IcosahedronGeometry(1, 1).scale(s, s * rnd.range(0.9, 1.4), s).translate(x, G + s * 0.8, z), rnd.next() < 0.5 ? "#5f8f52" : "#6e9c5a");
    }
    const spire = new THREE.Vector3(14_000, G, -42_000);
    lit(box(spire.x - 2200, spire.x + 2200, G, G + 13_000, spire.z - 2200, spire.z + 2200), "#d8d0c0");
    lit(new THREE.ConeGeometry(3000, 15_000, 8).translate(spire.x, G + 13_000 + 7500, spire.z), "#7a7f88");
    lit(box(spire.x - 600, spire.x + 600, G + 9000, G + 11_000, spire.z + 2200, spire.z + 2260), "#3e4c5c", 0);
  }

  // A washing line across the garden, sheets and shirts on it.
  const laundry: { g: THREE.BufferGeometry; c: string }[] = [];
  {
    const y = G + 1800;
    const z = -6800;
    lit(new THREE.CylinderGeometry(12, 12, 6400, 4).rotateZ(Math.PI / 2).translate(3700, y, z), "#e0e0e0");
    for (const x of [500, 6900]) lit(new THREE.CylinderGeometry(40, 50, 1900, 6).translate(x, G + 950, z), "#9a8a7a");
    const items: [number, number, number, string][] = [[1300, 650, 560, "#8ab8e8"], [2100, 600, 520, "#f4d24a"], [3200, 1300, 780, "#f6f2ea"], [4500, 620, 560, "#e86a6a"], [5300, 420, 300, "#ffffff"], [5800, 420, 300, "#ffffff"]];
    for (const [x, w, h, c] of items) laundry.push({ g: new THREE.PlaneGeometry(w, h, 6, 4).translate(x, y - h / 2, z), c });
  }

  batch.build(scene);

  // The apple tree and the laundry move in the breeze.
  const sway = { value: 0 };
  const breeze = { value: 1 };
  const swayMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  swayMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sway;
    shader.uniforms.uBreeze = breeze;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uBreeze;\nattribute float give;").replace(
      "#include <begin_vertex>",
      /* glsl */ `#include <begin_vertex>
{
  float t = uTime;
  float gust = (0.6 + 0.4 * sin(t * 0.31) * sin(t * 0.17 + 1.0)) * uBreeze;
  transformed.x += give * (sin(t * 1.3 + position.x * 0.0004 + position.y * 0.0003) * 0.6 + sin(t * 2.7 + position.z * 0.001) * 0.25) * gust;
  transformed.z += give * sin(t * 1.1 + position.x * 0.0005) * 0.5 * gust;
}`,
    );
  };
  swayMaterial.customProgramCacheKey = () => "windowsill-sway";
  const swaying = new Batch();
  const swayed = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.ColorRepresentation | THREE.Color), give: (p: THREE.Vector3) => number) => {
    const painted = paint(g, c as THREE.ColorRepresentation);
    const pos = painted.attributes.position;
    const values = new Float32Array(pos.count);
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) values[i] = give(p.fromBufferAttribute(pos, i));
    painted.setAttribute("give", new THREE.BufferAttribute(values, 1));
    swaying.add(swayMaterial, painted);
  };
  {
    const base = new THREE.Vector3(-2600, G, -4600);
    const crown = base.clone().add(new THREE.Vector3(200, 3300, 0));
    const fromTrunk = (p: THREE.Vector3) => Math.max(0, p.y - G - 1200) * 0.06;
    const trunk = new THREE.CatmullRomCurve3([base, base.clone().add(new THREE.Vector3(60, 900, 40)), base.clone().add(new THREE.Vector3(-80, 1700, 0)), crown]);
    swayed(new THREE.TubeGeometry(trunk, 8, 150, 7), "#6e5440", fromTrunk);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const end = crown.clone().add(new THREE.Vector3(Math.cos(a) * 1500, rnd.range(200, 900), Math.sin(a) * 1200));
      swayed(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(crown, crown.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 300, 0)), end), 5, 70, 5), "#6e5440", fromTrunk);
    }
    const leaves = [new THREE.Color("#4f9a3c"), new THREE.Color("#63b048"), new THREE.Color("#3f8432"), new THREE.Color("#77c055")];
    for (let i = 0; i < 26; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const r = Math.sqrt(rnd.next()) * 1700;
      const at = crown.clone().add(new THREE.Vector3(Math.cos(a) * r, rnd.range(-200, 1300) - r * 0.25, Math.sin(a) * r * 0.8));
      const s = rnd.range(650, 1050);
      const color = leaves[i % 4];
      swayed(new THREE.IcosahedronGeometry(s, 1).translate(at.x, at.y, at.z), (p) => color.clone().multiplyScalar(0.8 + 0.3 * Math.max(0, (p.y - at.y) / s)), fromTrunk);
    }
    for (let i = 0; i < 30; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const r = rnd.range(900, 1900);
      const at = crown.clone().add(new THREE.Vector3(Math.cos(a) * r, rnd.range(-300, 1000), Math.sin(a) * r * 0.7));
      swayed(new THREE.SphereGeometry(70, 8, 6).translate(at.x, at.y, at.z), rnd.next() < 0.7 ? "#d8342a" : "#e8b22a", fromTrunk);
    }
    for (const item of laundry) swayed(item.g, item.c, (p) => Math.max(0, G + 1800 - p.y) * 0.18);
  }
  swaying.build(scene);

  // Birds crossing the sky now and then, flapping, in one draw; none at night.
  const BIRDS = 4;
  const birdUniforms = { uTime: { value: 0 }, uDay: { value: 1 } };
  const birdGeometry = new THREE.InstancedBufferGeometry();
  // A body and two wings, each wing two panels; `wing` says how far out along a wing a corner is.
  const span = 160;
  const corners = [
    [-span, 10, -20, 1], [-span * 0.45, 0, 40, 0.45], [-span * 0.4, 0, -40, 0.4],
    [0, 0, 70, 0], [-span * 0.45, 0, 40, 0.45], [0, 0, -50, 0],
    [0, 0, -50, 0], [-span * 0.45, 0, 40, 0.45], [-span * 0.4, 0, -40, 0.4],
    [span, 10, -20, 1], [span * 0.4, 0, -40, 0.4], [span * 0.45, 0, 40, 0.45],
    [0, 0, 70, 0], [0, 0, -50, 0], [span * 0.45, 0, 40, 0.45],
    [0, 0, -50, 0], [span * 0.4, 0, -40, 0.4], [span * 0.45, 0, 40, 0.45],
  ];
  birdGeometry.setAttribute("position", new THREE.Float32BufferAttribute(corners.flatMap(([x, y, z]) => [x, y, z]), 3));
  birdGeometry.setAttribute("wing", new THREE.Float32BufferAttribute(corners.map((c) => c[3]), 1));
  const flights = new Float32Array(BIRDS * 4);
  const routes = new Float32Array(BIRDS * 4);
  for (let i = 0; i < BIRDS; i++) {
    const a = rnd.range(-0.5, 0.5) + (i % 2 ? Math.PI : 0);
    flights.set([rnd.range(-3000, 3000), G + rnd.range(5000, 12_000), rnd.range(-9000, -22_000), rnd.range(0, 100)], i * 4);
    routes.set([Math.cos(a), Math.sin(a) * 0.3, rnd.range(5000, 8000), rnd.range(120_000, 200_000)], i * 4);
  }
  birdGeometry.setAttribute("flight", new THREE.InstancedBufferAttribute(flights, 4));
  birdGeometry.setAttribute("route", new THREE.InstancedBufferAttribute(routes, 4));
  birdGeometry.instanceCount = BIRDS;
  const birds = new THREE.Mesh(
    birdGeometry,
    new THREE.ShaderMaterial({
      uniforms: birdUniforms,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
uniform float uTime;
uniform float uDay;
attribute float wing;
attribute vec4 flight;
attribute vec4 route;
void main() {
  // Along its line across the sky and round again, a long way off most of the time.
  float d = mod(uTime * route.z + flight.w * 1000.0, route.w) - route.w * 0.5;
  vec3 dir = normalize(vec3(route.x, 0.0, route.y));
  vec3 at = flight.xyz + dir * d;
  float beat = sin(uTime * 11.0 + flight.w) ;
  // Flap a few beats, then glide.
  float flapping = step(0.0, sin(uTime * 0.9 + flight.w));
  vec3 p = position;
  p.y += wing * abs(p.x) * (beat * 0.55 * flapping + 0.12);
  vec3 side = vec3(dir.z, 0.0, -dir.x);
  vec3 world = at + side * p.x + vec3(0.0, p.y, 0.0) + dir * p.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(world * uDay + at * (1.0 - uDay), 1.0);
}`,
      fragmentShader: "void main() { gl_FragColor = vec4(0.16, 0.15, 0.18, 1.0); }",
    }),
  );
  birds.frustumCulled = false;
  scene.add(birds);

  // Smoke from a few of the chimneys, drifting off on the breeze: soft puffs, each rising, spreading and fading, in one draw.
  const PUFFS = 10;
  const smokers = chimneys.filter((_, i) => i % 2 === 0);
  const smokeGeometry = new THREE.InstancedBufferGeometry();
  smokeGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  smokeGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  const puffs = new Float32Array(smokers.length * PUFFS * 4);
  smokers.forEach((c, i) => {
    for (let k = 0; k < PUFFS; k++) puffs.set([c.x, c.y, c.z, k / PUFFS + i * 0.37], (i * PUFFS + k) * 4);
  });
  smokeGeometry.setAttribute("puff", new THREE.InstancedBufferAttribute(puffs, 4));
  smokeGeometry.instanceCount = smokers.length * PUFFS;
  const smokeUniforms = { uTime: { value: 0 }, uSmoke: { value: 0 }, uColor: { value: new THREE.Color() } };
  const smoke = new THREE.Mesh(
    smokeGeometry,
    new THREE.ShaderMaterial({
      uniforms: smokeUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
uniform float uTime;
attribute vec4 puff;
varying vec2 vUv;
varying float vFade;
void main() {
  float age = fract(uTime * 0.035 + puff.w);
  vec3 at = puff.xyz + vec3(age * 5200.0 + sin(age * 6.0 + puff.w * 9.0) * 300.0, age * 4200.0, age * -800.0);
  float size = 500.0 + age * 3600.0;
  vFade = smoothstep(0.0, 0.08, age) * (1.0 - age);
  vUv = position.xy;
  vec4 mv = modelViewMatrix * vec4(at, 1.0);
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: /* glsl */ `
uniform float uSmoke;
uniform vec3 uColor;
varying vec2 vUv;
varying float vFade;
void main() {
  float d = length(vUv) * 2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, d)) * vFade * uSmoke;
  gl_FragColor = vec4(uColor, a * 0.55);
}`,
    }),
  );
  smoke.frustumCulled = false;
  smoke.renderOrder = -4;
  scene.add(smoke);

  // Rain falling in the garden: streaks on two sheets across the view, near and far, in one draw, drawn only while it rains.
  const rainUniforms = { uTime: { value: 0 }, uRain: { value: 0 }, uColor: { value: new THREE.Color() } };
  const sheets = mergeGeometries([new THREE.PlaneGeometry(9000, 5200).translate(0, G + 2600, -1700), new THREE.PlaneGeometry(26_000, 9000).translate(0, G + 4500, -5200)]);
  const rain = new THREE.Mesh(
    sheets,
    new THREE.ShaderMaterial({
      uniforms: rainUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
      fragmentShader: /* glsl */ `
uniform float uTime;
uniform float uRain;
uniform vec3 uColor;
varying vec3 vWorld;
${NOISE}
void main() {
  // Further sheets have bigger cells, so the streaks look the same size wherever they fall; they fall at 6 m/s, slanting a little.
  float far = step(-3000.0, -vWorld.z);
  float size = mix(36.0, 90.0, far);
  vec2 p = vec2(vWorld.x + vWorld.y * 0.08, vWorld.y + uTime * 6000.0) / vec2(size, size * 30.0);
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float h = hash21(cell);
  float x = 0.2 + 0.6 * hash21(cell + 4.1);
  float y = hash21(cell + 9.3);
  float wide = fwidth(p.x) * 1.2 + 0.03;
  float streak = (1.0 - smoothstep(0.0, wide, abs(f.x - x))) * smoothstep(0.0, 0.05, f.y - y) * (1.0 - smoothstep(0.05, 0.12, f.y - y));
  float a = streak * step(h, uRain * 0.8) * 0.35;
  gl_FragColor = vec4(uColor, a);
}`,
    }),
  );
  rain.frustumCulled = false;
  rain.renderOrder = 2;
  rain.visible = false;
  scene.add(rain);

  const moonColor = new THREE.Color("#9fb4e8");
    return {
    scene,
    update(time: number, camera: THREE.Camera, daylight: Daylight, weather: Weather) {
      snow.update(time, daylight, weather);
      snowCover.value = weather.snowCover;
      sky.position.copy(camera.position);
      sky.updateMatrixWorld();
      // By day the light coming in is the sun's; from dusk the "sun" is the kitchen's lamp, and outside it is the moon.
      const inRoom = Math.min(1, Math.max(0, daylight.sunDirection.z * 4 + 0.2));
      skyUniforms.glow.value = daylight.glow;
      skyUniforms.stars.value = daylight.stars;
      skyUniforms.time.value = time;
      skyUniforms.day.value = 1 - inRoom;
      // The light indoors takes only some of the weather (Scene.open); the garden is out in all of it.
      skyUniforms.cover.value = weather.cloud;
      skyUniforms.mist.value = weather.mist;
      skyUniforms.veil.value.copy(daylight.horizon).lerp(daylight.haze, 0.5).lerp(WHITE, 0.35 * (1 - daylight.stars));
      skyUniforms.cloudLit.value.copy(daylight.cloud);
      skyUniforms.cloudShade.value.copy(daylight.cloud).lerp(daylight.middle, 0.5).multiplyScalar(0.92);
      hemi.color.copy(daylight.zenith).lerp(daylight.horizon, 0.5);
      hemi.groundColor.copy(daylight.groundColor);
      hemi.intensity = 0.55 + 0.6 * (1 - inRoom) * Math.min(1, daylight.sunIntensity);
      sun.color.copy(daylight.sunColor).lerp(moonColor, inRoom);
      sun.intensity = daylight.sunIntensity * (1 - inRoom) + 0.25 * inRoom * daylight.stars * (1 - weather.cloud);
      sun.position.copy(inRoom > 0.5 ? MOON : daylight.sunDirection);
      // Rain and mist close the distance in: in mist the houses are ghosts, and the hills gone.
      const fog = scene.fog as THREE.Fog;
      fog.color.copy(daylight.haze).lerp(skyUniforms.veil.value, weather.mist * 0.7);
      fog.near = THREE.MathUtils.lerp(THREE.MathUtils.lerp(20_000, 8000, weather.rain), 2500, weather.mist);
      fog.far = THREE.MathUtils.lerp(THREE.MathUtils.lerp(260_000, 90_000, weather.rain), 20_000, weather.mist);
      // Lights come on as it gets dark, and on a grey day a few already.
      nightUniform.value = Math.min(1, daylight.stars * 1.4 + weather.cloud * 0.3);
      sway.value = time;
      breeze.value = 0.4 + 1.4 * weather.wind;
      rain.visible = weather.rain > 0.01;
      rainUniforms.uTime.value = time;
      rainUniforms.uRain.value = weather.rain;
      rainUniforms.uColor.value.copy(daylight.horizon).lerp(daylight.haze, 0.5);
      // Fires are lit on cool mornings and in the evening.
      const fires = daylight.time === "noon" || daylight.time === "golden" ? 0.25 : 1;
      smokeUniforms.uSmoke.value += (fires - smokeUniforms.uSmoke.value) * Math.min(1, Math.max(0, time - smokeUniforms.uTime.value) * 0.5);
      smokeUniforms.uTime.value = time;
      smokeUniforms.uColor.value.copy(daylight.cloud).lerp(daylight.haze, 0.4);
      birdUniforms.uTime.value = time;
      // In the rain the birds keep to shelter.
      birdUniforms.uDay.value = (1 - inRoom) * (1 - Math.min(1, weather.rain * 2));
    },
  };
}
