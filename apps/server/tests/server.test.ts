import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { after, test } from "node:test";
import { WebSocket } from "ws";
import { createPicnic } from "@fly/world";
import { CLOSE, COLOURS, EVERYONE, FLY_MAX, OWN_MAX, PROTOCOL, ROOMS_PATH, TABLETOP_SCALE, createFlyState, decodeFlies, encodeFly, encodeOwn, everyoneCode, tableCode } from "@fly/net";
import type { ClientMessage, FlyState, RoomWire, ServerMessage, Spot, TableStart } from "@fly/net";
import { startServer } from "../src/server.ts";
import type { RoomServer } from "../src/server.ts";

const START: TableStart = { place: "picnic", light: "noon", weather: "clear", zone: "UTC", offset: 0 };
/** Long enough for anything here to arrive on the loopback; a test that waits this long has failed. */
const WAIT = 2000;

const picnic = createPicnic();

const dirs: string[] = [];
const servers: RoomServer[] = [];
after(async () => {
  await Promise.all(servers.map((s) => s.stop()));
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

async function serve(dataDir?: string) {
  const dir = dataDir ?? (await mkdtemp(path.join(os.tmpdir(), "fly-rooms-")));
  if (!dataDir) dirs.push(dir);
  const server = await startServer({ port: 0, host: "127.0.0.1", dataDir: dir, log: () => {}, listEvery: 50 });
  servers.push(server);
  return { server, dir };
}

const newCode = () => tableCode((bytes) => crypto.getRandomValues(bytes));
const newKey = () => `test-key-${crypto.randomUUID()}`;

type Received = { json: ServerMessage } | { flies: FlyState[] };

/** A device at the other end of a real socket: everything it hears is kept, and a test waits for the message it expects. */
async function device(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${ROOMS_PATH}`);
  ws.binaryType = "nodebuffer";
  const heard: Received[] = [];
  const waiting = new Set<() => void>();
  ws.on("message", (data: Buffer, binary: boolean) => {
    if (binary) {
      const flies: FlyState[] = [];
      const scratch = createFlyState();
      decodeFlies(new DataView(data.buffer, data.byteOffset, data.byteLength), TABLETOP_SCALE, scratch, (s) => flies.push({ ...s, pose: { ...s.pose }, hand: { ...s.hand } }));
      heard.push({ flies });
    } else heard.push({ json: JSON.parse(data.toString("utf8")) as ServerMessage });
    for (const w of waiting) w();
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) => ws.once("close", (code, reason) => resolve({ code, reason: reason.toString() })));
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });

  /** The first thing heard, from `from` on, that `match` makes something of. */
  function until<T>(match: (r: Received) => T | undefined, from = 0): Promise<T> {
    return new Promise((resolve, reject) => {
      let at = from;
      const look = () => {
        for (; at < heard.length; at++) {
          const found = match(heard[at]);
          if (found !== undefined) {
            waiting.delete(look);
            clearTimeout(timer);
            resolve(found);
            return;
          }
        }
      };
      const timer = setTimeout(() => {
        waiting.delete(look);
        reject(new Error(`not heard within ${WAIT} ms; heard ${JSON.stringify(heard.map((r) => ("json" in r ? r.json.type : "flies")))}`));
      }, WAIT);
      waiting.add(look);
      look();
    });
  }
  const message = <T extends ServerMessage["type"]>(type: T, from = 0) =>
    until((r) => ("json" in r && r.json.type === type ? (r.json as Extract<ServerMessage, { type: T }>) : undefined), from);

  let clock = { now: 0, at: 0 };
  let seq = 0;
  let id = 0;
  return {
    ws,
    heard,
    closed,
    until,
    message,
    send: (m: ClientMessage) => ws.send(JSON.stringify(m)),
    /** Says hello and waits for the answer: the welcome, or why not. */
    async hello(table: string, key: string, extra: Partial<Extract<ClientMessage, { type: "hello" }>> = {}) {
      const from = heard.length;
      ws.send(JSON.stringify({ type: "hello", v: PROTOCOL, table, key, ...extra } satisfies ClientMessage));
      const answer = await until((r) => ("json" in r && (r.json.type === "welcome" || r.json.type === "refused") ? r.json : undefined), from);
      if (answer.type === "welcome") {
        clock = { now: answer.now, at: performance.now() };
        id = answer.id;
      }
      return answer;
    },
    own(flies: readonly { id: number; at: Spot }[]) {
      const states = flies.map(({ id, at }) => {
        const s = createFlyState();
        s.id = id;
        s.seq = seq + 1;
        s.t = clock.now + (performance.now() - clock.at) + 1;
        [s.x, s.z, s.yaw] = at;
        s.y = picnic.heightAt(s.x, s.z, at[3]);
        return s;
      });
      seq++;
      const view = new DataView(new ArrayBuffer(OWN_MAX));
      ws.send(new Uint8Array(view.buffer, 0, encodeOwn(view, TABLETOP_SCALE, states)));
    },
    /** Sends where its fly is at the picnic, stamped with the room's time as the welcome gave it. */
    fly(x: number, z: number, epoch = 0) {
      const s = createFlyState();
      s.id = id;
      s.epoch = epoch;
      s.seq = ++seq;
      s.t = clock.now + (performance.now() - clock.at) + 1;
      s.x = x;
      s.y = picnic.heightAt(x, z);
      s.z = z;
      const view = new DataView(new ArrayBuffer(FLY_MAX));
      ws.send(new Uint8Array(view.buffer, 0, encodeFly(view, TABLETOP_SCALE, s)));
    },
  };
}

test("a device speaking another version of the protocol is refused and closed", async () => {
  const { server } = await serve();
  for (const v of [PROTOCOL - 1, PROTOCOL + 1]) {
    const d = await device(server.port);
    const answer = await d.hello(newCode(), newKey(), { v });
    assert.deepEqual(answer, { type: "refused", reason: "version" });
    assert.equal((await d.closed).code, CLOSE.version);
  }
});

test("a hello for a table nobody has started, without starting it, is refused as unknown", async () => {
  const { server } = await serve();
  const d = await device(server.port);
  assert.deepEqual(await d.hello(newCode(), newKey()), { type: "refused", reason: "unknown" });
  assert.equal((await d.closed).code, CLOSE.unknown);
});

test("a device saying hello to Everyone without starting a room is welcomed into an unlocked listed room with no starter", async () => {
  const { server } = await serve();
  const d = await device(server.port);
  const welcome = await d.hello(EVERYONE, newKey());
  assert.ok(welcome.type === "welcome");
  assert.deepEqual(welcome.room, { code: EVERYONE, everyone: true, name: "Everyone", listed: true, locked: false });
  assert.equal(welcome.starter, 0);
  assert.equal(welcome.id, 1);
  assert.deepEqual(welcome.world, { light: "clock", weather: "now" });
  d.ws.close();
  await d.closed;
});

test("hellos for everyone codes ignore starts and passwords without spending the address's allowance for starting rooms", async () => {
  const { server } = await serve();
  // This code has never opened: a start there must not use the ordinary room's creation path.
  for (let i = 0; i < 6; i++) {
    const d = await device(server.port);
    const welcome = await d.hello(everyoneCode(7), newKey(), { start: { ...START, name: "Mine", listed: false }, password: "a password" });
    assert.ok(welcome.type === "welcome");
    assert.deepEqual(welcome.room, { code: EVERYONE, everyone: true, name: "Everyone", listed: true, locked: false });
    assert.equal(welcome.starter, 0);
    d.ws.close();
    await d.closed;
  }
  for (let i = 0; i < 5; i++) {
    const d = await device(server.port);
    assert.equal((await d.hello(newCode(), newKey(), { start: START })).type, "welcome");
    d.ws.close();
    await d.closed;
  }
  const limited = await device(server.port);
  assert.deepEqual(await limited.hello(newCode(), newKey(), { start: START }), { type: "refused", reason: "busy" });
  assert.equal((await limited.closed).code, CLOSE.busy);
});

test("two devices at a table hear each other's flies in the room's batches, and the health check counts them", async () => {
  const { server } = await serve();
  const code = newCode();
  const a = await device(server.port);
  const b = await device(server.port);
  const welcomeA = await a.hello(code, newKey(), { start: START });
  assert.equal(welcomeA.type, "welcome");
  const welcomeB = await b.hello(code, newKey());
  assert.ok(welcomeA.type === "welcome" && welcomeB.type === "welcome");
  assert.equal(welcomeB.id, 2);
  assert.equal(welcomeB.starter, 1);
  assert.deepEqual(welcomeB.players.map((p) => p.id), [1]);
  await a.message("joined");

  const [ax, az] = welcomeA.at;
  const [bx, bz] = welcomeB.at;
  const fromA = b.heard.length;
  const fromB = a.heard.length;
  a.fly(ax + 0.5, az);
  b.fly(bx - 0.5, bz);
  const seenByB = await b.until((r) => ("flies" in r ? r.flies.find((s) => s.id === 1 && s.seq === 1) : undefined), fromA);
  const seenByA = await a.until((r) => ("flies" in r ? r.flies.find((s) => s.id === 2 && s.seq === 1) : undefined), fromB);
  assert.ok(Math.abs(seenByB.x - (ax + 0.5)) < 0.05);
  assert.ok(Math.abs(seenByA.x - (bx - 0.5)) < 0.05);
  // Never its own fly back.
  assert.ok(a.heard.every((r) => !("flies" in r) || r.flies.every((s) => s.id !== 1)));

  const health = await fetch(`http://127.0.0.1:${server.port}/health`);
  assert.equal(health.status, 200);
  assert.match(health.headers.get("content-type") ?? "", /application\/json/);
  const body = (await health.json()) as Record<string, unknown>;
  assert.equal(body.ok, true);
  assert.equal(body.protocol, PROTOCOL);
  assert.equal(body.tables, 2);
  assert.equal(body.devices, 2);
  assert.equal(body.flies, 2);
});

test("a restart sends everyone away to come back, and coming back they find the table, their id, their colour and their fly where it was", async () => {
  const { server, dir } = await serve();
  const code = newCode();
  const keyB = newKey();
  const a = await device(server.port);
  const b = await device(server.port);
  await a.hello(code, newKey(), { start: START });
  const welcome = await b.hello(code, keyB, { flies: 3 });
  assert.ok(welcome.type === "welcome");
  const [bx, bz] = welcome.at;
  const from = a.heard.length;
  b.own(welcome.flies.map((f) => ({ id: f.id, at: [f.at[0] + 1, f.at[1] + 0.5, f.at[2], f.at[3]] })));
  const seenFlies = await a.until((r) => ("flies" in r && r.flies.length === 3 && r.flies.every((s) => s.seq === 1) ? r.flies : undefined), from);
  const seen = seenFlies[0];

  await server.stop();
  assert.equal((await a.closed).code, CLOSE.restart);
  assert.equal((await b.closed).code, CLOSE.restart);

  const { server: again } = await serve(dir);
  assert.ok(again.tables.get(code), "the table was kept");
  const back = await device(again.port);
  const returned = await back.hello(code, keyB, { flies: 3 });
  assert.equal(returned.type, "welcome");
  if (returned.type !== "welcome") return;
  assert.equal(returned.id, 2);
  assert.equal(returned.colour, COLOURS[1]);
  assert.deepEqual(returned.flies.map((f) => [f.id, f.colour]), welcome.flies.map((f) => [f.id, f.colour]));
  for (const f of returned.flies) {
    const last = seenFlies.find((s) => s.id === f.id)!;
    assert.ok(Math.hypot(f.at[0] - last.x, f.at[1] - last.z) < 0.02);
  }
  // Where the others last saw it, to the wire's 1/50 mm.
  assert.ok(Math.hypot(returned.at[0] - seen.x, returned.at[1] - seen.z) < 0.02, `back at ${returned.at}, seen at ${seen.x}, ${seen.z}`);
  assert.ok(Math.hypot(returned.at[0] - bx, returned.at[1] - bz) > 0.3, "where it had walked to, not where it was first set down");
  // The starter isn't back yet: it is shown resting.
  assert.deepEqual(returned.players, [{ id: 1, colour: COLOURS[0], away: true, of: 1 }]);
  back.ws.close();
});

/** A connection that browses the listed rooms: each list as it is told. */
async function browser(port: number) {
  const d = await device(port);
  d.send({ type: "browse", v: PROTOCOL });
  const list = async (match: (rooms: RoomWire[]) => boolean) => {
    for (let from = 0; ; ) {
      const m = await d.message("rooms", from);
      from = d.heard.findIndex((r) => "json" in r && r.json === m) + 1;
      if (match(m.rooms)) return m.rooms;
    }
  };
  return { ...d, list };
}

test("a listed room shows in the list, by its name, place, flies and lock, as it changes; an unlisted one never does", async () => {
  const { server } = await serve();
  const [listed, unlisted] = [newCode(), newCode()];
  const a = await device(server.port);
  assert.equal((await a.hello(listed, newKey(), { start: { ...START, place: "lab", name: "  Sunny   crumbs ", listed: true } })).type, "welcome");
  const u = await device(server.port);
  const welcome = await u.hello(unlisted, newKey(), { start: { ...START, name: "Secret", listed: false } });
  assert.ok(welcome.type === "welcome");
  assert.deepEqual(welcome.room, { code: unlisted, everyone: false, name: "Secret", listed: false, locked: false });

  const look = await browser(server.port);
  const first = await look.list(() => true);
  assert.deepEqual(first.filter((room) => !room.everyone), [{ code: listed, name: "Sunny crumbs", place: "lab", flies: 1, locked: false }]);
  // Someone sits down: the list says so, on its own.
  const b = await device(server.port);
  await b.hello(listed, newKey());
  await look.list((rooms) => rooms.find((room) => room.code === listed)?.flies === 2);
  assert.ok(look.heard.every((r) => !("json" in r) || r.json.type !== "rooms" || r.json.rooms.every((room) => room.code !== unlisted)), "never the unlisted room");
  // Browsing, it is told nothing else, and nothing it says sits it anywhere.
  look.send({ type: "hello", v: PROTOCOL, table: unlisted, key: newKey() });
  // A pong follows the preceding frames on this socket, so the assertion
  // observes a processed hello rather than guessing how long loopback takes.
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(WAIT)]);
  const pong = Promise.race([
    once(look.ws, "pong", { signal }),
    once(look.ws, "close", { signal }).then(() => { throw new Error("browsing socket closed before acknowledging"); }),
  ]);
  try {
    look.ws.ping();
    await pong;
  } finally {
    controller.abort();
  }
  assert.ok(look.heard.every((r) => "json" in r && r.json.type === "rooms"));
  look.ws.close();
});

