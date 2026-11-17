// Shared by the tests: building the native brain, the scripted senses both
// builds are run through, and the lines both write per tick (the native ones
// by tools/harness.cpp). Every number is written as the hex of its bits, so
// equal lines mean bit-identical results. The same harness built as
// WebAssembly (wasm/fly-brain-harness.wasm, committed) runs in this process
// under WASI wherever a native build does, so each comparison holds both
// builds to the TypeScript.

import { spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WASI } from "node:wasi";
import type { EyeColumn } from "../../brain/src/eye-columns.ts";
import { buildEyes } from "../../brain/src/eyes.ts";
import { loadConnectome } from "../../brain/src/format.ts";
import { FlyBrain, createBrain } from "../../brain/src/runtime.ts";
import { mulberry32 } from "../../brain/src/sim.ts";
import type { Simulation } from "../../brain/src/sim.ts";
import { BATTERY, facetAngles, render } from "../../brain/src/stimuli.ts";
import type { Scene } from "../../brain/src/stimuli.ts";
import { RESTING_SENSES } from "../../brain/src/types.ts";
import type { BrainSenses, EyeMap } from "../../brain/src/types.ts";

export const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
export const CONNECTOME = fileURLToPath(new URL("../../brain/data/connectome.bin", import.meta.url));

const CXX = process.env.CXX ?? "clang++";

/** Why the native tests can't run here, or false when they can. */
export const noCompiler: string | false = spawnSync(CXX, ["--version"]).status === 0 ? false : `no C++ compiler (${CXX})`;

/** The WebAssembly build (wasm.sh): `harness` runs this directory's fly-brain-harness.wasm. */
export const WASM = join(PACKAGE, "wasm");

/** The builds each comparison runs: the native one where there is a compiler, and always the WebAssembly one. */
export const BUILDS: readonly { name: string; skip: string | false; dir: () => string }[] = [
  { name: "native", skip: noCompiler, dir: () => build() },
  { name: "WebAssembly", skip: false, dir: () => WASM },
];

/** Builds the library and tools (a no-op when up to date); returns the directory holding them. */
export function build(mode: "release" | "sanitize" = "release"): string {
  const result = spawnSync(join(PACKAGE, "build.sh"), [mode], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`build.sh ${mode} failed:\n${result.stdout}${result.stderr}`);
  return join(PACKAGE, "build", mode);
}

/** Runs the harness of a build (`build()`'s directory, or WASM); returns its output lines. */
export function harness(dir: string, args: string[], input: string): string[] {
  const result = dir === WASM ? wasmHarness(args, input) : spawnSync(join(dir, "fly-brain-harness"), args, { input, encoding: "utf8", maxBuffer: 1 << 30 });
  if (result.status !== 0) throw new Error(`fly-brain-harness ${args.join(" ")} exited with ${result.status ?? result.signal}:\n${result.stderr}`);
  return result.stdout.split("\n").filter((line) => line.length > 0);
}

let harnessModule: WebAssembly.Module | null = null;

