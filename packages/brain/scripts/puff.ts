// Research probe, not a sensory mapping: drive annotated JO zones without
// changing the operating point, commands, or gameplay. See docs/puff-startle.md.
// node packages/brain/scripts/puff.ts --wiring
// node packages/brain/scripts/puff.ts --simulate --seeds 5
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../src/node.ts";
import { SENSES, READOUTS } from "../src/io.ts";
import { OPERATING_POINT, transmitters, transmitterGain } from "../src/params.ts";
import { FlyBrain } from "../src/runtime.ts";
import { RESTING_SENSES } from "../src/types.ts";

const { values } = parseArgs({ options: {
  path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
  wiring: { type: "boolean" }, simulate: { type: "boolean" },
  seeds: { type: "string", default: "5" },
  populations: { type: "string", default: "rest,wind,A,B,C,D,E,F,AB,ABCE,all,loom,AB+CE" },
  rates: { type: "string", default: "25,50,100,200" },
  durations: { type: "string", default: "20,100,1000" },
} });
const c = readConnectomeFile(values.path);
const zone = (z: string) => c.find({ superClass: "cb_sensory", type: new RegExp(`^JO-[${z}](?!-unclear)`) });
const populations = new Map<string, Uint32Array>([
  ["rest", new Uint32Array(0)],
  ["AB+CE", zone("AB")],
  ["wind", c.find(SENSES.find(s => s.sense === "wind")!.select)],
  ...["A", "B", "C", "D", "E", "F", "AB", "ABCE"].map(z => [z, zone(z)] as [string, Uint32Array]),
  ["all", c.find({ superClass: "cb_sensory", type: /^JO-/ })],
  ["loom", c.find({ type: ["LC4", "LPLC2"] })],
]);
const targets = ["DNp01", "DNp02", "DNp04", "DNp11", "DNp07", "DNp10"];
const spikeGroups = new Map([...targets.map(type => [type, c.find({ type })] as const),
  ...READOUTS.filter(r => ["flight", "DNg12"].includes(r.name)).map(r => [r.name, c.find(r.select)] as const)]);
const id = (i: number) => `${c.columns.type.value(i)}:${c.rootId[i]}:${c.columns.side.value(i)}:${c.columns.nt.value(i) || "unknown"}`;
console.log(JSON.stringify({ dataset: "FlyEM male CNS, Janelia Research Campus (CC-BY 4.0)",
  sha256: createHash("sha256").update(readFileSync(values.path)).digest("hex"),
  note: "Raw chemical synapse counts; no electrical coupling in this graph. Paths are anatomical, not evidence of activation." }));

if (values.wiring) {
  const effectiveNT = transmitters(c, OPERATING_POINT.fixes).nt;
  for (const [name, members] of populations) {
    if (name === "loom" || name === "rest" || name === "AB+CE") continue;
    const types: Record<string, { n: number; output: number }> = {};
    for (const i of members) {
      const key = `${c.columns.type.value(i)} ${c.columns.side.value(i)} ${c.columns.subClass.value(i)}`;
      const group = types[key] ??= { n: 0, output: 0 };
      group.n++;
      for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) group.output += c.count[e];
    }
    console.log(JSON.stringify({ population: name, n: members.length, types }));
      // For each exact hop length, dynamic programming retains the strongest
      // bottleneck path per neuron. Counts remain individual edges, never a
      // product of group totals that may involve different relay neurons.
      const walksBySign = [];
      for (const excitatoryOnly of [false, true]) {
      let paths = new Map<number, { nodes: number[]; counts: number[]; bottleneck: number }>();
      for (const i of members) paths.set(i, { nodes: [i], counts: [], bottleneck: Infinity });
      const walks = [];
      for (let hop = 1; hop <= 3; hop++) {
        const next = new Map<number, { nodes: number[]; counts: number[]; bottleneck: number }>();
        for (const [i, path] of paths) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) {
          if (excitatoryOnly && transmitterGain(OPERATING_POINT, effectiveNT[i]) <= 0) continue;
          const j = c.post[e];
          // Fixed-length walks may revisit a neuron; no sign/strength inference.
          const bottleneck = Math.min(path.bottleneck, c.count[e]);
          if (bottleneck <= (next.get(j)?.bottleneck ?? 0)) continue;
          next.set(j, { nodes: [...path.nodes, j], counts: [...path.counts, c.count[e]], bottleneck });
        }
        walks.push({ hop, paths: next });
        paths = next;
      }
      walksBySign.push({ excitatoryOnly, walks });
      }
    for (const type of targets) {
      const ends = new Set(c.find({ type }));
      let directSynapses = 0;
      const direct: { from: string; to: string; count: number }[] = [];
      for (const i of members) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) if (ends.has(c.post[e])) {
        directSynapses += c.count[e]; direct.push({ from: id(i), to: id(c.post[e]), count: c.count[e] });
      }
      const bySign = walksBySign.map(({ excitatoryOnly, walks }) => ({ excitatoryOnly, byHop: walks.map(({ hop, paths }) => ({ hop, strongestWalkPerTarget: [...ends].map(i => {
        const p = paths.get(i);
        return { target: id(i), path: p ? p.nodes.map(id) : null, counts: p?.counts ?? [], bottleneck: p?.bottleneck ?? 0 };
      }) })) }));
      console.log(JSON.stringify({ population: name, target: type, directSynapses, direct, bySign }));
    }
  }
}

