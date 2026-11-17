// How the building kit's pieces look (packages/world/src/kit.ts says what
// they are to the fly): glazed dishes and tiles, a biscuit crumb, a twig, a
// fallen leaf, a wooden ramp and walls, each drawn over the shape the world
// gives it, so that what the fly stands on is what is drawn. Every piece set
// down is merged into one mesh of one material, what each is made of carried
// by its vertices, with their soft shadows on what they stand on in one more:
// two draws however many there are, built again only when they change. While
// the Build tool is in hand, a glassy ghost shows where the next piece would
// go, or which piece the hand is on: one draw more, and not in the fly's
// world. In the open air they get wet in the rain and take the snow, the
// gull's shadow passes over them, and their glazes show the sky.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { PIECE_KINDS, PIECE_SHAPES, pieceAngle, pieceSolid, topHeight } from "@fly/world";
import type { Piece, PieceKind } from "@fly/world";
import type { Aim, Builder } from "../tools/build.ts";
import { freeze, paint } from "./build.ts";
import type { Daylight } from "./light.ts";
import { shaded } from "./shade.ts";
import { snowDust } from "./snow.ts";
import type { Weather } from "./weather.ts";

/** The colours the coloured pieces come in: bright, middling and dark to a fly's eyes (packages/body/src/vision.ts, FLY_RGB), as blue, yellow and red are to ours. */
export const KIT_COLOURS = { blue: "#3d8ef0", yellow: "#f5c01a", red: "#d8342c" } as const;

/** What a piece is made of, per vertex: how rough it is, and how much it darkens when wet (0 glaze, 1 bark or biscuit). */
type Surface = { rough: number; porous: number };
const GLAZE: Surface = { rough: 0.16, porous: 0 };
const TILE_GLAZE: Surface = { rough: 0.3, porous: 0 };
const WOOD: Surface = { rough: 0.72, porous: 0.8 };
const BARK: Surface = { rough: 0.9, porous: 1 };
const BISCUIT: Surface = { rough: 0.85, porous: 1 };
const LEAF: Surface = { rough: 0.5, porous: 0.3 };

/** Each piece's soft shadow: its outline (round or square) and how dark. */
const SHADOWS: Readonly<Record<PieceKind, { square: boolean; strength: number }>> = {
  "dish-blue": { square: false, strength: 0.36 },
  "dish-yellow": { square: false, strength: 0.36 },
  "tile-blue": { square: true, strength: 0.22 },
  "tile-yellow": { square: true, strength: 0.22 },
  "tile-red": { square: true, strength: 0.22 },
  crumb: { square: false, strength: 0.45 },
  twig: { square: true, strength: 0.42 },
  leaf: { square: false, strength: 0.18 },
  ramp: { square: true, strength: 0.36 },
  wall: { square: true, strength: 0.48 },
};
/** How far a shadow spreads past what casts it, mm. */
const SPREAD = 1.6;

const mix = (a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k);

