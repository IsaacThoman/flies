import assert from "node:assert/strict";
import { test } from "node:test";
import { measureBudget, REFERENCE_MS, scaleCpuMs } from "../../../scripts/cpuBudget.ts";

const clean = { value: 10, references: Array(20).fill(REFERENCE_MS) as number[], samples: [[10, 10.1, 10, 10.2, 10]] };
const noisy = { ...clean, references: [4, 4, 4, 8, 8] };
function context() {
  const skipped: string[] = [], messages: string[] = [];
  return { skipped, messages, skip: (message: string) => { skipped.push(message); }, diagnostic: (message: string) => { messages.push(message); } };
}

test("contended references or a wide spread of five work samples retry then skip locally", async () => {
  for (const measurement of [noisy, { ...clean, references: Array(20).fill(5.1) as number[] }, { ...clean, samples: [[10, 10, 10, 10, 20]] }]) {
    const t = context();
    let attempts = 0, pauses = 0;
    const result = await measureBudget(t, () => { attempts++; return measurement; }, { ci: false, pause: async () => { pauses++; } });
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
  const result = await measureBudget(t, () => ++attempts === 1 ? noisy : { ...clean, value: 20, samples: [[20, 20, 20, 20, 20]] }, { ci: false, pause: async () => {} });
  assert.equal(attempts, 2);
  assert.equal(t.skipped.length, 0);
  assert.throws(() => assert.ok(result! < 15, "budget 15"), /budget 15/);
});

test("CI fails explicitly if all attempts are contended, and tolerates its slower stable reference", async () => {
  const t = context();
  await assert.rejects(measureBudget(t, () => noisy, { ci: true, pause: async () => {} }), /machine too busy to measure; rerun when idle/);
  assert.equal(t.skipped.length, 0);
  assert.equal(await measureBudget(t, () => ({ ...clean, references: Array(20).fill(REFERENCE_MS * 3) as number[] }), { ci: true }), 10);
});

test("measurement errors and invalid data cannot be hidden as contention", async () => {
  await assert.rejects(measureBudget(context(), () => { throw Error("broken work"); }), /broken work/);
  await assert.rejects(measureBudget(context(), () => ({ ...clean, references: [NaN] })), /invalid.*measurement/i);
});


test("rare reference outliers cannot scale a doubled workload back under budget", async () => {
  const references = [...Array(10).fill(REFERENCE_MS) as number[], 44];
  const doubled = scaleCpuMs(6, references);
  assert.ok(doubled > 5.6, "normalization preserves the doubled cost");
  const t = context();
  assert.equal(await measureBudget(t, () => ({ value: doubled, references }), { ci: false, pause: async () => {} }), undefined);
  assert.match(t.skipped[0], /reference max\/min/);
});
