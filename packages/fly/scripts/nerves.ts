// Measures the shapes the nervous system is drawn with (src/nerves/measured.ts)
// from the neuropil meshes of the FlyEM male CNS v1.0 (male-cns.janelia.org,
// CC-BY 4.0): one male's whole brain, neck connective and ventral nerve cord
// in a single electron-microscope volume.
//
//   node packages/fly/scripts/nerves.ts [cache directory]
//
// It downloads the meshes it needs (about 150 MB, once, into the cache:
// default the system's temporary directory) from the public bucket, measures
// them and rewrites measured.ts.
//
// Every shape is in micrometres, in one of two frames that the drawing then
// places in the fly (src/nerves/anatomy.ts): the brain's, with its origin on
// the midline at the narrowest point of the oesophageal foramen, and the
// cord's, with its origin on the midline at the front of its neuropil; in
// both +x is the fly's left, +y dorsal and +z anterior, the x axis along the
// best left-right axis of the specimen's paired neuropils. Only the left side
// is measured, and the drawing mirrors it, so the drawing is symmetric where
// one fly is not quite.
//
// Shapes, by how they are measured:
// - A blob: the surface's radius in each direction from its centre (a grid of
//   directions round its longest axis), the farthest of its mesh's vertices
//   within 15° of each. Neuropils grouped into one region are measured as one
//   blob (their outer envelope); a midline neuropil split between the sides
//   has its right half pressed flat against the midline.
// - A slab (the lamina): a curved plate, measured round the centre of the
//   sphere that best fits it: its rim, and each direction's nearest and
//   farthest vertex.
// - A rod (the mushroom body's peduncle and lobes, the protocerebral bridge):
//   a centreline through the middle of slices along its longest axis, and
//   each slice's radius.
// - A ring (the ellipsoid body): its centre, axis, and the radii of the torus
//   that fits it.
// - A nerve's root: where each nerve's stub leaves the cord, and which way.

import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { BRAIN_FRAME as BRAIN, CORD_FRAME as CORD, registeredPoint as into } from "../src/nerves/registration.ts";
import type { AnatomyFrame as Frame } from "../src/nerves/registration.ts";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const BUCKET = "https://storage.googleapis.com/flyem-male-cns/";
const LAYERS = {
  brain: "rois/fullbrain-roi-v5/mesh/",
  sub: "rois/malecns-subcompartments-v3/mesh/",
  cord: "rois/malecns-vnc-neuropil-roi-v0/mesh/",
  nerve: "rois/malecns-vnc-nerve-roi-v2/mesh/",
  compartment: "rois/malecns-major-compartments-v2/mesh/",
} as const;
type Layer = keyof typeof LAYERS;

const cache = process.argv[2] ?? path.join(os.tmpdir(), "flies-mcns");
mkdirSync(cache, { recursive: true });
const out = path.join(import.meta.dirname, "../src/nerves/measured.ts");

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const len = (a: V) => Math.sqrt(dot(a, a));
const unit = (a: V): V => scale(a, 1 / (len(a) || 1));
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A mesh's vertices in micrometres in the dataset's frame (+x left, +y ventral, +z posterior). */
async function mesh(layer: Layer, name: string): Promise<V[]> {
  // The cache keeps case apart on a case-insensitive disk (AL and aL are both neuropils).
  const file = path.join(cache, `${layer}-${name.replace(/[A-Z]/g, (c) => `^${c}`)}`);
  if (!existsSync(file)) {
    const response = await fetch(BUCKET + LAYERS[layer] + encodeURIComponent(`${name}.ngmesh`));
    if (!response.ok || !response.body) throw new Error(`${name}: ${response.status}`);
    await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(`${file}.part`));
    renameSync(`${file}.part`, file);
  }
  const bytes = readFileSync(file);
  const n = bytes.readUInt32LE(0);
  const vertices: V[] = [];
  for (let i = 0; i < n; i++) vertices.push([bytes.readFloatLE(4 + i * 12) / 1000, bytes.readFloatLE(8 + i * 12) / 1000, bytes.readFloatLE(12 + i * 12) / 1000]);
  return vertices;
}

