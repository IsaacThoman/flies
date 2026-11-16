// One table shared by several flies: who is at it, and what everyone there
// must agree on. Each fly's brain and body run on its owner's device, which
// is the authority on that fly; the room only checks that what it hears is a
// fly could do, and passes it on to everyone else, about 20 times a second
// in one batch. What the room owns is the table: the food and who ate how
// much, the balls thrown, the light and the weather, the seed and the clock
// from which every device blows the same bubbles, and when a visitor comes.
// No brains and no drawing here; no sockets either (server.ts), so a whole
// room can run in a test.

import type { World } from "@fly/world";
import { TABLE_RADIUS } from "@fly/world";
import {
  AIRBORNE, BITES, COLOURS, FLY, MAX_PLAYERS, PLAYING, PROTOCOL, TableBubbles, TableFood, ballAt, ballProgress,
  batchLength, copyFlyState, createFlyState, decodeBites, encodeFlies, mix, readState, stream, toWire,
} from "@fly/net";
import type { BallWire, ClientMessage, FlyState, HappeningWire, ServerMessage, V3, WorldWire } from "@fly/net";
// The picnic's pacing of its visitors, shared with the game (pure, no three.js).
import { Pace } from "../../web/src/places/picnic/pace.ts";
import type { Happening } from "../../web/src/places/picnic/pace.ts";
import { forecast, hourOfDay } from "../../web/src/scene/weather.ts";
import { BALL_RADIUS } from "../../web/src/tools/hands.ts";

/** The table's high bubbles (the scene has 12, 4 of which bob low past each fly and are each device's own). */
export const TABLE_BUBBLES = 8;
/** A fly can move no faster than this, mm/s (a take-off is at most about 700), and on its feet no faster than MAX_WALK (it walks at 5 to 16): faster is a lie, or a glitch. */
export const MAX_SPEED = 1500;
export const MAX_WALK = 60;
/**
 * A fly refused this many times running (half a second of states) is taken
 * where it now says it is: it really is there (a device that stalled and
 * caught up), or the lie is at least slowed to a jump every half second.
 */
const RESYNC = 10;
/** And its device's clock no further ahead of the room's than this, ms. */
const AHEAD = 500;
/** Food changes are told at most this often, ms. */
const FOOD_EVERY = 100;
/** Seconds each visitor keeps the table busy, roughly, so the room doesn't send another of it meanwhile. */
const BUSY: Readonly<Record<Happening, number>> = { gust: 10, gull: 80, leaf: 40, butterfly: 100, ladybird: 120, juice: 0, boat: 240 };
const LIGHTS = ["clock", "morning", "noon", "golden", "dusk", "night"];
const WEATHERS = ["now", "clear", "overcast", "mist", "rain"];

export type Send = (data: string | Uint8Array, reliable: boolean) => void;

export type Player = {
  id: number;
  colour: string;
  send: Send;
  /** Its fly as last heard, and whether there is one yet. */
  readonly state: FlyState;
  heard: boolean;
  /** A state arrived since the last batch. */
  fresh: boolean;
  /** Room time the last state arrived, ms. */
  heardAt: number;
  /** The last of its bites counted. */
  ack: number;
  /** States refused, as not something a fly could do; refused in a row; and times it was taken where it said after all. */
  refused: number;
  strikes: number;
  resyncs: number;
  /** Bytes and messages it has sent and been sent. */
  bytesIn: number;
  bytesOut: number;
  messagesIn: number;
  messagesOut: number;
};

export type RoomOptions = {
  world: World;
  seed: number;
  /** Room time, ms (performance.now() on the server). */
  now: () => number;
  /** The table's local hours since the epoch now (its clock, for the light and the forecast). */
  hours: () => number;
  /** Relay each state as it comes rather than in a batch. */
  immediate?: boolean;
};

