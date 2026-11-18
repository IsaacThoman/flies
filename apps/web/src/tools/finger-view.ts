// How the fingertip looks (tools/finger.ts): skin laid along the table in
// exactly the shape the fly stands on, a nail on its back, the finger rising
// from the knuckle toward a hand out of the picture (fading out, as the hand's
// ring is a hand only where it meets the table), and a soft shadow under it.
// One mesh and one shadow: two draws, only while it is out.

import * as THREE from "three";
import { AWAY, FINGER_HALF_WIDTH as W, FINGER_LENGTH as L, FINGER_POWER as P, FINGER_THICKNESS as H, RISE_AT, RISE_LEAN, RISE_RADIUS, RISE_TOP, fingerHeight } from "./finger.ts";
import type { Finger } from "./finger.ts";
import { canvas2d, canvasTexture } from "../scene/build.ts";

/**
 * Light skin as it reflects, not as a photograph shows it: about 0.6 of red
 * light, a third of green and a quarter of blue (diffuse reflectance near
 * 650, 550 and 450 nm: Anderson & Parrish 1981, J. Invest. Dermatol. 77:13).
 * In linear colour (0.60, 0.33, 0.25), a fly's outer photoreceptors take 0.32
 * of a white's light from it (docs/simulation.md, The eyes), where a
 * photograph's skin colour (#eab39a, the finger's first) gave 0.43: brighter
 * to a fly than skin is.
 */
const SKIN = new THREE.Color("#cb9b89");
/** Toward its edges and its pad, where the skin is thinner over blood: redder. */
const FLUSH = new THREE.Color("#c4897c");
/** The nail over its pink bed, a little brighter than skin, and its free edge, pale keratin. */
const NAIL = new THREE.Color("#d4aaa2");
const NAIL_EDGE = new THREE.Color("#e7dace");
const CREASE = new THREE.Color("#b38173");
/** Where the nail is on its back: from near the tip (negative is round the tip) back to its cuticle, and how far across. */
const NAIL_FRONT = -W * 0.72;
const NAIL_BACK = 9;
const NAIL_HALF = W * 0.6;
/** The rising finger fades out over its top: the rest of the hand is the player's. */
const FADE_FROM = 70;

/** A growing indexed mesh: positions, normals and colours with alpha. */
class Builder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly index: number[] = [];

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, color: THREE.Color, alpha = 1) {
    const l = Math.hypot(nx, ny, nz) || 1;
    this.positions.push(x, y, z);
    this.normals.push(nx / l, ny / l, nz / l);
    this.colors.push(color.r, color.g, color.b, alpha);
    return this.positions.length / 3 - 1;
  }

  /** Quads over a grid of vertices made by `vertex`, `rows` × `columns`, starting at `first`. */
  grid(first: number, rows: number, columns: number, flip = false) {
    for (let r = 0; r + 1 < rows; r++) {
      for (let c = 0; c + 1 < columns; c++) {
        const a = first + r * columns + c;
        const b = a + 1;
        const d = a + columns;
        const e = d + 1;
        if (flip) this.index.push(a, b, d, b, e, d);
        else this.index.push(a, d, b, b, d, e);
      }
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 4));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
}

const scratch = new THREE.Color();

/** The skin's colour at a point on its back: the nail, its pale free edge, the creases over the knuckle, and redder toward its edges. */
function skinAt(along: number, lateral: number, y: number): THREE.Color {
  const c = scratch.copy(SKIN).lerp(FLUSH, Math.min(1, Math.max(0, 1 - y / (H * 0.55))) * 0.7);
  // The nail: a rounded oblong on its back, its free edge pale over the tip.
  const nu = lateral / NAIL_HALF;
  const nv = (along - (NAIL_FRONT + NAIL_BACK) / 2) / ((NAIL_BACK - NAIL_FRONT) / 2);
  const nail = Math.pow(Math.abs(nu), 4) + Math.pow(Math.abs(nv), 4);
  if (nail < 1) {
    c.lerp(NAIL, Math.min(1, (1 - nail) * 6));
    if (along < NAIL_FRONT + 2.2) c.lerp(NAIL_EDGE, Math.min(1, (NAIL_FRONT + 2.2 - along) / 1.2));
  }
  // Fine creases across its back over the knuckle.
  const crease = along - (L - 5);
  if (crease > -2.5 && crease < 2.5 && Math.abs(lateral) < W * 0.75) {
    const line = Math.abs(Math.sin(crease * 3.4));
    if (line < 0.25) c.lerp(CREASE, (0.25 - line) * 2.2);
  }
  return c;
}

