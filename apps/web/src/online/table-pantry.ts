// The pantry at a table with others: the same food the fly tastes and eats
// alone, but the room's (packages/net, FoodMirror and TableFood). What this
// player drops is named by this device, so its fly can eat it before the
// room has heard of it; what the place puts out is named from where it lies,
// so every device that puts it there names it alike; every bite is counted
// for the room; and nothing is cleared away here, since the room says what goes.

import { FOODS, Pantry } from "@fly/world";
import type { Food, FoodKind, World } from "@fly/world";
import type { Falling } from "../tools/hands.ts";
import type { FoodWire } from "@fly/net";
import { DROP_ID, FoodMirror, dropOwner, foundId } from "@fly/net";

export class TablePantry extends Pantry {
  readonly mirror: FoodMirror;
  /** This player at the table: the first part of what it names its food. */
  player = 0;
  /** The room supports nutrition receipts; older rooms retain their original optimistic feeding. */
  confirmed = false;
  /** Food the place put out here, for the room to hear of. */
  /** Requests a clear from the room, which decides what this player owns. */
  onClear: () => void = () => {};
  onFound: (food: Food, lasts?: number) => void = () => {};
  readonly #world: World;
  #dropped = 0;
  /** Names given at the moment of dropping, waiting for the food to land: by kind, oldest first. */
  readonly #named: { kind: FoodKind; id: number; falling?: Falling }[] = [];

  constructor(world: World) {
    super(world, world.place.patches);
    this.#world = world;
    this.mirror = new FoodMirror(world, this);
  }

  /** Names the next food this player drops (as it leaves the hand, so the room can tell everyone while it falls). */
  name(kind: FoodKind, falling?: Falling): number {
    const id = this.#next();
    this.#named.push({ kind, id, falling });
    return id;
  }

  /** Remember retained names even after the room acknowledges their removal. */
  welcome(foods: readonly FoodWire[]) {
    for (const food of foods) {
      if (dropOwner(food[0]) === this.player) this.#dropped = Math.max(this.#dropped, food[0] % DROP_ID);
    }
    this.mirror.welcome(foods);
  }

  #next() {
    let id: number;
    do {
      this.#dropped = (this.#dropped + 1) % DROP_ID;
      id = this.player * DROP_ID + this.#dropped;
    } while (this.foods.some((f) => f.id === id) || this.#named.some((f) => f.id === id));
    return id;
  }

  clearDropped() {
    this.onClear();
    return false;
  }

  /** The room removed an offering before it landed: cancel that exact fall. */
  forgetFood(id: number): Falling | undefined {
    const i = this.#named.findIndex((n) => n.id === id);
    return i < 0 ? undefined : this.#named.splice(i, 1)[0].falling;
  }

  /** It landed, on the surface at or below `y` (the highest, if left out). */
  drop(kind: FoodKind, x: number, z: number, y?: number): Food {
    const i = this.#named.findIndex((n) => n.kind === kind && (!n.falling || (n.falling.x === x && n.falling.z === z && n.falling.floor === y)));
    const id = i >= 0 ? this.#named.splice(i, 1)[0].id : this.#next();
    this.landed(id, kind, x, z, y);
    return this.foods.find((f) => f.id === id) ?? this.foods[this.foods.length - 1];
  }

  /** Food landed, on the surface at or below `y`: this player's, or another's under the name they gave it. */
  landed(id: number, kind: FoodKind, x: number, z: number, y?: number) {
    const spec = FOODS[kind];
    this.mirror.add({ id, kind, name: spec.name, x, y: this.#world.heightAt(x, z, y), z, r: spec.r, sweet: spec.sweet, amount: 1, pool: false });
  }

  add(name: string, x: number, z: number, r: number, sweet: number, y?: number, lasts?: number): Food {
    const id = foundId(name, x, z);
    const known = this.foods.find((f) => f.id === id);
    if (known) return known;
    const food: Food = { id, kind: "found", name, x, y: this.#world.heightAt(x, z, y), z, r, sweet, amount: 1, pool: false };
    this.foods.push(food);
    this.onFound(food, lasts);
    return food;
  }

  eat(food: Food, appetite: number, dt: number): number {
    const bite = super.eat(food, appetite, dt);
    this.mirror.ate(food, bite);
    return this.confirmed ? 0 : bite;
  }
}