// --- The frames ---------------------------------------------------------------

// --- Measuring ----------------------------------------------------------------

type Source = { layer: Layer; name: string; half?: boolean; zFrom?: number; zTo?: number };
const left = (layer: Layer, ...names: string[]): Source[] => names.map((n) => ({ layer, name: `${n}(L)` }));
const half = (layer: Layer, ...names: string[]): Source[] => names.map((name) => ({ layer, name, half: true }));

/** The sources' vertices in a frame; a half's right side pressed onto the midline, a slice's kept between its z limits (dataset z). */
async function points(f: Frame, sources: Source[]): Promise<V[]> {
  const all: V[] = [];
  for (const s of sources) {
    for (const v of await mesh(s.layer, s.name)) {
      if (s.zFrom !== undefined && v[2] < s.zFrom) continue;
      if (s.zTo !== undefined && v[2] >= s.zTo) continue;
      const p = into(f, v);
      if (s.half && p[0] < 0) p[0] = 0;
      all.push(p);
    }
  }
  return all;
}

function centroid(ps: V[]): V {
  const c: V = [0, 0, 0];
  for (const p of ps) for (let k = 0; k < 3; k++) c[k] += p[k] / ps.length;
  return c;
}

/** The principal axes of a cloud, longest first (Jacobi on its covariance). */
function principal(ps: V[], c: V): V[] {
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of ps) {
    const d = sub(p, c);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += (d[i] * d[j]) / ps.length;
  }
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(m[p][q]) < 1e-12) continue;
      const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
      for (let k = 0; k < 3; k++) {
        const a = m[k][p], b = m[k][q];
        m[k][p] = cs * a - sn * b;
        m[k][q] = sn * a + cs * b;
      }
      for (let k = 0; k < 3; k++) {
        const a = m[p][k], b = m[q][k];
        m[p][k] = cs * a - sn * b;
        m[q][k] = sn * a + cs * b;
      }
      for (let k = 0; k < 3; k++) {
        const a = v[k][p], b = v[k][q];
        v[k][p] = cs * a - sn * b;
        v[k][q] = sn * a + cs * b;
      }
    }
  }
  const axes = [0, 1, 2].map((i) => ({ value: m[i][i], axis: unit([v[0][i], v[1][i], v[2][i]]) }));
  axes.sort((a, b) => b.value - a.value);
  // A right-handed set, each pointing its largest component positive, so the output is stable.
  const [a, b] = axes.map(({ axis }) => (axis[[0, 1, 2].reduce((i, k) => (Math.abs(axis[k]) > Math.abs(axis[i]) ? k : i), 0)] < 0 ? scale(axis, -1) : axis));
  return [a, b, cross(a, b)];
}

/** Grid directions for a blob: `nu` round its first axis, `nv` steps from one end of it to the other. */
const NU = 10;
const NV = 8;
/** A slab's rows of directions, from its axis out to its rim. */
const SLAB_ROWS = 6;
function direction(axes: V[], u: number, v: number): V {
  const th = v * Math.PI, ph = u * Math.PI * 2;
  const s = Math.sin(th);
  return [0, 1, 2].map((k) => Math.cos(th) * axes[0][k] + s * Math.cos(ph) * axes[1][k] + s * Math.sin(ph) * axes[2][k]) as V;
}

/** Each grid direction's value from the vertices within `cone` of it; empty ones from their neighbours. */
function radial(ps: V[], c: V, dirs: V[], pick: (rs: number[]) => number, cone: number): (number | null)[] {
  const cos = Math.cos(cone);
  const hits: number[][] = dirs.map(() => []);
  for (const p of ps) {
    const d = sub(p, c), r = len(d);
    if (r < 1e-9) continue;
    for (let k = 0; k < dirs.length; k++) if (dot(d, dirs[k]) > cos * r) hits[k].push(r);
  }
  return hits.map((h) => (h.length ? pick(h) : null));
}