/** fly-brain-harness.wasm on its own WASI, in this process: its files are the machine's, its standard streams files of their own. */
function wasmHarness(args: string[], input: string): { status: number; signal: null; stdout: string; stderr: string } {
  harnessModule ??= new WebAssembly.Module(readFileSync(join(WASM, "fly-brain-harness.wasm")));
  const temp = mkdtempSync(join(tmpdir(), "fly-brain-wasm-"));
  const [stdin, stdout, stderr] = ["stdin", "stdout", "stderr"].map((name) => join(temp, name));
  writeFileSync(stdin, input);
  const fds = [openSync(stdin, "r"), openSync(stdout, "w"), openSync(stderr, "w")];
  try {
    const wasi = new WASI({ version: "preview1", args: ["fly-brain-harness", ...args], preopens: { "/": "/" }, stdin: fds[0], stdout: fds[1], stderr: fds[2], returnOnExit: true });
    const status = wasi.start(new WebAssembly.Instance(harnessModule, wasi.getImportObject() as WebAssembly.Imports));
    for (const fd of fds) closeSync(fd);
    fds.length = 0;
    return { status, signal: null, stdout: readFileSync(stdout, "utf8"), stderr: readFileSync(stderr, "utf8") };
  } finally {
    for (const fd of fds) closeSync(fd);
    rmSync(temp, { recursive: true, force: true });
  }
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

/** Columns for the eyes in place of eye-columns.ts's (runtime.ts's eyeColumns option). */
export type Columns = { readonly right: readonly EyeColumn[]; readonly left: readonly EyeColumn[] };

const SCALAR = ["loomLeft", "loomRight", "touch", "bumpLeft", "bumpRight", "wind", "sweet", "maleTaste", "wingbeat", "bitter", "water"] as const;
type Scalar = (typeof SCALAR)[number];
/** The internal state, after the senses in the harness's line, in fly_senses's order. */
const STATE = ["clockMorning", "clockEvening", "clockSleep", "sleepPressure", "sleepDepth"] as const;
/** The temperature at each antenna, last in the harness's line; left out, NaN. */
const TEMPERATURE = ["temperatureLeft", "temperatureRight"] as const;

/**
 * The scripted senses: rest standing and airborne, each sense alone, partial
 * and changing intensities, combinations, everything at once, looming pulses,
 * out-of-range values, and tick lengths from 0 to the longest allowed, in
 * cycles until `seconds` of fly time. A few invalid ticks are in there too.
 * Intensities are single precision, as the C interface takes them.
 *
 * Given eyes, each cycle then opens them (see sight()), with light as
 * Float32Arrays, as the C interface takes it.
 */
export function scenario(seconds: number, seed = 1, eyes?: EyeMap): Tick[] {
  const random = mulberry32(seed);
  const ticks: Tick[] = [];
  let total = 0;
  const add = (dt: number, senses: Partial<BrainSenses>, what: string) => {
    const each: BrainSenses = { ...RESTING_SENSES, ...senses };
    for (const key of SCALAR) each[key] = Math.fround(each[key]);
    if (each.hunger !== undefined) each.hunger = Math.fround(each.hunger);
    if (each.thirst !== undefined) each.thirst = Math.fround(each.thirst);
    for (const key of STATE) if (each[key] !== undefined) each[key] = Math.fround(each[key]);
    for (const key of TEMPERATURE) if (each[key] !== undefined) each[key] = Math.fround(each[key]);
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
    hold(1500, 16, () => ({ sweet: 1, hunger: 0 }), "sweet just after a meal");
    hold(2000, 16, (t) => ({ sweet: 0.6, hunger: t / 2000 }), "weak sugar as hunger rises");
    hold(500, 16, (t) => ({ sweet: 0.5, hunger: [Number.NaN, -1, 7, Number.NEGATIVE_INFINITY][Math.floor(t / 125)] }), "out-of-range hunger");
    hold(1000, 16, () => ({ loomLeft: 1, loomRight: 1 }), "looming on both sides");
    hold(1500, 16, () => ({ sweet: 1, bitter: 0.5 }), "sugar laced with something bitter");
    hold(2000, 16, (t) => ({ sweet: 1, water: 1, thirst: 1 - t / 2000 }), "sugary water as thirst is quenched");
    hold(500, 16, (t) => ({ water: 1, thirst: [Number.NaN, -1, 7, Number.NEGATIVE_INFINITY][Math.floor(t / 125)] }), "out-of-range thirst");
    hold(2000, 16, () => ({ loomLeft: 1, loomRight: 1, touch: 1, bumpLeft: 1, bumpRight: 1, wind: 1, sweet: 1, maleTaste: 1, wingbeat: 1, bitter: 1, water: 1 }), "everything at once");
    hold(4000, 16, (t) => ({ loomRight: t % 1000 < 100 ? 1 : 0 }), "a looming pulse every second");
    hold(3000, () => Math.floor(random() * 50 * 4) / 4, () => Object.fromEntries(SCALAR.map((s) => [s, random() < 0.3 ? random() : 0])), "random ticks and senses");
    for (const dt of [0.4, 0.6, 0.25, 0, 0, 0.75, 1, 1.5, 2.5]) add(dt, { touch: 0.3 }, "short ticks");
    for (let k = 0; k < 3; k++) add(1000, { wind: k === 1 ? 1 : 0, grounded: k !== 2 }, "the longest ticks");
    for (let k = 0; k < 10; k++) add(100, { bumpLeft: k / 10 }, "100 ms ticks");
    for (let k = 0; k < 30; k++) add(7.3, { bumpRight: 1 - k / 30 }, "7.3 ms ticks");
    hold(500, 16, () => ({ wind: 7, touch: -1, sweet: Number.NaN, loomLeft: Number.POSITIVE_INFINITY }), "out-of-range senses");
    hold(2000, 16, (t) => ({ clockMorning: 1 - t / 2000, clockEvening: t / 2000, clockSleep: 0.5, sleepPressure: 0.3 }), "the clock turning, a little sleepy");
    hold(3000, 16, () => ({ clockSleep: 1, sleepPressure: 0.6, sleepDepth: 1 }), "asleep at night");
    hold(1500, 16, () => ({ clockSleep: 1, sleepPressure: 0.6, sleepDepth: 1, touch: 1, wind: 0.5, bumpLeft: 1 }), "asleep and stroked");
    hold(1000, 16, () => ({ clockSleep: 1, sleepDepth: 0.5, loomRight: 1 }), "half asleep, a loom");
    hold(500, 16, () => ({ clockMorning: 7, clockEvening: -1, clockSleep: Number.NaN, sleepPressure: Number.POSITIVE_INFINITY, sleepDepth: -0.5 }), "out-of-range state");
    hold(1000, 16, () => Object.fromEntries(STATE.map((s) => [s, random() < 0.5 ? random() : 0])), "random state");
    hold(2000, 16, () => ({ temperatureLeft: 25, temperatureRight: 25 }), "at 25 °C");
    hold(3000, 16, (t) => ({ temperatureLeft: 25 + t / 1000, temperatureRight: 25 + t / 1500 }), "warming, the left faster");
    hold(2000, 33, (t) => ({ temperatureLeft: 28 - t / 400, temperatureRight: 27 }), "cooling on the left");
    hold(1500, 16, () => ({ temperatureLeft: 16, temperatureRight: 16, touch: 0.5 }), "a step to 16 °C, touched");
    for (let k = 0; k < 6; k++) add([100, 1000, 7.3][k % 3], { temperatureLeft: 20 + 3 * k, temperatureRight: 35 - 2 * k }, "long ticks at changing temperatures");
    hold(1000, 16, (t) => ({ temperatureLeft: [Number.NaN, -40, 1e6, Number.POSITIVE_INFINITY][Math.floor(t / 250)], temperatureRight: 25 + Math.sin(t / 50) }), "out-of-range temperatures");
    hold(1000, () => Math.floor(random() * 50 * 4) / 4, () => ({ temperatureLeft: random() * 40, temperatureRight: random() < 0.2 ? Number.NaN : random() * 40 }), "random temperatures");
    for (const dt of [-1, Number.NaN, 1000.5, Number.POSITIVE_INFINITY]) add(dt, {}, "an invalid tick");
    hold(5000, 16, () => ({}), "rest at the end of a cycle");
    if (eyes) sight(eyes, cycle, random, add, hold);
  }
  return ticks;
}

type Add = (dt: number, senses: Partial<BrainSenses>, what: string) => void;
type Hold = (ms: number, dt: number | (() => number), senses: (elapsed: number) => Partial<BrainSenses>, what: string) => void;

/** Luminances the light arrays can hold that are no ordinary luminance, and the edges of the ordinary ones. */
const ODD_LUMINANCES = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 7, 2, -0, 0, 1, 1e-40, 1.4e-45, 1 - 2 ** -24, 1 + 2 ** -23, 0.5, -1e-30];

