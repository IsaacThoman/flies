// The bar's counter and everything on it, built from the world's description
// (packages/world/src/bar.ts) so that what the fly stands on is exactly what
// is drawn, and the room round it (room.ts). Everything solid is one
// material and everything clear another (materials.ts), so the whole place
// is a few draws.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { BAR_DECOR, BAR_PATCHES, BAR_SOLIDS, BAR_TOP, SYRUP_RING, topHeight } from "@fly/world";
import type { Solid } from "@fly/world";
import { Batch, freeze, mat4, random } from "../../scene/build.ts";
import { WallClock } from "../../scene/clock.ts";
import type { SceneSet } from "../types.ts";
import { lathe, part, puddle, ringPuddle, scatter, sweepRect, topGeometry } from "./geometry.ts";
import type { Caster } from "./light.ts";
import { KIND, RIPPLES, clearMaterial, solidMaterial } from "./materials.ts";
import type { Shared } from "./materials.ts";
import { DIAL, WASH, buildRoom } from "./room.ts";

const byName = (name: string) => BAR_SOLIDS.filter((s) => s.name === name);
const one = (name: string) => byName(name)[0];
const circle = (s: Solid) => s.footprint as { x: number; z: number; r: number };
const ellipse = (s: Solid) => s.footprint as { x: number; z: number; rx: number; rz: number; angle: number };

/** The candle's flame, above its wick, and how bright its light is when lit. */
const FLAME_HEIGHT = 68;
const CANDLE_LIGHT = 16_000;

const FLAME_VS = /* glsl */ `
uniform float uTime;
uniform float uLit;
varying vec2 vUv;
varying float vTop;
void main() {
  vUv = uv;
  // Turned to face the camera, standing up the way the world's up looks on screen; seen from above, round.
  vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 up = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  float side = length(up.xy);
  vTop = 1.0 - smoothstep(0.2, 0.7, side);
  vec2 u = side > 1e-3 ? up.xy / side : vec2(0.0, 1.0);
  vec2 r = vec2(u.y, -u.x);
  // It leans and stretches a little as the air moves.
  float sway = sin(uTime * 2.3) * 0.5 + sin(uTime * 5.1 + 1.0) * 0.3 + sin(uTime * 13.7) * 0.12;
  float h = (16.0 + sin(uTime * 7.3) * 0.9) * uLit;
  float w = 10.0 * uLit;
  float y = position.y;
  vec2 xy = r * position.x * mix(w, h * 0.8, vTop) + u * y * mix(h * 0.5 * max(side, 0.35), h * 0.8, vTop) + r * sway * max(y, 0.0) * 0.9 * (1.0 - vTop);
  gl_Position = projectionMatrix * (centre + vec4(xy, 0.0, 0.0));
}`;

const FLAME_FS = /* glsl */ `
uniform float uLit;
uniform float uFlicker;
varying vec2 vUv;
varying float vTop;
void main() {
  // The quad is twice the flame's width, for the glow round it.
  vec2 p = vUv * 2.0 - 1.0;
  float t = p.y * 0.5 + 0.5;
  // A drop: rounded at its root, widest a quarter of the way up, drawn to a point.
  float w = 0.3 * pow(max(sin(3.14159 * pow(clamp(t, 0.0, 1.0), 0.55)), 0.0), 0.9) + 0.004;
  float across = abs(p.x) / w;
  float side = (1.0 - smoothstep(0.7, 1.0, across)) * step(0.0, t) * step(t, 1.0);
  float round = 1.0 - smoothstep(0.25, 0.5, length(p));
  float body = mix(side, round, vTop);
  // White-yellow at the heart, orange at the edge, blue at the root, a soft glow round it.
  float heart = mix((1.0 - smoothstep(0.0, 0.55, across)) * smoothstep(0.08, 0.25, t) * (1.0 - smoothstep(0.35, 0.75, t)), 1.0 - smoothstep(0.0, 0.25, length(p)), vTop);
  vec3 c = mix(vec3(1.0, 0.42, 0.06), vec3(1.0, 0.78, 0.38), smoothstep(0.95, 0.4, across));
  c = mix(c, vec3(1.0, 0.97, 0.86), heart);
  c = mix(c, vec3(0.3, 0.42, 1.0), (1.0 - smoothstep(0.03, 0.14, t)) * side * (1.0 - vTop) * 0.8);
  float glow = exp(-dot(p * vec2(1.6, 1.0) - vec2(0.0, -0.1), p * vec2(1.6, 1.0) - vec2(0.0, -0.1)) * 3.0) * 0.28;
  float a = (body * mix(1.0, 0.75, 1.0 - heart) + glow) * uLit * uFlicker;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vec3(1.0, 0.55, 0.2), c, body) * a, 1.0);
}`;

