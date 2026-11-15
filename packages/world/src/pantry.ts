// The food in the world and how much of it is left: the table's own (honey,
// jam, fruit, sugar), which is eaten down and slowly comes back, and what the
// player drops, which is eaten up and gone.

import type { FoodPatch } from "./picnic.ts";
import type { World } from "./world.ts";

export type FoodKind = "sugar" | "honey" | "berry" | "water";

/** What the player can drop, and how each tastes to a fly (0 to 1). */
export const FOODS: Readonly<Record<FoodKind, { name: string; sweet: number; r: number }>> = {
  sugar: { name: "Sugar", sweet: 1, r: 1.6 },
  honey: { name: "Honey", sweet: 1, r: 2.2 },
  berry: { name: "Raspberry", sweet: 0.8, r: 2.6 },
  water: { name: "Water", sweet: 0, r: 2 },
};

export type Food = {
  id: number;
  /** The table's own food is a patch; dropped food has a kind. */
  kind: FoodKind | "patch";
  name: string;
  x: number;
  y: number;
  z: number;
  /** It can be tasted within this distance of (x, z), mm. */
  r: number;
  sweet: number;
  /** 1 when whole, 0 when eaten up. */
  amount: number;
};

/** Amount eaten per second at `feed` 1. A dropped food lasts about 6 s with `feed` near 0.5, as the berry does in the desktop pet. */
export const EAT_RATE = 0.33;
/** A patch eaten down comes back over about this long, s. */
export const PATCH_RECOVERY = 90;
/** Food is felt within this height of the surface it lies on, mm. */
export const TASTE_HEIGHT = 1.5;
/** At most this much dropped food at once; dropping more replaces the oldest. */
export const MAX_DROPPED = 6;

export class Pantry {
  readonly foods: Food[] = [];
  #next = 1;
  #world: World;

  constructor(world: World, patches: readonly FoodPatch[] = []) {
    this.#world = world;
    for (const p of patches) {
      this.foods.push({ id: this.#next++, kind: "patch", name: p.name, x: p.x, y: world.heightAt(p.x, p.z), z: p.z, r: p.r, sweet: p.sweet, amount: 1 });
    }
  }

  /** Drops food at a point on the world's surface. Returns it. */
  drop(kind: FoodKind, x: number, z: number): Food {
    const dropped = this.foods.filter((f) => f.kind !== "patch");
    if (dropped.length >= MAX_DROPPED) this.remove(dropped[0]);
    const spec = FOODS[kind];
    const food: Food = { id: this.#next++, kind, name: spec.name, x, y: this.#world.heightAt(x, z), z, r: spec.r, sweet: spec.sweet, amount: 1 };
    this.foods.push(food);
    return food;
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
    for (const food of this.foods) {
      if (food.amount <= 0 || Math.abs(y - food.y) > TASTE_HEIGHT + reach) continue;
      const d = food.r + reach;
      const dx = x - food.x;
      const dz = z - food.z;
      if (dx * dx + dz * dz > d * d) continue;
      if (!best || food.sweet * food.amount > best.sweet * best.amount) best = food;
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