export class Room {
  readonly players = new Map<number, Player>();
  readonly food: TableFood;
  readonly bubbles: TableBubbles;
  readonly balls: BallWire[] = [];
  readonly happenings: HappeningWire[] = [];
  readonly world: WorldWire = { light: "clock", weather: "now" };
  readonly seed: number;
  readonly #options: RoomOptions;
  readonly #scratch = createFlyState();
  readonly #batch = new DataView(new ArrayBuffer(2 + MAX_PLAYERS * 64));
  readonly #states: FlyState[] = [];
  readonly #pace: Pace;
  readonly #busy = new Map<Happening, number>();
  #happenings = 0;
  #foodAt = 0;
  #lastTick = 0;

  constructor(options: RoomOptions) {
    this.#options = options;
    this.seed = options.seed >>> 0;
    this.food = new TableFood(options.world, options.world.place.patches);
    this.bubbles = new TableBubbles(this.seed, options.world, TABLE_BUBBLES);
    const next = stream(mix(this.seed, 0x7ace));
    this.#pace = new Pace({ next, range: (lo, hi) => lo + (hi - lo) * next() });
    this.#lastTick = options.now();
  }

  get now() {
    return this.#options.now();
  }

  /** A new player; null if the table is full. */
  join(send: Send): Player | null {
    let id = 1;
    while (this.players.has(id)) id++;
    if (id > MAX_PLAYERS) return null;
    const player: Player = { id, colour: COLOURS[(id - 1) % COLOURS.length], send, state: createFlyState(), heard: false, fresh: false, heardAt: 0, ack: 0, refused: 0, strikes: 0, resyncs: 0, bytesIn: 0, bytesOut: 0, messagesIn: 0, messagesOut: 0 };
    this.players.set(id, player);
    this.#broadcast({ type: "joined", id, colour: player.colour }, player);
    return player;
  }

  leave(player: Player) {
    if (!this.players.delete(player.id)) return;
    this.#broadcast({ type: "left", id: player.id });
  }

  /** Everything a device says. */
  receive(player: Player, data: string | Uint8Array) {
    player.bytesIn += typeof data === "string" ? data.length : data.byteLength;
    player.messagesIn++;
    if (typeof data === "string") this.#json(player, data);
    else this.#binary(player, new DataView(data.buffer, data.byteOffset, data.byteLength));
  }