if (values.simulate) {
  const seeds = Number(values.seeds);
  const rates = values.rates.split(",").map(Number);
  const durations = values.durations.split(",").map(Number);
  if (!Number.isInteger(seeds) || seeds < 1 || rates.some(r => !Number.isFinite(r) || r < 0 || r > 400)) throw new Error("Invalid seeds or rates (0–400 Hz)");
  if (durations.some(d => !Number.isInteger(d) || d < 10 || d > 1000 || d % 10 !== 0)) throw new Error("Durations must be multiples of 10 ms, between 10 and 1000");
  for (const population of values.populations.split(",")) {
    const members = populations.get(population);
    if (!members) throw new Error(`Unknown population ${population}`);
    for (const rate of population === "rest" ? [0] : rates) for (const duration of durations) {
      const trials = [];
      for (let seed = 1; seed <= seeds; seed++) {
        // Fresh brain per trial preserves the real background state and each
        // input's RNG stream; resetting just the engine would not reset both.
        const b = new FlyBrain(c, { seed });
        b.sim.addInput("research puff", members, 0);
        b.sim.addInput("research tonic", zone("CE"), 0);
        const dnSpikes: Record<string, number> = Object.fromEntries(targets.map(t => [t, 0]));
        const sizes = Object.fromEntries(targets.map(t => [t, c.find({ type: t }).length]));
        for (let t = 0; t < 2000; t += 10) b.tick(10, RESTING_SENSES);
        const peak = { escape: 0, wings: 0, groom: 0, DNp01: 0, flight: 0, DNg12: 0 };
        const sum = { flight: 0, DNg12: 0 };
        let firstEscapeMs: number | null = null;
        let inputObservedHz = 0;
        const spikeSnapshots: Record<string, Record<string, number>> = {};
        b.sim.setRecording(true);
        for (let t = 0; t < 1500; t += 10) {
          b.sim.setRate("research puff", t < duration ? rate : 0);
          b.sim.setRate("research tonic", population === "AB+CE" && t < 1000 ? rate : 0);
          const s = b.tick(10, RESTING_SENSES);
          for (const key of ["escape", "wings", "groom"] as const) peak[key] = Math.max(peak[key], s.command[key]);
          for (const key of ["DNp01", "flight", "DNg12"] as const) peak[key] = Math.max(peak[key], s.stats.rates[key]);
          for (const key of ["flight", "DNg12"] as const) sum[key] += s.stats.rates[key];
          if (firstEscapeMs === null && s.command.escape >= 0.4) firstEscapeMs = t + 10;
          if ([20, duration, 1000, 1500].includes(t + 10)) {
            const snapshot: Record<string, number> = {};
            for (const [name, group] of spikeGroups) {
              snapshot[name] = 0;
              for (const i of group) snapshot[name] += b.sim.recording![i];
            }
            spikeSnapshots[t + 10] = snapshot;
          }
          if (t + 10 === duration && members.length) {
            let spikes = 0;
            for (const i of members) spikes += b.sim.recording![i];
            inputObservedHz = spikes / members.length / (duration / 1000);
          }
        }
        targets.forEach(type => {
          for (const i of c.find({ type })) dnSpikes[type] += b.sim.recording![i];
        });
        const gfSpikes = [...c.find({ type: "DNp01" })].map(i => ({ neuron: id(i), spikes: b.sim.recording![i] }));
        trials.push({ seed, peak, firstEscapeMs, inputObservedHz, gfSpikes, spikeSnapshots, meanSmoothedHz: { flight: sum.flight / 150, DNg12: sum.DNg12 / 150 }, dnSpikes,
          dnMeanHz: Object.fromEntries(targets.map(t => [t, dnSpikes[t] / sizes[t] / 1.5])) });
      }
      console.log(JSON.stringify({ population, n: members.length, rateHz: rate, durationMs: duration,
        observationMs: 1500, trials, escapes: trials.filter(t => t.firstEscapeMs !== null).length, seeds }));
    }
  }
}
// Keep the readout definition visible in the evidence without duplicating its
// changing biological selection in this research script.
console.log(JSON.stringify({ readouts: READOUTS.filter(r => ["DNp01", "flight", "DNg12"].includes(r.name)) }));
