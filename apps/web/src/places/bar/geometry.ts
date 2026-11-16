// Shapes for building the bar in code, cheaply: JavaScript on the Apple TV is
// slow, so many small things (drops, grains of salt, specks) are baked into
// one buffer straight from a single template rather than built one by one.

import * as THREE from "three";
import { topHeight, topNormal } from "@fly/world";
import type { Solid } from "@fly/world";
import { paint } from "../../scene/build.ts";
import type { ColorFn } from "../../scene/build.ts";
import { tag } from "./materials.ts";

/** Painted and tagged in one go: what `Batch` takes. */
export function part(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation | ColorFn, kind: number) {
  return tag(paint(geometry, color), kind);
}

/** A lathe from (radius, height) pairs, bottom to top on the outside: faces outward and up. */
export function lathe(profile: readonly (readonly [number, number])[], segments: number, x = 0, z = 0) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), segments).translate(x, 0, z);
}

/**
 * A profile (out from the edge, and up) swept round a rectangle's edge, its
 * corners turned round: the counter's rounded nose, the bevel of a board.
 */
export function sweepRect(hx: number, hz: number, profile: readonly (readonly [number, number])[], cornerSteps = 6) {
  const path: { x: number; z: number; nx: number; nz: number }[] = [];
  const corners = [
    [hx, hz, 0],
    [hx, -hz, -Math.PI / 2],
    [-hx, -hz, Math.PI],
    [-hx, hz, Math.PI / 2],
  ] as const;
  for (const [cx, cz, start] of corners) {
    for (let i = 0; i <= cornerSteps; i++) {
      const a = start + ((i / cornerSteps) * Math.PI) / 2;
      // Outward normal turning clockwise seen from above, from +z round to +x and on.
      path.push({ x: cx, z: cz, nx: Math.sin(a), nz: Math.cos(a) });
    }
  }
  path.push(path[0]);
  const positions: number[] = [];
  const index: number[] = [];
  const rows = profile.length;
  for (const p of path) for (const [o, y] of profile) positions.push(p.x + p.nx * o, y, p.z + p.nz * o);
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j;
      const b = (i + 1) * rows + j;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** The top of a solid as a mesh: a polar grid over its footprint at exactly its height, so what is drawn is what the fly stands on. */
export function topGeometry(solid: Solid, rings: number, segments: number, lower = 0) {
  const f = solid.footprint;
  if (f.kind === "box") throw new Error("Boxes are flat");
  const rx = f.kind === "circle" ? f.r : f.rx;
  const rz = f.kind === "circle" ? f.r : f.rz;
  const angle = f.kind === "circle" ? 0 : f.angle;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const positions: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  const n = { x: 0, y: 1, z: 0 };
  positions.push(f.x, topHeight(solid, f.x, f.z) - lower, f.z);
  normals.push(0, 1, 0);
  for (let i = 1; i <= rings; i++) {
    const sv = Math.min(0.9995, i / rings);
    for (let j = 0; j < segments; j++) {
      const th = (j / segments) * Math.PI * 2;
      const u = Math.cos(th) * rx * sv;
      const v = Math.sin(th) * rz * sv;
      const x = f.x + u * c + v * s;
      const z = f.z - u * s + v * c;
      topNormal(solid, x, z, n);
      positions.push(x, topHeight(solid, x, z) - lower, z);
      normals.push(n.x, n.y, n.z);
    }
  }
  const at = (i: number, j: number) => (i === 0 ? 0 : 1 + (i - 1) * segments + (j % segments));
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      if (i === 0) index.push(0, at(1, j + 1), at(1, j));
      else index.push(at(i, j), at(i + 1, j + 1), at(i + 1, j), at(i, j), at(i, j + 1), at(i + 1, j + 1));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(index);
  return geometry;
}

/**
 * Many copies of one small shape baked into one geometry, each placed by a
 * matrix and coloured: position, normal, colour and kind, ready to batch.
 */
export function scatter(template: THREE.BufferGeometry, placements: readonly { matrix: THREE.Matrix4; color: THREE.Color }[], kind: number) {
  const base = template.index ? template.toNonIndexed() : template;
  if (!base.attributes.normal) base.computeVertexNormals();
  const tp = base.attributes.position.array as Float32Array;
  const tn = base.attributes.normal.array as Float32Array;
  const count = tp.length / 3;
  const positions = new Float32Array(count * 3 * placements.length);
  const normals = new Float32Array(count * 3 * placements.length);
  const colors = new Float32Array(count * 3 * placements.length);
  const normalMatrix = new THREE.Matrix3();
  const v = new THREE.Vector3();
  placements.forEach(({ matrix, color }, k) => {
    normalMatrix.getNormalMatrix(matrix);
    const o = k * count * 3;
    for (let i = 0; i < count * 3; i += 3) {
      v.set(tp[i], tp[i + 1], tp[i + 2]).applyMatrix4(matrix);
      positions[o + i] = v.x;
      positions[o + i + 1] = v.y;
      positions[o + i + 2] = v.z;
      v.set(tn[i], tn[i + 1], tn[i + 2]).applyMatrix3(normalMatrix).normalize();
      normals[o + i] = v.x;
      normals[o + i + 1] = v.y;
      normals[o + i + 2] = v.z;
      colors[o + i] = color.r;
      colors[o + i + 1] = color.g;
      colors[o + i + 2] = color.b;
    }
  });
  if (base !== template) base.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return tag(geometry, kind);
}

/** A thin puddle with a rounded edge, wobbling round (x, z): smooth even at a fly's scale. */
export function puddle(x: number, z: number, r: number, wobble: number, depth = 0.15, bevel = 0.35) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const rr = r * (1 + Math.sin(a * 3 + wobble) * 0.12 + Math.sin(a * 5 + wobble * 2) * 0.06);
    if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 1.8, bevelSegments: 4, curveSegments: 1 }).rotateX(-Math.PI / 2).translate(x, 0.02, z);
}

/** A ring of something spilt (the syrup a glass left), thicker in places, broken here and there. */
export function ringPuddle(x: number, z: number, r: number, width: number, seed: number) {
  const outer = new THREE.Shape();
  const hole = new THREE.Path();
  const steps = 120;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const swell = 1 + 0.5 * Math.max(0, Math.sin(a * 3 + seed)) + 0.9 * Math.exp(-((a - Math.PI / 2) ** 2) * 6);
    const ro = r + width * 0.5 * swell + Math.sin(a * 7 + seed) * 0.3;
    const ri = r - width * 0.5 * (0.6 + 0.4 * Math.sin(a * 5 + seed * 2));
    if (i === 0) {
      outer.moveTo(Math.cos(a) * ro, Math.sin(a) * ro);
      hole.moveTo(Math.cos(-a) * ri, Math.sin(-a) * ri);
    } else {
      outer.lineTo(Math.cos(a) * ro, Math.sin(a) * ro);
      hole.lineTo(Math.cos(-a) * ri, Math.sin(-a) * ri);
    }
  }
  outer.holes.push(hole);
  return new THREE.ExtrudeGeometry(outer, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.5, bevelSegments: 3, curveSegments: 1 }).rotateX(-Math.PI / 2).translate(x, 0.02, z);
}
