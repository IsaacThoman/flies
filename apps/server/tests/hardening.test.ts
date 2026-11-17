// The room server against devices that don't play by the protocol: what
// they send can't stop it, grow it without bound, get round its limits or
// spoil its file of tables. Each test is one way that once worked.

import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { WebSocket } from "ws";
import { DROP_ID, FLY_MAX, FOUND_ID, LIMITS, MAX_FOUND, PROTOCOL, ROOMS_PATH, ROOM_LIMITS, TABLETOP_SCALE, createFlyState, encodeBites, encodeFly, tableCode } from "@fly/net";
import type { ClientMessage, ServerMessage, TableStart } from "@fly/net";
import { clientAddress, post, startServer } from "../src/server.ts";
import type { RoomServer } from "../src/server.ts";
import { AWAY_LIMIT, REMOVED_MAX, Table } from "../src/table.ts";
import type { Link, Seat } from "../src/table.ts";
import { Tables } from "../src/tables.ts";
import type { Files } from "../src/tables.ts";

const START: TableStart = { place: "picnic", light: "noon", weather: "clear", zone: "UTC", offset: 0 };
const WAIT = 2000;

const dirs: string[] = [];
const servers: RoomServer[] = [];
after(async () => {
  await Promise.all(servers.map((s) => s.stop()));
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

async function scratch() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fly-rooms-hard-"));
  dirs.push(dir);
  return dir;
}

async function serve(options: { dataDir?: string; trustProxy?: boolean; logged?: unknown[][] } = {}) {
  const dataDir = options.dataDir ?? (await scratch());
  const server = await startServer({ port: 0, host: "127.0.0.1", dataDir, trustProxy: options.trustProxy, log: (...line) => options.logged?.push(line), listEvery: 50 });
  servers.push(server);
  return server;
}

const newCode = () => tableCode((bytes) => crypto.getRandomValues(bytes));
const newKey = () => `test-key-${crypto.randomUUID()}`;

/** Opens a socket to the room, as if from `from` (behind a trusting proxy); resolves once it is open, or rejects with the HTTP status it was turned away with. */
function connect(port: number, from?: string): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${ROOMS_PATH}`, from ? { headers: { "X-Forwarded-For": from } } : {});
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve(ws));
    ws.once("unexpected-response", (_req, res) => reject(new Error(`status ${res.statusCode}`)));
    ws.once("error", reject);
  });
}

/** The first JSON message a socket hears after now. */
const answer = (ws: WebSocket) =>
  new Promise<ServerMessage>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no answer")), WAIT);
    ws.once("message", (data: Buffer) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString("utf8")) as ServerMessage);
    });
  });

const closed = (ws: WebSocket) => new Promise<number>((resolve) => (ws.readyState === ws.CLOSED ? resolve(-1) : ws.once("close", (code) => resolve(code))));

/** Says something raw over a plain TCP socket and waits for the server to answer or hang up. */
function raw(port: number, request: string): Promise<string> {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1", () => socket.write(request));
    let heard = "";
    socket.on("data", (d) => (heard += d.toString("latin1")));
    socket.on("error", () => {});
    socket.on("close", () => resolve(heard));
    setTimeout(() => socket.destroy(), WAIT).unref();
  });
}

const healthy = async (server: RoomServer) => {
  const res = await fetch(`http://127.0.0.1:${server.port}/health`);
  assert.equal(res.status, 200);
  return (await res.json()) as { ok: boolean; tables: number };
};

test("a request whose target isn't a URL is turned away, and the server goes on answering", async () => {
  const server = await serve();
  // Once this threw in the request handler, and took the server down.
  await raw(server.port, "GET http://[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n");
  await raw(server.port, `GET http://[ HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${Buffer.alloc(16).toString("base64")}\r\n\r\n`);
  await raw(server.port, "GET /health HTTP/1.1\r\nHost: x\r\n" + `X-Big: ${"a".repeat(16_000)}\r\n\r\n`);
  assert.equal((await healthy(server)).ok, true);
});

