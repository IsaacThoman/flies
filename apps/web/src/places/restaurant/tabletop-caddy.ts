// The sugar caddy on the start table: a chromed wire rack, and in it paper
// packets standing on end, white, brown and pink, each its own pillow of
// sugar crimped shut at both ends. They were pushed in by hand, so they lean
// a little apart, fanned toward the rack's ends, with gaps between: from a
// fly's height they are a row of packets, not a block. Their crimped tops
// are the world's flat top; the rack's wires stand at its footprint's edge.

import * as THREE from "three";
import type { Solid } from "@fly/world";
import { mat4, random } from "../../scene/build.ts";
import type { Builder } from "./builder.ts";
import { KIND } from "./kinds.ts";
import { PACKET, TOP } from "./tabletop-glsl.ts";
import { copies, tube } from "./tabletop-shapes.ts";

/** How thick a full packet is through its middle, and the wire the rack is bent from (radius). */
const THICK = 4.6;
const WIRE = 0.65;

/**
 * One packet, standing on its bottom seal's middle, its faces toward ±x:
 * two sheets of paper pressed together at the seals, swelling round the
 * sugar between, closing to a fold at each side. Its colour carries where
 * on it each vertex is (across, up) for the print (tabletop-glsl.ts).
 */
function packet() {
  const { across: W, up: H, seal: S } = PACKET;
  const cols = [-1, -0.95, -0.78, -0.42, 0, 0.42, 0.78, 0.95, 1];
  const ys = [0, S - 0.3, S, S + 1.5, S + 4, H / 2, H - S - 4, H - S - 1.5, H - S, H - S + 0.3, H];
  const seal = 0.16;
  // Half the thickness: the seals pressed thin, the body swelling to its middle, the sides folded round.
  const half = (a: number, y: number) => {
    const into = Math.min(y - S, H - S - y);
    const body = into <= 0 ? 0 : Math.sin(Math.min(1, into / 4.5) * (Math.PI / 2)) * (0.86 + 0.14 * Math.sin((Math.PI * y) / H));
    const side = Math.sqrt(Math.max(0, 1 - a ** 6));
    return seal + (THICK / 2 - seal) * body * side;
  };
  const pos: number[] = [];
  const rgb: number[] = [];
  const index: number[] = [];
  const C = cols.length;
  // A grid of vertices for each face, shared so the paper is smooth.
  const start = (face: number) => (face > 0 ? 0 : ys.length * C);
  for (const face of [1, -1]) {
    for (const y of ys) {
      for (const a of cols) {
        pos.push(face * half(a, y), y, (a * W) / 2);
        rgb.push((a + 1) / 2, y / H, 0);
      }
    }
  }
  const quad = (p: number, q: number, r: number, s: number) => index.push(p, q, r, p, r, s);
  for (const face of [1, -1]) {
    const o = start(face);
    for (let i = 0; i < ys.length - 1; i++) {
      for (let j = 0; j < C - 1; j++) {
        const v = o + i * C + j;
        // Wound to face out on either side.
        if (face > 0) quad(v, v + C, v + C + 1, v + 1);
        else quad(v, v + 1, v + C + 1, v + C);
      }
    }
  }
  // The folds at the sides, and the seals' edges at the top and bottom.
  for (let i = 0; i < ys.length - 1; i++) {
    const f0 = start(1) + i * C;
    const b0 = start(-1) + i * C;
    quad(f0, b0, b0 + C, f0 + C);
    quad(f0 + C - 1, f0 + 2 * C - 1, b0 + 2 * C - 1, b0 + C - 1);
  }
  const last = (ys.length - 1) * C;
  for (let j = 0; j < C - 1; j++) {
    quad(start(1) + last + j, start(-1) + last + j, start(-1) + last + j + 1, start(1) + last + j + 1);
    quad(start(1) + j, start(1) + j + 1, start(-1) + j + 1, start(-1) + j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry.toNonIndexed();
}

/** A rectangle with rounded corners at height y, as points round it. */
function loop(hx: number, hz: number, r: number, y: number) {
  const out: THREE.Vector3[] = [];
  const corners = [[hx - r, hz - r, 0], [-hx + r, hz - r, Math.PI / 2], [-hx + r, -hz + r, Math.PI], [hx - r, -hz + r, (3 * Math.PI) / 2]] as const;
  for (const [cx, cz, a0] of corners) for (let k = 0; k <= 4; k++) {
    const a = a0 + (k / 4) * (Math.PI / 2);
    out.push(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
  }
  return out;
}

export function sugarCaddy(b: Builder, area: number, solid: Solid) {
  const f = solid.footprint as { x: number; z: number; hx: number; hz: number; angle: number };
  const top = (solid.top as { y: number }).y;
  const ground = solid.bottom ?? 0;
  const place = mat4({ x: f.x, y: 0, z: f.z }, new THREE.Euler(0, f.angle, 0));
  const steel = "#eceef0";
  // The rack: a frame on the table, three wires along it that the packets stand on, a frame round their shoulders, and posts between.
  const ox = f.hx - WIRE;
  const oz = f.hz - WIRE;
  const floor = ground + WIRE * 3;
  const high = top - 20;
  const wires: THREE.BufferGeometry[] = [tube(loop(ox, oz, 5, ground + WIRE - 0.1), WIRE, 6, true), tube(loop(ox, oz, 5, high), WIRE, 6, true)];
  for (const z of [-oz * 0.62, 0, oz * 0.62]) wires.push(tube([new THREE.Vector3(-ox, floor - WIRE, z), new THREE.Vector3(ox, floor - WIRE, z)], WIRE, 6));
  const posts: [number, number][] = [[ox - 5, oz], [-ox + 5, oz], [ox - 5, -oz], [-ox + 5, -oz], [14, oz], [-14, oz], [14, -oz], [-14, -oz], [ox, 0], [-ox, 0]];
  for (const [x, z] of posts) wires.push(tube([new THREE.Vector3(x, ground + WIRE, z), new THREE.Vector3(x, high, z)], WIRE, 6));
  for (const w of wires) b.detail(area, w, steel, KIND.steel, place);
  // The packets: their bottoms bunched along the floor, their tops fanned out to the rack's ends.
  const rnd = random(64);
  const count = 17;
  const bottoms = ox - 11;
  const tops = ox - WIRE - THICK / 2 - 0.6;
  // Runs of white, brown, pink and the odd blue-banded white, as they were pushed in.
  const DESIGNS = [1, 1, 2, 2, 1, 3, 3, 1, 1, 5, 2, 1, 1, 3, 1, 1, 2];
  const items: { matrix: THREE.Matrix4; blue: number }[] = [];
  let drift = 0;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1) - 0.5;
    // Some lean together, some apart: a wandering offset on top of the fan.
    drift = drift * 0.4 + rnd.range(-2.2, 2.2);
    const x0 = 2 * t * bottoms + rnd.range(-0.3, 0.3);
    const x1 = THREE.MathUtils.clamp(2 * t * tops + drift * (1 - Math.abs(2 * t)), -tops, tops);
    const height = top - rnd.range(0.05, 0.4) - floor;
    const lean = Math.atan2(x1 - x0, PACKET.up);
    const scale = height / (PACKET.up * Math.cos(lean));
    const local = mat4({ x: x0, y: floor, z: rnd.range(-0.5, 0.5) }, new THREE.Euler(0, rnd.range(-0.04, 0.04), -lean, "YZX"), { x: 1, y: scale, z: 1 });
    items.push({ matrix: place.clone().multiply(local), blue: DESIGNS[i] / 8 });
  }
  b.detailPainted(area, copies(packet(), items, TOP.print), TOP.print);
  // Far off: a block of paper, banded the packets' colours along it.
  b.standIn(area, new THREE.BoxGeometry(f.hx * 2, top - ground, f.hz * 2, 6, 1, 1).translate(0, (top + ground) / 2, 0), (p) => {
    const k = Math.floor(((p.x + f.hx) / (f.hx * 2)) * 5.999);
    return ["#ece8de", "#c8a07a", "#ece8de", "#e8b8bc", "#ece8de", "#c8a07a"][Math.max(0, Math.min(5, k))];
  }, KIND.paper, place);
}
