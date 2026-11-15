// Shared by the tests: building the native brain, the scripted senses both
// builds are run through, and the lines both write per tick (the native ones
// by tools/harness.cpp). Every number is written as the hex of its bits, so
// equal lines mean bit-identical results.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { READOUTS } from "../../brain/src/io.ts";
import { createBrain } from "../../brain/src/runtime.ts";
import type { FlyBrain } from "../../brain/src/runtime.ts";
import { mulberry32 } from "../../brain/src/sim.ts";
import type { Simulation } from "../../brain/src/sim.ts";
import { RESTING_SENSES } from "../../brain/src/types.ts";
import type { BrainSenses } from "../../brain/src/types.ts";

export const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
export const CONNECTOME = fileURLToPath(new URL("../../brain/data/connectome.bin", import.meta.url));

const CXX = process.env.CXX ?? "clang++";

/** Why the native tests can't run here, or false when they can. */
export const noCompiler: string | false = spawnSync(CXX, ["--version"]).status === 0 ? false : `no C++ compiler (${CXX})`;

/** Builds the library and tools (a no-op when up to date); returns the directory holding them. */
export function build(mode: "release" | "sanitize" = "release"): string {
  const result = spawnSync(join(PACKAGE, "build.sh"), [mode], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`build.sh ${mode} failed:\n${result.stdout}${result.stderr}`);
  return join(PACKAGE, "build", mode);
}

/** Runs the harness; returns its output lines. */
export function harness(dir: string, args: string[], input: string): string[] {
  const result = spawnSync(join(dir, "fly-brain-harness"), args, { input, encoding: "utf8", maxBuffer: 1 << 30 });
  if (result.status !== 0) throw new Error(`fly-brain-harness ${args.join(" ")} exited with ${result.status ?? result.signal}:\n${result.stderr}`);
  return result.stdout.split("\n").filter((line) => line.length > 0);
}

const view = new DataView(new ArrayBuffer(8));
export const hex64 = (x: number) => {
  view.setFloat64(0, x, true);
  return view.getBigUint64(0, true).toString(16).padStart(16, "0");
};
export const hex32 = (x: number) => {
  view.setFloat32(0, x, true);
  return view.getUint32(0, true).toString(16).padStart(8, "0");
};

export type Tick = { dt: number; senses: BrainSenses; what: string };

const SCALAR = ["loomLeft", "loomRight", "touch", "bumpLeft", "bumpRight", "wind", "sweet"] as const;
type Scalar = (typeof SCALAR)[number];

/**
 * The scripted senses: rest standing and airborne, each sense alone, partial
 * and changing intensities, combinations, everything at once, looming pulses,
 * out-of-range values, and tick lengths from 0 to the longest allowed, in
 * cycles until `seconds` of fly time. A few invalid ticks are in there too.
 * Intensities are single precision, as the C interface takes them.
 */
export function scenario(seconds: number, seed = 1): Tick[] {
  const random = mulberry32(seed);
  const ticks: Tick[] = [];
  let total = 0;
  const add = (dt: number, senses: Partial<BrainSenses>, what: string) => {
    const each: BrainSenses = { ...RESTING_SENSES, ...senses };
    for (const key of SCALAR) each[key] = Math.fround(each[key]);
    ticks.push({ dt, senses: each, what });
    if (dt >= 0 && dt <= 1000) total += dt;
  };
  const hold = (ms: number, dt: number | (() => number), senses: (elapsed: number) => Partial<BrainSenses>, what: string) => {
    for (let elapsed = 0; elapsed < ms; ) {
      const d = typeof dt === "number" ? dt : dt();
      add(d, senses(elapsed), what);
      elapsed += d;
    }
  };
  const frame = 1000 / 60;
  for (let cycle = 0; total < seconds * 1000; cycle++) {
    hold(3000, 16, () => ({}), "rest");
    hold(1000, frame, () => ({ grounded: false }), "rest, airborne");
    for (const sense of SCALAR) {
      hold(1500, cycle % 2 === 0 ? 16 : 33, () => ({ [sense]: 1 }), `${sense} at full strength`);
      hold(800, 16, () => ({}), `rest after ${sense}`);
    }
    hold(1000, 33, (t) => ({ loomLeft: t / 1000 }), "loomLeft ramping up");
    hold(600, 16, (t) => ({ sweet: 0.5 + 0.5 * Math.sin(t / 50) }), "sweet wavering");
    hold(2000, frame, () => ({ touch: 0.4, wind: 0.5, grounded: false }), "held and dragged");
    hold(1500, 16, () => ({ sweet: 1, touch: 0.4 }), "sweet while touched");
    hold(1000, 16, () => ({ loomLeft: 1, loomRight: 1 }), "looming on both sides");
    hold(2000, 16, () => ({ loomLeft: 1, loomRight: 1, touch: 1, bumpLeft: 1, bumpRight: 1, wind: 1, sweet: 1 }), "everything at once");
    hold(4000, 16, (t) => ({ loomRight: t % 1000 < 100 ? 1 : 0 }), "a looming pulse every second");
    hold(3000, () => Math.floor(random() * 50 * 4) / 4, () => Object.fromEntries(SCALAR.map((s) => [s, random() < 0.3 ? random() : 0])), "random ticks and senses");
    for (const dt of [0.4, 0.6, 0.25, 0, 0, 0.75, 1, 1.5, 2.5]) add(dt, { touch: 0.3 }, "short ticks");
    for (let k = 0; k < 3; k++) add(1000, { wind: k === 1 ? 1 : 0, grounded: k !== 2 }, "the longest ticks");
    for (let k = 0; k < 10; k++) add(100, { bumpLeft: k / 10 }, "100 ms ticks");
    for (let k = 0; k < 30; k++) add(7.3, { bumpRight: 1 - k / 30 }, "7.3 ms ticks");
    hold(500, 16, () => ({ wind: 7, touch: -1, sweet: Number.NaN, loomLeft: Number.POSITIVE_INFINITY }), "out-of-range senses");
    for (const dt of [-1, Number.NaN, 1000.5, Number.POSITIVE_INFINITY]) add(dt, {}, "an invalid tick");
    hold(5000, 16, () => ({}), "rest at the end of a cycle");
  }
  return ticks;
}