/** The finger's skin, from its tip back to the knuckle, as the fly feels it, and its underside; in the finger's own frame (x across to its left, z back toward the hand, y up from its underside). */
function lyingSkin(b: Builder) {
  const slope = (r2: number, d: number) => (r2 >= 1 ? 0 : (-H * P * Math.pow(1 - r2, P - 1) * 2 * d) / (W * W));
  const rings = 14;
  const around = 28;
  // The tip: half a dome round its front.
  const tip = b.positions.length / 3;
  for (let i = 0; i <= rings; i++) {
    const s = 1 - i / rings;
    for (let j = 0; j <= around; j++) {
      const a = (j / around) * Math.PI;
      const lateral = W * s * Math.cos(a);
      const along = -W * s * Math.sin(a);
      const y = Math.max(0, fingerHeight(along, lateral));
      const r2 = s * s;
      b.vertex(lateral, y, along, -slope(r2, lateral), 1, -slope(r2, along), skinAt(along, lateral, y));
    }
  }
  b.grid(tip, rings + 1, around + 1, true);
  // Along its length: the same section all the way, matching the tip's edges at its middle.
  const lengthwise = 40;
  const across = 2 * rings + 1;
  const shaft = b.positions.length / 3;
  for (let i = 0; i <= lengthwise; i++) {
    const along = (L * i) / lengthwise;
    for (let j = 0; j < across; j++) {
      const s = j <= rings ? 1 - j / rings : (j - rings) / rings;
      const lateral = (j <= rings ? 1 : -1) * W * s;
      const y = Math.max(0, fingerHeight(along, lateral));
      b.vertex(lateral, y, along, -slope(s * s, lateral), 1, 0, skinAt(along, lateral, y));
    }
  }
  b.grid(shaft, lengthwise + 1, across, true);
  // Its end at the knuckle, mostly inside the rising finger.
  const end = b.vertex(0, H * 0.3, L, 0, 0, 1, FLUSH);
  const first = shaft + lengthwise * across;
  for (let j = 0; j + 1 < across; j++) b.index.push(end, first + j, first + j + 1);
  // The pad underneath, flat: seen only when it is lifted.
  const pad = b.vertex(0, 0, L / 2, 0, -1, 0, FLUSH);
  const outline: number[] = [];
  for (let j = 0; j <= around; j++) {
    const a = (j / around) * Math.PI;
    outline.push(b.vertex(W * Math.cos(a), 0, -W * Math.sin(a), 0, -1, 0, FLUSH));
  }
  outline.push(b.vertex(-W, 0, L, 0, -1, 0, FLUSH), b.vertex(W, 0, L, 0, -1, 0, FLUSH), outline[0]);
  for (let j = 0; j + 1 < outline.length; j++) b.index.push(pad, outline[j + 1], outline[j]);
}

