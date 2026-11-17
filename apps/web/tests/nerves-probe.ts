// Run by nerves.test.ts in a child process with V8's compilers turned off:
// times the game's per-frame nervous-system work in the interpreter and
// samples what it allocates. Prints JSON as packages/fly/tests/allocation-probe.ts does.

import { Session } from "node:inspector/promises";
import { REGIONS } from "@fly/brain";
import { NERVE_PARTS, SOMA_GROUPS } from "@fly/fly";
import { NerveGlow } from "../src/nerves/glow.ts";
import { nervesSlot, nervesWanted } from "../src/nerves/panel.ts";
import { Xray, xrayWanted } from "../src/nerves/xray.ts";
import { CornerDeck, CornerPlacement } from "../src/ui/corners.ts";

const parts = new Float32Array(NERVE_PARTS.length + 3);
const glow = new NerveGlow(parts);
const rates = new Float32Array(REGIONS.length);
const readouts = Object.fromEntries(SOMA_GROUPS.map((g) => [g.rate, 0]));
const xray = new Xray();
const deck = new CornerDeck(), placement = new CornerPlacement();
const frame = (i: number) => {
  for (let r = 0; r < rates.length; r++) rates[r] = ((i * 7 + r * 13) % 50) * 0.3;
  for (let s = 0; s < SOMA_GROUPS.length; s++) readouts[SOMA_GROUPS[s].rate] = ((i * 11 + s * 7) % 100);
  glow.update(rates, 1 / 60, readouts);
  xray.update(1 / 60, xrayWanted("always", "play", (i & 64) !== 0, false), 40 + (i % 200));
  const wanted = nervesWanted("wallpaper", "play", (i & 128) !== 0, false);
  deck.update(1 / 60, wanted === "show", (i & 128) !== 0, i >> 8);
  placement.update(1 / 60, wanted, deck.goal, nervesSlot(wanted));
};
const run = (n: number) => {
  for (let i = 0; i < n; i++) frame(i);
};

run(1500);
const start = performance.now();
const cpuStart = process.cpuUsage();
run(1500);
const micros = ((performance.now() - start) / 1500) * 1000;
const cpu = process.cpuUsage(cpuStart);
const cpuMicros = (cpu.user + cpu.system) / 1500;

type Node = { id: number; callFrame: { functionName: string; url: string }; children: Node[] };
type Profile = { head: Node; samples: { size: number; nodeId: number }[] };
const session = new Session();
session.connect();
const SOURCE = new URL("../src/", import.meta.url).href;
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
const boxes = new Float64Array(1);
const numbers = await sample(() => {
  let x = 0.5;
  for (let i = 0; i < 20000; i++) x = boxes[0] = x * 1.0001 + 0.1;
}, false);
const counts = new Map<number, number>();
for (const { size } of numbers) counts.set(size, (counts.get(size) ?? 0) + 1);
const numberSize = [...counts].sort((a, b) => b[1] - a[1])[0][0];
const sizes: Record<string, string[]> = {};
for (const { size, where } of await sample(() => run(600), true)) {
  const seen = (sizes[size] ??= []);
  if (!seen.includes(where)) seen.push(where);
}
session.disconnect();
console.log(JSON.stringify({ micros, cpuMicros, numberSize, sizes }));