test("a locked room lets in only whoever gives its password; its code alone doesn't, and the password is kept and logged nowhere", async () => {
  const lines: string[] = [];
  const dir = await mkdtemp(path.join(os.tmpdir(), "fly-rooms-"));
  dirs.push(dir);
  const server = await startServer({ port: 0, host: "127.0.0.1", dataDir: dir, log: (level, event, fields) => lines.push(JSON.stringify({ level, event, fields })) });
  servers.push(server);
  const code = newCode();
  const password = "correct horse";
  const starterKey = newKey();
  const a = await device(server.port);
  const started = await a.hello(code, starterKey, { start: { ...START, name: "Locked", listed: true }, password });
  assert.ok(started.type === "welcome");
  assert.deepEqual(started.room, { code, everyone: false, name: "Locked", listed: true, locked: true });

  const look = await browser(server.port);
  assert.deepEqual((await look.list(() => true)).filter((room) => !room.everyone).map((r) => [r.name, r.locked]), [["Locked", true]]);

  const joinerKey = newKey();
  const bare = await device(server.port);
  assert.deepEqual(await bare.hello(code, joinerKey), { type: "refused", reason: "locked", name: "Locked" });
  assert.equal((await bare.closed).code, CLOSE.locked);
  const wrong = await device(server.port);
  assert.deepEqual(await wrong.hello(code, joinerKey, { password: "battery staple" }), { type: "refused", reason: "locked", name: "Locked" });
  const right = await device(server.port);
  const sat = await right.hello(code, joinerKey, { password });
  assert.ok(sat.type === "welcome");
  assert.equal(sat.id, 2);
  // Coming back (a dropped line, a reload), a device that has sat here needs no password again; nor does the starter.
  right.ws.close();
  await right.closed;
  const back = await device(server.port);
  assert.equal((await back.hello(code, joinerKey)).type, "welcome");
  a.ws.close();
  await a.closed;
  const starter = await device(server.port);
  assert.equal((await starter.hello(code, starterKey)).type, "welcome");

  await server.stop();
  const kept = await readFile(path.join(dir, "tables.json"), "utf8");
  const table = (JSON.parse(kept) as { tables: { code: string; name: string; listed: boolean; lock: { salt: string; hash: string } }[] }).tables.find((table) => table.code === code)!;
  assert.equal(table.name, "Locked");
  assert.ok(table.lock.salt && table.lock.hash, "kept as a salted hash");
  for (const where of [kept, ...lines]) assert.ok(!where.includes(password) && !where.includes("battery staple"), `a password in ${where.slice(0, 80)}`);
  // The log writes the code only as a short hash (log.ts), and here the test's own log is given the raw fields.
  assert.ok(lines.some((l) => l.includes('"event":"started"') && l.includes('"locked":true')));

  // And after a restart the lock holds as it was.
  const again = await startServer({ port: 0, host: "127.0.0.1", dataDir: dir, log: () => {} });
  servers.push(again);
  const stranger = await device(again.port);
  assert.equal((await stranger.hello(code, newKey())).type, "refused");
  const friend = await device(again.port);
  assert.equal((await friend.hello(code, newKey(), { password })).type, "welcome");
});

