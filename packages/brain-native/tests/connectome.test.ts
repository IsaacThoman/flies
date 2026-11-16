// The native brain and the WebAssembly one against the TypeScript one on the real connectome
// (skipped without packages/brain/data/connectome.bin; `npm run brain:fetch`):
// every tick of one cycle of scripted senses, the eyes shut and then open
// (about 100 simulated seconds), bit for bit, with the internal state, the
// retinas' rates and a digest of every neuron's v, g and a every 50 ticks. It
// takes about half a minute, most of it the TypeScript.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { BUILDS, CONNECTOME, eyeMap, firstDifference, native, readBuffer, scenario, typescript } from "./compare.ts";

const noData = existsSync(CONNECTOME) ? false : "no packages/brain/data/connectome.bin (npm run brain:fetch)";
const seed = 1;
let script: { ticks: ReturnType<typeof scenario>; expected: string[] } | null = null;
/** The TypeScript's lines, worked out once for both builds. */
function typescriptRun() {
  if (!script) {
    const data = readBuffer(CONNECTOME);
    const ticks = scenario(70, seed, eyeMap(data)!);
    script = { ticks, expected: typescript(data, seed, ticks) };
  }
  return script;
}

for (const target of BUILDS) {
  test(`on the real connectome every tick is the TypeScript's, bit for bit, the eyes shut and open (${target.name})`, { skip: target.skip || noData }, () => {
    const { ticks, expected } = typescriptRun();
    const actual = native(target.dir(), CONNECTOME, seed, ticks);
    assert.equal(firstDifference(expected, actual, ticks), null);
    assert.match(expected[0], /^ready 166700 .*\|MN9\|region\.retina-left\|.*\|region\.unplaced\|vision\.lamina left\|.*\|vision\.tangential right$/);
    const simulated = ticks.reduce((sum, { dt }) => sum + (dt >= 0 && dt <= 1000 ? dt : 0), 0);
    assert.ok(simulated >= 70_000, `${simulated} ms simulated`);
    assert.ok(ticks.filter((tick) => tick.senses.light).length > 3000);
    assert.ok(expected.includes("error The right eye has 892 facets, but the light gives 893"));
  });
}
