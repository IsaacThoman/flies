// A fly that is the traced fly's mirror image. The connectome is one male's,
// and its spontaneous turns lean left (packages/brain/README.md, Symmetry);
// a real fly's lasting turning bias is its own, but a population's has none.
// A mirrored body is as true a rendering of the traced animal as the
// unmirrored one, so half the flies are mirrored (fly-record.ts,
// mirroredFly): the same brain, wired as it was, behind a mirror at the
// boundary with the body. What the body feels on its left goes to the
// brain's right, and what the brain does on its right comes back as the
// body's left: turns, and everything read out by side for display (the
// steering neurons, the regions, the vision stages).
//
// The eyes are exchanged whole, each with its facets' directions reflected:
// the body's left eye is the brain's right, looking where the right looks,
// reflected. The two eyes' facets are their optic lobes' columns, and the
// same column looks in exactly mirrored directions in each (README, The
// eyes), but the right has 12 columns the left lacks; exchanged whole, the
// mirrored fly's left eye has them, and nothing is dropped or matched.
//
// Mirroring twice is no mirror, so the mirrored fly given mirrored senses
// does exactly what the traced fly does, reflected (tests/mirror.test.ts).
// One wrapper for every brain this game runs (TypeScript, WebAssembly,
// native): it swaps by index into objects it keeps, allocating nothing as
// the fly lives.

import { REGIONS } from "@fly/brain";
import type { BrainSenses, BrainState, EyeMap } from "@fly/brain";
import { COMMAND_ORDER, SENSE_ORDER } from "@fly/contracts";
import type { BrainDriver } from "@fly/contracts";

/** A side's sense, rate or region named for the other side. */
export function mirrorName(name: string): string {
  for (const [from, to] of SWAPS) if (name.endsWith(from)) return name.slice(0, -from.length) + to;
  return name;
}
const SWAPS = [["Left", "Right"], ["Right", "Left"], [" left", " right"], [" right", " left"], ["-left", "-right"], ["-right", "-left"]] as const;

type Scalar = (typeof SENSE_ORDER)[number];
/** Each scalar sense, and the one it is felt as through the mirror: the other side's, or itself. */
const FELT_AS: readonly Scalar[] = SENSE_ORDER.map((name) => mirrorName(name) as Scalar);

/** Each region, in REGIONS order: where the other side's is, or its own place for one with no side. */
export const REGION_MIRROR = Uint16Array.from(REGIONS, (region) => {
  const other = REGIONS.findIndex((r) => r.id === mirrorName(region.id));
  return other < 0 ? REGIONS.indexOf(region) : other;
});

/** The other side's: `into` given `from`'s senses, left for right. Reuses `into`'s light and odour; returns it. */
export function mirrorSenses(from: BrainSenses, into: BrainSenses): BrainSenses {
  const out = into as Record<Scalar, number | boolean | undefined>;
  const source = from as Record<Scalar, number | boolean | undefined>;
  for (let i = 0; i < SENSE_ORDER.length; i++) {
    const value = source[SENSE_ORDER[i]];
    if (value !== undefined) out[FELT_AS[i]] = value;
    else if (FELT_AS[i] in out) delete out[FELT_AS[i]];
  }
  if (from.light) {
    const light = (into.light ??= { left: from.light.right, right: from.light.left });
    light.left = from.light.right;
    light.right = from.light.left;
  } else delete into.light;
  if (from.odor) {
    const odor = (into.odor ??= { left: from.odor.right, right: from.odor.left });
    odor.left = from.odor.right;
    odor.right = from.odor.left;
  } else delete into.odor;
  return into;
}

/** The eyes reflected: each the other's, looking where the other looks, mirrored (x is toward the fly's right). */
export function mirrorEyes(eyes: EyeMap): EyeMap {
  const reflect = (directions: Float32Array) => {
    const out = directions.slice();
    for (let i = 0; i < out.length; i += 3) out[i] = -out[i];
    return out;
  };
  return { left: { directions: reflect(eyes.right.directions) }, right: { directions: reflect(eyes.left.directions) }, acceptance: eyes.acceptance };
}

