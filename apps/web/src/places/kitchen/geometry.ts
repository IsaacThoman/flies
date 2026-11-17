import * as THREE from "three";
import { topHeight, topNormal } from "@fly/world";
import type { Solid } from "@fly/world";

export const box = (
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
export const lathe = (
  profile: number[][],
  x: number,
  z: number,
  segments = 64,
) =>
  new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  ).translate(x, 0, z);

/** Polar samples use the very height and normal the feet meet. */
export function surface(s: Solid, rings = 48, segments = 64) {
  const f = s.footprint;
  if (f.kind === "box") throw new Error("round surface required");
  const rx = f.kind === "circle" ? f.r : f.rx;
  const rz = f.kind === "circle" ? f.r : f.rz;
  const angle = f.kind === "circle" ? 0 : f.angle;
  const pos: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const n = { x: 0, y: 1, z: 0 };
  for (let i = 0; i <= rings; i++)
    for (let j = 0; j <= segments; j++) {
      const r = Math.min(0.999999, i / rings),
        a = (j / segments) * Math.PI * 2;
      const u = Math.cos(a) * r * rx,
        v = Math.sin(a) * r * rz;
      const x = f.x + u * Math.cos(angle) + v * Math.sin(angle),
        z = f.z - u * Math.sin(angle) + v * Math.cos(angle);
      pos.push(x, topHeight(s, x, z), z);
      topNormal(s, x, z, n);
      normals.push(n.x, n.y, n.z);
    }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j,
        b = a + segments + 1;
      indices.push(a, b + 1, b, a, a + 1, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(indices);
  return g;
}