/** A candle flame: a quad turned to the camera, shaped in its shader, drawn over what is behind it. */
function flameMesh(at: THREE.Vector3, shared: Shared, lit: { value: number }) {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uLit: lit, uFlicker: { value: 1 } },
    vertexShader: FLAME_VS,
    fragmentShader: FLAME_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(at);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  freeze(mesh);
  return mesh;
}

/**
 * The lime wedge lying in the cocktail, peel up: a quarter of a lime, its
 * peel the world's top (an ellipsoid along it, a circle across), its two cut
 * faces running down to the core at the drink. The peel, the pith and the
 * flesh are drawn in the shader (K_LIME, K_FLESH).
 */
function limeWedge(solid: Solid) {
  const f = ellipse(solid);
  const top = solid.top as { base: number; height: number };
  const spread = (50 * Math.PI) / 180;
  const along = 24;
  const across = 12;
  const peel: number[] = [];
  const faces: number[] = [];
  const at = (t: number, phi: number, k: number) => {
    const r = top.height * Math.sqrt(Math.max(0, 1 - t * t)) * k;
    // Across the cut, the footprint is narrower than the vertical radius.
    return [t * f.rx, top.base + r * Math.cos(phi), (r * f.rz / top.height) * Math.sin(phi)];
  };
  const quad = (out: number[], a: number[], b: number[], c: number[], d: number[]) => out.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < along; i++) {
    const t0 = -1 + (2 * i) / along;
    const t1 = -1 + (2 * (i + 1)) / along;
    for (let j = 0; j < across; j++) {
      const p0 = -spread + (2 * spread * j) / across;
      const p1 = -spread + (2 * spread * (j + 1)) / across;
      quad(peel, at(t0, p0, 1), at(t0, p1, 1), at(t1, p1, 1), at(t1, p0, 1));
    }
    for (const side of [-1, 1]) {
      const phi = side * spread;
      if (side > 0) quad(faces, at(t0, phi, 0), at(t1, phi, 0), at(t1, phi, 1), at(t0, phi, 1));
      else quad(faces, at(t0, phi, 0), at(t0, phi, 1), at(t1, phi, 1), at(t1, phi, 0));
    }
  }
  const place = mat4({ x: f.x, y: 0, z: f.z }, new THREE.Euler(0, f.angle, 0));
  const build = (positions: number[], kind: number) => {
    const flat = new THREE.BufferGeometry();
    flat.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    // Shared corners, so the peel is smooth.
    const geometry = mergeVertices(flat);
    flat.dispose();
    geometry.computeVertexNormals();
    return part(geometry.applyMatrix4(place), "#ffffff", kind);
  };
  return [build(peel, KIND.lime), build(faces, KIND.flesh)];
}

