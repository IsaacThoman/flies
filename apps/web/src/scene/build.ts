// Helpers for building the world in code: coloured geometry, merged into as
// few meshes as possible. Every mesh three.js draws costs JavaScript each
// frame, which on the Apple TV (no JIT) is the main cost of a scene, so the
// static world is a handful of merged meshes with vertex colours, and its
// matrices are frozen.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type ColorFn = (position: THREE.Vector3, normal: THREE.Vector3) => THREE.ColorRepresentation | THREE.Color;

const tmpP = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpC = new THREE.Color();

/** Gives every vertex a colour (a constant, or a function of its position and normal), as non-indexed geometry with position, normal and color only. */
export function paint(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation | ColorFn): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const fixed = typeof color === "function" ? null : tmpC.set(color).clone();
  for (let i = 0; i < pos.count; i++) {
    let c: THREE.Color;
    if (fixed) c = fixed;
    else {
      tmpP.fromBufferAttribute(pos, i);
      tmpN.fromBufferAttribute(nor, i);
      const v = (color as ColorFn)(tmpP, tmpN);
      c = v instanceof THREE.Color ? v : tmpC.set(v);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Collects painted pieces by material and merges each lot into one mesh. */
export class Batch {
  #pieces = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(material: THREE.Material, geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4) {
    if (matrix) geometry.applyMatrix4(matrix);
    let list = this.#pieces.get(material);
    if (!list) this.#pieces.set(material, (list = []));
    list.push(geometry);
  }

  /** One frozen mesh per material, added to `parent`. */
  build(parent: THREE.Object3D, settings: { renderOrder?: Map<THREE.Material, number> } = {}): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const [material, list] of this.#pieces) {
      const geometry = list.length === 1 ? list[0] : mergeGeometries(list);
      if (list.length > 1) for (const g of list) g.dispose();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = settings.renderOrder?.get(material) ?? 0;
      freeze(mesh);
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.#pieces.clear();
    return meshes;
  }
}

/** Frees everything under `root` on the GPU, textures too: a place the fly has been carried away from. */
export function disposeAll(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      // A material extended as it compiles keeps its own uniforms in userData (places/restaurant/materials.ts `patch`): their textures go too.
      for (const uniforms of [(material as THREE.ShaderMaterial).uniforms, material.userData.uniforms as Record<string, THREE.IUniform> | undefined]) {
        if (uniforms) for (const u of Object.values(uniforms)) if (u.value instanceof THREE.Texture) u.value.dispose();
      }
      material.dispose();
    }
  });
}

/** Stops three.js recomputing a static object's matrices every frame. */
export function freeze(object: THREE.Object3D) {
  object.updateMatrix();
  object.matrixAutoUpdate = false;
  object.updateMatrixWorld(true);
  object.matrixWorldAutoUpdate = false;
}

export const mat4 = (position: THREE.Vector3Like, rotation: THREE.Euler = new THREE.Euler(), scale: THREE.Vector3Like = { x: 1, y: 1, z: 1 }) =>
  new THREE.Matrix4().compose(new THREE.Vector3(position.x, position.y, position.z), new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(scale.x, scale.y, scale.z));

/** A deterministic random stream. */
export function random(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (lo: number, hi: number) => lo + (hi - lo) * next() };
}

/** A canvas for building a texture. */
export function canvas2d(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("No 2D canvas");
  return { canvas, g };
}

export function canvasTexture(canvas: HTMLCanvasElement, { repeat = false, srgb = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 1;
  texture.needsUpdate = true;
  return texture;
}
