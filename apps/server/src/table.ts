// One table shared by up to 128 flies (MAX_FLIES), from as many devices as bring them:
// who is at it, and what everyone there must agree on. Each fly's brain and
// body run on its owner's device, which is the authority on its flies (one
// device may bring several); the table only keeps what it
// hears within what a fly could do (@fly/net, limits.ts) and passes it on to
// everyone else, about 20 times a second in one batch. What the table owns
// is the rest of the world there: the place, the food and who ate how much,
// the balls thrown, the light and the weather by the clock of whoever
// started it, the seed and the clock every device blows the same bubbles
// from, and when a visitor comes. It is a room too: it has a name, may be
// listed for anyone browsing to find, and may be locked with a password
// (lock.ts). Or it is one of the rooms open to everyone, which nobody starts:
// the server's clock takes it from place to place, and each device keeps its
// own light and weather there. No brains, no drawing and no sockets here (server.ts), so a
// whole table can run in a test.

import { BALL_RADIUS, Pace, VentilationClock, World, WORLDS, hourOfDay } from "@fly/world";
import type { Happening } from "@fly/world";
import {
  KINDS, forecast, MAX_FOUND, AIRBORNE, AWAY, BITES, CLOSE, TABLE_BUBBLES, COLOURS, FLIES_MAX, FLY, LIMITS, Leash, MAX_FLIES, MAX_OWN, PLAYING, PROTOCOL, ROOM_LIMITS, Rate, TABLE_LIGHTS,
  TABLE_PLACES, TABLE_WEATHERS, TableBubbles, TableFood, WIRE_FOODS_MAX, ballProgress, bitesEpoch, createFlyState, decodeBites, decodeFlies, encodeFlies, everyoneIndex, everyoneName,
  isTableCode, mayReturnTo, mix, roomName, roomTime, spawnSpot, stream, tableHours, toWire, wireScale,
} from "@fly/net";
import type {
  BallWire, ClientMessage, FlyState, FoodWire, HappeningWire, PlayerWire, Refusal, RoomInfo, RoomWire, SeatedFly, ServerMessage, Spot, TableStart, V3,
  WireScale, WorldWire,
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

/** A room open to everyone stays in each place this long (ms), then moves on to the next, by the wall clock: every server agrees where it is. */
export const EVERYONE_TURN = 20 * 60_000;

/** Where the rooms open to everyone are at this moment (ms since 1970). */
export const everyonePlace = (wall: number) => TABLE_PLACES[Math.floor(wall / EVERYONE_TURN) % TABLE_PLACES.length];

/** The weather a room open to everyone has for its own goings-on: none of note, since each device there has its own sky. */
const CALM = Object.freeze({ cloud: 0, mist: 0, rain: 0, wind: 0.4 });

/** A device's line to the table. */
export type Link = {
  send(data: string | Uint8Array): void;
  close(code: number, reason: string): void;
};

/** One of a device's flies at the table: its id and colour, where the table has it, and whether a state came for it since the last batch. */
export type SeatFly = {
  readonly id: number;
  readonly colour: string;
  readonly state: FlyState;
  readonly leash: Leash;
  fresh: boolean;
};

/** A device's place at the table, kept for whoever has the key that took it: its flies' ids and colours come back with them. */
export type Seat = {
  /** The player's id: its first fly's, which it keeps while it is seated (it always has one). */
  readonly id: number;
  /** The device's key, hashed: nothing that could be used to sit here oneself is kept. */
  key: string;
  /** Its flies, the first first: as many as it asked for and there were seats for. */
  readonly flies: SeatFly[];
  link: Link | null;
  /** Shown at the table (not yet gone after a long time away). */
  present: boolean;
  /** Its device has stopped, and since when (wall clock, ms). */
  away: boolean;
  awaySince: number;
  /** When the table last heard from it (room ms) and when it was last seen (wall clock, ms). */
  heardAt: number;
  lastSeen: number;
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
  /**
   * `gone`: it had left (said goodbye, or was away too long), so a restart doesn't bring its flies back. A table kept
   * before devices had several flies has its one fly's `at` and `airborne` beside the seat's id, and no `flies`.
   */
  seats: { id: number; key: string; flies?: KeptFly[]; at?: KeptFly["at"]; airborne?: boolean; lastSeen: number; gone?: boolean }[];
  foods: FoodWire[];
  foodExpires?: [id: number, at: number][];
  /** How much each player has eaten by the table's account, by id (older files have none). */
  eaten?: [id: number, amount: number][];
  /** The room's name, whether it is listed, and its lock (older files have none: unnamed, unlisted, open to its link). */
  name?: string;
  listed?: boolean;
  lock?: Lock | null;
};

/** A fly as a table is kept. */
type KeptFly = { id: number; at: [x: number, y: number, z: number, yaw: number]; airborne: boolean };

export type TableOptions = {
  /** Room time, ms: the server's monotonic clock. */
  now: () => number;
  /** The wall clock, ms since 1970. */
  wall: () => number;
  /** Something worth a line in the log. */
  log?: (event: string, fields: Record<string, unknown>) => void;
  /** How many flies it seats: MAX_FLIES, unless a test wants a table it can fill by hand. */
  seats?: number;
};

const isV3 = (v: unknown): v is V3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 10_000);
const isSpot = (v: unknown): v is Spot => Array.isArray(v) && (v.length === 3 || v.length === 4) && v.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 10_000);
const finite = (...xs: unknown[]) => xs.every((x) => typeof x === "number" && Number.isFinite(x));
const text = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
const flyId = (id: unknown, ids: Set<number>) => {
  if (!Number.isInteger(id) || (id as number) < 1 || (id as number) > MAX_FLIES || ids.has(id as number)) return false;
  ids.add(id as number);
  return true;
};
const isKept = (at: unknown, airborne: unknown) => Array.isArray(at) && at.length === 4 && at.every((x) => finite(x) && Math.abs(x) < 10_000) && typeof airborne === "boolean";
/** A seat as kept: its flies (the first under the seat's own id, every id the table's only one of it), or, kept before devices had several, its one fly. */
const isSeatRecord = (v: unknown, ids: Set<number>) => {
  const r = v as TableRecord["seats"][number];
  if (!r || typeof r !== "object" || !text(r.key, 64) || !finite(r.lastSeen) || (r.gone !== undefined && typeof r.gone !== "boolean")) return false;
  if (r.flies === undefined) return flyId(r.id, ids) && isKept(r.at, r.airborne);
  return (
    Array.isArray(r.flies) && r.flies.length >= 1 && r.flies.length <= MAX_OWN && r.flies[0]?.id === r.id &&
    r.flies.every((f) => !!f && typeof f === "object" && flyId(f.id, ids) && isKept(f.at, f.airborne))
  );
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
  if (!Array.isArray(r.seats) || r.seats.length > MAX_FLIES || !r.seats.every((seat) => isSeatRecord(seat, ids))) return false;
  if (r.foodExpires !== undefined && (!Array.isArray(r.foodExpires) || r.foodExpires.length > MAX_FOUND || !r.foodExpires.every((e) => Array.isArray(e) && e.length === 2 && finite(e[0]) && finite(e[1])))) return false;
  if (!Array.isArray(r.foods) || r.foods.length > WIRE_FOODS_MAX || !r.foods.every(isFoodRecord)) return false;
  if (r.eaten !== undefined && (!Array.isArray(r.eaten) || r.eaten.length > MAX_FLIES || !r.eaten.every((e) => Array.isArray(e) && e.length === 2 && finite(e[0], e[1])))) return false;
  return (r.name === undefined || roomName(r.name) === r.name) && (r.listed === undefined || typeof r.listed === "boolean") && (r.lock === undefined || r.lock === null || isLock(r.lock));
}

