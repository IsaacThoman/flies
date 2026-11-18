// Can the central complex hold a heading and steer by it? A diagnostic with
// its criteria fixed beforehand: docs/central-complex.md is the protocol and
// the results. Nothing here changes the model; every drive is a diagnostic
// input on top of the brain as the game runs it (eyes shut but in part 5,
// standing, the visual background on), and every lift is labelled one.
//
//   node packages/brain/scripts/central-complex.ts --part wiring|bump|move|steer|eyes [--lift none] [--seeds 1,2,3]
//
// Parts (the doc's questions):
//   wiring  the ring's order from the wiring, the P-EN shifts, what reaches
//           the P-ENs and from where, the ring neurons' maps onto the E-PGs,
//           PFL3 to DNa02, FC2's columns, and the transmitters and saturation
//           the circuit runs at (static; FlyEM's transmitter table is used
//           when present, see the doc)
//   bump    (1) a bump: E-PG wedges kicked and let go, the whole ring driven
//           evenly, and each visual ring neuron against an evenly driven ring;
//           then, added after the protocol, the even drive as a depolarising
//           bias (forced spikes can't be inhibited) and a kick on a ring
//           depolarised below threshold
//   move    (2) the eyes under rotation, the brain's own turns at rest, and a
//           bump pushed by one side's P-ENs
//   steer   (3) a bump held at each position with a goal in each FB column:
//           PFL3 and DNa02, left against right
//   eyes    (5) a bar at each azimuth: MeTu, TuBu, ring neurons, E-PGs
// --lift   applies one of the diagnostic lifts (4) to bump, move, steer or eyes.
// About 2 (wiring), 3 (bump), 3 (move), 6 (steer) and 2 (eyes) minutes a lift on an M5 Pro.

import { parseArgs } from "node:util";
import { readConnectomeFile } from "../src/node.ts";
import { OPERATING_POINT, buildWeights, saturatedCounts } from "../src/params.ts";
import type { FlyBrain } from "../src/runtime.ts";
import { facetAngles, render } from "../src/stimuli.ts";
import type { Scene } from "../src/stimuli.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";
import {
  Bins, CRITERIA, POSITIONS, STEP, brainWith, bump, consensusTransmitters, deg, glomerulus, glomerulusAt,
  groups, instances, lift, localised, position, range, wrap,
} from "./central-complex-lib.ts";

const { values } = parseArgs({
  options: {
    part: { type: "string", default: "wiring" },
    lift: { type: "string", default: "none" },
    seeds: { type: "string", default: "1,2,3" },
  },
});
const PARTS = ["wiring", "bump", "move", "steer", "eyes"];
if (!PARTS.includes(values.part)) throw new Error(`--part is one of ${PARTS.join(", ")}`);
const seeds = values.seeds.split(",").map(Number);
const c = readConnectomeFile();
const names = instances(c);
const g = groups(c, names);
const L = lift(values.lift);

/**
 * Drive rates and biases, fixed by the protocol. The doc gives each one's
 * source, or says it is chosen and why.
 */
const DRIVE = {
  /** An E-PG inside the bump. */
  epg: 30,
  /** An evenly driven ring, each E-PG. */
  epgEven: 10,
  /** A ring neuron seeing its feature. */
  ring: 30,
  /** An FC2 neuron of the goal's column. */
  fc2: 30,
  /** One PB half's P-ENs made more excitable, mV: below threshold (7), so they fire only with the E-PGs' input. */
  penBias: [3, 6],
};
const BIN = 250;
const SETTLE = 2000;
const REST: BrainSenses = RESTING_SENSES;

const typeOf = (i: number) => c.columns.type.value(i) || "?";
const sideOf = (i: number) => c.columns.side.value(i)?.[0] ?? "-";

// ---------------------------------------------------------------- wiring