function fill(values: (number | null)[], rows: number, cols: number): number[] {
  const v = values.slice();
  for (let pass = 0; pass < 20 && v.some((x) => x === null); pass++) {
    const next = v.slice();
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (v[j * cols + i] !== null) continue;
        const near = [[j, i - 1], [j, i + 1], [j - 1, i], [j + 1, i]]
          .filter(([a]) => a >= 0 && a < rows)
          .map(([a, b]) => v[a * cols + ((b + cols) % cols)])
          .filter((x): x is number => x !== null);
        if (near.length) next[j * cols + i] = near.reduce((s, x) => s + x, 0) / near.length;
      }
    }
    v.splice(0, v.length, ...next);
  }
  return v.map((x) => x ?? 0);
}

/** One pass of smoothing round the grid, so a stray vertex can't make a spike. */
function smooth(r: number[], rows: number, cols: number): number[] {
  return r.map((x, k) => {
    const j = Math.floor(k / cols), i = k % cols;
    const near = [r[j * cols + ((i + 1) % cols)], r[j * cols + ((i + cols - 1) % cols)], r[Math.max(0, j - 1) * cols + i], r[Math.min(rows - 1, j + 1) * cols + i]];
    return 0.5 * x + 0.125 * near.reduce((s, y) => s + y, 0);
  });
}

const round = (x: number) => Math.round(x * 10) / 10;
// Spreading a mesh's worth of numbers into Math.max overflows the stack.
const most = (xs: number[]) => xs.reduce((a, b) => (b > a ? b : a), -Infinity);
const least = (xs: number[]) => xs.reduce((a, b) => (b < a ? b : a), Infinity);
const vec = (v: V) => v.map(round);

async function blob(f: Frame, sources: Source[]) {
  const all = await points(f, sources);
  // A marching-cubes mesh is dense: 30,000 of its vertices find every direction's farthest as well as all of them do.
  const ps = all.filter((_, k) => k % Math.ceil(all.length / 30000) === 0);
  const c = centroid(ps);
  const axes = principal(ps, c);
  const dirs: V[] = [];
  for (let j = 0; j <= NV; j++) for (let i = 0; i < NU; i++) dirs.push(direction(axes, i / NU, j / NV));
  const r = smooth(fill(radial(ps, c, dirs, most, (15 * Math.PI) / 180), NV + 1, NU), NV + 1, NU);
  return { centre: vec(c), axes: axes.map(vec), r: r.map((x) => Math.round(x)) };
}

/** The sphere that best fits a cloud (least squares on |p|² = 2 c·p + k). */
function sphere(ps: V[]): { c: V; r: number } {
  const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], b = [0, 0, 0, 0];
  for (const p of ps) {
    const row = [2 * p[0], 2 * p[1], 2 * p[2], 1], y = dot(p, p);
    for (let i = 0; i < 4; i++) {
      b[i] += row[i] * y;
      for (let j = 0; j < 4; j++) A[i][j] += row[i] * row[j];
    }
  }
  // Gaussian elimination.
  for (let i = 0; i < 4; i++) {
    for (let k = i + 1; k < 4; k++) {
      const f = A[k][i] / A[i][i];
      for (let j = i; j < 4; j++) A[k][j] -= f * A[i][j];
      b[k] -= f * b[i];
    }
  }
  const x = [0, 0, 0, 0];
  for (let i = 3; i >= 0; i--) x[i] = (b[i] - A[i].slice(i + 1).reduce((s, a, j) => s + a * x[i + 1 + j], 0)) / A[i][i];
  const c: V = [x[0], x[1], x[2]];
  return { c, r: Math.sqrt(x[3] + dot(c, c)) };
}

/**
 * A curved plate round the centre of the sphere that fits it: its rim, the
 * widest angle its vertices reach from its axis in each direction round it,
 * and, out to there, each direction's nearest and farthest vertex.
 */
