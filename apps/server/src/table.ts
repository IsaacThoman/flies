// One table shared by up to eight people's flies: who is at it, and what
// everyone there must agree on. Each fly's brain and body run on its owner's
// device, which is the authority on that fly; the table only keeps what it
// hears within what a fly could do (@fly/net, limits.ts) and passes it on to
// everyone else, about 20 times a second in one batch. What the table owns
// is the rest of the world there: the place, the food and who ate how much,
// the balls thrown, the light and the weather by the clock of whoever
// started it, the seed and the clock every device blows the same bubbles
// from, and when a visitor comes. It is a room too: it has a name, may be
// listed for anyone browsing to find, and may be locked with a password
// (lock.ts). No brains, no drawing and no sockets here (server.ts), so a
// whole table can run in a test.

import { BALL_RADIUS, Pace, VentilationClock, World, WORLDS, forecast, hourOfDay } from "@fly/world";
import type { Happening } from "@fly/world";
import {
  AIRBORNE, AWAY, BITES, CLOSE, TABLE_BUBBLES, COLOURS, FLIES_MAX, FLY, LIMITS, Leash, MAX_PLAYERS, PLAYING, PROTOCOL, ROOM_LIMITS, Rate, TABLE_LIGHTS,
  TABLE_WEATHERS, TableBubbles, TableFood, WIRE_FOODS_MAX, ballProgress, bitesEpoch, createFlyState, decodeBites, encodeFlies, isTableCode, mayReturnTo, mix, readState,
  roomName, roomTime, spawnSpot, stream, tableHours, toWire, wireScale,
} from "@fly/net";
import type {
  BallWire, ClientMessage, FlyState, FoodWire, HappeningWire, PlayerWire, Refusal, RoomInfo, RoomWire, ServerMessage, Spot, TableStart, V3, WireScale,
  WorldWire,
} from "@fly/net";
import { isLock } from "./lock.ts";
import type { Lock } from "./lock.ts";

/** A room started without a name (by a page from before rooms had them) is called this. */
export const UNNAMED = "Flies";

/** At most this many keys a table remembers removing; past it, the longest-removed may sit down again. */
export const REMOVED_MAX = 256;

/** A fly whose device has stopped (or gone) is kept at the table, resting, this long (ms); then it leaves. */
export const AWAY_LIMIT = 10 * 60_000;
/** A device that has said nothing for this long (ms) has stopped, whatever it last said. */
export const SILENT_AFTER = 5_000;
/** Food changes are told at most this often, ms. */
const FOOD_EVERY = 100;
/** Happenings a newcomer is told of, if they began this recently (ms): any older are somewhere else by now. */
const HAPPENING_KEPT = 5_000;
/** What a place's goings-on can be: the picnic's visitors, and the restaurant's ventilation coming on. */
export type Going = Happening | "ventilation";
/** Seconds each visitor keeps the table busy, roughly, so the table doesn't send another of it meanwhile (the ventilation keeps its own clock). */
const BUSY: Readonly<Record<Going, number>> = { gust: 10, gull: 80, leaf: 40, butterfly: 100, ladybird: 120, juice: 0, boat: 240, ventilation: 0 };

/** A device's line to the table. */
export type Link = {
  send(data: string | Uint8Array): void;
  close(code: number, reason: string): void;
};

/** A place at the table, kept for whoever has the key that took it: its id and colour come back with them. */
export type Seat = {
  id: number;
  colour: string;
  /** The device's key, hashed: nothing that could be used to sit here oneself is kept. */
  key: string;
  /** Its fly as the table has it, and whether it has been set down. */
  readonly state: FlyState;
  readonly leash: Leash;
  link: Link | null;
  /** Shown at the table (not yet gone after a long time away). */
  present: boolean;
  /** Its device has stopped, and since when (wall clock, ms). */
  away: boolean;
  awaySince: number;
  /** When the table last heard from it (room ms) and when it was last seen (wall clock, ms). */
  heardAt: number;
  lastSeen: number;
  /** A state came since the last batch. */
  fresh: boolean;
  /** The last of its bites counted. */
  ack: number;
  readonly rates: { [K in keyof typeof LIMITS]: Rate };
  /** States cut short or held by the leash, and messages dropped for coming too fast. */
  shortened: number;
  dropped: number;
};

