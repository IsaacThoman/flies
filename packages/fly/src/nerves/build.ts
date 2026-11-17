// The fly's central nervous system and its nerves, built in code in the
// model's own space so that it sits inside the body and moves with it. The
// neuropils' shapes are measured from one male's CNS (measured.ts); where
// they sit, and what the dataset doesn't hold, is anatomy.ts.

import type * as THREE from "three";
import { ABDOMEN, ABDOMINAL_SEGMENTS, EYE, HALTERE, J, LEG_COUNT, LEG_SEGMENTS, LEGS, PIVOT, PROBOSCIS, legPair, legSide } from "../anatomy.ts";
import { bristleSockets } from "../body.ts";
import { FlyRig } from "../rig.ts";
import { BRAIN_POINTS, CORD_PATHS, HEAD, NECK, RETINA, brainPoint, cordPoint, eyeBasis } from "./anatomy.ts";
import type { Ring, V3 } from "./builder.ts";
import { NerveBuilder, add, lerp3, scale, unit } from "./builder.ts";
import { AMMC, BLOB_GRID, BRAIN_BLOBS, BRAIN_NERVES, BRAIN_RIND, BRAIN_RODS, CONNECTIVE_EXIT, CORD_BLOBS, CORD_NERVES, ELLIPSOID_BODY, LAMINA } from "./measured.ts";
import type { Blob } from "./measured.ts";
import { LEG_NAMES, SIDES } from "./parts.ts";
import { SOMA_GROUPS } from "./somata.ts";

type Sign = 1 | -1;
type Place = (p: readonly number[], m: number) => V3;
const mirror = (p: readonly number[], m: Sign): V3 => [p[0] * m, p[1], p[2]];
const LEFT_RIGHT = [1, -1] as const;

/**
 * The rest pose's joint frames: the shapes are laid out on a fly standing at
 * rest, and stored in each joint's space from there.
 */
export function restFrames(): Float32Array {
  return new FlyRig().joints.slice();
}

/**
 * Where each command group's somata are drawn on the fly standing at rest, in
 * its own units, seen from above as the panel sees them: x toward its left,
 * z forward. The drawing puts them here; a picture can mark them.
 */
export function somaPlaces(): { rate: string; points: [number, number][] }[] {
  return SOMA_GROUPS.map((group) => ({
    rate: group.rate,
    points: group.neurons.map((neuron): [number, number] => {
      const p = neuron.cord ? cordPoint(neuron.p, 1) : brainPoint(neuron.p, 1);
      return [p[0], p[2]];
    }),
  }));
}

export function buildNerves(rest: Float32Array = restFrames()): THREE.BufferGeometry {
  const b = new NerveBuilder(rest);
  b.backdrop();
  for (const [k, side] of SIDES.entries()) {
    const m: Sign = k === 0 ? 1 : -1;
    opticLobe(b, side, m);
    antenna(b, side, m);
    brainHalf(b, side, m);
    connectiveHalf(b, side, m);
    cordHalf(b, side, m);
    flightNerves(b, side, m);
  }
  brainMidline(b);
  mouthparts(b);
  cordMidline(b);
  for (let leg = 0; leg < LEG_COUNT; leg++) legNerves(b, rest, leg);
  abdominalNerves(b);
  bristles(b);
  // Built last so the panel's transparent volumes cannot bury tiny somata.
  for (const group of SOMA_GROUPS) {
    for (const neuron of group.neurons) {
      const p = neuron.cord ? cordPoint(neuron.p, 1) : brainPoint(neuron.p, 1);
      b.ellipsoid(group.id, neuron.cord ? J.thorax : J.head, p, [0.0015, 0.0015, 0.0015], { nu: 4, nv: 2, dot: true });
    }
  }
  const missing = b.missing();
  if (missing.length) throw new Error(`Nerve parts with nothing drawn: ${missing.join(", ")}`);
  return b.build();
}

// --- Shapes ------------------------------------------------------------------

/**
 * A grid's value between its nodes: `around` columns that wrap, rows from 0
 * to `rows` - 1, read bilinearly so the surface it makes is smooth.
 */
function between(grid: readonly number[], around: number, rows: number, u: number, v: number): number {
  const x = (((u % 1) + 1) % 1) * around, y = Math.min(rows - 1, Math.max(0, v * (rows - 1)));
  const i = Math.floor(x), j = Math.min(rows - 2, Math.floor(y));
  const fx = x - i, fy = y - j, i1 = (i + 1) % around;
  const a = grid[j * around + i] + (grid[j * around + i1] - grid[j * around + i]) * fx;
  const b = grid[(j + 1) * around + i] + (grid[(j + 1) * around + i1] - grid[(j + 1) * around + i]) * fx;
  return a + (b - a) * fy;
}