/**
 * The eyes' part of a cycle: a steady scene and a steady checkerboard, every
 * stimulus of stimuli.ts's battery (looms, receding, dimming and brightening,
 * bars, dots, gratings, flicker) from its steady ground, light switched off
 * and on mid-stimulus, light with the other senses and with all of them at
 * once, odd luminances (NaN, infinite, negative, above 1, subnormal) and
 * random ones, light over long, short and empty ticks, a steady scene held
 * for seconds and then changed, and light that doesn't fit the eyes (an eye's
 * array too short, too long or empty, an eye left out, both left out), which
 * both must refuse with the same message and nothing changed.
 */
function sight(eyes: EyeMap, cycle: number, random: () => number, add: Add, hold: Hold) {
  const angles = facetAngles(eyes);
  const sizes = { left: eyes.left.directions.length / 3, right: eyes.right.directions.length / 3 };
  const frame = (scene: Scene, t: number) => {
    const light = { left: new Float32Array(sizes.left), right: new Float32Array(sizes.right) };
    render(scene, t, angles, light);
    return light;
  };
  const uniform = (level: number) => frame(() => level, 0);
  const grey = uniform(0.5);
  const tick = cycle % 2 === 0 ? 16 : 33;
  const scene = (name: string) => BATTERY.find((s) => s.name === name)!;
  const show = (s: { scene: Scene }, ms: number, dt: number | (() => number), what: string, others: (t: number) => Partial<BrainSenses> = () => ({})) =>
    hold(ms, dt, (t) => ({ ...others(t), light: frame(s.scene, t / 1000) }), what);

  hold(2000, tick, () => ({ light: grey }), "a steady grey scene");
  show(scene("static checkerboard"), 3000, tick, "a steady checkerboard appears");
  for (const stimulus of BATTERY) {
    const ground = uniform(stimulus.ground);
    hold(300, tick, () => ({ light: ground }), `the ground of ${stimulus.name}`);
    show(stimulus, Math.min(1200, stimulus.seconds * 1000), tick, stimulus.name);
  }

  const loom = scene("loom right");
  let k = 0;
  hold(1200, 16, (t) => (k++ % 10 < 5 ? { light: frame(loom.scene, t / 1000) } : {}), "a loom, the eyes opening and shutting every 5 ticks");
  show(scene("grating, clockwise"), 400, 16, "a grating, the eyes open again");
  hold(300, 16, () => ({}), "the eyes shut mid-grating");
  show(scene("grating, anticlockwise"), 600, 16, "the eyes open on a grating");

  const everything = { loomLeft: 1, loomRight: 1, touch: 1, bumpLeft: 1, bumpRight: 1, wind: 1, sweet: 1 };
  show(scene("grating, clockwise"), 1500, 16, "a grating with every other sense at full strength", () => everything);
  show(loom, 1000, 1000 / 60, "a loom while held and dragged", () => ({ touch: 0.4, wind: 0.5, grounded: false }));
  show(scene("flicker"), 1000, 16, "flicker while sweet", () => ({ sweet: 1 }));
  show(loom, 1000, 16, "a loom while asleep, the eyes at a sleepy gain", () => ({ clockSleep: 1, sleepPressure: 0.6, sleepDepth: 1 }));
  show(scene("light loom right"), 1000, 16, "a light disc looming while asleep, L1's withdrawals at the sleepy gain", () => ({ clockSleep: 1, sleepPressure: 0.6, sleepDepth: 1 }));
  hold(600, 16, (t) => ({ light: grey, clockSleep: t / 600, sleepPressure: 0.2 }), "a steady scene as sleepiness rises, the gain alone changing");
  show(scene("grating, clockwise"), 600, 16, "a grating waking up", (t) => ({ clockSleep: 1 - t / 600 }));
  show(scene("bar right, front to back"), 1000, 16, "a bar with random senses", () =>
    Object.fromEntries(["loomLeft", "touch", "bumpRight", "wind"].map((s) => [s, random() < 0.5 ? random() : 0])),
  );

  const odd = () => {
    const light = { left: new Float32Array(sizes.left), right: new Float32Array(sizes.right) };
    for (const each of [light.left, light.right]) for (let f = 0; f < each.length; f++) each[f] = ODD_LUMINANCES[Math.floor(random() * ODD_LUMINANCES.length)];
    return light;
  };
  hold(500, 16, () => ({ light: odd() }), "odd luminances");
  for (const level of ODD_LUMINANCES) add(16, { light: uniform(level) }, `every facet ${level}`);
  hold(300, 16, () => {
    const light = { left: new Float32Array(sizes.left), right: new Float32Array(sizes.right) };
    for (const each of [light.left, light.right]) for (let f = 0; f < each.length; f++) each[f] = random();
    return { light };
  }, "random luminances");
  hold(500, 16, () => ({ light: odd(), wind: 7, touch: -1, sweet: Number.NaN }), "odd luminances and out-of-range senses");

  for (const dt of [1000, 1000]) add(dt, { light: frame(loom.scene, 0.5) }, "the longest ticks with light");
  for (let n = 0; n < 5; n++) add(100, { light: frame(scene("grating right, upward").scene, n / 10) }, "100 ms ticks with light");
  for (let n = 0; n < 4; n++) add(0, { light: frame(scene("flicker").scene, n / 8) }, "empty ticks with light");
  for (let n = 0; n < 12; n++) add(0.25, { light: frame(scene("flicker").scene, n / 8) }, "0.25 ms ticks with light");
  for (let n = 0; n < 20; n++) add(7.3, { light: frame(scene("dot right, upward").scene, n * 0.0073) }, "7.3 ms ticks with light");

  const bright = uniform(0.8);
  for (let n = 0; n < 3; n++) add(1000, { light: bright }, "a steady scene for seconds");
  hold(200, 16, () => ({ light: frame(scene("dim").scene, 0) }), "then dimmed");
  hold(400, 16, () => ({ light: bright }), "and bright again");

  const lit = (t: number) => frame(scene("grating right, front to back").scene, t);
  const wrong: [string, () => unknown][] = [
    ["the left eye's light a facet short", () => ({ left: new Float32Array(Math.max(0, sizes.left - 1)), right: lit(0).right })],
    ["the right eye's light a facet long", () => ({ left: lit(0).left, right: new Float32Array(sizes.right + 1) })],
    ["the left eye's light empty", () => ({ left: new Float32Array(0), right: lit(0).right })],
    ["the left eye left out", () => ({ right: lit(0).right })],
    ["the right eye left out", () => ({ left: lit(0).left })],
    ["both eyes left out", () => ({})],
  ];
  for (const [what, light] of wrong) {
    hold(100, 16, (t) => ({ light: lit(t / 1000) }), "a grating");
    add(16, { light: light() as BrainSenses["light"] }, what);
  }
  add(Number.NaN, { light: { left: new Float32Array(1), right: new Float32Array(1) } }, "an invalid tick with light that doesn't fit");
  hold(300, 16, () => ({}), "the eyes shut at the end");
}

