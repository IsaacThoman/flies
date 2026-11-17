import assert from "node:assert/strict";
import { test } from "node:test";
import { EAT_RATE, LAB, RESTAURANT_START, TABLE_TOPS, World, WORLDS } from "@fly/world";
import {
  AIRBORNE, AWAY, CLOSE, COLOURS, DROP_ID, FLY_MAX, LIMITS, MAX_FLIES, MAX_OWN, MAX_WALK, OWN_MAX, PLAYING, PROTOCOL, ROOM_SCALE, TABLETOP_SCALE, createFlyState, decodeFlies, encodeBites, encodeFly, encodeOwn,
  spawnSpot, toWire,
} from "@fly/net";
import type { ClientMessage, FlyState, ServerMessage, Spot, TableStart, WireScale } from "@fly/net";
import { AWAY_LIMIT, SILENT_AFTER, Table, UNNAMED } from "../src/table.ts";
import type { Link, Seat, TableRecord } from "../src/table.ts";
import { LISTED_IDLE, TABLE_IDLE, Tables } from "../src/tables.ts";

const CODE = "23456789ab";
const START: TableStart = { place: "picnic", light: "noon", weather: "clear", zone: "", offset: 0 };

type Hello = Extract<ClientMessage, { type: "hello" }>;
type Sent = Extract<ServerMessage, { type: string }>;
type Message<T extends Sent["type"]> = Extract<Sent, { type: T }>;

/** A device's line as the table sees it: everything sent down it is kept (binary copied, since the table reuses its batch). */
type FakeLink = Link & { sent: (string | Uint8Array)[]; closed: { code: number; reason: string } | null };

function fakeLink(): FakeLink {
  const link: FakeLink = {
    sent: [],
    closed: null,
    send(data) {
      link.sent.push(typeof data === "string" ? data : data.slice());
    },
    close(code, reason) {
      link.closed = { code, reason };
    },
  };
  return link;
}

/** Where a fly's state puts it on the wire: to 1/50 mm. */
const onWire = (spot: Spot) => [Math.round(spot[0] * 50) / 50, Math.round(spot[1] * 50) / 50];

type Player = { key: string; link: FakeLink; seat: Seat; seq: number; bites: number };
const linkOf = (to: FakeLink | Player) => ("seat" in to ? to.link : to);

const said = (to: FakeLink | Player) => linkOf(to).sent.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as Sent);
const saidOf = <T extends Sent["type"]>(to: FakeLink | Player, type: T) => said(to).filter((m): m is Message<T> => m.type === type);

/** Every batch sent down a link, each as the flies in it, read at the scale of the place they are in (a tabletop's, unless said). */
function batches(to: FakeLink | Player, scale: WireScale = TABLETOP_SCALE) {
  const out: { id: number; x: number; y: number; z: number; flags: number; seq: number; epoch: number }[][] = [];
  const scratch = createFlyState();
  for (const d of linkOf(to).sent) {
    if (typeof d === "string") continue;
    const flies: { id: number; x: number; y: number; z: number; flags: number; seq: number; epoch: number }[] = [];
    assert.ok(decodeFlies(new DataView(d.buffer, d.byteOffset, d.byteLength), scale, scratch, (s) => flies.push({ id: s.id, x: s.x, y: s.y, z: s.z, flags: s.flags, seq: s.seq, epoch: s.epoch })) >= 0);
    out.push(flies);
  }
  return out;
}

/** A table with clocks the test moves on: room time and the wall clock, ms. */
function room(start: TableStart = START, seed = 7) {
  const clock = { now: 1000, wall: Date.UTC(2026, 5, 1, 12) };
  const options = { now: () => clock.now, wall: () => clock.wall };
  const table = new Table(CODE, start, "key-1", seed, options);
  const hello = (key: string, extra: Partial<Hello> = {}): Hello => ({ type: "hello", v: PROTOCOL, table: CODE, key, ...extra });
  /** A device sitting down; fails the test if it is refused. */
  const join = (key: string, extra: Partial<Hello> = {}): Player => {
    const link = fakeLink();
    const seat = table.hello(link, key, hello(key, extra));
    assert.equal(typeof seat, "object", `${key} refused: ${String(seat)}`);
    return { key, link, seat: seat as Seat, seq: 0, bites: 0 };
  };
  /** Its device sends where its fly is now: on the surface at or below `y` (the highest, if left out), at the table's scale unless said. */
  const fly = (p: Player, x: number, z: number, o: { flags?: number; t?: number; epoch?: number; y?: number; scale?: WireScale } = {}) => {
    const s = createFlyState();
    s.id = p.seat.id;
    s.flags = o.flags ?? 0;
    s.epoch = o.epoch ?? table.epoch;
    s.seq = ++p.seq;
    s.t = o.t ?? clock.now;
    s.x = x;
    s.y = table.world.heightAt(x, z, o.y);
    s.z = z;
    const view = new DataView(new ArrayBuffer(FLY_MAX));
    table.receive(p.seat, new Uint8Array(view.buffer, 0, encodeFly(view, o.scale ?? table.scale, s)));
  };
  const bite = (p: Player, food: number, amount: number) => {
    const view = new DataView(new ArrayBuffer(64));
    table.receive(p.seat, new Uint8Array(view.buffer, 0, encodeBites(view, ++p.bites, [{ food, amount }])));
  };
  const own = (p: Player, states: readonly FlyState[]) => {
    const view = new DataView(new ArrayBuffer(OWN_MAX));
    table.receive(p.seat, new Uint8Array(view.buffer, 0, encodeOwn(view, table.scale, states)));
  };
  const send = (p: Player, message: ClientMessage) => table.receive(p.seat, JSON.stringify(message));
  /** One beat of the table, SEND_EVERY ms on. */
  const step = (ms = 50) => {
    clock.now += ms;
    clock.wall += ms;
    table.tick();
  };
  return { table, clock, options, hello, join, fly, own, bite, send, step };
}

const clear = (...players: Player[]) => {
  for (const p of players) p.link.sent.length = 0;
};

test("the first to say hello with a start is the starter; the others are welcomed with who is there, each in its id's colour, set down where spawnSpot says", () => {
  const clock = { now: 0, wall: 0 };
  const tables = new Tables({ now: () => clock.now, wall: () => clock.wall });
  const hello = (key: string, start?: TableStart): Hello => ({ type: "hello", v: PROTOCOL, table: CODE, key, start });
  const opened = tables.open("key-1", hello("key-1", START), 7);
  assert.ok(opened instanceof Table);
  // A second start for the same code finds the table as it is: it doesn't start another, nor move it.
  assert.equal(tables.open("key-2", hello("key-2", { ...START, place: "lab" }), 8), opened);
  assert.equal(opened.place, "picnic");
  assert.equal(tables.open("key-3", { ...hello("key-3"), table: "zzzzzzzzzz" }, 9), "unknown");

  const links = [fakeLink(), fakeLink(), fakeLink()];
  const seats = ["key-1", "key-2", "key-3"].map((key, i) => opened.hello(links[i], key, hello(key, i === 0 ? START : undefined)) as Seat);
  assert.deepEqual(seats.map((s) => s.id), [1, 2, 3]);
  const welcomes = links.map((l) => saidOf(l, "welcome")[0]);
  for (const [i, w] of welcomes.entries()) {
    assert.equal(w.starter, 1);
    assert.equal(w.id, i + 1);
    assert.equal(w.colour, COLOURS[i]);
    assert.equal(w.place, "picnic");
    assert.equal(w.seed, 7);
    assert.deepEqual(w.at, spawnSpot(opened.world, i + 1));
    assert.equal(w.foods.length, WORLDS.picnic.patches.length);
  }
  assert.deepEqual(welcomes[0].players, []);
  assert.deepEqual(welcomes[2].players, [{ id: 1, colour: COLOURS[0], away: false, of: 1 }, { id: 2, colour: COLOURS[1], away: false, of: 2 }]);
  // A newcomer is sent the flies already there at once, without waiting for them to move.
  assert.deepEqual(batches(links[0]), []);
  assert.deepEqual(batches(links[2]).map((batch) => batch.map((s) => [s.id, s.x, s.z])), [[1, 2].map((id) => [id, ...onWire(spawnSpot(opened.world, id))])]);
  // Everyone already there is told of each who joins, and nobody of itself.
  assert.deepEqual(saidOf(links[0], "joined").map((m) => m.id), [2, 3]);
  assert.deepEqual(saidOf(links[1], "joined").map((m) => m.id), [3]);
  assert.deepEqual(saidOf(links[2], "joined"), []);
  assert.deepEqual(saidOf(links[0], "joined")[1], { type: "joined", id: 3, colour: COLOURS[2], away: false, of: 3 });
});