/** A measured blob: its radius in each direction of its grid round its centre, placed by `place`. */
function blob(b: NerveBuilder, id: string, joint: number, shape: Blob, place: Place, m: number) {
  const { around, rows } = BLOB_GRID;
  const [a0, a1, a2] = shape.axes;
  b.surface(id, joint, around, rows - 1, (u, v, out) => {
    const th = v * Math.PI, ph = u * Math.PI * 2;
    const r = between(shape.r, around, rows, u, v);
    const s = Math.sin(th);
    const p = [0, 1, 2].map((k) => shape.centre[k] + r * (Math.cos(th) * a0[k] + s * (Math.cos(ph) * a1[k] + Math.sin(ph) * a2[k])));
    const q = place(p, m);
    out[0] = q[0]; out[1] = q[1]; out[2] = q[2];
  });
}

/**
 * The lamina: a curved plate round the centre of the sphere that fits it.
 * `v` runs from the middle of its outer face to its rim and back over its
 * inner face; the rim is where the two meet.
 */
function lamina(b: NerveBuilder, id: string, m: number) {
  const { around } = BLOB_GRID;
  const rows = LAMINA.near.length / around;
  const [axis, b1, b2] = LAMINA.axes;
  const mid = LAMINA.near.map((x, k) => (x + LAMINA.far[k]) / 2);
  b.surface(id, J.head, around, 2 * (rows - 1), (u, v, out) => {
    // Out over the outer face (0 to 0.5) and back over the inner one; at the rim, halfway between them.
    const t = v < 0.5 ? 2 * v : 2 * (1 - v);
    const face = v < 0.5 ? LAMINA.far : LAMINA.near;
    const edge = Math.max(0, (t - 0.8) / 0.2);
    const r = between(face, around, rows, u, t) * (1 - edge) + between(mid, around, rows, u, t) * edge;
    const ph = u * Math.PI * 2;
    const x = (((u % 1) + 1) % 1) * around, i = Math.floor(x) % around;
    const rim = LAMINA.rim[i] + (LAMINA.rim[(i + 1) % around] - LAMINA.rim[i]) * (x - Math.floor(x));
    const th = t * rim * 0.97;
    const p = [0, 1, 2].map((k) => LAMINA.centre[k] + r * (Math.cos(th) * axis[k] + Math.sin(th) * (Math.cos(ph) * b1[k] + Math.sin(ph) * b2[k])));
    const q = brainPoint(p, m);
    out[0] = q[0]; out[1] = q[1]; out[2] = q[2];
  });
}

/** The retina: a lens-shaped plate bent to the model's eye (anatomy.ts), its rim rounded. */
function retina(b: NerveBuilder, id: string, m: number) {
  const [o, a, c] = eyeBasis(m);
  const centre = mirror(RETINA.centre, m as Sign);
  b.surface(id, J.head, 14, 8, (u, v, out) => {
    const rho = Math.sin(Math.PI * v), d = 0.5 * RETINA.thickness * Math.cos(Math.PI * v);
    const phi = u * Math.PI * 2;
    const y = RETINA.half[0] * rho * Math.cos(phi), z = RETINA.half[1] * rho * Math.sin(phi);
    const along = d * (1 - 0.35 * rho * rho) - (y * y) / (2 * RETINA.curve[0]) - (z * z) / (2 * RETINA.curve[1]);
    for (let k = 0; k < 3; k++) out[k] = centre[k] + o[k] * along + a[k] * y + c[k] * z;
  }, { opacity: 0.06 });
}

/** A tube through brain-frame points [x, y, z] or [x, y, z, radius] (µm), on the head. */
function brainTube(b: NerveBuilder, id: string, points: readonly (readonly number[])[], radius: number, m: number, sides = 4) {
  b.tube(id, points.map((p): Ring => ({ p: brainPoint(p, m), r: (p[3] ?? radius) * HEAD.scale, joint: J.head })), { sides });
}

/** Rings along a smooth path through `points`, `per` between each pair, on joints chosen by `joint`. */
function smoothPath(points: readonly V3[], per: number, radius: (t: number) => number, joint: (p: V3) => number): Ring[] {
  const rings: Ring[] = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < per; k++) {
      const t = k / per;
      // Catmull-Rom through the points.
      const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
      const t2 = t * t, t3 = t2 * t;
      const p = [0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)) as unknown as V3;
      rings.push({ p, r: radius((i + t) / (n - 1)), joint: joint(p) });
    }
  }
  const last = points[n - 1];
  rings.push({ p: last, r: radius(1), joint: joint(last) });
  return rings;
}

/** The head, or the thorax behind the neck's pivot. */
const headOrThorax = (p: V3) => (p[2] > PIVOT.neck[2] ? J.head : J.thorax);
const thorax = () => J.thorax;

