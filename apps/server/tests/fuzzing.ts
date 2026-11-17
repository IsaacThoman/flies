// Fuzzing the room's protocol: what a device could send, mostly in shape
// and often not (a field of the wrong type, a number out of range, a list
// too long, a truncated or random frame), from a seed, so a failure replays.
// Two runs: a table in this process, many steps a second, checking after
// each that it stayed within its bounds and that everything it sent is a
// message the game reads; and a real server on the loopback, over sockets,
// checking that it stays up and keeps seating devices. `npm test` runs each
// for a moment (fuzz.test.ts); `npm run fuzz:rooms` for as long as asked.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import {
  BITES, BITES_MAX, DROP_ID, FLIES, FLY, FLY_MAX, FOUND_ID, HANDS, MAX_PLAYERS, PROTOCOL, ROOMS_PATH, TABLE_LIGHTS, TABLE_WEATHERS, WIRE_FOODS_MAX, createFlyState,
  decodeFlies, encodeBites, encodeFly, readServerMessage, stream,
} from "@fly/net";
import type { ClientMessage, TableStart } from "@fly/net";
import { WORLDS } from "@fly/world";
import { hashKey, isHello, startServer } from "../src/server.ts";
import { REMOVED_MAX, Table, isTableRecord } from "../src/table.ts";
import type { Link, Seat } from "../src/table.ts";
import { Tables } from "../src/tables.ts";

const PLACES = Object.keys(WORLDS);
const CODES = ["23456789ab", "bcdefghjkm", "npqrstuvwx"];

/** What a device could send, drawn from a seed. */
export class Fuzz {
  readonly next: () => number;

  constructor(seed: number) {
    this.next = stream(seed);
  }

  chance(p: number) {
    return this.next() < p;
  }