async function slab(f: Frame, sources: Source[]) {
  const ps = await points(f, sources);
  const { c } = sphere(ps);
  const axis = unit(sub(centroid(ps), c));
  const [, a1] = principal(ps, centroid(ps));
  const b1 = unit(sub(a1, scale(axis, dot(a1, axis))));
  const b2 = cross(axis, b1);
  const polar = ps.map((p) => {
    const d = unit(sub(p, c));
    return { th: Math.acos(Math.min(1, dot(d, axis))), ph: Math.atan2(dot(d, b2), dot(d, b1)) };
  });
  const rim = Array.from({ length: NU }, (_, i) => {
    const ph = (i / NU) * Math.PI * 2;
    const near = polar.filter((q) => Math.abs(Math.atan2(Math.sin(q.ph - ph), Math.cos(q.ph - ph))) < Math.PI / NU);
    return most(near.map((q) => q.th));
  });
  const rows = SLAB_ROWS - 1, dirs: V[] = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i < NU; i++) {
      const th = (j / rows) * rim[i] * 0.97, ph = (i / NU) * Math.PI * 2;
      dirs.push([0, 1, 2].map((k) => Math.cos(th) * axis[k] + Math.sin(th) * (Math.cos(ph) * b1[k] + Math.sin(ph) * b2[k])) as V);
    }
  }
  const cone = most(rim) / rows;
  const near = smooth(fill(radial(ps, c, dirs, least, cone), rows + 1, NU), rows + 1, NU);
  const far = smooth(fill(radial(ps, c, dirs, most, cone), rows + 1, NU), rows + 1, NU);
  return { centre: vec(c), axes: [axis, b1, b2].map(vec), rim: rim.map((x) => Math.round(x * 1000) / 1000), near: near.map((x) => Math.round(x)), far: far.map((x) => Math.round(x)) };
}

/** A centreline through slices along the longest axis, with each slice's radius (√2 × its RMS distance from the line). */
async function rod(f: Frame, sources: Source[], slices = 6) {
  const ps = await points(f, sources);
  const c = centroid(ps);
  const [axis] = principal(ps, c);
  const ts = ps.map((p) => dot(sub(p, c), axis));
  const t0 = least(ts), t1 = most(ts);
  const line: number[][] = [];
  for (let s = 0; s < slices; s++) {
    const a = t0 + ((t1 - t0) * s) / slices, b = t0 + ((t1 - t0) * (s + 1)) / slices;
    const inSlice = ps.filter((_, k) => ts[k] >= a && ts[k] <= b);
    if (!inSlice.length) continue;
    const m = centroid(inSlice);
    const rms = Math.sqrt(inSlice.reduce((sum, p) => {
      const d = sub(p, m);
      const along = dot(d, axis);
      return sum + dot(d, d) - along * along;
    }, 0) / inSlice.length);
    line.push([...vec(m), round(rms * Math.SQRT2 * 0.85)]);
  }
  return line;
}

/** A ring: the torus that fits it, round its shortest axis. */
async function ring(f: Frame, sources: Source[]) {
  const ps = await points(f, sources);
  const c = centroid(ps);
  const [a0, a1, normal] = principal(ps, c);
  const flat = ps.map((p) => {
    const d = sub(p, c);
    return { along: dot(d, normal), across: Math.hypot(dot(d, a0), dot(d, a1)) };
  });
  const major = flat.reduce((s, p) => s + p.across, 0) / flat.length;
  const minor = Math.sqrt(flat.reduce((s, p) => s + (p.across - major) ** 2 + p.along ** 2, 0) / flat.length);
  return { centre: vec(c), axes: [a0, a1, normal].map(vec), major: round(major), minor: round(minor) };
}

// --- The drawing's shapes ------------------------------------------------------

const brainBlobs: Record<string, Source[]> = {
  antennalLobe: left("brain", "AL"),
  calyx: left("brain", "CA"),
  superiorProtocerebrum: left("brain", "SMP", "SIP", "SLP"),
  lateralHorn: left("brain", "LH"),
  ventrolateralProtocerebrum: left("brain", "AVLP", "PVLP", "PLP", "WED"),
  opticTubercle: left("brain", "AOTU"),
  // The inferior neuropils over the oesophagus, and the ventromedial ones beside and behind it: measured apart, drawn as one region.
  inferior: [...left("brain", "SCL", "ICL", "ATL", "CRE"), ...half("brain", "IB")],
  ventromedial: left("brain", "VES", "LAL", "BU", "SPS", "IPS", "EPA", "GOR"),
  subesophageal: [...half("brain", "GNG", "PRW"), ...left("brain", "FLA", "CAN"), ...left("sub", "AMMC"), ...half("sub", "SAD(-AMMC)")],
  fanShapedBody: [{ layer: "brain", name: "FB" }],
  nodulus: left("sub", "NO1", "NO2", "NO3"),
  medulla: left("brain", "ME", "AME"),
  lobula: left("brain", "LO"),
  lobulaPlate: left("brain", "LOP"),
};