test("forwarded addresses are believed only from the proxy itself, the nearest one's, and an IPv6 machine counts by its /64", () => {
  // Reaching the server directly, anyone could say they were anyone.
  assert.equal(clientAddress("203.0.113.9", "198.51.100.1", true), "203.0.113.9");
  assert.equal(clientAddress("172.18.0.3", "198.51.100.1", false), "172.18.0.3");
  // From the proxy, the address it added: the last; what the visitor wrote before it is theirs to make up.
  assert.equal(clientAddress("172.18.0.3", "1.1.1.1, 198.51.100.1", true), "198.51.100.1");
  assert.equal(clientAddress("::ffff:10.0.0.2", ["1.1.1.1", "198.51.100.7"], true), "198.51.100.7");
  assert.equal(clientAddress("127.0.0.1", "not an address", true), "127.0.0.1");
  assert.equal(clientAddress("::ffff:203.0.113.9", undefined, true), "203.0.113.9");
  // Every address in a /64 is one machine's.
  assert.equal(clientAddress("2001:db8:1:2:aaaa::1", undefined, false), "2001:db8:1:2::/64");
  assert.equal(clientAddress("2001:db8:1:2:ffff:ffff:ffff:ffff", undefined, false), "2001:db8:1:2::/64");
  assert.equal(clientAddress("2001:db8::1", undefined, false), "2001:db8:0:0::/64");
  assert.equal(clientAddress("172.18.0.3", "2001:db8:1:2::5", true), "2001:db8:1:2::/64");
  assert.equal(clientAddress(undefined, undefined, true), "unknown");
});

test("an address may open only so many connections a minute, closing each before the next", async () => {
  const server = await serve();
  const [, burst] = ROOM_LIMITS.opens;
  for (let i = 0; i < burst; i++) {
    const ws = await connect(server.port);
    ws.close();
    await closed(ws);
  }
  await assert.rejects(connect(server.port), /status 429/);
  // Another address isn't held up by it.
  const other = await serve({ trustProxy: true });
  const ws = await connect(other.port, "198.51.100.20");
  ws.close();
});

test("a device that stops taking what it is sent is dropped, not its backlog kept", () => {
  let sent = 0;
  let terminated = false;
  const ws = { readyState: 1, OPEN: 1, bufferedAmount: 0, send: () => void sent++, terminate: () => void (terminated = true) } as unknown as Parameters<typeof post>[0];
  post(ws, "x", 100);
  assert.equal(sent, 1);
  (ws as { bufferedAmount: number }).bufferedAmount = 101;
  post(ws, "x", 100);
  assert.equal(sent, 1, "nothing more piled on");
  assert.ok(terminated);
});

test("passwords are worked out only a few at once: past that, a try is refused as busy, not queued", async () => {
  const server = await serve({ trustProxy: true });
  const codes = [newCode(), newCode()];
  for (const code of codes) {
    const starter = await connect(server.port, "198.51.100.1");
    starter.send(JSON.stringify({ type: "hello", v: PROTOCOL, table: code, key: newKey(), start: START, password: "right one" } satisfies ClientMessage));
    assert.equal((await answer(starter)).type, "welcome");
  }
  // Each from its own address, so that no address's own count of tries stops it first; at two rooms, under each room's.
  const tries = await Promise.all(Array.from({ length: 16 }, (_, i) => connect(server.port, `198.51.100.${100 + i}`)));
  const answers = tries.map(answer);
  tries.forEach((ws, i) => ws.send(JSON.stringify({ type: "hello", v: PROTOCOL, table: codes[i % 2], key: newKey(), password: "wrong one" } satisfies ClientMessage)));
  const reasons = (await Promise.all(answers)).map((m) => (m.type === "refused" ? m.reason : m.type));
  assert.ok(reasons.every((r) => r === "locked" || r === "busy"), reasons.join());
  assert.ok(reasons.includes("busy"), "some were turned away rather than waiting");
  assert.ok(reasons.filter((r) => r === "locked").length >= 4, "but a few were worked out");
  for (const ws of tries) ws.close();
});

