// The picnic's table and everything on it, built from the world's description
// (packages/world/src/picnic.ts) so that what the fly stands on is exactly
// what is drawn. Merged by material into a few meshes. Everything on it gets
// wet in the rain, and takes the shadow of a gull passing over; its comings
// and goings are in life.ts.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { DECOR, HAPPENINGS, PATCHES, SOLIDS, TABLE_RADIUS, topHeight, topNormal } from "@fly/world";
import type { Happening, Solid } from "@fly/world";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Batch, canvas2d, canvasTexture, freeze, mat4, paint, random } from "../../scene/build.ts";
import { shaded } from "../../scene/shade.ts";
import type { SceneSet } from "../types.ts";
import { LAWN_Y } from "./backdrop.ts";
import { Goings } from "./life.ts";
import { outside } from "./outside.ts";
import { LEAF_FRAGMENT, leafGeometry } from "./visitors.ts";
import { BUMP, ENAMEL, GINGHAM, NOISE, SKIN, fruitSkins, skin } from "./surfaces.ts";

const byName = (name: string) => SOLIDS.filter((s) => s.name === name);
const one = (name: string) => byName(name)[0];

/** How many rings can spread on the pool at once. */
const RIPPLES = 4;
/** Where a wet jar of lemonade once stood, out toward the lake, and left a ring. */
export const JAR_RING = { x: -40, z: -150, r: 34 };

/**
 * The lemonade's lid as pressed: its radius (mm) and how far above or below
 * the lid's top in the world, from the rolled rim (over the jar's edge) in to
 * the button in the middle, by way of a channel and a raised ring. All within
 * half a millimetre of flat, for the fly walking on it.
 */
export const LID_PRESS = (() => {
  const R = (one("lemonade").footprint as { r: number }).r;
  return [[R, -0.6], [R - 0.4, 0], [R - 1.2, 0.25], [R - 2, 0], [R - 2.8, -0.3], [R - 4, -0.3], [R - 4.8, 0], [24, 0], [23, 0.28], [21.5, 0.28], [20.5, 0], [6, 0], [5, 0.18], [0, 0.22]].map(([r, y]) => [r, y - 0.19] as const);
})();
/** The grommet round the straw where it goes through the lid: its tube's radius and how high its middle sits, mm. */
export const GROMMET = { tube: 0.38, lift: 0.08 };

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
  const texture = canvasTexture(canvas);
  return texture;
}

/**
 * The blue gingham napkin, woven thread by thread on the table's material
 * (GINGHAM, surfaces.ts), with a stitched hem, the creases where it was
 * folded in four, and a hairline of shadow round its edge; and round it the
 * enamel, worn by use (ENAMEL).
 */
/**
 * In the rain the napkin darkens as the cloth soaks it up, and the enamel
 * takes a film of water, pooling here and there, that mirrors the sky, and
 * is beaded with drops: each a lens in the shading (its slope bends the
 * light, its rim darkens), as many as there are pixels for, so they cover
 * the table without a vertex between them. In a gust ripples run across the
 * cloth.
 */
type TableUniforms = { uWet: { value: number }; uGust: { value: THREE.Vector3 }; uTime: { value: number } };

