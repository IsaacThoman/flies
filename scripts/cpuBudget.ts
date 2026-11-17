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
// reference's median is at most 1.2x the M5 Pro baseline locally (4x on CI's slower
// virtual Macs), its 90th/10th percentile ratio is at most 1.5, and each set of
// five work samples spans at most 1.35x. At most one reference in 20 may exceed
// 2x the fastest, so a series of fewer than 20 may have none. Once none could at
// any length, but on CI's virtual Macs one turns up in most runs of a hundred
// laps, so the brain's budget, which times about a hundred an attempt, was
// rejected three times out of three run after run while its median and p90/p10
// held. Scaling uses the median, which so few outliers barely move, so
// tails cannot hide a regression, and a stable 2x work regression still fails.
// Work timed in a single lap is scaled by the references of the laps around it
// as well: by its own two alone, one outlier could move it by half and spread
// five samples of it past 1.35x. The strict local limit follows a
// contended M5 Pro run: a 5.1 ms reference (27% slow) accompanied a false failure.
//
// The reference corrects for a machine's speed, not for sharing it. Beside
// other processes the brain slows far more than the reference does: with ten
// other cores busy on an M5 Pro, its work at once read 0.4 to 0.55 M5 Pro CPU s
// per simulated second against 0.28 alone, while the reference slowed 15%; on
// CI, beside a freshly booted runner indexing its disk for Spotlight, 0.36 to
// 0.45 against 0.26 to 0.29 in a quiet one, the reference 12% slower, and the
// fly's update up to 1.8 times its quiet cost. On the M5 Pro neither preemption
// nor V8's compiler explains it (ticks run between no context switches were as
// slow, and so was compiling on the main thread); arithmetic and random tables of
// 16 KB and 4 MB slowed 15 to 25% while the brain doubled, and tables of 64 and
// 256 MB, a streamed one and a sparse sweep like the brain's followed none of
// its swings. The likeliest reason is the cache the cores share, which holds the
// busiest of the brain's 50 MB of synapse rows only while nothing else fills it,
// a working set no fixed reference matches on every machine. So each attempt also watches the whole machine's CPU time, and other
// processes keeping more than OTHERS_LIMIT cores busy on average beside it is
// contention as well. A quiet runner's other processes keep about a tenth of a
// core busy during the budgets; Spotlight kept one to one and a half, so CI turns
// it off before checking out (.github/workflows/ci.yml). The runner's desktop
// session still wakes its daemons in bursts of seconds (GitHub's provisioning
// agent every ten seconds or so at a quarter of a core, and assistants, updates
// and indexers together at up to three), which a retry a second later meets
// again: so each attempt first waits for a second in which the others keep under
// QUIET_CORES busy, up to a minute in CI and three seconds locally, where the
// others are usually there for good.
//
// Three contended attempts skip locally with an explicit rerun message; in CI
// they fail with that reason. Functional assertions
// and measurement errors always fail. Only this thread's CPU counts, not helpers.
//
// After a change of Node that moves the reference, `node scripts/cpuBudget.ts`
// on an M5 Pro, with nothing else busy, prints the new REFERENCE_MS.

import { cpus } from "node:os";
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

/** The busiest that other processes may keep the machine, in cores on average over an attempt. */
export const OTHERS_LIMIT = 1;

const machineBusyMs = () => cpus().reduce((sum, { times }) => sum + times.user + times.nice + times.sys + times.irq, 0);
const processMs = () => {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
};

/** Starts watching the machine; the function returned gives the cores other processes have kept busy since, on average. */
export function watchOthers() {
  const machine = machineBusyMs();
  const own = processMs();
  const start = performance.now();
  return () => (machineBusyMs() - machine - (processMs() - own)) / (performance.now() - start);
}

/** How few cores other processes must keep busy for a second for the machine to count as quiet. */
export const QUIET_CORES = 0.25;

/** Waits, a second at a time, until a quiet second or `seconds` of them have passed; whether it found one. */
async function untilQuiet(watch: typeof watchOthers, wait: (ms: number) => Promise<unknown>, seconds: number) {
  for (let i = 0; i < seconds; i++) {
    const others = watch();
    await wait(1_000);
    if (others() < QUIET_CORES) return true;
  }
  return false;
}

type Measurement<T> = {
  value: T;
  references: readonly number[];
  /** One series per cost metric; deterministic repetitions of the same work. */
  samples?: readonly (readonly number[])[];
};
type BudgetContext = { skip(message: string): void; diagnostic(message: string): void };
type Conditions = { ci?: boolean; pause?: (ms: number) => Promise<unknown>; others?: typeof watchOthers };

function contention<T>({ references, samples = [] }: Measurement<T>, ci: boolean, others: number): string | null {
  for (const series of [references, ...samples]) {
    if (!series.length || series.some((sample) => !Number.isFinite(sample) || sample <= 0)) throw Error("Invalid CPU measurement: samples must be finite and positive");
  }
  if (others > OTHERS_LIMIT) return `other processes kept ${others.toFixed(1)} cores busy; at most ${OTHERS_LIMIT} may`;
  const sorted = references.toSorted((a, b) => a - b);
  const middle = median(sorted);
  const limit = REFERENCE_MS * (ci ? 4 : 1.2);
  if (middle > limit) return `reference median ${middle.toFixed(2)} ms exceeds ${limit} ms`;
  const low = sorted[Math.floor((sorted.length - 1) * 0.1)];
  const high = sorted[Math.ceil((sorted.length - 1) * 0.9)];
  if (high / low > 1.5) return `reference p90/p10 ${(high / low).toFixed(2)} exceeds 1.5`;
  const outliers = sorted.filter((sample) => sample > 2 * sorted[0]).length;
  const allowed = Math.floor(sorted.length / 20);
  if (outliers > allowed) return `${outliers} of ${sorted.length} references exceed 2x the fastest (reference max/min ${(sorted.at(-1)! / sorted[0]).toFixed(2)}; at most ${allowed} may)`;
  for (const [i, series] of samples.entries()) {
    const spread = Math.max(...series) / Math.min(...series);
    if (spread > 1.35) return `work sample max/min ${spread.toFixed(2)} exceeds 1.35 (series ${i + 1} of ${samples.length})`;
  }
  return null;
}

/** Returns reliable measurements before any speed assertion; only contention is retried. */
export async function measureBudget<T>(t: BudgetContext, measure: () => Measurement<T>, conditions: Conditions = {}): Promise<T | undefined> {
  const ci = conditions.ci ?? Boolean(process.env.CI);
  const wait = conditions.pause ?? pause;
  const watch = conditions.others ?? watchOthers;
  let reason = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    // A shared machine is busy in bursts, so a retry a moment later would land in the same one. Locally the
    // others are usually there for good, and a short wait spares rerunning by hand.
    await untilQuiet(watch, wait, ci ? 60 : 3);
    const others = watch();
    const measured = measure();
    const busy = contention(measured, ci, others());
    if (!busy) return measured.value;
    reason = busy;
    t.diagnostic(`CPU measurement ${attempt}/3 contended: ${reason}`);
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
