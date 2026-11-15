// The table and the picnic on it, built from the world's description
// (packages/world/src/picnic.ts) so that what the fly stands on is exactly
// what is drawn. Merged by material into a few meshes.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { DECOR, PATCHES, SOLIDS, TABLE_RADIUS, topHeight, topNormal } from "@fly/world";
import type { Solid } from "@fly/world";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Batch, canvas2d, canvasTexture, freeze, mat4, paint, random } from "./build.ts";
import { LAWN_Y } from "./backdrop.ts";

export type Table = {
  group: THREE.Group;
  /** Materials whose look follows the time of day. */
  materials: THREE.MeshStandardMaterial[];
  /** What the fly's eyes see of the table: the big shapes, without the small details. */
  seen: THREE.Object3D[];
  update(time: number): void;
  /** Sets a ring spreading on the pool of lemonade in the saucer, from a point on it (a drip, a fly's foot), 0 to 1 strong. */
  ripple(x: number, z: number, strength: number): void;
};

/** How many rings can spread on the pool at once. */
const RIPPLES = 4;

const byName = (name: string) => SOLIDS.filter((s) => s.name === name);
const one = (name: string) => byName(name)[0];

/** The uv of a table point, for painting the table's texture. */
const tableUV = (x: number, z: number, size: number) => ({ px: (0.5 + x / (TABLE_RADIUS * 2)) * size, py: (0.5 + z / (TABLE_RADIUS * 2)) * size });

function tableTexture() {
  const S = 1024;
  const { canvas, g } = canvas2d(S, S);
  // Glossy white enamel, a touch warmer at the middle.
  const base = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  base.addColorStop(0, "#ffffff");
  base.addColorStop(0.8, "#f4f8fb");
  base.addColorStop(1, "#dfe9f2");
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  // The napkin is woven in the shader (clothShader), so it stays crisp however close the camera comes.
  // Soft contact shadows under everything standing on the table.
  const shadow = (x: number, z: number, r: number, strength: number) => {
    const c = tableUV(x + r * 0.15, z + r * 0.2, S);
    const rr = (r / (TABLE_RADIUS * 2)) * S * 1.35;
    const grad = g.createRadialGradient(c.px, c.py, rr * 0.2, c.px, c.py, rr);
    grad.addColorStop(0, `rgba(40, 70, 110, ${strength})`);
    grad.addColorStop(1, "rgba(40, 70, 110, 0)");
    g.fillStyle = grad;
    g.fillRect(c.px - rr, c.py - rr, rr * 2, rr * 2);
  };
  for (const solid of SOLIDS) {
    const f = solid.footprint;
    const r = f.kind === "circle" ? f.r : f.kind === "ellipse" ? Math.max(f.rx, f.rz) : Math.max(f.hx, f.hz) * 1.3;
    if (solid.name === "straw" || solid.name === "dew" || solid.name === "crumb" || solid.name === "pip") continue;
    shadow(f.x, f.z, r, solid.name === "lemonade" || solid.name === "jam" ? 0.32 : 0.26);
  }
  // A wet ring left by the lemonade jar.
  const ring = tableUV(-60, -110, S);
  g.beginPath();
  g.arc(ring.px, ring.py, (30 / (TABLE_RADIUS * 2)) * S, 0, Math.PI * 1.7);
  g.strokeStyle = "rgba(150, 200, 235, 0.35)";
  g.lineWidth = 3;
  g.stroke();
  const texture = canvasTexture(canvas);
  return texture;
}

/**
 * The blue gingham napkin, drawn thread by thread on the table's material: a
 * plain weave of white and blue threads (a thread is blue where it crosses a
 * blue band, so where blue meets blue the square is dark and where blue meets
 * white it is light), with a stitched hem, the creases where it was folded in
 * four, and a hairline of shadow round its edge. Threads too fine for the
 * pixels fade into their average, so it never shimmers; from across the table
 * it is plain gingham.
 */