/** A piece's own geometry, about its middle with its foot at y = 0: position, normal, color and surface, not indexed. */
function pieceGeometry(kind: PieceKind): THREE.BufferGeometry {
  const at: Piece = { kind, x: 0, z: 0, turns: 0, y: 0 };
  const solid = pieceSolid(at);
  const top = (x: number, z: number) => topHeight(solid, x, z);
  let geometry: THREE.BufferGeometry;
  let surface: Surface;
  switch (kind) {
    case "dish-blue":
    case "dish-yellow": {
      // Turned on a wheel: the world's own profile, from the middle of the well out to the foot.
      const glaze = kind === "dish-blue" ? KIT_COLOURS.blue : KIT_COLOURS.yellow;
      const well = mix(glaze, "#ffffff", 0.12);
      const r = (solid.footprint as { r: number }).r;
      const profile: THREE.Vector2[] = [];
      for (let i = 0; i <= 36; i++) {
        const s = i / 36;
        profile.push(new THREE.Vector2(s * r, top(s * r * 0.9999, 0)));
      }
      // Up the inside of the foot ring, under it.
      profile.push(new THREE.Vector2(r * 0.92, 0.02));
      geometry = paint(new THREE.LatheGeometry(profile.reverse(), 56), (p) => {
        const d = Math.hypot(p.x, p.z) / r;
        // The glaze runs thin over the rim's crest, and pools deeper in the well.
        const crest = Math.max(0, 1 - Math.abs(d - 0.78) / 0.09);
        return d < 0.6 ? well : mix(glaze, "#ffffff", crest * 0.35);
      });
      surface = GLAZE;
      break;
    }
    case "tile-blue":
    case "tile-yellow":
    case "tile-red": {
      const glaze = KIT_COLOURS[kind === "tile-blue" ? "blue" : kind === "tile-yellow" ? "yellow" : "red"];
      const f = solid.footprint as { hx: number; hz: number };
      const h = PIECE_SHAPES[kind].height;
      const edge = mix(glaze, "#000000", 0.18);
      geometry = paint(new RoundedBoxGeometry(f.hx * 2, h, f.hz * 2, 2, 0.12).translate(0, h / 2, 0), (p) => (p.y > h - 0.02 && Math.max(Math.abs(p.x), Math.abs(p.z)) < f.hx - 0.1 ? glaze : edge));
      surface = TILE_GLAZE;
      break;
    }
    case "crumb": {
      // The world's dome, a polar grid over its footprint, flecked as baked biscuit is.
      const f = solid.footprint as { rx: number; rz: number };
      const rings = 7;
      const segments = 20;
      const positions: number[] = [];
      const point = (ring: number, seg: number) => {
        const k = ring / rings;
        const a = (seg / segments) * Math.PI * 2;
        const x = Math.cos(a) * f.rx * k * 0.9999;
        const z = Math.sin(a) * f.rz * k * 0.9999;
        return [x, top(x, z), z];
      };
      for (let ring = 0; ring < rings; ring++) {
        for (let seg = 0; seg < segments; seg++) {
          const a = point(ring, seg);
          const b = point(ring + 1, seg);
          const c = point(ring + 1, seg + 1);
          const d = point(ring, seg + 1);
          positions.push(...a, ...b, ...c);
          if (ring > 0) positions.push(...a, ...c, ...d);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry = paint(g, (p) => {
        const speck = Math.sin(p.x * 13.1 + p.z * 7.7) * Math.sin(p.z * 11.3 - p.x * 5.1 + p.y * 9);
        return speck > 0.55 ? "#b5722e" : speck < -0.7 ? "#f6dca0" : p.y > 1.6 ? "#e9b464" : "#d39446";
      });
      // Its faces wind clockwise seen from above as built: turned over, they face up.
      flipFaces(geometry);
      surface = BISCUIT;
      break;
    }
    case "twig": {
      // A round stick on the world's rail, its bark ridged along it, its cut ends pale.
      const f = solid.footprint as { hx: number; hz: number };
      const r = f.hz;
      const stick = new THREE.CylinderGeometry(r, r, f.hx * 2, 12, 6).rotateZ(Math.PI / 2).translate(0, r, 0);
      geometry = paint(stick, (p, n) => {
        if (Math.abs(n.x) > 0.9) return Math.hypot(p.y - r, p.z) < r * 0.55 ? "#e2c08e" : "#c49a62";
        const ridge = Math.sin(Math.atan2(p.y - r, p.z) * 9 + Math.sin(p.x * 0.6) * 1.3);
        const knot = Math.exp(-((p.x - 5) ** 2) * 1.5);
        return mix(ridge > 0.3 ? "#6b4a2c" : "#86613b", "#4a311c", knot * 0.8);
      });
      surface = BARK;
      break;
    }
    case "leaf": {
      // A leaf lying flat, inside the world's ellipse: pointed at its tip (+x), its midrib and veins paler.
      const f = solid.footprint as { rx: number; rz: number };
      const h = PIECE_SHAPES[kind].height;
      const shape = new THREE.Shape();
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const c = Math.cos(a);
        const narrow = 1 - 0.45 * Math.max(0, c) ** 3 - 0.2 * Math.max(0, -c) ** 4;
        const x = c * f.rx * 0.98;
        const y = Math.sin(a) * f.rz * 0.98 * narrow;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      const blade = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2);
      // Its stalk, lying on the table, lower than anything a fly would feel.
      const stalk = new THREE.CylinderGeometry(0.2, 0.25, 3.5, 6).rotateZ(Math.PI / 2).translate(-f.rx - 1.9, 0.21, 0);
      const green = (p: THREE.Vector3, n: THREE.Vector3) => {
        if (p.x < -f.rx) return "#6e8a3a";
        if (n.y < 0.5) return "#2f6a24";
        const along = (p.x + f.rx) / (2 * f.rx);
        const rib = Math.exp(-((p.z / 0.35) ** 2));
        const vein = Math.max(0, Math.sin((p.x - Math.abs(p.z) * 1.4) * 1.1)) ** 12;
        const edge = Math.abs(p.z) / (f.rz * Math.max(0.1, 1 - Math.abs(along - 0.45)));
        return mix(mix("#4f9a34", "#2f7424", Math.min(1, edge * 0.8)), "#b6d77a", Math.max(rib * 0.85, vein * 0.5));
      };
      const parts = [paint(blade, green), paint(stalk, green)];
      geometry = mergeTwo(parts[0], parts[1]);
      surface = LEAF;
      break;
    }
    case "ramp": {
      // A wedge of pale wood: the world's slope on top, square sides, planks along it.
      const f = solid.footprint as { hx: number; hz: number };
      const box = new THREE.BoxGeometry(f.hx * 2, 1, f.hz * 2, 12, 1, 6);
      const pos = box.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        pos.setY(i, pos.getY(i) > 0 ? top(Math.min(f.hx * 0.9999, Math.max(-f.hx * 0.9999, x)), z) : 0);
      }
      box.deleteAttribute("normal");
      geometry = paint(box, (p, n) => wood(p, n, f.hz));
      surface = WOOD;
      break;
    }
    case "wall": {
      const f = solid.footprint as { hx: number; hz: number };
      const h = PIECE_SHAPES[kind].height;
      geometry = paint(new RoundedBoxGeometry(f.hx * 2, h, f.hz * 2, 2, 0.14).translate(0, h / 2, 0), (p, n) => wood(p, n, f.hz));
      surface = WOOD;
      break;
    }
  }
  const count = geometry.attributes.position.count;
  const surfaces = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    surfaces[i * 2] = surface.rough;
    surfaces[i * 2 + 1] = surface.porous;
  }
  geometry.setAttribute("surface", new THREE.BufferAttribute(surfaces, 2));
  return geometry;
}

