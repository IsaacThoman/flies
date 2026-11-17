// The table's food when several flies share it. The room owns how much of
// each is left: the table's own patches, what players drop, and what the
// place puts out to be found. Each device lets its own fly eat at once (it
// tastes the food going down as it eats), tells the room what it took, and
// takes the room's word for what is left, less what it has eaten since the
// room last heard from it. So two flies at the same sugar eat it down
// together, and between them never eat more than there was.

import { EAT_RATE, FOODS, MAX_DROPPED, PATCH_RECOVERY, TASTE_HEIGHT } from "@fly/world";
import type { Food, FoodKind, FoodPatch, Pantry, World } from "@fly/world";
import type { FoodWire } from "./protocol.ts";
import { FOUND_ID, dropOwner, seqAtOrAfter } from "./protocol.ts";

/** A fly's mouth and feet reach this far past a food's edge, mm, measured from where it stands: its length, and some slack for being seen late. */
export const BITE_REACH = 4;
/** At most this many foods the place put out at once at a table; the oldest goes past it. A place puts out a few at a time. */
export const MAX_FOUND = 16;
/** A player may eat at most this much faster than EAT_RATE allows, to forgive uneven sends; any more is refused. */
const APPETITE_SLACK = 1.5;
/** Seconds of appetite a player may save up. */
const APPETITE_STORE = 1;

export const toWire = (f: Food): FoodWire => [f.id, f.kind, f.name, f.x, f.z, f.r, f.sweet, f.amount, f.pool ? 1 : 0, f.y];

/** A food as the room has it, at the height it lies at (the highest surface there, kept before foods had one). */
export function fromWire(world: World, w: FoodWire): Food {
  const [id, kind, name, x, z, r, sweet, amount, pool, y] = w;
  return { id, kind: kind as Food["kind"], name, x, y: typeof y === "number" && Number.isFinite(y) ? y : world.heightAt(x, z), z, r, sweet, amount, pool: pool === 1 };
}

/** What a bite came to. */
export type Granted = { granted: number; refused: "unknown" | "far" | "greedy" | null };

type Appetite = { stored: number; at: number };

/** The room's food: the one account of what is left. */
export class TableFood {
  readonly foods: Food[] = [];
  /** How much each player has eaten, by id. */
  readonly eaten = new Map<number, number>();
  /** Ids changed or gone since the last `flush`. */
  readonly #changed = new Set<number>();
  readonly #gone: number[] = [];
  #bitten = false;
  readonly #meals = new Map<number, [number, number]>();
  readonly #appetite = new Map<number, Appetite>();
  readonly #world: World;
  /** Bites refused, by reason. */
  readonly refused = { unknown: 0, far: 0, greedy: 0 };

  constructor(world: World, patches: readonly FoodPatch[]) {
    this.#world = world;
    this.reset(patches);
  }

