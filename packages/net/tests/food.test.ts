import assert from "node:assert/strict";
import { test } from "node:test";
import { EAT_RATE, MAX_DROPPED, PATCHES, Pantry, RESTAURANT_PATCHES, RESTAURANT_START, TABLE_TOPS, createPicnic, createRestaurant } from "@fly/world";
import { DROP_ID, FoodMirror, TableFood, fromWire, toWire } from "../src/index.ts";

const world = createPicnic();
const sugar = PATCHES.findIndex((p) => p.name === "sugar") + 1;

test("the room's patches have the ids every device's pantry gives them", () => {
  const table = new TableFood(world, PATCHES);
  const pantry = new Pantry(world, PATCHES);
  assert.deepEqual(table.foods.map((f) => [f.id, f.name]), pantry.foods.map((f) => [f.id, f.name]));
});

test("two flies eating the same food at once never eat more than there was between them", () => {
  const table = new TableFood(world, []);
  const id = 1 * DROP_ID + 1;
  const food = table.drop(1, id, "sugar", 20, 20)!;
  assert.ok(food);
  let now = 0;
  let granted = 0;
  // Each eats at full appetite every 50 ms until it is gone.
  for (let i = 0; i < 200 && table.find(id); i++) {
    now += 50;
    for (const by of [1, 2]) granted += table.bite(by, id, EAT_RATE * 0.05, [{ x: 20.5, y: food.y, z: 20 }], now).granted;
  }
  assert.equal(table.find(id), null, "eaten up and gone");
  assert.ok(Math.abs(granted - 1) < 1e-9, `granted ${granted}`);
  assert.ok(Math.abs((table.eaten.get(1) ?? 0) + (table.eaten.get(2) ?? 0) - 1) < 1e-9);
  // Together they finished it in about half the time one would.
  assert.ok(now < 1000 / EAT_RATE / 2 + 200, `took ${now} ms`);
  const changes = table.flush();
  assert.deepEqual(changes?.gone, [id]);
});

test("a bite from too far away, of food that isn't there, or faster than a fly can eat is refused", () => {
  const table = new TableFood(world, PATCHES);
  const p = table.find(sugar)!;
  assert.equal(table.bite(1, sugar, 0.01, [{ x: p.x + 50, y: p.y, z: p.z }], 0).refused, "far");
  assert.equal(table.bite(1, 999, 0.01, [{ x: p.x, y: p.y, z: p.z }], 0).refused, "unknown");
  assert.equal(table.bite(1, sugar, 0.9, [{ x: p.x, y: p.y, z: p.z }], 100).refused, "greedy");
  // Eating steadily at the fly's rate is fine for as long as it likes.
  for (let t = 1000; t < 4000; t += 50) assert.equal(table.bite(1, sugar, EAT_RATE * 0.05, [{ x: p.x, y: p.y, z: p.z }], t).refused, null);
});

test("a player names only its own food, and past MAX_DROPPED the oldest goes", () => {
  const table = new TableFood(world, []);
  assert.equal(table.drop(2, 1 * DROP_ID + 1, "honey", 0, 0), null);
  assert.equal(table.drop(1, 1 * DROP_ID + 1, "pebble", 0, 0), null);
  assert.equal(table.drop(1, 1 * DROP_ID + 1, "honey", 9000, 0), null);
  for (let i = 1; i <= MAX_DROPPED + 2; i++) assert.ok(table.drop(1, DROP_ID + i, "honey", i * 3, 0));
  assert.equal(table.foods.length, MAX_DROPPED);
  assert.deepEqual(table.flush()?.gone, [DROP_ID + 1, DROP_ID + 2]);
});

test("a device's pantry is the room's food less what its own fly ate that the room hasn't counted yet", () => {
  const table = new TableFood(world, PATCHES);
  const pantry = new Pantry(world, []);
  const mirror = new FoodMirror(world, pantry);
  mirror.welcome(table.foods.map(toWire));
  const mine = pantry.foods.find((f) => f.id === sugar)!;
  // The fly eats 0.1 locally; sent as message 1; the room hasn't heard yet when another fly's 0.2 is counted.
  mine.amount -= 0.1;
  mirror.ate(mine, 0.1);
  mirror.sent(1);
  table.bite(2, sugar, 0.2, [{ x: mine.x, y: mine.y, z: mine.z }], 1000);
  let flushed = table.flush()!;
  mirror.apply(0, flushed.amounts, flushed.gone, undefined);
  assert.ok(Math.abs(mine.amount - 0.7) < 1e-9, `with its own bite still pending: ${mine.amount}`);
  // Now the room counts it.
  table.bite(1, sugar, 0.1, [{ x: mine.x, y: mine.y, z: mine.z }], 2000);
  flushed = table.flush()!;
  mirror.apply(1, flushed.amounts, flushed.gone, table.eaten.get(1));
  assert.ok(Math.abs(mine.amount - 0.7) < 1e-9);
  assert.ok(Math.abs(mirror.granted - 0.1) < 1e-9);
  assert.ok(Math.abs(mirror.predicted - 0.1) < 1e-9);
});

