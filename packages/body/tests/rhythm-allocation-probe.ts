// Run by rhythm.test.ts in a child process with V8's compilers turned off:
// samples what the rhythm's step allocates as the fly moves and stays still
// through dawn, the siesta and the night. Prints JSON: the size of a boxed
// number, and every allocation size seen with the functions that made it.

import { Session } from "node:inspector/promises";
import { Rhythm, SUMMER } from "../src/rhythm.ts";

const rhythm = new Rhythm(4, SUMMER, 0.2);
// Still for minutes on end (so it falls asleep), then moving now and then.
const run = (n: number) => {
  for (let i = 0; i < n; i++) rhythm.step(1, i % 900 > 600 && i % 7 === 0);
};
run(3000);

type Node = { id: number; callFrame: { functionName: string; url: string }; children: Node[] };
/** What HeapProfiler.stopSampling returns (Node's types leave out the samples). */
type Profile = { head: Node; samples: { size: number; nodeId: number }[] };
const session = new Session();
session.connect();
const SOURCE = new URL("../src/", import.meta.url).href;
/** Samples allocations while `fn` runs, keeping those made inside the body's source (or by builtins it called). */
const sample = async (fn: () => void, inside: boolean) => {
  await session.post("HeapProfiler.startSampling", { samplingInterval: 16, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  fn();
  const { profile } = (await session.post("HeapProfiler.stopSampling")) as unknown as { profile: Profile };
  const names = new Map<number, string>(), ours = new Set<number>();
  const walk = (n: Node, under: boolean) => {
    const here = under || n.callFrame.url.startsWith(SOURCE);
    names.set(n.id, n.callFrame.functionName || "(anonymous)");
    if (here) ours.add(n.id);
    for (const child of n.children) walk(child, here);
  };
  walk(profile.head, false);
  return profile.samples.filter((s) => !inside || ours.has(s.nodeId)).map((s) => ({ size: s.size, where: names.get(s.nodeId)! }));
};

// What a boxed number costs here: a loop that allocates nothing else.
const boxes = new Float64Array(1);
const numbers = await sample(() => {
  let x = 0.5;
  for (let i = 0; i < 20000; i++) x = boxes[0] = x * 1.0001 + 0.1;
}, false);
const counts = new Map<number, number>();
for (const { size } of numbers) counts.set(size, (counts.get(size) ?? 0) + 1);
const numberSize = [...counts].sort((a, b) => b[1] - a[1])[0][0];

const sizes: Record<string, string[]> = {};
for (const { size, where } of await sample(() => run(6000), true)) {
  const seen = (sizes[size] ??= []);
  if (!seen.includes(where)) seen.push(where);
}
session.disconnect();
console.log(JSON.stringify({ numberSize, sizes }));
