// The room's protocol fuzzed for a moment on every run, from a fresh seed
// each time (printed, so a failure replays with `npm run fuzz:rooms -- --seed`).
// fuzzing.ts says what is checked.

import { test } from "node:test";
import { performance } from "node:perf_hooks";
import { fuzzServer, fuzzTable } from "./fuzzing.ts";

const seed = Number(process.env.FUZZ_SEED ?? Math.floor(Math.random() * 2 ** 31));

const within = (ms: number) => {
  const end = performance.now() + ms;
  return () => performance.now() > end;
};

test(`a table takes whatever devices send and stays within its bounds (seed ${seed})`, (t) => {
  const { steps, messages } = fuzzTable(seed, within(800));
  t.diagnostic(`${steps} steps, ${messages} messages`);
});

test(`a server on the loopback stays up and seats a fair device after devices send whatever they like (seed ${seed})`, async (t) => {
  const { sent, opened } = await fuzzServer(seed, within(800));
  t.diagnostic(`${sent} messages over ${opened} connections`);
});
