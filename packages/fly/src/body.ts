// The body's shapes and colours: everything but the wings, in one mesh.
// Each part is a parametric surface or a tube, modelled in the model's rest
// space (or, for the leg segments and mouthparts, along their joint's x axis)
// and coloured per vertex. Colours are those of a wild-type male: tan thorax
// dusted with fine hairs, brick-red eyes, an abdomen banded at the back of
// each tergite with the last two segments wholly dark.

import type * as THREE from "three";
import {
  ABDOMEN, ABDOMINAL_SEGMENTS, ANTENNA, EYE, HALTERE, HEAD, J, LEG_COUNT, LEG_SEGMENTS, LEGS, PIVOT, PROBOSCIS,
  SCUTELLUM, THORAX, legPair,
} from "./anatomy.ts";
import type { Vec3 } from "./anatomy.ts";
import { MeshBuilder, add, cross, mix, rgb, scale, unit } from "./builder.ts";
import type { Mat, Rgb, Ring } from "./builder.ts";

const C = {
  scutum: rgb("#a98352"),
  scutumStripe: rgb("#8d6a40"),
  pleura: rgb("#c09a62"),
  sternum: rgb("#d4b582"),
  scutellum: rgb("#9b7646"),
  frons: rgb("#c97f3a"),
  vertex: rgb("#9a7246"),
  ocellarTriangle: rgb("#3d2a1a"),
  face: rgb("#e2c48e"),
  neck: rgb("#b49470"),
  occiput: rgb("#8a6c4a"),
  eye: rgb("#a8181a"),
  ocellus: rgb("#6a2c12"),
  pedicel: rgb("#a2733f"),
  funiculus: rgb("#a88a66"),
  arista: rgb("#3a2919"),
  rostrum: rgb("#d8bf96"),
  haustellum: rgb("#a98050"),
  labellum: rgb("#e6d3ad"),
  tergite: rgb("#c8a56c"),
  band: rgb("#55392a"),
  tip: rgb("#33241a"),
  membrane: rgb("#d8c69f"),
  sternite: rgb("#cdb284"),
  coxa: rgb("#d2b07c"),
  femur: rgb("#c9a26a"),
  tibia: rgb("#cfac78"),
  tarsus: rgb("#b48e5c"),
  claw: rgb("#2a1c10"),
  pulvillus: rgb("#eadcc0"),
  comb: rgb("#24170d"),
  haltereStalk: rgb("#cdb48a"),
  haltereKnob: rgb("#efe4c8"),
  bristle: rgb("#24180f"),
};

// Anatomy: Genetics 2024 doi:10.1093/genetics/iyae129. These finishes are
// display choices, not measured cuticle reflectances.
// roughness, clearcoat, sheen, region
const M = {
  thorax: [0.68, 0.16, 0.6, 2] as Mat,
  head: [0.58, 0.23, 0.4, 0] as Mat,
  eye: [0.3, 0, 0.35, 1] as Mat,
  ocellus: [0.12, 1, 0, 0] as Mat,
  abdomen: [0.38, 0.6, 0.25, 0] as Mat,
  membrane: [0.6, 0.2, 0.3, 0] as Mat,
  leg: [0.6, 0.23, 0.3, 0] as Mat,
  claw: [0.25, 0.8, 0, 0] as Mat,
  bristle: [0.35, 0.5, 0, 0] as Mat,
  soft: [0.55, 0.15, 0.5, 0] as Mat,
};

