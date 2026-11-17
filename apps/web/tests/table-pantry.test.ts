import assert from "node:assert/strict";
import { test } from "node:test";
import { DROP_ID, TableFood, toWire } from "@fly/net";
import { createPicnic } from "@fly/world";
import { TablePantry } from "../src/online/table-pantry.ts";

test("100 reloads and rejoins keep dropped food IDs unique and positions equal to the room", () => {
  const world = createPicnic();
  const room = new TableFood(world, []);
  const observer = new TablePantry(world);
  observer.mirror.welcome([]);
  const ids = new Set<number>();
  for (let cycle = 0; cycle < 100; cycle++) {
    const returning = new TablePantry(world);
    returning.player = 2;
    for (let rejoin = 0; rejoin < 2; rejoin++) {
      returning.welcome(room.foods.map(toWire));
      const id = returning.name("sugar");
      assert.ok(!ids.has(id), `reused ${id} on reload ${cycle}`);
      ids.add(id);
      const x = cycle / 10;
      const z = rejoin;
      returning.drop("sugar", x, z);
      assert.ok(room.drop(2, id, "sugar", x, z));
      observer.landed(id, "sugar", x, z);
      const changes = room.flush();
      if (changes) {
        returning.mirror.apply(0, changes.amounts, changes.gone, undefined);
        observer.mirror.apply(0, changes.amounts, changes.gone, undefined);
      }
      const expected = room.find(id)!;
      assert.deepEqual(returning.foods.find((f) => f.id === id), expected);
      assert.deepEqual(observer.foods.find((f) => f.id === id), expected);
      const byId = (a: { id: number }, b: { id: number }) => a.id - b.id;
      assert.deepEqual([...returning.foods].sort(byId), [...room.foods].sort(byId));
      assert.deepEqual([...observer.foods].sort(byId), [...room.foods].sort(byId));
    }
  }
});

test("retained IDs stay reserved through pending bites and acknowledged removal", () => {
  const world = createPicnic();
  const room = new TableFood(world, []);
  const old = room.drop(2, 2000001, "sugar", 0, 0)!;
  const returning = new TablePantry(world);
  returning.player = 2;
  returning.welcome([toWire(old)]);
  const food = returning.foods[0];
  returning.eat(food, 1, 4);
  assert.equal(returning.foods.length, 1, "exhausted prediction stays available for reconciliation");
  assert.equal(food.amount, 0);
  assert.equal(returning.mirror.pending, 1);
  const pendingId = returning.name("sugar");
  assert.notEqual(pendingId, old.id);
  returning.mirror.sent(1);
  returning.mirror.apply(1, [], [old.id], undefined, [1, 1]);
  assert.equal(returning.foods.length, 0, "only the room removes an acknowledged exhausted food");
  assert.equal(returning.mirror.pending, 0);
  const id = returning.name("sugar");
  assert.notEqual(id, pendingId);
  assert.notEqual(id, old.id);
  assert.ok(room.drop(2, id, "sugar", 2, 0));
});

test("online clearing requests the room's decision and waits for its food update", () => {
  const world = createPicnic();
  const room = new TableFood(world, world.place.patches);
  const pantry = new TablePantry(world);
  pantry.player = 1;
  const id = pantry.name("honey");
  room.drop(1, id, "honey", 0, 0);
  room.drop(2, 2 * DROP_ID + 1, "water", 0, 0);
  pantry.mirror.welcome(room.foods.map(toWire));
  let requests = 0;
  pantry.onClear = () => { requests++; };
  pantry.clearDropped();
  assert.equal(requests, 1);
  assert.ok(pantry.foods.some((f) => f.id === id), "nothing removed before the room agrees");
  room.clearDropped(1);
  const change = room.flush()!;
  for (const gone of change.gone) pantry.forgetFood(gone);
  pantry.mirror.apply(0, change.amounts, change.gone, undefined);
  assert.ok(!pantry.foods.some((f) => f.id === id));
  assert.ok(pantry.foods.some((f) => f.id === 2 * DROP_ID + 1));
  // The next drop still receives its own name.
  const next = pantry.name("honey");
  assert.equal(pantry.drop("honey", 10, 0).id, next);
});
