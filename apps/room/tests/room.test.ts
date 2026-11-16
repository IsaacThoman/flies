import assert from "node:assert/strict";
import { test } from "node:test";
import { createPicnic } from "@fly/world";
import { DROP_ID, FLIES, FLY_MAX, PROTOCOL, createFlyState, decodeFlies, encodeBites, encodeFly } from "@fly/net";
import type { FlyState, ServerMessage } from "@fly/net";
import { Room } from "../src/room.ts";

function setup() {
  let now = 0;
  const room = new Room({ world: createPicnic(), seed: 5, now: () => now, hours: () => 12 });
  const join = () => {
    const got: (ServerMessage | FlyState[])[] = [];
    const player = room.join((data) => {
      if (typeof data === "string") got.push(JSON.parse(data) as ServerMessage);
      else {
        const list: FlyState[] = [];
        assert.equal(data[0], FLIES);
        decodeFlies(new DataView(data.buffer, data.byteOffset, data.byteLength), createFlyState(), (s) => list.push({ ...s, pose: { ...s.pose }, hand: { ...s.hand } }));
        got.push(list);
      }
    })!;
    room.receive(player, JSON.stringify({ type: "hello", v: PROTOCOL }));
    return { player, got, json: () => got.filter((m): m is ServerMessage => !Array.isArray(m)), batches: () => got.filter((m): m is FlyState[] => Array.isArray(m)) };
  };
  const fly = (x: number, z: number, t: number) => {
    const s = createFlyState();
    s.x = x;
    s.z = z;
    s.t = t;
    const view = new DataView(new ArrayBuffer(FLY_MAX));
    const n = encodeFly(view, s);
    return new Uint8Array(view.buffer, 0, n);
  };
  return { room, join, fly, advance: (ms: number) => (now += ms) };
}

test("a newcomer is welcomed with the table as it is, and the others are told", () => {
  const { join } = setup();
  const a = join();
  const b = join();
  const welcome = b.json().find((m) => m.type === "welcome")!;
  assert.ok(welcome && welcome.type === "welcome");
  assert.equal(welcome.id, 2);
  assert.deepEqual(welcome.players.map((p) => p.id), [1]);
  assert.equal(welcome.foods.length, createPicnic().place.patches.length);
  assert.equal(welcome.bubbles.length, 8);
  assert.ok(a.json().some((m) => m.type === "joined" && m.id === 2));
});

test("a device speaking another version is refused", () => {
  const { room } = setup();
  const got: string[] = [];
  const p = room.join((d) => typeof d === "string" && got.push(d))!;
  room.receive(p, JSON.stringify({ type: "hello", v: PROTOCOL + 1 }));
  assert.equal(JSON.parse(got[0]).type, "refused");
});

test("each fly's state goes to everyone else in one batch a beat, never back to its own device", () => {
  const { room, join, fly, advance } = setup();
  const a = join();
  const b = join();
  const c = join();
  advance(10);
  room.receive(a.player, fly(1, 2, 10));
  room.receive(b.player, fly(3, 4, 10));
  room.tick();
  assert.deepEqual(a.batches().at(-1)!.map((s) => s.id), [2]);
  assert.deepEqual(c.batches().at(-1)!.map((s) => s.id).sort(), [1, 2]);
  // Nothing new: no batch.
  const before = c.batches().length;
  room.tick();
  assert.equal(c.batches().length, before);
});

test("a fly that jumps across the table, sinks into it, or comes from the future is refused", () => {
  const { room, join, fly, advance } = setup();
  const a = join();
  const b = join();
  advance(100);
  room.receive(a.player, fly(0, -150, 100));
  advance(50);
  room.receive(a.player, fly(200, -150, 150));
  room.receive(a.player, fly(0, -150, 5000));
  room.tick();
  assert.equal(a.player.refused, 2);
  assert.equal(b.batches().at(-1)![0].x, 0);
  // Walking on is fine.
  advance(50);
  room.receive(a.player, fly(0.5, -150, 200));
  assert.equal(a.player.refused, 2);
  // A fly on its feet that keeps saying it is somewhere else is taken there after half a second (it may really be: a device that stalled).
  for (let i = 1; i <= 10; i++) {
    advance(50);
    room.receive(a.player, fly(100, 0, 200 + i * 50));
  }
  assert.equal(a.player.resyncs, 1);
  assert.equal(a.player.state.x, 100);
});

test("food one drops is everyone's; bites are counted and told back with the last one acknowledged", () => {
  const { room, join, fly, advance } = setup();
  const a = join();
  const b = join();
  advance(100);
  room.receive(a.player, fly(20, 20, 100));
  const id = DROP_ID * a.player.id + 1;
  room.receive(a.player, JSON.stringify({ type: "drop", id, kind: "honey", x: 20, z: 20, at: 100 }));
  assert.ok(b.json().some((m) => m.type === "drop" && m.id === id && m.by === 1));
  const view = new DataView(new ArrayBuffer(64));
  const n = encodeBites(view, 7, [{ food: id, amount: 0.01 }]);
  room.receive(a.player, new Uint8Array(view.buffer, 0, n));
  advance(200);
  room.tick();
  const food = a.json().filter((m) => m.type === "food").at(-1)!;
  assert.ok(food.type === "food");
  assert.equal(food.ack, 7);
  assert.deepEqual(food.amounts.find(([f]) => f === id), [id, 0.99]);
  assert.equal(food.eaten[1], 0.01);
  // Someone else can't name food as theirs.
  room.receive(b.player, JSON.stringify({ type: "drop", id: DROP_ID * 1 + 2, kind: "honey", x: 0, z: 0, at: 100 }));
  assert.equal(room.food.find(DROP_ID + 2), null);
});

test("a thrown ball, a change of weather and a visitor are told to everyone", () => {
  const { room, join } = setup();
  const a = join();
  const b = join();
  room.receive(a.player, JSON.stringify({ type: "ball", at: 300, from: [0, 70, 330], via: [0, 2, 36], to: [100, 400, 200] }));
  assert.ok(b.json().some((m) => m.type === "ball" && m.by === 1 && m.at === 300));
  room.receive(b.player, JSON.stringify({ type: "world", weather: "rain" }));
  assert.ok(a.json().some((m) => m.type === "world" && m.weather === "rain"));
  const h = room.happen("butterfly");
  assert.ok(a.json().some((m) => m.type === "happening" && m.seed === h.seed));
  assert.ok(b.json().some((m) => m.type === "happening" && m.kind === "butterfly"));
});
