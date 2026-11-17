import assert from "node:assert/strict";
import { test } from "node:test";
import { EAT_RATE, LAB, RESTAURANT_START, TABLE_TOPS, World, WORLDS } from "@fly/world";
import {
  AWAY, CLOSE, COLOURS, DROP_ID, FLY_MAX, LIMITS, MAX_PLAYERS, MAX_WALK, PLAYING, PROTOCOL, ROOM_SCALE, TABLETOP_SCALE, createFlyState, decodeFlies, encodeBites, encodeFly,
  spawnSpot, toWire,
} from "@fly/net";
import type { ClientMessage, ServerMessage, Spot, TableStart, WireScale } from "@fly/net";
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
  const send = (p: Player, message: ClientMessage) => table.receive(p.seat, JSON.stringify(message));
  /** One beat of the table, SEND_EVERY ms on. */
  const step = (ms = 50) => {
    clock.now += ms;
    clock.wall += ms;
    table.tick();
  };
  return { table, clock, options, hello, join, fly, bite, send, step };
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
  assert.deepEqual(welcomes[2].players, [{ id: 1, colour: COLOURS[0], away: false }, { id: 2, colour: COLOURS[1], away: false }]);
  // A newcomer is sent the flies already there at once, without waiting for them to move.
  assert.deepEqual(batches(links[0]), []);
  assert.deepEqual(batches(links[2]).map((batch) => batch.map((s) => [s.id, s.x, s.z])), [[1, 2].map((id) => [id, ...onWire(spawnSpot(opened.world, id))])]);
  // Everyone already there is told of each who joins, and nobody of itself.
  assert.deepEqual(saidOf(links[0], "joined").map((m) => m.id), [2, 3]);
  assert.deepEqual(saidOf(links[1], "joined").map((m) => m.id), [3]);
  assert.deepEqual(saidOf(links[2], "joined"), []);
  assert.deepEqual(saidOf(links[0], "joined")[1], { type: "joined", id: 3, colour: COLOURS[2], away: false });
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
  assert.ok(Math.hypot(a.seat.state.x - far.x, a.seat.state.z - far.z) > 40, "still well short of where it claimed");
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
  const where: Spot = [b.seat.state.x, b.seat.state.z, b.seat.state.yaw, b.seat.state.y];
  assert.ok(Math.abs(where[0] - (bx + 4)) < 0.05, "it walked");

  // Back after a moment, claiming its fly is across the table: it is set down where it was.
  const sugar = table.food.foods.find((f) => f.name === "sugar")!;
  table.disconnected(b.seat, b.link);
  clock.wall += 2000;
  const moment = fakeLink();
  table.hello(moment, "key-2", hello("key-2", { at: [sugar.x, sugar.z, 0], epoch: table.epoch }));
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
  assert.deepEqual(saidOf(a, "joined"), [{ type: "joined", id: 2, colour: COLOURS[1], away: false }]);
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
  assert.equal(d.seat.colour, COLOURS[3]);
  const back = join("key-2");
  assert.equal(back.seat.id, 2);
  assert.equal(back.seat.colour, COLOURS[1]);

  for (let i = 5; i <= MAX_PLAYERS; i++) players.push(join(`key-${i}`));
  assert.equal(table.present, MAX_PLAYERS);
  assert.equal(table.hello(fakeLink(), "key-9", hello("key-9")), "full");
  // Away a moment: still at the table.
  table.disconnected(players[2].seat, players[2].link);
  assert.equal(table.hello(fakeLink(), "key-9", hello("key-9")), "full");
  // Gone: its seat is given up.
  clock.wall += AWAY_LIMIT + 1000;
  step();
  const newcomer = join("key-9");
  assert.equal(newcomer.seat.id, 3);
  assert.equal(newcomer.seat.colour, COLOURS[2]);
  assert.equal(table.present, MAX_PLAYERS);
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
  assert.deepEqual([...restored.seats.values()].map((s) => [s.id, s.colour, s.present]), [[1, COLOURS[0], true], [2, COLOURS[1], true], [4, COLOURS[3], false]], "the one who said goodbye isn't brought back");
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
  assert.deepEqual(welcome.at, [b.seat.state.x, b.seat.state.z, b.seat.state.yaw, b.seat.state.y]);
  assert.deepEqual(welcome.players, [{ id: 1, colour: COLOURS[0], away: true }]);
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
  assert.equal(b.seat.state.y, WINDOW_TABLE);
  step();
  clear(a);

  // A picnic state still on its way, at the picnic's scale: read at the room's it would be nonsense, and it is never used.
  fly(b, px + 0.5, pz, { epoch: 0, t: clock.now + 10, y: 0, scale: TABLETOP_SCALE });
  step();
  assert.deepEqual(batches(a, ROOM_SCALE), []);
  assert.deepEqual([b.seat.state.x, b.seat.state.z, b.seat.state.y], [bx, bz, WINDOW_TABLE]);
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
  table.hello(back, "key-2", hello("key-2", { at: [px, pz, 0, 0], epoch: 0 }));
  assert.deepEqual(saidOf(back, "welcome")[0].at, spawnSpot(table.world, 2));

  // In the restaurant, it may come back a step along the table it was on, but not on the floor under it.
  const [bx, bz, yaw] = spawnSpot(table.world, 2);
  for (const [y, at] of [[0, WINDOW_TABLE], [WINDOW_TABLE, WINDOW_TABLE]]) {
    table.disconnected(b.seat, back);
    clock.wall += 2000;
    back.sent.length = 0;
    table.hello(back, "key-2", hello("key-2", { at: [bx + 3, bz, yaw, y], epoch: 1 }));
    const welcomed = saidOf(back, "welcome")[0].at;
    assert.equal(welcomed[3], at);
    assert.equal(b.seat.state.y, at);
  }
  assert.equal(b.seat.state.x, bx + 3, "the step along the table was taken");
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
