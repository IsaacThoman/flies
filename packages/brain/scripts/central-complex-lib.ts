// The central complex's heading circuit as the probe sees it: the ring of
// E-PG wedges, the groups it reads, the bump's measures, and the diagnostic
// lifts (docs/central-complex.md). Shared by scripts/central-complex.ts.
//
// Positions on the ring come from the wiring, not from a published map: an
// E-PG's dendrites touch those of the E-PGs in the neighbouring wedges, so
// the E-PG → E-PG synapses between the two halves of the protocerebral
// bridge (PB) give each PB glomerulus its two neighbours (`ringCheck`).
// Glomerulus R_i is at position 2(i − 1) and L_j at 2(8 − j) + 1, sixteen
// positions 22.5° apart: R1, L8, R2, L7, … R8, L1. The 9th glomeruli (EPGt)
// are left out.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { compressionRegistry, CompressionType, tableFromIPC } from "apache-arrow";
import lz4 from "lz4js";
import type { Connectome } from "../src/format.ts";
import { ANNOTATION_SHA256 } from "../src/pack-anatomy.ts";
import { OPERATING_POINT, saturatedCounts } from "../src/params.ts";
import type { OperatingPoint, TransmitterFix } from "../src/params.ts";
import { FlyBrain } from "../src/runtime.ts";

export const POSITIONS = 16;
export const STEP = (2 * Math.PI) / POSITIONS;
export const ANNOTATIONS = "packages/brain/data/annotations.feather";
/** FlyEM's per-neuron and per-type transmitter table; optional (wiring part only), fetched by hand (docs/central-complex.md). */
export const TRANSMITTERS = "packages/brain/data/body-neurotransmitters-male-cns-v1.0.feather";
export const TRANSMITTERS_URL = "https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/body-neurotransmitters-male-cns-v1.0.feather";
export const TRANSMITTERS_SHA256 = "95c9289220663abeb3409f3ad9e5a7f8a53f8093f5139d15502cd08da8879621";

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
compressionRegistry.set(CompressionType.LZ4_FRAME, { decode: (b: Uint8Array) => lz4.decompress(b) });

/** Each neuron's instance name from FlyEM's annotations (it carries the PB glomerulus and FB column). */
export function instances(c: Connectome, path = ANNOTATIONS): string[] {
  if (!existsSync(path)) throw new Error(`${path} is missing: npm run brain:fetch downloads it`);
  const bytes = readFileSync(path);
  if (sha(bytes) !== ANNOTATION_SHA256) throw new Error(`${path} isn't the pinned annotations (sha256 ${ANNOTATION_SHA256})`);
  const byId = new Map<number, string>();
  for (const row of tableFromIPC(bytes)) byId.set(Number(row.bodyId), String(row.instance ?? ""));
  return Array.from(c.rootId, (id) => byId.get(id) ?? "");
}

/** FlyEM's type-level consensus transmitter by type, or null when the file isn't there. */
export function consensusTransmitters(path = TRANSMITTERS): Map<string, string> | null {
  if (!existsSync(path)) return null;
  const bytes = readFileSync(path);
  if (sha(bytes) !== TRANSMITTERS_SHA256) throw new Error(`${path} isn't the pinned transmitter table (sha256 ${TRANSMITTERS_SHA256})`);
  const out = new Map<string, string>();
  for (const row of tableFromIPC(bytes)) {
    const type = String(row.cell_type ?? "");
    if (type && !out.has(type)) out.set(type, String(row.consensus_nt ?? ""));
  }
  return out;
}

/** The PB glomerulus in an instance name ("EPG(PB08)_R2" → "R2"), or "". */
export const glomerulus = (instance: string) => /\)_([LR][1-9])(?:_|$)/.exec(instance)?.[1] ?? "";
/** The FB column in an instance name ("FC2A_C2_L" → 2), or 0. */
export const column = (instance: string) => Number(/_C(\d+)/.exec(instance)?.[1] ?? 0);
/** A glomerulus's position on the ring, 0 to 15, or -1 for the 9th glomeruli. */
export function position(g: string): number {
  const k = Number(g.slice(1));
  if (!(k >= 1 && k <= 8)) return -1;
  return g[0] === "R" ? 2 * (k - 1) : 2 * (8 - k) + 1;
}
/** The glomerulus at a position. */
export const glomerulusAt = (p: number) => (p % 2 === 0 ? `R${p / 2 + 1}` : `L${8 - (p - 1) / 2}`);
export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const deg = (a: number) => (a * 180) / Math.PI;