/** A table as it is kept between runs of the server. */
export type TableRecord = {
  code: string;
  created: number;
  seed: number;
  place: string;
  epoch: number;
  world: WorldWire;
  zone: string;
  offset: number;
  starter: string;
  removed: string[];
  /** `gone`: it had left (said goodbye, or was away too long), so a restart doesn't bring its fly back. */
  seats: { id: number; key: string; at: [x: number, y: number, z: number, yaw: number]; airborne: boolean; lastSeen: number; gone?: boolean }[];
  foods: FoodWire[];
  /** How much each player has eaten by the table's account, by id (older files have none). */
  eaten?: [id: number, amount: number][];
  /** The room's name, whether it is listed, and its lock (older files have none: unnamed, unlisted, open to its link). */
  name?: string;
  listed?: boolean;
  lock?: Lock | null;
};

export type TableOptions = {
  /** Room time, ms: the server's monotonic clock. */
  now: () => number;
  /** The wall clock, ms since 1970. */
  wall: () => number;
  /** Something worth a line in the log. */
  log?: (event: string, fields: Record<string, unknown>) => void;
};

const isV3 = (v: unknown): v is V3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 10_000);
const isSpot = (v: unknown): v is Spot => Array.isArray(v) && (v.length === 3 || v.length === 4) && v.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 10_000);
const finite = (...xs: unknown[]) => xs.every((x) => typeof x === "number" && Number.isFinite(x));
const text = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
const isSeatRecord = (v: unknown, ids: Set<number>) => {
  const r = v as TableRecord["seats"][number];
  if (!r || typeof r !== "object" || !Number.isInteger(r.id) || r.id < 1 || r.id > MAX_PLAYERS || ids.has(r.id)) return false;
  ids.add(r.id);
  return text(r.key, 64) && Array.isArray(r.at) && r.at.length === 4 && r.at.every((x) => finite(x) && Math.abs(x) < 10_000) && typeof r.airborne === "boolean" && finite(r.lastSeen) && (r.gone === undefined || typeof r.gone === "boolean");
};
const isFoodRecord = (v: unknown) =>
  Array.isArray(v) && (v.length === 9 || v.length === 10) && finite(v[0], v[3], v[4], v[5], v[6], v[7]) && text(v[1], 16) && text(v[2], 40) && (v[8] === 0 || v[8] === 1) && (v[9] === undefined || finite(v[9]));

/**
 * Whether something read back from the file of tables is a table as it was
 * kept: every field of the shape `record()` writes, in bounds, so that a
 * damaged or hand-edited file can't bring back a table that breaks.
 */
export function isTableRecord(v: unknown): v is TableRecord {
  const r = v as TableRecord;
  if (!r || typeof r !== "object" || !isTableCode(r.code) || !finite(r.created, r.seed, r.offset) || !text(r.place, 32) || !Number.isInteger(r.epoch) || r.epoch < 0 || r.epoch > 255) return false;
  if (!r.world || !text(r.world.light, 16) || !text(r.world.weather, 16) || !text(r.zone, 64) || !text(r.starter, 64)) return false;
  if (!Array.isArray(r.removed) || r.removed.length > REMOVED_MAX || !r.removed.every((k) => text(k, 64))) return false;
  const ids = new Set<number>();
  if (!Array.isArray(r.seats) || r.seats.length > MAX_PLAYERS || !r.seats.every((seat) => isSeatRecord(seat, ids))) return false;
  if (!Array.isArray(r.foods) || r.foods.length > WIRE_FOODS_MAX || !r.foods.every(isFoodRecord)) return false;
  if (r.eaten !== undefined && (!Array.isArray(r.eaten) || r.eaten.length > MAX_PLAYERS || !r.eaten.every((e) => Array.isArray(e) && e.length === 2 && finite(e[0], e[1])))) return false;
  return (r.name === undefined || roomName(r.name) === r.name) && (r.listed === undefined || typeof r.listed === "boolean") && (r.lock === undefined || r.lock === null || isLock(r.lock));
}

const clampTime = (t: unknown, now: number) => (typeof t === "number" && Number.isFinite(t) ? Math.max(now - 2000, Math.min(now + 1000, t)) : now);

/** A zone's offset from UTC at a moment, minutes east, from its name; `fallback` if the name isn't one. */
export function zoneOffset(zone: string, at: number, fallback: number): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(new Date(at));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    const minutes = Math.round((local - Math.floor(at / 60_000) * 60_000) / 60_000);
    return Number.isFinite(minutes) ? minutes : fallback;
  } catch {
    return fallback;
  }
}