/** A small organ: an octahedron is as round as a few pixels need. */
const DOT = { dot: true, nu: 4, nv: 2 } as const;

/** Where a nerve leaves the cord, in the model, and a point a little way along the way it heads. */
function nerveRoot(name: keyof typeof CORD_NERVES, m: number, out = 30): [V3, V3] {
  const n = CORD_NERVES[name];
  return [cordPoint(n.at, m), cordPoint(add(n.at, scale(n.toward, out)), m)];
}

// --- The eyes and optic lobes ------------------------------------------------

/** Where the optic lobe's fibres run between its neuropils, in the brain's frame (µm), as measured centres place them. */
const FIBRES = (() => {
  const { medulla: me, lobula: lo, lobulaPlate: lop, ventrolateralProtocerebrum: vlp, opticTubercle: aotu, ventromedial: vmn } = BRAIN_BLOBS;
  const chiasm: V3[][] = [];
  // The inner chiasm: the medulla's front reaches the lobula plate behind, and its back the lobula in front, crossing between.
  for (const y of [-55, 0, 45]) {
    const cross: V3 = [(me.centre[0] + lo.centre[0]) / 2 + 8, y, (me.centre[2] + lop.centre[2]) / 2];
    chiasm.push([[me.centre[0] - 18, y, me.centre[2] + 30], cross, [lop.centre[0] - 4, y * 0.9, lop.centre[2] + 10]]);
    chiasm.push([[me.centre[0] - 14, y, me.centre[2] - 40], cross, [lo.centre[0] + 8, y * 0.9, lo.centre[2] + 22]]);
  }
  return {
    chiasm,
    tracts: [
      // The lobula's columnar projections to the optic glomeruli of the ventrolateral protocerebrum.
      { path: [lo.centre, [(lo.centre[0] + vlp.centre[0]) / 2, (lo.centre[1] + vlp.centre[1]) / 2 + 8, (lo.centre[2] + vlp.centre[2]) / 2], vlp.centre] as V3[], radius: 9 },
      // The lobula plate's tangential cells (HS and VS) to the posterior slope.
      { path: [lop.centre, [lop.centre[0] - 60, lop.centre[1] + 15, lop.centre[2] - 5], [vmn.centre[0] + 20, vmn.centre[1] - 10, vmn.centre[2] - 70]] as V3[], radius: 7 },
      // The medulla's projections through the anterior optic tract to the optic tubercle.
      { path: [[me.centre[0] - 20, me.centre[1] + 40, me.centre[2] + 20], [(me.centre[0] + aotu.centre[0]) / 2, aotu.centre[1] - 25, aotu.centre[2] - 10], aotu.centre] as V3[], radius: 6 },
    ],
    centrifugal: [
      [[vlp.centre[0] - 10, vlp.centre[1] + 15, vlp.centre[2] - 40], [lo.centre[0], lo.centre[1] + 30, lo.centre[2] + 5], [me.centre[0], me.centre[1] + 20, me.centre[2] + 5]],
      [[vlp.centre[0], vlp.centre[1] - 25, vlp.centre[2] + 10], [lo.centre[0] + 5, lo.centre[1] - 30, lo.centre[2] + 30], [me.centre[0] + 10, me.centre[1] - 30, me.centre[2] + 25], [LAMINA.centre[0] + 60, LAMINA.centre[1] - 20, LAMINA.centre[2] + 120]],
    ] as V3[][],
  };
})();

function opticLobe(b: NerveBuilder, side: string, m: Sign) {
  retina(b, `retina-${side}`, m);
  lamina(b, `lamina-${side}`, m);
  blob(b, `medulla-${side}`, J.head, BRAIN_BLOBS.medulla, brainPoint, m);
  blob(b, `lobula-${side}`, J.head, BRAIN_BLOBS.lobula, brainPoint, m);
  blob(b, `lobula-plate-${side}`, J.head, BRAIN_BLOBS.lobulaPlate, brainPoint, m);
  for (const fibre of FIBRES.chiasm) brainTube(b, `optic-chiasm-${side}`, fibre, 4, m);
  for (const tract of FIBRES.tracts) brainTube(b, `optic-tract-${side}`, tract.path, tract.radius, m, 5);
  for (const fibre of FIBRES.centrifugal) brainTube(b, `optic-centrifugal-${side}`, fibre, 3.5, m);
}

// --- The antennae ------------------------------------------------------------