// The cord's intermediate and lower tectulum cross the boundary between T1 and T2 (dataset z 685, where T1's and T2's leg neuropils meet), and are split there.
const T1T2 = 685;
const cordBlobs: Record<string, Source[]> = {
  t1: [...left("cord", "LegNp(T1)", "mVAC(T1)"), { layer: "cord", name: "LTct", half: true, zTo: T1T2 }],
  t2: [...left("cord", "LegNp(T2)", "mVAC(T2)", "Ov"), { layer: "cord", name: "LTct", half: true, zFrom: T1T2 }],
  t3: left("cord", "LegNp(T3)", "mVAC(T3)"),
  abdominalNeuromeres: half("cord", "ANm"),
  neckTectulum: [...left("cord", "NTct(UTct-T1)"), { layer: "cord", name: "IntTct", half: true, zTo: T1T2 }],
  wingTectulum: [...left("cord", "WTct(UTct-T2)"), { layer: "cord", name: "IntTct", half: true, zFrom: T1T2 }],
  haltereTectulum: left("cord", "HTct(UTct-T3)"),
};

const shapes = {
  brain: {} as Record<string, Awaited<ReturnType<typeof blob>>>,
  cord: {} as Record<string, Awaited<ReturnType<typeof blob>>>,
};
for (const [name, sources] of Object.entries(brainBlobs)) shapes.brain[name] = await blob(BRAIN, sources);
for (const [name, sources] of Object.entries(cordBlobs)) shapes.cord[name] = await blob(CORD, sources);

// The central brain with its rind of cell bodies, whole: drawn as one shell round both sides.
const rind = await blob(BRAIN, [{ layer: "compartment", name: "CentralBrain" }]);
const ammc = centroid(await points(BRAIN, left("sub", "AMMC")));
const lamina = await slab(BRAIN, left("brain", "LA"));
const rods = {
  peduncle: await rod(BRAIN, left("brain", "PED")),
  verticalLobe: await rod(BRAIN, left("brain", "aL", "a'L")),
  medialLobe: await rod(BRAIN, left("brain", "bL", "b'L", "gL")),
  bridge: await rod(BRAIN, [{ layer: "brain", name: "PB" }], 9),
};
const ellipsoidBody = await ring(BRAIN, [{ layer: "brain", name: "EB" }]);

// Where each nerve's stub meets the cord's neuropil (the stub's mesh against
// the neuropil's label volume) and the way the stub heads from there, left
// side, in the dataset's frame. The stubs are a dissected cord's, cut a short
// way out, so they say only how each nerve starts.
const CORD_ROOTS: Record<string, { at: V; toward: V }> = {
  ProLN: { at: [497, 519, 591.3], toward: [0.724, 0.555, -0.408] },
  MesoLN: { at: [474.6, 508.7, 825.2], toward: [-0.108, 0.739, 0.665] },
  MetaLN: { at: [454.5, 448.7, 1005.8], toward: [0.022, 0.151, 0.988] },
  ADMN: { at: [478.9, 419.2, 696.4], toward: [0.76, 0.192, -0.622] },
  PDMN: { at: [476.9, 461.7, 692.2], toward: [0.334, -0.936, 0.109] },
  DMetaN: { at: [452.6, 403.8, 817.9], toward: [0.392, -0.385, 0.836] },
  CvN: { at: [434.2, 407.3, 443], toward: [0.669, -0.624, -0.404] },
  AbNT: { at: [416.5, 391.6, 1049.7], toward: [0.171, -0.532, 0.829] },
};
const turn = (f: Frame, d: V): V => [dot(d, f.x), dot(d, f.y), dot(d, f.z)];
const roots = Object.fromEntries(Object.entries(CORD_ROOTS).map(([k, r]) => [k, { at: vec(into(CORD, r.at)), toward: vec(turn(CORD, r.toward)) }]));

