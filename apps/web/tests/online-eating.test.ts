import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import type { BrainDriver, TableSocket } from "@fly/contracts";
import { Life } from "../src/life.ts";
import { Online } from "../src/online/online.ts";
import { OtherFlies } from "../src/online/others.ts";
import type { TableHost } from "../src/online/online.ts";
import { Hands } from "../src/tools/hands.ts";
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
  const result = table.bite(1, mine.id, 0.099, [{ x: outcome === "refused" ? 200 : 20, y: mine.y, z: 20 }], 0);
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
  table.bite(1, mine.id, 0.01, [{ x: 200, y: mine.y, z: 20 }], 0);
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

test("an online food receipt feeds Life and its hunger exactly once", (t) => {
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, { get: () => () => gradient });
  (globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => context }) };
  const world = createPicnic();
  const brain = { status: "running", stateAt: 0, state: { command: { walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0 } }, tick() {} } as unknown as BrainDriver;
  const life = new Life(world, brain);
  const scene = new THREE.Scene();
  const host = {
    scene, life, company: { list: [] }, others: new OtherFlies(scene, world), hands: new Hands(world), fly: { model: { mark() {} } }, bubbles: { table: null },
    felt: { air: { x: 0, y: 0, z: 0 }, touch: 0, looming: [] }, flies: () => 1, seat() {}, share() {},
  } as unknown as TableHost;
  const socket: TableSocket = { status: "connecting", closeCode: 0, closeReason: "", send() {}, drain() {}, close() {} };
  const online = new Online(host, () => socket, "ws://test", "abcdefghjk", "key", null);
  t.after(() => { online.leave(); online.dispose(); });
  const expected = new Hunger();
  online.line.onMessage({ type: "food", ack: 1, amounts: [], gone: [], eaten: 0.1, meal: [0.1, 0.08] });
  assert.equal(life.eaten, 0.1);
  life.step(0.1, 0);
  expected.step(0.1, 0.08);
  assert.deepEqual(life.hunger, expected);
  online.line.onMessage({ type: "food", ack: 1, amounts: [], gone: [], eaten: 0.1, meal: [0, 0] });
  life.step(0.1, 0);
  expected.step(0.1, 0);
  assert.equal(life.eaten, 0.1);
  assert.deepEqual(life.hunger, expected);
});

const splits = [
  { name: "one fly gets the whole receipt", times: [0.3], shares: [1] },
  { name: "two flies share in proportion to eating time", times: [0.1, 0.3], shares: [0.25, 0.75] },
  { name: "a fly that was not eating gets nothing", times: [0, 0.2, 0.1], shares: [0, 2 / 3, 1 / 3] },
  { name: "without recorded eating the followed fly gets the receipt", times: [0, 0, 0, 0], shares: [1, 0, 0, 0] },
  { name: "four flies conserve food and sugar with fractional shares", times: [0.07, 0.11, 0.13, 0.19], shares: [0.14, 0.22, 0.26, 0.38] },
];

for (const { name, times, shares } of splits) test(`device meal split: ${name}`, (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, { get: () => () => gradient });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => ({ getContext: () => context }) } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  });
  const world = createPicnic();
  const lives = times.map(() => new Life(world, { status: "running", state: null, tick() {} } as unknown as BrainDriver));
  const feeds = lives.map((life) => t.mock.method(life, "feed"));
  const scene = new THREE.Scene();
  const host = {
    scene, life: lives[0], company: { list: lives.slice(1).map((life) => ({ life, id: 0 })) },
    others: new OtherFlies(scene, world), hands: new Hands(world), stage: { set: {} }, bubbles: { table: null },
    felt: { air: { x: 0, y: 0, z: 0 }, touch: 0, looming: [] }, flies: () => lives.length,
  } as unknown as TableHost;
  const socket: TableSocket = { status: "connecting", closeCode: 0, closeReason: "", send() {}, drain() {}, close() {} };
  const online = new Online(host, () => socket, "ws://test", "abcdefghjk", "key", null);
  t.after(() => { online.leave(); online.dispose(); });
  const camera = new THREE.PerspectiveCamera();
  // Each frame has just one eater, so its duration is that fly's recorded time.
  for (let i = 0; i < times.length; i++) {
    for (let j = 0; j < lives.length; j++) lives[j].eating = i === j;
    online.update(times[i], camera, 0, () => 0);
  }
  for (const life of lives) life.eating = false;
  const receipt = [0.17, 0.093] as const;
  online.line.onMessage({ type: "food", ack: 1, amounts: [], gone: [], eaten: receipt[0], meal: [...receipt] });
  const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
  for (let i = 0; i < lives.length; i++) {
    assert.equal(feeds[i].mock.callCount(), shares[i] > 0 ? 1 : 0);
    close(lives[i].eaten, receipt[0] * shares[i]);
    if (shares[i] > 0) {
      close(feeds[i].mock.calls[0].arguments[0], receipt[0] * shares[i]);
      close(feeds[i].mock.calls[0].arguments[1], receipt[1] * shares[i]);
    }
  }
  for (let nutrient = 0; nutrient < 2; nutrient++) {
    close(feeds.reduce((sum, feed) => sum + (feed.mock.calls[0]?.arguments[nutrient] ?? 0), 0), receipt[nutrient]);
  }
  const before = lives.map((life) => life.eaten);
  online.line.onMessage({ type: "food", ack: 1, amounts: [], gone: [], eaten: receipt[0], meal: [0, 0] });
  assert.deepEqual(lives.map((life) => life.eaten), before, "an empty receipt creates no nutrition");
  // No new eating: the next receipt must use the fallback, not the previous weights.
  online.line.onMessage({ type: "food", ack: 2, amounts: [], gone: [], eaten: receipt[0] * 2, meal: [...receipt] });
  for (let i = 0; i < lives.length; i++) close(lives[i].eaten, before[i] + (i === 0 ? receipt[0] : 0));
});