function clothShader(material: THREE.MeshStandardMaterial, uniforms: TableUniforms) {
  const { napkin } = DECOR;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uNapkin = { value: new THREE.Vector4(napkin.x, napkin.z, napkin.size / 2, napkin.angle) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vTable;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTable = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
uniform vec4 uNapkin;
uniform float uWet;
uniform vec3 uGust;
uniform float uTime;
varying vec2 vTable;
${NOISE}
${ENAMEL(TABLE_RADIUS, JAR_RING)}
float enamelRough;
vec2 enamelPeel;
${GINGHAM}
${BUMP}
const float CHECK = ${(napkin.size / 12).toFixed(3)};
// Where the water lies thickest on the enamel: soft blobs a few centimetres across, spreading as it gets wetter.
float puddles(vec2 p) {
  float n = sin(p.x * 0.043 + sin(p.y * 0.031) * 2.1) + sin(p.y * 0.052 + sin(p.x * 0.027) * 2.4) + 0.5 * sin((p.x + p.y) * 0.091);
  return smoothstep(1.9 - 2.4 * uWet, 2.15 - 2.4 * uWet, n);
}
// A bead of water in this cell of a grid (cells \`size\` mm across), if the table is wet enough for one: its slope, and how far in from its rim (0 to 1), or -1.
vec3 bead(vec2 p, float size, float salt) {
  vec2 cell = floor(p / size);
  vec2 f = p / size - cell;
  float h1 = fract(sin(dot(cell, vec2(127.1, 311.7)) + salt) * 43758.5453);
  float h2 = fract(sin(dot(cell, vec2(269.5, 183.3)) + salt) * 43758.5453);
  float h3 = fract(sin(dot(cell, vec2(419.2, 371.9)) + salt) * 43758.5453);
  float r = mix(0.16, 0.4, h3 * h3);
  vec2 d = (f - (vec2(h1, h2) * (1.0 - 2.0 * r) + r)) / r;
  float dd = dot(d, d);
  if (dd >= 1.0 || h1 * 0.6 + h3 * 0.4 > uWet * 0.95) return vec3(0.0, 0.0, -1.0);
  // A cap of water: level in the middle, steep at its rim.
  return vec3(d * 0.7 / sqrt(max(0.12, 1.0 - dd * 0.9)), 1.0 - dd);
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
vec3 cloth = gingham(uv, CHECK, vec3(0.13, 0.40, 0.86));
// The hem: folded under (a touch darker) and stitched in blue.
float hem = smoothstep(-2.6, -2.4, edge);
cloth *= 1.0 - hem * 0.06;
float fold = exp(-uv.x * uv.x / 5.0) + exp(-uv.y * uv.y / 5.0);
cloth *= 1.0 - fold * 0.035;
float stitchLine = 1.0 - smoothstep(0.07, 0.07 + fwidth(edge) + 0.03, abs(edge + 1.7));
float along = (abs(uv.x) > abs(uv.y) ? uv.y : uv.x) / 1.7;
float dash = step(0.35, fract(along));
cloth = mix(cloth, vec3(0.03, 0.16, 0.5), stitchLine * dash * 0.85);
// Wet cotton goes darker and greyer, the table showing through it.
cloth = mix(cloth, cloth * vec3(0.64, 0.68, 0.76), uWet * 0.85);
diffuseColor.rgb *= mix(vec3(1.0), cloth, inside);
// A hairline of shadow where the cloth's edge stands off the table.
diffuseColor.rgb *= 1.0 - (1.0 - inside) * (1.0 - smoothstep(0.0, 0.6, edge)) * 0.25;
// The enamel round it, worn by use.
float tablePx = length(fwidth(vTable));
vec4 worn = enamel(vTable, tablePx);
diffuseColor.rgb *= mix(worn.rgb, vec3(1.0), inside);
enamelRough = worn.a * (1.0 - inside);
enamelPeel = peel(vTable, tablePx) * (1.0 - inside);
float puddle = puddles(vTable) * uWet;
diffuseColor.rgb *= 1.0 - (1.0 - inside) * puddle * 0.05;
// Beads, two sizes, faded out where they would be smaller than the pixels.
vec3 drop = vec3(0.0, 0.0, -1.0);
float beading = 0.0;
if (uWet > 0.02 && inside < 0.5) {
  drop = bead(vTable, 2.6, 0.0);
  vec3 small = bead(vTable + 1.3, 1.15, 7.0);
  if (small.z > drop.z) drop = small;
  beading = (1.0 - smoothstep(0.12, 0.45, fwidth(vTable.x) / 1.15)) * step(0.0, drop.z);
  diffuseColor.rgb *= 1.0 - beading * pow(1.0 - drop.z, 3.0) * 0.35;
}`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor + enamelRough, 0.92, inside);\nroughnessFactor = mix(roughnessFactor, mix(mix(0.13, 0.025, puddle), 0.6, inside), uWet);\nroughnessFactor = mix(roughnessFactor, 0.02, beading);")
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
{
  // Where it was folded in four: two soft ridges across the middle.
  vec3 nap2 = napkinUV();
  float inside2 = 1.0 - step(0.0, nap2.z);
  vec2 slope = vec2(-nap2.x * exp(-nap2.x * nap2.x / 3.0), -nap2.y * exp(-nap2.y * nap2.y / 3.0)) * 0.10 * inside2;
  vec3 tilted = normalize(vec3(-slope.x, 1.0, -slope.y));
  float c = cos(uNapkin.w), s = sin(uNapkin.w);
  tilted = vec3(tilted.x * c + tilted.z * s, tilted.y, -tilted.x * s + tilted.z * c);
  tilted = normalize(tilted - vec3(enamelPeel.x, 0.0, enamelPeel.y));
  // A gust sends ripples running across the cloth.
  tilted = normalize(tilted - vec3(uGust.x, 0.0, uGust.y) * cos(dot(vTable, uGust.xy) * 0.35 - uTime * 7.0) * 0.06 * uGust.z * inside2);
  tilted = normalize(mix(tilted, normalize(vec3(-drop.x, 1.0, -drop.y)), beading));
  normal = normalize((viewMatrix * vec4(tilted, 0.0)).xyz);
  normal = bumped(normal, wovenHeight(nap2.xy) * inside2);
}`,
      );
  };
  material.customProgramCacheKey = () => "napkin";
}

