import assert from "node:assert/strict";
import { test } from "node:test";
import { EVERYONE, MAX_FLIES, MAX_OWN, PROTOCOL, WIRE_FOODS_MAX, readServerMessage } from "../src/index.ts";
import type { ServerMessage } from "../src/index.ts";

const welcome = {
  type: "welcome", v: PROTOCOL, id: 2, colour: "#2fb8ff", flies: [{ id: 2, colour: "#2fb8ff", at: [0, 0, 0, 0] }, { id: 4, colour: "#59e05a", at: [1, 1, 0] }], starter: 1, seed: 1, now: 5000, wall: 0, offset: 0, place: "picnic", epoch: 0,
  world: { light: "clock", weather: "now" }, players: [{ id: 1, colour: "#ffd21f", away: false, of: 1 }, { id: 3, colour: "#ff4fa3", away: false, of: 1 }], foods: [[1, "patch", "Sugar", 0, 0, 3, 1, 1, 0, 2]],
  balls: [{ by: 1, at: 10, from: [0, 0, 0], via: [1, 1, 1], to: [2, 0, 2] }], happenings: [{ kind: "gull", seed: 3, at: 4 }],
  bubbles: [{ slot: 0, cycle: 2, t0: 1, poppedAt: -1, goneAt: -1 }], at: [0, 0, 0, 0], room: { name: "Flies", listed: false, locked: false },
} satisfies ServerMessage;

const read = (m: unknown) => readServerMessage(JSON.stringify(m));

test("the room's messages are read as they are", () => {
  const messages: ServerMessage[] = [
    welcome,
    { type: "refused", reason: "locked", name: "Sunny" },
    { type: "pong", t: 1, now: 2 },
    { type: "joined", id: 3, colour: "#ff4fa3", away: false, of: 1 },
    { type: "seated", flies: [{ id: 2, colour: "#2fb8ff", at: [0, 0, 0, 0] }], asked: 3 },
    { type: "away", id: 3, away: true },
    { type: "left", id: 3 },
    { type: "drop", by: 3, id: 3_000_001, kind: "sugar", x: 1, z: 2, y: 0, at: 9 },
    { type: "ball", by: 3, at: 1, from: [0, 0, 0], via: [0, 1, 0], to: [1, 0, 1] },
    { type: "world", light: "noon", weather: "rain", offset: -300 },
    { type: "place", place: "lab", epoch: 1, foods: [], spots: { 1: [0, 0, 0, 0], 3: [1, 1, 0] } },
    { type: "happening", kind: "gust", seed: 1, at: 2 },
    { type: "pop", slot: 3, cycle: 7, at: 100 },
    { type: "found", food: [900_000_001, "found", "juice", 1, 1, 1, 0.5, 1, 0, 3] },
    { type: "food", ack: 65535, amounts: [[1, 0.5]], gone: [2], eaten: 0.25 },
  ];
  for (const m of messages) assert.deepEqual(read(m), m, m.type);
});

test("a welcome keeps its room code and whether it is open to everyone", () => {
  const room = { ...welcome.room, code: EVERYONE, everyone: true };
  assert.deepEqual(read({ ...welcome, room }), { ...welcome, room });
  for (const code of ["nope", "0000000000", 7, null]) assert.equal(read({ ...welcome, room: { ...room, code } }), null);
  for (const everyone of ["yes", 1, null]) assert.equal(read({ ...welcome, room: { ...room, everyone } }), null);
});