  #send(player: Player, message: ServerMessage) {
    const text = JSON.stringify(message);
    player.bytesOut += text.length;
    player.messagesOut++;
    player.send(text, true);
  }

  #broadcast(message: ServerMessage, except?: Player) {
    const text = JSON.stringify(message);
    for (const p of this.players.values()) {
      if (p === except) continue;
      p.bytesOut += text.length;
      p.messagesOut++;
      p.send(text, true);
    }
  }

  #json(player: Player, text: string) {
    let m: ClientMessage;
    try {
      m = JSON.parse(text) as ClientMessage;
    } catch {
      return;
    }
    const now = this.now;
    switch (m.type) {
      case "hello":
        if (m.v !== PROTOCOL) {
          this.#send(player, { type: "refused", reason: `protocol ${m.v}, this room speaks ${PROTOCOL}` });
          return;
        }
        this.#send(player, {
          type: "welcome",
          v: PROTOCOL,
          id: player.id,
          colour: player.colour,
          seed: this.seed,
          now,
          hours: this.#options.hours(),
          world: { ...this.world },
          players: [...this.players.values()].filter((p) => p !== player).map((p) => ({ id: p.id, colour: p.colour })),
          foods: this.food.foods.map(toWire),
          balls: this.balls.filter((b) => ballProgress(b, now) < 1),
          happenings: this.happenings.filter((h) => now - h.at < 5000),
          bubbles: this.bubbles.snapshot(),
        });
        return;
      case "ping":
        this.#send(player, { type: "pong", t: m.t, now });
        return;
      case "drop": {
        const food = this.food.drop(player.id, m.id, m.kind, m.x, m.z);
        if (food) this.#broadcast({ type: "drop", by: player.id, id: food.id, kind: m.kind, x: food.x, z: food.z, at: clampTime(m.at, now) });
        return;
      }
      case "ball": {
        if (!isV3(m.from) || !isV3(m.via) || !isV3(m.to)) return;
        // A ball starts no later than a second from now, and is the thrower's only one in the air.
        const at = Math.min(now + 1000, clampTime(m.at, now));
        const prior = this.balls.findIndex((b) => b.by === player.id);
        if (prior >= 0) this.balls.splice(prior, 1);
        const ball: BallWire = { by: player.id, at, from: m.from, via: m.via, to: m.to };
        this.balls.push(ball);
        this.#broadcast({ type: "ball", ...ball }, player);
        return;
      }
      case "world":
        this.setWorld(m.light, m.weather);
        return;
      case "pop": {
        // A device bursting a bubble with its own fly: believed if that bubble was there then.
        if (this.bubbles.pop(m.slot, m.cycle, m.at / 1000)) {
          this.#broadcast({ type: "pop", slot: m.slot, cycle: m.cycle, at: m.at }, player);
        }
        return;
      }
      case "found": {
        const food = this.food.found(m.id, m.name, m.x, m.z, m.r, m.sweet);
        if (food) this.#broadcast({ type: "found", food: toWire(food) }, player);
        return;
      }
    }
  }

  /** The table's light and weather, chosen by a player (or for a test); told to everyone. */
  setWorld(light?: string, weather?: string) {
    if (light !== undefined && LIGHTS.includes(light)) this.world.light = light;
    if (weather !== undefined && WEATHERS.includes(weather)) this.world.weather = weather;
    this.#broadcast({ type: "world", ...this.world });
  }

  #binary(player: Player, view: DataView) {
    if (view.byteLength < 1) return;
    const type = view.getUint8(0);
    if (type === FLY) {
      const s = this.#scratch;
      if (readState(view, 1, s) < 0) return;
      const now = this.now;
      if (!this.#plausible(player, s, now)) {
        player.refused++;
        if (++player.strikes < RESYNC || !this.#where(s)) return;
        player.resyncs++;
      }
      player.strikes = 0;
      copyFlyState(s, player.state);
      player.state.id = player.id;
      player.heard = true;
      player.fresh = true;
      player.heardAt = now;
      if (this.#options.immediate) this.#relay([player.state]);
    } else if (type === BITES) {
      const st = player.state;
      const now = this.now;
      const seq = decodeBites(view, (food, amount) => {
        if (player.heard) this.food.bite(player.id, food, amount, st.x, st.z, now);
      });
      if (seq >= 0) player.ack = seq;
    }
  }

  /** Whether a fly could be here, from where it was last. */
  #plausible(player: Player, s: FlyState, now: number) {
    if (s.t > now + AHEAD || !this.#where(s)) return false;
    if (!player.heard) return true;
    const was = player.state;
    if (s.t <= was.t) return false;
    const moved = Math.hypot(s.x - was.x, s.y - was.y, s.z - was.z);
    const speed = (s.flags | was.flags) & AIRBORNE ? MAX_SPEED : MAX_WALK;
    return moved <= (speed * (s.t - was.t)) / 1000 + 3;
  }

  /** Whether a fly could be at this spot at all. */
  #where(s: FlyState) {
    if (!Number.isFinite(s.x + s.y + s.z)) return false;
    const world = this.#options.world;
    // Over the table, or in the air not far past it; never inside what stands on it.
    if (Math.hypot(s.x, s.z) > TABLE_RADIUS + 400 || s.y > world.place.ceiling + 100) return false;
    if (world.onTable(s.x, s.z) && s.y < world.heightAt(s.x, s.z) - 1.5) return false;
    return !(!(s.flags & AIRBORNE) && world.onTable(s.x, s.z) && Math.abs(s.y - world.heightAt(s.x, s.z)) > 3);
  }

  /** Sends each player the others' fly states that came in since the last time. */
  #relay(states: readonly FlyState[]) {
    for (const p of this.players.values()) {
      let n = 0;
      for (const s of states) if (s.id !== p.id) this.#states[n++] = s;
      if (n === 0) continue;
      const bytes = batchLength(this.#states, n);
      if (bytes > this.#batch.byteLength) continue;
      encodeFlies(this.#batch, this.#states, n);
      p.bytesOut += bytes;
      p.messagesOut++;
      p.send(new Uint8Array(this.#batch.buffer, 0, bytes), false);
    }
  }

  /** The room's beat, every SEND_EVERY ms (@fly/net): the batch, the food, the bubbles, the visitors. */
  tick() {
    const now = this.now;
    const dt = Math.max(0, (now - this.#lastTick) / 1000);
    this.#lastTick = now;
    if (!this.#options.immediate) {
      const fresh: FlyState[] = [];
      for (const p of this.players.values()) {
        if (!p.fresh) continue;
        p.fresh = false;
        fresh.push(p.state);
      }
      if (fresh.length) this.#relay(fresh);
    }
    this.food.update(dt);
    if (now - this.#foodAt >= FOOD_EVERY) {
      this.#foodAt = now;
      const changes = this.food.flush();
      if (changes) {
        const eaten: Record<number, number> = {};
        for (const [id, amount] of this.food.eaten) eaten[id] = Math.round(amount * 1e4) / 1e4;
        // Each player is told which of its own bites have been counted.
        for (const p of this.players.values()) this.#send(p, { type: "food", ack: p.ack, ...changes, eaten });
      }
    }
    // Balls that have flown are forgotten; while one flies, the bubbles it hits burst.
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      const k = ballProgress(b, now);
      if (k >= 1) this.balls.splice(i, 1);
      else if (k > 0) this.bubbles.hitBy(Math.max(b.at, now - dt * 1000) / 1000, now / 1000, BALL_RADIUS, (t, out) => ballAt(b, ballProgress(b, t * 1000), out));
    }
    this.bubbles.rain = this.#rain();
    this.bubbles.update(now / 1000);
    this.#visitors(dt, now);
  }

  /** The place's goings-on start when nobody at the table is using the remote, as alone. */
  #visitors(dt: number, now: number) {
    let quiet = this.players.size > 0;
    for (const p of this.players.values()) if (p.heard && p.state.flags & PLAYING) quiet = false;
    const next = this.#pace.tick(dt, quiet, (h) => this.#can(h, now));
    if (next) this.happen(next, now);
  }

  /** Starts a happening now (the pace's, or one asked for), told to everyone with the seed they reproduce it from. */
  happen(kind: Happening, now = this.now): HappeningWire {
    const h: HappeningWire = { kind, seed: mix(this.seed, 0x4a99, ++this.#happenings), at: now };
    this.happenings.push(h);
    if (this.happenings.length > 16) this.happenings.shift();
    this.#busy.set(kind, now + BUSY[kind] * 1000);
    this.#broadcast({ type: "happening", ...h });
    return h;
  }

  #can(h: Happening, now: number) {
    if ((this.#busy.get(h) ?? 0) > now) return false;
    const hour = hourOfDay(this.#options.hours());
    const light = this.world.light;
    const day = light === "clock" ? hour > 7 && hour < 19.5 : light !== "night" && light !== "dusk";
    const rain = this.#rain();
    switch (h) {
      case "gull":
      case "butterfly":
      case "ladybird":
      case "boat":
        return day && rain < 0.05;
      case "leaf":
        return rain < 0.4;
      default:
        return true;
    }
  }

  /** How hard it is raining at the table, by its weather. */
  #rain() {
    const w = this.world.weather;
    if (w === "rain") return 1;
    if (w !== "now") return 0;
    return forecast(this.#options.hours(), scratchMix).rain;
  }

  /** What each player has sent and been sent, and what was refused. */
  stats() {
    return {
      players: [...this.players.values()].map((p) => ({ id: p.id, bytesIn: p.bytesIn, bytesOut: p.bytesOut, messagesIn: p.messagesIn, messagesOut: p.messagesOut, refused: p.refused, resyncs: p.resyncs })),
      eaten: Object.fromEntries(this.food.eaten),
      refusedBites: { ...this.food.refused },
      foods: this.food.foods.length,
      bubbles: this.bubbles.snapshot(),
      happenings: this.happenings.length,
    };
  }
}

const scratchMix = { cloud: 0, mist: 0, rain: 0, wind: 0 };

const isV3 = (v: unknown): v is V3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 10_000);
const clampTime = (t: unknown, now: number) => (typeof t === "number" && Number.isFinite(t) ? Math.max(now - 2000, Math.min(now + 1000, t)) : now);