export class Table {
  readonly code: string;
  readonly created: number;
  readonly seed: number;
  /** Seats by id; a seat is kept (gone, perhaps) for as long as the table is, so a returning player has its colour back. */
  readonly seats = new Map<number, Seat>();
  readonly world: World;
  readonly food: TableFood;
  readonly balls: BallWire[] = [];
  readonly happenings: HappeningWire[] = [];
  readonly worldWire: WorldWire;
  place: string;
  epoch: number;
  /** How fly states go on the wire in this place. */
  scale: WireScale;
  bubbles: TableBubbles | null = null;
  /** Keys that were removed from the table, hashed: they can't sit down again. */
  readonly removed: Set<string>;
  /** What it is called; whether anyone browsing sees it; its password, hashed, if it has one. */
  readonly name: string;
  readonly listed: boolean;
  readonly lock: Lock | null;
  /** Tries at its password, from anyone: a lock that can be tried only so often. */
  readonly knocks = new Rate(...ROOM_LIMITS.knocksAtRoom);
  readonly #starter: string;
  readonly #zone: string;
  #offset: number;
  readonly #options: TableOptions;
  readonly #scratch = createFlyState();
  readonly #batch = new DataView(new ArrayBuffer(FLIES_MAX));
  readonly #fresh: FlyState[] = [];
  readonly #others: FlyState[] = [];
  #pace: Pace;
  readonly #busy = new Map<Going, number>();
  #ventilation: VentilationClock | null = null;
  #happenings = 0;
  #foodAt = 0;
  #lastTick: number;
  #offsetAt = 0;
  readonly #mix = { cloud: 0, mist: 0, rain: 0, wind: 0 };

  constructor(code: string, start: TableStart, starterKey: string, seed: number, options: TableOptions, record?: TableRecord, lock: Lock | null = record?.lock ?? null) {
    this.code = code;
    this.name = roomName(start.name) ?? UNNAMED;
    this.listed = start.listed === true;
    this.lock = lock;
    this.#options = options;
    this.seed = seed >>> 0;
    this.created = record?.created ?? options.wall();
    this.place = Object.hasOwn(WORLDS, start.place) ? start.place : "picnic";
    this.epoch = record?.epoch ?? 0;
    this.world = new World(WORLDS[this.place]);
    this.scale = wireScale(this.world.place);
    this.food = new TableFood(this.world, this.world.place.patches);
    this.worldWire = { light: TABLE_LIGHTS.includes(start.light as never) ? start.light : "clock", weather: TABLE_WEATHERS.includes(start.weather as never) ? start.weather : "now" };
    this.#starter = starterKey;
    this.#zone = typeof start.zone === "string" ? start.zone.slice(0, 64) : "";
    this.#offset = finite(start.offset) ? Math.max(-14 * 60, Math.min(14 * 60, Math.round(start.offset))) : 0;
    this.removed = new Set(record?.removed ?? []);
    this.#pace = this.#newPace();
    this.#lastTick = options.now();
    this.#settle();
    if (record) {
      this.food.restore(record.foods);
      for (const [id, amount] of record.eaten ?? []) this.food.eaten.set(id, amount);
      const now = options.now();
      for (const r of record.seats) {
        const seat = this.#seat(r.id, r.key);
        const s = seat.state;
        [s.x, s.y, s.z, s.yaw] = r.at;
        s.flags = (r.airborne ? AIRBORNE : 0) | AWAY;
        s.t = now;
        s.epoch = this.epoch;
        seat.lastSeen = r.lastSeen;
        // Away since it was last seen: the ten minutes run on across a restart.
        seat.away = true;
        seat.awaySince = r.lastSeen;
        seat.present = !r.gone && options.wall() - r.lastSeen < AWAY_LIMIT;
      }
    }
  }

  /** Restores a table as it was kept. */
  static restore(record: TableRecord, options: TableOptions): Table {
    const start: TableStart = { place: record.place, light: record.world.light, weather: record.world.weather, zone: record.zone, offset: record.offset, name: record.name, listed: record.listed };
    return new Table(record.code, start, record.starter, record.seed, options, record);
  }

