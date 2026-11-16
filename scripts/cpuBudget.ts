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
// and synapses does: with it, every budget's work reads 1.0 to 1.4 times its M5
// Pro cost on the CI runner (a reference of arithmetic alone left it at 1.2 to
// 1.7). Each budget sits about 1.7 times above what the work costs on an M5 Pro,
// so it holds on the CI runner, and doubling the work fails it on either.
//
// The reference can't follow other processes thrashing the caches and memory the
// work shares (four copies of the brain at once each cost a third more on an M5
// Pro), so the budgets live in *.budget.ts files, which npm test runs one at a
// time after everything else. Only this thread's CPU counts: the JIT's and GC's
// helper threads aren't the work.
//
// After a change of Node that moves the reference, `node scripts/cpuBudget.ts`
// on an M5 Pro, with nothing else busy, prints the new REFERENCE_MS.

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
  #reference = timeReference();
  #references = 1;
  #since = threadMs();

  /** Ends a lap of the work here. */
  lap() {
    this.#work += threadMs() - this.#since;
    this.#reference += timeReference();
    this.#references++;
    this.#since = threadMs();
  }

  /** The work's CPU milliseconds so far, as an M5 Pro would spend them. */
  get ms() {
    return (this.#work * REFERENCE_MS) / (this.#reference / this.#references);
  }

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

if (import.meta.main) {
  const samples = Array.from({ length: 200 }, timeReference);
  console.log(`reference: ${median(samples).toFixed(2)} CPU ms here (median of 200; REFERENCE_MS is ${REFERENCE_MS})`);
}