function wiring() {
  const w = buildWeights(c, OPERATING_POINT);
  const consensus = consensusTransmitters();
  const status = (i: number) => (w.gain[i] > 0 ? "+" : w.gain[i] < 0 ? "−" : "muted");
  console.log(`Wiring (FlyEM male CNS; transmitters as the operating point has them${consensus ? ", FlyEM's type consensus beside them" : "; FlyEM's table not found, see the doc"})\n`);

  // W1: the ring's order. Each glomerulus's two strongest E-PG targets in the other PB half.
  console.log("W1. E-PG → E-PG across the PB halves: each glomerulus's two strongest targets, and whether they are its ring neighbours");
  let agree = 0;
  for (let p = 0; p < POSITIONS; p++) {
    const from = g.epg[p];
    const half = glomerulusAt(p)[0];
    const to = new Map<number, number>();
    for (const i of from) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) {
      const q = position(glomerulus(names[c.post[e]]));
      if (q < 0 || typeOf(c.post[e]) !== "EPG" || glomerulusAt(q)[0] === half) continue;
      to.set(q, (to.get(q) ?? 0) + c.count[e]);
    }
    const top = [...to].sort((a, b) => b[1] - a[1]).slice(0, 2);
    const neighbours = top.every(([q]) => Math.abs(wrap((q - p) * STEP)) < 1.5 * STEP);
    if (neighbours) agree++;
    console.log(`  ${glomerulusAt(p).padEnd(3)} (position ${String(p).padStart(2)}, ${from.length} E-PGs) → ${top.map(([q, n]) => `${glomerulusAt(q)} ${n}`).join(", ")}${neighbours ? "" : "  NOT neighbours"}`);
  }
  console.log(`  ${agree} of ${POSITIONS} glomeruli's two strongest cross-half targets are their two neighbours on the ring R1, L8, R2, L7, … R8, L1\n`);

  // W2: angular shifts, PB glomerulus to the target's position.
  console.log("W2. Mean shift from a neuron's PB glomerulus to its targets' (synapse-weighted, degrees; positive is toward rising position)");
  const shift = (pre: string, post: string) => {
    const P = c.find({ type: [pre] });
    const Q = new Uint8Array(c.neurons);
    for (const i of c.find({ type: [post] })) Q[i] = 1;
    return (["L", "R"] as const).map((half) => {
      let x = 0, y = 0, n = 0;
      for (const i of P) {
        const p = position(glomerulus(names[i]));
        if (p < 0 || glomerulus(names[i])[0] !== half) continue;
        for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) {
          const q = position(glomerulus(names[c.post[e]]));
          if (!Q[c.post[e]] || q < 0) continue;
          x += c.count[e] * Math.cos((q - p) * STEP);
          y += c.count[e] * Math.sin((q - p) * STEP);
          n += c.count[e];
        }
      }
      return `${half} PB ${n ? deg(Math.atan2(y, x)).toFixed(0).padStart(4) + "°" : "   -"} (${n} synapses)`;
    }).join(", ");
  };
  for (const [a, b] of [["EPG", "PEN_a/PEN1"], ["EPG", "PEN_b/PEN2"], ["PEN_a/PEN1", "EPG"], ["PEN_b/PEN2", "EPG"], ["EPG", "PEG"], ["PEG", "EPG"], ["EPG", "PFL3"]])
    console.log(`  ${`${a} → ${b}`.padEnd(24)} ${shift(a, b)}`);
  console.log();

  // W3: inputs to the ring's cells.
  const inputs = (title: string, targets: Uint32Array, top: number) => {
    const T = new Uint8Array(c.neurons);
    for (const i of targets) T[i] = 1;
    const by = new Map<string, { syn: number; cells: Set<number> }>();
    let total = 0;
    for (let i = 0; i < c.neurons; i++) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) {
      if (!T[c.post[e]]) continue;
      const k = typeOf(i);
      const r = by.get(k) ?? by.set(k, { syn: 0, cells: new Set() }).get(k)!;
      r.syn += c.count[e];
      r.cells.add(i);
      total += c.count[e];
    }
    console.log(`${title}: ${targets.length} neurons, ${total.toLocaleString("en-US")} input synapses; the largest input types`);
    for (const [k, r] of [...by].sort((a, b) => b[1].syn - a[1].syn).slice(0, top)) {
      const i = [...r.cells][0];
      const nt = w.nt[i] || "none";
      console.log(`  ${k.padEnd(14)} ${String(r.syn).padStart(6)} (${((100 * r.syn) / total).toFixed(1).padStart(4)}%)  ${String(r.cells.size).padStart(3)} cells  ${status(i).padEnd(5)} ${nt.padEnd(5)}${consensus ? ` FlyEM ${consensus.get(k.replace("/PEN1", "(PEN1)").replace("/PEN2", "(PEN2)")) ?? "-"}` : ""}`);
    }
    console.log();
  };
  console.log("W3. What reaches the ring");
  inputs("  P-EN (PEN_a, PEN_b)", Uint32Array.from([...g.pen.left, ...g.pen.right]), 14);
  inputs("  E-PG", c.find({ type: ["EPG"] }), 14);
  inputs("  PFL3", c.find({ type: ["PFL3"] }), 10);
  inputs("  MeTu1 (the anterior visual pathway's way in)", c.find({ type: ["MeTu1"] }), 4);
  inputs("  MeTu3c", c.find({ type: ["MeTu3c"] }), 4);

  // W4: the noduli's inputs, what they reach of the ring's cells and what reaches them.
  console.log("W4. The noduli's inputs: synapses onto the P-ENs and the PFNs, their status, and their own largest inputs");
  const penSet = new Uint8Array(c.neurons);
  for (const i of [...g.pen.left, ...g.pen.right]) penSet[i] = 1;
  const pfn = new Uint8Array(c.neurons);
  for (const i of c.find({ type: /^PFN/ })) pfn[i] = 1;
  for (const type of ["GLNO", "LNO1", "LNO2", "LNO3", "LNOa", "LCNOp", "LCNOpm", "LPsP"]) {
    const ns = c.find({ type: [type] });
    if (ns.length === 0) continue;
    let toPen = 0, toPfn = 0, fromPen = 0;
    for (const i of ns) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) {
      if (penSet[c.post[e]]) toPen += c.count[e];
      if (pfn[c.post[e]]) toPfn += c.count[e];
    }
    for (const i of [...g.pen.left, ...g.pen.right]) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) if (ns.includes(c.post[e])) fromPen += c.count[e];
    const into = new Map<string, number>();
    const set = new Uint8Array(c.neurons);
    for (const i of ns) set[i] = 1;
    for (let i = 0; i < c.neurons; i++) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) if (set[c.post[e]]) into.set(typeOf(i), (into.get(typeOf(i)) ?? 0) + c.count[e]);
    const top = [...into].filter(([k]) => k !== type && !/^PEN|^EPG/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 4);
    console.log(`  ${type.padEnd(7)} ${ns.length} cells  ${status(ns[0]).padEnd(5)} predicted ${c.columns.nt.value(ns[0]) || "none"}${consensus ? `, FlyEM ${consensus.get(type) ?? "-"}` : ""}; → P-EN ${toPen}, ← P-EN ${fromPen}, → PFN ${toPfn}; from ${top.map(([k, n]) => `${k} ${n}`).join(", ")}`);
  }
  console.log();

  // W5: routes to the P-ENs and their nodulus inputs from what steers the fly now, and from the eyes' rotation cells.
  console.log("W5. Routes, direct and through one neuron (each route counted by its weaker leg; every neuron's sign as the operating point has it)");
  const dna02 = c.find({ type: ["DNa02"] });
  const upstream = new Map<number, number>();
  for (let i = 0; i < c.neurons; i++) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) if (dna02.includes(c.post[e])) upstream.set(i, (upstream.get(i) ?? 0) + c.count[e]);
  const steerers = Uint32Array.from([...upstream].filter(([i]) => !dna02.includes(i)).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([i]) => i));
  const rotation = c.find({ type: /^(HSN|HSE|HSS|H2|VS|VSm|LPT\d+)$/, superClass: "visual_projection" });
  const route = (from: Uint32Array, toTypes: string[]) => {
    const T = new Uint8Array(c.neurons);
    for (const i of c.find({ type: toTypes })) T[i] = 1;
    const F = new Uint8Array(c.neurons);
    for (const i of from) F[i] = 1;
    let direct = 0;
    const mid = new Map<number, number>();
    for (const i of from) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) {
      if (T[c.post[e]]) direct += c.count[e];
      else mid.set(c.post[e], (mid.get(c.post[e]) ?? 0) + c.count[e]);
    }
    let via = 0;
    let best = { n: 0, label: "" };
    for (const [m, a] of mid) {
      if (F[m]) continue;
      let b = 0;
      for (let e = c.ptr[m]; e < c.ptr[m + 1]; e++) if (T[c.post[e]]) b += c.count[e];
      const r = Math.min(a, b);
      via += r;
      if (r > best.n) best = { n: r, label: `${typeOf(m)} ${sideOf(m)} (${status(m)}) ${a}→${b}` };
    }
    return `direct ${direct}, through one ${via}${best.n ? `, strongest ${best.label}` : ""}`;
  };
  for (const [what, from] of [[`DNa02's 40 largest inputs (${steerers.length})`, steerers], [`the lobula plate's tangential projection cells (${rotation.length})`, rotation]] as const) {
    console.log(`  from ${what}:`);
    for (const to of [["PEN_a/PEN1", "PEN_b/PEN2"], ["GLNO"], ["LNO1", "LNO2", "LNOa", "LCNOp", "LCNOpm"], ["LPsP"], ["PS196_b"]]) console.log(`    to ${to.join(", ").padEnd(32)} ${route(from, to)}`);
  }
  console.log();

  // W6: the ring neurons' maps onto the E-PGs.
  console.log("W6. Ring neurons onto the E-PGs by ring position: each neuron's population vector length (0 even, 1 one position)");
  const posOf = new Int8Array(c.neurons).fill(-1);
  g.epg.forEach((ns, p) => ns.forEach((i) => (posOf[i] = p)));
  for (const type of ["ER2_a", "ER2_b", "ER2_c", "ER2_d", "ER4d", "ER4m", "ER3w_b", "ER5", "ER1_b"]) {
    const amps: number[] = [];
    let syn = 0;
    for (const i of c.find({ type: [type] })) {
      const r = new Float64Array(POSITIONS);
      for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) if (posOf[c.post[e]] >= 0) r[posOf[c.post[e]]] += c.count[e];
      // Per E-PG, so a position with more E-PGs doesn't look preferred.
      for (let p = 0; p < POSITIONS; p++) r[p] /= g.epg[p].length;
      const b = bump(r);
      if (b.mean > 0) amps.push(b.amplitude);
      for (let p = 0; p < POSITIONS; p++) syn += r[p] * g.epg[p].length;
    }
    amps.sort((a, b) => a - b);
    console.log(`  ${type.padEnd(7)} ${String(amps.length).padStart(2)} cells, ${String(Math.round(syn)).padStart(6)} synapses onto E-PGs; length median ${amps[amps.length >> 1]?.toFixed(2) ?? "-"}, largest ${amps.at(-1)?.toFixed(2) ?? "-"}`);
  }
  console.log();

  // W7: PFL3 to the steering neurons, and FC2's columns onto PFL3.
  console.log("W7. PFL3 onto the steering descending neurons (synapses; a PFL3 reaches the DNa02 opposite its soma), and FC2's goal columns");
  for (const [k, ns] of [["PFL3 → DNa02 left (somata right)", g.pfl3.toLeft], ["PFL3 → DNa02 right (somata left)", g.pfl3.toRight]] as const) {
    const t: Record<string, number> = {};
    for (const i of ns) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) {
      const j = c.post[e];
      if (!/^DNa0[23]$/.test(typeOf(j))) continue;
      const key = `${typeOf(j)} ${c.columns.side.value(j)}`;
      t[key] = (t[key] ?? 0) + c.count[e];
    }
    console.log(`  ${k.padEnd(34)} ${Object.entries(t).sort().map(([a, b]) => `${a} ${b}`).join(", ")}`);
  }
  const goal = goalAngles();
  for (const [col, ns] of [...g.fc2].sort((a, b) => a[0] - b[0])) console.log(`  FC2 column C${col}: ${ns.length} cells; its PFL3 targets' PB positions centre on ${deg(goal.get(col)!).toFixed(0)}°`);
  console.log();

  // W8: transmitters in the central complex.
  console.log("W8. Central complex neurons (class CX) by transmitter as the operating point has it");
  const cx = c.find({ class: "CX" });
  const tally = new Map<string, Map<string, number>>();
  for (const i of cx) {
    const k = w.nt[i] || "none";
    const m = tally.get(k) ?? tally.set(k, new Map()).get(k)!;
    m.set(typeOf(i), (m.get(typeOf(i)) ?? 0) + 1);
  }
  for (const [k, m] of [...tally].sort((a, b) => [...b[1].values()].reduce((x, y) => x + y) - [...a[1].values()].reduce((x, y) => x + y))) {
    const n = [...m.values()].reduce((x, y) => x + y);
    const types = [...m].sort((a, b) => b[1] - a[1]);
    console.log(`  ${k.padEnd(5)} ${String(n).padStart(4)} neurons, ${types.length} types${k === "GLUT" || /none|DA|SER|OCT/.test(k) ? `: ${types.slice(0, 14).map(([t, x]) => `${t} ${x}`).join(", ")}${types.length > 14 ? ", …" : ""}` : ""}`);
  }
  if (consensus) {
    const differ: string[] = [];
    for (const t of new Set(Array.from(cx, typeOf))) {
      const i = c.find({ type: [t], class: "CX" })[0];
      const mine = w.nt[i] || "none";
      const theirs = consensus.get(t);
      const code: Record<string, string> = { acetylcholine: "ACH", gaba: "GABA", glutamate: "GLUT", dopamine: "DA", serotonin: "SER", octopamine: "OCT" };
      if (theirs && code[theirs] && code[theirs] !== mine) differ.push(`${t} ${mine}→${code[theirs]}`);
    }
    console.log(`  types whose first neuron's transmitter here differs from FlyEM's type consensus: ${differ.length ? differ.join(", ") : "none"}`);
  }
  console.log();

  // W9: synaptic saturation on the ring's own connections.
  console.log("W9. Synaptic saturation on connections between central complex neurons");
  const sat = saturatedCounts(c.count, OPERATING_POINT.saturation);
  const pairs: [string, string][] = [["EPG", "PEN_a/PEN1"], ["EPG", "PEN_b/PEN2"], ["PEN_a/PEN1", "EPG"], ["PEN_b/PEN2", "EPG"], ["EPG", "PEG"], ["PEG", "EPG"], ["EPG", "EPG"], ["EPG", "Delta7"], ["Delta7", "EPG"], ["ER4m", "EPG"], ["ER2_c", "EPG"]];
  for (const [a, b] of pairs) {
    const B = new Uint8Array(c.neurons);
    for (const i of c.find({ type: [b] })) B[i] = 1;
    let raw = 0, kept = 0, n = 0, over = 0;
    for (const i of c.find({ type: [a] })) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) {
      if (!B[c.post[e]]) continue;
      raw += c.count[e];
      kept += sat[e];
      n++;
      if (c.count[e] >= 50) over++;
    }
    console.log(`  ${`${a} → ${b}`.padEnd(24)} ${String(n).padStart(4)} connections, ${(raw / Math.max(1, n)).toFixed(0).padStart(3)} synapses on average, ${String(over).padStart(3)} of 50 or more; ${((100 * kept) / Math.max(1, raw)).toFixed(0)}% kept`);
  }
  let raw = 0, kept = 0;
  const cxSet = new Uint8Array(c.neurons);
  for (const i of cx) cxSet[i] = 1;
  for (const i of cx) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) if (cxSet[c.post[e]]) {
    raw += c.count[e];
    kept += sat[e];
  }
  console.log(`  all central complex → central complex: ${((100 * kept) / raw).toFixed(0)}% of ${raw.toLocaleString("en-US")} synapses kept (the whole connectome: 82%)`);
}