/** The harness's input for these ticks, and the light frames it refers to (see tools/harness.cpp). */
export function script(ticks: readonly Tick[]): { input: string; frames: Uint8Array } {
  const index = new Map<ArrayLike<number>, number>();
  const chunks: Uint8Array[] = [];
  const ref = (frame: ArrayLike<number> | undefined) => {
    if (frame === undefined) return "x";
    let k = index.get(frame);
    if (k === undefined) {
      if (!(frame instanceof Float32Array)) throw new Error("light for the harness must be Float32Arrays");
      k = index.size;
      index.set(frame, k);
      const count = new Uint8Array(4);
      new DataView(count.buffer).setUint32(0, frame.length, true);
      chunks.push(count, new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength));
    }
    return String(k);
  };
  const lines = ticks.map(({ dt, senses }) => {
    const light = senses.light ? `${ref(senses.light.left)},${ref(senses.light.right)}` : "-";
    return [
      hex64(dt),
      ...SCALAR.map((s: Scalar) => hex32(senses[s])),
      senses.grounded ? 1 : 0,
      ...STATE.map((s) => hex32(senses[s] ?? 0)),
      light,
      hex32(senses.hunger ?? 1),
      hex32(senses.thirst ?? 1),
      ...TEMPERATURE.map((s) => hex32(senses[s] ?? Number.NaN)),
    ].join(" ");
  });
  const frames = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    frames.set(c, at);
    at += c.length;
  }
  return { input: lines.join("\n") + "\n", frames };
}

