import assert from "node:assert/strict";
import { test } from "node:test";
import { Hunger } from "@fly/body";
import { DROP_ID, TableFood, toWire } from "@fly/net";
import { createPicnic } from "@fly/world";
import { TablePantry } from "../src/online/table-pantry.ts";

for (const outcome of ["refused", "trimmed", "accepted"] as const) test(`${outcome} nutrition comes only from acknowledged eating`, () => {
  const world = createPicnic();
  const table = new TableFood(world, []);
  const food = table.drop(1, DROP_ID + 1, "berry", 20, 20)!;
  const pantry = new TablePantry(world);
  pantry.confirmed = true;
  pantry.mirror.welcome([toWire(food)]);
  const mine = pantry.foods[0];
  if (outcome === "trimmed") food.amount = 0.03;
  const hunger = new Hunger();
  const expected = new Hunger();
  const predicted = pantry.eat(mine, 1, 0.3);
  assert.equal(predicted, 0, "an unconfirmed bite must not feed the hunger account");
  hunger.step(0.3, predicted * mine.sweet);
  expected.step(0.3, 0);
  assert.deepEqual(hunger, expected);
  pantry.mirror.sent(1);
  const result = table.bite(1, mine.id, 0.099, outcome === "refused" ? 200 : 20, mine.y, 20, 0);
  const changed = table.flush()!;
  const meal = pantry.mirror.apply(1, changed.amounts, changed.gone, table.eaten.get(1) ?? 0, table.takeMeal(1));
  assert.ok(Math.abs(meal[0] - result.granted) < 1e-8);
  assert.ok(Math.abs(meal[1] - result.granted * 0.8) < 1e-8);
  hunger.step(0.1, meal[1]);
  expected.step(0.1, result.granted * 0.8);
  assert.deepEqual(hunger, expected);
  assert.equal(pantry.mirror.pending, 0);
  assert.ok(Math.abs((pantry.foods[0]?.amount ?? 0) - (table.find(mine.id)?.amount ?? 0)) < 1e-4);
  assert.deepEqual(table.takeMeal(1), [0, 0], "nutrition is granted once");
});

test("a refused final bite restores food removed by local prediction", () => {
  const world = createPicnic();
  const table = new TableFood(world, []);
  const food = table.drop(1, DROP_ID + 1, "sugar", 20, 20)!;
  food.amount = 0.01;
  const pantry = new TablePantry(world);
  pantry.confirmed = true;
  pantry.mirror.welcome([toWire(food)]);
  const mine = pantry.foods[0];
  pantry.eat(mine, 1, 0.1);
  pantry.mirror.sent(1);
  table.bite(1, mine.id, 0.01, 200, mine.y, 20, 0);
  const change = table.flush()!;
  pantry.mirror.apply(1, change.amounts, change.gone, 0, table.takeMeal(1));
  assert.equal(pantry.foods[0]?.amount, 0.01);
});

test("an older room retains optimistic nutrition without crediting its historical cumulative total twice", () => {
  const world = createPicnic();
  const pantry = new TablePantry(world);
  const food = pantry.drop("berry", 20, 20);
  const bite = pantry.eat(food, 1, 0.1);
  assert.ok(bite > 0);
  pantry.mirror.sent(1);
  assert.deepEqual(pantry.mirror.apply(1, [[food.id, 0.9]], [], 10), [0, 0]);
});
