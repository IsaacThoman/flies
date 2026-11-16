// When the picnic's goings-on happen: each now and then, at random, on its
// own long clock, and never two starting close together, so that over hours
// of watching the table is visited and left alone in turn and never busy.
// The clocks run only while nobody is using the remote. Nothing here looks
// at the fly: they are not timed to it.

export type Happening = "gust" | "gull" | "leaf" | "butterfly" | "ladybird" | "juice" | "boat";
export const HAPPENINGS: readonly Happening[] = ["gust", "gull", "leaf", "butterfly", "ladybird", "juice", "boat"];

/** Minutes between one and the next of each, on average, when the weather and the time of day allow it: about ten things an hour in all, a gust the commonest. */
export const EVERY: Readonly<Record<Happening, number>> = { gust: 15, gull: 45, leaf: 50, butterfly: 40, ladybird: 55, juice: 40, boat: 60 };
/** Seconds that pass, at the least, between one thing starting and the next. */
export const GAP = 45;
/** Seconds of quiet before the first. */
export const FIRST = 50;

export type Random = { next(): number; range(lo: number, hi: number): number };

export class Pace {
  /** Seconds until each is due. */
  readonly #due = {} as Record<Happening, number>;
  #since = GAP;
  #quiet = 0;
  #rnd: Random;
  /** How often gusts come, as a share of their usual (more on a windy day). */
  gustiness = 1;

  constructor(rnd: Random) {
    this.#rnd = rnd;
    for (const h of HAPPENINGS) this.#due[h] = this.#wait(h);
  }

  /** Seconds until it is next due: random, as things that happen at a steady rate are. */
  #wait(h: Happening) {
    const mean = (EVERY[h] * 60) / (h === "gust" ? Math.max(0.2, this.gustiness) : 1);
    return -Math.log(1 - this.#rnd.next() * 0.999) * mean;
  }

  /**
   * Moves the clocks on. Returns what starts now, if anything: the first due
   * that `can` start (the time of day, the weather, whether one is already
   * going). One that can't is put off a little.
   */
  tick(dt: number, quiet: boolean, can: (h: Happening) => boolean): Happening | null {
    this.#since += dt;
    if (!quiet) {
      this.#quiet = 0;
      return null;
    }
    this.#quiet += dt;
    for (const h of HAPPENINGS) this.#due[h] -= dt;
    if (this.#quiet < FIRST || this.#since < GAP) return null;
    for (const h of HAPPENINGS) {
      if (this.#due[h] > 0) continue;
      if (!can(h)) {
        this.#due[h] = this.#rnd.range(30, 120);
        continue;
      }
      this.#due[h] = this.#wait(h);
      this.#since = 0;
      return h;
    }
    return null;
  }
}
