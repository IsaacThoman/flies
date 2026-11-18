// The native brain built as WebAssembly (fly-brain.wasm, made by ../wasm.sh),
// behind the same `Brain` as packages/brain's createBrain, for a browser's
// brain worker: the same simulation as the C++ the Apple TV runs, bit for
// bit, at two to four times the TypeScript's speed.
//
// One module instance holds one brain. The connectome is written straight
// into the module's memory (`connectomeSpace`, which wire.ts decodes into),
// the brain is built from it there, and the space is freed: no second copy of
// it is ever made in JavaScript. The module's own imports are the few WASI
// calls wasi-libc makes (the clock, an empty environment, writes to stderr
// that only an abort makes); nothing else.

import { ODORANTS, TOUCH_SENSES } from "@fly/brain";
import type { Brain, BrainSenses, BrainState, EyeMap } from "@fly/brain";

type Exports = {
  memory: WebAssembly.Memory;
  _initialize(): void;
  malloc(size: number): number;
  free(pointer: number): void;
  fly_brain_create(data: number, length: number, seed: number, error: number, errorSize: number): number;
  fly_brain_neurons(brain: number): number;
  fly_brain_connections(brain: number): number;
  fly_brain_facets(brain: number, side: number): number;
  fly_brain_eye_directions(brain: number, side: number): number;
  fly_brain_eye_acceptance(brain: number): number;
  fly_brain_rate_count(brain: number): number;
  fly_brain_rate_name(brain: number, index: number): number;
  fly_brain_tick(brain: number, dtMs: number, senses: number, command: number, stats: number, rates: number, error: number, errorSize: number): number;
  fly_brain_memory(brain: number, out: number, capacity: number): number;
  fly_brain_remember(brain: number, data: number, length: number, error: number, errorSize: number): number;
};

/** The longest tick the brain takes, ms (runtime.ts's MAX_TICK_MS). */
const MAX_TICK_MS = 1000;
const ERROR_BYTES = 512;
// fly_brain.h's structs as wasm32 lays them out: fly_senses is seven floats, an int, two pointers, three floats (maleTaste,
// hunger, wingbeat), five floats of internal state, three more (bitter, water, thirst), two of temperature and the twelve
// touch parts, then each odorant at the left antenna and the right; fly_command eight floats; fly_stats two doubles and two uint32s.
const SENSES_BYTES = 180;
const COMMAND_BYTES = 32;
const STATS_BYTES = 24;
const SCALARS = ["loomLeft", "loomRight", "touch", "bumpLeft", "bumpRight", "wind", "sweet"] as const;
/** fly_senses's clock and sleep, after wingbeat. */
const STATE = ["clockMorning", "clockEvening", "clockSleep", "sleepPressure", "sleepDepth"] as const;
const STATE_AT = 52;
const BITTER_AT = 72;
/** fly_senses's temperatures, after thirst. */
const TEMPERATURE_AT = 84;
/** fly_senses's touch parts, after the temperatures, in TOUCH_SENSES's order. */
const TOUCH_AT = 92;
const ODOR_AT = TOUCH_AT + 4 * TOUCH_SENSES.length;

const utf8 = new TextDecoder();

/** Whether this JavaScript can run the module: WebAssembly with its standard exceptions (exnref). */
export function wasmBrainSupported(): boolean {
  try {
    // A function holding a try_table that catches all, the least of what the module needs.
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 10, 1, 8, 0, 31, 64, 1, 2, 0, 11, 11]));
  } catch {
    return false;
  }
}

/** A module instance, ready for one brain. */
export class WasmBrainModule {
  readonly #exports: Exports;
  #space = 0;
  #spaceBytes = 0;

  private constructor(instance: WebAssembly.Instance) {
    this.#exports = instance.exports as unknown as Exports;
    this.#exports._initialize();
  }

  /** Compiles and starts the module from its bytes (or an already compiled module). */
  static async instantiate(module: BufferSource | WebAssembly.Module): Promise<WasmBrainModule> {
    const compiled = module instanceof WebAssembly.Module ? module : await WebAssembly.compile(module);
    let memory: WebAssembly.Memory | null = null;
    const instance = await WebAssembly.instantiate(compiled, { wasi_snapshot_preview1: wasi(() => memory!) });
    memory = (instance.exports as unknown as Exports).memory;
    return new WasmBrainModule(instance);
  }

