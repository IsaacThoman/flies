// The pantry at a shared table: the same food the fly tastes and eats alone,
// but the room's (packages/net, FoodMirror and TableFood). What this player
// drops is named by this device so the fly can eat it before the room has
// heard of it; what the place puts out is named from where it lies, so
// every device that puts it there names it alike; every bite is counted
// for the room; nothing is cleared away here, since the room says what goes.

import { FOODS, Pantry } from "@fly/world";
import type { Food, FoodKind, FoodPatch, World } from "@fly/world";
import { DROP_ID, FoodMirror, foundId } from "@fly/net";

const LOCAL_PLAYER = 899;

export class TablePantry extends Pantry {
  readonly mirror: FoodMirror;
  /** This player, once the room has said: the first part of what it names its food. */
  player = 0;
  /** Food the place put out here, for the room to hear of. */
  onFound: (food: Food) => void = () => {};
  readonly #world: World;
  #dropped = 0;
  /** Names given at the moment of dropping, waiting for the food to land: by kind, oldest first. */
  readonly #named: { kind: FoodKind; id: number }[] = [];

  constructor(world: World, patches: readonly FoodPatch[]) {
    super(world, patches);
    this.#world = world;
    this.mirror = new FoodMirror(world, this);
  }

  /** Names the next food this player drops (as it leaves the hand, so the room can tell everyone while it falls). */
  name(kind: FoodKind): number {
    const id = this.#next();
    this.#named.push({ kind, id });
    return id;
  }

  /** Before the room has said who this player is, food is named out of everyone's way (and the room won't know it). */
  #next() {
    return (this.player || LOCAL_PLAYER) * DROP_ID + ++this.#dropped;
  }

  /** It landed. */
  drop(kind: FoodKind, x: number, z: number): Food {
    const i = this.#named.findIndex((n) => n.kind === kind);
    const id = i >= 0 ? this.#named.splice(i, 1)[0].id : this.#next();
    const spec = FOODS[kind];
    const food: Food = { id, kind, name: spec.name, x, y: this.#world.heightAt(x, z), z, r: spec.r, sweet: spec.sweet, amount: 1, pool: false };
    this.mirror.add(food);
    return this.foods.find((f) => f.id === id) ?? food;
  }

  /** Another player's food, landed. */
  landed(id: number, kind: FoodKind, x: number, z: number) {
    const spec = FOODS[kind];
    this.mirror.add({ id, kind, name: spec.name, x, y: this.#world.heightAt(x, z), z, r: spec.r, sweet: spec.sweet, amount: 1, pool: false });
  }

  add(name: string, x: number, z: number, r: number, sweet: number): Food {
    const id = foundId(name, x, z);
    const known = this.foods.find((f) => f.id === id);
    if (known) return known;
    const food: Food = { id, kind: "found", name, x, y: this.#world.heightAt(x, z), z, r, sweet, amount: 1, pool: false };
    this.foods.push(food);
    this.onFound(food);
    return food;
  }

  eat(food: Food, appetite: number, dt: number): number {
    const bite = super.eat(food, appetite, dt);
    this.mirror.ate(food, bite);
    return bite;
  }
}
