// The fly's day: what it has done since midnight, for the stats in a corner.
// Counted from what really happened, as Life counts it (its legs' steps,
// meals begun, take-offs, time flying and grooming), never estimated. It is
// kept across launches, since on a TV the app comes and goes but the day is
// the fly's, and starts again from nothing on a new day.

import { DAY_COUNTS, freshDay, loadDay, saveDay } from "../settings.ts";
import type { Day } from "../settings.ts";

/** Life's running totals, which only ever count up. */
export type Totals = { readonly [K in (typeof DAY_COUNTS)[number]]: number };

/** Seconds between saves while it changes: an app closed without warning loses no more than this. */
export const SAVE_EVERY = 30;

/** The local day, as YYYY-MM-DD. */
export function dayOf(date: Date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${date.getFullYear()}-${m < 10 ? "0" : ""}${m}-${d < 10 ? "0" : ""}${d}`;
}

export class Tally {
  day: Day;
  readonly #seen: { -readonly [K in keyof Totals]: number } = { walked: 0, meals: 0, takeOffs: 0, flown: 0, groomed: 0 };
  readonly #save: (day: Day) => void;
  /** When the day ends (ms since 1970). */
  #endsAt = 0;
  #unsaved = false;
  #sinceSave = 0;

  /** From today's save, with `life`'s totals so far already counted (or not its to count). `now` is ms since 1970. */
  constructor(life: Totals, now: number, load: (date: string) => Day = loadDay, save: (day: Day) => void = saveDay) {
    this.#save = save;
    this.day = load(this.#begin(now));
    this.#take(life);
  }

  /**
   * Once a frame, after the fly's life has stepped: adds what it did since
   * last time. At midnight it starts a new day.
   */
  update(life: Totals, now: number, dt: number) {
    if (now >= this.#endsAt) {
      this.day = freshDay(this.#begin(now));
      this.#unsaved = true;
    }
    if (this.#seen.walked !== life.walked || this.#seen.meals !== life.meals || this.#seen.takeOffs !== life.takeOffs || this.#seen.flown !== life.flown || this.#seen.groomed !== life.groomed) {
      const day = this.day;
      for (let i = 0; i < DAY_COUNTS.length; i++) {
        const key = DAY_COUNTS[i];
        day[key] += Math.max(0, life[key] - this.#seen[key]);
      }
      this.#take(life);
      this.#unsaved = true;
    }
    this.#sinceSave += dt;
    if (this.#unsaved && this.#sinceSave >= SAVE_EVERY) this.save();
  }

  /** Saves it now, if there is anything new: also as the app goes to sleep. */
  save() {
    this.#sinceSave = 0;
    if (!this.#unsaved) return;
    this.#unsaved = false;
    this.#save(this.day);
  }

  /** The day `now` is in, and when it ends. */
  #begin(now: number) {
    const date = new Date(now);
    this.#endsAt = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
    return dayOf(date);
  }

  #take(life: Totals) {
    for (let i = 0; i < DAY_COUNTS.length; i++) this.#seen[DAY_COUNTS[i]] = life[DAY_COUNTS[i]];
  }
}
