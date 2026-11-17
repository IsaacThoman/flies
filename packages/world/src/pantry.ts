// The food in the world and how much of it is left: the place's own (honey,
// jam, fruit, sugar), which is eaten down and slowly comes back; what the
// player drops; and now and then something new the place puts out to be
// found (a drop of juice, a crumb). Those last two are eaten up and gone.

import type { World } from "./world.ts";
import { TOUCH, createSurface } from "./world.ts";
import { FOUND_TASTES, TASTES } from "./tastes.ts";

/** A patch of food built into a place: it can be eaten down and slowly comes back. */
export type FoodPatch = {
  name: string;
  x: number;
  z: number;
  /** The height it lies at, where there is more than one surface over (x, z) (a table, the floor under it): the surface there at or below this. Left out, the highest. */
  y?: number;
  /** How far from (x, z) it tastes, mm. */
  r: number;
  /** 0 to 1. */
  sweet: number;
  /** Plain water, 0 to 1: what the water-sensing taste neurons answer (left out, 0). Sugar or salt in it takes that away. */
  water?: number;
  /** Bitter, 0 to 1 (left out, 0). */
  bitter?: number;
  /** A pool of liquid: a fly walking or drinking in it sets rings spreading. */
  pool?: boolean;
};

export type FoodKind = "sugar" | "honey" | "berry" | "water" | "coffee" | "laced";

/**
 * What the player can drop, and how each tastes to a fly (0 to 1), from what
 * it is made of (tastes.ts). Coffee is a drop of espresso, about 10 mM of
 * caffeine, which is `bitter`'s 1; Bitter sugar a lump soaked in it, the
 * coffee's water as sweet as sugar makes it and its caffeine thinned by that.
 */
export const FOODS: Readonly<Record<FoodKind, { name: string; sweet: number; water: number; bitter: number; r: number }>> = {
  sugar: { name: "Sugar", ...TASTES.sugar, r: 0.9 },
  honey: { name: "Honey", ...TASTES.honey, r: 1.6 },
  berry: { name: "Raspberry", ...TASTES.raspberry, r: 1.6 },
  water: { name: "Water", ...TASTES.water, r: 1.5 },
  coffee: { name: "Coffee", ...TASTES.espresso, r: 1.5 },
  laced: { name: "Bitter sugar", ...TASTES.sugaredEspresso, r: 0.9 },
};

export type Food = {
  id: number;
  /** The table's own food is a patch; dropped food has a kind; what the place puts out to be found is "found". */
  kind: FoodKind | "patch" | "found";
  name: string;
  x: number;
  y: number;
  z: number;
  /** It can be tasted within this distance of (x, z), mm. */
  r: number;
  sweet: number;
  water: number;
  bitter: number;
  /** 1 when whole, 0 when eaten up. */
  amount: number;
  /** A pool of liquid (see FoodPatch). */
  pool: boolean;
};

/** A taste sent to the brain: it fades only over the last quarter of a food. */
export const tasteIntensity = (food: Food, taste: "sweet" | "water" | "bitter" = "sweet"): number => food[taste] * Math.min(1, food.amount * 4);

/**
 * How a food the room describes tastes besides sweet, which isn't sent (the wire
 * carries sweet alone): a patch as its place has it, a dropped kind as FOODS
 * has it, anything found as what it is named (FOUND_TASTES).
 */
export function otherTastes(patches: readonly FoodPatch[], id: number, kind: string, name: string): { water: number; bitter: number } {
  if (kind === "patch") {
    const patch = patches[id - 1];
    return patch?.name === name ? { water: patch.water ?? 0, bitter: patch.bitter ?? 0 } : { water: 0, bitter: 0 };
  }
  const spec = kind === "found" ? (Object.hasOwn(FOUND_TASTES, name) ? FOUND_TASTES[name] : null) : Object.hasOwn(FOODS, kind) ? FOODS[kind as FoodKind] : null;
  return { water: spec?.water ?? 0, bitter: spec?.bitter ?? 0 };
}

/** Amount eaten per second at `feed` 1. A dropped food lasts about 6 s with `feed` near 0.5. */
export const EAT_RATE = 0.33;
/** A patch eaten down comes back over about this long, s. */
export const PATCH_RECOVERY = 90;
/** Food is felt within this height of the surface it lies on, mm. */
export const TASTE_HEIGHT = 1.5;
/** At most this much dropped food at once; dropping more replaces the oldest. */
export const MAX_DROPPED = 6;