function antenna(b: NerveBuilder, side: string, m: Sign) {
  const joint = J.antenna + (m > 0 ? 0 : 1);
  // The antenna's own pieces, as body.ts lays them out from its pivot.
  const pivot = mirror(PIVOT.antenna, m);
  const local = (p: readonly number[]): V3 => add(pivot, mirror(p, m)) as unknown as V3;
  const pedicelAxis = unit([0.25, -0.55, 0.8]);
  const funAxis = unit([0.15, -0.9, 0.38]);
  const pedicel = local(scale(pedicelAxis, 0.014));
  const funiculus = local(add(scale(pedicelAxis, 0.024), scale(funAxis, 0.026)));
  // The smell sensilla fill the third segment; their axons run up the antennal nerve to the antennal lobe.
  b.ellipsoid(`antenna-olfactory-${side}`, joint, funiculus, [0.007, 0.007, 0.019], { axes: turnedTo(mirror(funAxis, m)) });
  const entry = brainPoint(BRAIN_NERVES.antennal, m);
  const al = brainPoint(BRAIN_BLOBS.antennalLobe.centre, m);
  b.tube(`antenna-olfactory-${side}`, [
    { p: funiculus, r: 0.0022, joint },
    { p: pedicel, r: 0.0026, joint },
    { p: pivot, r: 0.003, joint },
    { p: entry, r: 0.003, joint: J.head },
    { p: lerp3(entry, al, 0.5), r: 0.0025, joint: J.head },
  ]);
  // Johnston's organ is a bowl of scolopidia in the second segment; its axons go to the antennal mechanosensory and motor centre.
  b.ellipsoid(`antenna-mechanosensory-${side}`, joint, pedicel, [0.0085, 0.0085, 0.006], { axes: turnedTo(mirror(pedicelAxis, m)) });
  const off: V3 = [0.002 * m, -0.002, 0];
  const shift = (p: V3) => add(p, off) as unknown as V3;
  b.tube(`antenna-mechanosensory-${side}`, [
    { p: shift(pedicel), r: 0.0024, joint },
    { p: shift(pivot), r: 0.0026, joint },
    { p: shift(entry), r: 0.0026, joint: J.head },
    { p: brainPoint(AMMC, m), r: 0.0024, joint: J.head },
  ]);
}

/** Axes with z along `d`. */
function turnedTo(d: readonly number[]): [V3, V3, V3] {
  const z = unit(d);
  const x = unit(Math.abs(z[1]) < 0.9 ? [z[2], 0, -z[0]] : [1, 0, 0]);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x as unknown as V3, y as unknown as V3, z as unknown as V3];
}

// --- The central brain -------------------------------------------------------

function brainHalf(b: NerveBuilder, side: string, m: Sign) {
  const piece = (id: string, shape: Blob) => blob(b, `${id}-${side}`, J.head, shape, brainPoint, m);
  const s = BRAIN_BLOBS;
  piece("antennal-lobe", s.antennalLobe);
  piece("superior-protocerebrum", s.superiorProtocerebrum);
  piece("lateral-horn", s.lateralHorn);
  piece("ventrolateral-protocerebrum", s.ventrolateralProtocerebrum);
  piece("ventrolateral-protocerebrum", s.opticTubercle);
  piece("inferior-ventromedial", s.inferior);
  piece("inferior-ventromedial", s.ventromedial);
  piece("subesophageal", s.subesophageal);
  // The mushroom body: the calyx, the peduncle running forward and down from it, and the vertical and medial lobes at the front.
  piece("mushroom-body", s.calyx);
  brainTube(b, `mushroom-body-${side}`, BRAIN_RODS.peduncle, 0, m, 6);
  brainTube(b, `mushroom-body-${side}`, BRAIN_RODS.verticalLobe, 0, m, 6);
  brainTube(b, `mushroom-body-${side}`, BRAIN_RODS.medialLobe, 0, m, 6);
}

function brainMidline(b: NerveBuilder) {
  // The central complex: the protocerebral bridge across the back, the fan-shaped body, the ellipsoid body's ring in front of it, the noduli below.
  brainTube(b, "central-complex", BRAIN_RODS.bridge, 0, 1, 6);
  blob(b, "central-complex", J.head, BRAIN_BLOBS.fanShapedBody, brainPoint, 1);
  for (const m of LEFT_RIGHT) blob(b, "central-complex", J.head, BRAIN_BLOBS.nodulus, brainPoint, m);
  const eb = ELLIPSOID_BODY;
  b.surface("central-complex", J.head, 16, 6, (u, v, out) => {
    const a = u * Math.PI * 2, t = v * Math.PI * 2;
    const reach = eb.major + eb.minor * Math.cos(t);
    const p = [0, 1, 2].map((k) => eb.centre[k] + reach * (Math.cos(a) * eb.axes[0][k] + Math.sin(a) * eb.axes[1][k]) + eb.minor * Math.sin(t) * eb.axes[2][k]);
    const q = brainPoint(p, 1);
    out[0] = q[0]; out[1] = q[1]; out[2] = q[2];
  });
  // The pars intercerebralis's neurosecretory cells, their axons back to the corpora cardiaca, and the frontal ganglion.
  const pi = brainPoint(BRAIN_POINTS.parsIntercerebralis, 1);
  b.ellipsoid("pars-intercerebralis", J.head, pi, [0.008, 0.005, 0.007]);
  for (const m of LEFT_RIGHT) {
    const exit = brainPoint(BRAIN_NERVES.corporaCardiaca, m);
    b.tube("pars-intercerebralis", smoothPath([pi, brainPoint([10, 120, -30], m), exit, brainPoint(BRAIN_POINTS.corporaCardiaca, 1)], 3, () => 0.0018, () => J.head));
  }
  b.ellipsoid("pars-intercerebralis", J.head, brainPoint(BRAIN_POINTS.frontalGanglion, 1), [0.004, 0.0035, 0.004], DOT);
  // The rind of cell bodies round the central brain.
  blob(b, "brain-rind", J.head, BRAIN_RIND, brainPoint, 1);
}

