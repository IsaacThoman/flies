import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { after, test } from "node:test";
import { WebSocket } from "ws";
import { createPicnic } from "@fly/world";
import { CLOSE, COLOURS, FLY_MAX, PROTOCOL, ROOMS_PATH, TABLETOP_SCALE, createFlyState, decodeFlies, encodeFly, tableCode } from "@fly/net";
import type { ClientMessage, FlyState, ServerMessage, TableStart } from "@fly/net";
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
  const server = await startServer({ port: 0, host: "127.0.0.1", dataDir: dir, log: () => {} });
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
      if (answer.type === "welcome") clock = { now: answer.now, at: performance.now() };
      return answer;
    },
    /** Sends where its fly is at the picnic, stamped with the room's time as the welcome gave it. */
    fly(x: number, z: number, epoch = 0) {
      const s = createFlyState();
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
  const d = await device(server.port);
  const answer = await d.hello(newCode(), newKey(), { v: PROTOCOL + 1 });
  assert.deepEqual(answer, { type: "refused", reason: "version" });
  assert.equal((await d.closed).code, CLOSE.version);
});

test("a hello for a table nobody has started, without starting it, is refused as unknown", async () => {
  const { server } = await serve();
  const d = await device(server.port);
  assert.deepEqual(await d.hello(newCode(), newKey()), { type: "refused", reason: "unknown" });
  assert.equal((await d.closed).code, CLOSE.unknown);
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
  assert.equal(body.tables, 1);
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
  const welcome = await b.hello(code, keyB);
  assert.equal(welcome.type, "welcome");
  const [bx, bz] = welcome.type === "welcome" ? welcome.at : [0, 0];
  const from = a.heard.length;
  b.fly(bx + 1, bz + 0.5);
  const seen = await a.until((r) => ("flies" in r ? r.flies.find((s) => s.id === 2 && s.seq === 1) : undefined), from);

  await server.stop();
  assert.equal((await a.closed).code, CLOSE.restart);
  assert.equal((await b.closed).code, CLOSE.restart);

  const { server: again } = await serve(dir);
  assert.ok(again.tables.get(code), "the table was kept");
  const back = await device(again.port);
  const returned = await back.hello(code, keyB);
  assert.equal(returned.type, "welcome");
  if (returned.type !== "welcome") return;
  assert.equal(returned.id, 2);
  assert.equal(returned.colour, COLOURS[1]);
  // Where the others last saw it, to the wire's 1/50 mm.
  assert.ok(Math.hypot(returned.at[0] - seen.x, returned.at[1] - seen.z) < 0.02, `back at ${returned.at}, seen at ${seen.x}, ${seen.z}`);
  assert.ok(Math.hypot(returned.at[0] - bx, returned.at[1] - bz) > 0.3, "where it had walked to, not where it was first set down");
  // The starter isn't back yet: it is shown resting.
  assert.deepEqual(returned.players, [{ id: 1, colour: COLOURS[0], away: true }]);
  back.ws.close();
});