/** How many sides the jam jar's cloth cover is drawn with, and how far round its skirt is, mm, at its middle. */
const COVER_AROUND = 48;
const COVER_ROUND = 2 * Math.PI * ((one("jam").footprint as { r: number }).r + 6);

/** The jam jar's cover: red gingham, woven like the napkin, its checks fitting round the skirt a whole number of times. */
function coverShader(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 weave;\nvarying vec2 vWeave;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWeave = weave;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec2 vWeave;\n${GINGHAM}`)
      .replace("#include <map_fragment>", `#include <map_fragment>\ndiffuseColor.rgb *= gingham(vWeave, ${(COVER_ROUND / Math.round(COVER_ROUND / 5.3)).toFixed(4)}, vec3(0.8, 0.04, 0.08));`);
  };
  material.customProgramCacheKey = () => "cover";
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

/** A stalk along a curve, round and tapering from one radius to the other. */
function stalk(curve: THREE.Curve<THREE.Vector3>, segments: number, from: number, to: number) {
  const radial = 8;
  const geometry = new THREE.TubeGeometry(curve, segments, 1, radial);
  const pos = geometry.attributes.position;
  const centre = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    curve.getPointAt(i / segments, centre);
    const r = from + (to - from) * (i / segments);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(centre).multiplyScalar(r).add(centre);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  return geometry;
}

/**
 * The matte things: the leaves among them have their veins drawn in, as the
 * fallen ones' are (visitors.ts); the sugar cubes are pressed from crystals,
 * each catching the light its own way, a few glinting. Anything not a leaf
 * has `aAlong` -1, and sugar has `aAcross` 1 (notLeaf).
 */
function veined(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uVein = { value: new THREE.Color("#c6ef7a") };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aAlong;\nattribute float aAcross;\nvarying vec2 vLeaf;\nvarying vec3 vWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLeaf = vec2(aAlong, aAcross);\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec3 uVein;\nvarying vec2 vLeaf;\nvarying vec3 vWorld;\nfloat grainRough;\nfloat grainHeight;\n${NOISE}\n${BUMP}`)
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
grainRough = 0.0;
grainHeight = 0.0;
if (vLeaf.x >= 0.0) {${LEAF_FRAGMENT}
} else if (vLeaf.y > 0.5) {
  float sharp = resolved(length(fwidth(vWorld)), 0.3);
  // Crystals packed every which way: a turned grid, warped, so no two faces line up.
  vec3 q = mat3(0.8, 0.36, -0.48, -0.6, 0.48, -0.64, 0.0, 0.8, 0.6) * vWorld / 0.3;
  q += vec3(vnoise3(vWorld * 3.0), vnoise3(vWorld * 3.0 + 7.0), vnoise3(vWorld * 3.0 + 13.0)) * 0.8;
  float grain = hash31(floor(q));
  float glint = step(0.93, grain);
  diffuseColor.rgb *= 1.0 + (grain * 0.2 - 0.12 + glint * 0.12) * sharp;
  grainRough = (glint * -0.55 + grain * 0.15 - 0.1) * sharp;
  grainHeight = grain * 0.03 * sharp;
}`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + grainRough, 0.04, 1.0);")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bumped(normal, grainHeight);");
  };
  material.customProgramCacheKey = () => "veined";
  return material;
}