// --- The mouthparts ----------------------------------------------------------

function mouthparts(b: NerveBuilder) {
  // The labellum's two lobes, each with its taste bristles and pegs, as body.ts lays them out on the labellum's joint.
  const l = PROBOSCIS.labellum / 2;
  const lab = (x: number, y: number, z: number) => b.toRest(J.labellum, x, y, z);
  for (const side of LEFT_RIGHT) b.ellipsoid("labellum-taste", J.labellum, lab(l, 0, side * 0.012), [0.011, 0.007, 0.008], { axes: b.axes(J.labellum) });
  // The pharynx's taste organs, in the rostrum.
  b.ellipsoid("labellum-taste", J.rostrum, b.toRest(J.rostrum, PROBOSCIS.rostrum * 0.45, 0.004, 0), [0.012, 0.006, 0.007], { axes: b.axes(J.rostrum) });
  // The labial nerves, one each side: sensory axons up the proboscis, motor axons down it beside them.
  for (const m of LEFT_RIGHT) {
    const sez = brainPoint(BRAIN_NERVES.labial, m);
    for (const [id, dy, from] of [["labellum-taste", 0.004, 0.2], ["labial-motor-nerve", -0.003, 0.65]] as const) {
      const dz = 0.006 * m;
      const rings: Ring[] = [];
      if (id === "labellum-taste") rings.push({ p: lab(l * 0.6, 0, dz), r: 0.002, joint: J.labellum });
      for (const t of [1, 0.6, from]) rings.push({ p: b.toRest(J.haustellum, PROBOSCIS.haustellum * t, dy, dz), r: 0.0022, joint: J.haustellum });
      for (const t of [0.9, 0.4, 0.05]) rings.push({ p: b.toRest(J.rostrum, PROBOSCIS.rostrum * t, dy, dz), r: 0.0026, joint: J.rostrum });
      rings.push({ p: lerp3(rings[rings.length - 1].p, sez, 0.5), r: 0.0026, joint: J.head });
      rings.push({ p: sez, r: 0.0026, joint: J.head });
      b.tube(id, id === "labial-motor-nerve" ? rings.slice().reverse() : rings);
    }
    // The pharyngeal and accessory pharyngeal nerves, from the pharynx up into the front of the subesophageal zone.
    for (const [nerve, along] of [[BRAIN_NERVES.pharyngeal, 0.25], [BRAIN_NERVES.accessoryPharyngeal, 0.1]] as const) {
      const start = b.toRest(J.rostrum, PROBOSCIS.rostrum * along, 0.008, 0.008 * m);
      const end = brainPoint(nerve, m);
      b.tube("pharyngeal-nerves", [{ p: start, r: 0.002, joint: J.rostrum }, { p: lerp3(start, end, 0.5), r: 0.002, joint: J.head }, { p: end, r: 0.002, joint: J.head }]);
    }
  }
}

// --- The neck connective -----------------------------------------------------

/** From inside the brain, out of it where the connective leaves, through the neck to the front of the cord. */
function neckPath(from: V3, m: Sign, offset: V3): V3[] {
  const o = (p: V3): V3 => [p[0] + offset[0] * m, p[1] + offset[1], p[2] + offset[2]];
  return [brainPoint(from, m), o(brainPoint(CONNECTIVE_EXIT, m)), o(mirror(NECK.through, m)), o(cordPoint(NECK.entry, m))];
}

function connectiveHalf(b: NerveBuilder, side: string, m: Sign) {
  const r = NECK.radius;
  const into = CORD_PATHS.descending.map((p) => cordPoint(p, m));
  const down = [...neckPath(NECK.descendingFrom, m, [r * 0.9, r * 0.7, 0]), ...into];
  b.tube(`descending-tract-${side}`, smoothPath(down, 2, (t) => r * (t < 0.08 ? 0.6 + 5 * t : 1) * (t > 0.8 ? 1 - 3 * (t - 0.8) : 1), headOrThorax), { sides: 5 });
  const up = [...CORD_PATHS.ascending.map((p) => cordPoint(p, m)), ...neckPath(NECK.ascendingTo, m, [r * 0.9, -r * 0.7, 0]).reverse()];
  b.tube(`ascending-tract-${side}`, smoothPath(up, 2, (t) => r * 0.9 * (t < 0.15 ? 0.4 + 4 * t : 1) * (t > 0.92 ? 1 - 6 * (t - 0.92) : 1), headOrThorax), { sides: 5 });
}