/** Pale beech, its grain running along it (x), a little darker on its sides and ends. */
function wood(p: THREE.Vector3, n: THREE.Vector3, half: number) {
  const grain = Math.sin(p.z * 7.5 + Math.sin(p.x * 0.45) * 1.8 + p.y * 2) * 0.5 + 0.5;
  const base = mix("#e2c18e", "#c9a06a", grain * grain);
  // Planks a few millimetres wide across a ramp's top.
  const seam = n.y > 0.5 && half > 2 && Math.abs(((p.z / (half * 2)) * 3 + 1.5) % 1) < 0.04 ? 0.35 : 0;
  return base.lerp(new THREE.Color("#8a6640"), Math.max(seam, n.y > 0.5 ? 0 : 0.18));
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "color"]) {
    const x = a.attributes[name].array as Float32Array;
    const y = b.attributes[name].array as Float32Array;
    const both = new Float32Array(x.length + y.length);
    both.set(x);
    both.set(y, x.length);
    out.setAttribute(name, new THREE.BufferAttribute(both, 3));
  }
  a.dispose();
  b.dispose();
  return out;
}

/** Reverses each triangle's winding (and its normals), for geometry built facing down. */
function flipFaces(g: THREE.BufferGeometry) {
  for (const name of ["position", "normal", "color"]) {
    const a = g.attributes[name].array as Float32Array;
    for (let i = 0; i < a.length; i += 9) {
      for (let k = 0; k < 3; k++) {
        const t = a[i + 3 + k];
        a[i + 3 + k] = a[i + 6 + k];
        a[i + 6 + k] = t;
      }
    }
  }
  const n = g.attributes.normal.array as Float32Array;
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
}

