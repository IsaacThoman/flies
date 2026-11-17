import * as THREE from "three";
import { topHeight } from "@fly/world";
import type { Solid } from "@fly/world";

/** Cupped rosettes stay within a fifth of a millimetre of the solid crown. */
export function foliage(crown: Solid) {
  const f = crown.footprint;
  if (f.kind === "box") throw new Error("A crown is round");
  const rx = f.kind === "circle" ? f.r : f.rx, rz = f.kind === "circle" ? f.r : f.rz;
  const angle = f.kind === "circle" ? 0 : f.angle;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const tint = new THREE.Color();
  for (let ring = 0; ring < 3; ring++) {
    const count = 5 + ring * 3;
    for (let leaf = 0; leaf < count; leaf++) {
      const a = leaf / count * Math.PI * 2 + ring * 0.57;
      tint.setHSL(0.24 + (leaf % 3) * 0.009, 0.4, 0.26 + (leaf % 4) * 0.017).convertSRGBToLinear();
      const vertex = (i: number, j: number) => {
        const u = i / 8, w = j / 4 * 2 - 1;
        const r = ring * 0.2 + u * (0.65 - ring * 0.025);
        const width = Math.pow(Math.sin(u * Math.PI), 0.75) * 0.22;
        let x = Math.cos(a) * r - Math.sin(a) * w * width;
        let z = Math.sin(a) * r + Math.cos(a) * w * width;
        const k = Math.min(1, 0.997 / Math.hypot(x, z)); x *= k; z *= k;
        const px = f.x + x * rx * Math.cos(angle) + z * rz * Math.sin(angle);
        const pz = f.z - x * rx * Math.sin(angle) + z * rz * Math.cos(angle);
        positions.push(px, topHeight(crown, px, pz) + 0.1 - Math.abs(w) * 0.15, pz);
        colors.push(tint.r, tint.g, tint.b);
      };
      const base = positions.length / 3;
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) vertex(i,j);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
        const a = base+i*5+j, b=a+5;
        indices.push(a,a+1,b+1,a,b+1,b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors,3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const plain = g.toNonIndexed();
  g.dispose();
  return plain;
}
