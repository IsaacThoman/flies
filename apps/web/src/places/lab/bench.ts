// The lab bench and everything on it, built from the world's description
// (packages/world/src/lab.ts) so that what the fly stands on is exactly what
// is drawn. Nearly everything opaque is one material (materials.ts), merged
// into a draw for the big shapes the fly's eyes see and one for the fine
// detail they don't; the glass, the paper, the drop on the page and the soft
// shadows are a draw each, and the desk lamp is a real light.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { AGAR_DISH, BEAKER, BENCH, BOTTLE, BRUSH, DROP, FLY_PAD, FORCEPS, LAB_DECOR, LAB_PATCHES, LAB_SOLIDS, LAMP, MICROSCOPE, NOTEBOOK, OPEN_VIAL, RACK, TIMER, VIAL_RADIUS, along, topHeight, topNormal } from "@fly/world";
import type { Solid } from "@fly/world";
import { Batch, canvas2d, canvasTexture, freeze, paint, random } from "../../scene/build.ts";
import type { ColorFn } from "../../scene/build.ts";
import type { SceneSet } from "../types.ts";
import { SUNBEAM, benchMaterial, clearMaterial, finish, glints, sunbeam, surfaceMaterial } from "./materials.ts";
import type { Finish } from "./materials.ts";
import { DISPLAY, INK, PAGES, labelRegion, pagesRegion, paperMaterial, paperTexture, tapeRegion } from "./paper.ts";
import type { Region } from "./paper.ts";

/** The floor of the room, mm below the bench top. */
export const FLOOR_Y = -900;

/** The desk lamp's shade: the middle of its mouth, and the point on the bench it is turned to. */
export const SHADE = { x: 108, y: 248, z: -14, aim: { x: 6, y: 0, z: 40 } };
/** The lamp's light at full, candela: about the midday sun's brightness on the bench under it. */
const LAMP_CANDELA = 125_000;

const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color("#ffffff");
const byName = (name: string) => LAB_SOLIDS.filter((s) => s.name === name);
const one = (name: string) => byName(name)[0];

/** A footprint's own frame: its middle on the bench, turned as it is. */
const frame = (x: number, z: number, angle = 0, y = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, angle), new THREE.Vector3(1, 1, 1));

/** Painted, with its finish, ready for a batch of the surface material. */
const piece = (geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation | ColorFn, f: Finish) => finish(paint(geometry, color), f);

/** A knurled wheel: a cylinder with fine ridges round it (alternate edges sunk), its axis along y. */
function knurl(r: number, length: number, ridges: number, depth = 0.45) {
  const geometry = new THREE.CylinderGeometry(r, r, length, ridges * 2, 1);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const d = Math.hypot(x, z);
    if (d < r * 0.5) continue;
    const step = Math.round((Math.atan2(z, x) / (Math.PI * 2)) * ridges * 2 + ridges * 4);
    const k = step % 2 === 0 ? 1 : (r - depth) / r;
    pos.setXYZ(i, x * k, pos.getY(i), z * k);
  }
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  faceted.deleteAttribute("normal");
  faceted.computeVertexNormals();
  return faceted;
}