  int(lo: number, hi: number) {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  pick<T>(from: readonly T[]): T {
    return from[Math.floor(this.next() * from.length)];
  }

  /** Something no field should be. */
  weird(): unknown {
    return this.pick<() => unknown>([
      () => null, () => true, () => "", () => "x".repeat(this.int(1, 3000)), () => [], () => ({}), () => [1, 2, 3], () => ({ __proto__: { polluted: 1 } }),
      () => "__proto__", () => "constructor", () => "toString", () => 1e308, () => -1e308, () => 2 ** 53, () => -1, () => 0.5, () => this.int(-1e6, 1e6), () => "1",
      () => Array.from({ length: this.int(0, 400) }, () => this.int(0, 9)), () => ({ length: 1e9 }), () => "‮ㅤ\u0000",
    ])();
  }

  /** A number much as a device would send, or something that isn't one. */
  num(scale = 100): unknown {
    return this.chance(0.85) ? (this.next() - 0.5) * 2 * scale : this.weird();
  }

  /** `good`, mostly; something else now and then. */
  or<T>(good: T, p = 0.85): unknown {
    return this.chance(p) ? good : this.weird();
  }

  v3() {
    return this.or([this.num(), this.num(), this.num()]);
  }

  start(): TableStart {
    return this.or({
      place: this.or(this.pick(PLACES)), light: this.or(this.pick(TABLE_LIGHTS)), weather: this.or(this.pick(TABLE_WEATHERS)), zone: this.or(this.pick(["UTC", "Europe/Paris", "Nowhere/At_All", ""])),
      offset: this.num(900), name: this.or(this.pick(["Sunny", "Crumbs & co.", "ㅤ", "x".repeat(30)])), listed: this.or(this.chance(0.5)),
    }) as TableStart;
  }

  hello(code: string, key: string): ClientMessage {
    return {
      type: "hello", v: this.or(PROTOCOL, 0.95), table: this.or(code, 0.95), key: this.or(key, 0.95), start: this.chance(0.5) ? this.start() : undefined,
      password: this.chance(0.3) ? this.or(this.pick(["right one", "wrong", "x".repeat(70)])) : undefined, at: this.chance(0.3) ? this.or([this.num(), this.num(), this.num(), this.num()]) : undefined,
      epoch: this.chance(0.3) ? this.num(300) : undefined,
    } as ClientMessage;
  }

  /** The place epoch an action says it was done in: the table's, one it has left, none (a device from before), or nonsense. */
  epoch(epoch: number): unknown {
    return this.pick<() => unknown>([() => epoch, () => epoch, () => (epoch + 255) & 0xff, () => undefined, () => this.weird()])();
  }

  /** A JSON message a device seated at a table might send, player `id`'s, at a table in `epoch`. */
  message(id: number, epoch = 0): unknown {
    const m = this.pick<() => Record<string, unknown> | unknown>([
      () => ({ type: "ping", t: this.num(1e6) }),
      () => ({ type: "drop", id: this.or(id * DROP_ID + this.int(0, 50)), kind: this.or(this.pick(["sugar", "honey", "berry", "water", "patch", "found"])), x: this.num(), z: this.num(), y: this.num(), at: this.num(1e6) }),
      () => ({ type: "ball", at: this.num(1e6), from: this.v3(), via: this.v3(), to: this.v3() }),
      () => ({ type: "world", light: this.or(this.pick(TABLE_LIGHTS)), weather: this.or(this.pick(TABLE_WEATHERS)) }),
      () => ({ type: "place", place: this.or(this.pick(PLACES)) }),
      () => ({ type: "remove", id: this.or(this.int(0, MAX_PLAYERS + 1)) }),
      () => ({ type: "pop", slot: this.or(this.int(-1, 9)), cycle: this.or(this.int(0, 5)), at: this.num(1e6) }),
      () => ({ type: "found", id: this.or(FOUND_ID + this.int(0, 1e6)), name: this.or("juice"), x: this.num(), z: this.num(), y: this.num(), r: this.num(5), sweet: this.num(1) }),
      () => ({ type: "clearFood", epoch: this.epoch(epoch) }),
      () => ({ type: "bye" }),
      () => ({ type: this.weird() }),
      () => this.weird(),
    ])();
    if (m && typeof m === "object" && this.chance(0.7)) (m as Record<string, unknown>).epoch = this.epoch(epoch);
    return m;
  }

  /** A message's text as it goes: whole, mostly; cut short, or not JSON, now and then. */
  text(m: unknown): string {
    const json = JSON.stringify(m) ?? "null";
    if (this.chance(0.9)) return json;
    return this.pick([json.slice(0, this.int(0, json.length)), "[".repeat(this.int(1, 4000)), "\uD800", "{\"type\":\"ping\",\"t\":1}".repeat(3)]);
  }

  /** A binary message: a fly's state or bites, whole or broken, or noise. */
  binary(now: number, epoch: number): Uint8Array {
    const view = new DataView(new ArrayBuffer(Math.max(FLY_MAX, BITES_MAX)));
    let n: number;
    const kind = this.next();
    if (kind < 0.6) {
      const s = createFlyState();
      s.flags = this.int(0, 255) & (this.chance(0.5) ? HANDS : 0xff);
      s.epoch = this.chance(0.9) ? epoch : this.int(0, 255);
      s.seq = this.int(0, 65535);
      s.t = now + (this.next() - 0.7) * 2000;
      s.x = (this.next() - 0.5) * 600;
      s.y = this.next() * 100;
      s.z = (this.next() - 0.5) * 600;
      s.yaw = this.next() * 7;
      n = encodeFly(view, this.pick([{ position: 50, pointer: 20, eye: 10 }, { position: 5, pointer: 4, eye: 2 }]), s);
    } else if (kind < 0.85) {
      const bites = Array.from({ length: this.int(0, 20) }, () => ({ food: this.chance(0.7) ? this.int(1, 30) : this.int(0, 2 ** 32 - 1), amount: this.chance(0.9) ? this.next() * 0.01 : (this.weird() as number) }));
      const tag = this.epoch(epoch);
      n = encodeBites(view, this.int(0, 65535), bites, bites.length, typeof tag === "number" ? tag : undefined);
    } else {
      n = this.int(0, view.byteLength);
      for (let i = 0; i < n; i++) view.setUint8(i, this.int(0, 255));
      if (n > 0 && this.chance(0.5)) view.setUint8(0, this.pick([FLY, FLIES, BITES]));
    }
    const bytes = new Uint8Array(view.buffer, 0, n).slice();
    // Now and then one byte of it is wrong, or it is cut short.
    if (bytes.length && this.chance(0.2)) bytes[this.int(0, bytes.length - 1)] = this.int(0, 255);
    return this.chance(0.1) ? bytes.slice(0, this.int(0, bytes.length)) : bytes;
  }
}

type Fake = Link & { open: boolean; seat: Seat | null; key: string };

/**
 * Tables in this process, fed what devices might do until `until()`,
 * checking after each step that they stayed within bounds and that
 * everything they sent is a message the game takes; and at the end, that
 * each comes back from what it keeps. Returns how many steps and messages.
 */
export function fuzzTable(seed: number, until: () => boolean) {
  const f = new Fuzz(seed);
  const clock = { now: 1000, wall: Date.UTC(2026, 5, 1, 12) };
  const tables = new Tables({ now: () => clock.now, wall: () => clock.wall });
  const keys = Array.from({ length: 12 }, (_, i) => `fuzz-key-${seed}-${i}`);
  const devices: Fake[] = [];
  let messages = 0;
  /** Everything the table sends must be a message the game reads; every batch, one it decodes. */
  const scratch = createFlyState();
  const heard = (data: string | Uint8Array, table: Table) => {
    if (typeof data === "string") assert.ok(readServerMessage(data), `the game would drop: ${data.slice(0, 200)}`);
    else assert.ok(decodeFlies(new DataView(data.buffer, data.byteOffset, data.byteLength), table.scale, scratch, () => {}) >= 0, "a batch the game can't read");
  };
  const steps = { count: 0 };
  while (!until()) {
    steps.count++;
    const code = f.pick(CODES);
    const action = f.next();
    if (action < 0.08 || devices.length === 0) {
      // A device says hello, through the table as the server would have it: its checks, the key hashed, Tables.open, then Table.hello.
      const hello = f.hello(code, f.pick(keys)) as Extract<ClientMessage, { type: "hello" }>;
      if (!isHello(hello)) continue;
      const key = hashKey(hello.key);
      const opened = tables.open(key, hello, f.int(0, 2 ** 31));
      if (typeof opened === "string") continue;
      const device: Fake = { open: true, seat: null, key, send: (d) => heard(d, opened), close: () => (device.open = false) };
      const sat = opened.hello(device, key, hello);
      if (typeof sat === "string") continue;
      device.seat = sat;
      devices.push(device);
    } else if (action < 0.12) {
      // One goes, closing its line.
      const device = devices.splice(f.int(0, devices.length - 1), 1)[0];
      for (const t of tables.values()) if (device.seat && t.seats.get(device.seat.id) === device.seat) t.disconnected(device.seat, device);
    } else if (action < 0.3) {
      clock.now += f.int(0, 3000);
      clock.wall += f.int(0, f.chance(0.01) ? 30 * 60_000 : 3000);
      tables.tick();
    } else {
      const device = f.pick(devices);
      const table = [...tables.values()].find((t) => device.seat && t.seats.get(device.seat.id) === device.seat);
      if (!table || !device.seat || !device.open) continue;
      messages++;
      table.receive(device.seat, f.chance(0.6) ? f.text(f.message(device.seat.id, table.epoch)) : f.binary(clock.now, table.epoch));
    }
    for (const t of tables.values()) {
      assert.ok(t.seats.size <= MAX_PLAYERS);
      assert.ok(t.food.foods.length <= WIRE_FOODS_MAX, `${t.food.foods.length} foods`);
      assert.ok(t.balls.length <= MAX_PLAYERS);
      assert.ok(t.happenings.length <= 16);
      assert.ok(t.removed.size <= REMOVED_MAX);
      for (const s of t.seats.values()) assert.ok(Number.isFinite(s.state.x + s.state.y + s.state.z), "a fly somewhere that isn't");
    }
  }
  // What it keeps comes back as it was kept.
  for (const t of tables.values()) {
    const record = JSON.parse(JSON.stringify(t.record())) as unknown;
    assert.ok(isTableRecord(record), `a table that wouldn't come back from its own file: ${JSON.stringify(record).slice(0, 3000)}`);
    Table.restore(record, { now: () => clock.now, wall: () => clock.wall });
  }
  return { steps: steps.count, messages };
}

/**
 * A real server on the loopback, with `sockets` devices at once sending
 * what they might, until `until()`: it must stay up, answer its health
 * check, and seat a device that plays by the rules afterwards.
 */
export async function fuzzServer(seed: number, until: () => boolean, sockets = 6) {
  const f = new Fuzz(seed);
  const dir = await mkdtemp(path.join(os.tmpdir(), "fly-rooms-fuzz-"));
  const errors: unknown[] = [];
  // Behind a proxy, so that each socket can be from an address of its own and the run isn't all one address's few connections.
  const server = await startServer({ port: 0, host: "127.0.0.1", dataDir: dir, trustProxy: true, log: (level, event, fields) => level === "error" && errors.push({ event, ...fields }), listEvery: 50 });
  let sent = 0;
  let opened = 0;
  try {
    const url = `ws://127.0.0.1:${server.port}${ROOMS_PATH}`;
    const live = new Set<WebSocket>();
    const open = () => {
      const ws = new WebSocket(url, { headers: { "X-Forwarded-For": `198.51.${f.int(0, 255)}.${f.int(1, 254)}` } });
      opened++;
      live.add(ws);
      ws.on("error", () => {});
      ws.on("close", () => live.delete(ws));
      ws.on("open", () => {
        const first = f.chance(0.15) ? { type: "browse", v: f.or(PROTOCOL, 0.9) } : f.hello(f.pick(CODES), `fuzz-key-${seed}-${f.int(0, 11)}`);
        ws.send(f.chance(0.1) ? f.binary(0, 0) : f.text(first));
      });
    };
    while (!until()) {
      while (live.size < sockets) open();
      for (const ws of live) {
        if (ws.readyState !== ws.OPEN) continue;
        sent++;
        if (f.chance(0.02)) ws.terminate();
        else ws.send(f.chance(0.6) ? f.text(f.message(f.int(1, MAX_PLAYERS))) : f.binary(0, 0));
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    for (const ws of live) ws.terminate();
    const health = await fetch(`http://127.0.0.1:${server.port}/health`);
    assert.equal(health.status, 200);
    // Someone playing by the rules still sits down.
    const ws = new WebSocket(url);
    const welcomed = await new Promise<string>((resolve, reject) => {
      ws.once("error", reject);
      ws.once("open", () => ws.send(JSON.stringify({ type: "hello", v: PROTOCOL, table: "zzzzzzzzzz", key: "a-device-playing-fair", start: { place: "picnic", light: "clock", weather: "now", zone: "UTC", offset: 0 } } satisfies ClientMessage)));
      ws.once("message", (d: Buffer) => resolve((JSON.parse(d.toString()) as { type: string }).type));
    });
    ws.close();
    assert.equal(welcomed, "welcome");
    assert.deepEqual(errors, [], "nothing a device sent made the server fail");
  } finally {
    await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
  return { sent, opened };
}