/** The harness's input for these ticks. */
export function script(ticks: readonly Tick[]): string {
  return ticks.map(({ dt, senses }) => [hex64(dt), ...SCALAR.map((s: Scalar) => hex32(senses[s])), senses.grounded ? 1 : 0].join(" ")).join("\n") + "\n";
}

/** FNV-1a over the bits of every neuron's v, g and a (tools/harness.cpp has the same). */
export function digest(sim: Simulation): string {
  const bits = new DataView(new ArrayBuffer(4));
  let h = 2166136261;
  for (let i = 0; i < sim.neurons; i++) {
    for (const x of [sim.potential(i), sim.drive(i), sim.adaptationOf(i)]) {
      bits.setFloat32(0, x, true);
      h = Math.imul(h ^ bits.getUint32(0, true), 16777619) >>> 0;
    }
  }
  return h.toString(16).padStart(8, "0");
}

/** What the harness prints for these ticks, computed by the TypeScript brain. */
export function typescript(data: ArrayBuffer, seed: number, ticks: readonly Tick[]): string[] {
  let brain: FlyBrain;
  try {
    // createBrain makes a FlyBrain; the comparison reads its internal state too.
    brain = createBrain(data, { seed }) as FlyBrain;
  } catch (error) {
    return [`error ${(error as Error).message}`];
  }
  const lines = [`ready ${brain.neurons} ${brain.connections} ${READOUTS.map((r) => r.name).join("|")}`];
  let tick = 0;
  for (const { dt, senses } of ticks) {
    try {
      const { command, stats } = brain.tick(dt, senses);
      const c = [command.walk, command.turn, command.back, command.escape, command.wings, command.groom, command.feed];
      const rates = READOUTS.map((r) => stats.rates[r.name]);
      lines.push(
        [
          `${stats.spikes} ${stats.active} ${hex64(stats.simMs)}`,
          c.map(hex64).join(" "),
          rates.map(hex64).join(" "),
          c.map(hex32).join(" "),
          rates.map(hex32).join(" "),
          [brain.state.arousal.value, brain.state.scene.left.value, brain.state.scene.right.value].map(hex64).join(" "),
          tick++ % 50 === 49 ? digest(brain.sim) : "-",
        ].join(" | "),
      );
    } catch (error) {
      lines.push(`error ${(error as Error).message}`);
    }
  }
  return lines;
}

/** The same from the native brain. */
export function native(dir: string, path: string, seed: number, ticks: readonly Tick[]): string[] {
  return harness(dir, ["brain", path, String(seed)], script(ticks));
}

/** The first line where the two differ, described, or null when every line is the same. */
export function firstDifference(expected: readonly string[], actual: readonly string[], ticks: readonly Tick[]): string | null {
  const n = Math.max(expected.length, actual.length);
  for (let k = 0; k < n; k++) {
    if (expected[k] === actual[k]) continue;
    const tick = k === 0 ? "construction" : `tick ${k - 1} (${ticks[k - 1]?.what}, dt ${ticks[k - 1]?.dt})`;
    return `first difference at ${tick}:\n  typescript ${expected[k]}\n  native     ${actual[k]}`;
  }
  return null;
}

/** A file holding these bytes for the harness, removed by the returned function. */
export function tempFile(bytes: Uint8Array): { path: string; remove: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "fly-brain-native-"));
  const path = join(dir, "connectome.bin");
  writeFileSync(path, bytes);
  return { path, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

/** A fresh ArrayBuffer of a file (createBrain wants one, 8-byte aligned). */
export function readBuffer(path: string): ArrayBuffer {
  const bytes = readFileSync(path);
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