/** Each FC2 column's goal: the circular mean PB position of the PFL3s it synapses onto, by synapses. */
function goalAngles(): Map<number, number> {
  const out = new Map<number, number>();
  const pfl = new Map(Array.from(c.find({ type: ["PFL3"] }), (i) => [i, position(glomerulus(names[i]))] as const));
  for (const [col, ns] of g.fc2) {
    let x = 0, y = 0;
    for (const i of ns) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) {
      const p = pfl.get(c.post[e]);
      if (p === undefined || p < 0) continue;
      x += c.count[e] * Math.cos(p * STEP);
      y += c.count[e] * Math.sin(p * STEP);
    }
    out.set(col, Math.atan2(y, x));
  }
  return out;
}

// ------------------------------------------------------------- simulation

/** A fresh brain with the diagnostic inputs every run of a part has (at 0), settled at rest. */
function settled(seed: number, add: (brain: FlyBrain) => void, senses: BrainSenses = REST) {
  const brain = brainWith(c, seed, L);
  add(brain);
  for (let t = 0; t < SETTLE; t += 10) brain.tick(10, senses);
  return brain;
}

/** Runs `ms` in bins, calling `each` with each bin's rates. */
function run(brain: FlyBrain, bins: Bins, ms: number, each: (rates: Float64Array, t: number) => void, senses: BrainSenses = REST) {
  for (let t = 0; t < ms; t += BIN) {
    for (let s = 0; s < BIN; s += 10) brain.tick(10, senses);
    each(bins.take(BIN), t + BIN);
  }
}