test("a file of tables that can't be read is set aside and the server starts with none; one bad table is left out, the rest kept", async () => {
  const dir = await scratch();
  const file = path.join(dir, "tables.json");
  await writeFile(file, '{"v":1,"tables":[{"code":');
  const logged: unknown[][] = [];
  const server = await serve({ dataDir: dir, logged });
  assert.equal((await healthy(server)).tables, 0);
  assert.ok((await readdir(dir)).some((f) => f.startsWith("tables.json.unreadable-")), "the damaged file is kept for whoever looks after the server");
  assert.ok(logged.some(([, event]) => event === "unreadable"));
  await server.stop();

  // A good table, kept as the server keeps one, among hostile ones.
  const tables = new Tables({ now: () => 0, wall: () => Date.now() });
  const code = newCode();
  tables.open("starter-key-hash", { type: "hello", v: PROTOCOL, table: code, key: newKey(), start: START }, 1);
  await tables.save(file, true);
  const kept = JSON.parse(await readFile(file, "utf8")) as { v: number; tables: Record<string, unknown>[] };
  const good = kept.tables[0];
  const bad = [
    null,
    "a table",
    { ...good, code: "../../etc" },
    { ...good, code: newCode(), world: null },
    { ...good, code: newCode(), seats: [{ id: 300, key: "k", at: [0, 0, 0, 0], airborne: false, lastSeen: 0 }] },
    { ...good, code: newCode(), seats: [{ id: 1, key: "k", at: [0, 0, 0, 0], airborne: false, lastSeen: 0 }, { id: 1, key: "j", at: [0, 0, 0, 0], airborne: false, lastSeen: 0 }] },
    { ...good, code: newCode(), foods: Array.from({ length: 100_000 }, (_, i) => [i, "found", "x", 0, 0, 1, 1, 1, 0]) },
    { ...good, code: newCode(), foods: [[1, "patch", "x", "NaN", 0, 1, 1, 1, 0]] },
    { ...good, code: newCode(), name: "‮evil" },
    { ...good, code: newCode(), lock: { salt: 1, hash: 2 } },
    { ...good, code: newCode(), epoch: 1e9 },
    { ...good },
  ];
  await writeFile(file, JSON.stringify({ v: 1, tables: [good, ...bad] }));
  const back = await serve({ dataDir: dir });
  assert.equal((await healthy(back)).tables, 1);
  assert.ok(back.tables.get(code));
});

test("the place's found food at a table is at most MAX_FOUND, however many a device reports", () => {
  const clock = { now: 1000, wall: Date.UTC(2026, 5, 1, 12) };
  const table = new Table("23456789ab", START, "key-1", 7, { now: () => clock.now, wall: () => clock.wall });
  const link: Link = { send() {}, close() {} };
  const seat = table.hello(link, "key-1", { type: "hello", v: PROTOCOL, table: "23456789ab", key: "key-1" }) as Seat;
  const [perMinute] = LIMITS.found;
  for (let i = 0; i < MAX_FOUND * 4; i++) {
    clock.now += 60_000 / perMinute;
    table.receive(seat, JSON.stringify({ type: "found", id: FOUND_ID + i, name: "juice", x: 10 + (i % 20), z: 5, y: 1000, r: 1, sweet: 0.5 } satisfies ClientMessage));
  }
  const found = table.food.foods.filter((f) => f.kind === "found");
  assert.equal(found.length, MAX_FOUND);
  assert.equal(found[found.length - 1].id, FOUND_ID + MAX_FOUND * 4 - 1, "the newest are kept");
});