test("a message out of shape is dropped whole: never half-used, never too long a list", () => {
  const bad: unknown[] = [
    null, 7, "welcome", [], { type: "nonsense" }, { type: "constructor" },
    { ...welcome, players: "everyone" },
    { ...welcome, players: Array.from({ length: MAX_FLIES + 1 }, (_, i) => ({ id: (i % MAX_FLIES) + 1, colour: "#fff", away: false, of: 1 })) },
    { ...welcome, players: [{ id: 1, colour: "#ffd21f", away: false }] }, { ...welcome, players: [{ id: 1, colour: "#ffd21f", away: false, of: 9 }] },
    { ...welcome, id: 9 }, { ...welcome, id: 0 }, { ...welcome, id: 1.5 },
    { ...welcome, foods: Array.from({ length: WIRE_FOODS_MAX + 1 }, (_, i) => [i, "patch", "x", 0, 0, 1, 1, 1, 0]) },
    { ...welcome, foods: [[1, "patch", "x", 0, 0, 1, 1, 1, 7]] },
    { ...welcome, at: [0, "0", 0] }, { ...welcome, at: [1e9, 0, 0] }, { ...welcome, world: null }, { ...welcome, room: { name: 3 } },
    { ...welcome, colour: "x".repeat(1000) },
    { type: "joined", id: 1_000_000, colour: "#fff", away: false, of: 1 },
    { type: "joined", id: 3, colour: "#fff", away: false },
    { type: "joined", id: 3, colour: "#fff", away: false, of: "1" },
    { type: "joined", id: 2, colour: { toString: 1 }, away: false },
    { type: "left", id: "2" },
    { type: "place", place: "lab", epoch: 1, foods: [], spots: null },
    { type: "place", place: "lab", epoch: 1, foods: [], spots: { 99: [0, 0, 0] } },
    { type: "food", ack: 1, amounts: [[1]], gone: [], eaten: 0 },
    { type: "food", ack: 1, amounts: [], gone: [], eaten: Infinity },
    { type: "found", food: null },
    { type: "ball", by: 2, at: 1, from: [0, 0], via: [0, 0, 0], to: [0, 0, 0] },
    { type: "refused", reason: "toString" },
    { type: "rooms", rooms: new Array(1000).fill(null) },
  ];
  for (const m of bad) assert.equal(read(m), null, JSON.stringify(m)?.slice(0, 80));
  assert.equal(readServerMessage("{"), null);
  assert.equal(readServerMessage(`[${"[".repeat(100_000)}`), null);
});

test("a list of rooms keeps the rooms that are rooms, named as a room may be", () => {
  const good = { code: "23456789ab", name: "Sunny crumbs", place: "picnic", flies: 2, locked: false };
  const everyone = { ...good, code: EVERYONE, everyone: true };
  const m = read({ type: "rooms", rooms: [good, everyone, { ...everyone, everyone: "yes" }, { ...good, name: "ㅤ" }, { ...good, code: "nope" }, { ...good, flies: 99 }, { ...good, name: "‮evil" }, null] });
  assert.deepEqual(m, { type: "rooms", rooms: [good, everyone] });
});

test("a device's own flies, in a welcome or as seated, are one to MAX_OWN, each id once, and the welcome's first is the player", () => {
  const fly = (id: number) => ({ id, colour: "#fff", at: [0, 0, 0, 0] });
  const many = Array.from({ length: MAX_OWN + 1 }, (_, i) => fly(i + 1));
  const bad: unknown[] = [
    { ...welcome, flies: undefined }, { ...welcome, flies: [] }, { ...welcome, flies: many }, { ...welcome, flies: [fly(2), fly(2)] },
    { ...welcome, flies: [fly(3), fly(2)] }, { ...welcome, flies: [fly(2), fly(9)] }, { ...welcome, flies: [fly(2), { ...fly(4), at: [0, NaN, 0] }] },
    { ...welcome, flies: [fly(2), { id: 4, at: [0, 0, 0] }] }, { ...welcome, flies: [fly(2), null] },
    { type: "seated", flies: [], asked: 1 }, { type: "seated", flies: many, asked: 4 }, { type: "seated", flies: [fly(1), fly(1)], asked: 2 },
    { type: "seated", flies: [fly(1)], asked: 0 }, { type: "seated", flies: [fly(1)], asked: MAX_OWN + 1 }, { type: "seated", flies: [fly(1)], asked: 1.5 },
    { type: "seated", flies: [fly(1)] }, { type: "seated", flies: "all", asked: 1 },
  ];
  for (const m of bad) assert.equal(read(m), null, JSON.stringify(m)?.slice(0, 120));
  const four = { type: "seated", flies: many.slice(0, MAX_OWN), asked: MAX_OWN };
  assert.deepEqual(read(four), four);
});

test("nutrition receipts are optional and must be finite, nonnegative meals", () => {
  const food = { type: "food", ack: 1, amounts: [], gone: [], eaten: 0 };
  assert.deepEqual(read(food), food);
  assert.deepEqual(read({ ...food, meal: [0.1, 0.08] }), { ...food, meal: [0.1, 0.08] });
  for (const meal of [null, [1], [1, -1], [-1, 0], [0.1, 0.2], [1, Infinity]]) assert.equal(read({ ...food, meal }), null);
});