const TAU = Math.PI * 2;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Unit-sphere direction for (u around, v pole to pole) with the poles on ±z. */
function sphere(u: number, v: number): [number, number, number] {
  const th = v * Math.PI, ph = u * TAU;
  return [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
}

function thoraxPoint(u: number, v: number, out: number[]) {
  const [sx, sy, sz] = sphere(u, v);
  const [cx, cy, cz] = THORAX.centre, [rx, ry, rz] = THORAX.radii;
  // The front narrows into the neck; the scutum arches up behind it; the sternum is flatter.
  const front = smooth(0.45, 1, sz);
  const hump = sy > 0 ? 0.03 * sy * sy * Math.exp(-(((sz - 0.15) / 0.6) ** 2)) : 0;
  const belly = sy < 0 ? 0.85 : 1;
  // Broad rounded shoulders in plan: the front is blunted rather than pointed.
  const blunt = sz > 0 ? Math.pow(sz, 0.65) : sz;
  out[0] = cx + rx * sx * (1 - 0.18 * front * front) * (1 - 0.06 * sy * sy);
  out[1] = cy - 0.03 * front + ry * sy * (1 - 0.35 * front * front) * belly + hump;
  out[2] = cz + rz * blunt * (sz > 0 ? 1 - 0.12 * sy * sy : 1);
}

function scutellumPoint(u: number, v: number, out: number[]) {
  const [sx, sy, sz] = sphere(u, v);
  const [cx, cy, cz] = SCUTELLUM.centre, [rx, ry, rz] = SCUTELLUM.radii;
  out[0] = cx + rx * sx * (1 - 0.25 * Math.max(0, -sz));
  out[1] = cy + ry * sy - 0.012 * Math.max(0, -sz);
  out[2] = cz + rz * sz;
}

function headPoint(u: number, v: number, out: number[]) {
  const [sx, sy, sz] = sphere(u, v);
  const [cx, cy, cz] = HEAD.centre, [rx, ry, rz] = HEAD.radii;
  // Flat at the back where it meets the thorax; the lower face bulges a little.
  const back = sz < 0 ? 0.5 : 1;
  const face = sz > 0 && sy < 0 ? 0.012 * sz * -sy : 0;
  out[0] = cx + rx * sx;
  out[1] = cy + ry * sy * (sy > 0 ? 0.92 : 1);
  out[2] = cz + rz * sz * back + face;
}

const EYE_CAP = 0.52;
/** The eye as a cap around its outward axis: v = 0 at the centre of the eye. */
function eyePoint(u: number, v: number, out: number[]) {
  const th = v * EYE_CAP * Math.PI, ph = u * TAU;
  const o = Math.cos(th), a = Math.sin(th) * Math.cos(ph), b = Math.sin(th) * Math.sin(ph);
  const [cx, cy, cz] = EYE.centre, [rx, ry, rz] = EYE.radii;
  const cyaw = Math.cos(EYE.yaw), syaw = Math.sin(EYE.yaw);
  // Outward axis turned forward by the yaw; a: up, b: forward.
  const lx = rx * o, ly = ry * a, lz = rz * b;
  out[0] = cx + lx * cyaw - lz * syaw;
  out[1] = cy + ly;
  out[2] = cz + lx * syaw + lz * cyaw;
}
/** Facet-grid coordinates: an equal-area-ish unrolling of the cap, in facets. */
const FACET = 0.0095;
function eyeGrid(u: number, v: number): [number, number] {
  const th = v * EYE_CAP * Math.PI, ph = u * TAU;
  const r = th * 0.105;
  return [(r * Math.cos(ph)) / FACET, (r * Math.sin(ph)) / FACET];
}

function abdomenPoint(u: number, v: number, out: number[]) {
  const [sx, sy, sz] = sphere(u, v);
  const [cx, cy, cz] = ABDOMEN.centre, [rx, ry, rz] = ABDOMEN.radii;
  const t = (1 - sz) / 2;
  const waist = 0.55 + 0.45 * smooth(0, 0.16, t);
  const ridge = sy > -0.55 ? 1 + 0.018 * smooth(0, 1, segmentPosition(t)) : 1;
  const flat = sy > 0 ? 0.93 : 1;
  out[0] = cx + rx * sx * waist * ridge;
  out[1] = cy + ry * sy * waist * ridge * flat - 0.04 * t * t;
  out[2] = cz + rz * sz;
}

/** Position within the current abdominal segment, 0 at its front to 1 at its back edge. */
function segmentPosition(t: number): number {
  let start = 0;
  for (const end of ABDOMINAL_SEGMENTS) {
    if (t <= end) return (t - start) / (end - start);
    start = end;
  }
  return 1;
}
function segmentIndex(t: number): number {
  for (let i = 0; i < ABDOMINAL_SEGMENTS.length; i++) if (t <= ABDOMINAL_SEGMENTS[i]) return i;
  return ABDOMINAL_SEGMENTS.length - 1;
}

/** A bristle: a thin cone from `root` along `dir`, curving a little toward `bend`. */
function bristle(b: MeshBuilder, joint: number, root: number[], dir: number[], length: number, radius: number, bend: number[], mirror: boolean) {
  const rings: Ring[] = [];
  const steps = 4;
  const d = unit(dir);
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const p = add(add(root, scale(d, length * t)), scale(bend, length * 0.25 * t * t));
    rings.push({ p: [p[0], p[1], p[2]], r: radius * (1 - 0.85 * t) });
  }
  b.tube({ joint, rings, sides: 3, color: C.bristle, mat: M.bristle, hair: true, mirror });
}

