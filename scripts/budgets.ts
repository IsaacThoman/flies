// Runs the speed budgets (*.budget.ts) one file at a time, after the rest of
// npm test, and in CI gives a file that came out contended more runs later on.
//
// measureBudget (scripts/cpuBudget.ts) already retries a contended measurement
// three times within a minute or so, waiting for the machine to go quiet. Some
// CI runners are slow for longer than that as a whole host, which nothing inside
// the virtual machine can see: every sample spreads past its bounds for minutes
// while the guest looks idle. So a file whose every failure is that contention
// runs again, up to RUNS times in all, BETWEEN_MS apart. Any other failure fails
// it at once: a clean measurement over budget, a doubled workload, a functional
// assertion or a crash is never given another run, and a file still contended
// on its last run fails as before. Locally a contended budget skips instead of
// failing, so nothing is run again there.

import { globSync } from "node:fs";
import { run } from "node:test";
import { spec } from "node:test/reporters";
import { setTimeout as pause } from "node:timers/promises";
import { CONTENDED } from "./cpuBudget.ts";

const BUDGETS = ["apps/*/tests/*.budget.ts", "packages/*/src/**/*.budget.ts", "packages/*/tests/*.budget.ts"];
/** Runs a contended file gets in all, and the wait before each again: long enough for a slow host to pass. */
export const RUNS = 3;
export const BETWEEN_MS = 120_000;

export type Outcome = "passed" | "contended" | "failed";

/** What one run of a file means, from its failing tests' messages. */
export function verdict(failures: readonly string[]): Outcome {
  if (failures.length === 0) return "passed";
  return failures.every((message) => message.startsWith(CONTENDED)) ? "contended" : "failed";
}

/** Runs a file until it passes or fails outright, giving contention RUNS runs BETWEEN_MS apart; how it ended. */
export async function settle(once: () => Promise<readonly string[]>, wait: (ms: number) => Promise<unknown> = pause, log: (line: string) => void = console.log): Promise<Outcome> {
  for (let attempt = 1; ; attempt++) {
    const outcome = verdict(await once());
    if (outcome !== "contended" || attempt === RUNS) return outcome;
    log(`contended on run ${attempt} of ${RUNS}; running it again in ${BETWEEN_MS / 1000} s`);
    await wait(BETWEEN_MS);
  }
}

/** One run of `file` in its own process, reported as npm test reports; its failing tests' messages. */
export async function once(file: string) {
  const failures: string[] = [];
  const stream = run({ files: [file] });
  // A test failing because its subtests did adds nothing to theirs.
  stream.on("test:fail", ({ details }) => {
    const error = details.error as Error & { failureType?: string; cause?: { message?: string } };
    if (error.failureType !== "subtestsFailed") failures.push(String(error.cause?.message ?? error.message));
  });
  for await (const line of stream.compose(spec)) process.stdout.write(line);
  return failures;
}

if (import.meta.main) {
  const files = BUDGETS.flatMap((pattern) => globSync(pattern)).sort();
  const failed: string[] = [];
  for (const file of files) {
    const outcome = await settle(() => once(file), pause, (line) => console.log(`${file}: ${line}`));
    if (outcome !== "passed") failed.push(`${file} (${outcome === "contended" ? `contended on all ${RUNS} runs` : "failed"})`);
  }
  if (failed.length) {
    console.error(`Speed budgets not met: ${failed.join(", ")}`);
    process.exitCode = 1;
  }
}
