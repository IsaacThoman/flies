import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { measureBudget, OTHERS_LIMIT, REFERENCE_MS, scaleCpuMs, watchOthers } from "../../../scripts/cpuBudget.ts";

const clean = { value: 10, references: Array(20).fill(REFERENCE_MS) as number[], samples: [[10, 10.1, 10, 10.2, 10]] };
const noisy = { ...clean, references: [4, 4, 4, 8, 8] };
/** The rest of the machine idle, as these cases assume, whatever this one is doing. */
const quiet = () => () => 0.2;
function context() {
  const skipped: string[] = [], messages: string[] = [];
  return { skipped, messages, skip: (message: string) => { skipped.push(message); }, diagnostic: (message: string) => { messages.push(message); } };
}

test("contended references or a wide spread of five work samples retry then skip locally", async () => {
  for (const measurement of [noisy, { ...clean, references: Array(20).fill(5.1) as number[] }, { ...clean, samples: [[10, 10, 10, 10, 20]] }]) {
    const t = context();
    let attempts = 0, pauses = 0;
    const result = await measureBudget(t, () => { attempts++; return measurement; }, { ci: false, pause: async () => { pauses++; }, others: quiet });
    assert.equal(result, undefined);
    assert.equal(attempts, 3);
    assert.equal(pauses, 2);
    assert.match(t.skipped[0], /machine too busy to measure; rerun when idle/);
    assert.ok(t.messages.length >= 3, "each unreliable attempt explains its contention");
  }
});

test("a clean retry is measured and still fails a doubled-work regression", async () => {
  const t = context();
  let attempts = 0;
  const result = await measureBudget(t, () => ++attempts === 1 ? noisy : { ...clean, value: 20, samples: [[20, 20, 20, 20, 20]] }, { ci: false, pause: async () => {}, others: quiet });
  assert.equal(attempts, 2);
  assert.equal(t.skipped.length, 0);
  assert.throws(() => assert.ok(result! < 15, "budget 15"), /budget 15/);
});

test("CI fails explicitly if all attempts are contended, and tolerates its slower stable reference", async () => {
  const t = context();
  await assert.rejects(measureBudget(t, () => noisy, { ci: true, pause: async () => {}, others: quiet }), /machine too busy to measure; rerun when idle/);
  assert.equal(t.skipped.length, 0);
  assert.equal(await measureBudget(t, () => ({ ...clean, references: Array(20).fill(REFERENCE_MS * 3) as number[] }), { ci: true, others: quiet }), 10);
});

test("measurement errors and invalid data cannot be hidden as contention", async () => {
  await assert.rejects(measureBudget(context(), () => { throw Error("broken work"); }), /broken work/);
  await assert.rejects(measureBudget(context(), () => ({ ...clean, references: [NaN] }), { others: quiet }), /invalid.*measurement/i);
});


test("rare reference outliers cannot scale a doubled workload back under budget", async () => {
  const references = [...Array(10).fill(REFERENCE_MS) as number[], 44];
  const doubled = scaleCpuMs(6, references);
  assert.ok(doubled > 5.6, "normalization preserves the doubled cost");
  const t = context();
  assert.equal(await measureBudget(t, () => ({ value: doubled, references }), { ci: false, pause: async () => {}, others: quiet }), undefined);
  assert.match(t.skipped[0], /reference max\/min/);
});

test("a few stalls in a hundred references are measured, scaled by the median, and a doubled workload still fails", async () => {
  // A hundred laps, as the brain's budget times: five stalls between 2x and 11x the fastest.
  const references = [...Array(95).fill(REFERENCE_MS) as number[], 8.4, 10, 12, 20, 44];
  const t = context();
  const doubled = await measureBudget(t, () => ({ value: scaleCpuMs(6, references), references, samples: [[6, 6.1, 6, 6.2, 6]] }), { ci: true, pause: async () => {}, others: quiet });
  assert.equal(t.messages.length, 0);
  assert.equal(doubled, 6, "the median ignores the stalls");
  assert.throws(() => assert.ok(doubled! < 5.6, "budget 5.6"), /budget 5.6/);
});

test("stalls in more than one reference in 20 are contention, at any number of laps", async () => {
  for (const [length, stalls] of [[11, 1], [19, 1], [40, 3], [100, 6]]) {
    const references = [...Array(length - stalls).fill(REFERENCE_MS) as number[], ...Array(stalls).fill(REFERENCE_MS * 2.5) as number[]];
    const t = context();
    await assert.rejects(measureBudget(t, () => ({ value: 1, references }), { ci: true, pause: async () => {}, others: quiet }), new RegExp(`${stalls} of ${length} references exceed 2x the fastest`));
  }
});

test("other processes keeping the machine busy are contention, however steady the reference beside the work", async () => {
  // Beside them the brain's synapse rows fall out of the shared cache and it slows far more than the reference does.
  const busy = () => () => OTHERS_LIMIT + 0.5;
  const t = context();
  let attempts = 0;
  assert.equal(await measureBudget(t, () => { attempts++; return clean; }, { ci: false, pause: async () => {}, others: busy }), undefined);
  assert.equal(attempts, 3);
  assert.match(t.skipped[0], /machine too busy to measure; rerun when idle \(other processes kept 1\.5 cores busy/);
  await assert.rejects(measureBudget(context(), () => clean, { ci: true, pause: async () => {}, others: busy }), /other processes kept 1\.5 cores busy/);
});

test("a retry once the others have gone is measured and still fails a doubled-work regression", async () => {
  const t = context();
  let watched = 0;
  const others = () => { const busy = ++watched === 1 ? OTHERS_LIMIT * 3 : 0.1; return () => busy; };
  const doubled = await measureBudget(t, () => ({ ...clean, value: 20, samples: [[20, 20, 20, 20, 20]] }), { ci: true, pause: async () => {}, others });
  assert.equal(watched, 2);
  assert.match(t.messages[0], /other processes kept 3\.0 cores busy/);
  assert.throws(() => assert.ok(doubled! < 15, "budget 15"), /budget 15/);
});

test("the machine is watched over each attempt's own measurement", async () => {
  let watching = false;
  const others = () => { watching = true; return () => { watching = false; return 0; }; };
  await measureBudget(context(), () => { assert.ok(watching, "measured while watched"); return clean; }, { others });
  assert.equal(watching, false);
});

test("the machine's watch counts another process's CPU time", () => {
  const start = performance.now();
  const others = watchOthers();
  // Spins until it has used 300 ms of its own CPU, however busy the machine is.
  execFileSync(process.execPath, ["-e", "const t = () => process.cpuUsage().user; const s = t(); while (t() - s < 300_000);"]);
  const busyMs = others() * (performance.now() - start);
  assert.ok(busyMs > 250, `others used ${busyMs.toFixed(0)} CPU ms beside this process; the child alone used 300`);
});