test("the starter removes players only at the rate of its other changes, and the table remembers a bounded number of removed keys", () => {
  const clock = { now: 1000, wall: Date.UTC(2026, 5, 1, 12) };
  const table = new Table("23456789ab", START, "key-1", 7, { now: () => clock.now, wall: () => clock.wall });
  const link: Link = { send() {}, close() {} };
  const hello = (key: string): ClientMessage & { type: "hello" } => ({ type: "hello", v: PROTOCOL, table: "23456789ab", key });
  const starter = table.hello(link, "key-1", hello("key-1")) as Seat;
  const [, burst] = LIMITS.changes;
  let removed = 0;
  for (let i = 0; i < burst * 3; i++) {
    const other = table.hello(link, `key-x-${i}`, hello(`key-x-${i}`)) as Seat;
    table.receive(starter, JSON.stringify({ type: "remove", id: other.id } satisfies ClientMessage));
    if (!table.seats.has(other.id) || table.seats.get(other.id) !== other) removed++;
    else table.remove(other);
  }
  assert.equal(removed, burst, "removals past the rate are ignored");
  for (let i = 0; i < REMOVED_MAX * 2; i++) {
    const other = table.hello(link, `key-y-${i}`, hello(`key-y-${i}`)) as Seat;
    table.remove(other);
  }
  assert.equal(table.removed.size, REMOVED_MAX);
});

test("a table nobody is at costs no beat; when the tables are full, starting one forgets the one nobody has been at for longest", () => {
  const clock = { now: 0, wall: Date.UTC(2026, 5, 1, 12) };
  const tables = new Tables({ now: () => clock.now, wall: () => clock.wall }, 3);
  const start = (code: string) => tables.open(`starter-${code}`, { type: "hello", v: PROTOCOL, table: code, key: newKey(), start: START }, 1);
  const codes = ["2222222222", "3333333333", "4444444444"];
  for (const code of codes) {
    start(code);
    clock.wall += 1000;
  }
  const ticked = new Set<string>();
  for (const code of codes) {
    const table = tables.get(code)!;
    const tick = table.tick.bind(table);
    table.tick = () => {
      ticked.add(code);
      tick();
    };
  }
  // Someone at the first, which is the oldest.
  const first = tables.get(codes[0])!;
  first.hello({ send() {}, close() {} }, "starter-2222222222", { type: "hello", v: PROTOCOL, table: codes[0], key: "k" });
  tables.tick();
  assert.deepEqual([...ticked], [codes[0]]);
  assert.equal(typeof start("5555555555"), "object", "not refused as busy");
  assert.equal(tables.size, 3);
  assert.ok(tables.get(codes[0]), "the table someone is at stays");
  assert.equal(tables.get(codes[1]), null, "the longest unvisited is forgotten");
});

test("bubbles start when the table does, is carried to the picnic, or wakes: never replaying all the time the server has been up", () => {
  // Ten days up.
  const clock = { now: 10 * 86_400_000, wall: Date.UTC(2026, 5, 1, 12) };
  const tables = new Tables({ now: () => clock.now, wall: () => clock.wall });
  const sent: string[] = [];
  const link: Link = { send: (d) => typeof d === "string" && sent.push(d), close() {} };
  const table = tables.open("starter", { type: "hello", v: PROTOCOL, table: "23456789ab", key: newKey(), start: { ...START, place: "lab" } }, 1) as Table;
  const starter = table.hello(link, "starter", { type: "hello", v: PROTOCOL, table: "23456789ab", key: "k" }) as Seat;
  table.receive(starter, JSON.stringify({ type: "place", place: "picnic" } satisfies ClientMessage));
  const place = sent.map((d) => JSON.parse(d) as ServerMessage).find((m) => m.type === "place");
  assert.ok(place?.type === "place" && place.bubbles, "a move to the picnic tells everyone its bubbles");
  assert.ok(place.bubbles.every((b) => b.t0 >= clock.now / 1000 - 1), "blown now, not ten days ago");
  const cpu = process.cpuUsage();
  for (let i = 0; i < 20; i++) {
    clock.now += 50;
    tables.tick();
  }
  const used = process.cpuUsage(cpu);
  assert.ok((used.user + used.system) / 1000 < 200, `a second of beats took ${(used.user + used.system) / 1000} ms of CPU`);
  // Everyone goes for a day; whoever comes back finds bubbles blown as they arrive.
  table.disconnected(starter, link);
  clock.wall += AWAY_LIMIT + 1;
  tables.tick();
  assert.equal(table.present, 0);
  clock.now += 86_400_000;
  table.hello(link, "starter", { type: "hello", v: PROTOCOL, table: "23456789ab", key: "k" });
  assert.ok(table.bubbles!.snapshot().every((b) => b.t0 >= clock.now / 1000 - 1));
});