test("a fly's states go to everyone else in one batch a beat, the latest of them, and never back to its own device", () => {
  const { table, clock, join, fly, step } = room();
  const a = join("key-1");
  const b = join("key-2");
  const c = join("key-3");
  const [ax, az] = spawnSpot(table.world, 1);
  const [cx, cz] = spawnSpot(table.world, 3);
  // Each newcomer's fly, where it was set down, goes out on the next beat.
  step();
  assert.deepEqual(batches(a).at(-1)?.map((s) => s.id), [2, 3]);
  clear(a, b, c);
  for (let i = 1; i <= 3; i++) fly(a, ax + i * 0.2, az, { t: clock.now + i * 10 });
  fly(c, cx, cz, { t: clock.now + 10 });
  step();
  assert.deepEqual(batches(b).map((batch) => batch.map((s) => [s.id, s.seq])), [[[1, 3], [3, 1]]]);
  assert.deepEqual(batches(a).map((batch) => batch.map((s) => s.id)), [[3]]);
  assert.deepEqual(batches(c).map((batch) => batch.map((s) => s.id)), [[1]]);
  // Nothing new, nothing sent.
  clear(a, b, c);
  step();
  assert.equal(batches(a).length + batches(b).length + batches(c).length, 0);
});

test("a device claiming its fly jumped across the table never has it shown there: the others see it come no faster than a fly walks", () => {
  const { table, clock, join, fly, step } = room();
  const a = join("key-1");
  const b = join("key-2");
  const [sx, sz] = spawnSpot(table.world, 1);
  const far = table.food.foods.find((f) => f.name === "sugar")!;
  assert.ok(Math.hypot(far.x - sx, far.z - sz) > 100, "the sugar is across the table");
  const from = clock.now;
  let states = 0;
  const check = () => {
    for (const batch of batches(b)) {
      for (const s of batch) {
        assert.equal(s.id, 1);
        const came = Math.hypot(s.x - sx, s.z - sz);
        // As far as a fly walks in the time, a little slack a state, and the wire's rounding.
        assert.ok(came <= (MAX_WALK * (clock.now - from)) / 1000 + 0.5 * states + 0.1, `came ${came.toFixed(1)} mm in ${clock.now - from} ms`);
      }
    }
    clear(b);
  };
  // The old spike's hole: after ten states in a row it couldn't take (from the future), it took the next as it came, wherever it said.
  for (let i = 0; i < 10; i++) {
    fly(a, far.x, far.z, { t: clock.now + 5000 });
    step();
    check();
  }
  for (let i = 0; i < 20; i++) {
    fly(a, far.x, far.z, { t: clock.now + 50 });
    states++;
    step();
    check();
  }
  assert.equal(a.seat.shortened, 20);
  assert.ok(Math.hypot(a.seat.flies[0].state.x - far.x, a.seat.flies[0].state.z - far.z) > 40, "still well short of where it claimed");
});

test("a device that disconnects, says it has stopped, or goes silent has its fly shown resting, and it stays", () => {
  const { table, clock, join, fly, send, step } = room();
  const a = join("key-1");
  const b = join("key-2");
  const [bx, bz] = spawnSpot(table.world, 2);
  clear(a, b);

  fly(b, bx, bz, { flags: AWAY, t: clock.now + 10 });
  step();
  fly(b, bx, bz, { t: clock.now + 10 });
  step();
  assert.deepEqual(saidOf(a, "away"), [{ type: "away", id: 2, away: true }, { type: "away", id: 2, away: false }]);
  clear(a);

  // Silent: the starter keeps talking, the other says nothing.
  for (let t = 0; t <= SILENT_AFTER + 200; t += 50) {
    if (t % 1000 === 0) send(a, { type: "ping", t });
    step();
  }
  assert.deepEqual(saidOf(a, "away"), [{ type: "away", id: 2, away: true }]);
  fly(b, bx, bz, { t: clock.now + 10 });
  assert.deepEqual(saidOf(a, "away")[1], { type: "away", id: 2, away: false });
  clear(a);

  table.disconnected(b.seat, b.link);
  assert.deepEqual(saidOf(a, "away"), [{ type: "away", id: 2, away: true }]);
  assert.equal(table.present, 2);
  assert.equal(table.connected, 1);
  assert.deepEqual(saidOf(a, "left"), []);
});

test("a fly away for AWAY_LIMIT leaves; coming back with the same key it has its id, its colour, and its fly where it was", () => {
  const { table, clock, join, fly, step, hello } = room();
  const a = join("key-1");
  const b = join("key-2");
  const [bx, bz] = spawnSpot(table.world, 2);
  for (let i = 1; i <= 4; i++) {
    clock.now += 50;
    fly(b, bx + i, bz);
  }
  const where: Spot = [b.seat.flies[0].state.x, b.seat.flies[0].state.z, b.seat.flies[0].state.yaw, b.seat.flies[0].state.y];
  assert.ok(Math.abs(where[0] - (bx + 4)) < 0.05, "it walked");

  // Back after a moment, claiming its fly is across the table: it is set down where it was.
  const sugar = table.food.foods.find((f) => f.name === "sugar")!;
  table.disconnected(b.seat, b.link);
  clock.wall += 2000;
  const moment = fakeLink();
  table.hello(moment, "key-2", hello("key-2", { at: [[sugar.x, sugar.z, 0]], epoch: table.epoch }));
  assert.deepEqual(saidOf(moment, "welcome")[0].at, where);
  assert.deepEqual(saidOf(a, "away").at(-1), { type: "away", id: 2, away: false }, "woken, not joined again");
  table.disconnected(b.seat, moment);
  clear(a);

  clock.wall += AWAY_LIMIT - 60_000;
  step();
  assert.deepEqual(saidOf(a, "left"), [], "still resting");
  clock.wall += 61_000;
  step();
  assert.deepEqual(saidOf(a, "left"), [{ type: "left", id: 2 }]);
  assert.equal(table.present, 1);

  const again = fakeLink();
  const seat = table.hello(again, "key-2", hello("key-2")) as Seat;
  assert.equal(seat, b.seat);
  const welcome = saidOf(again, "welcome")[0];
  assert.equal(welcome.id, 2);
  assert.equal(welcome.colour, COLOURS[1]);
  assert.deepEqual(welcome.at, where);
  assert.deepEqual(saidOf(a, "joined"), [{ type: "joined", id: 2, colour: COLOURS[1], away: false, of: 2 }]);
});

test("a returning player keeps its colour after others have joined; the table is full at eight, but the seat of someone long gone goes to a newcomer", () => {
  const { table, clock, join, send, step, hello } = room();
  const players = [join("key-1"), join("key-2"), join("key-3")];
  send(players[1], { type: "bye" });
  assert.deepEqual(players[1].link.closed, { code: CLOSE.left, reason: "left" });
  assert.deepEqual(saidOf(players[0].link, "left"), [{ type: "left", id: 2 }]);
  // A newcomer doesn't take the seat of someone who might come back.
  const d = join("key-4");
  assert.equal(d.seat.id, 4);
  assert.equal(d.seat.flies[0].colour, COLOURS[3]);
  const back = join("key-2");
  assert.equal(back.seat.id, 2);
  assert.equal(back.seat.flies[0].colour, COLOURS[1]);

  for (let i = 5; i <= MAX_FLIES; i++) players.push(join(`key-${i}`));
  assert.equal(table.present, MAX_FLIES);
  assert.equal(table.hello(fakeLink(), "key-9", hello("key-9")), "full");
  // Away a moment: still at the table.
  table.disconnected(players[2].seat, players[2].link);
  assert.equal(table.hello(fakeLink(), "key-9", hello("key-9")), "full");
  // Gone: its seat is given up.
  clock.wall += AWAY_LIMIT + 1000;
  step();
  const newcomer = join("key-9");
  assert.equal(newcomer.seat.id, 3);
  assert.equal(newcomer.seat.flies[0].colour, COLOURS[2]);
  assert.equal(table.present, MAX_FLIES);
});

test("only the starter removes a fly: its device is refused and closed, the others are told it left, and its key can't sit down again", () => {
  const { table, join, send, hello } = room();
  const a = join("key-1");
  const b = join("key-2");
  const c = join("key-3");
  clear(a, b, c);
  send(b, { type: "remove", id: 3 });
  send(a, { type: "remove", id: 1 });
  assert.equal(table.seats.size, 3);
  assert.equal(c.link.closed, null);

  send(a, { type: "remove", id: 3 });
  assert.deepEqual(saidOf(c.link, "refused"), [{ type: "refused", reason: "removed" }]);
  assert.deepEqual(c.link.closed, { code: CLOSE.removed, reason: "removed" });
  assert.deepEqual(saidOf(a, "left"), [{ type: "left", id: 3 }]);
  assert.deepEqual(saidOf(b, "left"), [{ type: "left", id: 3 }]);
  assert.equal(table.hello(fakeLink(), "key-3", hello("key-3")), "removed");
  assert.ok(!table.seats.has(3));
});