const epgRates = (bins: Bins, rates: Float64Array) => Float64Array.from({ length: POSITIONS }, (_, p) => rates[bins.index(`EPG ${glomerulusAt(p)}`)]);
const around = (centre: number) => [centre - 1, centre, centre + 1].map((p) => (p + POSITIONS) % POSITIONS);
const epgAt = (ps: number[]) => Uint32Array.from(ps.flatMap((p) => [...g.epg[p]]).sort((a, b) => a - b));
const allEpg = () => epgAt(Array.from({ length: POSITIONS }, (_, p) => p));
const fmtBump = (b: ReturnType<typeof bump>) => `${b.mean.toFixed(1).padStart(5)} Hz, length ${b.amplitude.toFixed(2)}, ${String(b.span).padStart(2)} wide, at ${deg(b.phase).toFixed(0).padStart(4)}°`;

function bumpPart() {
  console.log(`Question 1, does a bump form and stay? Lift: ${L.name} (${L.what}). Seeds ${seeds.join(", ")}.`);
  console.log(`Localised: E-PG mean ≥ ${CRITERIA.minMean} Hz, length ≥ ${CRITERIA.minAmplitude}, at most ${CRITERIA.maxSpan} positions at half the peak; persistence: localised and within ${deg(CRITERIA.phaseTolerance)}° of where it was put.\n`);

  // 1a: three neighbouring wedges kicked for 1 s, then let go for 10 s.
  console.log(`1a. Three neighbouring positions' E-PGs at ${DRIVE.epg} Hz for 1 s, then nothing for 10 s`);
  const persisted: number[] = [];
  const driven: boolean[] = [];
  for (const seed of seeds) for (const centre of [0, 4, 8, 12]) {
    const target = centre * STEP;
    const brain = settled(seed, (b) => b.sim.addInput("kick", epgAt(around(centre)), 0));
    const bins = new Bins(brain, g.read);
    brain.sim.setRate("kick", DRIVE.epg);
    const during: ReturnType<typeof bump>[] = [];
    run(brain, bins, 1000, (r) => during.push(bump(epgRates(bins, r))));
    brain.sim.setRate("kick", 0);
    let held = 0;
    let lost = false;
    const after: string[] = [];
    run(brain, bins, 10000, (r, t) => {
      const b = bump(epgRates(bins, r));
      if (!lost && localised(b) && Math.abs(wrap(b.phase - target)) <= CRITERIA.phaseTolerance) held = t;
      else lost = true;
      if (t % 1000 === 0 && t <= 3000) after.push(`${t / 1000} s: ${fmtBump(b)}`);
    });
    const last = during.at(-1)!;
    const ok = localised(last) && Math.abs(wrap(last.phase - target)) <= CRITERIA.phaseTolerance;
    driven.push(ok);
    persisted.push(held);
    console.log(`  seed ${seed}, centred on ${glomerulusAt(centre).padEnd(3)} (${String(deg(target)).padStart(3)}°): driven ${fmtBump(last)} ${ok ? "localised" : "NOT localised"}; held ${(held / 1000).toFixed(2)} s after; ${after.join("; ")}`);
  }
  console.log(`  localised while driven: ${driven.filter(Boolean).length} of ${driven.length}; held after the drive: ${range(persisted.map((x) => x / 1000), 2)} s (criterion ${CRITERIA.persistence / 1000} s)\n`);

  // What fires with a kicked bump, to see where the activity goes.
  {
    const brain = settled(seeds[0], (b) => b.sim.addInput("kick", epgAt(around(4)), 0));
    const bins = new Bins(brain, g.read);
    brain.sim.setRate("kick", DRIVE.epg);
    let rates: ArrayLike<number> = new Float64Array(bins.names.length);
    run(brain, bins, 1000, (r) => (rates = r));
    const show = ["PEN, left PB", "PEN, right PB", "PEG left", "PEG right", "Delta7 left", "Delta7 right", "ExR6 left", "ExR6 right", "ExR4 left", "ExR4 right", "PFL3 → DNa02 left", "PFL3 → DNa02 right", "LPsP left", "LPsP right", "ER4m left", "ER2_c left", "ER4d left"];
    console.log(`  in the last 250 ms of the kick (seed ${seeds[0]}, centred on R3): ${show.map((n) => `${n} ${rates[bins.index(n)].toFixed(1)}`).join(", ")} Hz\n`);
  }

  // 1c and 1b as the protocol has them: an even drive of forced spikes.
  evenParts({ kind: "forced" });

  // Added after the protocol (the doc says why): a forced spike can't be inhibited, so the
  // even drive is also given as a depolarising bias on every E-PG, which inhibition can act on.
  console.log("Added after the protocol: the even drive as a bias on every E-PG instead of forced spikes. Calibration, every E-PG biased for 2 s:");
  const calibration = EVEN_BIAS.map((mV) => ({ mV, mean: seeds.map((seed) => bump(evenWith(seed, null, { kind: "bias", mV })).mean) }));
  for (const { mV, mean } of calibration) console.log(`  ${mV} mV: E-PG mean ${range(mean)} Hz`);
  const chosen = calibration.reduce((a, b) => (Math.abs(avg(b.mean) - DRIVE.epgEven) < Math.abs(avg(a.mean) - DRIVE.epgEven) ? b : a));
  console.log(`  the bias nearest the even rate (${DRIVE.epgEven} Hz) on average: ${chosen.mV} mV\n`);
  evenParts({ kind: "bias", mV: chosen.mV });

  // 1d, added after the protocol: a kicked bump on a ring made excitable, to see how far it is from holding.
  console.log("1d (added after the protocol). Every E-PG biased below threshold, then three positions kicked as in 1a (centred on R3), and let go");
  for (const mV of [3, 5, 6, 6.5]) {
    const held: number[] = [];
    for (const seed of seeds) {
      const brain = settled(seed, (b) => {
        b.sim.addInput("kick", epgAt(around(4)), 0);
        b.sim.addExcitability("epg bias", allEpg());
        b.sim.setExcitability("epg bias", new Float64Array(allEpg().length).fill(mV));
      });
      const bins = new Bins(brain, g.read);
      brain.sim.setRate("kick", DRIVE.epg);
      run(brain, bins, 1000, () => {});
      brain.sim.setRate("kick", 0);
      let t0 = 0;
      let lost = false;
      run(brain, bins, 10000, (r, t) => {
        const b = bump(epgRates(bins, r));
        if (!lost && localised(b) && Math.abs(wrap(b.phase - 4 * STEP)) <= CRITERIA.phaseTolerance) t0 = t;
        else lost = true;
      });
      held.push(t0 / 1000);
    }
    console.log(`  ${mV} mV: held ${range(held, 2)} s after the kick`);
  }
}

