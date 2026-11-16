// When the restaurant's ventilation runs (how it blows is the game's:
// apps/web/src/places/restaurant/live.ts). After a while of quiet it comes
// on for a minute or two, then rests for some minutes. Alone, the device
// keeps this clock; at a shared table the room keeps it (apps/server) and
// says when a run starts, with a seed every device draws its length from
// alike, so every fly there feels the same draught at the same time.

/** Seconds of quiet before it first comes on, seconds a run lasts (at the least and the most), and minutes it rests between runs. */
export const VENTILATION = { first: 40, run: [50, 110], rest: [4, 9] } as const;

export class VentilationClock {
  #quiet = 0;
  #wait: number = VENTILATION.first;
  #left = 0;
  readonly #random: () => number;

  /** `random` draws the rests between runs. */
  constructor(random: () => number) {
    this.#random = random;
  }

  /** Seconds left of the run going (0: off). */
  get left() {
    return this.#left;
  }

  /** Moves it on `dt` seconds; it counts only while nobody is at the remote (`quiet`). Whether a run is due now: `start` it. */
  tick(dt: number, quiet: boolean): boolean {
    this.#quiet = quiet ? this.#quiet + dt : 0;
    if (this.#left > 0) {
      this.#left = Math.max(0, this.#left - dt);
      return false;
    }
    if (this.#quiet <= VENTILATION.first) return false;
    this.#wait -= dt;
    return this.#wait <= 0;
  }

  /** A run starts, as long as `random` says (at a table, the same stream on every device), with a rest after it. Returns its length, s. */
  start(random: () => number): number {
    const [lo, hi] = VENTILATION.run;
    this.#left = lo + (hi - lo) * random();
    const [rest, most] = VENTILATION.rest;
    this.#wait = (rest + (most - rest) * this.#random()) * 60;
    return this.#left;
  }
}