test("only the starter chooses the light, the weather and the place; a new place moves everyone there, and states from before it are dropped", () => {
  const { table, clock, join, fly, send, step } = room();
  const a = join("key-1");
  const b = join("key-2");
  const c = join("key-3");
  table.disconnected(c.seat, c.link);
  clear(a, b);

  send(b, { type: "world", light: "night" });
  send(b, { type: "place", place: "lab" });
  assert.deepEqual(said(a), []);
  assert.equal(table.worldWire.light, "noon");
  assert.equal(table.place, "picnic");

  send(a, { type: "world", light: "night", weather: "rain" });
  send(a, { type: "world", light: "purple", weather: "snow" });
  for (const p of [a, b]) {
    assert.deepEqual(saidOf(p.link, "world"), [
      { type: "world", light: "night", weather: "rain", offset: 0 },
      { type: "world", light: "night", weather: "rain", offset: 0 },
    ]);
  }

  send(a, { type: "place", place: "nowhere" });
  assert.equal(table.epoch, 0);
  send(a, { type: "place", place: "lab" });
  assert.equal(table.place, "lab");
  assert.equal(table.epoch, 1);
  const lab = new World(LAB);
  for (const p of [a, b]) {
    const [moved] = saidOf(p.link, "place");
    assert.equal(moved.place, "lab");
    assert.equal(moved.epoch, 1);
    assert.deepEqual(moved.foods.map(([id, kind, name, , , , , amount]) => [id, kind, name, amount]), LAB.patches.map((f, i) => [i + 1, "patch", f.name, 1]));
    // Every seat, the resting one too, is set down there.
    assert.deepEqual(moved.spots, { 1: spawnSpot(lab, 1), 2: spawnSpot(lab, 2), 3: spawnSpot(lab, 3) });
  }
  assert.deepEqual(table.food.foods.map((f) => f.name), LAB.patches.map((f) => f.name));

  // The next beat everyone sees everyone else where they were set down, the resting one too.
  step();
  assert.deepEqual(batches(a).map((batch) => batch.map((s) => [s.id, s.x, s.z])), [[2, 3].map((id) => [id, ...onWire(spawnSpot(lab, id))])]);
  const [bx, bz] = spawnSpot(lab, 2);
  clear(a);
  fly(b, bx, bz, { epoch: 0, t: clock.now + 10 });
  step();
  assert.deepEqual(batches(a), [], "a state from the picnic is dropped");
  fly(b, bx + 0.5, bz, { t: clock.now + 10 });
  step();
  assert.deepEqual(batches(a).map((batch) => batch.map((s) => s.id)), [[2]]);
});

test("two flies at the same food never eat more than there was between them, and each is told its own share and the last of its bites counted", () => {
  const { table, clock, join, send, bite, step } = room();
  const a = join("key-1");
  const b = join("key-2");
  const [ax, az] = spawnSpot(table.world, 1);
  const [bx, bz] = spawnSpot(table.world, 2);
  const id = DROP_ID + 1;
  send(a, { type: "drop", id, kind: "sugar", x: (ax + bx) / 2, z: (az + bz) / 2, y: 0, at: clock.now });
  assert.deepEqual(saidOf(b.link, "drop").map((m) => [m.by, m.id, m.kind]), [[1, id, "sugar"]]);
  const sugar = table.food.find(id)!;
  for (const [x, z] of [[ax, az], [bx, bz]]) assert.ok(Math.hypot(sugar.x - x, sugar.z - z) < sugar.r + 4, "both within reach");

  const told = { 1: [] as Message<"food">[], 2: [] as Message<"food">[] };
  let ticks = 0;
  while (table.food.find(id) && ticks++ < 200) {
    // One eats as fast as a fly can, the other half as fast; both ask for it every beat.
    bite(a, id, EAT_RATE * 0.05);
    bite(b, id, EAT_RATE * 0.025);
    clear(a, b);
    step();
    for (const p of [a, b]) {
      for (const m of saidOf(p.link, "food")) {
        assert.equal(m.ack, p.bites);
        assert.equal(m.eaten, Math.round((table.food.eaten.get(p.seat.id) ?? 0) * 1e4) / 1e4);
        told[p.seat.id as 1 | 2].push(m);
      }
    }
  }
  step();
  step();
  for (const p of [a, b]) told[p.seat.id as 1 | 2].push(...saidOf(p.link, "food"));
  assert.equal(table.food.find(id), null, "eaten up");
  assert.ok(told[1].some((m) => m.gone.includes(id)) && told[2].some((m) => m.gone.includes(id)), "and everyone is told it is gone");
  const eatenA = told[1].at(-1)!.eaten;
  const eatenB = told[2].at(-1)!.eaten;
  assert.ok(eatenA + eatenB <= 1 + 1e-4, `ate ${eatenA + eatenB} of 1`);
  assert.ok(eatenA + eatenB > 1 - 1e-3);
  assert.ok(eatenA > eatenB * 1.5, `each its own share: ${eatenA} and ${eatenB}`);
});

test("a bite of food out of a fly's reach is refused, and nothing of it is eaten", () => {
  const { table, join, bite, step } = room();
  const a = join("key-1");
  const honey = table.food.foods.find((f) => f.name === "honey")!;
  const [ax, az] = spawnSpot(table.world, 1);
  assert.ok(Math.hypot(honey.x - ax, honey.z - az) > honey.r + 20);
  bite(a, honey.id, 0.01);
  step();
  step();
  assert.equal(honey.amount, 1);
  assert.equal(table.food.refused.far, 1);
  assert.equal(table.food.eaten.get(1) ?? 0, 0);
  assert.equal(a.seat.ack, 1, "counted, though refused");
});

test("a player can't drop food under someone else's name, throw faster than the rate, or have two balls in the air", () => {
  const { table, clock, join, send } = room();
  const a = join("key-1");
  const b = join("key-2");
  clear(a, b);
  const foods = table.food.foods.length;
  send(b, { type: "drop", id: 1 * DROP_ID + 5, kind: "honey", x: 0, z: 0, y: 0, at: clock.now });
  assert.equal(table.food.foods.length, foods);
  assert.deepEqual(saidOf(a.link, "drop"), []);
  send(b, { type: "drop", id: 2 * DROP_ID + 5, kind: "honey", x: 0, z: 0, y: 0, at: clock.now });
  assert.equal(saidOf(a.link, "drop").length, 1, "its own is put down");

  const [perMinute, burst] = LIMITS.throws;
  const ball = (to: number) => ({ type: "ball", at: clock.now, from: [0, 60, 0], via: [0, 20, 0], to: [to, 0, 0] }) as const satisfies ClientMessage;
  for (let i = 1; i <= burst + 2; i++) send(b, ball(i));
  assert.equal(saidOf(a.link, "ball").length, burst);
  // Only the last of them is in the air.
  assert.deepEqual(table.balls.map((x) => [x.by, x.to[0]]), [[2, burst]]);
  clock.now += 60_000 / perMinute + 1;
  send(b, ball(99));
  send(a, ball(50));
  assert.equal(saidOf(a.link, "ball").length, burst + 1);
  assert.deepEqual(table.balls.map((x) => [x.by, x.to[0]]), [[2, 99], [1, 50]]);
});

test("a table kept and restored has its place, its epoch, its seats with their colours and flies, who was removed or left, its food and who ate it", () => {
  const { table, clock, options, join, fly, send, bite, step, hello } = room();
  const a = join("key-1");
  const b = join("key-2");
  join("key-3");
  send(join("key-4"), { type: "bye" });
  send(a, { type: "place", place: "windowsill" });
  send(a, { type: "remove", id: 3 });
  const [ax, az] = spawnSpot(table.world, 1);
  const [bx, bz] = spawnSpot(table.world, 2);
  for (let i = 1; i <= 4; i++) {
    clock.now += 50;
    fly(b, bx + i * 0.5, bz - i * 0.5);
  }
  const id = DROP_ID + 1;
  send(a, { type: "drop", id, kind: "honey", x: (ax + bx) / 2, z: (az + bz) / 2, y: 0, at: clock.now });
  bite(a, id, 0.1);
  step();
  table.disconnected(a.seat, a.link);
  table.disconnected(b.seat, b.link);

  const kept = JSON.parse(JSON.stringify(table.record()));
  clock.wall += 30_000;
  const restored = Table.restore(kept, options);
  assert.equal(restored.place, "windowsill");
  assert.equal(restored.epoch, 1);
  assert.deepEqual([...restored.seats.values()].map((s) => [s.id, s.flies[0].colour, s.present]), [[1, COLOURS[0], true], [2, COLOURS[1], true], [4, COLOURS[3], false]], "the one who said goodbye isn't brought back");
  assert.deepEqual(restored.record(), kept, "kept again, it is the same");
  assert.deepEqual(restored.food.foods.map(toWire), table.food.foods.map(toWire));
  assert.deepEqual([...restored.food.eaten], [...table.food.eaten], "who ate how much, too");
  // A bite travels as a float32.
  assert.ok(Math.abs(restored.food.find(id)!.amount - 0.9) < 1e-6);
  assert.equal(restored.starter?.id, 1);

  const link = fakeLink();
  const seat = restored.hello(link, "key-2", hello("key-2"));
  assert.equal(typeof seat, "object");
  const welcome = saidOf(link, "welcome")[0];
  assert.equal(welcome.id, 2);
  assert.equal(welcome.colour, COLOURS[1]);
  assert.equal(welcome.epoch, 1);
  assert.deepEqual(welcome.at, [b.seat.flies[0].state.x, b.seat.flies[0].state.z, b.seat.flies[0].state.yaw, b.seat.flies[0].state.y]);
  assert.deepEqual(welcome.players, [{ id: 1, colour: COLOURS[0], away: true, of: 1 }]);
  assert.equal(restored.hello(fakeLink(), "key-3", hello("key-3")), "removed");
});