function notLeaf(geometry: THREE.BufferGeometry, sugar = false) {
  const count = geometry.attributes.position.count;
  geometry.setAttribute("aAlong", new THREE.BufferAttribute(new Float32Array(count).fill(-1), 1));
  geometry.setAttribute("aAcross", new THREE.BufferAttribute(new Float32Array(count).fill(sugar ? 1 : 0), 1));
  return geometry;
}

/** A leaf still on its fruit, along z: cupped, its tip drooping, seen from either side. */
function growingLeaf(length: number, dark: string, edge: string) {
  const top = leafGeometry(length, dark, edge).rotateY(Math.PI / 2);
  const pos = top.attributes.position;
  const along = top.attributes.aAlong;
  const across = top.attributes.aAcross;
  for (let i = 0; i < pos.count; i++) {
    const droop = Math.max(0, along.getX(i) - 0.45);
    pos.setY(i, across.getX(i) ** 2 * length * 0.04 - droop * droop * length * 0.15);
  }
  top.computeVertexNormals();
  const upper = top.toNonIndexed();
  top.dispose();
  // The underside: the same faces turned over.
  const under = upper.clone();
  for (const name of Object.keys(under.attributes)) {
    const attr = under.attributes[name];
    for (let t = 0; t < attr.count; t += 3) {
      for (let k = 0; k < attr.itemSize; k++) {
        const a = attr.array[(t + 1) * attr.itemSize + k];
        attr.array[(t + 1) * attr.itemSize + k] = attr.array[(t + 2) * attr.itemSize + k];
        attr.array[(t + 2) * attr.itemSize + k] = a;
      }
    }
  }
  const normals = under.attributes.normal;
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
  const leaf = mergeGeometries([upper, under]);
  upper.dispose();
  under.dispose();
  return leaf;
}

