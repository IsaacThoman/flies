// Run by prints.test.ts in a child process with V8's compilers turned off:
// times the footprints' per-frame work in the interpreter, with a fly walking
// round and round through a drip of honey so that its feet load and print,
// and samples what that work allocates. Prints JSON as nerves-probe.ts does.

import { Session } from "node:inspector/promises";
import * as THREE from "three";
import { PICNIC, Pantry, World } from "@fly/world";
import { Footprints } from "../src/scene/prints.ts";
import { walker } from "./walker.ts";

const world = new World(PICNIC);
// A circle 4 mm round at 5 mm/s, through honey on its way.
const pantry = new Pantry(world, [{ name: "honey", x: 4, z: 0, r: 1.5, sweet: 1 }]);
const fly = walker(world, 0, -4, Math.PI / 2);
fly.pose.speed = 2;
fly.pose.turn = -1.25;
const footprints = new Footprints(new THREE.Group());
const geometry = footprints.prints.mesh.geometry as THREE.InstancedBufferGeometry;
let time = 0;
const frames = (n: number) => {
  for (let i = 0; i < n; i++) {
    time += 1 / 60;
    fly.step(1 / 60);
    footprints.update(fly.model, true, false, world, pantry, time);
  }
};

frames(1500);
// Timed apart from the model's own update.
let micros = 0;
for (let i = 0; i < 1500; i++) {
  time += 1 / 60;
  fly.step(1 / 60);
  const start = performance.now();
  footprints.update(fly.model, true, false, world, pantry, time);
  micros += performance.now() - start;
}
micros = (micros / 1500) * 1000;

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
const before = time;
const sizes: Record<string, string[]> = {};
for (const { size, where } of await sample(() => frames(600), true)) {
  const seen = (sizes[size] ??= []);
  if (!seen.includes(where)) seen.push(where);
}
// Prints set down while sampled.
const at = geometry.getAttribute("aAt").array;
let prints = 0;
for (let i = 0; i < geometry.instanceCount; i++) if (at[i * 4 + 3] > before) prints++;
session.disconnect();
console.log(JSON.stringify({ micros, prints, numberSize, sizes }));