/** Runs a table for `minutes` with its only player keeping its device alive; returns the happenings it was told of. */
function quietFor(start: TableStart, minutes: number, flags: number) {
  const { clock, join, fly, send, step, table } = room(start);
  const a = join("key-1");
  const [x, z, , y] = spawnSpot(table.world, 1);
  const happenings: Message<"happening">[] = [];
  for (let t = 0; t < minutes * 60_000; t += 50) {
    if (t % 1000 === 0) {
      if (flags) fly(a, x, z, { flags, t: clock.now + 10, y });
      else send(a, { type: "ping", t });
    }
    step();
    if (a.link.sent.length > 0) {
      happenings.push(...saidOf(a.link, "happening"));
      clear(a);
    }
  }
  return happenings;
}

test("at the picnic, with nobody at the remote, a visitor comes within a few minutes; in another place, or while someone plays, none does", () => {
  const picnic = quietFor(START, 10, 0);
  assert.ok(picnic.length > 0, "a visitor came");
  assert.ok(picnic[0].at < 1000 + 10 * 60_000);
  assert.deepEqual(quietFor({ ...START, place: "lab" }, 10, 0), []);
  assert.deepEqual(quietFor(START, 10, PLAYING), []);
});

test("in the restaurant, with nobody at the remote, the table says when the ventilation comes on, as long as every device draws from its seed; while someone plays it doesn't", () => {
  const restaurant = quietFor(RESTAURANT_AT, 12, 0);
  assert.ok(restaurant.length > 0, "it came on");
  assert.ok(restaurant.every((h) => h.kind === "ventilation"));
  // A run and a rest are minutes: never two at once.
  for (let i = 1; i < restaurant.length; i++) assert.ok(restaurant[i].at - restaurant[i - 1].at > 4 * 60_000);
  assert.deepEqual(quietFor(RESTAURANT_AT, 12, PLAYING), []);
});

const RESTAURANT_AT: TableStart = { ...START, place: "restaurant" };
const WINDOW_TABLE = TABLE_TOPS.round.top;
/** Rounded on a room's wire. */
const near = (a: number, b: number) => Math.abs(a - b) <= 0.5 / ROOM_SCALE.position + 1e-9;

test("a table started in the restaurant sets everyone down on the window table, and its flies go on the wire at a room's scale", () => {
  const { table, join, step } = room(RESTAURANT_AT);
  assert.equal(table.place, "restaurant");
  assert.equal(table.scale, ROOM_SCALE);
  const a = join("key-1");
  const b = join("key-2");
  for (const [p, id] of [[a, 1], [b, 2]] as const) {
    const { at } = saidOf(p, "welcome")[0];
    assert.deepEqual(at, spawnSpot(table.world, id));
    assert.equal(at[3], WINDOW_TABLE, "on the table, not the floor under it or the ceiling over it");
  }
  clear(a);
  step();
  const [[seen]] = batches(a, ROOM_SCALE);
  const [bx, bz] = spawnSpot(table.world, 2);
  // 760 mm up is past a tabletop's wire: only a room's carries it.
  assert.ok(near(seen.x, bx) && near(seen.z, bz) && near(seen.y, WINDOW_TABLE), JSON.stringify(seen));
});

test("carried to the restaurant and back, a state is read only at its own place's scale: one from before the move is dropped unread", () => {
  const { table, clock, join, fly, send, step } = room();
  const a = join("key-1");
  const b = join("key-2");
  const [px, pz] = spawnSpot(table.world, 2);
  clear(a, b);
  send(a, { type: "place", place: "restaurant" });
  assert.equal(table.epoch, 1);
  assert.equal(table.scale, ROOM_SCALE);
  const [moved] = saidOf(b, "place");
  assert.equal(moved.place, "restaurant");
  assert.ok(Object.values(moved.spots).every((spot) => spot[3] === WINDOW_TABLE));
  const [bx, bz] = moved.spots[2];
  assert.equal(b.seat.flies[0].state.y, WINDOW_TABLE);
  step();
  clear(a);

  // A picnic state still on its way, at the picnic's scale: read at the room's it would be nonsense, and it is never used.
  fly(b, px + 0.5, pz, { epoch: 0, t: clock.now + 10, y: 0, scale: TABLETOP_SCALE });
  step();
  assert.deepEqual(batches(a, ROOM_SCALE), []);
  assert.deepEqual([b.seat.flies[0].state.x, b.seat.flies[0].state.z, b.seat.flies[0].state.y], [bx, bz, WINDOW_TABLE]);
  fly(b, bx + 0.5, bz, { t: clock.now + 10, y: WINDOW_TABLE });
  step();
  const [[seen]] = batches(a, ROOM_SCALE);
  assert.ok(near(seen.x, bx + 0.5) && near(seen.z, bz) && near(seen.y, WINDOW_TABLE) && seen.epoch === 1, JSON.stringify(seen));

  // And back to a tabletop: its own scale again, and a restaurant state dropped.
  send(a, { type: "place", place: "picnic" });
  assert.equal(table.scale, TABLETOP_SCALE);
  const [cx, cz] = spawnSpot(table.world, 2);
  step();
  clear(a);
  fly(b, bx + 1, bz, { epoch: 1, t: clock.now + 10, y: WINDOW_TABLE, scale: ROOM_SCALE });
  step();
  assert.deepEqual(batches(a), []);
  fly(b, cx + 0.5, cz, { t: clock.now + 10 });
  step();
  assert.deepEqual(batches(a).map((batch) => batch.map((s) => [s.id, s.x, s.z])), [[[2, ...onWire([cx + 0.5, cz, 0])]]]);
});

test("coming back after the table moved, a fly is set down where the table has it, not where its device last had it in the place before", () => {
  const { table, clock, join, send, hello } = room();
  const a = join("key-1");
  const b = join("key-2");
  const [px, pz] = spawnSpot(table.world, 2);
  table.disconnected(b.seat, b.link);
  send(a, { type: "place", place: "restaurant" });
  clock.wall += 2000;
  const back = fakeLink();
  table.hello(back, "key-2", hello("key-2", { at: [[px, pz, 0, 0]], epoch: 0 }));
  assert.deepEqual(saidOf(back, "welcome")[0].at, spawnSpot(table.world, 2));

  // In the restaurant, it may come back a step along the table it was on, but not on the floor under it.
  const [bx, bz, yaw] = spawnSpot(table.world, 2);
  for (const [y, at] of [[0, WINDOW_TABLE], [WINDOW_TABLE, WINDOW_TABLE]]) {
    table.disconnected(b.seat, back);
    clock.wall += 2000;
    back.sent.length = 0;
    table.hello(back, "key-2", hello("key-2", { at: [[bx + 3, bz, yaw, y]], epoch: 1 }));
    const welcomed = saidOf(back, "welcome")[0].at;
    assert.equal(welcomed[3], at);
    assert.equal(b.seat.flies[0].state.y, at);
  }
  assert.equal(b.seat.flies[0].state.x, bx + 3, "the step along the table was taken");
});

test("in the restaurant food is dropped onto the surface it falls to, and eaten only by a fly that can reach it there", () => {
  const { table, clock, join, send, bite, step } = room(RESTAURANT_AT);
  const a = join("key-1");
  const b = join("key-2");
  const [ax, az] = spawnSpot(table.world, 1);
  // Under the window table, beside its foot: the floor; on it, the table.
  const ux = RESTAURANT_START.x + 200;
  const uz = RESTAURANT_START.z;
  send(a, { type: "drop", id: DROP_ID + 1, kind: "honey", x: ux, z: uz, y: 0, at: clock.now });
  send(a, { type: "drop", id: DROP_ID + 2, kind: "honey", x: ax + 1, z: az, y: WINDOW_TABLE, at: clock.now });
  assert.deepEqual(saidOf(b, "drop").map((m) => [m.id, m.y]), [[DROP_ID + 1, 0], [DROP_ID + 2, WINDOW_TABLE]]);
  // The fly on the table reaches the honey beside it, and not the honey on the floor, even straight below.
  const floor = table.food.find(DROP_ID + 1)!;
  floor.x = ax + 1;
  floor.z = az;
  bite(a, DROP_ID + 2, 0.1);
  bite(a, DROP_ID + 1, 0.1);
  step(100);
  assert.ok(Math.abs(table.food.find(DROP_ID + 2)!.amount - 0.9) < 1e-6);
  assert.equal(table.food.find(DROP_ID + 1)!.amount, 1);
  assert.equal(table.food.refused.far, 1);
});