  /** The table as it is to be kept. */
  record(): TableRecord {
    return {
      code: this.code,
      created: this.created,
      seed: this.seed,
      place: this.place,
      epoch: this.epoch,
      world: { ...this.worldWire },
      zone: this.#zone,
      offset: this.#offset,
      starter: this.#starter,
      removed: [...this.removed],
      seats: [...this.seats.values()].map((s) => ({ id: s.id, key: s.key, at: [s.state.x, s.state.y, s.state.z, s.state.yaw], airborne: !!(s.state.flags & AIRBORNE), lastSeen: s.lastSeen, gone: !s.present })),
      foods: this.food.foods.map(toWire),
      eaten: [...this.food.eaten],
      name: this.name,
      listed: this.listed,
      lock: this.lock,
    };
  }

  /** What it says of itself: in its welcome, and in the list of rooms. */
  get info(): RoomInfo {
    return { name: this.name, listed: this.listed, locked: !!this.lock };
  }

  room(): RoomWire {
    return { code: this.code, name: this.name, place: this.place, flies: this.present, locked: !!this.lock };
  }

  /** Whether a device with this key (hashed) may sit down without the password: it has sat here before, or started the table. */
  knows(key: string) {
    if (key === this.#starter) return true;
    for (const s of this.seats.values()) if (s.key === key) return true;
    return false;
  }

  get now() {
    return this.#options.now();
  }

  /** The table's clock: local hours since the epoch where its starter is. */
  get hours() {
    return tableHours(0, 0, this.#options.wall(), this.#offset);
  }

  /** How many devices are at it now, and how many flies are shown there. */
  get connected() {
    let n = 0;
    for (const s of this.seats.values()) if (s.link) n++;
    return n;
  }

  get present() {
    let n = 0;
    for (const s of this.seats.values()) if (s.present) n++;
    return n;
  }

  /** The seat whose key started the table. */
  get starter(): Seat | null {
    for (const s of this.seats.values()) if (s.key === this.#starter) return s;
    return null;
  }

  #newPace() {
    const next = stream(mix(this.seed, this.epoch, 0x7ace));
    return new Pace({ next, range: (lo, hi) => lo + (hi - lo) * next() });
  }

  /** What follows the place: its bubbles (only the picnic has them, starting now), the restaurant's ventilation, and nothing of what was happening in the last. */
  #settle() {
    this.#freshBubbles();
    this.#ventilation = this.place === "restaurant" ? new VentilationClock(stream(mix(this.seed, this.epoch, 0x7e47))) : null;
    this.balls.length = 0;
    this.happenings.length = 0;
    this.#busy.clear();
  }

  /** The bubbles start afresh now: every device is told them as they stand (a welcome, a move). */
  #freshBubbles() {
    this.bubbles = this.place === "picnic" ? new TableBubbles(mix(this.seed, this.epoch), this.world, TABLE_BUBBLES, this.now / 1000) : null;
  }

