// The antennal lobe's gain control (docs/antennal-lobe-gain-protocol.md): can
// a measured gain control at the olfactory receptor neurons' terminals let
// them fire at their recorded resting rates without locking the antennal
// lobe? Each mechanism scales the ORNs' release, as an output gain on each
// glomerulus's group, worked out every tick from the rates the brain sets
// them to; the model itself is left as it is.
//
//   node packages/brain/scripts/al-gain.ts --part rest [--seeds 1,2,3] [--mechanisms R,N0,B]
//   node packages/brain/scripts/al-gain.ts --part gains
//   node packages/brain/scripts/al-gain.ts --part drive
//
// (rest) each mechanism's broad local neurons, MZ_lv2PN, uniglomerular
//     projection neurons, Kenyon cells and every local neuron at rest, and
//     whether it passes the protocol's criteria.
// (gains) each mechanism's gain on each antenna at rest and under ethyl
//     acetate at full strength.
// (drive) why, added after the rest measurements, descriptive: each broad
//     local neuron family's ORN partners, the drive one ORN spike gives it
//     (mV, after saturation and completeness), and the mean synaptic drive
//     the ORNs' resting rates hold it at (each partner's mV x its rate x
//     tauSyn), against the 7 mV threshold.
import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { readConnectomeFile } from "../src/node.ts";
import { OPERATING_POINT, buildWeights } from "../src/params.ts";
import { ODORANTS, odorOf, ornRate } from "../src/olfaction.ts";
import type { OrnGroup } from "../src/olfaction.ts";
import { ORN_TABLE } from "../src/orn-table.ts";
import { FlyBrain } from "../src/runtime.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";

const { values } = parseArgs({ options: { part: { type: "string" }, seeds: { type: "string", default: "1,2,3" }, mechanisms: { type: "string", default: "R,N,N0,B" } } });
assert(["rest", "gains", "drive"].includes(values.part ?? ""), "--part rest, gains or drive");

/** Olsen, Bhandawat & Wilson 2010 (Neuron 66: 287): σ, Hz; m, VM7's (their simulations' default); the field potential's ORN sum divided by 190. */
const OLSEN = { sigma: 12, m: 10.63, lfp: 190, exponent: 1.5 } as const;
/** Root et al. 2008 (Neuron 59: 311, Figure 1): the largest gain increase blocking GABA-B gave, DA1's 153%. */
const BOUND = 2.53;
/** The glomeruli whose rows are Hallem & Carlson's (2006), the ORN types Olsen et al.'s field potential was fitted to. */
const HALLEM = new Set(ORN_TABLE.filter((row) => row[2] === "Hallem & Carlson 2006").map((row) => row[0]));

type Mechanism = "R" | "N" | "N0" | "B";
const MECHANISMS = values.mechanisms.split(",") as Mechanism[];
for (const m of MECHANISMS) assert(["R", "N", "N0", "B"].includes(m), `no mechanism ${m}`);

/** Olsen et al.'s input gain: the factor on an ORN's rate that its PN's lateral inhibition amounts to, for the summed rate Σr. */
function olsenGain(sum: number): number {
  const s = (OLSEN.m * sum) / OLSEN.lfp;
  const e = OLSEN.exponent;
  return OLSEN.sigma / (OLSEN.sigma ** e + s ** e) ** (1 / e);
}

/** Each antenna's gain under a mechanism, from the ORNs' rates as the brain sets them. */
function gains(mechanism: Mechanism, groups: readonly OrnGroup[], odor: Float64Array): { left: number; right: number; unknown: number } {
  if (mechanism === "R") return { left: 1, right: 1, unknown: 1 };
  if (mechanism === "B") return { left: 1 / BOUND, right: 1 / BOUND, unknown: 1 / BOUND };
  const sum = { left: 0, right: 0 };
  for (const side of ["left", "right"] as const) {
    for (const glomerulus of HALLEM) {
      // Every glomerulus's rate on this antenna, whether or not the reconstruction has its neurons there.
      const group = groups.find((g) => g.glomerulus === glomerulus)!;
      const rate = ornRate({ ...group, side }, odor, true);
      sum[side] += mechanism === "N" ? Math.max(0, rate - group.spontaneous) : rate;
    }
  }
  const s = { left: olsenGain(sum.left), right: olsenGain(sum.right) };
  return { ...s, unknown: olsenGain((sum.left + sum.right) / 2) };
}

const c = readConnectomeFile();
const odorBuffer = new Float64Array(2 * ODORANTS.length);

function brainWith(seed: number, mechanism: Mechanism) {
  const b = new FlyBrain(c, { seed, restingSmell: true });
  for (const group of b.smell) b.sim.addOutputGain(`gain ${group.name}`, group.neurons);
  let applied = "";
  const tick = (dt: number, senses: BrainSenses) => {
    const g = gains(mechanism, b.smell, odorOf(senses, odorBuffer));
    const key = `${g.left} ${g.right} ${g.unknown}`;
    if (key !== applied) {
      for (const group of b.smell) b.sim.setOutputGain(`gain ${group.name}`, g[group.side]);
      applied = key;
    }
    return b.tick(dt, senses);
  };
  return { b, tick };
}