test("rooms: only listed ones with someone there are listed, fullest first; a listed room nobody has come to for a day is forgotten, an unlisted one kept as its invitations are", () => {
  const clock = { now: 0, wall: Date.UTC(2026, 5, 1) };
  const tables = new Tables({ now: () => clock.now, wall: () => clock.wall });
  const open = (code: string, key: string, start: TableStart) => tables.open(key, { type: "hello", v: PROTOCOL, table: code, key, start }, 1) as Table;
  const sit = (table: Table, key: string) => table.hello(fakeLink(), key, { type: "hello", v: PROTOCOL, table: table.code, key }) as Seat;
  const quiet = open("aaaaaaaaaa", "k1", { ...START, name: "Quiet", listed: true });
  const busy = open("bbbbbbbbbb", "k2", { ...START, place: "bar", name: "Busy", listed: true });
  const hidden = open("cccccccccc", "k3", { ...START, name: "Hidden" });
  const empty = open("dddddddddd", "k4", { ...START, name: "Empty", listed: true });
  sit(quiet, "k1");
  for (const key of ["k2", "k5", "k6"]) sit(busy, key);
  sit(hidden, "k3");
  assert.deepEqual(tables.listed(), [
    { code: "bbbbbbbbbb", name: "Busy", place: "bar", flies: 3, locked: false },
    { code: "aaaaaaaaaa", name: "Quiet", place: "picnic", flies: 1, locked: false },
  ]);
  assert.equal(empty.name, "Empty");
  // A table from before rooms had names is still one, unlisted, under a name of its own.
  assert.equal(open("eeeeeeeeee", "k7", START).name, UNNAMED);

  for (const table of [quiet, busy, hidden]) for (const seat of table.seats.values()) table.disconnected(seat, seat.link!);
  clock.wall += LISTED_IDLE + 60_000;
  tables.tick();
  assert.deepEqual([...tables.values()].map((t) => t.code).sort(), ["cccccccccc", "eeeeeeeeee"]);
  clock.wall += TABLE_IDLE;
  tables.tick();
  assert.equal(tables.size, 0);
});

test("a room's name, whether it is listed, and its lock are kept across a restart", () => {
  const { table, options } = room({ ...START, name: "Kept", listed: true });
  const locked = new Table("ffffffffff", { ...START, name: "Locked" }, "key-1", 3, options, undefined, { salt: "c2FsdA", hash: "aGFzaA" });
  for (const t of [table, locked]) {
    const back = Table.restore(JSON.parse(JSON.stringify(t.record())) as TableRecord, options);
    assert.deepEqual(back.info, t.info);
    assert.deepEqual(back.lock, t.lock);
  }
  assert.deepEqual(locked.info, { name: "Locked", listed: false, locked: true });
});

function nextStates(p: Player, now: number, flags = 0): FlyState[] {
  return p.seat.flies.map(({ state }) => ({ ...state, t: now, seq: state.seq + 1, flags, pose: { ...state.pose }, hand: { ...state.hand } }));
}

const seated = (p: Player) => p.seat.flies.map((f) => ({ id: f.id, colour: f.colour, at: [f.state.x, f.state.z, f.state.yaw, f.state.y] }));

test("several flies share one device: welcome, joins and relayed batches identify each fly and its owner, without echoing any of its own", () => {
  const { table, clock, join, own, step } = room();
  const a = join("key-1", { flies: 3 });
  const b = join("key-2", { flies: 2 });
  assert.deepEqual(a.seat.flies.map((f) => [f.id, f.colour]), [[1, COLOURS[0]], [2, COLOURS[1]], [3, COLOURS[2]]]);
  assert.deepEqual(b.seat.flies.map((f) => f.id), [4, 5]);
  for (const p of [a, b]) {
    const w = saidOf(p, "welcome")[0];
    assert.deepEqual(w.flies, seated(p));
    assert.equal(w.id, p.seat.id);
    assert.equal(w.colour, w.flies[0].colour);
    assert.deepEqual(w.at, w.flies[0].at);
    for (const f of w.flies) assert.deepEqual(f.at, spawnSpot(table.world, f.id));
  }
  assert.equal(table.present, 5);
  assert.equal(table.connected, 2);
  assert.equal(table.room().flies, 5);
  assert.deepEqual(saidOf(a, "joined"), b.seat.flies.map((f) => ({ type: "joined", id: f.id, colour: f.colour, away: false, of: b.seat.id })));
  assert.deepEqual(saidOf(b, "welcome")[0].players, a.seat.flies.map((f) => ({ id: f.id, colour: f.colour, away: false, of: a.seat.id })));
  step();
  clear(a, b);
  const states = nextStates(a, clock.now + 10).reverse();
  for (const s of states) s.x += s.id * 0.1;
  own(a, states);
  own(b, nextStates(b, clock.now + 10));
  step();
  assert.deepEqual(batches(b).map((batch) => batch.map((s) => [s.id, s.seq])), [[[1, 1], [2, 1], [3, 1]]]);
  for (const state of batches(b)[0]) assert.ok(Math.abs(state.x - states.find((s) => s.id === state.id)!.x) < 0.02);
  assert.deepEqual(batches(a).map((batch) => batch.map((s) => s.id)), [[4, 5]]);
});

test("a device cannot send a state for another device's fly, even alongside valid states of its own", () => {
  const { table, clock, join, own, step } = room();
  const a = join("key-1", { flies: 2 });
  const b = join("key-2", { flies: 2 });
  step();
  clear(a, b);
  const foreign = nextStates(b, clock.now + 10)[1];
  foreign.x += 1;
  const before = { ...b.seat.flies[1].state };
  own(a, [foreign]);
  step();
  assert.deepEqual(b.seat.flies[1].state, before);
  assert.deepEqual(batches(a), []);
  assert.deepEqual(batches(b), []);
  own(a, [foreign, nextStates(a, clock.now + 10)[1]]);
  step();
  assert.deepEqual(b.seat.flies[1].state, before);
  assert.deepEqual(batches(b).map((batch) => batch.map((s) => s.id)), [[2]]);
  assert.equal(table.seatOf(foreign.id), b.seat);
});

test("eight fly ids fill the table regardless of device count; newcomers get as many flies as fit", () => {
  const { table, join, hello } = room();
  join("key-1", { flies: MAX_OWN });
  const b = join("key-2", { flies: MAX_OWN });
  assert.deepEqual(b.seat.flies.map((f) => f.id), [5, 6, 7, 8]);
  assert.equal(table.present, MAX_FLIES);
  assert.equal(table.hello(fakeLink(), "key-3", hello("key-3")), "full");

  const partial = room();
  partial.join("key-1", { flies: 4 });
  partial.join("key-2");
  const last = partial.join("key-3", { flies: 4 });
  assert.deepEqual(last.seat.flies.map((f) => f.id), [6, 7, 8]);
  assert.equal(saidOf(last, "welcome")[0].flies.length, 3);
  assert.equal(partial.table.present, MAX_FLIES);
});

test("hello fly counts default to one, clamp to MAX_OWN and use whole flies", () => {
  for (const [flies, count] of [[undefined, 1], [0, 1], [-5, 1], [2.9, 2], [1000, MAX_OWN], [NaN, 1], [Infinity, 1]] as const) {
    const { table, join } = room();
    const p = join("key-1", { flies });
    assert.equal(p.seat.flies.length, count, String(flies));
    assert.equal(table.present, count);
    assert.equal(saidOf(p, "welcome")[0].flies.length, count);
  }
});

test("a seated device recounts up and down: seated lists its flies and others hear only new joins and trailing departures, capped by free ids", () => {
  const { table, join, send } = room();
  const a = join("key-1", { flies: 2 });
  const b = join("key-2", { flies: 4 });
  const c = join("key-3");
  const first = a.seat.flies[0];
  clear(a, b, c);
  send(a, { type: "flies", count: 4 });
  assert.deepEqual(a.seat.flies.map((f) => f.id), [1, 2, 8]);
  assert.deepEqual(saidOf(a, "seated"), [{ type: "seated", flies: seated(a), asked: 4 }]);
  for (const p of [b, c]) assert.deepEqual(saidOf(p, "joined"), [{ type: "joined", id: 8, colour: COLOURS[7], away: false, of: 1 }]);
  assert.deepEqual(saidOf(a, "joined"), []);
  assert.equal(table.present, 8);
  clear(a, b, c);
  send(a, { type: "flies", count: 1 });
  assert.deepEqual(saidOf(a, "seated"), [{ type: "seated", flies: seated(a), asked: 1 }]);
  assert.equal(a.seat.flies[0], first);
  for (const p of [b, c]) assert.deepEqual(saidOf(p, "left"), [{ type: "left", id: 8 }, { type: "left", id: 2 }]);
  assert.deepEqual(saidOf(a, "left"), []);
  clear(a, b, c);
  send(a, { type: "flies", count: 4 });
  assert.deepEqual(a.seat.flies.map((f) => f.id), [1, 2, 8]);
  send(a, { type: "flies", count: 0 });
  assert.equal(a.seat.flies.length, 1);
  assert.equal(table.seatOf(2), null);
  assert.equal(table.present, 6);
});