/** The top of a domed (or dished) solid as a mesh: a polar grid over its footprint, at exactly its height. */
function solidTop(solid: Solid, rings: number, segments: number, lift = 0) {
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
    positions.push(x, topHeight(solid, x, z) + lift, z);
    topNormal(solid, x, z, n);
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

/** A round thing lying on the bench (an ellipse footprint, its top half a dome of power ½ over its radius): drawn whole, so the half under the world's top is its mirror. */
function lyingSpindle(solid: Solid, segments: number, rings: number) {
  const f = solid.footprint as { x: number; z: number; rx: number; rz: number; angle: number };
  const r = (solid.top as { base: number }).base;
  return new THREE.SphereGeometry(1, segments, rings).scale(f.rx, r, f.rz).rotateY(f.angle).translate(f.x, r, f.z);
}

/** Paper for the paper material: tinted, with its uv moved into a region of the atlas. */
function paperPiece(geometry: THREE.BufferGeometry, tint: THREE.ColorRepresentation, r: Region) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
  const color = new THREE.Color(tint);
  const colors = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) colors.set([color.r, color.g, color.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/** A soft ellipse on the bench under something small: a shadow, or with `light` light gathered by a drop. */
type Spot = { x: number; z: number; rx: number; rz: number; angle: number; strength: number; y?: number; light?: boolean };

/** Soft shadows under the small things, and the light a drop focuses: one merged mesh of blurred ellipses. */
function contactShadows(spots: readonly Spot[]) {
  const { canvas, g } = canvas2d(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const pieces = spots.map((spot) => {
    const quad = new THREE.PlaneGeometry(spot.rx * 2, spot.rz * 2).rotateX(-Math.PI / 2).rotateY(spot.angle).translate(spot.x, (spot.y ?? 0) + 0.02, spot.z);
    const tone = new Float32Array(quad.attributes.position.count * 4);
    const [r, gg, b] = spot.light ? [1, 0.98, 0.9] : [0.16, 0.17, 0.2];
    for (let i = 0; i < tone.length; i += 4) tone.set([r, gg, b, spot.strength], i);
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

/** The bench's painted map, seen from above with the back at the top: soft shadows under what stands on it, and the marks of years of use. */
function benchTexture() {
  const S = 1024;
  const H = Math.round((S * BENCH.hz) / BENCH.hx);
  const { canvas, g } = canvas2d(S, H);
  const k = S / (BENCH.hx * 2);
  const px = (x: number) => (x + BENCH.hx) * k;
  const pz = (z: number) => (z + BENCH.hz) * k;
  g.fillStyle = "#d9dad6";
  g.fillRect(0, 0, S, H);
  // Worn a little warmer and darker where hands and things rest most, toward the front middle.
  const worn = g.createRadialGradient(px(-20), pz(90), 0, px(-20), pz(90), 260 * k);
  worn.addColorStop(0, "rgba(150, 140, 120, 0.07)");
  worn.addColorStop(1, "rgba(150, 140, 120, 0)");
  g.fillStyle = worn;
  g.fillRect(0, 0, S, H);
  // Shadows: each shape drawn far off the canvas, its blurred shadow cast back onto it.
  const OFF = 4000;
  const shadow = (blur: number, alpha: number, draw: () => void) => {
    g.save();
    g.shadowColor = `rgba(40, 44, 52, ${alpha})`;
    g.shadowBlur = blur * k;
    g.shadowOffsetX = OFF;
    g.fillStyle = "#000";
    g.translate(-OFF, 0);
    draw();
    g.restore();
  };
  const box = (x: number, z: number, hx: number, hz: number, angle: number, grow: number) => () => {
    g.translate(px(x), pz(z));
    g.rotate(-angle);
    g.fillRect(-(hx + grow) * k, -(hz + grow) * k, (hx + grow) * 2 * k, (hz + grow) * 2 * k);
  };
  const disc = (x: number, z: number, r: number) => () => {
    g.beginPath();
    g.arc(px(x), pz(z), r * k, 0, Math.PI * 2);
    g.fill();
  };
  for (const solid of LAB_SOLIDS) {
    const f = solid.footprint;
    const tall = solid.name === "microscope base" || solid.name === "rack" || solid.name === "tip box" || solid.name === "timer";
    if (f.kind === "box" && tall) {
      shadow(14, 0.5, box(f.x, f.z, f.hx, f.hz, f.angle, 1));
      shadow(3, 0.45, box(f.x, f.z, f.hx, f.hz, f.angle, 0));
    } else if (f.kind === "circle" && ["open vial", "beaker", "bottle", "lamp base", "agar dish"].includes(solid.name)) {
      shadow(f.r * 0.35, 0.42, disc(f.x, f.z, f.r * 1.04));
      shadow(2.5, 0.35, disc(f.x, f.z, f.r));
    } else if (solid.name === "wipe" && f.kind === "ellipse") {
      shadow(10, 0.35, () => {
        g.beginPath();
        g.ellipse(px(f.x), pz(f.z), f.rx * k, f.rz * k, -f.angle, 0, Math.PI * 2);
        g.fill();
      });
    } else if (solid.name === "notebook" && f.kind === "box") shadow(4, 0.3, box(f.x, f.z, f.hx, f.hz, f.angle, 0.5));
  }
  // A faint brown ring where a wet beaker once stood, and an old marker smudge.
  g.strokeStyle = "rgba(150, 120, 80, 0.16)";
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(px(-300), pz(-180), 33 * k, 0.3, Math.PI * 1.85);
  g.stroke();
  g.strokeStyle = "rgba(60, 70, 140, 0.07)";
  g.lineWidth = 7;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(px(330), pz(230));
  g.quadraticCurveTo(px(360), pz(215), px(395), pz(232));
  g.stroke();
  return canvasTexture(canvas);
}

/**
 * The drop of water on the notebook: clear, so the page shows through it
 * magnified (the writing under it swells as under a lens), with the bright
 * rim and dark ring a drop's edge has and the room reflected on top.
 */
function dropMaterial(page: THREE.Texture) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.03, metalness: 0, envMapIntensity: 1.8 });
  const p = pagesRegion;
  const c = Math.cos(NOTEBOOK.angle);
  const s = Math.sin(NOTEBOOK.angle);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPage = { value: page };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform sampler2D uPage;\nvarying vec3 vWorld;\n${INK}`)
      .replace(
        "#include <map_fragment>",
        /* glsl */ `{
  // Where on the page this point of the drop looks: toward its middle, as through a lens.
  vec2 d = vWorld.xz - vec2(${DROP.x.toFixed(2)}, ${DROP.z.toFixed(2)});
  float r = length(d) / ${DROP.r.toFixed(2)};
  vec2 seen = vec2(${DROP.x.toFixed(2)}, ${DROP.z.toFixed(2)}) + d * mix(0.48, 1.0, r * r);
  vec2 rel = seen - vec2(${NOTEBOOK.x.toFixed(2)}, ${NOTEBOOK.z.toFixed(2)});
  vec2 local = vec2(rel.x * ${c.toFixed(5)} - rel.y * ${s.toFixed(5)}, rel.x * ${s.toFixed(5)} + rel.y * ${c.toFixed(5)});
  vec2 mm = local + vec2(${(PAGES.width / 2).toFixed(1)}, ${(PAGES.height / 2).toFixed(1)});
  vec2 uv = vec2(${p.u0.toFixed(5)} + mm.x / ${PAGES.width.toFixed(1)} * ${(p.u1 - p.u0).toFixed(5)}, ${p.v1.toFixed(5)} - mm.y / ${PAGES.height.toFixed(1)} * ${(p.v1 - p.v0).toFixed(5)});
  float rule = 1.0 - smoothstep(0.08, 0.2, abs(fract((mm.y - 22.0) / 8.0 + 0.5) - 0.5) * 8.0);
  vec3 page = mix(vec3(0.97, 0.96, 0.92), vec3(0.62, 0.76, 0.93), rule * 0.85);
  vec3 c = labInk(page, texture2D(uPage, uv).rgb);
  // The rim bends the light away: a dark ring just inside the edge, then a bright edge.
  c *= 1.0 - smoothstep(0.62, 0.9, r) * 0.55;
  c += smoothstep(0.9, 1.0, r) * 0.25;
  diffuseColor.rgb = c;
}`,
      );
  };
  material.customProgramCacheKey = () => "lab-drop";
  return material;
}

export function buildBench(): SceneSet {
  const group = new THREE.Group();
  const rnd = random(23);
  const shine = glints();
  shine.uLampDir.value.set(SHADE.x, SHADE.y, SHADE.z).normalize();
  const beam = sunbeam();
  const surface = surfaceMaterial(shine, beam);
  const clear = clearMaterial(shine);
  const atlas = paperTexture();
  const paper = paperMaterial(atlas, beam);
  const bench = benchMaterial(benchTexture(), beam, shine);
  /** The big shapes, which the fly's eyes see; the fine detail, which they don't; glass and paper. */
  const big = new Batch();
  const fine = new Batch();
  const glass = new Batch();
  const sheets = new Batch();
  const shadows: Spot[] = [];
  const seen: THREE.Object3D[] = [];

  const ENAMEL: Finish = { rough: 0.23 };
  const SATIN: Finish = { rough: 0.55 };
  const MATTE: Finish = { rough: 0.85 };
  const RUBBER: Finish = { rough: 0.7 };
  const STEEL: Finish = { rough: 0.24, metal: 0.85 };
  const CHROME: Finish = { rough: 0.12, metal: 1 };
  const FOAM: Finish = { rough: 0.95, texture: 1 };
  const FOOD: Finish = { rough: 0.62, texture: -1 };

  // The bench: a slab of pale epoxy on a grey steel frame, with a bank of drawers and a shelf below.
  {
    const top = new THREE.Mesh(new THREE.PlaneGeometry(BENCH.hx * 2, BENCH.hz * 2).rotateX(-Math.PI / 2), bench);
    freeze(top);
    group.add(top);
    seen.push(top);
    big.add(surface, piece(new RoundedBoxGeometry(BENCH.hx * 2, 26, BENCH.hz * 2, 2, 1.4).translate(0, -13.05, 0), (p) => (p.y > -1.5 ? "#e2e2de" : "#d6d7d3"), { rough: 0.42 }));
    const grey = "#a7acb1";
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) fine.add(surface, piece(new THREE.BoxGeometry(36, -FLOOR_Y - 26, 36).translate(sx * (BENCH.hx - 40), (FLOOR_Y - 26) / 2, sz * (BENCH.hz - 36)), grey, SATIN));
      // Feet with levellers.
      for (const sz of [-1, 1]) fine.add(surface, piece(new THREE.CylinderGeometry(16, 18, 10, 16).translate(sx * (BENCH.hx - 40), FLOOR_Y + 5, sz * (BENCH.hz - 36)), "#2c2e31", RUBBER));
    }
    // Rails under the top, and the shelf.
    for (const sz of [-1, 1]) fine.add(surface, piece(new THREE.BoxGeometry(BENCH.hx * 2 - 80, 50, 24).translate(0, -52, sz * (BENCH.hz - 36)), grey, SATIN));
    fine.add(surface, piece(new THREE.BoxGeometry(BENCH.hx * 2 - 90, 18, BENCH.hz * 2 - 90).translate(0, FLOOR_Y + 140, 0), grey, SATIN));
    // A bank of drawers under the right half, light grey fronts with steel pulls.
    const dx = 190;
    fine.add(surface, piece(new THREE.BoxGeometry(400, 600, BENCH.hz * 2 - 110).translate(dx, -28 - 300, -10), "#c9ccce", SATIN));
    for (let i = 0; i < 3; i++) {
      const y = -28 - 100 - i * 200;
      fine.add(surface, piece(new RoundedBoxGeometry(390, 188, 14, 2, 3).translate(dx, y, BENCH.hz - 62), "#dfe1e2", SATIN));
      fine.add(surface, piece(new RoundedBoxGeometry(150, 12, 14, 2, 4).translate(dx, y + 60, BENCH.hz - 48), "#b5b9bd", STEEL));
    }
    // On the shelf: a carton of vials and a box of gloves.
    fine.add(surface, piece(new THREE.BoxGeometry(300, 150, 220).translate(-190, FLOOR_Y + 225, -20), "#c7a77a", MATTE));
    fine.add(surface, piece(new THREE.BoxGeometry(250, 90, 125).translate(130, FLOOR_Y + 194, 40), "#e9edf2", MATTE));
    fine.add(surface, piece(new THREE.BoxGeometry(140, 92, 4).translate(130, FLOOR_Y + 194, 103), "#5a8fd0", MATTE));
  }

  // The stereo microscope: built in its base's own frame.
  {
    const m = frame(MICROSCOPE.x, MICROSCOPE.z, MICROSCOPE.angle);
    const cream = "#ebe9e2";
    const dark = "#34373c";
    const add = (b: Batch, g: THREE.BufferGeometry, color: THREE.ColorRepresentation | ColorFn, f: Finish) => b.add(surface, piece(g, color, f), m);
    const H = MICROSCOPE.height;
    add(big, new RoundedBoxGeometry(MICROSCOPE.hx * 2, H, MICROSCOPE.hz * 2, 3, 2.5).translate(0, H / 2, 0), (p) => (p.y < 3 ? "#d9d7cf" : cream), ENAMEL);
    // A dark band round the base's foot, and the black stage plate let into its top with a chrome ring.
    add(fine, new THREE.BoxGeometry(MICROSCOPE.hx * 2 + 0.6, 4, MICROSCOPE.hz * 2 + 0.6).translate(0, 4, 0), dark, SATIN);
    // The seam where the casting meets its cover; the switch and its green light on the front; vents in its end, behind the dimmer.
    add(fine, new THREE.BoxGeometry(MICROSCOPE.hx * 2 + 0.3, 0.6, MICROSCOPE.hz * 2 + 0.3).translate(0, H - 8, 0), "#b9b5aa", ENAMEL);
    add(fine, new RoundedBoxGeometry(14, 8, 2.4, 2, 0.8).translate(-70, 15, MICROSCOPE.hz + 0.6), "#26282c", SATIN);
    add(fine, new THREE.BoxGeometry(12, 3.4, 0.6).rotateX(0.25).translate(-70, 16.2, MICROSCOPE.hz + 1.8), "#3a3d42", SATIN);
    add(fine, new THREE.CylinderGeometry(1.4, 1.4, 0.8, 12).rotateX(Math.PI / 2).translate(-52, 15, MICROSCOPE.hz + 0.3), "#5ee08a", { rough: 0.3, glow: 2 });
    for (let i = 0; i < 6; i++) add(fine, new THREE.BoxGeometry(0.6, 1.8, 22).translate(MICROSCOPE.hx + 0.1, 11 + (i % 2) * 6, -72 + Math.floor(i / 2) * 26), "#2a2b2e", SATIN);
    add(big, new THREE.CylinderGeometry(52, 52, 0.3, 64).translate(0, H + 0.15, 14), "#141518", { rough: 0.18 });
    add(fine, new THREE.TorusGeometry(52.4, 0.7, 6, 64).rotateX(Math.PI / 2).translate(0, H, 14), "#d8dadd", CHROME);
    // Two spring clips on the stage, flat enough not to matter underfoot.
    for (const s of [-1, 1]) {
      add(fine, new THREE.BoxGeometry(4, 0.4, 36).rotateY(s * 0.25).translate(s * 36, H + 0.2, 34), "#c9ccd0", CHROME);
      add(fine, new THREE.CylinderGeometry(2.6, 2.6, 0.45, 12).translate(s * 40, H + 0.22, 18), "#c9ccd0", CHROME);
    }
    // The dimmer: a knurled black wheel out of the base's right side.
    add(big, knurl(13, 9, 30).rotateZ(Math.PI / 2).translate(MICROSCOPE.hx + 4.5, 13, 40), "#1b1c1f", RUBBER);
    add(fine, new THREE.CylinderGeometry(9, 9, 0.6, 24).rotateZ(Math.PI / 2).translate(MICROSCOPE.hx + 9.2, 13, 40), "#c9ccd0", CHROME);
    // The pillar, its cap, and the focus drive clamped to it.
    add(big, new THREE.CylinderGeometry(17, 17, 312, 36).translate(0, H + 156, -66), "#c3c7cc", STEEL);
    add(big, new RoundedBoxGeometry(36, 10, 36, 2, 4).translate(0, H + 312, -66), dark, SATIN);
    add(big, new RoundedBoxGeometry(66, 74, 66, 2, 6).translate(0, 205, -70), cream, ENAMEL);
    add(fine, knurl(9, 18, 16).rotateX(Math.PI / 2).translate(0, 205, -112), dark, RUBBER);
    for (const s of [-1, 1]) {
      add(big, knurl(21, 12, 40).rotateZ(Math.PI / 2).translate(s * 40, 198, -64), "#18191b", RUBBER);
      add(fine, new THREE.CylinderGeometry(15, 15, 1, 32).rotateZ(Math.PI / 2).translate(s * 46.6, 198, -64), "#cfd2d6", CHROME);
    }
    // The arm out to the head, the head, and its zoom knobs.
    add(big, new RoundedBoxGeometry(54, 38, 44, 2, 6).translate(0, 214, -24), cream, ENAMEL);
    add(big, new RoundedBoxGeometry(96, 64, 100, 3, 12).translate(0, 214, 12), cream, ENAMEL);
    for (const s of [-1, 1]) {
      add(big, knurl(22, 14, 44).rotateZ(Math.PI / 2).translate(s * 55, 214, 16), "#1d1e21", RUBBER);
      add(fine, new THREE.CylinderGeometry(23, 23, 2, 44).rotateZ(Math.PI / 2).translate(s * 47, 214, 16), "#c9ccd0", CHROME);
    }
    // The objective under the head: a black nose, a chrome ring, a lens catching the light.
    add(big, new THREE.CylinderGeometry(31, 33, 24, 40).translate(0, 170, 12), dark, SATIN);
    add(fine, new THREE.CylinderGeometry(33.5, 33.5, 2.5, 40).translate(0, 159, 12), "#cfd2d6", CHROME);
    add(fine, new THREE.CylinderGeometry(24, 24, 0.5, 32).translate(0, 157.8, 12), "#10161e", { rough: 0.05 });
    // The binocular tube leaning toward whoever sits there, and its two eyepieces with rubber cups.
    const lean = new THREE.Matrix4().compose(new THREE.Vector3(0, 252, 22), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.75), new THREE.Vector3(1, 1, 1));
    add(big, new RoundedBoxGeometry(82, 30, 64, 2, 8).applyMatrix4(lean), cream, ENAMEL);
    for (const s of [-1, 1]) {
      const tube = new THREE.Matrix4().compose(new THREE.Vector3(s * 29, 274, 44), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.75), new THREE.Vector3(1, 1, 1));
      add(big, new THREE.CylinderGeometry(11, 12, 40, 28).applyMatrix4(tube), "#2e3135", SATIN);
      add(fine, new THREE.CylinderGeometry(12.6, 12.6, 1.5, 28).translate(0, -14, 0).applyMatrix4(tube), "#cfd2d6", CHROME);
      add(big, new THREE.CylinderGeometry(14, 13, 14, 28, 1, true).translate(0, 26, 0).applyMatrix4(tube), "#121315", RUBBER);
    }
  }

  // The desk lamp: a heavy domed base, a straight stem, a jointed arm and a deep shade, all in green enamel.
  const shade = new THREE.Vector3(SHADE.x, SHADE.y, SHADE.z);
  const axis = new THREE.Vector3(SHADE.aim.x, SHADE.aim.y, SHADE.aim.z).sub(shade).normalize();
  const spot = new THREE.SpotLight("#ffd29e", 0, 0, 0.6, 0.85, 2);
  {
    const green = "#2e5b4f";
    const base = one("lamp base");
    const f = base.footprint as { x: number; z: number; r: number };
    const profile = [new THREE.Vector2(0, 0), new THREE.Vector2(f.r - 2, 0), new THREE.Vector2(f.r, 2), new THREE.Vector2(f.r, LAMP.base)];
    for (let i = 10; i >= 0; i--) {
      const s = i / 10;
      profile.push(new THREE.Vector2(f.r * s, topHeight(base, f.x + f.r * s * 0.9999, f.z)));
    }
    big.add(surface, piece(new THREE.LatheGeometry(profile, 56).translate(f.x, 0, f.z), green, ENAMEL));
    big.add(surface, piece(new THREE.CylinderGeometry(LAMP.stem.r, LAMP.stem.r + 1.5, LAMP.stem.top, 20).translate(LAMP.stem.x, LAMP.stem.top / 2, LAMP.stem.z), "#c6cacf", STEEL));
    const knuckle = new THREE.Vector3(LAMP.stem.x, LAMP.stem.top + 4, LAMP.stem.z);
    big.add(surface, piece(new THREE.SphereGeometry(10, 20, 12).translate(knuckle.x, knuckle.y, knuckle.z), green, ENAMEL));
    // Its arm, from the knuckle up and over to the back of the shade.
    const back = shade.clone().addScaledVector(axis, -76);
    const curve = new THREE.QuadraticBezierCurve3(knuckle, new THREE.Vector3((knuckle.x + back.x) / 2, Math.max(knuckle.y, back.y) + 34, (knuckle.z + back.z) / 2), back);
    big.add(surface, piece(new THREE.TubeGeometry(curve, 16, 5, 10), "#c6cacf", STEEL));
    big.add(surface, piece(new THREE.SphereGeometry(8.5, 16, 10).translate(back.x, back.y, back.z), green, ENAMEL));
    // The shade, a deep bell open toward the bench: green outside, white inside.
    const bell: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      bell.push(new THREE.Vector2(12 + 38 * Math.pow(Math.sin((t * Math.PI) / 2), 0.75), -t * 70 - 8 * t * t));
    }
    const turn = new THREE.Matrix4().compose(back, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), axis), new THREE.Vector3(1, 1, 1));
    // Drawn from the mouth up, its faces turn outward; the lining, drawn down, faces in.
    big.add(surface, piece(new THREE.LatheGeometry([...bell].reverse(), 40), green, ENAMEL), turn);
    const inner = bell.map((v) => new THREE.Vector2(v.x - 0.8, v.y));
    fine.add(surface, piece(new THREE.LatheGeometry(inner, 40), "#f4efe4", { rough: 0.6, glow: 0.85 }), turn);
    fine.add(surface, piece(new THREE.TorusGeometry(50.2, 1.6, 6, 40).rotateX(Math.PI / 2).translate(0, -78, 0), green, ENAMEL), turn);
    // The bulb, which glows when the lamp is on.
    fine.add(surface, piece(new THREE.SphereGeometry(15, 20, 14).translate(0, -34, 0), "#fff1d6", { rough: 0.3, glow: 3.2 }), turn);
    spot.position.copy(back).addScaledVector(axis, 34);
    spot.target.position.set(SHADE.aim.x, SHADE.aim.y, SHADE.aim.z);
    // The eyes' cameras see by it too.
    spot.layers.enableAll();
    group.add(spot, spot.target);
    freeze(spot.target);
    freeze(spot);
  }

  // Vials: clear tubes with a plug of cornmeal food at the bottom, foam plugs, labels in marker, and pupae up the walls.
  const pupae: THREE.Matrix4[] = [];
  const vial = (x: number, z: number, top: number, food: number, label: number, facing: number, plugColor: string, plug: { bottom: number; top: number; base: number } | null) => {
    glass.add(clear, paint(new THREE.CylinderGeometry(VIAL_RADIUS, VIAL_RADIUS, top - 1, 40, 1, true).translate(x, (top + 1) / 2, z), "#f4fbff"));
    glass.add(clear, paint(new THREE.TorusGeometry(VIAL_RADIUS - 0.4, 0.45, 5, 40).rotateX(Math.PI / 2).translate(x, top, z), "#ffffff"));
    // The food: golden, a little darker at the bottom where the molasses settles, its top a little sunken.
    const meal = new THREE.CylinderGeometry(VIAL_RADIUS - 0.9, VIAL_RADIUS - 0.9, food, 32, 3);
    {
      const pos = meal.attributes.position;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) > food / 2 - 0.01) pos.setY(i, pos.getY(i) - 1.4 * (1 - Math.hypot(pos.getX(i), pos.getZ(i)) / (VIAL_RADIUS - 0.9)));
    }
    big.add(surface, piece(meal.translate(x, food / 2 + 1, z), (p) => new THREE.Color("#b07624").lerp(new THREE.Color("#ddb05a"), Math.min(1, (p.y - 1) / food) * 0.8 + 0.2), FOOD));
    // The plug: a foam cylinder, its top rounded, standing out of the rim.
    if (plug) {
      const foam = new THREE.CylinderGeometry(VIAL_RADIUS - 1.2, VIAL_RADIUS - 1.4, plug.top - plug.bottom, 32, 2).translate(x, (plug.top + plug.bottom) / 2, z);
      big.add(surface, piece(foam, plugColor, FOAM));
      const cap = new THREE.SphereGeometry(VIAL_RADIUS - 1.2, 32, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, (plug.base - plug.top) / (VIAL_RADIUS - 1.2), 1);
      big.add(surface, piece(cap.translate(x, plug.top, z), plugColor, FOAM));
    }
    // The label, wrapped round the side that faces out.
    const band = new THREE.CylinderGeometry(VIAL_RADIUS + 0.12, VIAL_RADIUS + 0.12, 22, 16, 1, true, facing - 0.85, 1.7);
    sheets.add(paper, paperPiece(band.translate(x, 75, z), "#fbfaf4", labelRegion(label % DISPLAY)));
    // Pupae on the inside of the wall, some dark (old), some pale (new), above the food.
    const n = Math.floor(rnd.range(3, 11));
    for (let i = 0; i < n; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const y = rnd.range(food + 8, Math.min(top - 18, 84));
      const r = VIAL_RADIUS - 1.1;
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(rnd.range(-0.25, 0.25), 1, 0).normalize());
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(UP, -a));
      pupae.push(new THREE.Matrix4().compose(new THREE.Vector3(x + out.x * r, y, z + out.z * r), q, new THREE.Vector3(0.62, 1.45, 0.42)));
    }
  };
  {
    const plugs = ["#e9d7a9", "#efe9dc", "#f0d77a", "#e2cfa2"];
    const vials = byName("vial");
    vials.forEach((v, i) => {
      const f = v.footprint as { x: number; z: number };
      const top = (v.top as { base: number }).base;
      vial(f.x, f.z, top, rnd.range(16, 24), i, RACK.angle, plugs[i % plugs.length], { bottom: top - 14, top: top + 0.01, base: top + 5 });
    });
    // The rack: white plastic plates with holes for the vials, clear acrylic sides.
    const m = frame(RACK.x, RACK.z, RACK.angle);
    const plate = new THREE.Shape();
    plate.moveTo(-RACK.hx, -RACK.hz);
    plate.lineTo(RACK.hx, -RACK.hz);
    plate.lineTo(RACK.hx, RACK.hz);
    plate.lineTo(-RACK.hx, RACK.hz);
    plate.closePath();
    for (let row = 0; row < RACK.rows; row++) {
      for (let col = 0; col < RACK.columns; col++) {
        const hole = new THREE.Path();
        hole.absarc((col - (RACK.columns - 1) / 2) * RACK.pitch, (row - (RACK.rows - 1) / 2) * RACK.pitch, VIAL_RADIUS + 0.6, 0, Math.PI * 2, true);
        plate.holes.push(hole);
      }
    }
    const top = new THREE.ExtrudeGeometry(plate, { depth: 3, bevelEnabled: false, curveSegments: 10 }).rotateX(Math.PI / 2).translate(0, RACK.height, 0);
    big.add(surface, piece(top, "#f3f3f0", SATIN), m);
    big.add(surface, piece(new THREE.BoxGeometry(RACK.hx * 2, 3, RACK.hz * 2).translate(0, 1.5, 0), "#ecece8", SATIN), m);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) big.add(surface, piece(new THREE.BoxGeometry(6, RACK.height - 3, 6).translate(sx * (RACK.hx - 3), RACK.height / 2, sz * (RACK.hz - 3)), "#f3f3f0", SATIN), m);
    for (const s of [-1, 1]) {
      glass.add(clear, paint(new THREE.PlaneGeometry(RACK.hx * 2 - 6, RACK.height - 6).translate(0, RACK.height / 2, s * RACK.hz), "#eef8ff"), m);
      glass.add(clear, paint(new THREE.PlaneGeometry(RACK.hz * 2 - 6, RACK.height - 6).rotateY(Math.PI / 2).translate(s * RACK.hx, RACK.height / 2, 0), "#eef8ff"), m);
    }
  }
  // The open vial: its plug pulled up out of the rim, ready to tip the flies out.
  vial(OPEN_VIAL.x, OPEN_VIAL.z, OPEN_VIAL.rim, OPEN_VIAL.food, 7, -0.4, "#e9d7a9", { bottom: OPEN_VIAL.rim - 8, top: OPEN_VIAL.plug - 3, base: OPEN_VIAL.plug });
  shadows.push({ x: OPEN_VIAL.x + 2, z: OPEN_VIAL.z + 3, rx: 15, rz: 15, angle: 0, strength: 0.35 });
  const pupaMesh = new THREE.InstancedMesh(piece(new THREE.SphereGeometry(1, 8, 6), (p) => (p.y > 0.6 ? "#8a5a2c" : "#6b3f1c"), { rough: 0.4 }), surface, pupae.length);
  pupae.forEach((m, i) => pupaMesh.setMatrixAt(i, m));
  pupaMesh.computeBoundingSphere();
  freeze(pupaMesh);
  group.add(pupaMesh);

  // The dish of grape agar: a clear dish poured to the brim, the agar deep wine and wet, with a dab of yeast paste and eggs laid round it.
  {
    const { x, z, r, rim, agar } = AGAR_DISH;
    glass.add(clear, paint(new THREE.CylinderGeometry(r, r, rim - 0.2, 64, 1, true).translate(x, rim / 2, z), "#eaf4fb"));
    glass.add(clear, paint(new THREE.TorusGeometry(r - 0.5, 0.55, 5, 64).rotateX(Math.PI / 2).translate(x, rim - 0.45, z), "#ffffff"));
    // The agar's top follows the dish's top in the world, up to its rim; its side shows dark through the wall.
    const dish = one("agar dish");
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const s = (i / 24) * 0.975;
      profile.push(new THREE.Vector2(r * s, topHeight(dish, x + r * s, z)));
    }
    profile.push(new THREE.Vector2(r * 0.975, 1.2));
    profile.reverse();
    big.add(surface, piece(new THREE.LatheGeometry(profile, 64).translate(x, 0, z), (p) => (p.y > agar - 0.2 ? "#64113c" : "#30091d"), { rough: 0.1 }));
    const yeast = new THREE.Shape();
    const { yeast: y } = LAB_DECOR;
    for (let i = 0; i <= 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const rr = y.r * (1 + Math.sin(a * 3 + 1) * 0.16 + Math.sin(a * 7) * 0.07);
      if (i === 0) yeast.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else yeast.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const dab = new THREE.ExtrudeGeometry(yeast, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 1.2, bevelSegments: 3, curveSegments: 1 });
    fine.add(surface, piece(dab.rotateX(-Math.PI / 2).translate(y.x, agar, y.z), (p) => (p.y > agar + 0.15 ? "#efe0bb" : "#d8c391"), { rough: 0.5, texture: 0.25 }));
    shadows.push({ x, z, rx: r * 1.08, rz: r * 1.08, angle: 0, strength: 0.18 });
  }
  // Eggs laid on the agar round the yeast: white grains half a millimetre long, a pair of filaments each.
  const eggs: THREE.Matrix4[] = [];
  for (let i = 0; i < 34; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const d = LAB_DECOR.yeast.r + 1.5 + Math.pow(rnd.next(), 1.6) * 12;
    eggs.push(new THREE.Matrix4().compose(new THREE.Vector3(LAB_DECOR.yeast.x + Math.cos(a) * d, AGAR_DISH.agar + 0.05, LAB_DECOR.yeast.z + Math.sin(a) * d), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd.range(0, 6.3), rnd.range(-0.2, 0.2))), new THREE.Vector3(0.27, 0.1, 0.1)));
  }

  // The fly pad on the microscope's stage: a slab of white porous plastic on a blue tray, the gas let in at its end.
  {
    const base = MICROSCOPE.height;
    const m = frame(FLY_PAD.x, FLY_PAD.z, FLY_PAD.angle, base);
    big.add(surface, piece(new RoundedBoxGeometry(FLY_PAD.hx * 2 - 8, 4.5, FLY_PAD.hz * 2, 2, 1.2).translate(4, 2.25, 0), "#2a4f8c", SATIN), m);
    big.add(surface, piece(new RoundedBoxGeometry(FLY_PAD.hx * 2 - 12, 4.5, FLY_PAD.hz * 2 - 4, 2, 0.8).translate(4, 6.75, 0), "#f5f5f0", FOAM), m);
    fine.add(surface, piece(new THREE.CylinderGeometry(2.2, 2.6, 8, 12).rotateZ(Math.PI / 2).translate(-FLY_PAD.hx + 4, 3.2, 0), "#9aa0a6", STEEL), m);
    shadows.push({ x: FLY_PAD.x, z: FLY_PAD.z, rx: FLY_PAD.hx + 3, rz: FLY_PAD.hz + 3, angle: FLY_PAD.angle, y: base, strength: 0.3 });
  }

  // The paintbrush: a lacquered handle, a crimped ferrule and a fine sable tip.
  {
    const handle = lyingSpindle(one("brush"), 48, 10);
    big.add(surface, piece(handle, (p) => {
      const t = (p.x - BRUSH.x) * Math.cos(BRUSH.angle) - (p.z - BRUSH.z) * Math.sin(BRUSH.angle);
      return t > BRUSH.handle * 0.72 ? "#e8d8b8" : t < -BRUSH.handle * 0.86 ? "#151214" : "#7d1820";
    }, { rough: 0.22 }));
    big.add(surface, piece(lyingSpindle(one("ferrule"), 32, 8), (p) => (Math.sin(p.x * 5 + p.z * 3) > 0.92 ? "#9ea3a8" : "#d3d6da"), CHROME));
    big.add(surface, piece(lyingSpindle(one("bristles"), 40, 6), (_p, n) => (Math.abs(n.y) > 0.55 ? "#7a5232" : "#4a2e1b"), { rough: 0.75 }));
    const b = one("brush").footprint as { x: number; z: number; rx: number; angle: number };
    shadows.push({ x: b.x, z: b.z, rx: b.rx * 1.02, rz: 4, angle: b.angle, strength: 0.4 });
    const tip = along(BRUSH.x, BRUSH.z, BRUSH.angle, -BRUSH.handle - 18);
    shadows.push({ x: tip.x, z: tip.z, rx: 17, rz: 2.4, angle: BRUSH.angle, strength: 0.4 });
  }

  // The forceps: two steel arms joined at the end, serrated where the fingers hold them, filed to fine points.
  for (const arm of byName("forceps")) {
    const f = arm.footprint as { x: number; z: number; hx: number; hz: number; angle: number };
    const m = frame(f.x, f.z, f.angle);
    const grip = f.hz > 1;
    // Rounded along its edges, so it catches the light as polished steel does.
    const bar = new RoundedBoxGeometry(f.hx * 2, FORCEPS.thick, f.hz * 2, 2, Math.min(0.38, f.hz * 0.9)).translate(0, FORCEPS.thick / 2, 0);
    if (!grip) {
      // Filed down toward the tip, narrower and thinner.
      const pos = bar.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getX(i) + f.hx) / (f.hx * 2);
        pos.setZ(i, pos.getZ(i) * (1 - t * 0.7));
        pos.setY(i, pos.getY(i) * (1 - t * 0.35));
      }
    }
    big.add(surface, piece(bar, "#d3d7dc", STEEL), m);
    // The serrated grip: fine grooves across it, where the fingers hold.
    if (grip) for (let g = -f.hx * 0.55; g < f.hx * 0.45; g += 1.1) fine.add(surface, piece(new THREE.BoxGeometry(0.35, 0.06, f.hz * 1.6).translate(g, FORCEPS.thick + 0.01, 0), "#7d838a", STEEL), m);
    shadows.push({ x: f.x, z: f.z, rx: f.hx, rz: f.hz + 1.2, angle: f.angle, strength: 0.32 });
  }

  // The notebook, open: ruled pages written in pen, on a dark cloth cover.
  {
    const f = one("notebook").footprint as { x: number; z: number; hx: number; hz: number; angle: number };
    const m = frame(f.x, f.z, f.angle);
    big.add(surface, piece(new THREE.BoxGeometry(f.hx * 2 + 1.2, 0.24, f.hz * 2 + 1.2).translate(0, 0.12, 0), "#25384a", MATTE), m);
    big.add(surface, piece(new THREE.BoxGeometry(f.hx * 2, NOTEBOOK.thick - 0.26, f.hz * 2).translate(0, (NOTEBOOK.thick + 0.22) / 2, 0), "#efede6", MATTE), m);
    sheets.add(paper, paperPiece(new THREE.PlaneGeometry(f.hx * 2, f.hz * 2).rotateX(-Math.PI / 2).translate(0, NOTEBOOK.thick, 0), "#fbfaf5", pagesRegion), m);
  }
  // Tape on the bench, written on.
  LAB_DECOR.tape.forEach((t, i) => {
    sheets.add(paper, paperPiece(new THREE.PlaneGeometry(t.hx * 2, t.hz * 2).rotateX(-Math.PI / 2).translate(0, 0.07, 0), t.color, tapeRegion(i)), frame(t.x, t.z, t.angle));
  });

  // The drop on the page, magnifying the writing under it.
  const dropMesh = new THREE.Mesh(solidTop(one("drop"), 10, 40, 0.01), dropMaterial(atlas));
  freeze(dropMesh);
  group.add(dropMesh);
  shadows.push({ x: DROP.x + 0.6, z: DROP.z + 0.8, rx: DROP.r * 1.25, rz: DROP.r * 1.25, angle: 0, y: NOTEBOOK.thick, strength: 0.12 });
  shadows.push({ x: DROP.x + 0.9, z: DROP.z + 1.1, rx: DROP.r * 0.45, rz: DROP.r * 0.45, angle: 0, y: NOTEBOOK.thick + 0.005, strength: 0.5, light: true });

  // The beaker, covered with crinkled foil, a little water in it, and its marks.
  {
    const { x, z, r, height } = BEAKER;
    glass.add(clear, paint(new THREE.CylinderGeometry(r * 0.97, r * 0.97, 40, 40, 1, false).translate(x, 21, z), "#cfe7f4"));
    glass.add(clear, paint(new THREE.CylinderGeometry(r, r, height - 16, 48, 1, true).translate(x, (height - 16) / 2, z), "#f2fbff"));
    for (let i = 1; i <= 8; i++) {
      const long = i % 2 === 0;
      fine.add(surface, piece(new THREE.BoxGeometry(long ? 13 : 7, 0.5, 0.3).translate(-(long ? 0 : 3), i * 9, r + 0.2).rotateY(0.25).translate(x, 0, z), "#ffffff", MATTE));
    }
    const foil = new THREE.CylinderGeometry(r + 0.6, r + 0.8, 20, 48, 6, false);
    {
      const pos = foil.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i);
        const py = pos.getY(i);
        const pz = pos.getZ(i);
        const a = Math.atan2(pz, px);
        const crinkle = Math.sin(a * 23 + py * 0.7) * 0.35 + Math.sin(a * 41 - py * 1.3) * 0.2;
        const d = Math.hypot(px, pz);
        if (py > 9.9) pos.setY(i, 10 - (d < r * 0.5 ? 0 : Math.abs(crinkle) * 0.4));
        else {
          const k = (d + crinkle) / Math.max(d, 1e-6);
          pos.setXYZ(i, px * k, py < -9.9 ? py + Math.sin(a * 9) * 2.2 : py, pz * k);
        }
      }
      foil.deleteAttribute("normal");
      const faceted = foil.toNonIndexed();
      faceted.computeVertexNormals();
      big.add(surface, piece(faceted.translate(x, height - 10, z), "#d9dcdf", { rough: 0.28, metal: 1 }));
    }
  }

  // The wash bottle: soft white plastic, a red cap, a bent spout, a label.
  {
    const { x, z, r, height, cap, capTop } = BOTTLE;
    const profile = [new THREE.Vector2(0, 0), new THREE.Vector2(r - 3, 0), new THREE.Vector2(r, 4), new THREE.Vector2(r, height - 26), new THREE.Vector2(r - 4, height - 12), new THREE.Vector2(r - 16, height - 3), new THREE.Vector2(cap + 1, height), new THREE.Vector2(0, height)];
    big.add(surface, piece(new THREE.LatheGeometry(profile, 44).translate(x, 0, z), "#e9ecea", { rough: 0.48 }));
    big.add(surface, piece(knurl(cap, capTop - height, 24, 0.5).translate(x, (height + capTop) / 2, z), "#c23b33", SATIN));
    const spout = new THREE.CatmullRomCurve3([new THREE.Vector3(x, capTop - 2, z), new THREE.Vector3(x, capTop + 22, z), new THREE.Vector3(x - 8, capTop + 34, z + 6), new THREE.Vector3(x - 34, capTop + 30, z + 22), new THREE.Vector3(x - 46, capTop + 18, z + 30)]);
    big.add(surface, piece(new THREE.TubeGeometry(spout, 24, 2.6, 8), "#eef1f0", { rough: 0.4 }));
    sheets.add(paper, paperPiece(new THREE.CylinderGeometry(r + 0.15, r + 0.15, 54, 24, 1, true, -1.63, 2.2).translate(x, 70, z), "#f7f6ef", labelRegion(8)));
  }

  // The timer: grey plastic, a green-grey display reading nought, three buttons.
  {
    const m = frame(TIMER.x, TIMER.z, TIMER.angle);
    big.add(surface, piece(new RoundedBoxGeometry(TIMER.hx * 2, TIMER.height, TIMER.hz * 2, 3, 5).translate(0, TIMER.height / 2, 0), (p) => (p.y > TIMER.height - 2 ? "#e4e6e7" : "#cfd3d6"), SATIN), m);
    sheets.add(paper, paperPiece(new THREE.PlaneGeometry(48, 22).rotateX(-Math.PI / 2).translate(0, TIMER.height + 0.02, -8), "#a9b6a0", labelRegion(DISPLAY)), m);
    for (let i = 0; i < 3; i++) fine.add(surface, piece(new THREE.CylinderGeometry(4.5, 4.8, 0.9, 20).translate(-15 + i * 15, TIMER.height + 0.25, 15), ["#d24e3a", "#3a7fd2", "#5a5f66"][i], { rough: 0.45 }), m);
    // The seam between its two halves, and the grey rubber band round its foot that keeps it from sliding.
    fine.add(surface, piece(new THREE.BoxGeometry(TIMER.hx * 2 - 4, 0.5, TIMER.hz * 2 + 0.2).translate(0, 13, 0), "#9fa4a8", SATIN), m);
    fine.add(surface, piece(new THREE.BoxGeometry(TIMER.hx * 2 + 0.2, 0.5, TIMER.hz * 2 - 4).translate(0, 13, 0), "#9fa4a8", SATIN), m);
    fine.add(surface, piece(new RoundedBoxGeometry(TIMER.hx * 2 + 0.6, 3, TIMER.hz * 2 + 0.6, 2, 1.4).translate(0, 1.5, 0), "#7d8287", RUBBER), m);
  }

  // The box of pipette tips: a blue box, a white plate of yellow tips, a clear lid.
  {
    const box = one("tip box");
    const f = box.footprint as { x: number; z: number; hx: number; hz: number; angle: number };
    const m = frame(f.x, f.z, f.angle);
    big.add(surface, piece(new RoundedBoxGeometry(f.hx * 2 - 2, 46, f.hz * 2 - 2, 2, 2).translate(0, 23, 0), "#2f6fb5", SATIN), m);
    // Moulded ribs up its long sides, a lip where the lid closes, and a strip of tape with what is in it.
    for (const side of [-1, 1]) for (let i = -3; i <= 3; i++) fine.add(surface, piece(new THREE.BoxGeometry(3, 32, 2).translate(i * 15, 22, side * (f.hz - 1)), "#2c68aa", SATIN), m);
    fine.add(surface, piece(new RoundedBoxGeometry(f.hx * 2, 3, f.hz * 2, 2, 1).translate(0, 44.5, 0), "#2a62a3", SATIN), m);
    sheets.add(paper, paperPiece(new THREE.PlaneGeometry(52, 15).rotateY(Math.PI).translate(-2, 30, -f.hz - 0.1), "#f6f2df", labelRegion(5)), m);
    big.add(surface, piece(new THREE.BoxGeometry(f.hx * 2 - 4, 2, f.hz * 2 - 4).translate(0, 47, 0), "#f4f4f1", SATIN), m);
    const tips: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 8; j++) tips.push(new THREE.CylinderGeometry(3.4, 2.6, 9, 10, 1, true).translate((i - 5.5) * 9, 52.5, (j - 3.5) * 9));
    }
    const merged = mergeGeometries(tips);
    for (const t of tips) t.dispose();
    fine.add(surface, piece(merged, "#f1cf55", { rough: 0.35 }), m);
    glass.add(clear, paint(new RoundedBoxGeometry(f.hx * 2, 16, f.hz * 2, 2, 2).translate(0, 56, 0), "#eef7ff"), m);
  }

  // A used wipe, crumpled: the world's dome, creased and folded.
  {
    const wipe = one("wipe");
    // Its folds are a little below the world's dome (never above it), and its faces flat, so the creases catch the light.
    const geometry = solidTop(wipe, 22, 64);
    const pos = geometry.attributes.position;
    // Sharp ridges where the folds meet, a little deeper up on the heap than at its foot, never more than a millimetre or two under where the fly stands.
    const crease = (x: number, z: number) => Math.abs(Math.sin(x * 0.21 + Math.sin(z * 0.17) * 2.2) + Math.sin(z * 0.3 - x * 0.13) * 0.8 + Math.sin((x + z) * 0.5) * 0.35) + Math.abs(Math.sin(x * 0.9 - z * 0.7 + Math.sin(z * 0.5) * 1.5)) * 0.3;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0.3) pos.setY(i, Math.max(0.2, y - crease(pos.getX(i), pos.getZ(i)) * (0.55 + 0.45 * THREE.MathUtils.smoothstep(y, 3, 12))));
    }
    geometry.deleteAttribute("normal");
    geometry.computeVertexNormals();
    big.add(surface, piece(geometry, "#f2f3f5", { rough: 0.95, texture: 0.12 }));
  }

  // Fly food spilt when the vials were filled: flat drips, and dried crumbs to climb.
  for (const patch of LAB_PATCHES.filter((p) => p.name === "fly food")) {
    const shape = new THREE.Shape();
    const wobble = patch.x * 0.7;
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const rr = patch.r * (1 + Math.sin(a * 3 + wobble) * 0.14 + Math.sin(a * 5 + wobble * 2) * 0.07);
      if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    // A drop of food set soft, domed over its middle and thin at its edge, wet with molasses.
    const drip = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.22, bevelSize: patch.r * 0.35, bevelSegments: 5, curveSegments: 1 });
    big.add(surface, piece(drip.rotateX(-Math.PI / 2).translate(patch.x, 0.0, patch.z), (p) => new THREE.Color("#9a5f1e").lerp(new THREE.Color("#d9a447"), Math.min(1, p.y / 0.4)), { rough: 0.32, texture: -0.7 }));
    shadows.push({ x: patch.x, z: patch.z, rx: patch.r * 1.25, rz: patch.r * 1.25, angle: 0, strength: 0.18 });
  }
  for (const crumb of byName("crumb")) {
    const f = crumb.footprint as { x: number; z: number; rx: number; rz: number; angle: number };
    big.add(surface, piece(solidTop(crumb, 6, 18), (p) => (p.y > 0.5 ? "#d8a957" : "#a8742f"), FOOD));
    shadows.push({ x: f.x, z: f.z, rx: f.rx * 1.3, rz: f.rz * 1.3, angle: f.angle, strength: 0.5 });
  }
  // Grains of cornmeal round the drips, too small to feel underfoot, and the eggs on the agar: one instanced draw.
  const specks: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  for (const cluster of LAB_DECOR.grains) {
    for (let i = 0; i < cluster.count; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const r = Math.sqrt(rnd.next()) * cluster.r;
      const size = rnd.range(0.12, 0.34) * (cluster.scale ?? 1);
      const x = cluster.x + Math.cos(a) * r;
      const z = cluster.z + Math.sin(a) * r;
      specks.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd.range(0, 3), rnd.range(0, 6), rnd.range(0, 3))), new THREE.Vector3(size, size * 0.7, size * rnd.range(0.8, 1.3))), c: new THREE.Color(rnd.next() < 0.3 ? "#9a6a2a" : "#e2b45c") });
      if (size > 0.26) shadows.push({ x, z, rx: size * 1.7, rz: size * 1.7, angle: 0, strength: 0.25 });
    }
  }
  for (const m of eggs) specks.push({ m, c: new THREE.Color("#fbfaf2") });
  const speckMesh = new THREE.InstancedMesh(piece(new THREE.IcosahedronGeometry(1, 1), "#ffffff", { rough: 0.5 }), surface, specks.length);
  specks.forEach((s, i) => {
    speckMesh.setMatrixAt(i, s.m);
    speckMesh.setColorAt(i, s.c);
  });
  speckMesh.computeBoundingSphere();
  freeze(speckMesh);
  group.add(speckMesh);

  group.add(contactShadows(shadows));
  seen.push(...big.build(group));
  fine.build(group);
  const [glassMesh] = glass.build(group);
  glassMesh.renderOrder = 3;
  seen.push(...sheets.build(group));

  let lit = -1;
  return {
    group,
    materials: [surface, clear, bench, paper, dropMesh.material as THREE.MeshStandardMaterial],
    seen,
    update(_time, light) {
      // The lamp comes on as the room darkens; by day the sun comes in at the windows.
      const t = Math.min(1, Math.max(0, (light.stars - 0.25) / 0.6));
      const on = t * t * (3 - 2 * t);
      beam.uSunDir.value.copy(light.sunDirection);
      beam.uSunColor.value.copy(light.sunColor);
      beam.uSunBeam.value = light.sunIntensity * SUNBEAM * (1 - on);
      // The windows as glossy things see them: the sky outside, bright by day, glowing at dusk, dark at night.
      shine.uWindow.value.copy(light.cloud).lerp(WHITE, 0.55 * (1 - light.stars)).multiplyScalar(1.4 * (1 - 0.8 * light.stars));
      if (on === lit) return;
      lit = on;
      spot.intensity = on * LAMP_CANDELA;
      shine.uGlow.value = on;
    },
    ripple() {},
  };
}