  /** The table has been carried somewhere else: only that place's own food, whole. Who ate how much is kept. */
  reset(patches: readonly FoodPatch[]) {
    for (const f of this.foods) this.#gone.push(f.id);
    this.foods.length = 0;
    this.#changed.clear();
    // Numbered 1 upward, in order: the place's patches are always the same food.
    patches.forEach((p, i) => this.foods.push({ id: i + 1, kind: "patch", name: p.name, x: p.x, y: this.#world.heightAt(p.x, p.z, p.y), z: p.z, r: p.r, sweet: p.sweet, amount: 1, pool: p.pool ?? false }));
  }

  /** The food as it was kept (a restarted room). */
  restore(foods: readonly FoodWire[]) {
    this.foods.length = 0;
    for (const w of foods) this.foods.push(fromWire(this.#world, w));
  }

  find(id: number) {
    return this.foods.find((f) => f.id === id) ?? null;
  }

  /**
   * A player dropped food, onto the surface at or below `y` (the highest, if
   * left out); returns it, or null if it isn't theirs to name or isn't on the
   * table. The oldest dropped goes past MAX_DROPPED.
   */
  drop(by: number, id: number, kind: string, x: number, z: number, y?: number): Food | null {
    if (dropOwner(id) !== by || !Object.hasOwn(FOODS, kind) || this.find(id) || !this.#world.onTable(x, z)) return null;
    const dropped = this.foods.filter((f) => f.kind !== "patch" && f.kind !== "found");
    if (dropped.length >= MAX_DROPPED) this.#remove(dropped[0]);
    const spec = FOODS[kind as FoodKind];
    const food: Food = { id, kind: kind as FoodKind, name: spec.name, x, y: this.#world.heightAt(x, z, y), z, r: spec.r, sweet: spec.sweet, amount: 1, pool: false };
    this.foods.push(food);
    return food;
  }

  /** A player clears only their own offerings; the usual food update tells every device what is gone. */
  clearDropped(by: number) {
    if (!(by > 0)) return;
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const food = this.foods[i];
      if (food.kind !== "patch" && food.kind !== "found" && dropOwner(food.id) === by) this.#remove(food);
    }
  }

  /** Something the place put out, on the surface at or below `y`, as a device saw it; the first to say so names it. The oldest found goes past MAX_FOUND. */
  found(id: number, name: string, x: number, z: number, r: number, sweet: number, y?: number): Food | null {
    if (!(id >= FOUND_ID) || typeof name !== "string" || name.length > 40 || this.find(id) || !this.#world.onTable(x, z) || !(r > 0 && r < 5) || !(sweet >= 0 && sweet <= 1)) return null;
    const found = this.foods.filter((f) => f.kind === "found");
    if (found.length >= MAX_FOUND) this.#remove(found[0]);
    const food: Food = { id, kind: "found", name, x, y: this.#world.heightAt(x, z, y), z, r, sweet, amount: 1, pool: false };
    this.foods.push(food);
    return food;
  }

  /**
   * A player's flies took `amount` of a food at room time `now` (ms),
   * standing where `flies` are. It gets what is there, if one of them could
   * reach it (not from the floor under the table it is on) and they aren't
   * eating faster than so many flies can.
   */
  bite(by: number, id: number, amount: number, flies: readonly { readonly x: number; readonly y: number; readonly z: number }[], now: number): Granted {
    this.#bitten = true;
    const food = this.find(id);
    if (!food) return this.#refuse("unknown");
    // Even a refused bite needs an authoritative amount and an acknowledgement.
    this.#changed.add(id);
    if (!(amount > 0) || flies.length === 0) return this.#refuse("unknown");
    if (!flies.some((f) => Math.hypot(food.x - f.x, food.z - f.z) <= food.r + BITE_REACH && Math.abs(food.y - f.y) <= TASTE_HEIGHT + BITE_REACH)) return this.#refuse("far");
    const rate = EAT_RATE * APPETITE_SLACK * flies.length;
    const appetite = this.#appetite.get(by) ?? { stored: rate * APPETITE_STORE, at: now };
    appetite.stored = Math.min(rate * APPETITE_STORE, appetite.stored + ((now - appetite.at) / 1000) * rate);
    appetite.at = now;
    this.#appetite.set(by, appetite);
    if (amount > appetite.stored + 1e-6) return this.#refuse("greedy");
    appetite.stored -= amount;
    const granted = Math.min(food.amount, amount);
    food.amount -= granted;
    const meal = this.#meals.get(by) ?? [0, 0];
    meal[0] += granted;
    meal[1] += granted * food.sweet;
    this.#meals.set(by, meal);
    this.eaten.set(by, (this.eaten.get(by) ?? 0) + granted);
    if (food.amount <= 1e-6 && food.kind !== "patch") this.#remove(food);
    else this.#changed.add(food.id);
    return { granted, refused: null };
  }

  /** Nutrition granted since this player's last food acknowledgement. */
  takeMeal(by: number): [number, number] {
    const meal = this.#meals.get(by) ?? [0, 0];
    this.#meals.delete(by);
    return meal;
  }

  #refuse(reason: "unknown" | "far" | "greedy"): Granted {
    this.refused[reason]++;
    return { granted: 0, refused: reason };
  }

  #remove(food: Food) {
    const i = this.foods.indexOf(food);
    if (i < 0) return;
    this.foods.splice(i, 1);
    this.#changed.delete(food.id);
    this.#gone.push(food.id);
  }

  /** Patches come back, as on every device. */
  update(dt: number) {
    for (const f of this.foods) {
      if (f.kind !== "patch" || f.amount >= 1) continue;
      f.amount = Math.min(1, f.amount + dt / PATCH_RECOVERY);
      this.#changed.add(f.id);
    }
  }

  /** What changed since the last call, for the room to tell everyone; null if nothing did. */
  flush(): { amounts: [number, number][]; gone: number[] } | null {
    if (!this.#bitten && this.#changed.size === 0 && this.#gone.length === 0) return null;
    this.#bitten = false;
    const amounts: [number, number][] = [];
    for (const id of this.#changed) {
      const f = this.find(id);
      if (f) amounts.push([id, Math.round(f.amount * 1e4) / 1e4]);
    }
    this.#changed.clear();
    const gone = this.#gone.splice(0);
    return { amounts, gone };
  }
}

type Pending = { seq: number; food: number; amount: number };

/**
 * A device's side of it: its pantry is the room's food, less what its own
 * flies have eaten that the room hasn't counted yet.
 */
export class FoodMirror {
  readonly #pantry: Pantry;
  readonly #world: World;
  /** Bites sent and not yet acknowledged. */
  readonly #pending: Pending[] = [];
  /** Bites not yet sent: food id to amount. */
  readonly unsent = new Map<number, number>();
  /** Everything its flies have eaten by its own reckoning, and what the room has granted them. */
  predicted = 0;
  granted = 0;
  /** Food the room has said is gone that this device was still eating. */
  lostBites = 0;

  constructor(world: World, pantry: Pantry) {
    this.#world = world;
    this.#pantry = pantry;
  }

  /** One of its flies ate this much of a food just now (already taken from the pantry). */
  ate(food: Food, amount: number) {
    if (!(amount > 0)) return;
    this.predicted += amount;
    // Keep exhausted predictions until the room can restore a refused bite.
    if (!this.#pantry.foods.includes(food)) this.#pantry.foods.push(food);
    this.unsent.set(food.id, (this.unsent.get(food.id) ?? 0) + amount);
  }

  /** The unsent bites went out as message `seq`. */
  sent(seq: number) {
    for (const [food, amount] of this.unsent) this.#pending.push({ seq, food, amount });
    this.unsent.clear();
  }

  /** The table's food as a newcomer finds it. */
  welcome(foods: readonly FoodWire[]) {
    // Bites the room hasn't counted are lost with the old connection: the room's word is the account.
    this.#pending.length = 0;
    this.unsent.clear();
    const pantry = this.#pantry;
    pantry.foods.length = 0;
    for (const w of foods) pantry.foods.push(fromWire(this.#world, w));
  }

  /** Food someone put down (or this device's own, echoed). */
  add(food: Food) {
    if (this.#pantry.foods.some((f) => f.id === food.id)) return;
    this.#pantry.foods.push(food);
  }

  get pending() {
    return this.#pending.length + this.unsent.size;
  }

  /** The room's account: what is left of what changed, what is gone, and this device's bites it has counted (through `ack`). */
  apply(ack: number, amounts: readonly [number, number][], gone: readonly number[], granted: number | undefined, meal?: readonly [number, number]): [number, number] {
    const pending = this.#pending;
    while (pending.length && seqAtOrAfter(ack, pending[0].seq)) {
      const p = pending.shift()!;
      // Receipt-capable rooms include every processed, surviving food in
      // amounts, even on refusal. An omitted acknowledged ID no longer exists.
      if (meal && !amounts.some(([id]) => id === p.food)) {
        const i = this.#pantry.foods.findIndex((f) => f.id === p.food);
        if (i >= 0) this.#pantry.foods.splice(i, 1);
      }
    }
    const foods = this.#pantry.foods;
    for (const [id, amount] of amounts) {
      const f = foods.find((x) => x.id === id);
      if (!f) continue;
      let mine = this.unsent.get(id) ?? 0;
      for (const p of pending) if (p.food === id) mine += p.amount;
      f.amount = Math.max(0, amount - mine);
    }
    for (const id of gone) {
      const i = foods.findIndex((x) => x.id === id);
      if (i >= 0) foods.splice(i, 1);
      if (this.unsent.has(id) || pending.some((p) => p.food === id)) this.lostBites++;
    }
    if (granted !== undefined) this.granted = granted;
    return meal ? [meal[0], meal[1]] : [0, 0];
  }
}