function clothShader(material: THREE.MeshStandardMaterial) {
  const { napkin } = DECOR;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNapkin = { value: new THREE.Vector4(napkin.x, napkin.z, napkin.size / 2, napkin.angle) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vTable;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTable = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
uniform vec4 uNapkin;
varying vec2 vTable;
const float CHECK = ${(napkin.size / 12).toFixed(3)};
const float PITCH = 0.22;
// 1 in the blue half of each check, softened by how many checks a pixel covers.
float band(float x) {
  float t = x / CHECK;
  float tri = abs(fract(t) - 0.5) * 2.0;
  float w = fwidth(t) * 1.5 + 0.004;
  return smoothstep(0.5 - w, 0.5 + w, tri);
}
vec3 napkinUV() {
  vec2 d = vTable - uNapkin.xy;
  float c = cos(uNapkin.w), s = sin(uNapkin.w);
  vec2 uv = vec2(d.x * c - d.y * s, d.x * s + d.y * c);
  return vec3(uv, max(abs(uv.x), abs(uv.y)) - uNapkin.z);
}`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
vec3 nap = napkinUV();
vec2 uv = nap.xy;
float edge = nap.z;
float aa = fwidth(edge) + 0.02;
float inside = 1.0 - smoothstep(-aa, aa, edge);
vec2 th = uv / PITCH;
float detail = 1.0 - smoothstep(0.18, 0.42, max(fwidth(th.x), fwidth(th.y)));
const vec3 WHITE = vec3(0.96);
const vec3 BLUE = vec3(0.13, 0.40, 0.86);
vec3 warp = mix(WHITE, BLUE, band(uv.y));
vec3 weft = mix(WHITE, BLUE, band(uv.x));
vec3 cloth = (warp + weft) * 0.5 * 0.95;
if (detail > 0.0) {
  // Plain weave: warp and weft take turns on top at each crossing; each thread is round, with a dark gap beside it.
  vec2 f = fract(th);
  bool warpOnTop = mod(floor(th.x) + floor(th.y), 2.0) < 1.0;
  float across = warpOnTop ? f.y : f.x;
  float along = warpOnTop ? f.x : f.y;
  float bulge = pow(sin(3.14159 * across), 0.55) * (0.88 + 0.12 * sin(3.14159 * along));
  // A thread's own colour shows a little through the one over it, as in real cloth seen close.
  vec3 thread = mix(warpOnTop ? warp : weft, (warp + weft) * 0.5, 0.35) * (0.74 + 0.26 * bulge);
  cloth = mix(cloth, thread, detail);
}
// The hem: folded under (a touch darker) and stitched in blue.
float hem = smoothstep(-2.6, -2.4, edge);
cloth *= 1.0 - hem * 0.06;
float stitchLine = 1.0 - smoothstep(0.07, 0.07 + fwidth(edge) + 0.03, abs(edge + 1.7));
float along = (abs(uv.x) > abs(uv.y) ? uv.y : uv.x) / 1.7;
float dash = step(0.35, fract(along));
cloth = mix(cloth, vec3(0.03, 0.16, 0.5), stitchLine * dash * 0.85);
diffuseColor.rgb *= mix(vec3(1.0), cloth, inside);
// A hairline of shadow where the cloth's edge stands off the table.
diffuseColor.rgb *= 1.0 - (1.0 - inside) * (1.0 - smoothstep(0.0, 0.6, edge)) * 0.25;`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.92, inside);")
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
{
  // Where it was folded in four: two soft ridges across the middle.
  vec3 nap2 = napkinUV();
  float inside2 = 1.0 - step(0.0, nap2.z);
  vec2 slope = vec2(-nap2.x * exp(-nap2.x * nap2.x / 3.0), -nap2.y * exp(-nap2.y * nap2.y / 3.0)) * 0.06 * inside2;
  vec3 tilted = normalize(vec3(-slope.x, 1.0, -slope.y));
  float c = cos(uNapkin.w), s = sin(uNapkin.w);
  tilted = vec3(tilted.x * c + tilted.z * s, tilted.y, -tilted.x * s + tilted.z * c);
  normal = normalize((viewMatrix * vec4(tilted, 0.0)).xyz);
}`,
      );
  };
  material.customProgramCacheKey = () => "napkin";
}

function ginghamTexture(color: string) {
  const { canvas, g } = canvas2d(128, 128);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = color;
  for (let i = 0; i < 8; i++) {
    g.globalAlpha = 0.55;
    g.fillRect(i * 16, 0, 8, 128);
    g.fillRect(0, i * 16, 128, 8);
  }
  g.globalAlpha = 1;
  const texture = canvasTexture(canvas, { repeat: true });
  texture.repeat.set(1.6, 1.6);
  return texture;
}

/** A soft ellipse on the table: a shadow, or with `light` the bright spot a drop of water focuses the sun into. */
type Spot = { x: number; z: number; rx: number; rz: number; angle: number; strength: number; light?: boolean };

/** Soft shadows under the small things on the table, where things touch it, and the light focused under drops: one merged mesh of blurred ellipses. */
function contactShadows(spots: readonly Spot[]) {
  const { canvas, g } = canvas2d(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const pieces = spots.map((spot) => {
    const quad = new THREE.PlaneGeometry(spot.rx * 2, spot.rz * 2).rotateX(-Math.PI / 2).rotateY(spot.angle).translate(spot.x + spot.rx * 0.12, 0.015, spot.z + spot.rz * 0.15);
    const tone = new Float32Array(quad.attributes.position.count * 4);
    const [r, g, b] = spot.light ? [1, 0.99, 0.92] : [0.12, 0.2, 0.32];
    for (let i = 0; i < tone.length; i += 4) tone.set([r, g, b, spot.strength], i);
    quad.setAttribute("tone", new THREE.BufferAttribute(tone, 4));
    return quad;
  });
  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: canvasTexture(canvas, { srgb: false }) } },
    vertexShader: "attribute vec4 tone; varying vec2 vUv; varying vec4 vTone; void main() { vUv = uv; vTone = tone; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform sampler2D map; varying vec2 vUv; varying vec4 vTone; void main() { gl_FragColor = vec4(vTone.rgb, texture2D(map, vUv).r * vTone.a); }",
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1;
  freeze(mesh);
  return mesh;
}

/** The top of a domed solid as a mesh: a polar grid over its footprint, at exactly its height. */
function domeGeometry(solid: Solid, rings: number, segments: number) {
  const f = solid.footprint;
  if (f.kind === "box") throw new Error("Boxes are flat");
  const rx = f.kind === "circle" ? f.r : f.rx;
  const rz = f.kind === "circle" ? f.r : f.rz;
  const angle = f.kind === "circle" ? 0 : f.angle;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const positions: number[] = [];
  const normals: number[] = [];
  const n = { x: 0, y: 1, z: 0 };
  const point = (si: number, ti: number) => {
    const sv = Math.min(0.9999, si / rings);
    const th = (ti / segments) * Math.PI * 2;
    const u = Math.cos(th) * rx * sv;
    const v = Math.sin(th) * rz * sv;
    const x = f.x + u * c + v * s;
    const z = f.z - u * s + v * c;
    const y = topHeight(solid, x, z);
    topNormal(solid, x, z, n);
    positions.push(x, y, z);
    normals.push(n.x, n.y, n.z);
  };
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      point(i, j);
      point(i + 1, j + 1);
      point(i + 1, j);
      if (i > 0) {
        point(i, j);
        point(i, j + 1);
        point(i + 1, j + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

export function buildTable(): Table {
  const group = new THREE.Group();
  const rnd = random(11);
  const glossy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0, envMapIntensity: 0.6 });
  const juicy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0, envMapIntensity: 0.55 });
  const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, envMapIntensity: 0.5 });
  const tableMaterial = new THREE.MeshStandardMaterial({ map: tableTexture(), roughness: 0.3, metalness: 0, envMapIntensity: 0.5 });
  clothShader(tableMaterial);
  const cloth = new THREE.MeshStandardMaterial({ map: ginghamTexture("#e8344e"), roughness: 0.85, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: "#e6f6ff", roughness: 0.04, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false, envMapIntensity: 1.4 });
  const liquid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, transparent: true, opacity: 0.72, depthWrite: false });
  const batch = new Batch();
  const seen: THREE.Object3D[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];

  // The table: a glossy white disc with a rounded rim on a white pedestal.
  const top = new THREE.Mesh(new THREE.CircleGeometry(TABLE_RADIUS, 96).rotateX(-Math.PI / 2), tableMaterial);
  freeze(top);
  group.add(top);
  seen.push(top);
  batch.add(glossy, paint(new THREE.CylinderGeometry(TABLE_RADIUS + 4, TABLE_RADIUS + 1, 10, 96, 1, true).translate(0, -7, 0), "#f2f7fb"));
  batch.add(glossy, paint(new THREE.TorusGeometry(TABLE_RADIUS + 1.5, 4, 8, 96).rotateX(Math.PI / 2).translate(0, -1.5, 0), "#ffffff"));
  const pedestal = new THREE.LatheGeometry(
    [[0, LAWN_Y], [150, LAWN_Y], [150, LAWN_Y + 14], [40, LAWN_Y + 50], [28, LAWN_Y + 200], [24, -60], [60, -18], [0, -12]].map(([r, y]) => new THREE.Vector2(r, y)),
    32,
  );
  batch.add(glossy, paint(pedestal, "#eef4f8"));

  // The lemonade: a tall jar with a blue lid and a striped straw.
  const lemonade = one("lemonade");
  const lf = lemonade.footprint as { x: number; z: number; r: number };
  const lidTop = (lemonade.top as { y: number }).y;
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(lf.r, lf.r, lidTop - 9, 48, 1, true).translate(lf.x, (lidTop - 9) / 2, lf.z), glass);
  jar.renderOrder = 3;
  freeze(jar);
  group.add(jar);
  const drink = new THREE.Mesh(paint(new THREE.CylinderGeometry(lf.r - 1.5, lf.r - 1.5, lidTop - 26, 40).translate(lf.x, (lidTop - 26) / 2 + 1, lf.z), (p) => (p.y > lidTop - 30 ? "#fff6b8" : "#ffe14f")), liquid);
  drink.renderOrder = 2;
  freeze(drink);
  group.add(drink);
  seen.push(drink);
  batch.add(glossy, paint(new THREE.CylinderGeometry(lf.r + 1.5, lf.r + 1.5, 9, 48).translate(lf.x, lidTop - 4.5, lf.z), (p, n) => (n.y > 0.5 ? "#7fd4ff" : Math.sin(p.y * 2.2) > 0 ? "#43aef0" : "#9fe0ff")));
  // A lemon slice standing in the drink, against the glass.
  batch.add(juicy, paint(new THREE.CylinderGeometry(20, 20, 3, 32).rotateX(Math.PI / 2).rotateY(0.6).translate(lf.x + 12, 44, lf.z + 22), (p) => {
    const d = Math.hypot(p.x - (lf.x + 12), p.y - 44);
    return d > 18 ? "#f5d000" : d > 16.5 ? "#fffbe0" : Math.sin(Math.atan2(p.y - 44, p.x - lf.x - 12) * 5) > 0.85 ? "#fffbe0" : "#ffe66b";
  }));
  const straw = one("straw");
  const sf = straw.footprint as { x: number; z: number; r: number };
  const strawTop = (straw.top as { y: number }).y;
  batch.add(glossy, paint(new THREE.CylinderGeometry(sf.r, sf.r, strawTop - 50, 12, 24).translate(sf.x, (strawTop + 50) / 2, sf.z), (p) => (Math.floor((p.y - 50) / 7) % 2 === 0 ? "#ff5f9e" : "#ffffff")));

  // The saucer under the jar, its glaze following its shape in the world exactly, and the lemonade pooled in its moat.
  const saucer = one("saucer");
  const pool = PATCHES.find((p) => p.name === "lemonade")!;
  const ripples = new Float32Array(RIPPLES * 4).fill(-100);
  const poolUniforms = { uTime: { value: 0 }, uRipples: { value: ripples } };
  {
    const f = saucer.footprint as { x: number; z: number; r: number };
    const top = saucer.top as { inner: number; lip: number };
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 48; i++) {
      const r = lf.r - 2 + ((f.r - lf.r + 2) * i) / 48;
      profile.push(new THREE.Vector2(r, topHeight(saucer, f.x + Math.min(r, f.r * 0.9999), f.z)));
    }
    // Outside in, so its faces point up.
    profile.reverse();
    batch.add(juicy, paint(new THREE.LatheGeometry(profile, 72).translate(f.x, 0, f.z), (p) => {
      const s = Math.hypot(p.x - f.x, p.z - f.z) / f.r;
      if (Math.abs(s - top.lip) < 0.025) return "#ffffff";
      if (Math.abs(s - (top.lip + 0.065)) < 0.01) return "#1f8fd0";
      return s < top.inner + 0.02 ? "#86d3f0" : "#45b4e6";
    }));
    // The pool: a blob round the patch, kept to the moat's flat floor.
    const pc = { x: pool.x - f.x, z: pool.z - f.z };
    const shape = new THREE.Shape();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const rr = pool.r * (0.95 + Math.sin(a * 3 + 1) * 0.08 + Math.sin(a * 5) * 0.04);
      let x = pc.x + Math.cos(a) * rr;
      let z = pc.z + Math.sin(a) * rr;
      const d = Math.hypot(x, z);
      const k = Math.min(top.inner * f.r - 0.4, Math.max(lf.r + 0.6, d)) / d;
      x *= k;
      z *= k;
      if (i === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    }
    const well = (saucer.top as { well: number }).well;
    const poolMaterial = new THREE.MeshStandardMaterial({ color: "#ffd84a", roughness: 0.03, transparent: true, opacity: 0.78, envMapIntensity: 2, depthWrite: false });
    poolMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, poolUniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vTable;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTable = (modelMatrix * vec4(transformed, 1.0)).xz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nvarying vec2 vTable;\nuniform float uTime;\nuniform vec4 uRipples[${RIPPLES}];`)
        .replace(
          "#include <normal_fragment_maps>",
          /* glsl */ `#include <normal_fragment_maps>
{
  // Rings spreading from each disturbance at 6 mm/s, a millimetre apart, dying away; they bend the reflection and catch the light.
  vec2 slope = vec2(0.0);
  float shade = 0.0;
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (age < 0.0 || age > 4.0) continue;
    vec2 d = vTable - r.xy;
    float dist = length(d) + 1e-4;
    float front = age * 6.0;
    float behind = front - dist;
    if (behind < 0.0) continue;
    float fade = exp(-behind * 0.5) * exp(-age * 0.8) * r.w * smoothstep(0.0, 0.5, behind);
    slope += d / dist * sin(behind * 6.0) * fade * 0.6;
    shade += cos(behind * 6.0) * fade;
  }
  diffuseColor.rgb *= 1.0 + shade * 0.22;
  vec3 tilted = normalize(vec3(-slope.x, 1.0, -slope.y));
  normal = normalize((viewMatrix * vec4(tilted, 0.0)).xyz);
}`,
        );
    };
    poolMaterial.customProgramCacheKey = () => "pool";
    const poolMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1).rotateX(-Math.PI / 2).translate(f.x, well + 0.05, f.z), poolMaterial);
    poolMesh.renderOrder = 2;
    freeze(poolMesh);
    group.add(poolMesh);
    seen.push(poolMesh);
    materials.push(poolMaterial);
  }
  let nextRipple = 0;
  let nextDrip = 2;
  const ripple = (x: number, z: number, strength: number) => {
    ripples.set([x, z, poolUniforms.uTime.value, strength], nextRipple * 4);
    nextRipple = (nextRipple + 1) % RIPPLES;
  };

  // The jam jar, with a gingham cover tied with a ribbon.
  const jam = one("jam");
  const jf = jam.footprint as { x: number; z: number; r: number };
  const jamTop = (jam.top as { y: number }).y;
  const jamGlass = new THREE.Mesh(new THREE.CylinderGeometry(jf.r, jf.r, jamTop - 8, 48, 1, true).translate(jf.x, (jamTop - 8) / 2, jf.z), glass);
  jamGlass.renderOrder = 3;
  freeze(jamGlass);
  group.add(jamGlass);
  batch.add(juicy, paint(new THREE.CylinderGeometry(jf.r - 1.2, jf.r - 1.2, jamTop - 16, 40).translate(jf.x, (jamTop - 16) / 2 + 1, jf.z), "#d4123e"));
  const cover = new THREE.CylinderGeometry(jf.r + 3, jf.r + 9, 13, 48, 3, true);
  {
    const pos = cover.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < -6) {
        const a = Math.atan2(pos.getZ(i), pos.getX(i));
        pos.setY(i, y + Math.sin(a * 9) * 2.2);
      }
    }
  }
  const coverSkirt = new THREE.Mesh(cover.translate(jf.x, jamTop - 7.5, jf.z), cloth);
  const coverTop = new THREE.Mesh(new THREE.CircleGeometry(jf.r + 3, 48).rotateX(-Math.PI / 2).translate(jf.x, jamTop, jf.z), cloth);
  for (const m of [coverSkirt, coverTop]) {
    freeze(m);
    group.add(m);
    seen.push(m);
  }
  batch.add(glossy, paint(new THREE.TorusGeometry(jf.r + 3.6, 1.6, 6, 48).rotateX(Math.PI / 2).translate(jf.x, jamTop - 6, jf.z), "#ff7eb6"));

  // Strawberries: a whole one with seeds and leaves, and a half one, cut face up.
  const berry = one("strawberry");
  batch.add(juicy, paint(domeGeometry(berry, 14, 40), (p) => {
    const k = Math.min(1, p.y / 20);
    return new THREE.Color("#c3001f").lerp(new THREE.Color("#ff3048"), k);
  }));
  const half = one("strawberry half");
  batch.add(juicy, paint(domeGeometry(half, 10, 40), (p) => {
    const hf = half.footprint as { x: number; z: number; rx: number; rz: number; angle: number };
    const s = Math.min(1, Math.hypot((p.x - hf.x) / hf.rx, (p.z - hf.z) / hf.rz));
    return s > 0.86 ? "#e0102c" : s > 0.7 ? "#ff6b7c" : s > 0.25 ? "#ffb3bd" : "#fff0f0";
  }));
  const leafColor = (p: THREE.Vector3) => (p.y > 0 ? "#3fbf3a" : "#2c8f2a");
  {
    const bf = berry.footprint as { x: number; z: number; rx: number; rz: number; angle: number };
    // The green sepals, a star lying over one end of its long axis.
    const ex = bf.x + Math.sin(bf.angle) * bf.rz * 0.78;
    const ez = bf.z + Math.cos(bf.angle) * bf.rz * 0.78;
    const ey = topHeight(berry, ex, ez);
    const sepal = new THREE.Shape();
    sepal.moveTo(0, -2.2);
    sepal.quadraticCurveTo(5, -1.2, 11, 0);
    sepal.quadraticCurveTo(5, 1.2, 0, 2.2);
    sepal.closePath();
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.ShapeGeometry(sepal, 4).rotateX(-Math.PI / 2);
      const m = mat4({ x: ex, y: ey + 0.6, z: ez }, new THREE.Euler(0.25 * Math.sin(i * 1.7), (i / 7) * Math.PI * 2 + bf.angle, -0.35, "YXZ"));
      batch.add(matte, paint(leaf, (p) => (p.y > ey + 1 ? "#62d84a" : "#2fa83a")), m);
    }
    batch.add(matte, paint(new THREE.CylinderGeometry(0.9, 1.2, 7, 6).rotateZ(0.5).translate(ex + 1, ey + 3, ez), "#3c9a2e"));
  }
  // Seeds on the whole strawberry, following its surface.
  const seeds: THREE.Matrix4[] = [];
  {
    const bf = berry.footprint as { x: number; z: number; rx: number; rz: number; angle: number };
    const n = { x: 0, y: 1, z: 0 };
    for (let i = 0; i < 90; i++) {
      const th = rnd.range(0, Math.PI * 2);
      const sv = Math.sqrt(rnd.range(0.02, 0.85));
      const u = Math.cos(th) * bf.rx * sv;
      const v = Math.sin(th) * bf.rz * sv;
      const x = bf.x + u * Math.cos(bf.angle) + v * Math.sin(bf.angle);
      const z = bf.z - u * Math.sin(bf.angle) + v * Math.cos(bf.angle);
      const y = topHeight(berry, x, z);
      topNormal(berry, x, z, n);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x, n.y, n.z));
      seeds.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.1, z), q, new THREE.Vector3(1, 0.5, 1)));
    }
  }
  const seedMesh = new THREE.InstancedMesh(paint(new THREE.SphereGeometry(0.7, 6, 4), "#ffe27a"), glossy, seeds.length);
  seeds.forEach((m, i) => seedMesh.setMatrixAt(i, m));
  seedMesh.computeBoundingSphere();
  freeze(seedMesh);
  group.add(seedMesh);

  // Cherries on their stems.
  const cherries = byName("cherry");
  for (const cherry of cherries) {
    const f = cherry.footprint as { x: number; z: number; r: number };
    batch.add(juicy, paint(new THREE.SphereGeometry(f.r, 28, 18).translate(f.x, f.r, f.z), (_p, n) => (n.y > 0.85 ? "#ff3d5c" : "#a3001f")));
  }
  {
    const [a, b] = cherries.map((c) => c.footprint as { x: number; z: number; r: number });
    const join = new THREE.Vector3((a.x + b.x) / 2 + 8, 42, (a.z + b.z) / 2 - 10);
    for (const c of [a, b]) {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(c.x, c.r * 2 - 1, c.z), new THREE.Vector3(c.x + 2, c.r * 2 + 18, c.z - 4), join);
      batch.add(matte, paint(new THREE.TubeGeometry(curve, 10, 0.9, 5), "#5d8a2b"));
    }
    const cherryLeaf = new THREE.SphereGeometry(1, 12, 6).scale(6, 0.6, 15);
    batch.add(matte, paint(cherryLeaf, leafColor), mat4(join.clone().add(new THREE.Vector3(4, 1, -10)), new THREE.Euler(0.4, 0.5, 0.3)));
  }

  // A slice of orange.
  {
    const orange = one("orange slice");
    const f = orange.footprint as { x: number; z: number; r: number };
    const h = (orange.top as { y: number }).y;
    batch.add(juicy, paint(new THREE.CylinderGeometry(f.r, f.r, h, 64, 1, false).translate(f.x, h / 2, f.z), (p, n) => {
      if (n.y < 0.5) return "#ff9a1a";
      const dx = p.x - f.x;
      const dz = p.z - f.z;
      const d = Math.hypot(dx, dz) / f.r;
      if (d > 0.94) return "#ff8a00";
      if (d > 0.86) return "#fff3d6";
      const a = Math.atan2(dz, dx);
      const segment = Math.abs(Math.sin(a * 5));
      if (segment < 0.08 || d < 0.1) return "#fff3d6";
      return new THREE.Color("#ffb21e").lerp(new THREE.Color("#ffd65c"), d * 0.7);
    }));
  }

  // A green apple.
  {
    const apple = one("apple");
    const f = apple.footprint as { x: number; z: number; r: number };
    const base = (apple.top as { base: number }).base;
    batch.add(juicy, paint(new THREE.SphereGeometry(f.r, 40, 26).translate(f.x, base, f.z), (p) => {
      const blush = Math.max(0, Math.sin((p.x - f.x) * 0.05 + 1) * Math.cos((p.z - f.z) * 0.04)) * Math.max(0, (p.y - base) / f.r);
      return new THREE.Color("#79d33f").lerp(new THREE.Color("#ffd23a"), Math.max(0, (p.y - base) / f.r) * 0.25).lerp(new THREE.Color("#ff6b3a"), blush * 0.5);
    }));
    const stem = new THREE.QuadraticBezierCurve3(new THREE.Vector3(f.x, base + f.r - 2, f.z), new THREE.Vector3(f.x + 1, base + f.r + 6, f.z), new THREE.Vector3(f.x + 4, base + f.r + 10, f.z + 1));
    batch.add(matte, paint(new THREE.TubeGeometry(stem, 6, 1.2, 5), "#7a4a24"));
    batch.add(matte, paint(new THREE.SphereGeometry(1, 12, 6).scale(7, 0.6, 16), leafColor), mat4({ x: f.x + 9, y: base + f.r + 8, z: f.z + 5 }, new THREE.Euler(0.5, 0.9, -0.4)));
  }

  // Sugar cubes, and grains of sugar spilt beside them.
  for (const cube of byName("sugar")) {
    const f = cube.footprint as { x: number; z: number; hx: number; hz: number; angle: number };
    const y = (cube.top as { y: number }).y;
    const geometry = new RoundedBoxGeometry(f.hx * 2, 16, f.hz * 2, 2, 1.2);
    batch.add(matte, paint(geometry, (p) => (Math.sin(p.x * 3.1) * Math.cos(p.z * 2.7 + p.y) > 0.92 ? "#e8f6ff" : "#fcfeff")), mat4({ x: f.x, y: y - 8, z: f.z }, new THREE.Euler(0, f.angle, 0)));
  }
  const grains: THREE.Matrix4[] = [];
  for (const p of PATCHES.filter((p) => p.name === "spilt sugar")) {
    for (let i = 0; i < 70; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const r = Math.sqrt(rnd.next()) * p.r * 1.3;
      grains.push(mat4({ x: p.x + Math.cos(a) * r, y: 0.3, z: p.z + Math.sin(a) * r }, new THREE.Euler(rnd.range(0, 3), rnd.range(0, 3), rnd.range(0, 3)), { x: 1, y: 1, z: 1 }));
    }
  }
  const grainMesh = new THREE.InstancedMesh(paint(new THREE.BoxGeometry(0.6, 0.6, 0.6), "#ffffff"), glossy, grains.length);
  grains.forEach((m, i) => grainMesh.setMatrixAt(i, m));
  grainMesh.computeBoundingSphere();
  freeze(grainMesh);
  group.add(grainMesh);

  // Crumbs and pips at the fly's own scale, with soft shadows under them (one merged draw, see contactShadows).
  const shadows: Spot[] = [];
  const crumbColor = (p: THREE.Vector3) => {
    const speck = Math.sin(p.x * 13.1 + p.z * 7.7) * Math.sin(p.z * 11.3 - p.x * 5.1 + p.y * 9);
    return speck > 0.55 ? "#b5722e" : speck < -0.7 ? "#f6dca0" : p.y > 0.6 ? "#e9b464" : "#d39446";
  };
  for (const crumb of byName("crumb")) {
    const f = crumb.footprint as { x: number; z: number; rx: number; rz: number; angle: number };
    batch.add(matte, paint(domeGeometry(crumb, 6, 18), crumbColor));
    shadows.push({ x: f.x, z: f.z, rx: f.rx * 1.25, rz: f.rz * 1.25, angle: f.angle, strength: 0.5 });
  }
  for (const pip of byName("pip")) {
    const f = pip.footprint as { x: number; z: number; rx: number; rz: number; angle: number };
    batch.add(juicy, paint(domeGeometry(pip, 5, 16), (p) => (p.y > 0.7 ? "#fff8dc" : "#f1e2a8")));
    shadows.push({ x: f.x, z: f.z, rx: f.rx * 1.3, rz: f.rz * 1.25, angle: f.angle, strength: 0.4 });
  }
  // Specks of biscuit, too small to feel underfoot (picnic.ts, DECOR.crumbs).
  for (const cluster of DECOR.crumbs) {
    for (let i = 0; i < cluster.count; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const r = Math.sqrt(rnd.next()) * cluster.r;
      const size = rnd.range(0.12, 0.42) * (r < cluster.r * 0.4 ? 1.3 : 1);
      const speck = new THREE.IcosahedronGeometry(1, 0);
      const pos = speck.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const j = 0.75 + 0.5 * Math.abs(Math.sin(pos.getX(k) * 5.3 + pos.getZ(k) * 3.1 + i));
        pos.setXYZ(k, pos.getX(k) * j, Math.max(-0.1, pos.getY(k)) * j * 0.7, pos.getZ(k) * j);
      }
      const x = cluster.x + Math.cos(a) * r;
      const z = cluster.z + Math.sin(a) * r;
      batch.add(matte, paint(speck, crumbColor), mat4({ x, y: 0, z }, new THREE.Euler(0, rnd.range(0, 6.3), 0), { x: size, y: size, z: size * rnd.range(0.7, 1.3) }));
      if (size > 0.3) shadows.push({ x, z, rx: size * 1.6, rz: size * 1.6, angle: 0, strength: 0.3 });
    }
  }

  // A drip of honey and a smear of jam: flat, glossy puddles.
  const puddle = (x: number, z: number, r: number, color: string, wobble: number) => {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr = r * (1 + Math.sin(a * 3 + wobble) * 0.12 + Math.sin(a * 5 + wobble * 2) * 0.06);
      if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.6, bevelSegments: 2 });
    batch.add(juicy, paint(geometry.rotateX(-Math.PI / 2).translate(x, 0.05, z), color));
  };
  const honey = PATCHES.find((p) => p.name === "honey")!;
  const jamPatch = PATCHES.find((p) => p.name === "jam")!;
  puddle(honey.x, honey.z, honey.r, "#ffae1a", 1);
  puddle(jamPatch.x, jamPatch.z, jamPatch.r, "#b5002c", 3);

  // A fallen leaf, thin enough to walk over.
  {
    const { leaf } = DECOR;
    const shape = new THREE.Shape();
    shape.moveTo(0, -leaf.length / 2);
    shape.quadraticCurveTo(leaf.length * 0.32, 0, 0, leaf.length / 2);
    shape.quadraticCurveTo(-leaf.length * 0.32, 0, 0, -leaf.length / 2);
    const geometry = new THREE.ShapeGeometry(shape, 12).rotateX(-Math.PI / 2);
    batch.add(matte, paint(geometry, (p) => (Math.abs(p.x) < 0.8 ? "#c6ef7a" : "#6fcb3c")), mat4({ x: leaf.x, y: 0.12, z: leaf.z }, new THREE.Euler(0, leaf.angle, 0)));
  }

  // Dew: clear drops on the table and on the lemonade jar.
  const dew: THREE.Matrix4[] = [];
  for (const drop of byName("dew")) {
    const f = drop.footprint as { x: number; z: number; r: number };
    const h = (drop.top as { height: number }).height;
    dew.push(mat4({ x: f.x, y: 0, z: f.z }, new THREE.Euler(), { x: f.r, y: h, z: f.r }));
    // The drop's shadow, with the sun it gathers focused bright in the middle.
    shadows.push({ x: f.x, z: f.z, rx: f.r * 1.5, rz: f.r * 1.5, angle: 0, strength: 0.28 });
    shadows.push({ x: f.x - f.r * 0.25, z: f.z - f.r * 0.3, rx: f.r * 0.7, rz: f.r * 0.7, angle: 0, strength: 0.75, light: true });
  }
  for (let i = 0; i < 40; i++) {
    const a = rnd.range(-0.4, 2.2) + Math.PI * 0.4;
    const y = rnd.range(8, lidTop - 16);
    const r = rnd.range(0.8, 2.2);
    const q = new THREE.Euler(0, 0, 0);
    const m = new THREE.Matrix4().makeRotationFromEuler(q);
    const n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    m.compose(new THREE.Vector3(lf.x + n.x * (lf.r + 0.1), y, lf.z + n.z * (lf.r + 0.1)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n), new THREE.Vector3(r, r * 0.6, r * 1.2));
    dew.push(m);
  }
  const dewMaterial = new THREE.MeshStandardMaterial({ color: "#cfe6f5", roughness: 0.04, transparent: true, envMapIntensity: 2.4, depthWrite: false });
  // Water: clear where you look straight through it, mirror-bright at its edge, with the dark band a lens makes of what's behind it.
  dewMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      /* glsl */ `float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
float edge = pow(1.0 - facing, 2.0);
float lens = smoothstep(0.25, 0.55, 1.0 - facing) * (1.0 - smoothstep(0.75, 0.97, 1.0 - facing));
outgoingLight *= 1.0 - lens * 0.45;
outgoingLight += vec3(0.08, 0.1, 0.12) * (1.0 - edge);
diffuseColor.a = clamp(0.18 + edge * 0.85 + lens * 0.25 + dot(outgoingLight, vec3(0.3)) * 0.15, 0.0, 1.0);
#include <opaque_fragment>`,
    );
  };
  dewMaterial.customProgramCacheKey = () => "dew";
  const dewMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), dewMaterial, dew.length);
  dew.forEach((m, i) => dewMesh.setMatrixAt(i, m));
  dewMesh.computeBoundingSphere();
  dewMesh.renderOrder = 4;
  freeze(dewMesh);
  group.add(dewMesh);

  group.add(contactShadows(shadows));

  seen.push(...batch.build(group));
  return {
    group,
    materials: [glossy, juicy, matte, tableMaterial, cloth, glass, liquid, dewMaterial, ...materials],
    seen,
    update(time: number) {
      poolUniforms.uTime.value = time;
      // Now and then a drop of dew runs down the jar into the pool.
      if (time > nextDrip) {
        const a = rnd.range(0, Math.PI * 2);
        const r = Math.sqrt(rnd.next()) * pool.r * 0.7;
        ripple(pool.x + Math.cos(a) * r, pool.z + Math.sin(a) * r, rnd.range(0.4, 1));
        nextDrip = time + rnd.range(3, 9);
      }
    },
    ripple,
  };
}