type BristleSpec = { u: number; v: number; out: number; back: number; up: number; length: number };

/** Macrochaetae on the thorax, left side, by surface coordinates (u: around from the side, v: front to back). */
const THORAX_BRISTLES: BristleSpec[] = [
  { u: 0.11, v: 0.24, out: 0.7, back: 0.2, up: 0.3, length: 0.055 }, // postpronotal (humeral)
  { u: 0.12, v: 0.3, out: 0.6, back: 0.5, up: 0.3, length: 0.05 },
  { u: 0.08, v: 0.42, out: 0.45, back: 1, up: 0.3, length: 0.07 }, // notopleural
  { u: 0.085, v: 0.5, out: 0.45, back: 1, up: 0.3, length: 0.065 },
  { u: 0.12, v: 0.62, out: 0.3, back: 1, up: 0.35, length: 0.075 }, // supra-alar
  { u: 0.1, v: 0.76, out: 0.3, back: 1, up: 0.3, length: 0.07 }, // post-alar
  { u: 0.2, v: 0.62, out: 0.05, back: 1, up: 0.35, length: 0.1 }, // dorsocentral, anterior
  { u: 0.2, v: 0.8, out: 0.05, back: 1, up: 0.3, length: 0.12 }, // dorsocentral, posterior
  { u: 0.95, v: 0.45, out: 0.35, back: 1, up: -0.3, length: 0.05 }, // katepisternal
  { u: 0.96, v: 0.55, out: 0.35, back: 1, up: -0.3, length: 0.05 },
];
const SCUTELLAR: BristleSpec[] = [
  { u: 0.05, v: 0.45, out: 0.6, back: 1, up: 0.3, length: 0.08 }, // basal scutellar
  { u: 0.12, v: 0.82, out: -0.25, back: 1, up: 0.2, length: 0.15 }, // apical scutellar, crossing
];
/** Head bristles, left side, by head-capsule surface coordinates. */
const HEAD_BRISTLES: BristleSpec[] = [
  { u: 0.2, v: 0.24, out: 0.3, back: -0.7, up: 0.6, length: 0.045 }, // proclinate orbital
  { u: 0.21, v: 0.3, out: 0.2, back: 0.6, up: 0.7, length: 0.05 }, // reclinate orbitals
  { u: 0.22, v: 0.36, out: 0.2, back: 0.6, up: 0.7, length: 0.045 },
  { u: 0.245, v: 0.42, out: 0.6, back: -0.6, up: 0.6, length: 0.045 }, // ocellar
  { u: 0.21, v: 0.55, out: -0.3, back: 0.8, up: 0.5, length: 0.07 }, // inner vertical
  { u: 0.16, v: 0.58, out: 0.6, back: 0.7, up: 0.3, length: 0.06 }, // outer vertical
  { u: 0.24, v: 0.62, out: -0.4, back: 1, up: 0.3, length: 0.045 }, // postvertical
  { u: 0.86, v: 0.2, out: 0.3, back: -1, up: -0.5, length: 0.055 }, // vibrissa
];