  /**
   * Room in the module's memory for a connectome of this many bytes, for the
   * caller to fill before `create` (the view is good until then: nothing
   * else runs in the module meanwhile).
   */
  connectomeSpace(bytes: number): Uint8Array<ArrayBuffer> {
    const e = this.#exports;
    if (this.#space) e.free(this.#space);
    this.#space = e.malloc(Math.max(1, bytes));
    if (!this.#space) throw new Error("Out of memory: there isn't room here for the fly's brain");
    this.#spaceBytes = bytes;
    return new Uint8Array(e.memory.buffer as ArrayBuffer, this.#space, bytes);
  }

  /** Builds the brain from the connectome written into `connectomeSpace`, which is then freed. */
  create(seed = 1): Brain {
    if (!Number.isInteger(seed)) throw new Error(`The seed must be a whole number, not ${seed}`);
    const e = this.#exports;
    const error = e.malloc(ERROR_BYTES);
    if (!error) throw new Error("Out of memory");
    try {
      // A JavaScript seed is its 32 bits, as sim.ts takes `seed | 0`.
      const brain = e.fly_brain_create(this.#space, this.#spaceBytes, seed >>> 0, error, ERROR_BYTES);
      if (!brain) throw new Error(readString(e.memory, error) || "The fly's brain couldn't be built");
      return new WasmBrain(e, brain);
    } finally {
      if (this.#space) e.free(this.#space);
      this.#space = 0;
      this.#spaceBytes = 0;
      e.free(error);
    }
  }

  /** The module's memory now, bytes: what the brain takes, with the space the connectome was built from. */
  get memoryBytes(): number {
    return this.#exports.memory.buffer.byteLength;
  }
}

class WasmBrain implements Brain {
  readonly neurons: number;
  readonly connections: number;
  readonly eyes: EyeMap | null;
  readonly #e: Exports;
  readonly #brain: number;
  readonly #names: string[] = [];
  readonly #facets: [number, number];
  // One block for everything a tick passes: the senses, both eyes' light, the command, the stats, the rates, the error.
  readonly #senses: number;
  readonly #light: [number, number];
  readonly #command: number;
  readonly #stats: number;
  readonly #rates: number;
  readonly #error: number;
  #buffer: ArrayBuffer | null = null;
  #f32 = new Float32Array(0);
  #view = new DataView(new ArrayBuffer(0));

  constructor(e: Exports, brain: number) {
    this.#e = e;
    this.#brain = brain;
    this.neurons = e.fly_brain_neurons(brain);
    this.connections = e.fly_brain_connections(brain);
    const count = e.fly_brain_rate_count(brain);
    for (let r = 0; r < count; r++) this.#names.push(readString(e.memory, e.fly_brain_rate_name(brain, r)));
    this.#facets = [e.fly_brain_facets(brain, 0), e.fly_brain_facets(brain, 1)];
    const [left, right] = this.#facets;
    this.eyes =
      left > 0 && right > 0
        ? { left: { directions: this.#directions(0, left) }, right: { directions: this.#directions(1, right) }, acceptance: e.fly_brain_eye_acceptance(brain) }
        : null;
    const sizes = [SENSES_BYTES, COMMAND_BYTES, STATS_BYTES, ERROR_BYTES, 4 * left, 4 * right, 4 * count].map((n) => (n + 7) & ~7);
    const block = e.malloc(sizes.reduce((a, b) => a + b, 0));
    if (!block) throw new Error("Out of memory");
    const at: number[] = [];
    sizes.reduce((offset, size) => (at.push(offset), offset + size), block);
    [this.#senses, this.#command, this.#stats, this.#error] = at;
    this.#light = [at[4], at[5]];
    this.#rates = at[6];
  }

  tick(dtMs: number, senses: BrainSenses): BrainState {
    const e = this.#e;
    this.#views();
    const f32 = this.#f32;
    const view = this.#view;
    const s = this.#senses;
    for (let i = 0; i < SCALARS.length; i++) f32[(s >> 2) + i] = senses[SCALARS[i]];
    view.setInt32(s + 28, senses.grounded ? 1 : 0, true);
    for (let i = 0; i < STATE.length; i++) f32[((s + STATE_AT) >> 2) + i] = senses[STATE[i]] ?? 0;
    let left = 0;
    let right = 0;
    // As runtime.ts: a tick of the wrong length is refused before the light is looked at (the C side says so), and
    // light that doesn't fit the eyes before anything moves. The C interface reads a facet's worth from each eye.
    if (senses.light && this.eyes && dtMs >= 0 && dtMs <= MAX_TICK_MS) {
      for (const [k, side] of (["left", "right"] as const).entries()) {
        const facets = this.#facets[k];
        const light = senses.light[side];
        if (light?.length !== facets) throw new Error(`The ${side} eye has ${facets} facets, but the light gives ${light?.length}`);
        f32.set(light, this.#light[k] >> 2);
      }
      [left, right] = this.#light;
    }
    view.setUint32(s + 32, left, true);
    view.setUint32(s + 36, right, true);
    view.setFloat32(s + 40, senses.maleTaste, true);
    // Left out, hunger is 1: the brain as it was before it had one.
    view.setFloat32(s + 44, senses.hunger ?? 1, true);
    view.setFloat32(s + 48, senses.wingbeat, true);
    view.setFloat32(s + BITTER_AT, senses.bitter, true);
    view.setFloat32(s + BITTER_AT + 4, senses.water, true);
    // Left out, thirst is 1: the brain as it was before it had one.
    view.setFloat32(s + BITTER_AT + 8, senses.thirst ?? 1, true);
    // Left out, or not a number, NaN: no temperature felt.
    view.setFloat32(s + TEMPERATURE_AT, senses.temperatureLeft ?? Number.NaN, true);
    view.setFloat32(s + TEMPERATURE_AT + 4, senses.temperatureRight ?? Number.NaN, true);
    for (let k = 0; k < TOUCH_SENSES.length; k++) view.setFloat32(s + TOUCH_AT + 4 * k, senses[TOUCH_SENSES[k]] ?? 0, true);
    for (let k = 0; k < ODORANTS.length; k++) {
      view.setFloat32(s + ODOR_AT + 4 * k, senses.odor?.left?.[k] ?? 0, true);
      view.setFloat32(s + ODOR_AT + 4 * (ODORANTS.length + k), senses.odor?.right?.[k] ?? 0, true);
    }
    const failed = e.fly_brain_tick(this.#brain, dtMs, s, this.#command, this.#stats, this.#rates, this.#error, ERROR_BYTES);
    // The tick may have grown the memory, which leaves the old views empty.
    this.#views();
    if (failed) throw new Error(readString(e.memory, this.#error));
    const c = this.#command >> 2;
    const out = this.#f32;
    const rates: Record<string, number> = {};
    for (let r = 0; r < this.#names.length; r++) rates[this.#names[r]] = out[(this.#rates >> 2) + r];
    return {
      command: { walk: out[c], turn: out[c + 1], back: out[c + 2], escape: out[c + 3], wings: out[c + 4], groom: out[c + 5], feed: out[c + 6], sing: out[c + 7] },
      stats: {
        simMs: this.#view.getFloat64(this.#stats, true),
        wallMs: this.#view.getFloat64(this.#stats + 8, true),
        spikes: this.#view.getUint32(this.#stats + 16, true),
        active: this.#view.getUint32(this.#stats + 20, true),
        rates,
      },
    };
  }

  memory(): Uint8Array {
    const e = this.#e;
    const length = e.fly_brain_memory(this.#brain, 0, 0);
    const out = length > 0 ? e.malloc(length) : 0;
    if (!out) throw new Error("Out of memory");
    try {
      if (e.fly_brain_memory(this.#brain, out, length) !== length) throw new Error("Out of memory");
      return new Uint8Array(e.memory.buffer, out, length).slice();
    } finally {
      e.free(out);
    }
  }

  remember(memory: Uint8Array): void {
    if (!(memory instanceof Uint8Array)) throw new Error("This isn't a fly's memory");
    const e = this.#e;
    const data = e.malloc(Math.max(1, memory.byteLength));
    if (!data) throw new Error("Out of memory");
    try {
      new Uint8Array(e.memory.buffer, data, memory.byteLength).set(memory);
      const failed = e.fly_brain_remember(this.#brain, data, memory.byteLength, this.#error, ERROR_BYTES);
      if (failed) throw new Error(readString(e.memory, this.#error));
    } finally {
      e.free(data);
    }
  }

  #directions(side: number, facets: number): Float32Array {
    const at = this.#e.fly_brain_eye_directions(this.#brain, side);
    return new Float32Array(this.#e.memory.buffer, at, facets * 3).slice();
  }

  #views() {
    const buffer = this.#e.memory.buffer as ArrayBuffer;
    if (buffer === this.#buffer) return;
    this.#buffer = buffer;
    this.#f32 = new Float32Array(buffer);
    this.#view = new DataView(buffer);
  }
}

function readString(memory: WebAssembly.Memory, at: number): string {
  if (!at) return "";
  const bytes = new Uint8Array(memory.buffer);
  let end = at;
  while (end < bytes.length && bytes[end] !== 0) end++;
  return utf8.decode(bytes.subarray(at, end));
}

/** The WASI calls wasi-libc makes in this module, and no more. */
function wasi(memory: () => WebAssembly.Memory) {
  const BADF = 8;
  return {
    clock_time_get(_id: number, _precision: bigint, at: number) {
      const ns = performance.now() * 1e6;
      const view = new DataView(memory().buffer);
      view.setUint32(at, ns % 2 ** 32, true);
      view.setUint32(at + 4, Math.floor(ns / 2 ** 32), true);
      return 0;
    },
    environ_sizes_get(count: number, size: number) {
      const view = new DataView(memory().buffer);
      view.setUint32(count, 0, true);
      view.setUint32(size, 0, true);
      return 0;
    },
    environ_get: () => 0,
    // Only libc++'s last words before an abort are written, to stderr.
    fd_write(fd: number, iovs: number, count: number, written: number) {
      const view = new DataView(memory().buffer);
      let text = "";
      let total = 0;
      for (let i = 0; i < count; i++) {
        const at = view.getUint32(iovs + 8 * i, true);
        const length = view.getUint32(iovs + 8 * i + 4, true);
        text += utf8.decode(new Uint8Array(memory().buffer, at, length));
        total += length;
      }
      if (fd === 2 && text.trim()) console.error(`fly-brain.wasm: ${text.trim()}`);
      view.setUint32(written, total, true);
      return 0;
    },
    fd_close: () => BADF,
    fd_seek: () => BADF,
    proc_exit(code: number) {
      throw new Error(`The fly's brain stopped (exit ${code})`);
    },
  };
}