/** How many flies a device asks for (a hello's `flies`, a recount's `count`), as far as one may bring: 1 if it says nothing that is a number. */
export const wantedFlies = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(1, Math.min(MAX_OWN, Math.floor(n))) : 1);

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
  /** One of the rooms open to everyone: nobody started it, and nobody chooses its place, light or weather. */
  readonly everyone: boolean;
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
  /** The ids read so far from a device's batch, for telling a fly sent twice. */
  readonly #seen = new Uint8Array(MAX_OWN);
  readonly #batch = new DataView(new ArrayBuffer(FLIES_MAX));
  readonly #fresh: FlyState[] = [];
  /** Whose each fresh state is, for leaving a device's own out of what it is sent. */
  readonly #freshOf: Seat[] = [];
  readonly #others: FlyState[] = [];
  /** A device's flies' states, for its bites. */
  readonly #where: FlyState[] = [];
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
    const everyone = everyoneIndex(code);
    this.everyone = everyone >= 0;
    this.name = this.everyone ? everyoneName(everyone) : (roomName(start.name) ?? UNNAMED);
    this.listed = this.everyone || start.listed === true;
    this.lock = this.everyone ? null : lock;
    this.#options = options;
    this.seed = seed >>> 0;
    this.created = record?.created ?? options.wall();
    // A room open to everyone is wherever the clock has it, whatever was kept.
    this.place = this.everyone ? everyonePlace(options.wall()) : Object.hasOwn(WORLDS, start.place) ? start.place : "picnic";
    // Moved on while the server was down: what was kept is of another place, and a device still there must know it isn't.
    const moved = !!record && record.place !== this.place;
    this.epoch = ((record?.epoch ?? 0) + (moved ? 1 : 0)) & 0xff;
    this.world = new World(WORLDS[this.place]);
    this.scale = wireScale(this.world.place);
    this.food = new TableFood(this.world, this.world.place.patches, options.wall);
    const light = !this.everyone && TABLE_LIGHTS.includes(start.light as never) ? start.light : "clock";
    this.worldWire = { light, weather: !this.everyone && TABLE_WEATHERS.includes(start.weather as never) ? start.weather : "now" };
    // Nobody's key is empty: nobody started a room open to everyone.
    this.#starter = this.everyone ? "" : starterKey;
    this.#zone = typeof start.zone === "string" ? start.zone.slice(0, 64) : "";
    this.#offset = finite(start.offset) ? Math.max(-14 * 60, Math.min(14 * 60, Math.round(start.offset))) : 0;
    this.removed = new Set(record?.removed ?? []);
    this.#pace = this.#newPace();
    this.#lastTick = options.now();
    this.#settle();
    if (record && !moved) {
      this.food.restore(record.foods, record.foodExpires);
      for (const [id, amount] of record.eaten ?? []) this.food.eaten.set(id, amount);
    }
    if (record) {
      const now = options.now();
      for (const r of record.seats) {
        const kept = r.flies ?? (r.at ? [{ id: r.id, at: r.at, airborne: !!r.airborne }] : []);
        if (kept.length === 0) continue;
        const seat = this.#seat(kept[0].id, r.key);
        for (const [i, k] of kept.entries()) {
          const fly = i === 0 ? seat.flies[0] : this.#addFly(seat, k.id);
          const s = fly.state;
          // Moved on while the server was down: each fly is set down where the table sets that fly down in the place it is in now.
          if (moved) this.#setDown(fly, spawnSpot(this.world, k.id));
          else [s.x, s.y, s.z, s.yaw] = k.at;
          s.flags = (k.airborne && !moved ? AIRBORNE : 0) | AWAY;
          s.t = now;
          s.epoch = this.epoch;
        }
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
    this.food.update(0);
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
      seats: [...this.seats.values()].map((s) => ({
        id: s.id,
        key: s.key,
        flies: s.flies.map((f) => ({ id: f.id, at: [f.state.x, f.state.y, f.state.z, f.state.yaw], airborne: !!(f.state.flags & AIRBORNE) })),
        lastSeen: s.lastSeen,
        gone: !s.present,
      })),
      foods: this.food.foods.map(toWire),
      foodExpires: this.food.expiries(),
      eaten: [...this.food.eaten],
      name: this.name,
      listed: this.listed,
      lock: this.lock,
    };
  }

  /** What it says of itself: in its welcome, and in the list of rooms. */
  get info(): RoomInfo {
    return { name: this.name, listed: this.listed, locked: !!this.lock, code: this.code, everyone: this.everyone };
  }

  /** A room open to everyone nobody is in keeps no beat, so not its place either: the list says where the clock has it, where whoever comes is sat (Tables.everyone). */
  room(): RoomWire {
    const place = this.everyone ? everyonePlace(this.#options.wall()) : this.place;
    return { code: this.code, name: this.name, place, flies: this.taken, locked: !!this.lock, ...(this.everyone ? { everyone: true } : {}) };
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
    for (const s of this.seats.values()) if (s.present) n += s.flies.length;
    return n;
  }

  /**
   * How many seats a newcomer can't have: every fly shown, every fly of a
   * device still on the line, and the one place a starter who has gone keeps.
   * The rest are free, or theirs who have gone (`#freeIds` gives those up).
   */
  get taken() {
    let n = 0;
    for (const s of this.seats.values()) n += s.present || s.link ? s.flies.length : s.key === this.#starter ? 1 : 0;
    return n;
  }

  /** The seat whose fly this is. */
  seatOf(fly: number): Seat | null {
    for (const s of this.seats.values()) for (const f of s.flies) if (f.id === fly) return s;
    return null;
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

  /** A seat for a device whose first fly is `id`. */
  #seat(id: number, key: string): Seat {
    const seat: Seat = {
      id,
      key,
      flies: [],
      link: null,
      present: true,
      away: false,
      awaySince: 0,
      heardAt: this.now,
      lastSeen: this.#options.wall(),
      ack: 0,
      rates: { throws: rate("throws"), drops: rate("drops"), found: rate("found"), pops: rate("pops"), changes: rate("changes"), recounts: rate("recounts"), messages: rate("messages") },
      shortened: 0,
      dropped: 0,
    };
    this.#addFly(seat, id);
    this.seats.set(id, seat);
    return seat;
  }

  /** Another fly for a seat, under `id`, in that id's colour, where the table first sets a fly with that id down. */
  #addFly(seat: Seat, id: number): SeatFly {
    const fly: SeatFly = { id, colour: COLOURS[(id - 1) % COLOURS.length], state: createFlyState(), leash: new Leash(), fresh: false };
    fly.state.id = id;
    this.#setDown(fly, spawnSpot(this.world, id));
    seat.flies.push(fly);
    return fly;
  }

  /** Puts a fly at a spot (on the surface at or below its height), as it is now; returns the spot as it stands. */
  #setDown(fly: SeatFly, at: Spot): Spot {
    const s = fly.state;
    s.x = at[0];
    s.z = at[1];
    s.yaw = at[2];
    s.y = this.world.heightAt(s.x, s.z, at[3]);
    s.flags &= ~AIRBORNE;
    s.t = this.now;
    s.epoch = this.epoch;
    fly.leash.reset();
    fly.fresh = true;
    return [s.x, s.z, s.yaw, s.y];
  }

  /**
   * Up to `n` fly ids no seat has, lowest first, for `seat` (or a newcomer, if
   * null). If there aren't enough, the seats of whoever has gone (not `seat`
   * itself) are given up for them, whole, the longest gone first; then, if
   * the starter has gone, all their seats but their first fly's, so the
   * table keeps their place (and its colour) for when they come back.
   */
  #freeIds(n: number, seat: Seat | null): number[] {
    const free = () => {
      const ids: number[] = [];
      for (let id = 1; id <= this.#seats && ids.length < n; id++) if (!this.seatOf(id)) ids.push(id);
      return ids;
    };
    let ids = free();
    while (ids.length < n) {
      let oldest: Seat | null = null;
      for (const s of this.seats.values()) if (s !== seat && !s.present && !s.link && s.key !== this.#starter && (!oldest || s.lastSeen < oldest.lastSeen)) oldest = s;
      if (oldest) this.seats.delete(oldest.id);
      else {
        const starter = this.starter;
        if (!starter || starter === seat || starter.present || starter.link || starter.flies.length === 1) break;
        starter.flies.length = 1;
      }
      ids = free();
    }
    return ids;
  }

  /**
   * Gives a seat `wanted` flies, as many as there are seats for: those past it
   * leave (the last first), and new ones are set down where the table finds
   * room for them. Everyone else is told, if its flies are shown.
   */
  #recount(seat: Seat, wanted: number) {
    const shown = seat.present;
    while (seat.flies.length > Math.max(1, wanted)) {
      const fly = seat.flies.pop()!;
      if (shown) this.#broadcast({ type: "left", id: fly.id }, seat);
    }
    if (seat.flies.length >= wanted) return;
    for (const id of this.#freeIds(wanted - seat.flies.length, seat)) {
      const fly = this.#addFly(seat, id);
      if (shown) this.#broadcast({ type: "joined", ...this.#player(seat, fly) }, seat);
    }
  }

  /** How many flies a device asks for, as far as one may bring. */
  #wanted(n: unknown) {
    return wantedFlies(n);
  }

  #seated(seat: Seat): SeatedFly[] {
    return seat.flies.map((f) => ({ id: f.id, colour: f.colour, at: [f.state.x, f.state.z, f.state.yaw, f.state.y] }));
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
    const wanted = this.#wanted(message.flies);
    const returning = !!seat;
    if (seat) {
      // Back: on this or another device with the same key. The flies that were here stay here.
      if (seat.link) seat.link.close(CLOSE.elsewhere, "elsewhere");
      const away = (wall - seat.lastSeen) / 1000;
      // Where they are counts only in the place the table is in: a device away while the table moved has its flies somewhere else.
      const at = message.epoch === this.epoch && Array.isArray(message.at) ? message.at : [];
      for (const [i, fly] of seat.flies.entries()) {
        const s = fly.state;
        const there = at[i];
        this.#setDown(fly, isSpot(there) && mayReturnTo(this.world, there, s.x, s.y, s.z, away) ? there : [s.x, s.z, s.yaw, s.y]);
      }
    } else {
      const ids = this.#freeIds(wanted, null);
      if (ids.length === 0) return "full";
      seat = this.#seat(ids[0], key);
      for (const id of ids.slice(1)) this.#addFly(seat, id);
    }
    const shown = returning && seat.present;
    // Coming back with another count: as many as it asks for now, as many as there are seats for.
    if (returning) this.#recount(seat, wanted);
    for (const fly of seat.flies) fly.state.flags = 0;
    seat.link = link;
    seat.heardAt = now;
    seat.lastSeen = wall;
    seat.ack = 0;
    this.food.takeMeal(seat.id);
    seat.present = true;
    seat.away = false;
    this.food.update(0);
    const flies = this.#seated(seat);
    this.#send(seat, {
      type: "welcome",
      meals: true,
      v: PROTOCOL,
      id: seat.id,
      colour: flies[0].colour,
      flies,
      starter: this.starter?.id ?? 0,
      seed: this.seed,
      now,
      wall,
      offset: this.#offset,
      place: this.place,
      epoch: this.epoch,
      world: { ...this.worldWire },
      players: [...this.seats.values()].filter((p) => p !== seat && p.present).flatMap((p) => p.flies.map((f) => this.#player(p, f))),
      foods: this.food.foods.map(toWire),
      balls: this.balls.filter((b) => ballProgress(b, now) < 1),
      happenings: this.happenings.filter((h) => now - h.at < HAPPENING_KEPT),
      bubbles: this.bubbles?.snapshot() ?? [],
      at: flies[0].at,
      room: this.info,
    });
    // And everyone else's fly where it is now, resting ones too, so the newcomer sees them before they next move.
    const others = this.#others;
    others.length = 0;
    for (const p of this.seats.values()) if (p !== seat && p.present) for (const f of p.flies) others.push(f.state);
    if (others.length) link.send(new Uint8Array(this.#batch.buffer, 0, encodeFlies(this.#batch, this.scale, others)));
    // Everyone else sees its flies come, or wake if they were already seeing them rest (and any it brings now, come).
    for (const fly of seat.flies) this.#broadcast(shown ? { type: "away", id: fly.id, away: false } : { type: "joined", ...this.#player(seat, fly) }, seat);
    this.#options.log?.("joined", { table: this.code, player: seat.id, flies: seat.flies.length, asked: wanted, returning });
    return seat;
  }

  /** A room open to everyone moves on when the clock says, everyone there together. Returns the table. */
  keepTurn(): this {
    if (!this.everyone) return this;
    const turn = everyonePlace(this.#options.wall());
    if (turn !== this.place) this.moveTo(turn);
    return this;
  }

  /** Whether a device with this key (hashed) is still at the table: its flies there, perhaps resting, not yet gone. */
  seated(key: string) {
    for (const s of this.seats.values()) if (s.key === key) return s.present;
    return false;
  }

  /**
   * How many flies a device with this key (hashed) could have here: as many as
   * it brings, if it has a seat here already; otherwise the seats a newcomer
   * can have (`taken`, which those gone give up). 0 if it was removed.
   */
  roomFor(key: string): number {
    if (this.removed.has(key)) return 0;
    for (const s of this.seats.values()) if (s.key === key) return MAX_OWN;
    return this.#seats - this.taken;
  }

  get #seats() {
    return this.#options.seats ?? MAX_FLIES;
  }

  #player(seat: Seat, fly: SeatFly): PlayerWire {
    return { id: fly.id, colour: fly.colour, away: seat.away, of: seat.id };
  }

  /** The device's line closed. Its fly stays, resting, until it comes back or AWAY_LIMIT passes. */
  disconnected(seat: Seat, link: Link) {
    if (seat.link !== link) return;
    seat.link = null;
    seat.lastSeen = this.#options.wall();
    this.#update(seat);
  }

  /** The player left the table for good: its flies go now. Its seat (and their colours) stays theirs. */
  #bye(seat: Seat) {
    seat.link?.close(CLOSE.left, "left");
    seat.link = null;
    seat.present = false;
    seat.away = true;
    seat.awaySince = this.#options.wall();
    for (const fly of seat.flies) this.#broadcast({ type: "left", id: fly.id }, seat);
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
        const other = this.seatOf(m.id);
        if (seat.key !== this.#starter || !other || other === seat || !seat.rates.changes.take(now)) return;
        this.remove(other);
        return;
      }
      case "flies": {
        // One dropped for coming too often goes unanswered: the device asks again until it is answered.
        if (!seat.rates.recounts.take(now)) return;
        const asked = this.#wanted(m.count);
        this.#recount(seat, asked);
        this.#send(seat, { type: "seated", flies: this.#seated(seat), asked });
        return;
      }
      case "pop":
        // A device bursting a bubble with its own fly: believed if that bubble was there then.
        if (!finite(m.slot, m.cycle, m.at) || !seat.rates.pops.take(now)) return;
        if (this.bubbles?.pop(m.slot, m.cycle, m.at / 1000)) this.#broadcast({ type: "pop", slot: m.slot, cycle: m.cycle, at: m.at }, seat);
        return;
      case "found": {
        if (!finite(m.id, m.x, m.z, m.r, m.sweet) || !seat.rates.found.take(now)) return;
        // A position-derived ID may be found again. Clear the previous
        // lifetime on every device before broadcasting its replacement.
        this.food.update(0);
        this.#flushFood();
        const food = this.food.found(m.id, m.name, m.x, m.z, m.r, m.sweet, finite(m.y) ? m.y : undefined, m.lasts);
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
    // Everyone is told where every fly was set down.
    for (const seat of this.seats.values()) for (const fly of seat.flies) spots[fly.id] = this.#setDown(fly, spawnSpot(this.world, fly.id));
    this.#broadcast({ type: "place", place, epoch: this.epoch, foods: this.food.foods.map(toWire), spots, ...(this.bubbles ? { bubbles: this.bubbles.snapshot() } : {}) });
    this.#options.log?.("moved", { table: this.code, place });
  }

  /** The starter took a device off the table: all its flies go, and it can't sit down here again. */
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
    if (seat.present) for (const fly of seat.flies) this.#broadcast({ type: "left", id: fly.id });
    this.#options.log?.("removed", { table: this.code, player: seat.id });
  }

  #binary(seat: Seat, view: DataView) {
    if (view.byteLength < 1) return;
    const type = view.getUint8(0);
    if (type === FLY) {
      const now = this.now;
      // The whole batch is read before any of it is used: one cut short, with more flies than a device brings, or with a fly twice, is
      // dropped whole rather than half taken.
      const seen = this.#seen;
      let ids = 0;
      let whole = true;
      const count = decodeFlies(view, this.scale, this.#scratch, (s) => {
        if (s.id < 1 || s.id > MAX_FLIES || ids === MAX_OWN) whole = false;
        for (let i = 0; i < ids; i++) if (seen[i] === s.id) whole = false;
        if (ids < MAX_OWN) seen[ids++] = s.id;
      }, FLY);
      if (count < 0 || count > MAX_OWN || !whole) return;
      let heard = false;
      // Read at this place's scale: one from before a move comes out wrong, and is dropped by its epoch before anything uses it; one for a fly
      // that isn't this device's (in flight as it was taken off) is no state of its.
      decodeFlies(view, this.scale, this.#scratch, (s) => {
        const fly = s.epoch === this.epoch ? seat.flies.find((f) => f.id === s.id) : undefined;
        if (!fly) return;
        s.t = roomTime(s.t, now);
        const result = fly.leash.admit(this.world, fly.state, s, now);
        if (result === "refused") return;
        if (result !== "taken") seat.shortened++;
        fly.fresh = true;
        heard = true;
      }, FLY);
      if (heard) this.#update(seat);
    } else if (type === BITES) {
      // Taken in a place the table has since left: not counted, nor acknowledged (the device has the new place's food from the move).
      const epoch = bitesEpoch(view);
      if (epoch !== null && epoch !== this.epoch) return;
      const now = this.now;
      const where = this.#where;
      where.length = 0;
      for (const f of seat.flies) where.push(f.state);
      const seq = decodeBites(view, (food, amount) => this.food.bite(seat.id, food, amount, where, now));
      if (seq >= 0) seat.ack = seq;
    }
  }

  /** Whether a seat's device has stopped, and if that changed, everyone is told; back from gone, it joins again. */
  #update(seat: Seat) {
    const away = !seat.link || !!(seat.flies[0].state.flags & AWAY) || this.now - seat.heardAt > SILENT_AFTER;
    if (!seat.present) {
      // Gone after a long time away (or said goodbye): only its device living again brings its flies back.
      if (away) return;
      seat.present = true;
      seat.away = false;
      for (const fly of seat.flies) this.#broadcast({ type: "joined", ...this.#player(seat, fly) }, seat);
      return;
    }
    if (away === seat.away) return;
    seat.away = away;
    if (away) seat.awaySince = this.#options.wall();
    for (const fly of seat.flies) this.#broadcast({ type: "away", id: fly.id, away }, seat);
  }

  /** Sends each device the others' fly states that came in since the last time. */
  #relay() {
    const fresh = this.#fresh;
    const of = this.#freshOf;
    fresh.length = 0;
    of.length = 0;
    for (const s of this.seats.values()) {
      for (const f of s.flies) {
        if (!f.fresh) continue;
        f.fresh = false;
        if (!s.present) continue;
        fresh.push(f.state);
        of.push(s);
      }
    }
    if (fresh.length === 0) return;
    const others = this.#others;
    for (const p of this.seats.values()) {
      if (!p.link) continue;
      others.length = 0;
      for (let i = 0; i < fresh.length; i++) if (of[i] !== p) others.push(fresh[i]);
      if (others.length === 0) continue;
      const bytes = encodeFlies(this.#batch, this.scale, others);
      p.link.send(new Uint8Array(this.#batch.buffer, 0, bytes));
    }
  }

  #flushFood() {
    const changes = this.food.flush();
    if (!changes) return;
    for (const p of this.seats.values()) if (p.link) this.#send(p, { type: "food", ack: p.ack, ...changes, eaten: Math.round((this.food.eaten.get(p.id) ?? 0) * 1e4) / 1e4, meal: this.food.takeMeal(p.id) });
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
        for (const fly of seat.flies) this.#broadcast({ type: "left", id: fly.id }, seat);
        this.#options.log?.("gone", { table: this.code, player: seat.id });
      }
    }
    this.keepTurn();
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
      this.#flushFood();
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
      if (s.flies[0].state.flags & PLAYING) {
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
    // Each device's own sky says whether a visitor suits it there (SharedTable.ownSky).
    if (this.everyone) return true;
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
    if (this.everyone) return CALM;
    const w = this.worldWire.weather;
    const m = this.#mix;
    if (w === "now") return forecast(this.hours, m);
    Object.assign(m, KINDS[w as keyof typeof KINDS] ?? KINDS.clear);
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