test("guessing a room's password is slowed to a few tries a minute; starting rooms too; a name that isn't one is refused", async () => {
  const { server } = await serve();
  const code = newCode();
  const a = await device(server.port);
  await a.hello(code, newKey(), { start: START, password: "hunter2!" });
  const answers: string[] = [];
  for (let i = 0; i < 8; i++) {
    const d = await device(server.port);
    const answer = await d.hello(code, newKey(), { password: `guess ${i}` });
    answers.push(answer.type === "refused" ? answer.reason : answer.type);
  }
  assert.deepEqual(answers.slice(0, 5), ["locked", "locked", "locked", "locked", "locked"]);
  assert.deepEqual(answers.slice(5), ["busy", "busy", "busy"], "then, from this address, no more tries for a while");
  // Even the right one, until then: a guess that happened to be right isn't told apart.
  const right = await device(server.port);
  assert.deepEqual(await right.hello(code, newKey(), { password: "hunter2!" }), { type: "refused", reason: "busy" });

  // One room was started from this address; four more may be at once, then no more for a while.
  const starts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = await device(server.port);
    const answer = await d.hello(newCode(), newKey(), { start: START });
    starts.push(answer.type);
    d.ws.close();
  }
  assert.deepEqual(starts, ["welcome", "welcome", "welcome", "welcome", "refused"]);

  for (const name of ["", "x".repeat(25), "evil‮txt", "fly 🪰"]) {
    const d = await device(server.port);
    assert.deepEqual(await d.hello(newCode(), newKey(), { start: { ...START, name } }), { type: "refused", reason: "malformed" }, name);
  }
});