/** The finger rising from the knuckle toward the hand, leaning back, its foot rounded where it bends onto the table, fading out above. */
function risingFinger(b: Builder) {
  const around = 24;
  const heights = [0, 0.6, 1.5, 3, 5, 8, 12, 18, 26, 36, 48, 60, FADE_FROM, 90, 110, 135, RISE_TOP];
  const lean = Math.tan(RISE_LEAN);
  const first = b.positions.length / 3;
  for (const y of heights) {
    // Rounded at its foot: a knuckle bent onto the table.
    const foot = y < 6 ? Math.sqrt(1 - Math.pow((6 - y) / 6, 2)) * 0.45 + 0.55 : 1;
    const r = RISE_RADIUS * foot * (1 + 0.07 * Math.min(1, y / 60));
    const alpha = y <= FADE_FROM ? 1 : Math.max(0, 1 - (y - FADE_FROM) / (RISE_TOP - FADE_FROM));
    const back = RISE_AT + lean * y;
    for (let j = 0; j <= around; j++) {
      const a = (j / around) * Math.PI * 2;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      // Its back (toward +z is its underside, rising toward the hand) and the creases over the knuckle.
      let c = scratch.copy(SKIN).lerp(FLUSH, Math.max(0, nz) * 0.35);
      if (y > 2 && y < 14 && nz < 0.2) {
        const line = Math.abs(Math.sin(y * 2.2));
        if (line < 0.2) c = c.lerp(CREASE, (0.2 - line) * 2.5);
      }
      b.vertex(nx * r, y, back + nz * r, nx, y < 6 ? -(6 - y) / 6 : 0, nz, c, alpha);
    }
  }
  b.grid(first, heights.length, around + 1);
}

function shadowTexture() {
  const { canvas, g } = canvas2d(64, 128);
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, "rgba(20, 30, 50, 0)");
  grad.addColorStop(0.3, "rgba(20, 30, 50, 0.6)");
  grad.addColorStop(0.7, "rgba(20, 30, 50, 0.6)");
  grad.addColorStop(1, "rgba(20, 30, 50, 0)");
  g.fillStyle = grad;
  // Rounded at the tip's end (the top of the texture), soft along its length.
  g.beginPath();
  g.ellipse(32, 32, 32, 32, 0, Math.PI, 0);
  g.lineTo(64, 128);
  g.lineTo(0, 128);
  g.closePath();
  g.fill();
  return canvasTexture(canvas);
}

export class FingerView {
  readonly mesh: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  #shadowMaterial: THREE.MeshBasicMaterial;

  constructor(parent: THREE.Object3D) {
    const b = new Builder();
    lyingSkin(b);
    risingFinger(b);
    // Skin is soft and a little waxy; the hand above fades out with a dither, so it needs no sorting and writes depth.
    this.mesh = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, alphaHash: true }));
    this.mesh.visible = false;
    parent.add(this.mesh);
    // A soft shadow under its length, darker and smaller the nearer it is to what is under it.
    this.#shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), this.#shadowMaterial);
    this.shadow.renderOrder = 2;
    this.shadow.visible = false;
    parent.add(this.shadow);
  }

  /** The finger and its shadow: what the fly's eyes see of it. */
  get seen(): THREE.Object3D[] {
    return [this.mesh, this.shadow];
  }

  update(finger: Finger, floorAt: (x: number, z: number, below: number) => number) {
    const shown = finger.present;
    this.mesh.visible = shown;
    this.shadow.visible = shown;
    if (!shown) return;
    const t = finger.tip;
    this.mesh.position.set(t.x, t.y, t.z);
    this.mesh.rotation.y = finger.yaw;
    // On what is under its tip, the finger itself left out (its skin is above its underside).
    const floor = floorAt(t.x, t.z, t.y + 1e-3);
    const height = Math.max(0, t.y - floor);
    const k = Math.min(1, height / AWAY);
    const spread = 1 + k * 0.8;
    this.shadow.position.set(t.x, floor + 0.04, t.z);
    this.shadow.rotation.y = finger.yaw;
    // From round its tip back to the knuckle, a little wider than it as it lifts.
    this.shadow.scale.set(W * 2.3 * spread, 1, (L + W * 2) * (1 + k * 0.3));
    this.shadow.position.x -= Math.sin(finger.yaw) * W * spread;
    this.shadow.position.z -= Math.cos(finger.yaw) * W * spread;
    this.#shadowMaterial.opacity = 0.75 * (1 - k * 0.8);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.shadow.geometry.dispose();
    this.#shadowMaterial.map?.dispose();
    this.#shadowMaterial.dispose();
    this.mesh.removeFromParent();
    this.shadow.removeFromParent();
  }
}
