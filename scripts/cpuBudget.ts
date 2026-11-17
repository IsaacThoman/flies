// Speed budgets in M5 Pro milliseconds, so they hold on any machine.
//
// CPU time alone doesn't. On the CI runner, a virtual Mac on a shared host, the
// same deterministic work measured 2 to 3 times its CPU time on an M5 Pro, and
// up to 3.3 times inside a full test run, varying from job to job and within
// one: a guest counts the time its host gives the core to someone else as its own
// CPU time, and its memory is slower against its arithmetic than an M5 Pro's.
// So a fixed reference load runs on the same thread between the laps of the
// measured work, and the work's time is scaled by what the reference takes here
// against what it takes on an M5 Pro. The reference reads and writes a 4 MB table
// at random, past the first-level cache, as the brain's sweep over its neurons
// and synapses does: with it, the brain's work reads 1.0 to 1.4 times its M5 Pro
// cost on the CI runner and the fly's update, arithmetic in cache, up to 1.6 (a
// reference of arithmetic alone left the brain at 1.2 to 1.5). Each budget sits
// 1.5 to 1.8 times above what the work costs on an M5 Pro, so it holds on the CI
// runner, and doubling the work fails it on either.
//
// Cache and memory contention can affect the work and the reference differently.
// Budgets run alone after the other tests and accept measurements only when the
// reference's median is at most 2x the M5 Pro baseline locally (4x on CI's slower
// virtual Macs), its 90th/10th percentile ratio is at most 1.5, and each set of
// five work samples spans at most 1.35x. No reference outlier may exceed 2x
// the fastest reference; scaling uses the median so tails cannot hide a regression. A stable 2x work regression still fails.
// Three contended attempts, separated by one-second pauses, skip locally with an
// explicit rerun message; in CI they fail with that reason. Functional assertions
// and measurement errors always fail. Only this thread's CPU counts, not helpers.
//
// After a change of Node that moves the reference, `node scripts/cpuBudget.ts`
// on an M5 Pro, with nothing else busy, prints the new REFERENCE_MS.

import { setTimeout as pause } from "node:timers/promises";

/** CPU milliseconds this thread has used. */
const threadMs = () => {
  const { user, system } = process.threadCpuUsage();
  return (user + system) / 1000;
};

const table = new Float32Array(1 << 20);
/** A fixed load: dependent random reads and writes over `table`, which the writes keep from being optimised away. */
function reference() {
  let seed = 7;
  let sum = 0;
  for (let i = 0; i < 900_000; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const k = seed & (table.length - 1);
    sum += table[k];
    table[k] = sum * 1e-9;
  }
  table[0] = sum;
}

/** What `reference` takes on an M5 Pro, in CPU milliseconds. */
export const REFERENCE_MS = 4.0;

/** Warmed past the JIT's tiers, so each lap's reference is the optimised code. */
for (let i = 0; i < 40; i++) reference();

const timeReference = () => {
  const start = threadMs();
  reference();
  return threadMs() - start;
};

/**
 * Measures work done between laps on this thread's CPU, with the reference run
 * at the start and at every lap. Laps of tens of milliseconds keep the reference
 * close to the work it scales.
 */
export class CpuMeter {
  #work = 0;
  #referenceSamples = [timeReference()];
  #since = threadMs();

  /** Ends a lap of the work here. */
  lap() {
    this.#work += threadMs() - this.#since;
    const sample = timeReference();
    this.#referenceSamples.push(sample);
    this.#since = threadMs();
  }

  /** The work's CPU milliseconds so far, as an M5 Pro would spend them. */
  get ms() {
    return scaleCpuMs(this.#work, this.#referenceSamples);
  }

  /** The reference CPU times beside this work, for detecting contention. */
  get references(): readonly number[] { return this.#referenceSamples; }

  /** The work's CPU milliseconds so far, as measured here. */
  get rawMs() {
    return this.#work;
  }
}

/** The middle of `samples`, which an occasional GC or busy host doesn't move. */
export const median = (samples: number[]) => {
  const sorted = samples.toSorted((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};


/** The same robust reference statistic used to judge the measurement conditions. */
export const scaleCpuMs = (rawMs: number, references: readonly number[]) => rawMs * REFERENCE_MS / median([...references]);

type Measurement<T> = {
  value: T;
  references: readonly number[];
  /** One series per cost metric; deterministic repetitions of the same work. */
  samples?: readonly (readonly number[])[];
};
type BudgetContext = { skip(message: string): void; diagnostic(message: string): void };
type Conditions = { ci?: boolean; pause?: (ms: number) => Promise<unknown> };

function contention<T>({ references, samples = [] }: Measurement<T>, ci: boolean): string | null {
  for (const series of [references, ...samples]) {
    if (!series.length || series.some((sample) => !Number.isFinite(sample) || sample <= 0)) throw Error("Invalid CPU measurement: samples must be finite and positive");
  }
  const sorted = references.toSorted((a, b) => a - b);
  const middle = median(sorted);
  const limit = REFERENCE_MS * (ci ? 4 : 2);
  if (middle > limit) return `reference median ${middle.toFixed(2)} ms exceeds ${limit} ms`;
  const low = sorted[Math.floor((sorted.length - 1) * 0.1)];
  const high = sorted[Math.ceil((sorted.length - 1) * 0.9)];
  if (high / low > 1.5) return `reference p90/p10 ${(high / low).toFixed(2)} exceeds 1.5`;
  if (sorted.at(-1)! / sorted[0] > 2) return `reference max/min ${(sorted.at(-1)! / sorted[0]).toFixed(2)} exceeds 2`;
  for (const series of samples) {
    const spread = Math.max(...series) / Math.min(...series);
    if (spread > 1.35) return `work sample max/min ${spread.toFixed(2)} exceeds 1.35`;
  }
  return null;
}

/** Returns reliable measurements before any speed assertion; only contention is retried. */
export async function measureBudget<T>(t: BudgetContext, measure: () => Measurement<T>, conditions: Conditions = {}): Promise<T | undefined> {
  const ci = conditions.ci ?? Boolean(process.env.CI);
  const wait = conditions.pause ?? pause;
  let reason = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const measured = measure();
    const busy = contention(measured, ci);
    if (!busy) return measured.value;
    reason = busy;
    t.diagnostic(`CPU measurement ${attempt}/3 contended: ${reason}`);
    if (attempt < 3) await wait(1_000);
  }
  const message = `machine too busy to measure; rerun when idle (${reason}; 3 attempts)`;
  if (ci) throw Error(message);
  t.skip(message);
  return undefined;
}

if (import.meta.main) {
  const samples = Array.from({ length: 200 }, timeReference);
  console.log(`reference: ${median(samples).toFixed(2)} CPU ms here (median of 200; REFERENCE_MS is ${REFERENCE_MS})`);
}
