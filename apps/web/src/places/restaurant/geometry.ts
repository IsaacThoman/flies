// Shapes for building the restaurant in code. Painted, tagged geometry for
// the materials (kinds.ts), and any solid of the world as a mesh at exactly
// its felt shape and height: the far stand-ins are these, and much of the
// near detail is built round them.

import * as THREE from "three";
import { topHeight, topNormal } from "@fly/world";
import type { Solid } from "@fly/world";
import { paint } from "../../scene/build.ts";
import type { ColorFn } from "../../scene/build.ts";
import { tag } from "../bar/materials.ts";
import { AREA_STRIDE } from "./kinds.ts";

export { lathe, puddle, ringPuddle, scatter, sweepRect } from "../bar/geometry.ts";

/** Painted and tagged in one go, and for a stand-in, which area it stands in for. */
export function part(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation | ColorFn, kind: number, area = 0) {
  return tag(paint(geometry, color), kind + AREA_STRIDE * area);
}

/** A box between two corners. */
export const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

/**
 * A solid's top as a grid over its footprint, at exactly its height (never
 * below its underside), its side walls down to its underside, and that
 * underside when it has air beneath: what the fly meets, as a mesh. A piece
 * of a long solid gives its own footprint and the whole one's `shape`.
 */
export function solidGeometry(solid: Solid, segments: number, rings = 4, shape: Solid = solid): THREE.BufferGeometry {
  const f = solid.footprint;
  const bottom = solid.bottom ?? 0;
  const positions: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  const n = { x: 0, y: 1, z: 0 };
  const angle = f.kind === "circle" ? 0 : f.angle;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const toWorld = (u: number, v: number) => [f.x + u * c + v * s, f.z - u * s + v * c] as const;
  // A piece of a long solid takes its heights from the whole of it.
  const height = (x: number, z: number) => Math.max(bottom, topHeight(shape, x, z));
  const vertex = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    return positions.length / 3 - 1;
  };
  // The rim, round the edge: points (u, v) in order, with their outward normals.
  const rim: { u: number; v: number; nu: number; nv: number }[] = [];
  if (f.kind === "box") {
    const flat = solid.top.kind === "flat";
    const steps = flat ? 1 : Math.max(2, Math.round(segments / 4));
    const grid: number[][] = [];
    for (let i = 0; i <= steps; i++) {
      const row: number[] = [];
      for (let j = 0; j <= steps; j++) {
        const u = f.hx * (-1 + (2 * j) / steps) * 0.9995;
        const v = f.hz * (-1 + (2 * i) / steps) * 0.9995;
        const [x, z] = toWorld(u, v);
        topNormal(shape, x, z, n);
        row.push(vertex(x, height(x, z), z, n.x, n.y, n.z));
      }
      grid.push(row);
    }
    for (let i = 0; i < steps; i++) for (let j = 0; j < steps; j++) index.push(grid[i][j], grid[i + 1][j], grid[i][j + 1], grid[i][j + 1], grid[i + 1][j], grid[i + 1][j + 1]);
    // Round the edge from +x toward +z, as the circles go: each side's points with its normal.
    for (let i = 0; i < steps; i++) rim.push({ u: f.hx, v: f.hz * (-1 + (2 * i) / steps), nu: 1, nv: 0 });
    for (let j = 0; j < steps; j++) rim.push({ u: f.hx * (1 - (2 * j) / steps), v: f.hz, nu: 0, nv: 1 });
    for (let i = 0; i < steps; i++) rim.push({ u: -f.hx, v: f.hz * (1 - (2 * i) / steps), nu: -1, nv: 0 });
    for (let j = 0; j < steps; j++) rim.push({ u: f.hx * (-1 + (2 * j) / steps), v: -f.hz, nu: 0, nv: -1 });
  } else {
    const rx = f.kind === "circle" ? f.r : f.rx;
    const rz = f.kind === "circle" ? f.r : f.rz;
    const flat = solid.top.kind === "flat";
    const count = flat ? 1 : rings;
    const centre = vertex(f.x, height(f.x, f.z), f.z, 0, 1, 0);
    const ring: number[][] = [];
    for (let i = 1; i <= count; i++) {
      const sv = Math.min(0.9995, i / count);
      const row: number[] = [];
      for (let j = 0; j < segments; j++) {
        const th = (j / segments) * Math.PI * 2;
        const [x, z] = toWorld(Math.cos(th) * rx * sv, Math.sin(th) * rz * sv);
        topNormal(shape, x, z, n);
        row.push(vertex(x, height(x, z), z, n.x, n.y, n.z));
      }
      ring.push(row);
    }
    for (let j = 0; j < segments; j++) {
      const k = (j + 1) % segments;
      index.push(centre, ring[0][k], ring[0][j]);
      for (let i = 0; i < count - 1; i++) index.push(ring[i][j], ring[i][k], ring[i + 1][j], ring[i + 1][j], ring[i][k], ring[i + 1][k]);
    }
    for (let j = 0; j < segments; j++) {
      const th = (j / segments) * Math.PI * 2;
      const nu = Math.cos(th) / rx;
      const nv = Math.sin(th) / rz;
      const l = Math.hypot(nu, nv);
      rim.push({ u: Math.cos(th) * rx, v: Math.sin(th) * rz, nu: nu / l, nv: nv / l });
    }
  }
  // The sides, from the underside up to the top's edge, each edge's own two points so the corners stay sharp.
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i];
    const b = rim[(i + 1) % rim.length];
    const square = f.kind === "box";
    const [ax, az] = toWorld(a.u * 0.9995, a.v * 0.9995);
    const [bx, bz] = toWorld(b.u * 0.9995, b.v * 0.9995);
    const [nax, naz] = [a.nu * c + a.nv * s, -a.nu * s + a.nv * c];
    const [nbx, nbz] = square ? [nax, naz] : [b.nu * c + b.nv * s, -b.nu * s + b.nv * c];
    const ha = height(ax, az);
    const hb = height(bx, bz);
    if (ha - bottom < 0.01 && hb - bottom < 0.01) continue;
    const a0 = vertex(ax, bottom, az, nax, 0, naz);
    const a1 = vertex(ax, ha, az, nax, 0, naz);
    const b0 = vertex(bx, bottom, bz, nbx, 0, nbz);
    const b1 = vertex(bx, hb, bz, nbx, 0, nbz);
    index.push(a0, a1, b0, b0, a1, b1);
  }
  // The underside, where there is air beneath.
  if (bottom > 0.5) {
    const middle = vertex(f.x, bottom, f.z, 0, -1, 0);
    const first = positions.length / 3;
    for (const p of rim) {
      const [x, z] = toWorld(p.u * 0.9995, p.v * 0.9995);
      vertex(x, bottom, z, 0, -1, 0);
    }
    for (let i = 0; i < rim.length; i++) index.push(middle, first + ((i + 1) % rim.length), first + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(index);
  return geometry;
}

/** How many segments round a solid of this size, far off or close up. */
export function segmentsFor(r: number, near: boolean) {
  if (near) return r < 6 ? 10 : r < 30 ? 20 : r < 80 ? 32 : r < 200 ? 48 : 72;
  return r < 10 ? 4 : r < 30 ? 6 : r < 80 ? 8 : r < 200 ? 12 : 24;
}

/** A solid's footprint's size, for choosing how finely to build it. */
export function footprintSize(solid: Solid) {
  const f = solid.footprint;
  return f.kind === "circle" ? f.r : f.kind === "ellipse" ? Math.max(f.rx, f.rz) : Math.max(f.hx, f.hz);
}
