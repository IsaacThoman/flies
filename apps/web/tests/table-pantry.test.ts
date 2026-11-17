import assert from "node:assert/strict";
import { test } from "node:test";
import { createPicnic } from "@fly/world";
import { DROP_ID, TableFood, toWire } from "@fly/net";
import { TablePantry } from "../src/online/table-pantry.ts";

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
  pantry.mirror.apply(0, change.amounts, change.gone, undefined);
  assert.ok(!pantry.foods.some((f) => f.id === id));
  assert.ok(pantry.foods.some((f) => f.id === 2 * DROP_ID + 1));
  // Clearing food still falling discards its unused name, too.
  const next = pantry.name("honey");
  assert.equal(pantry.drop("honey", 10, 0).id, next);
});