export function buildTable(): SceneSet {
  const group = new THREE.Group();
  const rnd = random(11);
  const glossy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0, envMapIntensity: 0.6 });
  const juicy = fruitSkins(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0, envMapIntensity: 0.55 }));
  const matte = veined(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, envMapIntensity: 0.5 }));
  const tableMaterial = new THREE.MeshStandardMaterial({ map: tableTexture(), roughness: 0.24, metalness: 0, envMapIntensity: 0.5 });
  const tableUniforms: TableUniforms = { uWet: { value: 0 }, uGust: { value: new THREE.Vector3() }, uTime: { value: 0 } };
  clothShader(tableMaterial, tableUniforms);
  const cloth = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
  coverShader(cloth);
  const glass = new THREE.MeshStandardMaterial({ color: "#e6f6ff", roughness: 0.04, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false, envMapIntensity: 1.4 });
  // Glass: clear where you look straight through it, thickening to a bright edge where you look along it.
  glass.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      /* glsl */ `float along = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
diffuseColor.a = clamp(diffuseColor.a + pow(along, 3.0) * 0.6, 0.0, 1.0);
outgoingLight += vec3(0.05, 0.06, 0.07) * pow(along, 2.0);
#include <opaque_fragment>`,
    );
  };
  glass.customProgramCacheKey = () => "glass";
  const liquid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, transparent: true, opacity: 0.72, depthWrite: false });
  const batch = new Batch();
  const dry = (geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4) => batch.add(matte, notLeaf(geometry), matrix);
  const fruit = (kind: number, geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4) => batch.add(juicy, skin(geometry, kind), matrix);
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
  // The lid: knurled round its side, and pressed on top (LID_PRESS).
  {
    const R = LID_PRESS[0][0];
    const knurls = 96;
    const side = new THREE.CylinderGeometry(R, R, 8.4, knurls, 1, true).translate(lf.x, lidTop - 4.8, lf.z);
    batch.add(glossy, paint(side, (p) => (Math.round(((Math.atan2(p.z - lf.z, p.x - lf.x) / (Math.PI * 2)) * knurls) % 2) === 0 ? "#4fb6f2" : "#a6e3ff")));
    const tone = (r: number) => (r > R - 2.1 ? "#9fe0ff" : r > R - 4.4 ? "#3ea6e6" : r < 24.2 && r > 20.3 ? "#a8e6ff" : r < 5.5 ? "#92dbff" : "#7fd4ff");
    batch.add(glossy, paint(new THREE.LatheGeometry(LID_PRESS.map(([r, y]) => new THREE.Vector2(r, lidTop + y)), 64).translate(lf.x, 0, lf.z), (p) => tone(Math.hypot(p.x - lf.x, p.z - lf.z))));
  }
  // A lemon slice standing in the drink, against the glass.
  fruit(SKIN.plain, paint(new THREE.CylinderGeometry(20, 20, 3, 32).rotateX(Math.PI / 2).rotateY(0.6).translate(lf.x + 12, 44, lf.z + 22), (p) => {
    const d = Math.hypot(p.x - (lf.x + 12), p.y - 44);
    return d > 18 ? "#f5d000" : d > 16.5 ? "#fffbe0" : Math.sin(Math.atan2(p.y - 44, p.x - lf.x - 12) * 5) > 0.85 ? "#fffbe0" : "#ffe66b";
  }));
  const straw = one("straw");
  const sf = straw.footprint as { x: number; z: number; r: number };
  const strawTop = (straw.top as { y: number }).y;
  batch.add(glossy, paint(new THREE.CylinderGeometry(sf.r, sf.r, strawTop - 50, 12, 24).translate(sf.x, (strawTop + 50) / 2, sf.z), (p) => (Math.floor((p.y - 50) / 7) % 2 === 0 ? "#ff5f9e" : "#ffffff")));
  // The grommet the straw goes through the lid by.
  batch.add(glossy, paint(new THREE.TorusGeometry(sf.r + 0.5, GROMMET.tube, 6, 20).rotateX(Math.PI / 2).translate(sf.x, lidTop + GROMMET.lift, sf.z), "#eef3f6"));

  // The saucer under the jar, its glaze following its shape in the world exactly, and the lemonade pooled in its moat.
  const saucer = one("saucer");
  const pool = PATCHES.find((p) => p.name === "lemonade")!;
  const ripples = new Float32Array(RIPPLES * 4).fill(-100);
  const poolUniforms = { uTime: { value: 0 }, uRipples: { value: ripples } };
  {
    const f = saucer.footprint as { x: number; z: number; r: number };
    const top = saucer.top as { inner: number; lip: number };
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 32; i++) {
      const r = lf.r - 2 + ((f.r - lf.r + 2) * i) / 32;
      profile.push(new THREE.Vector2(r, topHeight(saucer, f.x + Math.min(r, f.r * 0.9999), f.z)));
    }
    // Outside in, so its faces point up.
    profile.reverse();
    fruit(SKIN.plain, paint(new THREE.LatheGeometry(profile, 56).translate(f.x, 0, f.z), (p) => {
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
  fruit(SKIN.jam, paint(new THREE.CylinderGeometry(jf.r - 1.2, jf.r - 1.2, jamTop - 16, 40).translate(jf.x, (jamTop - 16) / 2 + 1, jf.z), "#d4123e"));
  // Its cloth, laid out flat in millimetres for the weave: across the top, and round and down the skirt.
  const skirt = new THREE.CylinderGeometry(jf.r, jf.r, 13, COVER_AROUND, 3, true);
  {
    const pos = skirt.attributes.position;
    const weave = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      weave[i * 2] = ((i % (COVER_AROUND + 1)) / COVER_AROUND) * COVER_ROUND;
      weave[i * 2 + 1] = -y;
      if (y < -6) {
        const a = Math.atan2(pos.getZ(i), pos.getX(i));
        pos.setY(i, y + Math.sin(a * 9) * 2.2);
      }
    }
    skirt.setAttribute("weave", new THREE.BufferAttribute(weave, 2));
  }
  const lid = new THREE.CircleGeometry(jf.r, COVER_AROUND).rotateX(-Math.PI / 2);
  {
    const pos = lid.attributes.position;
    const weave = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) weave.set([pos.getX(i), pos.getZ(i)], i * 2);
    lid.setAttribute("weave", new THREE.BufferAttribute(weave, 2));
  }
  const cover = new THREE.Mesh(mergeGeometries([skirt.translate(jf.x, jamTop - 7.5, jf.z), lid.translate(jf.x, jamTop, jf.z)]), cloth);
  skirt.dispose();
  lid.dispose();
  freeze(cover);
  group.add(cover);
  seen.push(cover);
  batch.add(glossy, paint(new THREE.TorusGeometry(jf.r - 1.6, 1.6, 6, 48).rotateX(Math.PI / 2).translate(jf.x, jamTop - 6, jf.z), "#ff7eb6"));

  // Strawberries: a whole one with seeds and leaves, and a half one, cut face up.
  const berry = one("strawberry");
  fruit(SKIN.plain, paint(domeGeometry(berry, 14, 40), (p) => {
    const k = Math.min(1, p.y / 20);
    return new THREE.Color("#c3001f").lerp(new THREE.Color("#ff3048"), k);
  }));
  const half = one("strawberry half");
  fruit(SKIN.plain, paint(domeGeometry(half, 10, 40), (p) => {
    const hf = half.footprint as { x: number; z: number; rx: number; rz: number; angle: number };
    const s = Math.min(1, Math.hypot((p.x - hf.x) / hf.rx, (p.z - hf.z) / hf.rz));
    return s > 0.86 ? "#e0102c" : s > 0.7 ? "#ff6b7c" : s > 0.25 ? "#ffb3bd" : "#fff0f0";
  }));
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
      // A leaf bridging the falling berry surface leaves a fly under the sepal.
      leaf.applyMatrix4(m);
      const pos = leaf.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        const x = pos.getX(j), z = pos.getZ(j);
        const dx = x - bf.x, dz = z - bf.z;
        const u = dx * Math.cos(bf.angle) - dz * Math.sin(bf.angle);
        const v = dx * Math.sin(bf.angle) + dz * Math.cos(bf.angle);
        const inset = Math.max(1, Math.hypot(u / bf.rx, v / bf.rz) / 0.98);
        const px = bf.x + dx / inset, pz = bf.z + dz / inset;
        pos.setXYZ(j, px, topHeight(berry, px, pz) - 0.45, pz);
      }
      leaf.computeVertexNormals();
      dry(paint(leaf, "#2fa83a"));
    }
    dry(paint(new THREE.CylinderGeometry(0.9, 1.2, 7, 6).rotateZ(0.5).translate(ex + 1, ey - 3.5, ez), "#3c9a2e"));
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
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x, n.y, n.z)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 2.4));
      seeds.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.1, z), q, new THREE.Vector3(1, 1, 1)));
    }
  }
  // Each seed sits in a dark pit of its own.
  const seed = mergeGeometries([
    paint(new THREE.CircleGeometry(0.85, 12).rotateX(-Math.PI / 2).translate(0, -0.08, 0), (p) => new THREE.Color("#5e0012").lerp(new THREE.Color("#a8001e"), Math.hypot(p.x, p.z) / 0.85)),
    paint(new THREE.SphereGeometry(1, 8, 5).scale(0.4, 0.24, 0.6), (p) => (p.z > 0.2 ? "#ffe680" : p.z < -0.3 ? "#d8b44a" : "#f4d462")),
  ]);
  const seedMesh = new THREE.InstancedMesh(seed, glossy, seeds.length);
  seeds.forEach((m, i) => seedMesh.setMatrixAt(i, m));
  seedMesh.computeBoundingSphere();
  freeze(seedMesh);
  group.add(seedMesh);

  // Cherries on their stems.
  const cherries = byName("cherry");
  const cherryDark = new THREE.Color("#4a000e");
  const cherryRed = new THREE.Color("#a3001f");
  const cherryLit = new THREE.Color("#ff2d50");
  const cherryColor = new THREE.Color();
  for (const cherry of cherries) {
    const f = cherry.footprint as { x: number; z: number; r: number };
    fruit(SKIN.cherry, paint(new THREE.SphereGeometry(f.r, 28, 18).translate(f.x, f.r, f.z), (_p, n) => (n.y < 0 ? cherryColor.copy(cherryDark).lerp(cherryRed, 1 + n.y) : cherryColor.copy(cherryRed).lerp(cherryLit, n.y ** 3))));
  }
  {
    const [a, b] = cherries.map((c) => c.footprint as { x: number; z: number; r: number });
    const join = new THREE.Vector3((a.x + b.x) / 2 + 8, 42, (a.z + b.z) / 2 - 10);
    for (const c of [a, b]) {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(c.x, c.r * 2 - 1, c.z), new THREE.Vector3(c.x + 2, c.r * 2 + 18, c.z - 4), join);
      dry(paint(stalk(curve, 10, 0.9, 0.7), (p) => (p.y > 38 ? "#4f7524" : "#5d8a2b")));
    }
    batch.add(matte, growingLeaf(30, "#4aa832", "#6cc444"), mat4(join.clone().add(new THREE.Vector3(4, 1, -10)), new THREE.Euler(0.4, 0.5, 0.3)));
  }

  // A slice of orange: its segments, pith and peel are drawn in its skin (surfaces.ts).
  {
    const orange = one("orange slice");
    const f = orange.footprint as { x: number; z: number; r: number };
    const h = (orange.top as { y: number }).y;
    fruit(SKIN.orange, paint(new THREE.CylinderGeometry(f.r, f.r, h, 64, 1, false).translate(f.x, h / 2, f.z), "#ff9a1a"));
  }

  // A green apple.
  {
    const apple = one("apple");
    const f = apple.footprint as { x: number; z: number; r: number };
    const base = (apple.top as { base: number }).base;
    const green = new THREE.Color("#79d33f");
    const yellow = new THREE.Color("#ffd23a");
    const red = new THREE.Color("#ff6b3a");
    const skinColor = new THREE.Color();
    fruit(SKIN.apple, paint(new THREE.SphereGeometry(f.r, 40, 26).translate(f.x, base, f.z), (p) => {
      const up = Math.max(0, (p.y - base) / f.r);
      const blush = Math.max(0, Math.sin((p.x - f.x) * 0.05 + 1) * Math.cos((p.z - f.z) * 0.04)) * up;
      return skinColor.copy(green).lerp(yellow, up * 0.25).lerp(red, blush * 0.5);
    }));
    // The stalk, thinning to a cut end paler than the rest.
    const stem = new THREE.QuadraticBezierCurve3(new THREE.Vector3(f.x, base + f.r - 2, f.z), new THREE.Vector3(f.x + 1, base + f.r + 6, f.z), new THREE.Vector3(f.x + 4, base + f.r + 10, f.z + 1));
    const tip = stem.getPoint(1);
    dry(paint(stalk(stem, 8, 1.3, 0.85), (p) => (p.distanceTo(tip) < 0.3 ? "#b98e5a" : p.y < base + f.r + 1 ? "#5c4a1c" : "#6e4421")));
    dry(paint(new THREE.CircleGeometry(0.85, 8), "#c9a46c"), new THREE.Matrix4().lookAt(tip.clone().add(stem.getTangent(1)), tip, new THREE.Vector3(0, 1, 0)).setPosition(tip));
    batch.add(matte, growingLeaf(32, "#4fae32", "#74cc46"), mat4({ x: f.x + 9, y: base + f.r + 8, z: f.z + 5 }, new THREE.Euler(0.5, 0.9, -0.4)));
  }

  // Sugar cubes, and grains of sugar spilt beside them.
  for (const cube of byName("sugar")) {
    const f = cube.footprint as { x: number; z: number; hx: number; hz: number; angle: number };
    const y = (cube.top as { y: number }).y;
    const geometry = new RoundedBoxGeometry(f.hx * 2, 16, f.hz * 2, 2, 1.2);
    batch.add(matte, notLeaf(paint(geometry, (p) => (Math.sin(p.x * 3.1) * Math.cos(p.z * 2.7 + p.y) > 0.92 ? "#e8f6ff" : "#fcfeff")), true), mat4({ x: f.x, y: y - 8, z: f.z }, new THREE.Euler(0, f.angle, 0)));
  }
  const grains: THREE.Matrix4[] = [];
  for (const p of PATCHES.filter((p) => p.name === "spilt sugar")) {
    for (let i = 0; i < 70; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const r = Math.sqrt(rnd.next()) * p.r * 1.3;
      grains.push(mat4({ x: p.x + Math.cos(a) * r, y: 0.175, z: p.z + Math.sin(a) * r }, new THREE.Euler(rnd.range(0, 3), rnd.range(0, 3), rnd.range(0, 3)), { x: 1, y: 1, z: 1 }));
    }
  }
  const grainMesh = new THREE.InstancedMesh(paint(new THREE.BoxGeometry(0.35, 0.35, 0.35), "#ffffff"), glossy, grains.length);
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
    dry(paint(domeGeometry(crumb, 6, 18), crumbColor));
    shadows.push({ x: f.x, z: f.z, rx: f.rx * 1.25, rz: f.rz * 1.25, angle: f.angle, strength: 0.5 });
  }
  for (const pip of byName("pip")) {
    const f = pip.footprint as { x: number; z: number; rx: number; rz: number; angle: number };
    fruit(SKIN.plain, paint(domeGeometry(pip, 5, 16), (p) => (p.y > 0.7 ? "#fff8dc" : "#f1e2a8")));
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
      dry(paint(speck, crumbColor), mat4({ x, y: 0, z }, new THREE.Euler(0, rnd.range(0, 6.3), 0), { x: size, y: size, z: size * rnd.range(0.7, 1.3) }));
      if (size > 0.3) shadows.push({ x, z, rx: size * 1.6, rz: size * 1.6, angle: 0, strength: 0.3 });
    }
  }

  // A drip of honey and a smear of jam: flat, glossy puddles.
  // Smooth-edged even at the fly's scale, deep in the middle and lighter at the rim where it thins.
  const puddle = (x: number, z: number, r: number, color: string, wobble: number, rim: string) => {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const rr = r * (1 + Math.sin(a * 3 + wobble) * 0.12 + Math.sin(a * 5 + wobble * 2) * 0.06);
      if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.7, bevelSegments: 4, curveSegments: 1 });
    const deep = new THREE.Color(color);
    const thin = new THREE.Color(rim);
    fruit(SKIN.plain, paint(geometry.rotateX(-Math.PI / 2).translate(x, 0.05, z), (p) => thin.clone().lerp(deep, Math.min(1, Math.max(0, (p.y - 0.1) / 0.45)))));
  };
  const honey = PATCHES.find((p) => p.name === "honey")!;
  const jamPatch = PATCHES.find((p) => p.name === "jam")!;
  puddle(honey.x, honey.z, honey.r, "#f29200", 1, "#ffd25e");
  puddle(jamPatch.x, jamPatch.z, jamPatch.r, "#a3002a", 3, "#ff4a6a");

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
  // A fallen leaf (thin enough to walk over), visitors, rain: life.ts.
  const goings = new Goings(ripple);
  group.add(goings.group);
  seen.push(...goings.seen);
  const all = [glossy, juicy, matte, tableMaterial, cloth, glass, liquid, dewMaterial, ...materials];
  for (const material of all) shaded(material);
  let wetNow = -1;
  return {
    group,
    materials: all,
    seen,
    update(time, light, weather) {
      goings.update(time, light, weather);
      // Wet, glazes and fruit shine more, crumbs and cloth darken.
      const wet = weather.wet;
      if (Math.abs(wet - wetNow) > 0.003) {
        wetNow = wet;
        glossy.roughness = 0.22 - 0.12 * wet;
        juicy.roughness = 0.16 - 0.08 * wet;
        matte.roughness = 0.7 - 0.32 * wet;
        matte.color.setScalar(1 - 0.22 * wet);
        cloth.roughness = 0.85 - 0.25 * wet;
        cloth.color.setScalar(1 - 0.3 * wet);
        tableUniforms.uWet.value = wet;
      }
      const g = outside.gust;
      const speed = Math.hypot(g.x, g.z) || 1;
      tableUniforms.uGust.value.set(g.x / speed, g.z / speed, g.strength);
      tableUniforms.uTime.value = time;
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
    happen(kind, random) {
      if ((HAPPENINGS as readonly string[]).includes(kind)) goings.happen(kind as Happening, random);
    },
    live(dt, around) {
      goings.live(dt, around);
    },
  };
}