// --- The ventral nerve cord --------------------------------------------------

function cordHalf(b: NerveBuilder, side: string, m: Sign) {
  const s = CORD_BLOBS;
  for (const [id, shape] of [["t1", s.t1], ["t2", s.t2], ["t3", s.t3], ["abdominal", s.abdominalNeuromeres], ["neck-tectulum", s.neckTectulum], ["wing-tectulum", s.wingTectulum], ["haltere-tectulum", s.haltereTectulum]] as const) {
    blob(b, `cord-${id}-${side}`, J.thorax, shape, cordPoint, m);
  }
  // The neck motor neurons, at the top of the front of the cord, and the cervical nerve from the connective out to the neck's muscles.
  b.ellipsoid(`neck-motor-${side}`, J.thorax, cordPoint(CORD_PATHS.neckSomata, m), [0.006, 0.005, 0.008], DOT);
  const [root, out] = nerveRoot("CvN", m);
  b.tube(`neck-motor-${side}`, smoothPath([cordPoint(CORD_PATHS.neckSomata, m), root, out, [0.05 * m, 0.33, 0.33]], 2, () => 0.0022, thorax));
}

function cordMidline(b: NerveBuilder) {
  const path = (points: readonly V3[]) => points.map((p) => cordPoint(p, 1));
  b.tube("cord-midline", smoothPath(path(CORD_PATHS.ventralMidline), 2, () => 0.003, thorax), { sides: 5 });
  b.tube("cord-efferent", smoothPath(path(CORD_PATHS.dorsalMidline), 2, () => 0.0022, thorax));
  // A median nerve from each thoracic segment, out and up.
  for (const at of CORD_PATHS.medianNerves) {
    for (const m of LEFT_RIGHT) b.tube("cord-efferent", smoothPath([cordPoint(at, 1), cordPoint([at[0] + 30 * m, at[1] + 40, at[2] - 5], 1), cordPoint([at[0] + 70 * m, at[1] + 80, at[2] - 15], 1)], 2, () => 0.0018, thorax));
  }
  // A thread down the connective's midline.
  b.tube("connective-midline", smoothPath([brainPoint([0, -50, -100], 1), brainPoint(CONNECTIVE_EXIT, 1), NECK.through, cordPoint(NECK.entry, 1)], 3, () => 0.0026, headOrThorax));
}

// --- Out to the wings, halteres and their muscles ----------------------------

function flightNerves(b: NerveBuilder, side: string, m: Sign) {
  const wingBase = mirror(PIVOT.wing, m), haltereBase = mirror(PIVOT.haltere, m);
  // Flight motor neurons: their cell bodies over the wing neuropil, their axons out the posterior dorsal mesothoracic nerve, up to the
  // indirect flight muscles that fill the thorax and to the steering muscles at the wing's base, and out the dorsal metathoracic nerve to the haltere's.
  const somata = cordPoint(CORD_PATHS.flightSomata, m);
  b.ellipsoid(`flight-motor-${side}`, J.thorax, somata, [0.008, 0.006, 0.012], DOT);
  const [pdmn, pdmnOut] = nerveRoot("PDMN", m);
  const up: V3 = [0.055 * m, 0.37, 0.16];
  const ends: V3[] = [[0.04 * m, 0.44, 0.08], [0.07 * m, 0.42, 0.2], add(wingBase, [-0.015 * m, -0.02, 0.005]) as unknown as V3];
  for (const end of ends) {
    b.tube(`flight-motor-${side}`, smoothPath([somata, pdmn, pdmnOut, up, end], 2, (t) => 0.0028 * (1 - 0.4 * t), thorax));
  }
  const [dmeta, dmetaOut] = nerveRoot("DMetaN", m);
  b.tube(`flight-motor-${side}`, smoothPath([somata, dmeta, dmetaOut, add(haltereBase, [-0.02 * m, -0.02, 0.02]) as unknown as V3], 2, () => 0.0022, thorax));
  // The wing nerve (the anterior dorsal mesothoracic nerve) brings the wing's senses in from its base.
  const [admn, admnOut] = nerveRoot("ADMN", m);
  b.tube(`wing-nerve-${side}`, smoothPath([wingBase, [0.09 * m, 0.38, 0.14], admnOut, admn], 2, (t) => 0.0034 - 0.0012 * t, thorax));
  // The haltere nerve, out of the haltere's stalk and down the dorsal metathoracic nerve to the haltere neuropil.
  const joint = J.haltere + (m > 0 ? 0 : 1);
  const dir = mirror(unit([0.55, -0.25, -0.8]), m);
  const stalk: Ring[] = [0.7, 0.35, 0.05].map((t) => ({ p: add(haltereBase, scale(dir, HALTERE.stalk * t)) as unknown as V3, r: 0.0022, joint }));
  const inward = smoothPath([haltereBase, [0.07 * m, 0.34, 0.06], dmetaOut, dmeta], 2, () => 0.0024, thorax);
  b.tube(`haltere-nerve-${side}`, [...stalk, ...inward]);
  // Campaniform sensilla at the base of the haltere and of the wing.
  b.ellipsoid(`flight-proprioceptors-${side}`, joint, add(haltereBase, scale(dir, HALTERE.stalk * 0.15)) as unknown as V3, [0.0045, 0.0045, 0.0045], DOT);
  b.ellipsoid(`flight-proprioceptors-${side}`, J.thorax, add(wingBase, [-0.012 * m, -0.008, 0.004]) as unknown as V3, [0.005, 0.005, 0.005], DOT);
}

