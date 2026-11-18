// The fly's firsts, for its journal: its first flight, first meal of each
// food, first groom, first time it walked onto something new, first escape,
// first sleep, first visit to each place. Each is read from what its life
// actually did (life.ts, as the day's tally counts it), never inferred about
// how it felt, and each happens once in a fly's life.
//
// Watching costs a few comparisons a frame and allocates nothing until a
// first happens.

import type { Activity } from "../life.ts";

export type MomentKind = "flight" | "meal" | "groom" | "climb" | "escape" | "sleep" | "place";

export type Moment = {
  kind: MomentKind;
  /** Once per key in a fly's life: the kind, and for a meal or a place, of what. */
  key: string;
  /** A word or two for it, where an icon can't say it: the food, the place, what it walked onto. */
  label: string;
};

/** What a first is watched for in: Life, as far as this reads it. */
export type Lived = {
  readonly activity: Activity;
  readonly meals: number;
  readonly takeOffs: number;
  readonly body: { readonly mode: string; readonly surface: { readonly solid: number } };
  readonly world: { readonly solids: readonly { readonly name: string }[] };
  readonly senses: { readonly tasting: { readonly food: { readonly name: string } | null } };
};

/** A flight is wings beating in the air this long (s), not a hop off an edge. */
export const FLIGHT_SECONDS = 1;
/** A groom is this long (s) of it, not a twitch of the legs. */
export const GROOM_SECONDS = 0.5;

/** A meal's key: one first meal for each food, by its name ("sugar" dropped and "sugar" spilt on the table are the same food). */
export const mealKey = (food: string) => `meal:${food.toLowerCase()}`;
export const placeKey = (place: string) => `place:${place}`;

export class Moments {
  /** The keys it has had, from its journal and since. */
  readonly #had: Set<string>;
  #meals = -1;
  #takeOffs = -1;
  #solid = Number.NaN;
  #onFeet = false;
  #flying = 0;
  #grooming = 0;

  constructor(had: Iterable<string> = []) {
    this.#had = new Set(had);
  }

  has(key: string) {
    return this.#had.has(key);
  }

  /** Once a frame, after the fly's life has stepped `dt`: any firsts it has just had, added to `out`. */
  watch(life: Lived, dt: number, out: Moment[]) {
    const { activity, body } = life;
    // Counts from before the watching began aren't firsts seen.
    if (this.#meals < 0) {
      this.#meals = life.meals;
      this.#takeOffs = life.takeOffs;
    }
    if (life.meals > this.#meals) {
      const food = life.senses.tasting.food;
      if (food) this.#first("meal", mealKey(food.name), food.name.toLowerCase(), out);
    }
    this.#meals = life.meals;
    // Every take-off is the brain's escape command, past its threshold (packages/body behavior.ts).
    if (life.takeOffs > this.#takeOffs) this.#first("escape", "escape", "", out);
    this.#takeOffs = life.takeOffs;
    this.#flying = activity === "flying" ? this.#flying + dt : 0;
    if (this.#flying >= FLIGHT_SECONDS) this.#first("flight", "flight", "", out);
    this.#grooming = activity === "grooming" ? this.#grooming + dt : 0;
    if (this.#grooming >= GROOM_SECONDS) this.#first("groom", "groom", "", out);
    if (activity === "sleeping") this.#first("sleep", "sleep", "", out);
    // Walked onto something: on its feet before and after, on another solid now (a landing isn't walking).
    const onFeet = body.mode !== "airborne";
    const solid = body.surface.solid;
    if (onFeet && this.#onFeet && solid >= 0 && solid !== this.#solid && !Number.isNaN(this.#solid)) {
      this.#first("climb", "climb", life.world.solids[solid]?.name ?? "", out);
    }
    this.#onFeet = onFeet;
    this.#solid = onFeet ? solid : Number.NaN;
  }

  /** The fly is somewhere: the first time, a first visit. */
  arrived(place: string, name: string, out: Moment[]) {
    this.#first("place", placeKey(place), name, out);
    // Set down somewhere new isn't walking onto it.
    this.#solid = Number.NaN;
  }

  #first(kind: MomentKind, key: string, label: string, out: Moment[]) {
    if (this.#had.has(key)) return;
    this.#had.add(key);
    out.push({ kind, key, label });
  }
}