type Even = { kind: "forced" } | { kind: "bias"; mV: number };
const EVEN_BIAS = [7.5, 8, 9, 10];
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function evenParts(even: Even) {
  const how = even.kind === "forced" ? `forced at ${DRIVE.epgEven} Hz` : `biased by ${even.mV} mV`;
  // 1c: the whole ring evenly, 2 s, then let go: does a bump form by itself?
  console.log(`1c. Every E-PG ${how} for 2 s, then nothing for 3 s: a bump forming from an even drive`);
  for (const seed of seeds) {
    const brain = settled(seed, (b) => addEven(b, even));
    const bins = new Bins(brain, g.read);
    setEven(brain, even, true);
    const during: ReturnType<typeof bump>[] = [];
    run(brain, bins, 2000, (r) => during.push(bump(epgRates(bins, r))));
    setEven(brain, even, false);
    const after: ReturnType<typeof bump>[] = [];
    run(brain, bins, 3000, (r) => after.push(bump(epgRates(bins, r))));
    const formed = during.filter(localised).length;
    console.log(`  seed ${seed}: driven, last bin ${fmtBump(during.at(-1)!)}; localised in ${formed} of ${during.length} bins; after, 1 s: ${fmtBump(after[3])}`);
  }
  console.log();

  // 1b: each visual ring neuron against an evenly driven ring.
  console.log(`1b. Each ring neuron of the visual types (ER2_a–d, ER4d) at ${DRIVE.ring} Hz, with every E-PG ${how}, 2 s: the E-PG pattern against the even drive alone`);
  const ring = c.find({ type: ["ER2_a", "ER2_b", "ER2_c", "ER2_d", "ER4d"] });
  const byType = new Map<string, { lengths: number[]; drops: number[]; localisedCount: number; n: number }>();
  for (const seed of seeds) {
    const control = evenWith(seed, null, even);
    for (const i of ring) {
      const r = evenWith(seed, i, even);
      // The pattern the ring neuron carves: how much each position lost.
      const lost = r.map((x, p) => Math.max(0, control[p] - x));
      const shaped = bump(r);
      const carve = bump(lost);
      const key = typeOf(i);
      const t = byType.get(key) ?? byType.set(key, { lengths: [], drops: [], localisedCount: 0, n: 0 }).get(key)!;
      t.n++;
      t.lengths.push(carve.amplitude);
      t.drops.push(bump(control).mean - shaped.mean);
      if (localised(shaped)) t.localisedCount++;
    }
    console.log(`  seed ${seed}: the even drive alone ${fmtBump(bump(control))}`);
  }
  for (const [type, t] of byType) {
    t.lengths.sort((a, b) => a - b);
    console.log(`  ${type.padEnd(6)} ${t.n} runs: E-PG mean lowered by ${range(t.drops)} Hz; the loss's population vector length median ${t.lengths[t.lengths.length >> 1].toFixed(2)}, largest ${t.lengths.at(-1)!.toFixed(2)}; a localised bump left in ${t.localisedCount}`);
  }
  console.log();
}

function addEven(brain: FlyBrain, even: Even) {
  if (even.kind === "forced") brain.sim.addInput("even", allEpg(), 0);
  else brain.sim.addExcitability("even", allEpg());
}

function setEven(brain: FlyBrain, even: Even, on: boolean) {
  if (even.kind === "forced") brain.sim.setRate("even", on ? DRIVE.epgEven : 0);
  else brain.sim.setExcitability("even", new Float64Array(allEpg().length).fill(on ? even.mV : 0));
}