/** The harness's file of columns. */
export function columnsFile(columns: Columns): string {
  return (["left", "right"] as const).flatMap((side) => columns[side].map((row) => `${side} ${row.join(" ")}\n`)).join("");
}

/** The eye map of a connectome, as the brain builds it; null without eyes, or when the columns don't fit it. */
export function eyeMap(data: ArrayBuffer, columns?: Columns): EyeMap | null {
  try {
    return buildEyes(loadConnectome(data), columns)?.map ?? null;
  } catch {
    return null;
  }
}

/** FNV-1a over the bits of both retinas' rates, then their withdrawals, as doubles (tools/harness.cpp has the same). */
function retinaDigest(brain: FlyBrain): string {
  if (!brain.vision) return "-";
  const bits = new DataView(new ArrayBuffer(8));
  let h = 2166136261;
  for (const side of ["left", "right"] as const) {
    for (const list of [brain.vision.retina[side].rates, brain.vision.retina[side].withdrawals]) {
      for (const x of list) {
        bits.setFloat64(0, x, true);
        h = Math.imul(h ^ bits.getUint32(0, true), 16777619) >>> 0;
        h = Math.imul(h ^ bits.getUint32(4, true), 16777619) >>> 0;
      }
    }
  }
  return h.toString(16).padStart(8, "0");
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
export function typescript(data: ArrayBuffer, seed: number, ticks: readonly Tick[], columns?: Columns): string[] {
  let brain: FlyBrain;
  try {
    // createBrain makes a FlyBrain; the comparison reads its internal state too. Only FlyBrain takes other columns.
    brain = columns ? new FlyBrain(loadConnectome(data), { seed, eyeColumns: columns }) : (createBrain(data, { seed }) as FlyBrain);
  } catch (error) {
    return [`error ${(error as Error).message}`];
  }
  const names = Object.keys(brain.rates);
  const lines = [`ready ${brain.neurons} ${brain.connections} ${names.join("|")}`];
  let tick = 0;
  for (const { dt, senses } of ticks) {
    try {
      const { command, stats } = brain.tick(dt, senses);
      const c = [command.walk, command.turn, command.back, command.escape, command.wings, command.groom, command.feed, command.sing];
      const rates = names.map((name) => stats.rates[name]);
      lines.push(
        [
          `${stats.spikes} ${stats.active} ${hex64(stats.simMs)}`,
          c.map(hex64).join(" "),
          rates.map(hex64).join(" "),
          c.map(hex32).join(" "),
          rates.map(hex32).join(" "),
          [brain.state.arousal.value, brain.state.scene.left.value, brain.state.scene.right.value, brain.state.sleep].map(hex64).join(" "),
          [brain.thermoreceptors.adapted.left, brain.thermoreceptors.adapted.right].map((t) => (Number.isNaN(t) ? "nan" : hex64(t))).join(" "),
          retinaDigest(brain),
          tick++ % 50 === 49 ? digest(brain.sim) : "-",
        ].join(" | "),
      );
    } catch (error) {
      lines.push(`error ${(error as Error).message}`);
    }
  }
  return lines;
}

/** The same from the C++ brain, the native build or the WebAssembly one (`build()`'s directory, or WASM). */
export function native(dir: string, path: string, seed: number, ticks: readonly Tick[], columns?: Columns): string[] {
  const { input, frames } = script(ticks);
  const temp = mkdtempSync(join(tmpdir(), "fly-brain-native-"));
  try {
    const args = ["brain", path, String(seed), "--light", join(temp, "frames")];
    writeFileSync(join(temp, "frames"), frames);
    if (columns) {
      writeFileSync(join(temp, "columns"), columnsFile(columns));
      args.push("--columns", join(temp, "columns"));
    }
    return harness(dir, args, input);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

/** The first line where the two differ, described, or null when every line is the same. */
export function firstDifference(expected: readonly string[], actual: readonly string[], ticks: readonly Tick[]): string | null {
  const n = Math.max(expected.length, actual.length);
  for (let k = 0; k < n; k++) {
    if (expected[k] === actual[k]) continue;
    const tick = k === 0 ? "construction" : `tick ${k - 1} (${ticks[k - 1]?.what}, dt ${ticks[k - 1]?.dt})`;
    return `first difference at ${tick}:\n  typescript ${expected[k]}\n  C++        ${actual[k]}`;
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