// --- The legs ----------------------------------------------------------------

const LEG_NERVES = ["ProLN", "MesoLN", "MetaLN"] as const;

/**
 * Each leg's nerve: out of the underside of its leg neuropil where the
 * dataset's nerve leaves it, into the coxa and down the leg. The motor axons
 * go as far as the tibia, whose muscles move the tarsus by a long tendon
 * (there are no muscles in the tarsus); the sensory axons come from the whole
 * leg, the tarsus's taste bristles included.
 */
function legNerves(b: NerveBuilder, rest: Float32Array, leg: number) {
  const pair = legPair(leg), m = legSide(leg) as Sign;
  const side = SIDES[m > 0 ? 0 : 1], name = LEG_NAMES[pair];
  const spec = LEGS[pair];
  const base = J.leg + leg * LEG_SEGMENTS;
  const lengths = [spec.coxa, spec.femur, spec.tibia, spec.basitarsus, spec.tarsus];
  const hip: V3 = [rest[base * 12 + 3], rest[base * 12 + 7], rest[base * 12 + 11]];
  const [root, out] = nerveRoot(LEG_NERVES[pair], m, 25);
  const somata = cordPoint(CORD_PATHS.legMotorSomata[pair], m);
  for (const [id, dy, last] of [[`leg-motor-${name}-${side}`, 0.0024, 2], [`leg-sensory-${name}-${side}`, -0.0024, 4]] as const) {
    const start = id.startsWith("leg-motor") ? [somata, root] : [root];
    const rings: Ring[] = smoothPath([...start, out, hip], 2, () => 0.003, thorax);
    rings.pop();
    for (let seg = 0; seg <= last; seg++) {
      const L = lengths[seg];
      const r = seg === 0 ? 0.0028 : seg === 1 ? 0.0026 : seg === 2 ? 0.0022 : 0.0018;
      const stops = seg === 1 || seg === 2 ? [0.04, 0.5, 0.96] : [0.04, seg === 4 ? 0.85 : 0.96];
      for (const t of stops) rings.push({ p: b.toRest(base + seg, L * t, dy * (seg < 3 ? 1 : 0.5), 0), r, joint: base + seg });
    }
    b.tube(id, id.startsWith("leg-motor") ? rings : rings.slice().reverse());
  }
  b.ellipsoid(`leg-motor-${name}-${side}`, J.thorax, somata, [0.007, 0.005, 0.009], DOT);
  // Proprioceptors: the femoral chordotonal organ in the top of the femur, and campaniform sensilla on the trochanter and at the tibia's end.
  const prop = `proprioceptors-${name}-${side}`;
  b.ellipsoid(prop, base + 1, b.toRest(base + 1, spec.femur * 0.24, 0, 0), [0.016, 0.0045, 0.0045], { ...DOT, axes: b.axes(base + 1) });
  b.ellipsoid(prop, base + 1, b.toRest(base + 1, spec.femur * 0.05, 0.004, 0), [0.004, 0.004, 0.004], DOT);
  b.ellipsoid(prop, base + 2, b.toRest(base + 2, spec.tibia * 0.94, 0.003, 0), [0.0035, 0.0035, 0.0035], DOT);
}

// --- The abdomen -------------------------------------------------------------

/** The abdomen's joint by how far back a point is. */
const abdomenJoint = (p: V3) => (p[2] > PIVOT.abdomen[2] ? J.thorax : p[2] > PIVOT.abdomenTip[2] ? J.abdomen : J.abdomenTip);