function addBristles(b: MeshBuilder, specs: BristleSpec[], point: (u: number, v: number, out: number[]) => void, joint: number, pivot: Vec3, radius: number) {
  const p = [0, 0, 0], a = [0, 0, 0], c = [0, 0, 0];
  for (const s of specs) {
    point(s.u, s.v, p);
    point(s.u + 0.004, s.v, a);
    point(s.u, s.v + 0.004, c);
    let n = unit(cross([a[0] - p[0], a[1] - p[1], a[2] - p[2]], [c[0] - p[0], c[1] - p[1], c[2] - p[2]]));
    if (n[0] < 0 && Math.abs(n[0]) > Math.abs(n[1])) n = scale(n, -1);
    if (n[1] < -0.1 && s.up >= 0) n = scale(n, -1);
    const dir = add(add(scale(n, s.out), [0, s.up, 0]), [0, 0, -s.back]);
    const root = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
    for (const mirror of [false, true]) bristle(b, joint, root, dir, s.length, radius, scale(n, -0.6), mirror);
  }
}

/**
 * Where each macrochaeta's root is in the rest space, left side (the right
 * mirrors it), with the joint it moves with: its sense cell is there.
 */
export function bristleSockets(): { joint: number; at: Vec3 }[] {
  const out: { joint: number; at: Vec3 }[] = [];
  const p = [0, 0, 0];
  for (const [specs, point, joint] of [[HEAD_BRISTLES, headPoint, J.head], [THORAX_BRISTLES, thoraxPoint, J.thorax], [SCUTELLAR, scutellumPoint, J.thorax]] as const) {
    for (const s of specs) {
      point(s.u, s.v, p);
      out.push({ joint, at: [p[0], p[1], p[2]] });
    }
  }
  return out;
}

