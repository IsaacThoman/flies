// The wing: a flat blade in the shape of a Drosophila wing, its venation
// painted into a small mipmapped texture built in a typed array (no canvas:
// the Apple TV's 2D canvas is a thin shim). In the wing's own space x runs
// from the hinge to the tip (the wing is 1 long before scaling) and +y toward
// the leading edge.
//
// The veins are the fly's: the costa along the leading edge to just past the
// tip, the short subcosta, L1 meeting the costa a little before halfway, L2
// reaching the margin ahead of the tip, L3 ending at the tip, L4 just behind
// it, L5 to the hind margin, the faint L6 near the base, and the anterior and
// posterior crossveins between L3–L4 and L4–L5.

import * as THREE from "three";
import { WING, WING_COPIES } from "./anatomy.ts";

type P = readonly [number, number];

/** Leading edge from hinge to tip, then the hind margin back to the hinge. */
const OUTLINE: P[] = [
  [0, 0.012], [0.06, 0.04], [0.16, 0.075], [0.3, 0.105], [0.45, 0.13], [0.6, 0.145], [0.72, 0.148], [0.82, 0.138],
  [0.9, 0.115], [0.955, 0.08], [0.99, 0.035], [1, -0.01], [0.99, -0.055], [0.96, -0.1], [0.91, -0.145], [0.84, -0.185],
  [0.75, -0.215], [0.64, -0.235], [0.52, -0.24], [0.4, -0.232], [0.29, -0.21], [0.2, -0.175], [0.14, -0.15],
  // The alula and the lobes at the base.
  [0.11, -0.145], [0.08, -0.12], [0.05, -0.085], [0.025, -0.045], [0, -0.012],
];

const VEINS: { width: number; points: P[] }[] = [
  { width: 0.009, points: [[0, 0.012], [0.06, 0.04], [0.16, 0.075], [0.3, 0.105], [0.45, 0.13], [0.6, 0.145], [0.72, 0.148], [0.82, 0.138], [0.9, 0.115], [0.955, 0.08], [0.99, 0.035], [1, -0.005]] }, // costa
  { width: 0.005, points: [[0.03, 0.02], [0.12, 0.05], [0.2, 0.075]] }, // subcosta
  { width: 0.0065, points: [[0.03, 0.012], [0.15, 0.045], [0.3, 0.085], [0.42, 0.122]] }, // L1
  { width: 0.0055, points: [[0.2, 0.035], [0.4, 0.07], [0.6, 0.11], [0.74, 0.143]] }, // L2
  { width: 0.0055, points: [[0.2, 0.03], [0.4, 0.04], [0.6, 0.042], [0.8, 0.03], [1, -0.008]] }, // L3
  { width: 0.0055, points: [[0.04, -0.005], [0.2, -0.015], [0.4, -0.04], [0.6, -0.062], [0.8, -0.08], [0.955, -0.098]] }, // L4
  { width: 0.0055, points: [[0.05, -0.02], [0.2, -0.06], [0.38, -0.11], [0.56, -0.16], [0.7, -0.213]] }, // L5
  { width: 0.004, points: [[0.06, -0.035], [0.15, -0.09], [0.22, -0.13]] }, // L6
  { width: 0.0055, points: [[0.4, 0.04], [0.405, -0.04]] }, // anterior crossvein
  { width: 0.0055, points: [[0.62, -0.064], [0.6, -0.167]] }, // posterior crossvein
  { width: 0.004, points: [[0.75, -0.215], [0.64, -0.235], [0.52, -0.24], [0.4, -0.232], [0.29, -0.21], [0.2, -0.175], [0.14, -0.15]] }, // hind margin
];

/** Texture space: u = x, v maps y from -0.26 to 0.17. */
const Y0 = -0.26, Y1 = 0.17;

function distanceToSegment(px: number, py: number, a: P, b: P): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t);
}

/** The venation as RGBA: brown veins, a faintly smoky membrane that is all but clear. */
export function buildWingTexture(width = 256, height = 128): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  const vein = [104, 78, 50], membrane = [214, 222, 232];
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const x = (i + 0.5) / width, y = Y0 + ((j + 0.5) / height) * (Y1 - Y0);
      let v = 0;
      for (const { width: w, points } of VEINS) {
        for (let k = 0; k + 1 < points.length; k++) {
          const d = distanceToSegment(x, y, points[k], points[k + 1]);
          // Veins taper toward their ends and soften at the edge.
          const taper = w * (1 - 0.35 * x);
          v = Math.max(v, Math.min(1, Math.max(0, (taper - d) / (taper * 0.6))));
        }
      }
      // A faint grey toward the base, where the fine hairs are densest.
      const smoke = 0.2 + 0.08 * (1 - x);
      const a = smoke + (0.88 - smoke) * v;
      const o = (j * width + i) * 4;
      for (let c = 0; c < 3; c++) data[o + c] = Math.round(membrane[c] + (vein[c] - membrane[c]) * v);
      data[o + 3] = Math.round(a * 255);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Both wings, each as WING_COPIES copies of the blade. Copy c of the left
 * wing uses wing joint c, of the right wing WING_COPIES + c; at rest only
 * the first copy of each is visible, and the rest spread across the stroke
 * when the wings beat. Between neighbouring copies runs a strip joining
 * their mid-chord lines (each end on its own copy's joint), so the area the
 * wing sweeps fills in as a continuous haze rather than a row of ghosts.
 * Strip vertices carry `aFan` > 0, their share of the haze's opacity.
 */
export function buildWingGeometry(): THREE.BufferGeometry {
  const contour = OUTLINE.map(([x, y]) => new THREE.Vector2(x, y));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const position: number[] = [], normal: number[] = [], uv: number[] = [], joint: number[] = [], fan: number[] = [], index: number[] = [];
  for (let copy = 0; copy < 2 * WING_COPIES; copy++) {
    const base = position.length / 3;
    for (const [x, y] of OUTLINE) {
      position.push(x * WING.length, y * WING.length, 0);
      normal.push(0, 0, 1);
      uv.push(x, (y - Y0) / (Y1 - Y0));
      joint.push(copy);
      fan.push(0);
    }
    for (const [a, b, c] of triangles) index.push(base + a, base + b, base + c);
  }
  // The haze: spokes along each copy's mid-chord line, fainter at the hinge and the tip.
  const SPOKE: [number, number, number][] = [[0.06, 0.0, 0.3], [0.3, -0.05, 1], [0.6, -0.045, 1], [0.85, -0.02, 0.7], [0.99, 0, 0.35]];
  for (const side of [0, 1]) {
    for (let copy = 0; copy + 1 < WING_COPIES; copy++) {
      const base = position.length / 3;
      for (const c of [copy, copy + 1]) {
        for (const [x, y, a] of SPOKE) {
          position.push(x * WING.length, y * WING.length, 0);
          normal.push(0, 0, 1);
          uv.push(0.5, 0.98);
          joint.push(side * WING_COPIES + c);
          fan.push(a);
        }
      }
      const n = SPOKE.length;
      for (let i = 0; i + 1 < n; i++) index.push(base + i, base + n + i, base + i + 1, base + i + 1, base + n + i, base + n + i + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aJoint", new THREE.Float32BufferAttribute(joint, 1));
  g.setAttribute("aFan", new THREE.Float32BufferAttribute(fan, 1));
  g.setIndex(index);
  return g;
}
