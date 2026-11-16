// The WebAssembly build as browsers get it: wasm/fly-brain.wasm through
// wasm/brain.ts, against the TypeScript brain, tick for tick, as far as the C
// interface shows it (the commands and rates as floats, the spikes, active
// neurons and simulated time, the eyes' map, every refusal and its message),
// on the synthetic connectome and on the real one. The harness built from the
// same objects compares the internal state too (the other tests). And the
// committed modules are what wasm.sh makes of today's sources.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ACCEPTANCE } from "../../brain/src/eyes.ts";
import { FlyBrain, createBrain } from "../../brain/src/runtime.ts";
import { syntheticConnectome } from "../../brain/src/test-helpers.ts";
import type { Brain, BrainState, EyeMap } from "../../brain/src/types.ts";
import { WasmBrainModule, wasmBrainSupported } from "../wasm/brain.ts";
import { CONNECTOME, PACKAGE, WASM, eyeMap, hex32, readBuffer, scenario } from "./compare.ts";
import type { Tick } from "./compare.ts";

const MODULE = readFileSync(join(WASM, "fly-brain.wasm"));

async function wasmBrain(bytes: Uint8Array, seed: number): Promise<Brain> {
  const module = await WasmBrainModule.instantiate(MODULE);
  module.connectomeSpace(bytes.length).set(bytes);
  return module.create(seed);
}

/** A tick as the C interface reports it: the TypeScript's doubles as the floats it hands out. */
function line(state: BrainState, names: readonly string[]): string {
  const { command: c, stats } = state;
  const floats = [c.walk, c.turn, c.back, c.escape, c.wings, c.groom, c.feed, ...names.map((name) => stats.rates[name])].map(hex32).join(" ");
  return `${stats.spikes} ${stats.active} ${stats.simMs} | ${floats}`;
}

function run(brain: Brain, ticks: readonly Tick[], names: readonly string[]): string[] {
  return ticks.map(({ dt, senses }) => {
    try {
      return line(brain.tick(dt, senses), names);
    } catch (error) {
      return `error ${(error as Error).message}`;
    }
  });
}

async function compare(bytes: Uint8Array, seed: number, ticks: readonly Tick[]) {
  const typescript = createBrain(bytes.slice().buffer, { seed }) as FlyBrain;
  const wasm = await wasmBrain(bytes, seed);
  const names = Object.keys(typescript.rates);
  const expected = run(typescript, ticks, names);
  const actual = run(wasm, ticks, names);
  assert.deepEqual(Object.keys(wasm.tick(0, ticks[0].senses).stats.rates), names, "the same rates, in the same order");
  const k = expected.findIndex((each, m) => each !== actual[m]);
  return { expected, typescript, wasm, difference: k < 0 ? null : `tick ${k} (${ticks[k].what}, dt ${ticks[k].dt}):\n  typescript  ${expected[k]}\n  WebAssembly ${actual[k]}` };
}

// Light for an eyeless brain, which it must ignore.
const NOWHERE: EyeMap = { left: { directions: new Float32Array(12) }, right: { directions: new Float32Array(12) }, acceptance: 0.05 };

test("this Node runs the module, as the browsers it is for do", () => {
  assert.ok(wasmBrainSupported());
  assert.ok(WebAssembly.validate(MODULE));
});

test("on the synthetic connectome every tick is the TypeScript's, as the C interface shows it", async () => {
  const synthetic = syntheticConnectome();
  for (const seed of [1, 0xdeadbeef]) {
    const ticks = scenario(70, seed, NOWHERE);
    const { expected, wasm, difference } = await compare(synthetic.bytes, seed, ticks);
    assert.equal(difference, null, `seed ${seed}: ${difference}`);
    assert.equal(wasm.eyes, null);
    assert.ok(expected.some((each) => each.startsWith("error tick takes 0 to 1000 ms, not NaN")));
  }
});

test("a broken connectome or seed is refused with the TypeScript's message", async () => {
  const s = syntheticConnectome().bytes;
  const broken = s.slice();
  new DataView(broken.buffer).setUint32(4, 2, true);
  for (const bytes of [broken, s.subarray(0, s.length - 64), new Uint8Array(0)]) {
    let message = "";
    try {
      createBrain(bytes.slice().buffer);
    } catch (error) {
      message = (error as Error).message;
    }
    assert.ok(message);
    await assert.rejects(wasmBrain(bytes, 1), { message });
  }
  await assert.rejects(wasmBrain(s, 1.5), { message: "The seed must be a whole number, not 1.5" });
});

const noData = existsSync(CONNECTOME) ? false : "no packages/brain/data/connectome.bin (npm run brain:fetch)";

test("on the real connectome the eyes are the TypeScript's and every tick is, the eyes shut and open", { skip: noData }, async () => {
  const data = readBuffer(CONNECTOME);
  const ticks = scenario(70, 1, eyeMap(data)!);
  const { expected, typescript, wasm, difference } = await compare(new Uint8Array(data), 1, ticks);
  assert.equal(difference, null, difference ?? "");
  assert.deepEqual(wasm.eyes!.left.directions, typescript.eyes!.left.directions);
  assert.deepEqual(wasm.eyes!.right.directions, typescript.eyes!.right.directions);
  assert.equal(wasm.eyes!.acceptance, Math.fround(ACCEPTANCE));
  assert.ok(expected.includes("error The left eye has 880 facets, but the light gives undefined"));
});

const digest = (file: string) => createHash("sha256").update(readFileSync(join(PACKAGE, file))).digest("hex");

test("the committed modules were built from these sources (npm run brain:wasm rebuilds them)", () => {
  const built = JSON.parse(readFileSync(join(WASM, "build.json"), "utf8")) as { sources: Record<string, string>; modules: Record<string, string> };
  const changed = Object.entries(built.sources)
    .filter(([file, sha]) => !existsSync(join(PACKAGE, file)) || digest(file) !== sha)
    .map(([file]) => file);
  assert.deepEqual(changed, [], "changed since the modules were built: npm run brain:wasm");
  const sources = ["wasm.sh", ...["include", "src"].flatMap((dir) => readdirSorted(dir)), "tools/harness.cpp"];
  assert.deepEqual(Object.keys(built.sources).sort(), sources.sort(), "a source was added or removed: npm run brain:wasm");
  for (const [module, sha] of Object.entries(built.modules)) assert.equal(digest(join("wasm", module)), sha, `wasm/${module} isn't the one built`);
});

function readdirSorted(dir: string): string[] {
  return readdirSync(join(PACKAGE, dir))
    .filter((file) => /\.(h|cpp|hpp)$/.test(file))
    .map((file) => `${dir}/${file}`);
}