export function buildBody(): THREE.BufferGeometry {
  const b = new MeshBuilder();

  // Thorax: scutum above, pleura on the sides, sternum below.
  b.surface({
    joint: J.thorax, pivot: PIVOT.thorax, nu: 32, nv: 24, point: thoraxPoint, mat: M.thorax,
    color: (p) => {
      const up = (p[1] - THORAX.centre[1]) / THORAX.radii[1];
      const lateral = Math.abs(p[0]);
      let c = mix(C.pleura, C.scutum, smooth(0.2, 0.6, up));
      c = mix(c, C.sternum, smooth(-0.2, -0.7, up));
      // Faint dorsocentral stripes where the rows of fine hairs run.
      const stripe = Math.exp(-(((lateral - 0.045) / 0.012) ** 2)) * smooth(0.5, 0.85, up) * smooth(-0.05, 0.1, p[2]);
      return mix(c, C.scutumStripe, 0.5 * stripe);
    },
    // The microchaetae: a hair every hundredth of a body length or so, over the whole thorax.
    eye: (u, v) => [u * 86, v * 57],
  });
  b.surface({ joint: J.thorax, pivot: PIVOT.thorax, nu: 18, nv: 8, point: scutellumPoint, mat: [0.42, 0.45, 0.4, 0], color: () => C.scutellum });

  // Head capsule, with the ocellar triangle on top and the pale face below.
  b.surface({
    joint: J.head, pivot: PIVOT.neck, nu: 24, nv: 16, point: headPoint, mat: M.head,
    color: (p) => {
      const up = (p[1] - HEAD.centre[1]) / HEAD.radii[1], fwd = (p[2] - HEAD.centre[2]) / HEAD.radii[2];
      let c = mix(C.face, C.frons, smooth(-0.15, 0.25, up));
      c = mix(c, C.vertex, smooth(0.6, 0.9, up));
      c = mix(c, C.occiput, smooth(0.1, -0.5, fwd));
      const tri = Math.hypot(p[0] / 0.034, (p[2] - 0.402) / 0.03);
      return mix(c, C.ocellarTriangle, smooth(1.1, 0.7, tri) * smooth(0.75, 0.9, up));
    },
  });
  b.tube({
    joint: J.head, sides: 12, color: C.neck, mat: M.soft, caps: false,
    rings: [{ p: [0, -0.02, -0.015], r: 0.055 }, { p: [0, -0.012, 0.01], r: 0.058 }, { p: [0, -0.005, 0.035], r: 0.06 }],
  });
  for (const mirror of [false, true]) {
    b.surface({ joint: J.head, pivot: PIVOT.neck, nu: 32, nv: 16, point: eyePoint, mat: M.eye, color: () => C.eye, eye: eyeGrid, mirror });
  }
  // Ocelli: three simple eyes in a triangle on the vertex.
  const ocelli: Vec3[] = [[0, 0.453, 0.418], [0.017, 0.452, 0.392], [-0.017, 0.452, 0.392]];
  for (const o of ocelli) {
    b.surface({
      joint: J.head, pivot: PIVOT.neck, nu: 8, nv: 4, mat: M.ocellus, color: () => C.ocellus,
      point: (u, v, out) => {
        const [sx, sy, sz] = sphere(u, v);
        out[0] = o[0] + 0.0105 * sx; out[1] = o[1] + 0.007 * sy; out[2] = o[2] + 0.0105 * sz;
      },
    });
  }
  addBristles(b, HEAD_BRISTLES, headPoint, J.head, PIVOT.neck, 0.0026);
  addBristles(b, THORAX_BRISTLES, thoraxPoint, J.thorax, PIVOT.thorax, 0.003);
  addBristles(b, SCUTELLAR, scutellumPoint, J.thorax, PIVOT.thorax, 0.003);

  for (const mirror of [false, true]) antenna(b, mirror);
  proboscis(b);

  // Abdomen: six visible segments, each tergite darker along its back edge, the male's last two dark all over.
  b.surface({
    joint: J.abdomen, pivot: PIVOT.abdomen, nu: 32, nv: 30, point: abdomenPoint,
    split: { joint: J.abdomenTip, pivot: PIVOT.abdomenTip, where: (p) => p[2] < PIVOT.abdomenTip[2] },
    mat: (p) => ((p[1] - ABDOMEN.centre[1]) / ABDOMEN.radii[1] < -0.5 ? M.membrane : M.abdomen),
    color: (p) => {
      const t = (ABDOMEN.centre[2] + ABDOMEN.radii[2] - p[2]) / (2 * ABDOMEN.radii[2]);
      const up = (p[1] - ABDOMEN.centre[1] + 0.04 * t * t) / ABDOMEN.radii[1];
      const seg = segmentIndex(t), within = segmentPosition(t);
      let c: Rgb;
      if (seg >= 4) c = mix(C.tip, C.band, 0.25 * (1 - within));
      else {
        // The band is narrower toward the sides.
        const width = 0.6 + 0.15 * smooth(0.1, -0.5, up);
        c = mix(C.tergite, C.band, smooth(width - 0.08, width + 0.04, within) * (seg === 0 ? 0.4 : 1));
      }
      c = mix(c, C.membrane, smooth(-0.35, -0.55, up));
      const sternite = Math.abs(p[0]) < 0.04 ? 1 : 0;
      return mix(c, C.sternite, smooth(-0.7, -0.9, up) * sternite * 0.8);
    },
  });

  // Halteres: a pale knob on a short stalk behind each wing.
  for (const mirror of [false, true]) {
    const dir = unit([0.55, -0.25, -0.8]);
    const rings: Ring[] = [0, 0.4, 0.8, 1].map((t) => ({ p: scale(dir, HALTERE.stalk * t) as unknown as Vec3, r: 0.0032 + 0.0012 * t }));
    b.tube({ joint: J.haltere + (mirror ? 1 : 0), rings, sides: 6, color: C.haltereStalk, mat: M.soft, mirror });
    const k = scale(dir, HALTERE.stalk + HALTERE.knob * 0.7);
    b.surface({
      joint: J.haltere + (mirror ? 1 : 0), pivot: [0, 0, 0], nu: 8, nv: 6, mat: [0.35, 0.5, 0.4, 0], color: () => C.haltereKnob, mirror,
      point: (u, v, out) => {
        const [sx, sy, sz] = sphere(u, v);
        out[0] = k[0] + HALTERE.knob * sx; out[1] = k[1] + HALTERE.knob * 0.85 * sy; out[2] = k[2] + HALTERE.knob * 1.15 * sz;
      },
    });
  }

  for (let leg = 0; leg < LEG_COUNT; leg++) addLeg(b, leg);
  return b.build();
}