if (values.part === "drive") {
  const { b } = brainWith(1, "R");
  const weights = buildWeights(c, OPERATING_POINT);
  const rateOf = new Float64Array(c.neurons).fill(-1);
  for (const group of b.smell) for (const i of group.neurons) rateOf[i] = group.spontaneous;
  const families: [string, RegExp][] = [
    ["il3LN6", /^il3LN6$/],
    ["lLN2F", /^lLN2F_/],
    ["lLN2T", /^lLN2T_/],
    ["lLN2P", /^lLN2P_/],
    ["uPN", /_(ad|l|v|lv)PN$/],
  ];
  const member = new Int8Array(c.neurons).fill(-1);
  for (let i = 0; i < c.neurons; i++) families.forEach(([, re], k) => re.test(c.columns.type.value(i)) && (member[i] = k));
  const stats = families.map(() => ({ neurons: 0, partners: 0, raw: 0, mV: 0, drive: 0 }));
  for (let k = 0; k < families.length; k++) for (let i = 0; i < c.neurons; i++) if (member[i] === k) stats[k].neurons++;
  for (let i = 0; i < c.neurons; i++) {
    if (rateOf[i] < 0) continue;
    for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) {
      const k = member[c.post[e]];
      if (k < 0) continue;
      const mV = weights.network.count[e] * weights.gain[i];
      stats[k].partners++;
      stats[k].raw += c.count[e];
      stats[k].mV += mV;
      // Each spike adds its mV to the drive, which decays over tauSyn: at a steady rate its mean is mV x rate x tauSyn.
      stats[k].drive += mV * rateOf[i] * (OPERATING_POINT.neuron.tauSyn / 1000);
    }
  }
  for (const [k, [name]] of families.entries()) {
    const s = stats[k];
    console.log(`${name.padEnd(7)} ${s.neurons} neurons; ORN partners ${(s.partners / s.neurons).toFixed(0)} each, ${(s.raw / s.neurons).toFixed(0)} synapses; ${(s.mV / s.partners).toFixed(2)} mV a partner's spike; mean drive at rest ${(s.drive / s.neurons).toFixed(0)} mV (threshold 7)`);
  }
} else if (values.part === "gains") {
  const { b } = brainWith(1, "R");
  for (const mechanism of MECHANISMS) {
    for (const [what, strength] of [["rest", 0], ["ethyl acetate 1", 1]] as const) {
      const strengths = ODORANTS.map((o) => (o === "ethylAcetate" ? strength : 0));
      const g = gains(mechanism, b.smell, odorOf({ ...RESTING_SENSES, odor: { left: strengths, right: strengths } }, odorBuffer));
      console.log(`${mechanism.padEnd(3)} ${what.padEnd(16)} left ${g.left.toFixed(3)} right ${g.right.toFixed(3)}`);
    }
  }
} else {
  const typeOf = (i: number) => c.columns.type.value(i);
  const all = Array.from({ length: c.neurons }, (_, i) => i);
  const groups: [string, number[]][] = [
    ["il3LN6", all.filter((i) => typeOf(i) === "il3LN6")],
    ["lLN2F", all.filter((i) => /^lLN2F_/.test(typeOf(i)))],
    ["lLN2T", all.filter((i) => /^lLN2T_/.test(typeOf(i)))],
    ["lLN2P", all.filter((i) => /^lLN2P_/.test(typeOf(i)))],
    ["MZ_lv2PN", all.filter((i) => typeOf(i) === "MZ_lv2PN")],
    ["uPN", all.filter((i) => /_(ad|l|v|lv)PN$/.test(typeOf(i)))],
    ["KC", [...c.find({ class: "Kenyon_Cell" })]],
    ["ALLN", [...c.find({ class: "ALLN" })]],
  ];
  for (const [name, neurons] of groups) assert(neurons.length > 0, `no ${name}`);
  const rows: Record<string, unknown>[] = [];
  for (const mechanism of MECHANISMS) {
    for (const seed of values.seeds.split(",").map(Number)) {
      const { b, tick } = brainWith(seed, mechanism);
      const rest: BrainSenses = { ...RESTING_SENSES, hunger: 1 };
      for (let t = 0; t < 5000; t += 10) tick(10, rest);
      b.sim.setRecording(true);
      b.sim.recording!.fill(0);
      for (let t = 0; t < 10_000; t += 10) tick(10, rest);
      const spikes = b.sim.recording!;
      const row: Record<string, number | string> = { mechanism, seed };
      for (const [name, neurons] of groups) {
        const hz = neurons.map((i) => spikes[i] / 10).sort((x, y) => x - y);
        row[name] = hz.reduce((a, x) => a + x, 0) / hz.length;
        if (name === "uPN") row["uPN median"] = hz[Math.floor(hz.length / 2)];
      }
      const ln = ["il3LN6", "lLN2F", "lLN2T", "lLN2P"].every((k) => (row[k] as number) >= 5 && (row[k] as number) <= 20);
      const pn = (row.uPN as number) >= 2.3 && (row.uPN as number) <= 9.2;
      const kc = (row.KC as number) >= 0.02 && (row.KC as number) <= 0.5;
      row.passes = `${ln ? "LN pass" : "LN fail"}, ${pn ? "PN pass" : "PN fail"}, ${kc ? "KC pass" : "KC fail"}`;
      rows.push(row);
      console.error(JSON.stringify(row));
    }
  }
  console.log(JSON.stringify(rows, null, 2));
}
