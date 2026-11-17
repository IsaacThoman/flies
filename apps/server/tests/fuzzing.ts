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
  BITES, DROP_ID, EVERYONE, EVERYONE_ROOMS, FLIES, FLY, FOUND_ID, HANDS, MAX_FLIES, MAX_OWN, PROTOCOL, ROOMS_PATH, TABLE_LIGHTS, TABLE_WEATHERS, WIRE_FOODS_MAX,
  createFlyState, decodeFlies, encodeBites, encodeOwn, everyoneCode, everyoneIndex, readServerMessage, stream,
} from "@fly/net";
import type { ClientMessage, ServerMessage, TableStart } from "@fly/net";
import { WORLDS } from "@fly/world";
import { hashKey, isHello, startServer } from "../src/server.ts";
import { REMOVED_MAX, Table, everyonePlace, isTableRecord } from "../src/table.ts";
import type { Link, Seat } from "../src/table.ts";
import { Tables } from "../src/tables.ts";

const PLACES = Object.keys(WORLDS);
const CODES = ["23456789ab", "bcdefghjkm", "npqrstuvwx", EVERYONE, everyoneCode(1), everyoneCode(EVERYONE_ROOMS - 1), everyoneCode(EVERYONE_ROOMS)];
const KEYS = 32;

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
      password: this.chance(0.3) ? this.or(this.pick(["right one", "wrong", "x".repeat(70)])) : undefined, at: this.chance(0.3) ? this.spots() : undefined,
      epoch: this.chance(0.3) ? this.num(300) : undefined, flies: this.chance(0.7) ? this.or(this.int(0, MAX_OWN + 2)) : undefined,
    } as ClientMessage;
  }

  /** Where a device coming back says its flies are: a spot for each (or too many), one spot as a device with one fly once said it, or nonsense. */
  spots(): unknown {
    const spot = () => this.or([this.num(), this.num(), this.num(), this.num()]);
    return this.pick<() => unknown>([() => Array.from({ length: this.int(0, MAX_OWN + 3) }, spot), spot, () => this.weird()])();
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
      () => ({ type: "remove", id: this.or(this.int(0, MAX_FLIES + 1)) }),
      () => ({ type: "flies", count: this.or(this.int(-1, MAX_OWN + 2)) }),
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

  /**
   * A binary message: the device's flies' states or its bites, whole or broken, or noise. `ids`: its flies'; a batch names them mostly,
   * now and then another's, one twice, more than a device brings or none.
   */
  binary(now: number, epoch: number, ids: readonly number[] = [1]): Uint8Array {
    const view = new DataView(new ArrayBuffer(2 + (MAX_OWN + 2) * 64));
    let n: number;
    const kind = this.next();
    if (kind < 0.6) {
      const states = Array.from({ length: this.chance(0.8) ? this.int(1, ids.length) : this.int(0, MAX_OWN + 2) }, (_, i) => {
        const s = createFlyState();
        s.id = this.chance(0.85) ? ids[i % ids.length] : this.int(0, 255);
        s.flags = this.int(0, 255) & (this.chance(0.5) ? HANDS : 0xff);
        s.epoch = this.chance(0.9) ? epoch : this.int(0, 255);
        s.seq = this.int(0, 65535);
        s.t = now + (this.next() - 0.7) * 2000;
        s.x = (this.next() - 0.5) * 600;
        s.y = this.next() * 100;
        s.z = (this.next() - 0.5) * 600;
        s.yaw = this.next() * 7;
        return s;
      });
      n = encodeOwn(view, this.pick([{ position: 50, pointer: 20, eye: 10 }, { position: 5, pointer: 4, eye: 2 }]), states);
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
  const keys = Array.from({ length: KEYS }, (_, i) => `fuzz-key-${seed}-${i}`);
  const devices: Fake[] = [];
  let messages = 0;
  /** Everything the table sends must be a message the game reads; every batch, one it decodes. */
  const scratch = createFlyState();
  const heard = (data: string | Uint8Array, table: Table) => {
    if (typeof data === "string") {
      const m = readServerMessage(data);
      assert.ok(m, `the game would drop: ${data.slice(0, 200)}`);
      if ((m.type === "welcome" || m.type === "seated") && f.chance(0.3)) misread(m);
    }
    else assert.ok(decodeFlies(new DataView(data.buffer, data.byteOffset, data.byteLength), table.scale, scratch, () => {}) >= 0, "a batch the game can't read");
  };
  /** The device's own flies as a hostile server might tell them, a field of one of them (or the list) wrong: dropped, or read as a device brings them. */
  const misread = (m: Extract<ServerMessage, { type: "welcome" | "seated" }>) => {
    const flies: unknown[] = m.flies.map((fly) => ({ ...fly }));
    const pick = f.int(0, flies.length);
    if (pick === flies.length) flies.push(f.chance(0.5) ? { ...(flies[0] as object) } : f.weird());
    else (flies[pick] as Record<string, unknown>)[f.pick(["id", "colour", "at"])] = f.chance(0.5) ? f.weird() : f.int(-1, MAX_FLIES + 1);
    const back = readServerMessage(JSON.stringify({ ...m, flies: f.chance(0.1) ? f.weird() : flies }));
    if (!back) return;
    assert.ok(back.type === "welcome" || back.type === "seated");
    const ids = back.flies.map((fly) => fly.id);
    assert.ok(ids.length >= 1 && ids.length <= MAX_OWN && new Set(ids).size === ids.length && ids.every((id) => Number.isInteger(id) && id >= 1 && id <= MAX_FLIES), JSON.stringify(back.flies));
    if (back.type === "welcome") assert.equal(ids[0], back.id);
  };
  const steps = { count: 0 };
  while (!until()) {
    steps.count++;
    let ticked = false;
    step: {
      const code = f.pick(CODES);
      const action = f.next();
      // More arrivals than departures let the rooms open to everyone fill and overflow.
      if (action < 0.16 || devices.length === 0) {
        // A device says hello, through the table as the server would have it: its checks, the key hashed, Tables.open, then Table.hello.
        const hello = f.hello(code, f.pick(keys)) as Extract<ClientMessage, { type: "hello" }>;
        if (!isHello(hello)) break step;
        const key = hashKey(hello.key);
        const opened = tables.open(key, hello, f.int(0, 2 ** 31));
        if (typeof opened === "string") break step;
        const device: Fake = { open: true, seat: null, key, send: (d) => heard(d, opened), close: () => (device.open = false) };
        const sat = opened.hello(device, key, hello);
        if (typeof sat === "string") break step;
        device.seat = sat;
        devices.push(device);
      } else if (action < 0.2) {
        // One goes, closing its line.
        const device = devices.splice(f.int(0, devices.length - 1), 1)[0];
        for (const t of tables.values()) if (device.seat && t.seats.get(device.seat.id) === device.seat) t.disconnected(device.seat, device);
      } else if (action < 0.38) {
        clock.now += f.int(0, 3000);
        clock.wall += f.int(0, f.chance(0.01) ? 30 * 60_000 : 3000);
        tables.tick();
        ticked = true;
      } else {
        const device = f.pick(devices);
        const table = [...tables.values()].find((t) => device.seat && t.seats.get(device.seat.id) === device.seat);
        if (!table || !device.seat || !device.open) break step;
        messages++;
        table.receive(device.seat, f.chance(0.6) ? f.text(f.message(device.seat.id, table.epoch)) : f.binary(clock.now, table.epoch, device.seat.flies.map((fly) => fly.id)));
      }
    }
    const everyone: Table[] = [];
    for (const t of tables.values()) {
      const index = everyoneIndex(t.code);
      assert.equal(t.everyone, index >= 0);
      if (t.everyone) {
        everyone.push(t);
        assert.equal(t.listed, true);
        assert.equal(t.lock, null);
        assert.equal(t.starter, null);
        assert.deepEqual(t.worldWire, { light: "clock", weather: "now" });
        if (ticked && t.present > 0) assert.equal(t.place, everyonePlace(clock.wall));
      }
      assert.ok(t.seats.size <= MAX_FLIES);
      assert.ok(t.food.foods.length <= WIRE_FOODS_MAX, `${t.food.foods.length} foods`);
      assert.ok(t.balls.length <= MAX_FLIES);
      assert.ok(t.happenings.length <= 16);
      assert.ok(t.removed.size <= REMOVED_MAX);
      // Every seat has 1 to MAX_OWN flies, the first under its own id, and no fly id is two flies'.
      const ids = new Set<number>();
      for (const s of t.seats.values()) {
        assert.ok(s.flies.length >= 1 && s.flies.length <= MAX_OWN, `a device with ${s.flies.length} flies`);
        assert.equal(s.flies[0].id, s.id);
        for (const fly of s.flies) {
          assert.ok(fly.id >= 1 && fly.id <= MAX_FLIES && !ids.has(fly.id), `fly ${fly.id} twice or out of range`);
          ids.add(fly.id);
          assert.ok(Number.isFinite(fly.state.x + fly.state.y + fly.state.z + fly.state.t), "a fly somewhere that isn't");
        }
      }
      assert.ok(t.taken <= MAX_FLIES);
      // Nobody started a room open to everyone, so nobody's seat is kept there once they have gone: what it counts as taken is the flies shown or on the line.
      if (t.everyone) {
        let shown = 0;
        for (const s of t.seats.values()) if (s.present || s.link) shown += s.flies.length;
        assert.equal(t.taken, shown);
      }
    }
    everyone.sort((a, b) => everyoneIndex(a.code) - everyoneIndex(b.code));
    assert.ok(everyone.length > 0, "Everyone always exists");
    assert.deepEqual(everyone.map((t) => t.code), everyone.map((_, i) => everyoneCode(i)));
    const listed = tables.listed();
    const visible = everyone.filter((t) => t.code === EVERYONE || t.present > 0);
    assert.deepEqual(listed.slice(0, visible.length), visible.map((t) => t.room()));
    for (const room of listed) if (everyoneIndex(room.code) >= 0) assert.equal(room.everyone, true);
  }
  // What it keeps comes back as it was kept.
  for (const t of tables.values()) {
    const record = JSON.parse(JSON.stringify(t.record())) as unknown;
    assert.ok(isTableRecord(record), `a table that wouldn't come back from its own file: ${JSON.stringify(record).slice(0, 3000)}`);
    const restored = Table.restore(record, { now: () => clock.now, wall: () => clock.wall });
    assert.equal(restored.everyone, t.everyone);
  }
  return { steps: steps.count, messages, everyoneRooms: [...tables.values()].filter((t) => t.everyone).length };
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
        const first = f.chance(0.15) ? { type: "browse", v: f.or(PROTOCOL, 0.9) } : f.hello(f.pick(CODES), `fuzz-key-${seed}-${f.int(0, KEYS - 1)}`);
        ws.send(f.chance(0.1) ? f.binary(0, 0) : f.text(first));
      });
    };
    while (!until()) {
      while (live.size < sockets) open();
      for (const ws of live) {
        if (ws.readyState !== ws.OPEN) continue;
        sent++;
        if (f.chance(0.02)) ws.terminate();
        else ws.send(f.chance(0.6) ? f.text(f.message(f.int(1, MAX_FLIES))) : f.binary(0, 0, [1, 2, 3, 4]));
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
    const everyone = new WebSocket(url);
    try {
      const welcome = await new Promise<ReturnType<typeof readServerMessage>>((resolve, reject) => {
        everyone.once("error", reject);
        everyone.once("open", () => everyone.send(JSON.stringify({ type: "hello", v: PROTOCOL, table: EVERYONE, key: "a-fair-device-in-everyone" } satisfies ClientMessage)));
        everyone.once("message", (d: Buffer) => resolve(readServerMessage(d.toString())));
      });
      assert.equal(welcome?.type, "welcome");
      assert.ok(welcome?.type === "welcome");
      assert.equal(welcome.room.everyone, true);
      assert.equal(welcome.starter, 0);
    } finally {
      everyone.close();
    }
    assert.deepEqual(errors, [], "nothing a device sent made the server fail");
  } finally {
    await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
  return { sent, opened };
}