test("a save that fails at any stage leaves the tables to be saved again: the next ordinary save keeps the latest of them", async () => {
  for (const stage of ["mkdir", "open", "write", "sync", "rename"] as const) {
    const dir = await scratch();
    const file = path.join(dir, "rooms", "tables.json");
    let failing: string | null = stage;
    const fail = (at: string) => {
      if (failing !== at) return;
      failing = null;
      throw new Error(`no space left (${at})`);
    };
    const files: Files = {
      ...fs,
      mkdir: (async (...a: Parameters<typeof fs.mkdir>) => (fail("mkdir"), fs.mkdir(...a))) as Files["mkdir"],
      rename: async (...a: Parameters<typeof fs.rename>) => (fail("rename"), fs.rename(...a)),
      open: async (...a: Parameters<typeof fs.open>) => {
        fail("open");
        const handle = await fs.open(...a);
        const write = handle.writeFile.bind(handle);
        const sync = handle.sync.bind(handle);
        handle.writeFile = (async (...w: Parameters<typeof write>) => (fail("write"), write(...w))) as typeof handle.writeFile;
        handle.sync = async () => (fail("sync"), sync());
        return handle;
      },
    };
    const clock = { now: 0, wall: Date.UTC(2026, 5, 1, 12) };
    const tables = new Tables({ now: () => clock.now, wall: () => clock.wall }, undefined, files);
    const table = tables.open("starter", { type: "hello", v: PROTOCOL, table: "23456789ab", key: newKey(), start: START }, 1) as Table;
    const link: Link = { send() {}, close() {} };
    const seat = table.hello(link, "starter", { type: "hello", v: PROTOCOL, table: "23456789ab", key: "k" }) as Seat;
    tables.tick();
    // The room empties: nothing after this marks the tables changed, so only the failed save's retry can keep it.
    clock.wall += 5000;
    table.disconnected(seat, link);
    await assert.rejects(tables.save(file), /no space left/, stage);
    await tables.save(file);
    const kept = JSON.parse(await readFile(file, "utf8")) as { tables: { code: string; seats: { lastSeen: number }[] }[] };
    assert.equal(kept.tables[0]?.code, "23456789ab", stage);
    assert.equal(kept.tables[0].seats[0].lastSeen, clock.wall, `${stage}: the room as it was last, emptied`);
  }
});