test("in the restaurant the room's food lies at its heights, and is eaten only from there, not from the floor under it", () => {
  const room = createRestaurant();
  const table = new TableFood(room, RESTAURANT_PATCHES);
  const pantry = new Pantry(room, RESTAURANT_PATCHES);
  assert.deepEqual(table.foods.map((f) => f.y), pantry.foods.map((f) => f.y), "as every device has them");
  assert.ok(table.foods.some((f) => f.y === 0) && table.foods.some((f) => f.y >= TABLE_TOPS.round.top), "on the floor and on the tables");
  const sugar = table.foods.find((f) => f.name === "sugar" && f.y === TABLE_TOPS.round.top)!;
  assert.equal(table.bite(1, sugar.id, 0.01, [{ x: sugar.x, y: 0, z: sugar.z }], 0).refused, "far", "from the floor under it");
  assert.equal(table.bite(1, sugar.id, 0.01, [{ x: sugar.x, y: sugar.y, z: sugar.z }], 0).refused, null);

  // Dropped under the window table, it lands on the floor; on it, on the table.
  const x = RESTAURANT_START.x + 200;
  const z = RESTAURANT_START.z;
  assert.equal(table.drop(1, DROP_ID + 1, "honey", x, z, 0)!.y, 0);
  assert.equal(table.drop(1, DROP_ID + 2, "honey", x, z, TABLE_TOPS.round.top)!.y, TABLE_TOPS.round.top);
  assert.equal(table.found(900_000_001, "crumb", x, z, 1, 0.5, 10)!.y, 0);

  // The wire carries each food's height; a table kept before heights has its food on the highest surface.
  assert.deepEqual(table.foods.map((f) => f.y), table.foods.map((f) => fromWire(room, toWire(f)).y));
  const [id, kind, name, fx, fz, r, sweet, amount, pool] = toWire(sugar);
  assert.equal(fromWire(room, [id, kind, name, fx, fz, r, sweet, amount, pool]).y, room.heightAt(fx, fz));
  // The wire carries sweetness alone; a food's other tastes come back as the place and FOODS have them.
  assert.deepEqual(table.foods.map((f) => fromWire(room, toWire(f))).map((f) => [f.water, f.bitter]), table.foods.map((f) => [f.water, f.bitter]));
  assert.ok(table.foods.some((f) => f.name === "espresso" && f.bitter > 0));
});

test("any one of a device's flies can reach a bite, but none means no bite and height still counts", () => {
  const table = new TableFood(world, PATCHES);
  const food = table.find(sugar)!;
  const far = { x: food.x + 100, y: food.y, z: food.z };
  const under = { x: food.x, y: food.y - 100, z: food.z };
  assert.equal(table.bite(1, sugar, 0.01, [], 0).refused, "unknown");
  assert.equal(table.bite(1, sugar, 0.01, [far, under], 0).refused, "far");
  assert.equal(food.amount, 1);
  const got = table.bite(1, sugar, 0.01, [far, under, food], 0);
  assert.equal(got.refused, null);
  assert.equal(got.granted, 0.01);
  assert.equal(table.eaten.get(1), 0.01);
});

test("a device's stored appetite and its refill scale with its fly count, and recounting down caps the store", () => {
  const foods = [new TableFood(world, PATCHES), new TableFood(world, PATCHES)];
  const count = [1, 4];
  for (const [i, table] of foods.entries()) {
    const food = table.find(sugar)!;
    const flies = Array.from({ length: count[i] }, () => ({ x: food.x, y: food.y, z: food.z }));
    food.amount = 10;
    const stored = EAT_RATE * 1.5 * count[i];
    assert.equal(table.bite(1, sugar, stored + 0.01, flies, 0).refused, "greedy");
    assert.equal(table.bite(1, sugar, stored, flies, 0).refused, null);
    assert.equal(table.bite(1, sugar, 0.001, flies, 0).refused, "greedy");
    assert.equal(table.bite(1, sugar, stored * 0.5, flies, 500).refused, null);
    assert.ok(Math.abs(table.eaten.get(1)! - stored * 1.5) < 1e-9);
  }
  assert.ok(Math.abs(foods[1].eaten.get(1)! - foods[0].eaten.get(1)! * 4) < 1e-9);
  const table = new TableFood(world, PATCHES);
  const food = table.find(sugar)!;
  assert.equal(table.bite(1, sugar, 0.01, [food, food, food, food], 0).refused, null);
  assert.equal(table.bite(1, sugar, EAT_RATE * 2, [food], 0).refused, "greedy");
  assert.equal(table.bite(1, sugar, EAT_RATE, [food], 0).refused, null);
});