function antenna(b: MeshBuilder, mirror: boolean) {
  const joint = J.antenna + (mirror ? 1 : 0);
  const ellipsoid = (centre: readonly number[], axis: readonly number[], len: number, w: number, th: number, color: Rgb, mat: Mat, nu = 8, nv = 5) => {
    const x = unit(axis), side = unit(cross(x, [0, 0, 1])), up = cross(side, x);
    b.surface({
      joint, pivot: [0, 0, 0], nu, nv, mat, color: () => color, mirror,
      point: (u, v, out) => {
        const [sx, sy, sz] = sphere(u, v);
        for (let k = 0; k < 3; k++) out[k] = centre[k] + x[k] * len * sz + side[k] * w * sx + up[k] * th * sy;
      },
    });
  };
  // Scape and pedicel, then the large oval third segment hanging in front of the face.
  ellipsoid([0, 0, 0], [0.2, -0.3, 0.9], 0.01, 0.01, 0.01, C.pedicel, M.head);
  const pedicelAxis = ANTENNA.pedicelAxis;
  const pedicel = scale(pedicelAxis, 0.014);
  ellipsoid(pedicel, pedicelAxis, 0.013, 0.011, 0.011, C.pedicel, M.head);
  const funAxis = ANTENNA.funiculusAxis;
  const funBase = scale(pedicelAxis, 0.024);
  const fun = ANTENNA.centre;
  ellipsoid(fun, funAxis, ANTENNA.length, ANTENNA.width, ANTENNA.thickness, C.funiculus, M.soft, 12, 8);

  // The arista: a feathery bristle from the top of the third segment, with branches above and below.
  const root = add(funBase, add(scale(funAxis, 0.008), [0.01, 0, 0.005]));
  const ar = unit([0.4, 0.2, 0.9]);
  const length = 0.1;
  const rings: Ring[] = [];
  for (let k = 0; k <= 6; k++) {
    const t = k / 6;
    const p = add(add(root, scale(ar, length * t)), [0, 0.012 * t * t, 0]);
    rings.push({ p: p as unknown as Vec3, r: 0.0022 * (1 - 0.7 * t) + 0.0004 });
  }
  b.tube({ joint, rings, sides: 3, color: C.arista, mat: M.bristle, hair: true, mirror });
  const across = unit(cross(ar, [1, 0, 0]));
  for (let k = 0; k < 7; k++) {
    const t = 0.25 + (k / 7) * 0.7;
    const at = add(add(root, scale(ar, length * t)), [0, 0.012 * t * t, 0]);
    const above = k % 3 !== 2;
    const dir = add(scale(across, above ? 1 : -1), scale(ar, 0.7));
    bristle(b, joint, at, dir, 0.019 * (1 - 0.55 * t), 0.0007, [0, 0, 0], mirror);
  }
}

function proboscis(b: MeshBuilder) {
  // Each piece is built along its joint's x axis; the rig points the axes.
  const tube = (joint: number, length: number, r0: number, r1: number, color: Rgb, mat: Mat) => {
    const rings: Ring[] = [0, 0.33, 0.66, 1].map((t) => ({ p: [length * t, 0, 0], r: r0 + (r1 - r0) * t }));
    b.tube({ joint, rings, sides: 8, color, mat, caps: true });
  };
  tube(J.rostrum, PROBOSCIS.rostrum, 0.026, 0.021, C.rostrum, M.soft);
  tube(J.haustellum, PROBOSCIS.haustellum, 0.017, 0.014, C.haustellum, M.leg);
  // The labellum: two soft lobes whose undersides carry the food channels (pseudotracheae).
  for (const side of [1, -1]) {
    b.surface({
      joint: J.labellum, pivot: [0, 0, 0], nu: 10, nv: 6, mat: M.soft,
      color: (p) => {
        const channels = 0.5 + 0.5 * Math.cos(Math.atan2(p[1], p[2] * side) * 7);
        return mix(C.labellum, C.haustellum, 0.35 * channels * smooth(0.02, 0.035, p[0]));
      },
      point: (u, v, out) => {
        const [sx, sy, sz] = sphere(u, v);
        const l = PROBOSCIS.labellum / 2;
        out[0] = l + l * sz; out[1] = PROBOSCIS.padDepth * sy; out[2] = side * 0.013 + 0.015 * sx;
      },
    });
  }
}

