// The native brain against the TypeScript one on the real connectome
// (skipped without packages/brain/data/connectome.bin; `npm run brain:fetch`):
// every tick of 70 simulated seconds of scripted senses, bit for bit, with the
// internal state and a digest of every neuron's v, g and a every 50 ticks. It
// takes about half a minute, most of it the TypeScript.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { CONNECTOME, build, firstDifference, native, noCompiler, readBuffer, scenario, typescript } from "./compare.ts";

const skip = noCompiler || (existsSync(CONNECTOME) ? false : "no packages/brain/data/connectome.bin (npm run brain:fetch)");

test("on the real connectome every tick is the TypeScript's, bit for bit", { skip }, () => {
  const dir = build();
  const seed = 1;
  const ticks = scenario(70, seed);
  const expected = typescript(readBuffer(CONNECTOME), seed, ticks);
  const actual = native(dir, CONNECTOME, seed, ticks);
  assert.equal(firstDifference(expected, actual, ticks), null);
  assert.match(expected[0], /^ready 166700 /);
  const simulated = ticks.reduce((sum, { dt }) => sum + (dt >= 0 && dt <= 1000 ? dt : 0), 0);
  assert.ok(simulated >= 70_000, `${simulated} ms simulated`);
});