/** The abdominal nerve trunk, along the abdomen's floor from where it leaves the cord's tip. */
const TRUNK: V3[] = [[0, 0.245, 0.0], [0, 0.235, -0.06], [0, 0.222, -0.14], [0, 0.214, -0.24], [0, 0.212, -0.33], [0, 0.222, -0.42]];

function abdominalNerves(b: NerveBuilder) {
  const [root, out] = nerveRoot("AbNT", 1, 20);
  for (const [id, dx] of [["abdominal-motor", 0.0022], ["abdominal-sensory", -0.0022]] as const) {
    const trunk = [root, out, ...TRUNK].map((p): V3 => [p[0] + dx, p[1], p[2]]);
    b.tube(id, smoothPath(trunk, 2, (t) => 0.003 * (1 - 0.4 * t), abdomenJoint), { sides: 4 });
    // A nerve to each segment on each side, up round the abdomen's wall.
    for (let s = 0; s < ABDOMINAL_SEGMENTS.length - 1; s++) {
      const t = s === 0 ? 0.06 : (ABDOMINAL_SEGMENTS[s - 1] + ABDOMINAL_SEGMENTS[s]) / 2;
      const z = ABDOMEN.centre[2] + ABDOMEN.radii[2] - 2 * ABDOMEN.radii[2] * t + (id === "abdominal-motor" ? 0.006 : -0.006);
      const from = trunkAt(trunk, z);
      for (const m of LEFT_RIGHT) {
        const wall = 0.7 * ABDOMEN.radii[0] * Math.sin(Math.PI * Math.min(0.95, 0.25 + t));
        const branch: V3[] = [from, [from[0] + 0.3 * wall * m, from[1] + 0.005, z - 0.006], [wall * m, from[1] + 0.04, z - 0.014]];
        b.tube(id, smoothPath(branch, 2, () => 0.0018, abdomenJoint));
      }
    }
  }
  b.ellipsoid("abdominal-motor", J.thorax, cordPoint(CORD_PATHS.abdominalSomata, 1), [0.007, 0.005, 0.01], DOT);
}

/** The trunk's point as far back as `z`. */
function trunkAt(trunk: readonly V3[], z: number): V3 {
  for (let i = 0; i < trunk.length - 1; i++) {
    const a = trunk[i], c = trunk[i + 1];
    if (z <= a[2] && z >= c[2]) return lerp3(a, c, (a[2] - z) / (a[2] - c[2] || 1));
  }
  return trunk[trunk.length - 1];
}

// --- Bristles ----------------------------------------------------------------

/**
 * The sense cell at each macrochaeta's socket: the head's go to the
 * subesophageal zone, the body's to the cord. The abdomen's and the legs'
 * bristles are too fine to model as geometry (body.ts), so their sockets are
 * placed in rows along the back edge of each tergite and at each tibia's
 * preapical bristle, where they are on the fly.
 */
function bristles(b: NerveBuilder) {
  for (const { joint, at } of bristleSockets()) {
    const id = joint === J.head ? "head-bristle-sockets" : "body-bristle-sockets";
    for (const m of LEFT_RIGHT) b.ellipsoid(id, joint, inward(mirror(at, m), joint), [0.0032, 0.0032, 0.0032], DOT);
  }
  for (let s = 1; s < ABDOMINAL_SEGMENTS.length; s++) {
    const t = ABDOMINAL_SEGMENTS[s] - 0.03;
    const z = ABDOMEN.centre[2] + ABDOMEN.radii[2] - 2 * ABDOMEN.radii[2] * t;
    for (const across of [0.25, 0.55]) {
      for (const m of LEFT_RIGHT) {
        const ry = ABDOMEN.radii[1] * Math.sin(Math.PI * t) * 0.92, rx = ABDOMEN.radii[0] * Math.sin(Math.PI * t) * 0.92;
        const a = across * Math.PI * 0.5;
        const p: V3 = [Math.sin(a) * rx * m, ABDOMEN.centre[1] + Math.cos(a) * ry - 0.04 * t * t, z];
        b.ellipsoid("body-bristle-sockets", abdomenJoint(p), p, [0.003, 0.003, 0.003], DOT);
      }
    }
  }
  for (let leg = 0; leg < LEG_COUNT; leg++) {
    const spec = LEGS[legPair(leg)], joint = J.leg + leg * LEG_SEGMENTS + 2;
    b.ellipsoid("body-bristle-sockets", joint, b.toRest(joint, spec.tibia * 0.82, spec.tibiaRadius * 0.6, 0), [0.0028, 0.0028, 0.0028], DOT);
  }
}

/** A point a little under the cuticle, toward the middle of its part: a socket's sense cell is just inside it. */
function inward(p: V3, joint: number): V3 {
  return lerp3(p, joint === J.head ? [0, EYE.centre[1], 0.392] : [0, 0.335, 0.135], 0.06);
}
