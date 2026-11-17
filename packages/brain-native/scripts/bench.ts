// Wall time per simulated second of the TypeScript brain and the native one,
// on the real connectome, in the same regimes (tools/bench.cpp's: at rest
// standing, then every sense at full strength, with the eyes shut; then with
// the eyes open on a steady scene, a disc looming at the right eye over and
// over, a grating drifting across both eyes and the whole field flickering;
// then at rest again; 16 ms ticks; a simulated second untimed before each,
// of the scene's steady ground for the eyes):
//
//   node packages/brain-native/scripts/bench.ts [--seconds 10] [--seed 1]
//
// Then the same brain built as WebAssembly (wasm/fly-brain.wasm, through
// wasm/brain.ts, as a browser's worker runs it), in this Node's V8. Single
// threaded all. The native build is build.sh's release build; the
// WebAssembly and native brains are given the very frames the TypeScript sees.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createBrain } from "../../brain/src/runtime.ts";
import { BATTERY, facetAngles, render } from "../../brain/src/stimuli.ts";
import type { Scene, Stimulus } from "../../brain/src/stimuli.ts";
import { RESTING_SENSES } from "../../brain/src/types.ts";
import type { Brain, BrainSenses } from "../../brain/src/types.ts";
import { CONNECTOME, WASM, build, readBuffer } from "../tests/compare.ts";
import { WasmBrainModule } from "../wasm/brain.ts";

const { values } = parseArgs({ options: { seconds: { type: "string", default: "10" }, seed: { type: "string", default: "1" } } });
const seconds = Number(values.seconds);
const seed = Number(values.seed);
const TICK = 16;

type Light = { left: Float32Array; right: Float32Array };

function regime(brain: Brain, label: string, senses: BrainSenses, light?: (tick: number) => Light) {
  let tick = 0;
  for (let t = 0; t < 1000; t += TICK) brain.tick(TICK, light ? { ...senses, light: light(tick++) } : senses);
  let wall = 0;
  let sim = 0;
  let active = 0;
  let spikes = 0;
  let ticks = 0;
  while (sim < seconds * 1000) {
    const { stats } = brain.tick(TICK, light ? { ...senses, light: light(tick++) } : senses);
    wall += stats.wallMs;
    sim += stats.simMs;
    active += stats.active;
    spikes += stats.spikes;
    ticks++;
  }
  console.log(label);
  console.log(`  wall per simulated second  ${(wall / sim).toFixed(4)} s (${((wall / sim) * 16).toFixed(3)} ms per 16 ms tick)`);
  console.log(`  active neurons             ${Math.round(active / ticks)} mean`);
  console.log(`  spikes per second          ${Math.round(spikes / (sim / 1000))}`);
}

console.log("TypeScript (Node, V8)");
const data = readBuffer(CONNECTOME);
const started = performance.now();
const brain = createBrain(data, { seed });
console.log(`built in ${(performance.now() - started).toFixed(0)} ms`);
regime(brain, "at rest (standing)", RESTING_SENSES);
const everything = { loomLeft: 1, loomRight: 1, touch: 1, bumpLeft: 1, bumpRight: 1, wind: 1, sweet: 1, grounded: true, maleTaste: 1, wingbeat: 1, bitter: 1, water: 1 };
regime(brain, "every sense at full strength", everything);

// The scenes, as report.ts (e) has them; each tick's frames are kept for the native run.
const angles = facetAngles(brain.eyes!);
const named = (name: string) => BATTERY.find((each) => each.name === name)!;
const looped = (stimulus: Stimulus): Scene => (t, a, e) => stimulus.scene(t % stimulus.seconds, a, e);
const scenes: { label: string; ground: number; scene: Scene }[] = [
  { label: "eyes open, a steady uniform scene", ground: 1, scene: () => 1 },
  { label: "eyes open, a disc looming at the right eye over and over", ground: 1, scene: looped(named("loom right")) },
  { label: "eyes open, a grating drifting across both eyes", ground: 0.5, scene: named("grating, clockwise").scene },
  { label: "eyes open, the whole field flickering at 4 Hz", ground: 0.6, scene: named("flicker").scene },
];
const warm = Math.ceil(1000 / TICK);
const frames: Uint8Array[] = [];
const lights: Light[][] = [];
for (const { label, ground, scene } of scenes) {
  const seen: Light[] = [];
  lights.push(seen);
  regime(brain, label, RESTING_SENSES, (tick) => {
    const light = { left: new Float32Array(angles.left.az.length), right: new Float32Array(angles.right.az.length) };
    render(tick < warm ? () => ground : scene, ((tick - warm) * TICK) / 1000, angles, light);
    for (const eye of [light.left, light.right]) {
      const count = new Uint8Array(4);
      new DataView(count.buffer).setUint32(0, eye.length, true);
      frames.push(count, new Uint8Array(eye.buffer));
    }
    seen.push(light);
    return light;
  });
}
regime(brain, "at rest again", RESTING_SENSES);
const memory = process.memoryUsage();
const kept = frames.reduce((n, f) => n + f.length, 0);
console.log(
  `resident memory ${(memory.rss / 2 ** 20).toFixed(1)} MB (array buffers ${(memory.arrayBuffers / 2 ** 20).toFixed(1)} MB, ${(kept / 2 ** 20).toFixed(1)} MB of them the frames kept for the other runs)`,
);

console.log("\nWebAssembly (wasm/fly-brain.wasm, Node's V8)");
const compiling = performance.now();
const wasm = await WasmBrainModule.instantiate(readFileSync(join(WASM, "fly-brain.wasm")));
const compiled = performance.now();
const raw = readFileSync(CONNECTOME);
wasm.connectomeSpace(raw.length).set(raw);
const building = performance.now();
const fast = wasm.create(seed);
console.log(`compiled in ${(compiled - compiling).toFixed(0)} ms, built in ${(performance.now() - building).toFixed(0)} ms`);
regime(fast, "at rest (standing)", RESTING_SENSES);
regime(fast, "every sense at full strength", everything);
scenes.forEach(({ label }, s) => regime(fast, label, RESTING_SENSES, (tick) => lights[s][tick]));
regime(fast, "at rest again", RESTING_SENSES);
console.log(`the module's memory ${(wasm.memoryBytes / 2 ** 20).toFixed(1)} MB`);
lights.length = 0;

console.log("\nNative (build.sh release)");
const dir = mkdtempSync(join(tmpdir(), "fly-brain-bench-"));
try {
  writeFileSync(join(dir, "frames"), Buffer.concat(frames));
  frames.length = 0;
  const args = [CONNECTOME, String(seconds), String(seed), join(dir, "frames"), ...scenes.map((s) => s.label)];
  const result = spawnSync(join(build(), "fly-brain-bench"), args, { encoding: "utf8" });
  process.stdout.write(result.stdout + result.stderr);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