test("real sockets welcome several flies per device, relay every id without echo and enforce the eight-fly capacity", async () => {
  const { server } = await serve();
  const code = newCode();
  const a = await device(server.port);
  const b = await device(server.port);
  const wa = await a.hello(code, newKey(), { start: START, flies: 4 });
  const wb = await b.hello(code, newKey(), { flies: 99 });
  assert.ok(wa.type === "welcome" && wb.type === "welcome");
  assert.deepEqual(wa.flies.map((f) => [f.id, f.colour]), [1, 2, 3, 4].map((id) => [id, COLOURS[id - 1]]));
  assert.deepEqual(wb.flies.map((f) => f.id), [5, 6, 7, 8]);
  assert.deepEqual(wb.players, wa.flies.map((f) => ({ id: f.id, colour: f.colour, away: false, of: wa.id })));
  await a.until((r) => "json" in r && r.json.type === "joined" && r.json.id === 8 ? r.json : undefined);
  assert.deepEqual(a.heard.flatMap((r) => "json" in r && r.json.type === "joined" ? [r.json] : []), wb.flies.map((f) => ({ type: "joined", id: f.id, colour: f.colour, away: false, of: wb.id })));
  a.own(wa.flies);
  b.own(wb.flies);
  await Promise.all([
    b.until((r) => "flies" in r && r.flies.length === 4 && r.flies.every((s) => s.seq === 1) ? r.flies : undefined),
    a.until((r) => "flies" in r && r.flies.length === 4 && r.flies.every((s) => s.seq === 1) ? r.flies : undefined),
  ]);
  for (const [d, w] of [[a, wa], [b, wb]] as const) assert.ok(d.heard.every((r) => !("flies" in r) || r.flies.every((s) => !w.flies.some((f) => f.id === s.id))));
  const c = await device(server.port);
  assert.deepEqual(await c.hello(code, newKey()), { type: "refused", reason: "full" });
  assert.equal((await c.closed).code, CLOSE.full);
  const health = await fetch(`http://127.0.0.1:${server.port}/health`);
  const body = await health.json() as { devices: number; flies: number };
  assert.equal(body.devices, 2);
  assert.equal(body.flies, 8);
  a.ws.close();
  b.ws.close();
  await Promise.all([a.closed, b.closed]);
});