test("fly recounts have an allowance of their own: the starter's changes never use it up, and one past it goes unanswered until it refills", () => {
  const { clock, join, send } = room();
  const a = join("key-1");
  // The starter spends every change it has on the light: a recount is still answered.
  for (let i = 0; i < LIMITS.changes[1] + 2; i++) send(a, { type: "world", light: i % 2 ? "noon" : "dusk" });
  clear(a);
  send(a, { type: "flies", count: 2 });
  assert.deepEqual(saidOf(a, "seated"), [{ type: "seated", flies: seated(a), asked: 2 }]);
  const [perMinute, burst] = LIMITS.recounts;
  for (let i = 1; i < burst; i++) send(a, { type: "flies", count: i % 2 ? 2 : 1 });
  clear(a);
  send(a, { type: "flies", count: 4 });
  assert.equal(a.seat.flies.length, 2);
  assert.deepEqual(saidOf(a, "seated"), [], "dropped, and not answered: the device asks again");
  clock.now += 60_000 / perMinute;
  send(a, { type: "flies", count: 4 });
  assert.equal(a.seat.flies.length, 4);
  assert.deepEqual(saidOf(a, "seated"), [{ type: "seated", flies: seated(a), asked: 4 }]);
});

test("a starter who leaves keeps one seat, not four: their others are given up when needed, the list counts the seat kept, and they come back to what is free", () => {
  const clock = { now: 0, wall: Date.UTC(2026, 5, 1) };
  const tables = new Tables({ now: () => clock.now, wall: () => clock.wall });
  const table = tables.open("key-s", { type: "hello", v: PROTOCOL, table: CODE, key: "key-s", start: { ...START, name: "Ours", listed: true } }, 1) as Table;
  const sit = (key: string, flies = 1) => table.hello(fakeLink(), key, { type: "hello", v: PROTOCOL, table: CODE, key, flies });
  const starter = sit("key-s", 4) as Seat;
  assert.deepEqual(starter.flies.map((f) => f.id), [1, 2, 3, 4]);
  table.receive(starter, JSON.stringify({ type: "bye" } satisfies ClientMessage));
  for (const key of ["key-a", "key-b", "key-c", "key-d"]) assert.equal(typeof sit(key), "object");
  assert.equal(table.present, 4);
  // Four flies there, and the starter's four seats held until someone needs them: the list says five are taken, the one the starter keeps among them.
  assert.equal(table.room().flies, 5);
  assert.deepEqual(tables.listed().map((r) => r.flies), [5]);
  const e = sit("key-e") as Seat;
  assert.equal(typeof e, "object", "not refused as full");
  assert.deepEqual(e.flies.map((f) => f.id), [2]);
  assert.deepEqual(starter.flies.map((f) => f.id), [1], "the starter keeps their first fly's seat and colour");
  assert.equal(table.room().flies, 6);
  const back = sit("key-s", 4) as Seat;
  assert.equal(back, starter);
  assert.deepEqual(back.flies.map((f) => f.id), [1, 3, 4], "back, as many as are free");
  assert.equal(table.room().flies, 8);
  assert.equal(sit("key-f"), "full");
});

test("a starter gone after a long time away keeps one seat too, and a seat still on the line is never given up", () => {
  const { table, clock, join, hello, step } = room();
  const s = join("key-1", { flies: 4 });
  const others = ["key-2", "key-3", "key-4", "key-5"].map((key) => join(key));
  table.disconnected(s.seat, s.link);
  clock.wall += AWAY_LIMIT + 1000;
  step();
  assert.equal(s.seat.present, false);
  for (const p of others) table.receive(p.seat, JSON.stringify({ type: "ping", t: 0 } satisfies ClientMessage));
  assert.equal(table.room().flies, 5);
  const late = table.hello(fakeLink(), "key-6", hello("key-6", { flies: 4 })) as Seat;
  assert.deepEqual(late.flies.map((f) => f.id), [2, 3, 4]);
  assert.equal(table.room().flies, 8);
  assert.equal(table.hello(fakeLink(), "key-7", hello("key-7")), "full");
});

test("removing any one of a device's flies removes all of them and bans its key", () => {
  const { table, join, send, hello } = room();
  const a = join("key-1", { flies: 2 });
  const b = join("key-2", { flies: 3 });
  const c = join("key-3");
  clear(a, b, c);
  send(b, { type: "remove", id: a.seat.flies[1].id });
  send(a, { type: "remove", id: a.seat.flies[1].id });
  assert.equal(table.seats.size, 3, "the starter cannot be removed, even by its second fly");
  const ids = b.seat.flies.map((f) => f.id);
  send(a, { type: "remove", id: ids[1] });
  assert.deepEqual(saidOf(b, "refused"), [{ type: "refused", reason: "removed" }]);
  assert.deepEqual(b.link.closed, { code: CLOSE.removed, reason: "removed" });
  for (const p of [a, c]) assert.deepEqual(saidOf(p, "left"), ids.map((id) => ({ type: "left", id })));
  for (const id of ids) assert.equal(table.seatOf(id), null);
  assert.equal(table.present, 3);
  assert.equal(table.hello(fakeLink(), "key-2", hello("key-2", { flies: 3 })), "removed");
});

test("reconnecting keeps every fly's id and colour and checks each returning spot separately", () => {
  const { table, clock, join, hello } = room();
  const a = join("key-1");
  const b = join("key-2", { flies: 3 });
  const before = seated(b);
  table.disconnected(b.seat, b.link);
  clock.wall += 2000;
  const at: Spot[] = before.map((f, i) => [f.at[0] + (i === 1 ? 250 : 2), f.at[1], f.at[2], f.at[3]]);
  clear(a);
  const back = fakeLink();
  assert.equal(table.hello(back, "key-2", hello("key-2", { flies: 3, at, epoch: table.epoch })), b.seat);
  const w = saidOf(back, "welcome")[0];
  assert.deepEqual(w.flies, before.map((f, i) => ({ ...f, at: i === 1 ? f.at : at[i] })));
  assert.deepEqual(saidOf(a, "away"), before.map((f) => ({ type: "away", id: f.id, away: false })));
  assert.deepEqual(saidOf(a, "joined"), []);
  // A reload that brings fewer flies keeps its leading ids and gives up only the tail.
  clear(a);
  const reload = fakeLink();
  table.hello(reload, "key-2", hello("key-2", { flies: 2 }));
  assert.deepEqual(back.closed, { code: CLOSE.elsewhere, reason: "elsewhere" });
  assert.deepEqual(saidOf(reload, "welcome")[0].flies.map((f) => [f.id, f.colour]), before.slice(0, 2).map((f) => [f.id, f.colour]));
  assert.deepEqual(saidOf(a, "left"), [{ type: "left", id: before[2].id }]);
});

test("stopping, silence and disconnecting put each of a device's flies to rest; long absence removes each", () => {
  const { table, clock, join, own, send, step } = room();
  const a = join("key-1");
  const b = join("key-2", { flies: 3 });
  const ids = b.seat.flies.map((f) => f.id);
  step();
  clear(a, b);
  own(b, nextStates(b, clock.now + 10, AWAY));
  step();
  assert.deepEqual(saidOf(a, "away"), ids.map((id) => ({ type: "away", id, away: true })));
  assert.ok(batches(a)[0].every((s) => s.flags & AWAY));
  clear(a, b);
  own(b, nextStates(b, clock.now + 10));
  assert.deepEqual(saidOf(a, "away"), ids.map((id) => ({ type: "away", id, away: false })));
  clear(a, b);
  clock.now += SILENT_AFTER + 1;
  send(a, { type: "ping", t: clock.now });
  table.tick();
  assert.deepEqual(saidOf(a, "away"), ids.map((id) => ({ type: "away", id, away: true })));
  clear(a, b);
  own(b, nextStates(b, clock.now + 10));
  clear(a, b);
  table.disconnected(b.seat, b.link);
  assert.deepEqual(saidOf(a, "away"), ids.map((id) => ({ type: "away", id, away: true })));
  assert.equal(table.present, 4);
  clock.wall += AWAY_LIMIT + 1;
  step();
  assert.deepEqual(saidOf(a, "left"), ids.map((id) => ({ type: "left", id })));
  assert.equal(table.present, 1);
});