/** E-PG rate by position over 2 s of an evenly driven ring, with one ring neuron driven too (or none). */
function evenWith(seed: number, ringNeuron: number | null, even: Even): Float64Array {
  const brain = settled(seed, (b) => {
    addEven(b, even);
    b.sim.addInput("ring", ringNeuron === null ? [] : [ringNeuron], 0);
  });
  const bins = new Bins(brain, g.read);
  setEven(brain, even, true);
  if (ringNeuron !== null) brain.sim.setRate("ring", DRIVE.ring);
  const sum = new Float64Array(POSITIONS);
  let n = 0;
  run(brain, bins, 2000, (r) => {
    epgRates(bins, r).forEach((x, p) => (sum[p] += x));
    n++;
  });
  return sum.map((x) => x / n);
}

// ------------------------------------------------------------------- move

function movePart() {
  console.log(`Question 2, does it move? Lift: ${L.name} (${L.what}). Seeds ${seeds.join(", ")}.\n`);
  const pairs = ["GLNO", "LNO1", "LNO2", "LNOa", "LCNOp", "LCNOpm", "LPsP", "PS196_b"];
  const diff = (bins: Bins, r: Float64Array, type: string) => r[bins.index(`${type} right`)] - r[bins.index(`${type} left`)];
  const penDiff = (bins: Bins, r: Float64Array) => r[bins.index("PEN, left PB")] - r[bins.index("PEN, right PB")];

  // 2b: the eyes under rotation.
  console.log("2b. Eyes open on a full-field grating turning clockwise or anticlockwise (30° period, 2 Hz) for 4 s, against a grey field; with the ring silent and with every E-PG at the even rate");
  console.log("    right minus left, Hz, stimulus less control (P-EN: left PB minus right PB)");
  for (const even of [false, true]) for (const seed of seeds) {
    const cells: string[] = [];
    for (const direction of [1, -1] as const) {
      const scene: Scene = (t, a) => {
        const phase = (a - direction * 60 * t) / 30;
        return phase - Math.floor(phase) < 0.5 ? 0 : 1;
      };
      const measure = (live: boolean) => {
        const brain = brainWith(c, seed, L);
        brain.sim.addInput("even", allEpg(), 0);
        const angles = facetAngles(brain.eyes!);
        const light = { left: new Float32Array(angles.left.az.length), right: new Float32Array(angles.right.az.length) };
        const grey: Scene = () => 0.5;
        render(grey, 0, angles, light);
        for (let t = 0; t < SETTLE; t += 10) brain.tick(10, { ...REST, light });
        if (even) brain.sim.setRate("even", DRIVE.epgEven);
        const bins = new Bins(brain, g.read);
        const sum = new Float64Array(bins.names.length);
        for (let t = 0; t < 4000; t += 10) {
          render(live ? scene : grey, t / 1000, angles, light);
          brain.tick(10, { ...REST, light });
          if ((t + 10) % BIN === 0) bins.take(BIN).forEach((x, k) => (sum[k] += x / (4000 / BIN)));
        }
        return { bins, rates: sum };
      };
      const s = measure(true);
      const k = measure(false);
      const d = (type: string) => diff(s.bins, s.rates, type) - diff(k.bins, k.rates, type);
      cells.push(`${direction > 0 ? "cw" : "acw"}: ${pairs.map((p) => `${p} ${d(p).toFixed(1)}`).join(" ")} PEN ${(penDiff(s.bins, s.rates) - penDiff(k.bins, k.rates)).toFixed(1)} DNa02 ${d("DNa02").toFixed(1)} | GLNO ${s.rates[s.bins.index("GLNO left")].toFixed(1)}/${s.rates[s.bins.index("GLNO right")].toFixed(1)} PEN ${s.rates[s.bins.index("PEN, left PB")].toFixed(1)}/${s.rates[s.bins.index("PEN, right PB")].toFixed(1)} Hz`);
    }
    console.log(`  ${even ? "even ring" : "silent ring"}, seed ${seed}:\n    ${cells.join("\n    ")}`);
  }
  console.log();

  // 2c: the brain's own turns at rest.
  console.log("2c. 60 s at rest, eyes shut: correlation (100 ms bins) of the turn command's DNa02 difference with each pair's right-minus-left rate");
  for (const seed of seeds) {
    const brain = settled(seed, () => {});
    const bins = new Bins(brain, g.read);
    const series = new Map<string, number[]>();
    const turn: number[] = [];
    for (let t = 0; t < 60000; t += 100) {
      for (let s = 0; s < 100; s += 10) brain.tick(10, REST);
      const r = bins.take(100);
      turn.push(diff(bins, r, "DNa02"));
      for (const p of pairs) (series.get(p) ?? series.set(p, []).get(p)!).push(diff(bins, r, p));
      (series.get("PEN") ?? series.set("PEN", []).get("PEN")!).push(penDiff(bins, r));
    }
    const cells = [...series].map(([p, xs]) => {
      const active = xs.some((x) => x !== 0);
      return `${p} ${active ? pearson(turn, xs).toFixed(2) : "silent"}`;
    });
    console.log(`  seed ${seed}: ${cells.join(", ")}`);
  }
  console.log();

  // 2d: a kicked bump pushed by one PB half's P-ENs, made more excitable.
  console.log(`2d. A bump kicked at R3 (3 positions, ${DRIVE.epg} Hz, 1 s), then one PB half's P-ENs depolarised by a bias for 1 s with the kick held on or let go; the bump's phase change over that second against no bias`);
  console.log("    The wiring predicts the left PB's P-ENs push toward rising position (+), the right's toward falling (−) (wiring part, W2)");
  const moved: { half: string; mV: number; held: boolean; shift: number; ok: boolean }[] = [];
  for (const held of [true, false]) for (const mV of DRIVE.penBias) for (const seed of seeds) {
    const shifts: string[] = [];
    const phaseAfter = (half: "left" | "right" | null) => {
      const brain = settled(seed, (b) => {
        b.sim.addInput("kick", epgAt(around(4)), 0);
        b.sim.addExcitability("pen left", g.pen.left);
        b.sim.addExcitability("pen right", g.pen.right);
      });
      const bins = new Bins(brain, g.read);
      brain.sim.setRate("kick", DRIVE.epg);
      let start = bump(new Float64Array(POSITIONS));
      run(brain, bins, 1000, (r) => (start = bump(epgRates(bins, r))));
      if (!held) brain.sim.setRate("kick", 0);
      if (half) brain.sim.setExcitability(`pen ${half}`, new Float64Array(g.pen[half].length).fill(mV));
      let end = start;
      let pen = 0;
      run(brain, bins, 1000, (r) => {
        end = bump(epgRates(bins, r));
        pen += (r[bins.index("PEN, left PB")] + r[bins.index("PEN, right PB")]) / 8;
      });
      return { start, end, pen };
    };
    const none = phaseAfter(null);
    for (const half of ["left", "right"] as const) {
      const pushed = phaseAfter(half);
      const shift = pushed.end.mean > 0 && none.end.mean > 0 ? wrap(pushed.end.phase - none.end.phase) : NaN;
      const ok = Number.isFinite(shift) && Math.sign(shift) === (half === "left" ? 1 : -1) && Math.abs(shift) >= CRITERIA.minShift && localised(pushed.end);
      moved.push({ half, mV, held, shift, ok });
      shifts.push(`${half} PB ${Number.isFinite(shift) ? `${deg(shift).toFixed(0)}°` : "no bump"} (end ${fmtBump(pushed.end)}, P-EN ${pushed.pen.toFixed(1)} Hz)`);
    }
    console.log(`  ${held ? "kick held" : "kick let go"}, ${mV} mV, seed ${seed}: no bias ends ${fmtBump(none.end)}, P-EN ${none.pen.toFixed(1)} Hz; ${shifts.join("; ")}`);
  }
  for (const held of [true, false]) for (const mV of DRIVE.penBias) {
    const xs = moved.filter((m) => m.held === held && m.mV === mV);
    console.log(`  ${held ? "kick held" : "kick let go"}, ${mV} mV: moved ≥ ${deg(CRITERIA.minShift)}° the way the wiring says, still localised, in ${xs.filter((m) => m.ok).length} of ${xs.length}`);
  }
}