test("clearing dropped food is owned by the room, preserves patches and finds, and reaches every mirror", () => {
  const table = new TableFood(world, PATCHES);
  const patchIds = table.foods.map((f) => f.id);
  const found = table.found(900_000_001, "crumb", 0, 0, 1, 0.5)!;
  const mine = table.drop(1, DROP_ID + 1, "honey", 0, 0)!;
  const theirs = table.drop(2, 2 * DROP_ID + 1, "water", 0, 0)!;
  const pantry = new Pantry(world);
  const mirror = new FoodMirror(world, pantry);
  mirror.welcome(table.foods.map(toWire));
  table.clearDropped(0);
  assert.ok(table.find(mine.id) && table.find(theirs.id), "invalid owner clears nothing");
  table.clearDropped(1);
  assert.equal(table.find(mine.id), null);
  assert.ok(table.find(theirs.id));
  assert.ok(table.find(found.id));
  for (const id of patchIds) assert.ok(table.find(id));
  const change = table.flush()!;
  assert.deepEqual(change.gone, [mine.id]);
  mirror.apply(0, change.amounts, change.gone, undefined);
  assert.deepEqual(pantry.foods.map((f) => f.id), table.foods.map((f) => f.id));
  table.clearDropped(1);
  assert.equal(table.flush(), null, "a repeated clear makes no changes");
});

test("found food expires from snapshots, including across a restart and while nobody ticks the table", () => {
  let now = 1000;
  const table = new TableFood(world, [], () => now);
  const food = table.found(900000001, "strawberry juice", 20, 20, 1, 0.8, 0, 10)!;
  const foods = table.foods.map(toWire);
  now += 10001;
  table.update(0);
  assert.equal(table.find(food.id), null, "expiry removes food from the room snapshot");
  now = 1000;
  table.found(food.id, "strawberry juice", 20, 20, 1, 0.8, 0, 10);
  const expires = table.expiries();
  now += 9000;
  const restored = new TableFood(world, [], () => now);
  restored.restore(foods, expires);
  assert.ok(restored.find(food.id));
  now += 1001;
  restored.update(0);
  assert.equal(restored.find(food.id), null);
  assert.deepEqual(restored.flush()?.gone, [food.id]);
  const late = new TableFood(world, [], () => now);
  late.restore(foods, expires);
  assert.equal(late.find(food.id), null, "expired food is not restored");
});

test("legacy found food receives a bounded lifetime", () => {
  let now = 0;
  const table = new TableFood(world, [], () => now);
  const food = table.found(900000001, "crumb", 20, 20, 1, 0.5)!;
  const legacy = table.foods.map(toWire);
  now = 1000;
  table.restore(legacy);
  now += 1520001;
  table.update(0);
  assert.equal(table.find(food.id), null);
});

test("refused and trimmed bites reconcile quantities and drain predictions", () => {
  for (const reason of ["far", "greedy", "unknown", "trimmed"] as const) {
    const table = new TableFood(world, []);
    const food = table.drop(1, DROP_ID + 1, "sugar", 20, 20)!;
    if (reason === "trimmed") food.amount = 0.05;
    const pantry = new Pantry(world);
    const mirror = new FoodMirror(world, pantry);
    mirror.welcome(table.foods.map(toWire));
    const mine = pantry.foods[0];
    const amount = reason === "greedy" ? 0.8 : 0.1;
    mine.amount = Math.max(0, mine.amount - amount);
    mirror.ate(mine, amount);
    mirror.sent(1);
    if (reason === "unknown") table.restore([]);
    table.bite(1, mine.id, amount, [{ x: reason === "far" ? 100 : 20, y: mine.y, z: 20 }], 0);
    const change = table.flush();
    assert.ok(change, `${reason}: an acknowledgement must be sent even with no food changed`);
    mirror.apply(1, change.amounts, change.gone, table.eaten.get(1) ?? 0, table.takeMeal(1));
    assert.ok(Math.abs((pantry.foods[0]?.amount ?? 0) - (table.find(mine.id)?.amount ?? 0)) <= 1e-4, reason);
    assert.equal(mirror.pending, 0);
  }
});