test("a drop, a find, a throw or a bite from the place the table was in before a move is dropped there, not done in the new one", () => {
  const clock = { now: 1000, wall: Date.UTC(2026, 5, 1, 12) };
  const table = new Table("23456789ab", START, "key-1", 7, { now: () => clock.now, wall: () => clock.wall });
  const heard: string[] = [];
  const hello = (key: string): ClientMessage & { type: "hello" } => ({ type: "hello", v: PROTOCOL, table: "23456789ab", key });
  // The starter hears what the other does.
  const starter = table.hello({ send: (d) => typeof d === "string" && heard.push(d), close() {} }, "key-1", hello("key-1")) as Seat;
  const other = table.hello({ send() {}, close() {} }, "key-2", hello("key-2")) as Seat;
  const before = table.epoch;
  table.receive(starter, JSON.stringify({ type: "place", place: "lab" } satisfies ClientMessage));
  assert.notEqual(table.epoch, before);
  heard.length = 0;
  const [x, z] = [table.world.place.start.x, table.world.place.start.z];
  // In flight when the table moved: each still names the picnic's epoch.
  const stale = [
    { type: "drop", id: other.id * DROP_ID + 1, kind: "sugar", x, z, y: 1000, at: clock.now, epoch: before },
    { type: "found", id: FOUND_ID + 5, name: "juice", x, z, y: 1000, r: 1, sweet: 0.5, epoch: before },
    { type: "ball", at: clock.now, from: [x, 50, z], via: [x, 20, z], to: [x, 0, z], epoch: before },
  ] satisfies ClientMessage[];
  for (const m of stale) table.receive(other, JSON.stringify(m));
  assert.deepEqual(heard.map((d) => (JSON.parse(d) as ServerMessage).type), [], "none of them reached anyone");
  assert.ok(!table.food.foods.some((f) => f.id === other.id * DROP_ID + 1 || f.id === FOUND_ID + 5));
  assert.equal(table.balls.length, 0);
  // From the place it is in now, the same are done.
  for (const m of stale) table.receive(other, JSON.stringify({ ...m, epoch: table.epoch }));
  assert.deepEqual(heard.map((d) => (JSON.parse(d) as ServerMessage).type), ["drop", "found", "ball"]);
  // A bite of a food of the same id, where the fly now stands within reach of it: only one from this place counts.
  const food = table.food.foods[0];
  Object.assign(other.state, { x: food.x, y: food.y, z: food.z });
  const view = new DataView(new ArrayBuffer(64));
  const bite = (epoch: number, seq: number) => table.receive(other, new Uint8Array(view.buffer, 0, encodeBites(view, seq, [{ food: food.id, amount: 0.001 }], 1, epoch)));
  bite(before, 1);
  assert.equal(table.food.eaten.get(other.id) ?? 0, 0, "a bite from the picnic eats nothing in the lab");
  assert.equal(other.ack, 0);
  bite(table.epoch, 2);
  assert.ok((table.food.eaten.get(other.id) ?? 0) > 0);
  assert.equal(other.ack, 2);
});

test("a fly's states go on being taken past 2^32 ms of room time, when the wire's u32 time wraps", () => {
  const clock = { now: 2 ** 32 - 3000, wall: Date.UTC(2026, 5, 1, 12) };
  const table = new Table("23456789ab", START, "key-1", 7, { now: () => clock.now, wall: () => clock.wall });
  const hello = (key: string): ClientMessage & { type: "hello" } => ({ type: "hello", v: PROTOCOL, table: "23456789ab", key });
  const mover = table.hello({ send() {}, close() {} }, "key-1", hello("key-1")) as Seat;
  const view = new DataView(new ArrayBuffer(FLY_MAX));
  const start = { x: mover.state.x, y: mover.state.y, z: mover.state.z };
  let seq = 0;
  for (let i = 0; i < 120; i++) {
    clock.now += 50;
    const s = createFlyState();
    s.epoch = table.epoch;
    s.seq = ++seq;
    s.t = clock.now;
    s.x = start.x + i * 0.05;
    s.y = start.y;
    s.z = start.z;
    table.receive(mover, new Uint8Array(view.buffer, 0, encodeFly(view, TABLETOP_SCALE, s)));
  }
  assert.ok(clock.now > 2 ** 32 + 2000, "past the wrap");
  assert.ok(Math.abs(mover.state.x - (start.x + 119 * 0.05)) < 0.05, `the fly is where its last state put it, not stuck at the wrap: ${mover.state.x - start.x}`);
  assert.ok(Math.abs(mover.state.t - clock.now) < 1, "its time is the room's, past 2^32");
});