/** Each kind's geometry, made the first time one is wanted and kept: every merge and the ghost draw from them. */
let geometries: Map<PieceKind, THREE.BufferGeometry> | null = null;
export function kitGeometries(): ReadonlyMap<PieceKind, THREE.BufferGeometry> {
  return (geometries ??= new Map(PIECE_KINDS.map((kind) => [kind, pieceGeometry(kind)])));
}

const SHADOW_VS = /* glsl */ `
attribute vec2 local;
attribute vec4 shape;
varying vec2 vLocal;
varying vec4 vShape;
void main() {
  vLocal = local;
  vShape = shape;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// How far outside the outline (mm), round or square, and darker toward it.
const SHADOW_FS = /* glsl */ `
varying vec2 vLocal;
varying vec4 vShape;
void main() {
  vec2 size = vShape.xy;
  float beyond;
  if (vShape.z > 0.5) beyond = length(max(abs(vLocal) - size, 0.0)) + min(max(abs(vLocal.x) - size.x, abs(vLocal.y) - size.y), 0.0);
  else beyond = (length(vLocal / size) - 1.0) * min(size.x, size.y);
  float a = vShape.w * (1.0 - smoothstep(-0.8, ${SPREAD.toFixed(1)}, beyond));
  gl_FragColor = vec4(0.12, 0.2, 0.32, a);
}`;

const UP = new THREE.Vector3(0, 1, 0);

export class KitView {
  readonly group = new THREE.Group();
  /** Every piece set down, one draw: what the fly's eyes see of them. */
  readonly built: THREE.Mesh;
  readonly #shadows: THREE.Mesh;
  readonly #ghost: THREE.Mesh;
  readonly #material: THREE.MeshStandardMaterial;
  readonly #ghostMaterial: THREE.MeshBasicMaterial;
  readonly #wet = { value: 0 };
  readonly #snow = { value: 0 };
  #version = -1;
  #env = -1;
  #wetNow = -1;

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 1 });
    const wet = this.#wet;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uKitWet = wet;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 surface;\nvarying vec2 vSurface;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSurface = surface;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uKitWet;\nvarying vec2 vSurface;")
        // Wet, everything shines more, and wood, bark and biscuit darken as they soak it up.
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - 0.3 * uKitWet * vSurface.y;")
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vSurface.x * (1.0 - 0.45 * uKitWet);");
    };
    material.customProgramCacheKey = () => "kit";
    shaded(material);
    snowDust(material, this.#snow);
    this.#material = material;
    this.built = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.built.visible = false;
    freeze(this.built);
    this.group.add(this.built);
    this.#shadows = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({ vertexShader: SHADOW_VS, fragmentShader: SHADOW_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.#shadows.renderOrder = 1;
    this.#shadows.visible = false;
    freeze(this.#shadows);
    this.group.add(this.#shadows);
    this.#ghostMaterial = new THREE.MeshBasicMaterial({ color: "#9fe8ff", transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.#ghost = new THREE.Mesh(kitGeometries().get("tile-blue")!, this.#ghostMaterial);
    this.#ghost.renderOrder = 8;
    this.#ghost.visible = false;
    this.group.add(this.#ghost);
  }

  /**
   * Keeps the pieces drawn as built, and the ghost where the tool points
   * (`aim`, while `ghost` is shown, `opacity` faded with the hand). `outdoors`:
   * the place is in the open air, where rain and snow reach them.
   */
  update(builder: Builder, aim: Aim | null, removing: boolean, opacity: number, time: number, light: Daylight, weather: Weather, outdoors: boolean) {
    if (builder.version !== this.#version) {
      this.#version = builder.version;
      this.#rebuild(builder.active ? builder.pieces : []);
    }
    const wet = outdoors ? weather.wet : 0;
    if (Math.abs(wet - this.#wetNow) > 0.003) {
      this.#wetNow = wet;
      this.#wet.value = wet;
    }
    this.#snow.value = outdoors ? weather.snowCover : 0;
    if (light.env !== this.#env) {
      this.#env = light.env;
      this.#material.envMapIntensity = light.env;
    }
    const ghost = this.#ghost;
    ghost.visible = !!aim && aim.showing !== "none" && opacity > 0.01;
    if (!ghost.visible || !aim) return;
    const p = aim.piece;
    const geometry = kitGeometries().get(p.kind)!;
    if (ghost.geometry !== geometry) ghost.geometry = geometry;
    const target = aim.showing === "target";
    ghost.position.set(p.x, p.y, p.z);
    ghost.quaternion.setFromAxisAngle(UP, pieceAngle(p));
    // The piece the hand is on, a little larger than it, so it glows over it.
    ghost.scale.setScalar(target ? 1.05 : 1);
    this.#ghostMaterial.color.set(!aim.ok || (target && removing) ? "#ff8f8f" : "#9fe8ff");
    this.#ghostMaterial.opacity = opacity * (0.42 + 0.08 * Math.sin(time * 4));
  }

  /** Merges every piece into one mesh, and their shadows into another. */
  #rebuild(pieces: readonly Piece[]) {
    const kinds = kitGeometries();
    let count = 0;
    for (const p of pieces) count += kinds.get(p.kind)!.attributes.position.count;
    const position = new Float32Array(count * 3);
    const normal = new Float32Array(count * 3);
    const color = new Float32Array(count * 3);
    const surface = new Float32Array(count * 2);
    let at = 0;
    for (const p of pieces) {
      const g = kinds.get(p.kind)!;
      const a = pieceAngle(p);
      // Turned as the world turns its footprint: +x toward -z.
      const c = Math.cos(a);
      const s = Math.sin(a);
      const src = g.attributes.position.array as Float32Array;
      const nrm = g.attributes.normal.array as Float32Array;
      const n = g.attributes.position.count;
      for (let i = 0; i < n; i++) {
        const x = src[i * 3];
        const z = src[i * 3 + 2];
        position[(at + i) * 3] = p.x + x * c + z * s;
        position[(at + i) * 3 + 1] = p.y + src[i * 3 + 1];
        position[(at + i) * 3 + 2] = p.z - x * s + z * c;
        normal[(at + i) * 3] = nrm[i * 3] * c + nrm[i * 3 + 2] * s;
        normal[(at + i) * 3 + 1] = nrm[i * 3 + 1];
        normal[(at + i) * 3 + 2] = -nrm[i * 3] * s + nrm[i * 3 + 2] * c;
      }
      color.set(g.attributes.color.array as Float32Array, at * 3);
      surface.set(g.attributes.surface.array as Float32Array, at * 2);
      at += n;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
    geometry.setAttribute("surface", new THREE.BufferAttribute(surface, 2));
    geometry.computeBoundingSphere();
    this.built.geometry.dispose();
    this.built.geometry = geometry;
    this.built.visible = pieces.length > 0;

    // A quad under each, a little bigger than its footprint, on what it stands on.
    const quads = new Float32Array(pieces.length * 18);
    const local = new Float32Array(pieces.length * 12);
    const shape = new Float32Array(pieces.length * 24);
    pieces.forEach((p, k) => {
      const f = PIECE_SHAPES[p.kind].footprint(0, 0, 0);
      const hx = f.kind === "circle" ? f.r : f.kind === "ellipse" ? f.rx : f.hx;
      const hz = f.kind === "circle" ? f.r : f.kind === "ellipse" ? f.rz : f.hz;
      const a = pieceAngle(p);
      const c = Math.cos(a);
      const s = Math.sin(a);
      const shadow = SHADOWS[p.kind];
      const corners = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1];
      for (let v = 0; v < 6; v++) {
        const u = corners[v * 2] * (hx + SPREAD);
        const w = corners[v * 2 + 1] * (hz + SPREAD);
        quads.set([p.x + u * c + w * s, p.y + 0.012, p.z - u * s + w * c], (k * 6 + v) * 3);
        local.set([u, w], (k * 6 + v) * 2);
        shape.set([hx, hz, shadow.square ? 1 : 0, shadow.strength], (k * 6 + v) * 4);
      }
    });
    const shadows = new THREE.BufferGeometry();
    shadows.setAttribute("position", new THREE.BufferAttribute(quads, 3));
    shadows.setAttribute("local", new THREE.BufferAttribute(local, 2));
    shadows.setAttribute("shape", new THREE.BufferAttribute(shape, 4));
    shadows.computeBoundingSphere();
    this.#shadows.geometry.dispose();
    this.#shadows.geometry = shadows;
    this.#shadows.visible = pieces.length > 0;
  }
}