export type Groups = {
  /** The E-PGs at each ring position. */
  epg: Uint32Array[];
  /** P-ENs (both types) by the PB half they are in. */
  pen: { left: Uint32Array; right: Uint32Array };
  /** PFL3s by the DNa02 they reach: a PFL3 reaches the DNa02 of the side opposite its soma. */
  pfl3: { toLeft: Uint32Array; toRight: Uint32Array };
  /** FC2 (A, B, C) by FB column. */
  fc2: Map<number, Uint32Array>;
  /** Every group the runs read, by name. */
  read: Map<string, Uint32Array>;
};

const sides = ["left", "right"] as const;

export function groups(c: Connectome, names: readonly string[]): Groups {
  const ofType = (type: string | RegExp) => c.find({ type: typeof type === "string" ? [type] : type });
  const epg: number[][] = Array.from({ length: POSITIONS }, () => []);
  for (const i of ofType("EPG")) {
    const p = position(glomerulus(names[i]));
    if (p >= 0) epg[p].push(i);
  }
  const pens = [...ofType("PEN_a/PEN1"), ...ofType("PEN_b/PEN2")].sort((a, b) => a - b);
  const pen = {
    left: Uint32Array.from(pens.filter((i) => glomerulus(names[i]).startsWith("L"))),
    right: Uint32Array.from(pens.filter((i) => glomerulus(names[i]).startsWith("R"))),
  };
  const pfl3 = { toLeft: c.find({ type: "PFL3", side: "right" }), toRight: c.find({ type: "PFL3", side: "left" }) };
  const fc2 = new Map<number, number[]>();
  for (const i of ofType(/^FC2[ABC]$/)) {
    const k = column(names[i]);
    (fc2.get(k) ?? fc2.set(k, []).get(k)!).push(i);
  }
  const read = new Map<string, Uint32Array>();
  epg.forEach((ns, p) => read.set(`EPG ${glomerulusAt(p)}`, Uint32Array.from(ns)));
  read.set("PEN, left PB", pen.left);
  read.set("PEN, right PB", pen.right);
  read.set("PFL3 → DNa02 left", pfl3.toLeft);
  read.set("PFL3 → DNa02 right", pfl3.toRight);
  for (const type of ["PEG", "Delta7", "FC2A", "FC2B", "FC2C", "ExR4", "ExR6", "LPsP", "GLNO", "LNO1", "LNO2", "LNOa", "LCNOp", "LCNOpm", "PS196_b", "DNa02", "DNa03"])
    for (const side of sides) read.set(`${type} ${side}`, c.find({ type: [type], side }));
  for (const type of ["ER2_a", "ER2_b", "ER2_c", "ER2_d", "ER4d", "ER4m", "ER5", "ER3w_b", "ER3m", "ER3p_a"])
    for (const side of sides) read.set(`${type} ${side}`, c.find({ type: [type], side }));
  for (let k = 1; k <= 10; k++) for (const side of sides) read.set(`TuBu${String(k).padStart(2, "0")} ${side}`, c.find({ type: [`TuBu${String(k).padStart(2, "0")}`], side }));
  for (const type of ["L1", "L2", "L3", "Mi1", "Tm1", "Tm2", "Tm9", "Dm2", "Mi15"]) for (const side of sides) read.set(`${type} ${side}`, c.find({ type: [type], side }));
  for (const family of ["MeTu1", "MeTu2", "MeTu3", "MeTu4"]) for (const side of sides) read.set(`${family} ${side}`, c.find({ type: new RegExp(`^${family}`), side }));
  return { epg: epg.map((ns) => Uint32Array.from(ns)), pen, pfl3, fc2: new Map([...fc2].map(([k, v]) => [k, Uint32Array.from(v)])), read };
}

