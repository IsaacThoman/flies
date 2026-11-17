// The room's protocol fuzzed for as long as asked (apps/server/tests/fuzzing.ts
// says what is sent and what is checked): seed after seed, a table in this
// process and then a real server on the loopback, each for its share of the
// time. A failure stops the run and names its seed; `--seed` replays one.
//
//   npm run fuzz:rooms -- [--seconds 60] [--seed N] [--sockets 6]

import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { fuzzServer, fuzzTable } from "../apps/server/tests/fuzzing.ts";

const { values } = parseArgs({ options: { seconds: { type: "string", default: "60" }, seed: { type: "string" }, sockets: { type: "string", default: "6" } } });
const seconds = Number(values.seconds);
const sockets = Number(values.sockets);
const end = performance.now() + seconds * 1000;
/** Each seed runs this long (ms) at each level: long enough to get somewhere, short enough for many seeds. */
const EACH = 5000;

let seed = values.seed === undefined ? Math.floor(Math.random() * 2 ** 31) : Number(values.seed);
let seeds = 0;
let steps = 0;
let sent = 0;
do {
  const until = (ms: number) => {
    const stop = Math.min(end, performance.now() + ms);
    return () => performance.now() > stop;
  };
  try {
    steps += fuzzTable(seed, until(EACH)).steps;
    sent += (await fuzzServer(seed, until(EACH), sockets)).sent;
  } catch (error) {
    console.error(`failed at seed ${seed}: replay with npm run fuzz:rooms -- --seed ${seed}`);
    throw error;
  }
  seeds++;
  seed = (seed + 1) >>> 0;
} while (values.seed === undefined && performance.now() < end);
console.log(JSON.stringify({ seeds, tableSteps: steps, socketMessages: sent, seconds: Math.round((performance.now() - (end - seconds * 1000)) / 1000) }));