function addLeg(b: MeshBuilder, leg: number) {
  const spec = LEGS[legPair(leg)], pair = legPair(leg);
  const base = J.leg + leg * LEG_SEGMENTS;
  const seg = (k: number, length: number, profile: (t: number) => number, color: Rgb | ((t: number) => Rgb), n = 6, sides = 6) => {
    const rings: Ring[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      rings.push({ p: [length * t, 0, 0], r: profile(t) });
    }
    b.tube({ joint: base + k, rings, sides, color, mat: M.leg, caps: true });
  };
  const fr = spec.femurRadius, tr = spec.tibiaRadius;
  seg(0, spec.coxa, (t) => (pair === 0 ? 0.026 : 0.022) * (1 - 0.3 * t), C.coxa, 4);
  // Femur: the trochanter as a narrow collar, then thick in its proximal half.
  seg(1, spec.femur, (t) => fr * (0.75 + 0.3 * smooth(0, 0.25, t) - 0.3 * smooth(0.35, 1, t)), C.femur, 8);
  seg(2, spec.tibia, (t) => tr * (0.8 + 0.25 * smooth(0, 0.85, t)), C.tibia, 6);
  seg(3, spec.basitarsus, (t) => 0.0078 - 0.001 * t, (t) => (pair === 0 ? mix(C.tarsus, C.comb, 0.55 * smooth(0.15, 0.25, t) * smooth(0.5, 0.4, t)) : C.tarsus), 4, 6);
  // Male sex combs carry stout teeth arranged along the basitarsus.
  // Kopp 2011 doi:10.1111/j.1525-142X.2011.00507.x: ~10 teeth on tarsomere 1.
  if (pair === 0) {
    for (let tooth = 0; tooth < 10; tooth++) {
      const x = spec.basitarsus * (0.24 + 0.025 * tooth);
      bristle(b, base + 3, [x, -0.005, 0.005], [0.25, -0.8, 0.55], 0.013, 0.0015, [0.3, 0, 0], false);
    }
  }
  // Tarsomeres 2–5 with their joints, then the claws and pads.
  seg(4, spec.tarsus, (t) => 0.0066 - 0.0018 * t + 0.0009 * Math.cos(t * 4 * TAU), (t) => mix(C.tarsus, C.claw, smooth(0.7, 1, t) * 0.4), 12, 6);
  const tip = spec.tarsus;
  for (const side of [1, -1]) {
    const rings: Ring[] = [0, 0.5, 1].map((t) => ({ p: [tip + 0.002 + 0.009 * t, -0.001 - 0.005 * t * t, side * (0.003 + 0.004 * t)], r: 0.0024 * (1 - 0.8 * t) }));
    b.tube({ joint: base + 4, rings, sides: 4, color: C.claw, mat: M.claw });
    b.surface({
      joint: base + 4, pivot: [0, 0, 0], nu: 6, nv: 4, mat: M.soft, color: () => C.pulvillus,
      point: (u, v, out) => {
        const [sx, sy, sz] = sphere(u, v);
        out[0] = tip + 0.002 + 0.005 * sz; out[1] = -0.004 + 0.0028 * sy; out[2] = side * 0.0035 + 0.003 * sx;
      },
    });
  }
  // A preapical bristle near the end of each tibia.
  bristle(b, base + 2, [spec.tibia * 0.82, tr * 0.9, 0], [0.8, 0.5, 0], 0.03, 0.0022, [0, -0.2, 0], false);
}