export function buildBar(): SceneSet {
  const group = new THREE.Group();
  const rnd = random(23);
  const { hx, hz } = BAR_TOP;

  const lantern = circle(one("lantern"));
  const cocktail = one("cocktail");
  const cf = circle(cocktail);
  const beer = one("beer");
  const bf = circle(beer);
  const bowl = one("peanuts");
  const pf = circle(bowl);
  const flameAt = new THREE.Vector3(lantern.x, FLAME_HEIGHT, lantern.z);

  const shared: Shared = {
    time: { value: 0 },
    lamps: { value: 0 },
    candle: { value: 0 },
    ripples: { value: new Float32Array(RIPPLES * 4).fill(-100) },
    sunSoft: { value: 0.02 },
    through: { value: 0 },
  };
  // What casts shadows on the counter, and the colour of the light through it.
  const casters: Caster[] = [
    { x: lantern.x, z: lantern.z, r: lantern.r, h: 151, tint: "#a89a8a" },
    { x: cf.x, z: cf.z, r: cf.r, h: 86, tint: "#c23048", focus: 0.8 },
    { x: bf.x, z: bf.z, r: bf.r, h: 155, tint: "#b8701c", focus: 1 },
    { x: pf.x, z: pf.z, r: pf.r, h: 45, tint: "#160c08" },
    ...byName("cherry").map((s) => ({ x: circle(s).x, z: circle(s).z, r: circle(s).r, h: circle(s).r * 2, tint: "#3a0508" })),
  ];
  // Soft contact shadows, painted once.
  const contact = BAR_SOLIDS.filter((s) => s.name !== "ice" && s.name !== "lime").map((s) => {
    const f = s.footprint;
    const r = f.kind === "circle" ? f.r : f.kind === "ellipse" ? Math.max(f.rx, f.rz) * 0.85 : Math.max(f.hx, f.hz);
    const strength = s.name === "coaster" ? 0.25 : s.name === "drop" ? 0.3 : r < 6 ? 0.55 : 0.6;
    return { x: f.x, z: f.z, r: s.name === "coaster" ? r * 1.02 : r, strength };
  });
  const lime = one("lime");
  const clock = new WallClock();
  const solid = solidMaterial(casters, contact, WASH, shared, flameAt, { ...ellipse(lime), ...(lime.top as { base: number; height: number }) }, byName("coaster").map(circle), { dial: DIAL, hands: clock.hands });
  const clear = clearMaterial(casters, shared, new THREE.Vector4(bf.x, bf.z, bf.r - 2, 140), (cocktail.top as { well: number }).well);
  /** What stands on the counter (the fly's eyes see its big shapes), its small details, and the room round it (they see neither). */
  const onCounter = new Batch();
  const details = new Batch();
  const around = new Batch();
  const room = buildRoom(around, solid.material, clear, group, shared);

  // The counter: walnut boards under varnish, a rounded nose all round, on a panelled bar.
  onCounter.add(solid.material, part(new THREE.PlaneGeometry(hx * 2, hz * 2).rotateX(-Math.PI / 2), "#ffffff", KIND.top));
  const nose: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const a = ((i / 8) * Math.PI) / 2;
    nose.push([Math.sin(a) * 18, -18 * (1 - Math.cos(a))]);
  }
  nose.push([18, -33], [16.5, -37], [12, -40], [-40, -40]);
  around.add(solid.material, part(sweepRect(hx, hz, nose), "#ffffff", KIND.wood));
  const front = hz - 175;
  around.add(solid.material, part(new THREE.BoxGeometry(hx * 2 - 30, -40 - (-1100), front + hz - 40).translate(0, (-40 - 1100) / 2, (front - hz + 40) / 2), "#c8b0a0", KIND.wood));
  // Raised panels on the bar's front, a dark kick at its foot, and the brass foot rail on its brackets.
  const panels = 4;
  for (let i = 0; i < panels; i++) {
    const w = (hx * 2 - 120) / panels;
    const x = -hx + 60 + w * (i + 0.5);
    around.add(solid.material, part(new THREE.BoxGeometry(w - 60, 640, 10).translate(x, -470, front + 5), "#a08070", KIND.wood));
    around.add(solid.material, part(new THREE.BoxGeometry(w - 90, 610, 4).translate(x, -470, front + 12), "#d0b8a8", KIND.wood));
  }
  around.add(solid.material, part(new THREE.BoxGeometry(hx * 2 - 30, 110, 6).translate(0, -1045, front + 3), "#1c120c", KIND.plain));
  around.add(solid.material, part(new THREE.CylinderGeometry(22, 22, hx * 2 - 40, 20).rotateZ(Math.PI / 2).translate(0, -920, front + 130), "#d8a656", KIND.metal));
  for (const x of [-hx + 70, 0, hx - 70]) {
    around.add(solid.material, part(new THREE.CylinderGeometry(9, 12, 130, 10).rotateX(Math.PI / 2).translate(x, -920, front + 65), "#c89648", KIND.metal));
  }
  // The bartender's side: a steel shelf under the counter.
  around.add(solid.material, part(new THREE.BoxGeometry(hx * 2 - 40, 14, 160).translate(0, -330, -hz - 30), "#9aa0a6", KIND.metal));

  // Coasters: card, printed in the shader (materials.ts, K_CARD), their edges bevelled as the world has them.
  for (const coaster of byName("coaster")) {
    const f = circle(coaster);
    const profile = [0.9999, 0.99, 0.98, 0.965, 0.95, 0.93, 0.9, 0.7, 0.45, 0.2, 0].map((k) => [f.r * k, topHeight(coaster, f.x + f.r * k, f.z)] as [number, number]);
    onCounter.add(solid.material, part(lathe([[f.r, 0], ...profile], 64, f.x, f.z), "#ffffff", KIND.card));
  }

  // The storm lantern: brass foot, glass chimney, brass cap with vents and a wire bail, a candle inside.
  {
    const { x, z, r } = lantern;
    const cap = one("lantern").top as { base: number; height: number };
    onCounter.add(solid.material, part(lathe([[0, 0], [r, 0], [r, 3], [r - 1.5, 5], [r - 3, 7], [r - 4, 8.5], [0, 8.5]], 48, x, z), "#c99a4e", KIND.metal));
    const dome: [number, number][] = [[r - 1, cap.base - 15], [r, cap.base - 13], [r, cap.base]];
    for (let i = 1; i <= 10; i++) {
      const rr = r * (1 - i / 10);
      dome.push([rr, cap.base + cap.height * (1 - (rr / r) ** 2)]);
    }
    onCounter.add(solid.material, part(lathe(dome, 48, x, z), (p) => {
      const d = Math.hypot(p.x - x, p.z - z);
      const vent = Math.abs(d - r * 0.62) < 2.4 && Math.sin(Math.atan2(p.z - z, p.x - x) * 12) > 0.55;
      return vent ? "#1a120a" : "#c99a4e";
    }, KIND.metal));
    const bail = new THREE.CubicBezierCurve3(new THREE.Vector3(x - r, cap.base - 6, z), new THREE.Vector3(x - r * 0.9, cap.base + 34, z), new THREE.Vector3(x + r * 0.9, cap.base + 34, z), new THREE.Vector3(x + r, cap.base - 6, z));
    onCounter.add(solid.material, part(new THREE.TubeGeometry(bail, 24, 1.1, 6), "#4a3a28", KIND.metal));
    onCounter.add(clear, part(lathe([[r - 2, 8.5], [r - 1.4, 40], [r - 1, 75], [r - 1.4, 105], [r - 2, cap.base - 14], [r - 3, cap.base - 13], [r - 3.5, cap.base - 15], [r - 3.5, 9]], 48, x, z), "#fff8ee", KIND.glass));
    onCounter.add(solid.material, part(lathe([[0, 8.5], [18, 8.5], [18, 58], [17.3, 59.5], [15.5, 58.3], [12, 56.5], [6, 55.8], [0, 55.6]], 40, x, z), "#f4e4c6", KIND.wax));
    const wick = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 55.4, z), new THREE.Vector3(x + 0.2, 58.5, z), new THREE.Vector3(x + 0.9, 61, z + 0.3)]);
    details.add(solid.material, part(new THREE.TubeGeometry(wick, 6, 0.55, 5), (p) => (p.y > 59.5 ? "#0c0806" : "#3a2c20"), KIND.plain));
  }

  // The cocktail: a heavy rocks glass, the drink nearly to the brim, ice standing proud of it, lime on the rim.
  {
    const { x, z, r } = cf;
    onCounter.add(clear, part(lathe([[r - 1, 0], [r, 1.5], [r, 83.5], [r - 0.4, 85.4], [r - 1.6, 86], [r - 2.6, 85.6], [r - 3.3, 84.4], [r - 3.4, 82], [r - 3.4, 11], [r - 5, 9.4], [0, 9.4]], 64, x, z), "#eef6ff", KIND.glass));
    const inner = r - 3.6;
    const well = (cocktail.top as { well: number }).well;
    onCounter.add(clear, part(lathe([[0, 9.8], [inner, 9.8], [inner, topHeight(cocktail, x + inner, z) - 0.05]], 48, x, z), (p) => new THREE.Color("#4a0414").lerp(new THREE.Color("#e8283e"), Math.min(1, Math.max(0, (p.y - 10) / (well - 10)))), KIND.cocktail));
    const surface: [number, number][] = [];
    for (let i = 0; i <= 14; i++) {
      const rr = inner * (1 - (i / 14) ** 1.6);
      surface.push([rr, topHeight(cocktail, x + rr, z) - 0.05]);
    }
    onCounter.add(clear, part(lathe(surface, 64, x, z), "#7a0a1e", KIND.surface));
    // The ice after the drink, faint where it is under the surface (materials.ts, K_ICE).
    for (const ice of byName("ice")) {
      const f = ice.footprint as { x: number; z: number; hx: number; angle: number };
      const top = (ice.top as { y: number }).y;
      onCounter.add(clear, part(new RoundedBoxGeometry(f.hx * 2, f.hx * 2, f.hx * 2, 2, 2.4), "#eef6ff", KIND.ice), mat4({ x: f.x, y: top - f.hx, z: f.z }, new THREE.Euler(0.04, f.angle, -0.03)));
    }
    for (const piece of limeWedge(one("lime"))) onCounter.add(solid.material, piece);
  }

  // The beer: a tall straight glass, the head of foam proud of the rim, cold enough to sweat.
  {
    const { x, z, r } = bf;
    const head = beer.top as { base: number; height: number };
    onCounter.add(clear, part(lathe([[r - 1, 0], [r, 1.5], [r, head.base - 1.2], [r - 0.6, head.base], [r - 1.6, head.base - 0.4], [r - 2, head.base - 2], [r - 2, 9], [r - 3.5, 8], [0, 8]], 64, x, z), "#eef6ff", KIND.glass));
    onCounter.add(clear, part(lathe([[0, 8.4], [r - 2.2, 8.4], [r - 2.2, 139]], 48, x, z), "#c87a10", KIND.beer));
    const foam: [number, number][] = [[r - 2.2, 138.5], [r - 2.1, head.base - 2], [r - 0.5, head.base + 0.6]];
    for (let i = 1; i <= 14; i++) {
      const rr = r * (1 - i / 14);
      foam.push([rr, topHeight(beer, x + rr, z)]);
    }
    onCounter.add(clear, part(lathe(foam, 64, x, z), "#fffaf0", KIND.foam));
  }

  // Salted peanuts heaped in a fluted ramekin; the heap is what the fly stands on, the nuts lie in it with their backs at its surface.
  {
    const { x, z, r } = pf;
    const rim = (bowl.top as { base: number }).base;
    const ramekin = lathe([[r - 1.5, 0], [r, 2], [r, rim - 1.5], [r - 1, rim], [r - 3.2, rim], [r - 4, rim - 2], [r - 4, 7], [0, 7]], 96, x, z);
    const pos = ramekin.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - x;
      const dz = pos.getZ(i) - z;
      const d = Math.hypot(dx, dz);
      if (d < r - 2.5 || pos.getY(i) > rim - 1 || pos.getY(i) < 1.5) continue;
      const k = (r - 2.4 * (0.5 + 0.5 * Math.cos(Math.atan2(dz, dx) * 16))) / d;
      pos.setX(i, x + dx * k);
      pos.setZ(i, z + dz * k);
    }
    ramekin.computeVertexNormals();
    onCounter.add(solid.material, part(ramekin, "#f6f2ea", KIND.glossy));
    onCounter.add(solid.material, part(topGeometry(bowl, 10, 48, 2.6), "#a06c38", KIND.nut));
  }
  const peanutColor = new THREE.Color();
  const tan = new THREE.Color("#e8c48a");
  const toasted = new THREE.Color("#c8904c");
  const skin = new THREE.Color("#7a3218");
  const half = new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const nuts: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
  {
    const n = { x: 0, y: 1, z: 0 };
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 96; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const s = Math.sqrt((i + rnd.next()) / 96) * 0.9;
      const px = pf.x + Math.cos(a) * pf.r * s;
      const pz = pf.z + Math.sin(a) * pf.r * s;
      const y = topHeight(bowl, px, pz);
      const slope = (bowl.top as { height: number }).height * 2 * s / pf.r;
      n.x = Math.cos(a) * slope;
      n.z = Math.sin(a) * slope;
      const normal = new THREE.Vector3(n.x, 1, n.z).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(up, normal).multiply(new THREE.Quaternion().setFromAxisAngle(up, rnd.range(0, Math.PI * 2)));
      const size = rnd.range(0.95, 1.2);
      const centre = new THREE.Vector3(px, y, pz).addScaledVector(normal, -3.3 * size);
      nuts.push({ matrix: new THREE.Matrix4().compose(centre, q, new THREE.Vector3(3 * size, 3.3 * size, 4.4 * size)), color: peanutColor.copy(tan).lerp(toasted, rnd.next() * 0.6).lerp(skin, rnd.next() < 0.15 ? 0.6 : 0).clone() });
    }
  }
  details.add(solid.material, scatter(half, nuts, KIND.nut));
  // The two that fell out, exactly as the world has them, and bits of peanut: boulders at the fly's scale, broken and pale where they broke.
  for (const s of [...byName("peanut"), ...byName("bit")]) {
    const f = ellipse(s);
    const geometry = topGeometry(s, 6, 20);
    if (s.name === "bit") {
      // Broken: their surfaces a little rough, by less than a tenth of a millimetre.
      const pos = geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.05) pos.setY(i, pos.getY(i) * (0.94 + 0.06 * Math.sin(pos.getX(i) * 7.3 + pos.getZ(i) * 5.1)));
      geometry.computeVertexNormals();
    }
    details.add(solid.material, part(geometry, (p) => {
      const u = ((p.x - f.x) * Math.cos(f.angle) - (p.z - f.z) * Math.sin(f.angle)) / f.rx;
      const v = ((p.x - f.x) * Math.sin(f.angle) + (p.z - f.z) * Math.cos(f.angle)) / f.rz;
      if (s.name === "peanut") return v > 0.7 && Math.abs(u) < 0.32 ? "#f0d6a8" : Math.sin(p.x * 9.1 + p.z * 5.3) * Math.sin(p.z * 7.7 - p.x * 3.1) > 0.7 ? "#a8682c" : "#d8a560";
      return Math.sin(p.x * 11.3 + p.z * 4.1) > 0.2 ? "#ecd2a0" : "#c89452";
    }, KIND.nut));
  }
  // Specks of peanut and grains of salt, too small to feel (bar.ts, BAR_DECOR).
  {
    const specks: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
    for (const cluster of BAR_DECOR.bits) {
      for (let i = 0; i < cluster.count; i++) {
        const a = rnd.range(0, Math.PI * 2);
        const d = Math.sqrt(rnd.next()) * cluster.r;
        const size = rnd.range(0.15, 0.45);
        specks.push({
          matrix: mat4({ x: cluster.x + Math.cos(a) * d, y: 0, z: cluster.z + Math.sin(a) * d }, new THREE.Euler(0, rnd.range(0, 6.3), 0), { x: size, y: size * 0.6, z: size * rnd.range(0.7, 1.4) }),
          color: peanutColor.copy(tan).lerp(toasted, rnd.next()).lerp(skin, rnd.next() < 0.2 ? 0.7 : 0).clone(),
        });
      }
    }
    details.add(solid.material, scatter(new THREE.IcosahedronGeometry(1, 0), specks, KIND.nut));
    const salt: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
    const white = new THREE.Color("#ffffff");
    const placeSalt = (x: number, y: number, z: number) => {
      const s = rnd.range(0.18, 0.34);
      salt.push({ matrix: mat4({ x, y: y + s * 0.3, z }, new THREE.Euler(rnd.range(0, 3), rnd.range(0, 3), rnd.range(0, 3)), { x: s, y: s, z: s }), color: white });
    };
    for (const cluster of BAR_DECOR.salt) {
      for (let i = 0; i < cluster.count; i++) {
        const a = rnd.range(0, Math.PI * 2);
        const d = Math.sqrt(rnd.next()) * cluster.r;
        placeSalt(cluster.x + Math.cos(a) * d, 0, cluster.z + Math.sin(a) * d);
      }
    }
    // On the heap and on the fallen nuts.
    for (let i = 0; i < 140; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const s = Math.sqrt(rnd.next()) * 0.92;
      const x = pf.x + Math.cos(a) * pf.r * s;
      const z = pf.z + Math.sin(a) * pf.r * s;
      placeSalt(x, topHeight(bowl, x, z), z);
    }
    for (const nut of byName("peanut")) {
      const f = ellipse(nut);
      for (let i = 0; i < 6; i++) {
        const x = f.x + rnd.range(-1.5, 1.5);
        const z = f.z + rnd.range(-1.5, 1.5);
        placeSalt(x, topHeight(nut, x, z), z);
      }
    }
    details.add(solid.material, scatter(new THREE.BoxGeometry(1, 1, 1), salt, KIND.glossy));
  }

  // Maraschino cherries, glossy as lacquer, on long stems, and the syrup that ran from them.
  for (const cherry of byName("cherry")) {
    const { x, z, r } = circle(cherry);
    const fruit = new THREE.SphereGeometry(r, 28, 18);
    // A dimple where the stem goes in.
    const fp = fruit.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const y = fp.getY(i) / r;
      if (y > 0.82) fp.setY(i, fp.getY(i) - r * 0.22 * (y - 0.82) / 0.18);
    }
    fruit.computeVertexNormals();
    onCounter.add(solid.material, part(fruit.translate(x, r, z), (_p, n) => new THREE.Color("#4a000c").lerp(new THREE.Color("#b80c24"), Math.max(0, n.y * 0.6 + n.x * 0.2 + 0.2)), KIND.cherry));
    const tip = new THREE.Vector3(x + rnd.range(-14, 14), r * 2 + rnd.range(18, 30), z + rnd.range(-20, -6));
    const stem = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, r * 2 - 2.6, z), new THREE.Vector3(x + rnd.range(-3, 3), r * 2 + 12, z), tip);
    details.add(solid.material, part(new THREE.TubeGeometry(stem, 12, 0.8, 5), (p) => (p.y > tip.y - 2 ? "#5a3a1c" : "#8a7a3a"), KIND.plain));
  }
  {
    const syrup = BAR_PATCHES.find((p) => p.name === "cherry syrup")!;
    onCounter.add(clear, part(puddle(syrup.x, syrup.z, syrup.r, 2, 0.1, 0.3), "#8a0a1c", KIND.film));
    onCounter.add(clear, part(ringPuddle(SYRUP_RING.x, SYRUP_RING.z, SYRUP_RING.r, 3.4, 1.3), "#7a0818", KIND.film));
  }

  // The beer spilt on the counter, where rings spread, and a few bubbles left on it.
  {
    const spill = BAR_PATCHES.find((p) => p.name === "beer")!;
    onCounter.add(clear, part(puddle(spill.x, spill.z, spill.r, 4, 0.1, 0.3), "#c08a2a", KIND.film));
    const bubbles: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
    const white = new THREE.Color("#fff6e8");
    for (let i = 0; i < 26; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const d = spill.r * (0.75 + rnd.range(0, 0.2)) * (1 + Math.sin(a * 3 + 4) * 0.12 + Math.sin(a * 5 + 8) * 0.06);
      const b = rnd.range(0.12, 0.35);
      bubbles.push({ matrix: mat4({ x: spill.x + Math.cos(a) * d, y: 0.4, z: spill.z - Math.sin(a) * d }, new THREE.Euler(), { x: b, y: b * 0.8, z: b }), color: white });
    }
    details.add(clear, scatter(new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), bubbles, KIND.drop));
  }

  // Drops: on the coaster at the beer's foot (as the world has them), and beaded on both cold glasses.
  {
    const drops: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
    const clearColor = new THREE.Color("#d8ecf8");
    for (const drop of byName("drop")) {
      const f = circle(drop);
      const t = drop.top as { base: number; height: number };
      drops.push({ matrix: mat4({ x: f.x, y: t.base, z: f.z }, new THREE.Euler(), { x: f.r, y: t.height, z: f.r }), color: clearColor });
    }
    const bead = (gx: number, gz: number, gr: number, y0: number, y1: number, count: number, big: number) => {
      for (let i = 0; i < count; i++) {
        const a = rnd.range(0, Math.PI * 2);
        const y = rnd.range(y0, y1);
        const s = rnd.next() < big ? rnd.range(1.2, 2.2) : rnd.range(0.35, 0.9);
        const n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        drops.push({ matrix: new THREE.Matrix4().compose(new THREE.Vector3(gx + n.x * (gr + 0.05), y, gz + n.z * (gr + 0.05)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n), new THREE.Vector3(s, s * 0.5, s * 1.25)), color: clearColor });
      }
    };
    bead(bf.x, bf.z, bf.r, 6, 136, 190, 0.1);
    bead(cf.x, cf.z, cf.r, 6, 80, 80, 0.08);
    details.add(clear, scatter(new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), drops, KIND.drop));
  }

  // The candle's light, and its flame.
  const candle = new THREE.PointLight("#ff9a48", 0, 1600, 2);
  candle.position.copy(flameAt).add(new THREE.Vector3(0, 2, 0));
  candle.layers.enable(1);
  freeze(candle);
  group.add(candle);
  const flame = flameMesh(flameAt, shared, shared.candle);
  group.add(flame);
  const flicker = (flame.material as THREE.ShaderMaterial).uniforms.uFlicker;

  const order = { renderOrder: new Map([[clear, 3]]) };
  const seen: THREE.Object3D[] = [flame, ...onCounter.build(group, order)];
  details.build(group, order);
  around.build(group, order);

  let nextRipple = 0;
  let nextSettle = 8;
  const ripples = shared.ripples.value;
  const ripple = (x: number, z: number, strength: number) => {
    ripples.set([x, z, shared.time.value, strength], nextRipple * 4);
    nextRipple = (nextRipple + 1) % RIPPLES;
  };
  const ice = byName("ice").map((s) => s.footprint as { x: number; z: number });
  const lightAt = candle.matrixWorld.elements;
  return {
    group,
    materials: [solid.material, clear],
    seen,
    update(time, light) {
      shared.time.value = time;
      shared.lamps.value = light.glow;
      shared.through.value = 0.1 * light.sunIntensity + 0.25 * light.glow;
      // Sunbeams at golden hour cast crisp shadows; the sky's light by day, and the back bar's at night, soft ones.
      shared.sunSoft.value = 0.025 + 0.12 * Math.max(0, 1 - light.glow / 0.3) + 0.22 * light.stars;
      // The candle is lit for the evening. It flickers: mostly steady, now and then it gutters.
      const lit = Math.min(1, Math.max(0, (light.glow - 0.06) / 0.2));
      const gutter = Math.max(0, Math.sin(time * 0.37) * Math.sin(time * 0.61 + 2) - 0.6) * 0.9;
      const f = 1 + Math.sin(time * 11.3) * 0.045 + Math.sin(time * 23.1 + 1) * 0.03 + Math.sin(time * 37.7 + 2) * 0.02 - gutter * (0.5 + 0.5 * Math.sin(time * 17));
      shared.candle.value = lit;
      flicker.value = f;
      candle.intensity = CANDLE_LIGHT * lit * f;
      room.update(time, light);
      clock.update();
      // The flame sways, and its light with it.
      lightAt[12] = flameAt.x + Math.sin(time * 2.3) * 0.4;
      lightAt[14] = flameAt.z + Math.sin(time * 1.7 + 1) * 0.3;
      // Now and then the ice in the cocktail settles.
      if (time > nextSettle) {
        const at = ice[Math.floor(rnd.next() * ice.length)];
        ripple(at.x + rnd.range(-6, 6), at.z + rnd.range(-6, 6), rnd.range(0.3, 0.7));
        nextSettle = time + rnd.range(14, 40);
      }
    },
    ripple,
  };
}