/** Spike counts of every read group, binned: call `take` at each bin's end, then `rates` for the last bin's Hz. */
export class Bins {
  readonly names: string[];
  #members: Uint32Array[];
  #last: Float64Array;
  readonly brain: FlyBrain;
  constructor(brain: FlyBrain, read: Map<string, Uint32Array>) {
    this.brain = brain;
    this.names = [...read.keys()];
    this.#members = [...read.values()];
    this.#last = new Float64Array(this.names.length);
    brain.sim.setRecording(true);
  }
  /** Mean rate, Hz, of each group since the previous call, over `ms`. */
  take(ms: number): Float64Array {
    const rec = this.brain.sim.recording!;
    const out = new Float64Array(this.names.length);
    this.#members.forEach((ns, g) => {
      let total = 0;
      for (const i of ns) total += rec[i];
      out[g] = ns.length ? ((total - this.#last[g]) / ns.length / ms) * 1000 : 0;
      this.#last[g] = total;
    });
    return out;
  }
  index(name: string) {
    const k = this.names.indexOf(name);
    if (k < 0) throw new Error(`no group ${name}`);
    return k;
  }
}

export type Bump = {
  /** Mean E-PG rate over the ring, Hz. */
  mean: number;
  /** Population vector length over total activity: 0 for a uniform ring, 1 for one position. */
  amplitude: number;
  /** Population vector angle, radians. */
  phase: number;
  /** Positions at half the peak or more. */
  span: number;
};

/** The bump's measures from the E-PG rate of each position. */
export function bump(rates: ArrayLike<number>): Bump {
  let x = 0, y = 0, total = 0, peak = 0;
  for (let p = 0; p < POSITIONS; p++) {
    x += rates[p] * Math.cos(p * STEP);
    y += rates[p] * Math.sin(p * STEP);
    total += rates[p];
    peak = Math.max(peak, rates[p]);
  }
  let span = 0;
  for (let p = 0; p < POSITIONS; p++) if (peak > 0 && rates[p] >= peak / 2) span++;
  return { mean: total / POSITIONS, amplitude: total > 0 ? Math.hypot(x, y) / total : 0, phase: Math.atan2(y, x), span };
}

/**
 * Criteria fixed by the protocol (docs/central-complex.md) before any run.
 * Each is chosen, not measured: the doc says why each value.
 */
export const CRITERIA = {
  /** Something is firing on the ring, Hz. */
  minMean: 2,
  /** Population vector at least this: activity confined to well under three quarters of the ring. */
  minAmplitude: 0.5,
  /** At most this many positions (135°) at half the peak or more. */
  maxSpan: 6,
  /** The bump's phase within this of where it was put, radians (two positions). */
  phaseTolerance: (45 * Math.PI) / 180,
  /** A held heading has to outlast a walking bout, ms. */
  persistence: 5000,
  /** A bump moved by a turn signal: at least this far, radians, in a second. */
  minShift: (45 * Math.PI) / 180,
  /** Steering worth having: half the DNa02 difference a full odour at one antenna gives, Hz. */
  minSteer: 2,
  /** The steering curve's phase follows the goal column: mean resultant length at least this. */
  minFollow: 0.8,
  /** A response, Hz above the control. */
  minResponse: 1,
} as const;

export const localised = (b: Bump) => b.mean >= CRITERIA.minMean && b.amplitude >= CRITERIA.minAmplitude && b.span <= CRITERIA.maxSpan;

/**
 * Diagnostic lifts of what may stand in the circuit's way (question 4). None
 * is a proposed change to the model: each is the operating point with one
 * thing undone, to see whether that thing is what blocks the circuit.
 */
export type Lift = {
  name: string;
  what: string;
  fixes?: (c: Connectome) => TransmitterFix[];
  /** Synaptic saturation undone on connections between central complex neurons. */
  unsaturate?: boolean;
  /** Spike-frequency adaptation off (everywhere: the engine has one setting). */
  noAdaptation?: boolean;
};

const CX = { class: "CX" } as const;
const MODULATORY = ["DA", "SER", "OCT"];