test("a gone device's multiple flies are reclaimed together, oldest first, while the starter's ids stay reserved", () => {
  const { table, clock, join, send } = room();
  const a = join("key-1", { flies: 2 });
  const b = join("key-2", { flies: 3 });
  const c = join("key-3", { flies: 2 });
  send(a, { type: "bye" });
  send(b, { type: "bye" });
  clock.wall += 1000;
  send(c, { type: "bye" });
  const d = join("key-4", { flies: 2 });
  assert.deepEqual(d.seat.flies.map((f) => f.id), [3, 4]);
  assert.ok([...table.seats.values()].every((seat) => seat !== b.seat));
  assert.equal(table.seatOf(5), null, "the unused third id of the reclaimed seat is free too");
  assert.equal(table.seats.get(a.seat.id), a.seat);
  assert.equal(table.seats.get(c.seat.id), c.seat);
  assert.equal(table.present, 2);
});

test("a record round trip preserves multiple flies, their positions and airborne state; an old single-fly record still loads", () => {
  const { table, clock, options, join, own, hello } = room();
  const a = join("key-1", { flies: 3 });
  clock.now += 50;
  const states = nextStates(a, clock.now);
  for (const [i, s] of states.entries()) {
    s.x += i * 0.5;
    s.yaw = i * 0.5;
    if (i === 1) { s.flags = AIRBORNE; s.y += 5; }
  }
  own(a, states);
  const kept = JSON.parse(JSON.stringify(table.record())) as TableRecord;
  assert.deepEqual(kept.seats[0].flies?.map((f) => [f.id, f.airborne]), [[1, false], [2, true], [3, false]]);
  const restored = Table.restore(kept, options);
  assert.deepEqual(restored.record(), kept);
  assert.ok(restored.seats.get(1)!.flies.every((f) => f.state.flags & AWAY));
  const back = fakeLink();
  restored.hello(back, "key-1", hello("key-1", { flies: 3 }));
  assert.deepEqual(saidOf(back, "welcome")[0].flies.map((f) => [f.id, f.colour]), seated(a).map((f) => [f.id, f.colour]));

  const legacy: TableRecord = { ...kept, seats: [{ id: 5, key: "old-key", at: [12, 0, 34, 0.75], airborne: false, lastSeen: clock.wall }] };
  const old = Table.restore(legacy, options);
  const oldSeat = old.seats.get(5)!;
  assert.equal(oldSeat.flies.length, 1);
  assert.deepEqual([oldSeat.flies[0].state.x, oldSeat.flies[0].state.y, oldSeat.flies[0].state.z, oldSeat.flies[0].state.yaw], [12, 0, 34, 0.75]);
  const oldLink = fakeLink();
  old.hello(oldLink, "old-key", hello("old-key"));
  assert.deepEqual(saidOf(oldLink, "welcome")[0].flies, [{ id: 5, colour: COLOURS[4], at: [12, 34, 0.75, 0] }]);
});

test("bites are credited to the device when a trailing fly reaches food, at the appetite of all its flies", () => {
  const { table, clock, join, send, bite, step } = room();
  const a = join("key-1", { flies: 3 });
  const last = a.seat.flies[2].state;
  const first = a.seat.flies[0].state;
  const id = DROP_ID + 1;
  send(a, { type: "drop", id, kind: "honey", x: last.x, z: last.z, y: last.y, at: clock.now });
  const food = table.food.find(id)!;
  food.r = 0.1;
  assert.ok(Math.hypot(food.x - first.x, food.z - first.z) > food.r + 4);
  // One fly cannot eat two seconds' worth at once; three can from their stored appetite.
  bite(a, id, EAT_RATE * 2);
  assert.ok(Math.abs(table.food.eaten.get(a.seat.id)! - EAT_RATE * 2) < 1e-6);
  assert.equal(table.food.eaten.has(last.id), false);
  step(100);
  assert.equal(saidOf(a, "food").at(-1)?.ack, 1);
});

test("a clear request removes only the sender's offerings and broadcasts gone ids; stale epochs do nothing", () => {
  const { table, join, send, step, clock } = room();
  const a = join("key-1"), b = join("key-2");
  const mine = DROP_ID + 1, theirs = 2 * DROP_ID + 1;
  send(a, { type: "drop", id: mine, kind: "honey", x: 0, z: 0, y: 0, at: clock.now });
  send(b, { type: "drop", id: theirs, kind: "water", x: 0, z: 0, y: 0, at: clock.now });
  const patches = table.food.foods.filter((f) => f.kind === "patch").map((f) => f.id);
  send(a, { type: "clearFood", epoch: table.epoch + 1 });
  assert.ok(table.food.find(mine), "a delayed request for another place is ignored");
  send(b, { type: "clearFood", epoch: table.epoch });
  assert.ok(table.food.find(mine), "the starter's offering is not the guest's to clear");
  assert.equal(table.food.find(theirs), null);
  step(150);
  for (const player of [a, b]) assert.ok(saidOf(player, "food").some((m) => m.gone.includes(theirs)), "both devices hear the room's removal");
  send(a, { type: "clearFood", epoch: table.epoch });
  assert.equal(table.food.find(mine), null);
  assert.deepEqual(table.food.foods.map((f) => f.id), patches);
});

test("a multi-fly device's FLY batch is read whole before any of it is used: cut short, a fly twice, or more than a device brings, none of it is taken", () => {
  const { table, clock, join, own, step } = room();
  const a = join("key-1", { flies: 3 });
  const b = join("key-2");
  step();
  clear(a, b);
  const before = a.seat.flies.map((f) => ({ ...f.state }));
  const send = (bytes: Uint8Array) => table.receive(a.seat, bytes);
  const encode = (states: readonly FlyState[]) => {
    const view = new DataView(new ArrayBuffer(2 + 8 * 64));
    return new Uint8Array(view.buffer, 0, encodeOwn(view, table.scale, states));
  };
  const moved = () => {
    const states = nextStates(a, clock.now + 10);
    for (const s of states) s.x += 0.5;
    return states;
  };
  // Cut short in its last fly: the first two, whole, aren't taken either.
  const whole = encode(moved());
  send(whole.slice(0, whole.length - 5));
  // A fly twice: one could take two steps for it in one message.
  const twice = moved();
  send(encode([twice[0], { ...twice[0], seq: twice[0].seq + 1, t: twice[0].t + 1, x: twice[0].x + 0.5 }]));
  // More than any device brings, every one its own.
  send(encode([...moved(), ...moved().map((s) => ({ ...s, seq: s.seq + 1, t: s.t + 1 }))].slice(0, MAX_OWN + 1)));
  // Ids no fly at a table has.
  send(encode(moved().map((s, i) => ({ ...s, id: i === 0 ? 0 : 200 }))));
  assert.deepEqual(a.seat.flies.map((f) => f.state), before);
  step();
  assert.deepEqual(batches(b), [], "nothing of them reached anyone");
  // The same states, whole and once each, are taken.
  own(a, moved());
  step();
  assert.deepEqual(batches(b).map((batch) => batch.map((s) => s.id)), [[1, 2, 3]]);
});

test("each of a device's flies is read at the room time nearest it past the u32 wrap, and by its own epoch", () => {
  const { table, clock, join, own } = room();
  clock.now = 2 ** 32 - 1000;
  const a = join("key-1", { flies: 2 });
  for (let i = 0; i < 40; i++) {
    clock.now += 50;
    const states = nextStates(a, clock.now);
    // A whole number of the wire's 1/50 mm, so nothing is lost to rounding.
    for (const s of states) s.x += 0.1;
    // The second fly's state names a place the table has left: only the first moves.
    states[1].epoch = (table.epoch + 1) & 0xff;
    own(a, states);
  }
  assert.ok(clock.now > 2 ** 32);
  const [first, second] = a.seat.flies.map((f) => f.state);
  assert.ok(Math.abs(first.t - clock.now) < 1, "its time is the room's, past 2^32");
  assert.ok(Math.abs(first.x - (spawnSpot(table.world, 1)[0] + 40 * 0.1)) < 0.05, `not stuck at the wrap: ${first.x - spawnSpot(table.world, 1)[0]}`);
  assert.deepEqual([second.x, second.z], spawnSpot(table.world, 2).slice(0, 2), "a state from another place moves nothing");
});

