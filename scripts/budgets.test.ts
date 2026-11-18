import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BETWEEN_MS, RUNS, settle, verdict } from "./budgets.ts";
import { CONTENDED, measureBudget, REFERENCE_MS } from "./cpuBudget.ts";

const contended = `${CONTENDED}; rerun when idle (work sample max/min 1.46 exceeds 1.35 (series 1 of 2); 3 attempts)`;
const over = "built in 270 M5 Pro CPU ms; budget 250";

/** A file whose runs fail with these messages in turn, and the waits between them. */
function runs(...results: (readonly string[])[]) {
  const waits: number[] = [];
  let ran = 0;
  return { waits, ran: () => ran, once: async () => results[Math.min(ran++, results.length - 1)], wait: async (ms: number) => { waits.push(ms); } };
}
const quietly = () => {};

test("a run is contended only if every failure in it is contention", () => {
  assert.equal(verdict([]), "passed");
  assert.equal(verdict([contended]), "contended");
  assert.equal(verdict([contended, contended]), "contended");
  assert.equal(verdict([contended, over]), "failed");
  assert.equal(verdict([over]), "failed");
  assert.equal(verdict(["test failed"]), "failed");
});

test("a clean measurement over budget fails on its first run", async () => {
  const file = runs([over]);
  assert.equal(await settle(file.once, file.wait, quietly), "failed");
  assert.equal(file.ran(), 1);
  assert.deepEqual(file.waits, []);
});

test("a contended file runs again minutes later and passes once it measures", async () => {
  const file = runs([contended], []);
  assert.equal(await settle(file.once, file.wait, quietly), "passed");
  assert.equal(file.ran(), 2);
  assert.deepEqual(file.waits, [BETWEEN_MS]);
  assert.ok(BETWEEN_MS >= 60_000, "minutes apart, past a slow host");
});

test("a contended file that measures over budget on a later run fails then", async () => {
  const file = runs([contended], [over], []);
  assert.equal(await settle(file.once, file.wait, quietly), "failed");
  assert.equal(file.ran(), 2);
});

test("a file contended on every run fails, after RUNS of them", async () => {
  const file = runs([contended]);
  assert.equal(await settle(file.once, file.wait, quietly), "contended");
  assert.equal(file.ran(), RUNS);
  assert.equal(file.waits.length, RUNS - 1);
});

test("a doubled workload measured cleanly in CI fails its file at once", async () => {
  // As a budget file runs it: the measurement and then its assertion, with nothing else on the machine.
  const budget = async () => {
    const doubled = await measureBudget({ skip: () => {}, diagnostic: () => {} }, () => ({ value: 20, references: Array(20).fill(REFERENCE_MS) as number[], samples: [[20, 20, 20.2, 20, 20.1]] }), { ci: true, pause: async () => {}, others: () => () => 0 });
    try {
      assert.ok(doubled! < 15, `${doubled} M5 Pro CPU ms; budget 15`);
      return [];
    } catch (error) {
      return [(error as Error).message];
    }
  };
  const waits: number[] = [];
  assert.equal(await settle(budget, async (ms) => { waits.push(ms); }, quietly), "failed");
  assert.deepEqual(waits, []);
});

test("measureBudget's contention in CI is what a run counts as contended", async () => {
  let message = "";
  await measureBudget({ skip: () => {}, diagnostic: () => {} }, () => ({ value: 1, references: [4, 4, 4, 8, 8] }), { ci: true, pause: async () => {}, others: () => () => 0 }).catch((error: Error) => { message = error.message; });
  assert.equal(verdict([message]), "contended");
});

test("a budget file's run reports its contention and its failures apart, subtests and crashes included", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "budgets-"));
  t.after(() => rmSync(dir, { recursive: true }));
  const file = (name: string, body: string) => {
    writeFileSync(join(dir, name), `import assert from "node:assert/strict";\nimport { test } from "node:test";\n${body}`);
    return join(dir, name);
  };
  const busy = file("busy.budget.ts", `test("a", () => { throw Error(${JSON.stringify(contended)}); });\ntest("b", async (t) => { await t.test("inner", () => { throw Error(${JSON.stringify(contended)}); }); });\ntest("c", () => {});`);
  const failing = file("over.budget.ts", `test("a", () => { throw Error(${JSON.stringify(contended)}); });\ntest("b", () => { assert.ok(270 < 250, ${JSON.stringify(over)}); });`);
  const crashing = file("crash.budget.ts", `throw Error("at load");`);
  // In a process of its own, as npm run test:budgets runs it: node:test's run() runs no files from inside a test.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("NODE_TEST_")));
  const driver = join(dir, "driver.ts");
  writeFileSync(driver, `import { once, verdict } from ${JSON.stringify(new URL("./budgets.ts", import.meta.url).href)};\nconsole.log("verdict:" + verdict(await once(process.argv[2])));`);
  const once = (path: string) => /verdict:(\w+)/.exec(execFileSync(process.execPath, [driver, path], { env }).toString())?.[1];
  assert.equal(once(busy), "contended");
  assert.equal(once(failing), "failed");
  assert.equal(once(crashing), "failed");
});