/** Food the player dropped. */
export const isDropped = (food: Food): food is Food & { kind: FoodKind } => food.kind !== "patch" && food.kind !== "found";

export class Pantry {
  readonly foods: Food[] = [];
  #next = 1;
  #world: World;
  #contact = createSurface();
  #support = createSurface();

  constructor(world: World, patches: readonly FoodPatch[] = []) {
    this.#world = world;
    this.reset(patches);
  }

  /** Clears away everything, dropped food too, and sets out these patches, whole: the fly has been carried somewhere else. */
  reset(patches: readonly FoodPatch[]) {
    this.foods.length = 0;
    for (const p of patches) {
      this.foods.push({ id: this.#next++, kind: "patch", name: p.name, x: p.x, y: this.#world.heightAt(p.x, p.z, p.y), z: p.z, r: p.r, sweet: p.sweet, water: p.water ?? 0, bitter: p.bitter ?? 0, amount: 1, pool: p.pool ?? false });
    }
  }

  /** Drops food at a point on the world's surface: the one at or below `y` (the highest, if left out). Returns it. */
  drop(kind: FoodKind, x: number, z: number, y?: number): Food {
    const dropped = this.foods.filter(isDropped);
    if (dropped.length >= MAX_DROPPED) this.remove(dropped[0]);
    const spec = FOODS[kind];
    const food: Food = { id: this.#next++, kind, name: spec.name, x, y: this.#world.heightAt(x, z, y), z, r: spec.r, sweet: spec.sweet, water: spec.water, bitter: spec.bitter, amount: 1, pool: false };
    this.foods.push(food);
    return food;
  }

  /** Puts out something new to be found at a point on the world's surface, the one at or below `y` (it is the place's, not the player's), tasting as its name says (FOUND_TASTES). Returns it. */
  add(name: string, x: number, z: number, r: number, sweet: number, y?: number): Food {
    const food: Food = { id: this.#next++, kind: "found", name, x, y: this.#world.heightAt(x, z, y), z, r, sweet, ...otherTastes([], 0, "found", name), amount: 1, pool: false };
    this.foods.push(food);
    return food;
  }

  /** Removes the player's offerings, leaving the place's patches and finds alone. True: falling food can go too; a shared pantry waits for its room. */
  clearDropped() {
    for (let i = this.foods.length - 1; i >= 0; i--) if (isDropped(this.foods[i])) this.remove(this.foods[i]);
    return true;
  }

  remove(food: Food) {
    const i = this.foods.indexOf(food);
    if (i >= 0) this.foods.splice(i, 1);
  }

  /**
   * The food tasted at a point within `reach` mm (feet or mouthparts), or
   * null: the one that tastes sweetest there, water included (sweet 0) so a
   * fly standing in it is known to be touching something.
   */
  touching(x: number, y: number, z: number, reach: number): Food | null {
    let best: Food | null = null;
    let contact = false;
    // Indexed: asked several times a frame, and an iterator is an allocation without a JIT.
    for (let i = 0; i < this.foods.length; i++) {
      const food = this.foods[i];
      if (food.amount <= 0) continue;
      const d = food.r + reach;
      const dx = x - food.x;
      const dz = z - food.z;
      if (dx * dx + dz * dz > d * d) continue;
      if (!contact) {
        this.#world.surface(x, z, this.#contact, y);
        if (y < this.#contact.y - TOUCH || y - this.#contact.y > TASTE_HEIGHT + reach || this.#contact.underside <= y + TOUCH) return null;
        contact = true;
      }
      // Follow the food's supporting surface, not its centre's height or a different layer.
      this.#world.surface(food.x, food.z, this.#support, food.y);
      if (this.#support.solid !== this.#contact.solid) continue;
      if (!best || tasteIntensity(food) > tasteIntensity(best)) best = food;
    }
    return best;
  }

  /** Eats from a food for `dt` seconds at this appetite (the brain's `feed`, 0 to 1). Returns how much was eaten. */
  eat(food: Food, appetite: number, dt: number): number {
    const bite = Math.min(food.amount, EAT_RATE * Math.max(0, Math.min(1, appetite)) * Math.max(0, dt));
    food.amount -= bite;
    if (food.amount <= 1e-6 && food.kind !== "patch") this.remove(food);
    return bite;
  }

  /** Patches come back; nothing else changes with time. */
  update(dt: number) {
    for (const food of this.foods) if (food.kind === "patch" && food.amount < 1) food.amount = Math.min(1, food.amount + dt / PATCH_RECOVERY);
  }
}