const connective = await points(BRAIN, [{ layer: "brain", name: "CV-anterior" }]);

// Points the meshes don't give, measured from the skeletons of the neurons
// annotated with each nerve (the median of where their axons leave the
// tissue, MCNS frame): converted to the brain's frame here.
const NERVE_EXITS: Record<string, V> = {
  antennal: [487.6, 243.8, 94.2],
  pharyngeal: [439, 339, 139],
  accessoryPharyngeal: [437, 352, 147],
  labial: [429.6, 384.5, 197.6],
  corporaCardiaca: [411, 245, 303],
};

const json = (x: unknown) => JSON.stringify(x);
/** An object of shapes, one to a line. */
const table = (o: Record<string, unknown>) => `{\n${Object.entries(o).map(([k, v]) => `  ${k}: ${json(v)},`).join("\n")}\n}`;
const lines = [
  "// Measured by scripts/nerves.ts from the FlyEM male CNS v1.0's neuropil meshes",
  "// (male-cns.janelia.org, CC-BY 4.0). Do not edit by hand: rerun the script.",
  "// Micrometres; +x the fly's left, +y dorsal, +z anterior; left side only.",
  "",
  `/** A blob's radii follow its centre's grid of directions: ${NU} round its first axis, ${NV + 1} rows from one end of that axis to the other. */`,
  `export const BLOB_GRID = { around: ${NU}, rows: ${NV + 1} };`,
  "export type Blob = { centre: readonly number[]; axes: readonly (readonly number[])[]; r: readonly number[] };",
  "export type Slab = { centre: readonly number[]; axes: readonly (readonly number[])[]; rim: readonly number[]; near: readonly number[]; far: readonly number[] };",
  "",
  "/** The brain's frame: origin on the midline at the narrowest point of the oesophageal foramen. */",
  `export const BRAIN_BLOBS: Record<${Object.keys(brainBlobs).map((k) => json(k)).join(" | ")}, Blob> = ${table(shapes.brain)};`,
  `export const BRAIN_RIND: Blob = ${json(rind)};`,
  `/** The lamina, a curved plate, round the centre of the sphere that fits it: ${SLAB_ROWS} rows of directions from its axis out to its rim, ${NU} round. */`,
  `export const LAMINA: Slab = ${json(lamina)};`,
  "/** Rods: points along a centreline, each [x, y, z, radius]. */",
  `export const BRAIN_RODS = ${table(rods)};`,
  `export const ELLIPSOID_BODY = ${json(ellipsoidBody)};`,
  `/** The antennal mechanosensory and motor centre, where Johnston's organ's axons end. */`,
  `export const AMMC = ${json(vec(ammc))};`,
  `/** Where each nerve leaves the brain. */`,
  `export const BRAIN_NERVES = ${table(Object.fromEntries(Object.entries(NERVE_EXITS).map(([k, v]) => [k, vec(into(BRAIN, v))])))};`,
  `/** The connective where it leaves the brain (the middle of its first 20 µm), in the brain's frame. */`,
  `export const CONNECTIVE_EXIT = ${json(vec(centroid(connective.filter((p) => p[1] > most(connective.map((q) => q[1])) - 20))))};`,
  "",
  "/** The cord's frame: origin on the midline at the front of its neuropil. */",
  `export const CORD_BLOBS: Record<${Object.keys(cordBlobs).map((k) => json(k)).join(" | ")}, Blob> = ${table(shapes.cord)};`,
  `/** Where each nerve leaves the cord's neuropil, and the way it heads. */`,
  `export const CORD_NERVES = ${table(roots)};`,
  "",
];
writeFileSync(out, lines.join("\n"));
console.log(`wrote ${path.relative(process.cwd(), out)}`);