  #seat(id: number, key: string): Seat {
    const seat: Seat = {
      id,
      colour: COLOURS[(id - 1) % COLOURS.length],
      key,
      state: createFlyState(),
      leash: new Leash(),
      link: null,
      present: true,
      away: false,
      awaySince: 0,
      heardAt: this.now,
      lastSeen: this.#options.wall(),
      fresh: false,
      ack: 0,
      rates: { throws: rate("throws"), drops: rate("drops"), found: rate("found"), pops: rate("pops"), changes: rate("changes"), messages: rate("messages") },
      shortened: 0,
      dropped: 0,
    };
    seat.state.id = id;
    seat.state.epoch = this.epoch;
    this.seats.set(id, seat);
    return seat;
  }

  /**
   * A device says hello with its key (hashed by the server). Returns its seat,
   * or the refusal; on a seat, the device has been welcomed.
   */
  hello(link: Link, key: string, message: Extract<ClientMessage, { type: "hello" }>): Seat | Refusal {
    if (message.v !== PROTOCOL) return "version";
    if (this.removed.has(key)) return "removed";
    // Nobody has been here since its beat stopped (Tables.tick): nobody has seen its bubbles, which start afresh rather than catch up on all that time.
    if (this.connected === 0 && this.present === 0) this.#freshBubbles();
    const now = this.now;
    const wall = this.#options.wall();
    let seat: Seat | null = null;
    for (const s of this.seats.values()) if (s.key === key) seat = s;
    let at: Spot;
    const returning = !!seat;
    if (seat) {
      // Back: on this or another device with the same key. The fly that was here stays here.
      if (seat.link) seat.link.close(CLOSE.elsewhere, "elsewhere");
      const s = seat.state;
      const away = (wall - seat.lastSeen) / 1000;
      // Where it is counts only in the place the table is in: a device away while the table moved has its fly somewhere else.
      const here = message.epoch === this.epoch && isSpot(message.at);
      at = here && mayReturnTo(this.world, message.at!, s.x, s.y, s.z, away) ? message.at! : [s.x, s.z, s.yaw, s.y];
    } else {
      let id = 1;
      while (this.seats.has(id) && id <= MAX_PLAYERS) id++;
      if (id > MAX_PLAYERS) {
        // Full: the seat of whoever has been gone longest is given up, if anyone has.
        let oldest: Seat | null = null;
        // Never the starter's: theirs is the table.
        for (const s of this.seats.values()) if (!s.present && !s.link && s.key !== this.#starter && (!oldest || s.lastSeen < oldest.lastSeen)) oldest = s;
        if (!oldest) return "full";
        this.seats.delete(oldest.id);
        id = oldest.id;
      }
      seat = this.#seat(id, key);
      at = spawnSpot(this.world, id);
    }
    const s = seat.state;
    s.x = at[0];
    s.z = at[1];
    s.yaw = at[2];
    s.y = this.world.heightAt(s.x, s.z, at[3]);
    at = [s.x, s.z, s.yaw, s.y];
    s.flags = 0;
    s.t = now;
    s.epoch = this.epoch;
    seat.leash.reset();
    seat.link = link;
    seat.heardAt = now;
    seat.lastSeen = wall;
    seat.fresh = true;
    seat.ack = 0;
    this.food.takeMeal(seat.id);
    const shown = returning && seat.present;
    seat.present = true;
    seat.away = false;
    this.#send(seat, {
      type: "welcome",
      v: PROTOCOL,
      id: seat.id,
      colour: seat.colour,
      starter: this.starter?.id ?? 0,
      seed: this.seed,
      now,
      wall,
      offset: this.#offset,
      place: this.place,
      epoch: this.epoch,
      world: { ...this.worldWire },
      players: [...this.seats.values()].filter((p) => p !== seat && p.present).map((p) => this.#player(p)),
      foods: this.food.foods.map(toWire),
      balls: this.balls.filter((b) => ballProgress(b, now) < 1),
      happenings: this.happenings.filter((h) => now - h.at < HAPPENING_KEPT),
      bubbles: this.bubbles?.snapshot() ?? [],
      at,
      room: this.info,
    });
    // And everyone else's fly where it is now, resting ones too, so the newcomer sees them before they next move.
    const others = this.#others;
    others.length = 0;
    for (const p of this.seats.values()) if (p !== seat && p.present) others.push(p.state);
    if (others.length) link.send(new Uint8Array(this.#batch.buffer, 0, encodeFlies(this.#batch, this.scale, others)));
    // Everyone else sees it come, or wake if they were already seeing it rest.
    this.#broadcast(shown ? { type: "away", id: seat.id, away: false } : { type: "joined", ...this.#player(seat) }, seat);
    this.#options.log?.("joined", { table: this.code, player: seat.id, returning });
    return seat;
  }

  #player(seat: Seat): PlayerWire {
    return { id: seat.id, colour: seat.colour, away: seat.away };
  }

  /** The device's line closed. Its fly stays, resting, until it comes back or AWAY_LIMIT passes. */
  disconnected(seat: Seat, link: Link) {
    if (seat.link !== link) return;
    seat.link = null;
    seat.lastSeen = this.#options.wall();
    this.#update(seat);
  }

  /** The player left the table for good: its fly goes now. Its seat (and colour) stays theirs. */
  #bye(seat: Seat) {
    seat.link?.close(CLOSE.left, "left");
    seat.link = null;
    seat.present = false;
    seat.away = true;
    seat.awaySince = this.#options.wall();
    this.#broadcast({ type: "left", id: seat.id }, seat);
    this.#options.log?.("left", { table: this.code, player: seat.id });
  }

  /** Everything a device says. */
  receive(seat: Seat, data: string | Uint8Array) {
    const now = this.now;
    if (!seat.rates.messages.take(now)) {
      seat.dropped++;
      return;
    }
    seat.heardAt = now;
    seat.lastSeen = this.#options.wall();
    if (typeof data === "string") this.#json(seat, data);
    else this.#binary(seat, new DataView(data.buffer, data.byteOffset, data.byteLength));
  }

  #send(seat: Seat, message: ServerMessage) {
    seat.link?.send(JSON.stringify(message));
  }

  #broadcast(message: ServerMessage, except?: Seat) {
    const text = JSON.stringify(message);
    for (const s of this.seats.values()) if (s !== except && s.link) s.link.send(text);
  }

  #json(seat: Seat, text: string) {
    let m: ClientMessage;
    try {
      m = JSON.parse(text) as ClientMessage;
    } catch {
      return;
    }
    if (!m || typeof m !== "object") return;
    const now = this.now;
    // Done in a place the table has since left (in flight as it moved): there is nothing of that place here to do it to.
    if ((m.type === "drop" || m.type === "ball" || m.type === "pop" || m.type === "found") && m.epoch !== undefined && m.epoch !== this.epoch) return;
    switch (m.type) {
      case "ping":
        if (finite(m.t)) this.#send(seat, { type: "pong", t: m.t, now });
        return;
      case "drop": {
        if (!finite(m.id, m.x, m.z) || typeof m.kind !== "string" || !seat.rates.drops.take(now)) return;
        const food = this.food.drop(seat.id, m.id, m.kind, m.x, m.z, finite(m.y) ? m.y : undefined);
        if (food) this.#broadcast({ type: "drop", by: seat.id, id: food.id, kind: food.kind, x: food.x, z: food.z, y: food.y, at: clampTime(m.at, now) }, seat);
        return;
      }
      case "clearFood":
        if (m.epoch === this.epoch && seat.rates.drops.take(now)) this.food.clearDropped(seat.id);
        return;
      case "ball": {
        if (!isV3(m.from) || !isV3(m.via) || !isV3(m.to) || !seat.rates.throws.take(now)) return;
        // A ball starts no later than a second from now, and is the thrower's only one in the air.
        const at = clampTime(m.at, now);
        const prior = this.balls.findIndex((b) => b.by === seat.id);
        if (prior >= 0) this.balls.splice(prior, 1);
        const ball: BallWire = { by: seat.id, at, from: m.from, via: m.via, to: m.to };
        this.balls.push(ball);
        this.#broadcast({ type: "ball", ...ball }, seat);
        return;
      }
      case "world":
        if (seat.key !== this.#starter || !seat.rates.changes.take(now)) return;
        this.setWorld(m.light, m.weather);
        return;
      case "place":
        if (seat.key !== this.#starter || typeof m.place !== "string" || !seat.rates.changes.take(now)) return;
        this.moveTo(m.place);
        return;
      case "remove": {
        const other = this.seats.get(m.id);
        if (seat.key !== this.#starter || !other || other === seat || !seat.rates.changes.take(now)) return;
        this.remove(other);
        return;
      }
      case "pop":
        // A device bursting a bubble with its own fly: believed if that bubble was there then.
        if (!finite(m.slot, m.cycle, m.at) || !seat.rates.pops.take(now)) return;
        if (this.bubbles?.pop(m.slot, m.cycle, m.at / 1000)) this.#broadcast({ type: "pop", slot: m.slot, cycle: m.cycle, at: m.at }, seat);
        return;
      case "found": {
        if (!finite(m.id, m.x, m.z, m.r, m.sweet) || !seat.rates.found.take(now)) return;
        const food = this.food.found(m.id, m.name, m.x, m.z, m.r, m.sweet, finite(m.y) ? m.y : undefined);
        if (food) this.#broadcast({ type: "found", food: toWire(food) }, seat);
        return;
      }
      case "bye":
        this.#bye(seat);
        return;
    }
  }

  /** The table's light and weather, chosen by its starter: told to everyone. */
  setWorld(light?: string, weather?: string) {
    if (light !== undefined && TABLE_LIGHTS.includes(light as never)) this.worldWire.light = light;
    if (weather !== undefined && TABLE_WEATHERS.includes(weather as never)) this.worldWire.weather = weather;
    this.#broadcast({ type: "world", ...this.worldWire, offset: this.#offset });
  }

  /** Carries the whole table to another place: everyone's fly is set down there together. */
  moveTo(place: string) {
    if (place === this.place || !Object.hasOwn(WORLDS, place)) return;
    this.place = place;
    this.epoch = (this.epoch + 1) & 0xff;
    this.world.load(WORLDS[place]);
    this.scale = wireScale(this.world.place);
    this.food.reset(this.world.place.patches);
    this.food.flush();
    this.#pace = this.#newPace();
    this.#settle();
    const spots: Record<number, Spot> = {};
    const now = this.now;
    for (const seat of this.seats.values()) {
      const spot = spawnSpot(this.world, seat.id);
      spots[seat.id] = spot;
      const s = seat.state;
      [s.x, s.z, s.yaw] = spot;
      s.y = this.world.heightAt(s.x, s.z, spot[3]);
      s.flags &= ~AIRBORNE;
      s.t = now;
      s.epoch = this.epoch;
      seat.leash.reset();
      // Everyone is told where everyone was set down.
      seat.fresh = true;
    }
    this.#broadcast({ type: "place", place, epoch: this.epoch, foods: this.food.foods.map(toWire), spots, ...(this.bubbles ? { bubbles: this.bubbles.snapshot() } : {}) });
    this.#options.log?.("moved", { table: this.code, place });
  }

  /** The starter took a fly off the table: it goes, and its device can't sit down here again. */
  remove(seat: Seat) {
    this.removed.add(seat.key);
    // A Set keeps the order keys were added in: the first is the longest removed.
    if (this.removed.size > REMOVED_MAX) this.removed.delete(this.removed.values().next().value!);
    this.seats.delete(seat.id);
    if (seat.link) {
      seat.link.send(JSON.stringify({ type: "refused", reason: "removed" } satisfies ServerMessage));
      seat.link.close(CLOSE.removed, "removed");
    }
    seat.link = null;
    if (seat.present) this.#broadcast({ type: "left", id: seat.id });
    this.#options.log?.("removed", { table: this.code, player: seat.id });
  }

  #binary(seat: Seat, view: DataView) {
    if (view.byteLength < 1) return;
    const type = view.getUint8(0);
    if (type === FLY) {
      const s = this.#scratch;
      // Read at this place's scale: one from before a move comes out wrong, and is dropped by its epoch before anything uses it.
      if (readState(view, 1, this.scale, s) < 0 || s.epoch !== this.epoch) return;
      s.t = roomTime(s.t, this.now);
      const result = seat.leash.admit(this.world, seat.state, s, this.now);
      if (result === "refused") return;
      if (result !== "taken") seat.shortened++;
      seat.fresh = true;
      this.#update(seat);
    } else if (type === BITES) {
      // Taken in a place the table has since left: not counted, nor acknowledged (the device has the new place's food from the move).
      const epoch = bitesEpoch(view);
      if (epoch !== null && epoch !== this.epoch) return;
      const st = seat.state;
      const now = this.now;
      const seq = decodeBites(view, (food, amount) => this.food.bite(seat.id, food, amount, st.x, st.y, st.z, now));
      if (seq >= 0) seat.ack = seq;
    }
  }

  /** Whether a seat's device has stopped, and if that changed, everyone is told; back from gone, it joins again. */
  #update(seat: Seat) {
    const away = !seat.link || !!(seat.state.flags & AWAY) || this.now - seat.heardAt > SILENT_AFTER;
    if (!seat.present) {
      // Gone after a long time away (or said goodbye): only its device living again brings it back.
      if (away) return;
      seat.present = true;
      seat.away = false;
      this.#broadcast({ type: "joined", ...this.#player(seat) }, seat);
      return;
    }
    if (away === seat.away) return;
    seat.away = away;
    if (away) seat.awaySince = this.#options.wall();
    this.#broadcast({ type: "away", id: seat.id, away }, seat);
  }

  /** Sends each device the others' fly states that came in since the last time. */
  #relay() {
    const fresh = this.#fresh;
    fresh.length = 0;
    for (const s of this.seats.values()) {
      if (!s.fresh) continue;
      s.fresh = false;
      if (s.present) fresh.push(s.state);
    }
    if (fresh.length === 0) return;
    const others = this.#others;
    for (const p of this.seats.values()) {
      if (!p.link) continue;
      others.length = 0;
      for (const s of fresh) if (s.id !== p.id) others.push(s);
      if (others.length === 0) continue;
      const bytes = encodeFlies(this.#batch, this.scale, others);
      p.link.send(new Uint8Array(this.#batch.buffer, 0, bytes));
    }
  }

  /** The table's beat, every SEND_EVERY ms (@fly/net): the batch, presence, the food, the balls, the bubbles, the visitors. */
  tick() {
    const now = this.now;
    const wall = this.#options.wall();
    const dt = Math.max(0, (now - this.#lastTick) / 1000);
    this.#lastTick = now;
    this.#relay();
    for (const seat of this.seats.values()) {
      this.#update(seat);
      if (seat.present && seat.away && wall - seat.awaySince > AWAY_LIMIT) {
        seat.present = false;
        this.#broadcast({ type: "left", id: seat.id }, seat);
        this.#options.log?.("gone", { table: this.code, player: seat.id });
      }
    }
    // The table's clock's offset changes twice a year where the starter is.
    if (wall - this.#offsetAt > 60_000 && this.#zone) {
      this.#offsetAt = wall;
      const offset = zoneOffset(this.#zone, wall, this.#offset);
      if (offset !== this.#offset) {
        this.#offset = offset;
        this.#broadcast({ type: "world", ...this.worldWire, offset });
      }
    }
    this.food.update(dt);
    if (now - this.#foodAt >= FOOD_EVERY) {
      this.#foodAt = now;
      const changes = this.food.flush();
      if (changes) {
        // Each player is told which of its own bites have been counted.
        for (const p of this.seats.values()) if (p.link) this.#send(p, { type: "food", ack: p.ack, ...changes, eaten: Math.round((this.food.eaten.get(p.id) ?? 0) * 1e4) / 1e4, meal: this.food.takeMeal(p.id) });
      }
    }
    const bubbles = this.bubbles;
    // Balls that have flown are forgotten; while one flies, the bubbles it hits burst.
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      const k = ballProgress(b, now);
      if (k >= 1) this.balls.splice(i, 1);
      else if (k > 0 && bubbles) bubbles.hitBy(Math.max(b.at, now - dt * 1000) / 1000, now / 1000, BALL_RADIUS, b);
    }
    if (bubbles) {
      bubbles.rain = this.#rain();
      bubbles.update(now / 1000);
    }
    if (this.place === "picnic" || this.#ventilation) this.#visitors(dt, now);
  }

  /** The place's goings-on start when nobody at the table is using the remote, as alone. */
  #visitors(dt: number, now: number) {
    let quiet = false;
    for (const s of this.seats.values()) {
      if (!s.present || s.away) continue;
      quiet = true;
      if (s.state.flags & PLAYING) {
        quiet = false;
        break;
      }
    }
    const vent = this.#ventilation;
    if (vent) {
      // Its run is as long as every device draws from the run's seed.
      if (vent.tick(dt, quiet)) vent.start(stream(mix(this.happen("ventilation", now).seed)));
      return;
    }
    this.#pace.gustiness = 0.4 + this.#weather().wind * 1.6;
    const next = this.#pace.tick(dt, quiet, (h) => this.#can(h, now));
    if (next) this.happen(next, now);
  }

  /** Starts a happening now (the pace's, or one asked for), told to everyone with the seed they reproduce it from. */
  happen(kind: Going, now = this.now): HappeningWire {
    const h: HappeningWire = { kind, seed: mix(this.seed, 0x4a99, ++this.#happenings), at: now };
    this.happenings.push(h);
    if (this.happenings.length > 16) this.happenings.shift();
    this.#busy.set(kind, now + BUSY[kind] * 1000);
    this.#broadcast({ type: "happening", ...h });
    return h;
  }

  #can(h: Happening, now: number) {
    if ((this.#busy.get(h) ?? 0) > now) return false;
    const hour = hourOfDay(this.hours);
    const light = this.worldWire.light;
    const day = light === "clock" ? hour > 7 && hour < 19.5 : light !== "night" && light !== "dusk";
    const rain = this.#weather().rain;
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

  /** The table's weather: chosen, or the forecast by its clock. */
  #weather() {
    const w = this.worldWire.weather;
    const m = this.#mix;
    if (w === "now") return forecast(this.hours, m);
    m.cloud = w === "overcast" || w === "rain" ? 1 : 0;
    m.mist = w === "mist" ? 1 : 0;
    m.rain = w === "rain" ? 1 : 0;
    m.wind = 0.4;
    return m;
  }

  #rain() {
    return this.#weather().rain;
  }

  /** Lets everyone go: the server is stopping (a deploy); their devices come back when it is up again. */
  close(code: number, reason: string) {
    for (const s of this.seats.values()) {
      s.link?.close(code, reason);
      s.link = null;
    }
  }
}

function rate(kind: keyof typeof LIMITS) {
  const [perMinute, burst] = LIMITS[kind];
  return new Rate(perMinute, burst);
}