test("hostile counts and spots in a hello or a recount from a multi-fly device seat 1 to MAX_OWN flies, each where the table has it", () => {
  const { table, join, send, hello } = room();
  const a = join("key-1", { flies: 3 });
  const spots = a.seat.flies.map((f) => [f.state.x, f.state.z, f.state.yaw, f.state.y]);
  for (const count of ["4", null, -3, 1e9, Infinity, { length: 4 }, [4]] as unknown[]) {
    send(a, { type: "flies", count } as ClientMessage);
    const n = typeof count === "number" && Number.isFinite(count) ? Math.max(1, Math.min(MAX_OWN, count)) : 1;
    assert.equal(a.seat.flies.length, n, `count ${JSON.stringify(count)}`);
    assert.equal(saidOf(a, "seated").at(-1)?.asked, n);
  }
  send(a, { type: "flies", count: 3 });
  // Back with nonsense for where its flies are: a spot far off, the wrong shape, one spot as a device with one fly once said, too many, none of them numbers.
  for (const at of [[[1e6, 0, 0, 0], [0, 0], "x"], [0, 0, 0, 0], Array.from({ length: 1000 }, () => [NaN, 0, 0]), "here", { 0: [0, 0, 0] }] as unknown[]) {
    const link = fakeLink();
    const seat = table.hello(link, "key-1", { ...hello("key-1", { flies: 3, epoch: table.epoch }), at } as Hello) as Seat;
    assert.deepEqual(seat.flies.map((f) => [f.state.x, f.state.z, f.state.yaw, f.state.y]), spots, `at ${JSON.stringify(at).slice(0, 40)}`);
    assert.deepEqual(saidOf(link, "welcome")[0].flies.map((f) => f.at), spots);
  }
});

test("clearing dropped food from a multi-fly device clears that device's drops only, named by its player id, and only in the place it names", () => {
  const { table, join, send, step, clock } = room();
  const a = join("key-1", { flies: 3 });
  const b = join("key-2", { flies: 2 });
  assert.equal(b.seat.id, 4);
  const mine = b.seat.id * DROP_ID + 1;
  const theirs = a.seat.id * DROP_ID + 1;
  // Under another of its own flies' ids is not its name: only its player's.
  send(b, { type: "drop", id: 5 * DROP_ID + 1, kind: "honey", x: 0, z: 0, y: 0, at: clock.now, epoch: table.epoch });
  assert.equal(table.food.find(5 * DROP_ID + 1), null);
  send(b, { type: "drop", id: mine, kind: "honey", x: 0, z: 0, y: 0, at: clock.now, epoch: table.epoch });
  send(a, { type: "drop", id: theirs, kind: "water", x: 0, z: 0, y: 0, at: clock.now, epoch: table.epoch });
  send(b, { type: "clearFood", epoch: (table.epoch + 1) & 0xff });
  assert.ok(table.food.find(mine), "a clear from a place the table has left does nothing");
  send(b, { type: "clearFood", epoch: table.epoch });
  assert.equal(table.food.find(mine), null);
  assert.ok(table.food.find(theirs));
  step(150);
  for (const p of [a, b]) assert.ok(saidOf(p, "food").some((m) => m.gone.includes(mine)));
});

test("found food deadlines survive a saved idle room and are gone on welcome", () => {
  const { table, clock, join, send, options } = room();
  const a = join("key-1");
  send(a, { type: "found", id: 900000001, name: "strawberry juice", x: 20, z: 20, y: 0, r: 1, sweet: 0.8, lasts: 10, epoch: table.epoch });
  const saved = table.record();
  assert.equal(saved.foodExpires?.length, 1);
  clock.wall += 10001;
  const restored = new Table(CODE, START, "key-1", 7, options, saved);
  const link = fakeLink();
  restored.hello(link, "key-1", { type: "hello", v: PROTOCOL, table: CODE, key: "key-1" });
  assert.ok(!saidOf(link, "welcome")[0].foods.some((f) => f[0] === 900000001));
  assert.ok(!restored.record().foods.some((f) => f[0] === 900000001));
  assert.deepEqual(restored.record().foodExpires, []);
  clock.wall += 1000;
  assert.ok(!table.record().foods.some((f) => f[0] === 900000001), "a room that never ticked expires before its next save");
});

test("a live idle room clears expired food before another welcome", () => {
  const { table, clock, join, send } = room();
  const a = join("key-1");
  send(a, { type: "found", id: 900000001, name: "juice", x: 20, z: 20, y: 0, r: 1, sweet: 0.8, lasts: 10 });
  clock.wall += 10001;
  const b = join("key-2");
  assert.ok(!saidOf(b, "welcome")[0].foods.some((f) => f[0] === 900000001));
  assert.equal(table.food.find(900000001), null);
});

test("a replacement found food is announced after the previous lifetime's removal", () => {
  const { table, clock, join, send, step } = room();
  const a = join("key-1");
  const b = join("key-2");
  const found: ClientMessage = { type: "found", id: 900000001, name: "juice", x: 20, z: 20, y: 0, r: 1, sweet: 0.8, lasts: 10 };
  send(a, found);
  clear(b);
  clock.wall += 10001;
  table.food.update(0);
  send(a, found);
  step(100);
  const messages = said(b);
  const gone = messages.findIndex((m) => m.type === "food" && m.gone.includes(found.id));
  const replacement = messages.findIndex((m) => m.type === "found" && m.food[0] === found.id);
  assert.ok(gone >= 0 && replacement > gone);
  assert.ok(!messages.slice(replacement).some((m) => m.type === "food" && m.gone.includes(found.id)));
  assert.ok(table.food.find(found.id));
});

test("refused bites are acknowledged and exact nutrition is delivered once", () => {
  const { table, join, bite, step } = room();
  const a = join("key-1");
  const p = a.seat.flies[0].state;
  const food = table.food.drop(a.seat.id, DROP_ID + 1, "berry", p.x, p.z, p.y)!;
  table.food.flush();
  clear(a);
  bite(a, food.id, 0.9);
  step(100);
  const refused = saidOf(a, "food").at(-1)!;
  assert.ok(refused);
  assert.equal(refused.ack, 1);
  assert.deepEqual(refused.meal, [0, 0]);
  assert.ok(refused.amounts.some(([id, amount]) => id === food.id && amount === 1));
  clear(a);
  bite(a, food.id, 0.1);
  step(100);
  const accepted = saidOf(a, "food").at(-1)!;
  assert.equal(accepted.ack, 2);
  assert.ok(Math.abs(accepted.meal![0] - 0.1) < 1e-6);
  assert.ok(Math.abs(accepted.meal![1] - 0.08) < 1e-6);
  bite(a, 99999999, 0.1);
  step(100);
  const missing = saidOf(a, "food").at(-1)!;
  assert.equal(missing.ack, 3);
  assert.deepEqual(missing.gone, []);
  assert.deepEqual(missing.meal, [0, 0]);
});

test("many unknown-food refusals cannot overflow acknowledgements or lose another player's nutrition", () => {
  const { table, join, bite, step } = room();
  const a = join("key-1");
  const b = join("key-2");
  const p = b.seat.flies[0].state;
  const food = table.food.drop(b.seat.id, 2 * DROP_ID + 1, "berry", p.x, p.z, p.y)!;
  table.food.flush(); clear(a, b);
  for (let packet = 0; packet < 7; packet++) {
    const view = new DataView(new ArrayBuffer(256));
    const bites = Array.from({ length: 16 }, (_, i) => ({ food: 900100000 + packet * 16 + i, amount: 0.01 }));
    const length = encodeBites(view, packet + 1, bites);
    table.receive(a.seat, new Uint8Array(view.buffer, 0, length));
  }
  bite(b, food.id, 0.1); step(100);
  const message = saidOf(b, "food").at(-1)!;
  assert.ok(message);
  assert.equal(message.gone.length, 0);
  assert.ok(Math.abs(message.meal![1] - 0.08) < 1e-6);
});

test("a multi-fly device's bites are acknowledged and its meal delivered once, whichever of its flies reached the food", () => {
  const { table, join, bite, step } = room();
  const a = join("key-1", { flies: 3 });
  const p = a.seat.flies[2].state;
  const food = table.food.drop(a.seat.id, DROP_ID + 1, "berry", p.x, p.z, p.y)!;
  table.food.flush();
  clear(a);
  bite(a, food.id, 0.1);
  step(100);
  const accepted = saidOf(a, "food").at(-1)!;
  assert.equal(accepted.ack, 1);
  assert.ok(Math.abs(accepted.meal![0] - 0.1) < 1e-6);
  clear(a);
  step(100);
  assert.ok(saidOf(a, "food").every((m) => !m.meal || m.meal[0] === 0), "the meal is not told twice");
});

test("expiry replacement flushes pending bite receipts exactly once", () => {
  const { table, clock, join, send, bite, step } = room();
  const a = join("key-1");
  const p = a.seat.flies[0].state;
  const food = table.food.drop(a.seat.id, DROP_ID + 1, "berry", p.x, p.z, p.y)!;
  const found: ClientMessage = { type: "found", id: 900000001, name: "juice", x: 20, z: 20, y: 0, r: 1, sweet: 0.8, lasts: 10, epoch: table.epoch };
  send(a, found);
  clear(a);
  clock.wall += 10001;
  bite(a, food.id, 0.1);
  send(a, found);
  const receipt = saidOf(a, "food").at(-1)!;
  assert.equal(receipt.ack, 1);
  assert.ok(receipt.gone.includes(found.id));
  assert.ok(Math.abs(receipt.meal![1] - 0.08) < 1e-6);
  clear(a);
  step(100);
  assert.ok(saidOf(a, "food").every((m) => m.meal![1] === 0));
});