function pearson(a: number[], b: number[]) {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y) / n;
  const mb = b.reduce((x, y) => x + y) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let k = 0; k < n; k++) {
    sab += (a[k] - ma) * (b[k] - mb);
    saa += (a[k] - ma) ** 2;
    sbb += (b[k] - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

// ------------------------------------------------------------------ steer

function steerPart() {
  console.log(`Question 3, does it steer? Lift: ${L.name} (${L.what}). Seeds ${seeds.join(", ")}.`);
  console.log(`A bump held at each of the 16 positions (3 positions' E-PGs at ${DRIVE.epg} Hz) with a goal in one FB column (its FC2s at ${DRIVE.fc2} Hz) or none, 0.5 s to start then 1.5 s measured.`);
  console.log("Steering: DNa02 right minus left, Hz. Fitted over the bump's position: a·cos + b·sin + d; amplitude √(a²+b²), and the phase where it steers hardest right.\n");
  const goals = goalAngles();
  const columns = [...g.fc2.keys()].sort((a, b) => a - b);
  const verdicts: string[] = [];
  for (const seed of seeds) {
    const curves = new Map<number, { dna: number[]; pfl: number[]; phase: number[] }>();
    for (const col of [0, ...columns]) {
      const dna: number[] = [], pfl: number[] = [], phase: number[] = [];
      for (let p = 0; p < POSITIONS; p++) {
        const brain = settled(seed, (b) => {
          b.sim.addInput("bump", epgAt(around(p)), 0);
          b.sim.addInput("goal", col ? g.fc2.get(col)! : [], 0);
        });
        const bins = new Bins(brain, g.read);
        brain.sim.setRate("bump", DRIVE.epg);
        if (col) brain.sim.setRate("goal", DRIVE.fc2);
        run(brain, bins, 500, () => {});
        const sum = new Float64Array(bins.names.length);
        run(brain, bins, 1500, (r) => r.forEach((x, k) => (sum[k] += x / 6)));
        dna.push(sum[bins.index("DNa02 right")] - sum[bins.index("DNa02 left")]);
        pfl.push(sum[bins.index("PFL3 → DNa02 right")] - sum[bins.index("PFL3 → DNa02 left")]);
        phase.push(bump(epgRates(bins, sum)).phase);
      }
      curves.set(col, { dna, pfl, phase });
    }
    const held = curves.get(0)!.phase.filter((ph, p) => Math.abs(wrap(ph - p * STEP)) <= CRITERIA.phaseTolerance).length;
    console.log(`seed ${seed}: the bump sat within ${deg(CRITERIA.phaseTolerance)}° of where it was held at ${held} of ${POSITIONS} positions (no goal)`);
    const follow: number[] = [];
    const pflFollow: number[] = [];
    let strong = 0;
    for (const col of [0, ...columns]) {
      const { dna, pfl } = curves.get(col)!;
      const f = fit(dna);
      const fp = fit(pfl);
      const crosses = f.amplitude > Math.abs(f.offset);
      if (col) {
        follow.push(wrap(f.phase - goals.get(col)!));
        pflFollow.push(wrap(fp.phase - goals.get(col)!));
        if (f.amplitude >= CRITERIA.minSteer && crosses) strong++;
      }
      // Where the steering crosses zero rising: a right turn moves the bump toward falling position, so that heading is held.
      const holds = crosses ? `, holds ${deg(wrap(f.phase - Math.acos(-f.offset / f.amplitude))).toFixed(0)}°` : "";
      console.log(`  ${col ? `goal C${col} (${deg(goals.get(col)!).toFixed(0).padStart(4)}°)` : "no goal         "}: DNa02 amplitude ${f.amplitude.toFixed(2).padStart(5)} Hz, offset ${f.offset.toFixed(2).padStart(5)}, hardest right at ${deg(f.phase).toFixed(0).padStart(4)}°${crosses ? ", crosses 0" : ""}${holds}; PFL3 amplitude ${fp.amplitude.toFixed(2)} Hz at ${deg(fp.phase).toFixed(0)}°; range ${Math.min(...dna).toFixed(1)} to ${Math.max(...dna).toFixed(1)} Hz`);
    }
    const R = Math.hypot(follow.reduce((x, a) => x + Math.cos(a), 0), follow.reduce((x, a) => x + Math.sin(a), 0)) / follow.length;
    const pass = strong >= columns.length - 2 && R >= CRITERIA.minFollow;
    // Reported, not judged (added after the protocol): the same for PFL3's own difference.
    const px = pflFollow.reduce((x, a) => x + Math.cos(a), 0);
    const py = pflFollow.reduce((x, a) => x + Math.sin(a), 0);
    console.log(`  PFL3's phase follows the goal with resultant length ${(Math.hypot(px, py) / pflFollow.length).toFixed(2)}, ${deg(Math.atan2(py, px)).toFixed(0)}° from the column's angle on average`);
    verdicts.push(`seed ${seed}: ${strong} of ${columns.length} goal columns steer ≥ ${CRITERIA.minSteer} Hz both ways; the steering's phase follows the goal with resultant length ${R.toFixed(2)}: ${pass ? "PASS" : "FAIL"}`);
    console.log();
  }
  console.log(verdicts.join("\n"));
}

/** Least-squares a·cos(θ) + b·sin(θ) + d over the 16 positions. */
function fit(ys: number[]) {
  let a = 0, b = 0, d = 0;
  ys.forEach((y, p) => {
    a += (2 / POSITIONS) * y * Math.cos(p * STEP);
    b += (2 / POSITIONS) * y * Math.sin(p * STEP);
    d += y / POSITIONS;
  });
  return { amplitude: Math.hypot(a, b), phase: Math.atan2(b, a), offset: d };
}

// ------------------------------------------------------------------- eyes

function eyesPart() {
  console.log(`Question 5, do the eyes reach it? Lift: ${L.name} (${L.what}). Seeds ${seeds.join(", ")}.`);
  console.log("A vertical bar 15° wide, full height, shown for 1 s at each azimuth after 2 s of its ground: dark on white, and light (1) on dim (0.2). Hz above the ground alone.\n");
  const azimuths = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  const show = [
    ...["MeTu1", "MeTu2", "MeTu3", "MeTu4"],
    ...Array.from({ length: 10 }, (_, k) => `TuBu${String(k + 1).padStart(2, "0")}`),
    ...["ER2_a", "ER2_b", "ER2_c", "ER2_d", "ER4d", "ER4m", "ER5", "ER3w_b"],
  ];
  for (const kind of ["dark", "light"] as const) {
    const ground = kind === "dark" ? 1 : 0.2;
    const ink = kind === "dark" ? 0 : 1;
    const table = new Map<string, number[][]>(); // name side → [seed][azimuth]
    const phases: number[][] = [];
    for (const seed of seeds) {
      const measure = (az: number | null) => {
        const brain = brainWith(c, seed, L);
        const angles = facetAngles(brain.eyes!);
        const light = { left: new Float32Array(angles.left.az.length), right: new Float32Array(angles.right.az.length) };
        const plain: Scene = () => ground;
        render(plain, 0, angles, light);
        for (let t = 0; t < SETTLE; t += 10) brain.tick(10, { ...REST, light });
        const bins = new Bins(brain, g.read);
        const scene: Scene = az === null ? plain : (_t, a) => (Math.abs(wrap(((a - az) * Math.PI) / 180)) <= (7.5 * Math.PI) / 180 ? ink : ground);
        render(scene, 0, angles, light);
        const sum = new Float64Array(bins.names.length);
        for (let t = 0; t < 1000; t += 10) {
          brain.tick(10, { ...REST, light });
          if ((t + 10) % BIN === 0) bins.take(BIN).forEach((x, k) => (sum[k] += x / 4));
        }
        return { bins, rates: sum };
      };
      const control = measure(null);
      if (seed === seeds[0]) {
        // Where along the way in the bar's signal stops: absolute rates, the right eye, a bar at 60°.
        const m = measure(60);
        const way = ["L1", "L2", "L3", "Mi1", "Tm1", "Tm2", "Tm9", "Dm2", "Mi15", "MeTu1", "MeTu3"];
        console.log(`  seed ${seed}, the bar at 60°, right eye, Hz (ground alone in brackets): ${way.map((n) => `${n} ${m.rates[m.bins.index(`${n} right`)].toFixed(1)} (${control.rates[control.bins.index(`${n} right`)].toFixed(1)})`).join(", ")}`);
      }
      const row: number[] = [];
      azimuths.forEach((az, ai) => {
        const m = measure(az);
        for (const name of show) for (const side of ["left", "right"]) {
          const key = `${name} ${side}`;
          const k = m.bins.index(key);
          const t = table.get(key) ?? table.set(key, seeds.map(() => [])).get(key)!;
          t[seeds.indexOf(seed)][ai] = m.rates[k] - control.rates[k];
        }
        const b = bump(epgRates(m.bins, m.rates));
        row.push(b.mean >= CRITERIA.minMean ? b.phase : NaN);
      });
      phases.push(row);
    }
    console.log(`${kind} bar: largest response by azimuth, each population and side (Hz above the ground alone; range over seeds at the best azimuth)`);
    for (const name of show) for (const side of ["left", "right"]) {
      const t = table.get(`${name} ${side}`)!;
      const mean = azimuths.map((_, ai) => t.reduce((x, s) => x + s[ai], 0) / t.length);
      const best = mean.indexOf(Math.max(...mean));
      const responds = t.every((s) => Math.max(...s) >= CRITERIA.minResponse);
      const ipsi = (side === "right" ? 1 : -1) * azimuths[best] > 0;
      const contra = mean[azimuths.indexOf(side === "right" ? -90 : 90)];
      console.log(`  ${`${name} ${side}`.padEnd(14)} best ${String(azimuths[best]).padStart(4)}° ${range(t.map((s) => s[best]))} Hz${responds ? ", responds in every seed" : ""}${responds && ipsi ? ", ipsilateral" : ""}${responds ? `; contralateral 90°: ${contra.toFixed(1)} Hz` : ""}`);
    }
    const with_ = phases.flat().filter(Number.isFinite).length;
    console.log(`  E-PG bump (mean ≥ ${CRITERIA.minMean} Hz) in ${with_} of ${phases.flat().length} bar presentations${with_ ? `; phase by azimuth, seed ${seeds[0]}: ${phases[0].map((ph) => (Number.isFinite(ph) ? deg(ph).toFixed(0) : "-")).join(" ")}` : ""}\n`);
  }
}

const PART: Record<string, () => void> = { wiring, bump: bumpPart, move: movePart, steer: steerPart, eyes: eyesPart };
PART[values.part]();
