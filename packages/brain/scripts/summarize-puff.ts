// Turn retained captures into reviewable summaries without running the brain.
// node packages/brain/scripts/summarize-puff.ts responses /tmp/puff-sim.jsonl ...
// node packages/brain/scripts/summarize-puff.ts wiring /tmp/puff-wiring.jsonl
// node packages/brain/scripts/summarize-puff.ts paired /tmp/puff-canonical-matched.jsonl
import { readFileSync } from "node:fs";

type Trial = {
  seed: number;
  peak: Record<string, number>;
  firstEscapeMs: number | null;
  spikeSnapshots?: Record<string, Record<string, number>>;
};
type Response = {
  population: string; n: number; rateHz: number; durationMs: number;
  seeds: number; escapes: number; trials: Trial[];
};
type Wiring = {
  population: string; target: string; directSynapses: number;
  bySign: { excitatoryOnly: boolean; byHop: {
    hop: number; strongestWalkPerTarget: {
      target: string; path: string[] | null; counts: number[]; bottleneck: number;
    }[];
  }[] }[];
};
const [mode, ...files] = process.argv.slice(2);
if (!["responses", "wiring", "paired"].includes(mode) || !files.length) {
  throw new Error("Usage: summarize-puff.ts responses|wiring|paired capture.jsonl [...]");
}
const captures = files.map(file => readFileSync(file, "utf8").trim().split("\n").map(line => JSON.parse(line)));
const hashes = new Set(captures.map(rows => rows[0].sha256));
if (hashes.size !== 1 || hashes.has(undefined)) throw new Error("Captures must identify the same packed dataset");
const records = captures.flatMap(rows => rows.slice(1));
const csv = (cells: (string | number)[]) => cells.map(cell => {
  const s = String(cell);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}).join(",");
const rounded = (value: number) => {
  if (!Number.isFinite(value)) throw new Error("Non-finite measurement");
  const n = Number(value.toFixed(6));
  // Preserve the published CSV's six-decimal, compact numeric representation.
  return n && Math.abs(n) < 0.0001 ? n.toExponential().replace(/e([+-])(\d)$/, "e$10$2") : String(n);
};
const responses = records.filter(row => Array.isArray(row.trials)) as Response[];
for (const row of responses) {
  if (row.seeds !== row.trials.length || new Set(row.trials.map(t => t.seed)).size !== row.seeds) throw new Error("Invalid seed cohort");
  if (row.escapes !== row.trials.filter(t => t.firstEscapeMs !== null).length) throw new Error("Inconsistent event count");
}

if (mode === "responses") {
  const peaks = ["escape", "wings", "groom", "DNp01", "flight", "DNg12"];
  console.log(csv(["population", "rateHz", "durationMs", "seeds", "escapes", ...peaks.flatMap(p => [`${p}PeakMin`, `${p}PeakMax`])]));
  const seen = new Map<string, string>();
  for (const row of responses) {
    // Historical captures labelled empty sham input with the requested rate;
    // zero selected neurons means zero injected drive at every such label.
    if (row.population === "rest" && row.n !== 0) throw new Error("Sham contains driven neurons");
    const rate = row.population === "rest" ? 0 : row.rateHz;
    const key = JSON.stringify([row.population, rate, row.durationMs, row.seeds]);
    const line = csv([row.population, rate, row.durationMs, row.seeds, row.escapes,
      ...peaks.flatMap(p => {
        const values = row.trials.map(t => t.peak[p]);
        return [rounded(Math.min(...values)), rounded(Math.max(...values))];
      })]);
    if (seen.has(key)) {
      if (seen.get(key) !== line) throw new Error(`Conflicting summaries for ${key}; separate these captures`);
      continue;
    }
    seen.set(key, line);
    console.log(line);
  }
  if (!seen.size) throw new Error("No response records");
} else if (mode === "wiring") {
  console.log("population,targetType,directSynapses,excitatoryOnly,hops,target,path,counts,bottleneck");
  const wiring = records.filter(row => Array.isArray(row.bySign)) as Wiring[];
  if (!wiring.length) throw new Error("No wiring records");
  for (const row of wiring) for (const sign of row.bySign) for (const hop of sign.byHop) for (const walk of hop.strongestWalkPerTarget) {
    console.log(csv([row.population, row.target, row.directSynapses, sign.excitatoryOnly ? "True" : "False",
      hop.hop, walk.target, walk.path?.join(" -> ") ?? "", walk.counts.join(" / "), walk.bottleneck]));
  }
} else {
  // Require one fixed-duration cohort: silently combining strengths or seeds
  // would turn this diagnostic into a misleading pooled probability estimate.
  const sham = responses.filter(row => row.population === "rest");
  if (sham.length !== 1) throw new Error("Paired mode requires one sham cohort");
  const reference = sham[0];
  if (new Set(responses.filter(r => r.population !== "rest").map(r => r.rateHz)).size !== 1) throw new Error("Paired mode requires one neural strength");
  const populations = new Set<string>();
  const results = responses.filter(row => row.population !== "rest").map(row => {
    if (populations.has(row.population) || row.durationMs !== reference.durationMs || row.seeds !== reference.seeds) throw new Error("Paired mode requires one matched cohort per population");
    populations.add(row.population);
    const baseline = new Map(reference.trials.map(t => [t.seed, t]));
    const count = (t: Trial) => {
      const n = t.spikeSnapshots?.["100"]?.DNp01;
      if (n === undefined || !Number.isInteger(n) || n < 0) throw new Error("Missing first-100-ms GF spike count");
      return n;
    };
    const differences = row.trials.map(t => {
      const paired = baseline.get(t.seed);
      if (!paired) throw new Error("Unmatched seed");
      return count(t) - count(paired);
    });
    let state = 1;
    const random = () => {
      state = state + 0x6D2B79F5 | 0;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    const samples = Array.from({ length: 20000 }, () => {
      let sum = 0;
      for (let i = 0; i < differences.length; i++) sum += differences[Math.floor(random() * differences.length)];
      return sum / differences.length;
    }).sort((a, b) => a - b);
    return { population: row.population, pairedDifferences: differences,
      mean: differences.reduce((a, b) => a + b, 0) / differences.length,
      bootstrap95: [samples[Math.floor(0.025 * (samples.length - 1))], samples[Math.ceil(0.975 * (samples.length - 1))]] };
  });
  if (!results.length) throw new Error("No stimulated cohort");
  console.log(JSON.stringify(results, null, 2));
}