export const LIFTS: readonly Lift[] = [
  { name: "none", what: "the operating point as it is" },
  {
    name: "nodulus",
    what: "the noduli's muted inputs given a transmitter: LNO1 GABA (FlyEM's consensus and ground truth), GLNO acetylcholine (no evidence: FlyEM's is 'unclear'; the sign that would let it carry a turn)",
    fixes: () => [
      { reason: "diagnostic: LNO1 as FlyEM's consensus", select: { type: ["LNO1"] }, nt: "GABA" },
      { reason: "diagnostic: GLNO excitatory", select: { type: ["GLNO"] }, nt: "ACH" },
    ],
  },
  {
    name: "nodulus-inhibitory",
    what: "as nodulus, but GLNO glutamatergic (the other sign it could have)",
    fixes: () => [
      { reason: "diagnostic: LNO1 as FlyEM's consensus", select: { type: ["LNO1"] }, nt: "GABA" },
      { reason: "diagnostic: GLNO inhibitory", select: { type: ["GLNO"] }, nt: "GLUT" },
    ],
  },
  {
    name: "glno-excitatory",
    what: "GLNO alone made excitatory (added after the protocol, to tell the nodulus lift's two changes apart)",
    fixes: () => [{ reason: "diagnostic: GLNO excitatory", select: { type: ["GLNO"] }, nt: "ACH" }],
  },
  {
    name: "modulators",
    what: "central complex neurons muted for a monoamine (EL, ExR2, ExR3, PFGs, PFR_a and FB tangential types) made excitatory, as Shiu et al. reportedly had them",
    fixes: () => [{ reason: "diagnostic: monoamines excitatory in the central complex", select: { ...CX, nt: MODULATORY }, nt: "ACH" }],
  },
  {
    name: "glutamate-excitatory",
    what: "central complex neurons predicted glutamatergic (Delta7, ExR4–6, FB types) made excitatory: glutamate counted as excitatory here",
    fixes: () => [{ reason: "diagnostic: glutamate excitatory in the central complex", select: { ...CX, nt: "GLUT" }, nt: "ACH" }],
  },
  {
    name: "glutamate-muted",
    what: "central complex neurons predicted glutamatergic muted, to see what their inhibition does",
    fixes: () => [{ reason: "diagnostic: glutamate muted in the central complex", select: { ...CX, nt: "GLUT" }, nt: "" }],
  },
  { name: "unsaturated", what: "synaptic saturation undone on connections between central complex neurons", unsaturate: true },
  { name: "no-adaptation", what: "spike-frequency adaptation off (everywhere)", noAdaptation: true },
  {
    name: "all",
    what: "nodulus, modulators, unsaturated and no-adaptation together (glutamate as it is)",
    fixes: () => [
      { reason: "diagnostic: LNO1 as FlyEM's consensus", select: { type: ["LNO1"] }, nt: "GABA" },
      { reason: "diagnostic: GLNO excitatory", select: { type: ["GLNO"] }, nt: "ACH" },
      { reason: "diagnostic: monoamines excitatory in the central complex", select: { ...CX, nt: MODULATORY }, nt: "ACH" },
    ],
    unsaturate: true,
    noAdaptation: true,
  },
];

export function lift(name: string): Lift {
  const found = LIFTS.find((l) => l.name === name);
  if (!found) throw new Error(`--lift is one of ${LIFTS.map((l) => l.name).join(", ")}`);
  return found;
}

/**
 * A brain at the operating point with a lift applied. Learning is off: with
 * no Kenyon cell firing it changes no spike in these runs (the doc says how
 * that was checked), and the unsaturated lift needs the plastic edges.
 */
export function brainWith(c: Connectome, seed: number, l: Lift): FlyBrain {
  const point: OperatingPoint = {
    ...OPERATING_POINT,
    fixes: [...OPERATING_POINT.fixes, ...(l.fixes?.(c) ?? [])],
    neuron: l.noAdaptation ? { ...OPERATING_POINT.neuron, adaptation: { ...OPERATING_POINT.neuron.adaptation, increment: 0 } } : OPERATING_POINT.neuron,
  };
  const brain = new FlyBrain(c, { seed, operatingPoint: point, learning: false });
  if (l.unsaturate) {
    const inCx = new Uint8Array(c.neurons);
    for (const i of c.find(CX)) inCx[i] = 1;
    const saturated = saturatedCounts(c.count, OPERATING_POINT.saturation);
    const edges: number[] = [];
    const factors: number[] = [];
    for (let i = 0; i < c.neurons; i++) {
      if (!inCx[i]) continue;
      for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) {
        if (!inCx[c.post[e]] || saturated[e] === c.count[e]) continue;
        edges.push(e);
        factors.push(c.count[e] / saturated[e]);
      }
    }
    brain.sim.setPlasticEdges(edges);
    factors.forEach((f, k) => brain.sim.setPlasticFactor(k, f));
  }
  return brain;
}

/** Ranges over seeds: "lo–hi", or one number when they agree at that precision. */
export function range(xs: readonly number[], digits = 1): string {
  if (xs.length === 0) return "-";
  const lo = Math.min(...xs).toFixed(digits);
  const hi = Math.max(...xs).toFixed(digits);
  return lo === hi ? lo : `${lo}–${hi}`;
}