/** A brain behind the mirror: the fly it drives is the traced fly's mirror image. */
export class MirroredBrain implements BrainDriver {
  /** The brain itself, unmirrored. */
  readonly inner: BrainDriver;
  readonly #regions = new Float32Array(REGIONS.length);
  readonly #senses: BrainSenses = { loomLeft: 0, loomRight: 0, touch: 0, bumpLeft: 0, bumpRight: 0, wind: 0, sweet: 0, grounded: true, maleTaste: 0, wingbeat: 0, bitter: 0, water: 0 };
  readonly #state: BrainState;
  // Which of the inner brain's states #state is of. A native brain answers into the same objects, so its states are told apart by when they came.
  #of: BrainState | null = null;
  #ofAt = Number.NaN;
  // The rates and the regions, which only the followed fly's display reads, are mirrored when read: a companion's never are.
  #rates: Record<string, number> = {};
  #ratesStale = true;
  #regionsStale = true;
  // The rates' names, and their other side's, from the first state: copied by index from then on.
  #names: string[] | null = null;
  #others: string[] = [];
  #eyes: EyeMap | null = null;
  #eyesOf: EyeMap | null = null;

  constructor(inner: BrainDriver) {
    this.inner = inner;
    const rates = () => this.#mirroredRates();
    this.#state = {
      command: { walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0, lean: 0 },
      stats: {
        simMs: 0,
        wallMs: 0,
        spikes: 0,
        active: 0,
        get rates() {
          return rates();
        },
      },
    };
  }

  /** Each region's rate, the other side's for a region with a side: filled in place when read, as the brain's own are. */
  get regionRates(): Float32Array {
    this.#follow();
    if (this.#regionsStale) {
      this.#regionsStale = false;
      const regions = this.#regions, inner = this.inner.regionRates;
      for (let r = 0; r < regions.length; r++) regions[r] = inner[REGION_MIRROR[r]];
    }
    return this.#regions;
  }

  get status() {
    return this.inner.status;
  }

  get error() {
    return this.inner.error;
  }

  get neurons() {
    return this.inner.neurons;
  }

  get connections() {
    return this.inner.connections;
  }

  get engine() {
    return this.inner.engine;
  }

  get stateAt() {
    return this.inner.stateAt;
  }

  /** The eyes reflected, the same object for as long as the brain's are. */
  get eyes(): EyeMap | null {
    const eyes = this.inner.eyes;
    if (eyes !== this.#eyesOf) {
      this.#eyesOf = eyes;
      this.#eyes = eyes && mirrorEyes(eyes);
    }
    return this.#eyes;
  }

  get state(): BrainState | null {
    this.#follow();
    return this.inner.state && this.#state;
  }

  tick(dtMs: number, senses: BrainSenses): void {
    this.inner.tick(dtMs, mirrorSenses(senses, this.#senses));
    this.#follow();
  }

  exportMemory(): Promise<Uint8Array | null> {
    return this.inner.exportMemory?.() ?? Promise.resolve(null);
  }

  importMemory(memory: Uint8Array): Promise<boolean> {
    return this.inner.importMemory?.(memory) ?? Promise.resolve(false);
  }

  dispose(): void {
    this.inner.dispose();
  }

  // Mirrors the brain's latest command, once for each state: a worker's arrives between frames, a native one's in its tick.
  #follow() {
    const state = this.inner.state;
    if (!state) {
      // A brain tried again may report other rates.
      this.#names = null;
      this.#of = null;
      return;
    }
    if (state === this.#of && this.inner.stateAt === this.#ofAt) return;
    this.#of = state;
    this.#ofAt = this.inner.stateAt;
    this.#ratesStale = true;
    this.#regionsStale = true;
    const { command, stats } = this.#state;
    for (let i = 0; i < COMMAND_ORDER.length; i++) command[COMMAND_ORDER[i]] = state.command[COMMAND_ORDER[i]];
    command.turn = -state.command.turn;
    stats.simMs = state.stats.simMs;
    stats.wallMs = state.stats.wallMs;
    stats.spikes = state.stats.spikes;
    stats.active = state.stats.active;
  }

  #mirroredRates() {
    this.#follow();
    const state = this.inner.state;
    if (!state || !this.#ratesStale) return this.#rates;
    this.#ratesStale = false;
    if (!this.#names) {
      this.#names = Object.keys(state.stats.rates);
      this.#others = this.#names.map(mirrorName);
      this.#rates = {};
    }
    const names = this.#names, others = this.#others, from = state.stats.rates, to = this.#rates;
    for (let i = 0; i < names.length; i++) to[others[i]] = from[names[i]];
    return to;
  }
}

/** The brain for a fly: behind the mirror if the fly is mirrored, as it is otherwise. */
export function handed(brain: BrainDriver, mirrored: boolean): BrainDriver {
  return mirrored ? new MirroredBrain(brain) : brain;
}

/** The brain itself, whether or not it is behind the mirror. */
export function unmirrored(brain: BrainDriver): BrainDriver {
  return brain instanceof MirroredBrain ? brain.inner : brain;
}
