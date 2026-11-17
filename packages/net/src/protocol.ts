// The wire between a fly's device and the table it is at (docs/online.md has
// the whole format). Two kinds of message share one WebSocket:
//
// - Binary, for what goes many times a second: each fly's state, from its
//   device up to the room and from the room down to everyone else in one
//   batch; and the bites a fly takes, which must not be lost. Fixed layouts,
//   little-endian, quantised to what the eye and the body need.
// - JSON text, for what happens now and then: joining, the clock, food
//   dropped, a ball thrown, the light and the place chosen, a visitor.
//
// The first message on a connection is the client's `hello` with PROTOCOL;
// the room refuses a version it doesn't speak.

import type { Place } from "@fly/world";
import type { BubbleSnapshot } from "./bubbles.ts";

/**
 * Bumped whenever a layout or a message changes meaning. 2: a fly's state
 * is read at its place's scale (`wireScale`), which a device that doesn't
 * know the restaurant would read at a tabletop's. 3: rooms have names, may
 * be listed and locked, and a device may browse them; a device speaking 2
 * would sit at a locked room's door forever, not knowing why it was refused.
 * The rooms open to everyone (`everyoneCode`) came within 3: they only add
 * to what is said, and a device that doesn't know them is seated there as at
 * any room.
 */
export const PROTOCOL = 3;

/** Where the room server answers WebSockets, on the site's own host. */
export const ROOMS_PATH = "/rooms";

/** Binary message types: the first byte. */
export const FLY = 1;
export const FLIES = 2;
export const BITES = 3;

/** At most this many flies at a table. Player ids are 1 to this: one byte on the wire. */
export const MAX_PLAYERS = 8;

/** How often a device sends its fly, and the room sends the batch, ms. */
export const SEND_EVERY = 50;

/** Flag bits in a fly's state. */
export const AIRBORNE = 1;
/** Its device has stopped (a hidden tab, a sleeping phone): the fly isn't living, and stands still. */
export const AWAY = 2;
export const EATING = 4;
/** The player's hand is out on the table (playing, not the wallpaper): the pointer and tool follow. */
export const HANDS = 8;
/** Select is held: tickling or blowing. */
export const HOLDING = 16;
/** Someone is at the remote (not the wallpaper, a press within the last minute): the room's visitors wait. */
export const PLAYING = 32;

/**
 * How finely lengths go in a fly's state, in steps a millimetre (each an
 * i16): where the fly is, its player's pointer, and their camera. Each place
 * has its own (`wireScale`), and both ends always know which place a state is
 * from: the table's, in the epoch it carries (a state from another is dropped).
 */
export type WireScale = { readonly position: number; readonly pointer: number; readonly eye: number };

/** A tabletop's: the fly to 1/50 mm (±655 mm), the pointer to 1/20 mm (±1.6 m), the camera to 1/10 mm (±3.3 m). */
export const TABLETOP_SCALE: WireScale = { position: 50, pointer: 20, eye: 10 };

/**
 * A room's, for a floor up to 5 m from its middle: the fly to 1/5 mm
 * (±6.5 m: the restaurant's 4.2 m, and the air past its edge), the pointer
 * to 1/4 mm (±8.2 m: wherever it lands, the kitchen beyond the back wall
 * included), the camera to 1/2 mm (±16 m). A fly is 2.5 mm long and seen
 * from across the room, and a puff only needs the camera's direction.
 */
export const ROOM_SCALE: WireScale = { position: 5, pointer: 4, eye: 2 };

/** The scales, finest first, each with how far from the middle a place's floor and ceiling may reach in it, mm: the rest of its range is for a fly in the air past the floor's edge. */
const SCALES: readonly (readonly [WireScale, number])[] = [
  [TABLETOP_SCALE, 500],
  [ROOM_SCALE, 5000],
];

/** The finest scale that holds a place: its floor's size, and its ceiling. */
export function wireScale(place: Place): WireScale {
  const f = place.floor;
  const reach = Math.max(f.kind === "circle" ? f.r : Math.max(f.hx, f.hz), place.ceiling);
  for (const [scale, holds] of SCALES) if (reach <= holds) return scale;
  return SCALES[SCALES.length - 1][0];
}

const YAW = 65536 / (Math.PI * 2);

/** Bytes of a fly's state after the type (or, in a batch, the id) byte, without and with the hand. */
export const STATE_BYTES = 32;
export const HANDS_BYTES = 14;
/** One bite: the food's id (u32) and how much (f32). */
const BITE_BYTES = 8;
export const MAX_BITES = 16;

export type Pose = { speed: number; turn: number; wings: number; groom: number; feed: number; crouch: number; pitch: number; roll: number };

export type Hand = {
  x: number;
  y: number;
  z: number;
  /** Where the player's camera is, for the way a puff blows. */
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  /** The tool's index on the shelf, and its kind. */
  tool: number;
  variant: number;
};

/** One fly as it travels. */
export type FlyState = {
  /** The player it belongs to (set by the room in a batch). */
  id: number;
  flags: number;
  /** Which place the table was in when this was sent (the room's count of moves, wrapping at 256): a state from before a move is dropped. */
  epoch: number;
  /** The sender's count, wrapping at 65536. */
  seq: number;
  /** Room time when the fly was here, ms; on the wire a u32 that wraps, read back with `roomTime`. */
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** The surface's normal under it, x and z (y follows). */
  upX: number;
  upZ: number;
  vx: number;
  vy: number;
  vz: number;
  pose: Pose;
  hand: Hand;
};

export const createFlyState = (): FlyState => ({
  id: 0,
  flags: 0,
  epoch: 0,
  seq: 0,
  t: 0,
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  upX: 0,
  upZ: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  pose: { speed: 0, turn: 0, wings: 0, groom: 0, feed: 0, crouch: 0, pitch: 0, roll: 0 },
  hand: { x: 0, y: 0, z: 0, eyeX: 0, eyeY: 0, eyeZ: 0, tool: 0, variant: 0 },
});

export function copyFlyState(from: FlyState, to: FlyState) {
  to.id = from.id;
  to.flags = from.flags;
  to.epoch = from.epoch;
  to.seq = from.seq;
  to.t = from.t;
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.yaw = from.yaw;
  to.upX = from.upX;
  to.upZ = from.upZ;
  to.vx = from.vx;
  to.vy = from.vy;
  to.vz = from.vz;
  const p = to.pose;
  const q = from.pose;
  p.speed = q.speed;
  p.turn = q.turn;
  p.wings = q.wings;
  p.groom = q.groom;
  p.feed = q.feed;
  p.crouch = q.crouch;
  p.pitch = q.pitch;
  p.roll = q.roll;
  const h = to.hand;
  const g = from.hand;
  h.x = g.x;
  h.y = g.y;
  h.z = g.z;
  h.eyeX = g.eyeX;
  h.eyeY = g.eyeY;
  h.eyeZ = g.eyeZ;
  h.tool = g.tool;
  h.variant = g.variant;
}

const i16 = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v)));
const i8 = (v: number) => Math.max(-128, Math.min(127, Math.round(v)));
const u8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Bytes a fly's state takes after the type (and, in a batch, the id) byte. */
export const stateLength = (flags: number) => STATE_BYTES + (flags & HANDS ? HANDS_BYTES : 0);

/** Writes a fly's state at `at` (after its type or id byte), at its place's scale; a length out of range is clamped. Returns where it ends. */
export function writeState(view: DataView, at: number, scale: WireScale, s: FlyState): number {
  const pos = scale.position;
  view.setUint8(at, s.flags & 0xff);
  view.setUint8(at + 1, s.epoch & 0xff);
  view.setUint16(at + 2, s.seq & 0xffff, true);
  view.setUint32(at + 4, Math.max(0, Math.round(s.t)) >>> 0, true);
  view.setInt16(at + 8, i16(s.x * pos), true);
  view.setInt16(at + 10, i16(s.y * pos), true);
  view.setInt16(at + 12, i16(s.z * pos), true);
  const yaw = ((s.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  view.setUint16(at + 14, Math.round(yaw * YAW) & 0xffff, true);
  view.setInt8(at + 16, i8(s.upX * 127));
  view.setInt8(at + 17, i8(s.upZ * 127));
  view.setInt16(at + 18, i16(s.vx), true);
  view.setInt16(at + 20, i16(s.vy), true);
  view.setInt16(at + 22, i16(s.vz), true);
  const p = s.pose;
  view.setInt8(at + 24, i8(p.speed * 4));
  view.setInt8(at + 25, i8(p.turn * 16));
  view.setUint8(at + 26, u8(p.wings * 255));
  view.setUint8(at + 27, u8(p.groom * 255));
  view.setUint8(at + 28, u8(p.feed * 255));
  view.setUint8(at + 29, u8(p.crouch * 255));
  view.setInt8(at + 30, i8(p.pitch * 150));
  view.setInt8(at + 31, i8(p.roll * 200));
  let end = at + STATE_BYTES;
  if (s.flags & HANDS) {
    const h = s.hand;
    const pointer = scale.pointer;
    const eye = scale.eye;
    view.setInt16(end, i16(h.x * pointer), true);
    view.setInt16(end + 2, i16(h.y * pointer), true);
    view.setInt16(end + 4, i16(h.z * pointer), true);
    view.setInt16(end + 6, i16(h.eyeX * eye), true);
    view.setInt16(end + 8, i16(h.eyeY * eye), true);
    view.setInt16(end + 10, i16(h.eyeZ * eye), true);
    view.setUint8(end + 12, u8(h.tool));
    view.setUint8(end + 13, u8(h.variant));
    end += HANDS_BYTES;
  }
  return end;
}

/**
 * Reads a fly's state at `at` into `s`, at the scale of the place it is
 * from. Returns where it ends, or -1 if the message is too short. A state
 * from another place (its epoch isn't the one expected) comes out wrong and
 * must be dropped unused.
 */
export function readState(view: DataView, at: number, scale: WireScale, s: FlyState): number {
  if (at + STATE_BYTES > view.byteLength) return -1;
  const flags = view.getUint8(at);
  if (at + stateLength(flags) > view.byteLength) return -1;
  s.flags = flags;
  s.epoch = view.getUint8(at + 1);
  s.seq = view.getUint16(at + 2, true);
  s.t = view.getUint32(at + 4, true);
  const pos = scale.position;
  s.x = view.getInt16(at + 8, true) / pos;
  s.y = view.getInt16(at + 10, true) / pos;
  s.z = view.getInt16(at + 12, true) / pos;
  s.yaw = view.getUint16(at + 14, true) / YAW;
  s.upX = view.getInt8(at + 16) / 127;
  s.upZ = view.getInt8(at + 17) / 127;
  s.vx = view.getInt16(at + 18, true);
  s.vy = view.getInt16(at + 20, true);
  s.vz = view.getInt16(at + 22, true);
  const p = s.pose;
  p.speed = view.getInt8(at + 24) / 4;
  p.turn = view.getInt8(at + 25) / 16;
  p.wings = view.getUint8(at + 26) / 255;
  p.groom = view.getUint8(at + 27) / 255;
  p.feed = view.getUint8(at + 28) / 255;
  p.crouch = view.getUint8(at + 29) / 255;
  p.pitch = view.getInt8(at + 30) / 150;
  p.roll = view.getInt8(at + 31) / 200;
  let end = at + STATE_BYTES;
  if (flags & HANDS) {
    const h = s.hand;
    const pointer = scale.pointer;
    const eye = scale.eye;
    h.x = view.getInt16(end, true) / pointer;
    h.y = view.getInt16(end + 2, true) / pointer;
    h.z = view.getInt16(end + 4, true) / pointer;
    h.eyeX = view.getInt16(end + 6, true) / eye;
    h.eyeY = view.getInt16(end + 8, true) / eye;
    h.eyeZ = view.getInt16(end + 10, true) / eye;
    h.tool = view.getUint8(end + 12);
    h.variant = view.getUint8(end + 13);
    end += HANDS_BYTES;
  }
  return end;
}

/** The biggest FLY message: type, state, hand. */
export const FLY_MAX = 1 + STATE_BYTES + HANDS_BYTES;

/** Encodes the device's own fly into `out` (at least FLY_MAX bytes). Returns its length. */
export function encodeFly(out: DataView, scale: WireScale, s: FlyState): number {
  out.setUint8(0, FLY);
  return writeState(out, 1, scale, s);
}

/** A batch: type, count, then each fly's id and state. */
export function batchLength(states: readonly FlyState[], count = states.length) {
  let n = 2;
  for (let i = 0; i < count; i++) n += 1 + stateLength(states[i].flags);
  return n;
}

/** The biggest batch: every other fly at the table, each with its hand. */
export const FLIES_MAX = 2 + MAX_PLAYERS * (1 + STATE_BYTES + HANDS_BYTES);

export function encodeFlies(out: DataView, scale: WireScale, states: readonly FlyState[], count = states.length): number {
  out.setUint8(0, FLIES);
  out.setUint8(1, count);
  let at = 2;
  for (let i = 0; i < count; i++) {
    out.setUint8(at, states[i].id);
    at = writeState(out, at + 1, scale, states[i]);
  }
  return at;
}

/**
 * Reads a batch at the scale of the place expected, handing every fly's
 * state in turn to `each` (the same `scratch` object each time: copy what you
 * keep, and drop one from another epoch). Returns how many, or -1 if the
 * batch is broken.
 */
export function decodeFlies(view: DataView, scale: WireScale, scratch: FlyState, each: (s: FlyState) => void): number {
  if (view.byteLength < 2 || view.getUint8(0) !== FLIES) return -1;
  const count = view.getUint8(1);
  let at = 2;
  for (let i = 0; i < count; i++) {
    if (at >= view.byteLength) return -1;
    scratch.id = view.getUint8(at);
    at = readState(view, at + 1, scale, scratch);
    if (at < 0) return -1;
    each(scratch);
  }
  return count;
}

/**
 * Bites a fly took: the sender's count (for the room's acknowledgement),
 * then each food's id and how much, then the epoch of the place they were
 * taken in. The epoch is one byte after the bites, so a room that reads
 * only the bites takes them as before; without it (a device from before),
 * the bites are taken wherever the table is.
 */
export type Bite = { food: number; amount: number };

/** Bytes of `count` bites, without the epoch after them. */
export const bitesLength = (count: number) => 4 + count * BITE_BYTES;
/** The biggest bites message: as many as there may be, and the epoch. */
export const BITES_MAX = bitesLength(MAX_BITES) + 1;

/** Encodes bites into `out` (at least BITES_MAX bytes), with the epoch of the place they were taken in, if given. Returns the length. */
export function encodeBites(out: DataView, seq: number, bites: readonly Bite[], count = bites.length, epoch?: number): number {
  const n = Math.min(count, MAX_BITES);
  out.setUint8(0, BITES);
  out.setUint16(1, seq & 0xffff, true);
  out.setUint8(3, n);
  for (let i = 0; i < n; i++) {
    out.setUint32(4 + i * BITE_BYTES, bites[i].food >>> 0, true);
    out.setFloat32(8 + i * BITE_BYTES, bites[i].amount, true);
  }
  if (epoch === undefined) return bitesLength(n);
  out.setUint8(bitesLength(n), epoch & 0xff);
  return bitesLength(n) + 1;
}

/** Reads bites; `each` is called with each (food id, amount). Returns the sequence number, or -1 if broken. */
export function decodeBites(view: DataView, each: (food: number, amount: number) => void): number {
  if (view.byteLength < 4 || view.getUint8(0) !== BITES) return -1;
  const n = view.getUint8(3);
  if (n > MAX_BITES || view.byteLength < bitesLength(n)) return -1;
  for (let i = 0; i < n; i++) each(view.getUint32(4 + i * BITE_BYTES, true), view.getFloat32(8 + i * BITE_BYTES, true));
  return view.getUint16(1, true);
}

/** The epoch of the place bites were taken in, or null if the message doesn't say (or isn't bites). */
export function bitesEpoch(view: DataView): number | null {
  if (view.byteLength < 4 || view.getUint8(0) !== BITES) return null;
  const end = bitesLength(view.getUint8(3));
  return view.byteLength === end + 1 ? view.getUint8(end) : null;
}

/**
 * A time from the wire (a u32 of room ms, so it wraps every 2^32 ms, about
 * 49.7 days of a room server's uptime) as room time: the time it can be
 * that is nearest `now`, the reader's own room time, ms. Sent times are
 * never more than a few seconds from it, so this is always the one meant.
 */
export function roomTime(wire: number, now: number): number {
  const ahead = (((wire - now) % 2 ** 32) + 2 ** 32) % 2 ** 32;
  return now + (ahead >= 2 ** 31 ? ahead - 2 ** 32 : ahead);
}

// The JSON messages.

export type V3 = [number, number, number];
/** Where a fly stands: x, z, its yaw, and on the surface at or below which height (one table over another's floor; the highest, if left out). */
export type Spot = [x: number, z: number, yaw: number, y?: number];

/** A food as it travels: id, kind ("patch", a dropped kind, or "found"), name, x, z, reach, sweetness, how much is left, a pool, and the height it lies at (the highest surface there, if left out: a table kept before there were heights). */
export type FoodWire = [id: number, kind: string, name: string, x: number, z: number, r: number, sweet: number, amount: number, pool: 0 | 1, y?: number];

/** A ball in flight: who threw it, when (room ms) the swoop starts, and its path. */
export type BallWire = { by: number; at: number; from: V3; via: V3; to: V3 };

/** Something the place does, reproduced on every device from its seed. */
export type HappeningWire = { kind: string; seed: number; at: number };

/** The table's light and weather, as the Light and Weather tools name them ("clock" and "now" follow the table's clock). */
export type WorldWire = { light: string; weather: string };

/** The Light and Weather tools' kinds, as they travel. */
export const TABLE_LIGHTS = ["clock", "morning", "noon", "golden", "dusk", "night"] as const;
export const TABLE_WEATHERS = ["now", "clear", "overcast", "mist", "rain"] as const;

/** A player at the table: who, in what colour, and whether its device has stopped. */
export type PlayerWire = { id: number; colour: string; away: boolean };

/** What the one who starts a table says of it. */
export type TableStart = {
  place: string;
  light: string;
  weather: string;
  /** Their time zone (an IANA name, if the device knows it) and its offset from UTC now, minutes east: the table's clock is theirs. */
  zone: string;
  offset: number;
  /** What the room is called (`roomName`), and whether it is in the list of rooms anyone can browse; unlisted, only its link or code leads there. */
  name?: string;
  listed?: boolean;
};

/** A room as the list shows it: its code (to join it), name, place, how many flies are there now, whether it needs a password, and whether it is one of the rooms open to everyone. */
export type RoomWire = { code: string; name: string; place: string; flies: number; locked: boolean; everyone?: boolean };

/**
 * What a table says of itself in its welcome: its name, whether it is listed,
 * whether it is locked; its code, which for a room open to everyone may not
 * be the one asked for (a full one sends the device on to the next); and
 * whether it is one of those.
 */
export type RoomInfo = { name: string; listed: boolean; locked: boolean; code?: string; everyone?: boolean };

export type ClientMessage =
  | {
      type: "hello";
      v: number;
      /** The table's code, from the invitation. */
      table: string;
      /** This device's own key, kept on it: a returning player is known by it. */
      key: string;
      /** Starting the table, if it doesn't exist yet. */
      start?: TableStart;
      /**
       * The room's password: starting it, the lock it is to have; joining a
       * locked room this device has no seat at, the key to it. Sent only
       * over this socket, and only until welcomed.
       */
      password?: string;
      /** Where this device's fly is, coming back to the table after a moment away (a reconnection), and the epoch of the place it is in: from before a move, it isn't anywhere at the table. */
      at?: Spot;
      epoch?: number;
    }
  /** Instead of a hello: this connection only browses the listed rooms (answered with `rooms`, and again as they change). */
  | { type: "browse"; v: number }
  | { type: "ping"; t: number }
  | { type: "clearFood"; epoch: number }
  /**
   * `y`: the surface it falls to, at or below this height (the floor under a table, or the table).
   * `epoch`, on this and the others of a place's own (a ball, a burst bubble, found food): the
   * place it was done in; the room drops one from a place it has since left. Left out (by a
   * device from before), it is taken wherever the table is.
   */
  | { type: "drop"; id: number; kind: string; x: number; z: number; y: number; at: number; epoch?: number }
  | ({ type: "ball"; epoch?: number } & Omit<BallWire, "by">)
  | { type: "world"; light?: string; weather?: string }
  | { type: "place"; place: string }
  | { type: "remove"; id: number }
  | { type: "pop"; slot: number; cycle: number; at: number; epoch?: number }
  | { type: "found"; id: number; name: string; x: number; z: number; y: number; r: number; sweet: number; epoch?: number }
  | { type: "bye" };

/** Why the room turned a device away (and closed its connection with the matching code). */
export type Refusal = "version" | "full" | "removed" | "unknown" | "busy" | "malformed" | "elsewhere" | "locked";

/** WebSocket close codes for each refusal, and for a deploy restarting the server (try again shortly). */
export const CLOSE: Readonly<Record<Refusal | "restart" | "left", number>> = {
  version: 4001,
  full: 4002,
  removed: 4003,
  unknown: 4004,
  busy: 4005,
  malformed: 4006,
  elsewhere: 4007,
  locked: 4008,
  left: 4010,
  restart: 1012,
};

export type ServerMessage =
  | {
      type: "welcome";
      v: number;
      /** This player at the table, and its colour. */
      id: number;
      colour: string;
      /** Who started the table: they can remove a fly, and choose the place, the light and the weather. */
      starter: number;
      /** The table's seed, for its bubbles and its visitors. */
      seed: number;
      /** Room time now, ms, and the wall clock then (ms since 1970). */
      now: number;
      wall: number;
      /** The table's clock: the starter's offset from UTC now, minutes east. */
      offset: number;
      place: string;
      /** The room's count of moves, as fly states carry it. */
      epoch: number;
      world: WorldWire;
      players: PlayerWire[];
      foods: FoodWire[];
      balls: BallWire[];
      happenings: HappeningWire[];
      /** Each of the table's bubbles as it stands. */
      bubbles: BubbleSnapshot;
      /** Where this player's fly is to stand: where it was, coming back; where the table finds room for it, new. */
      at: Spot;
      room: RoomInfo;
    }
  /** `name`: a locked room's, to ask for its password by (whoever has its code may know what it is called). */
  | { type: "refused"; reason: Refusal; name?: string }
  /** The listed rooms, fullest first, to a browsing connection. */
  | { type: "rooms"; rooms: RoomWire[] }
  | { type: "pong"; t: number; now: number }
  | ({ type: "joined" } & PlayerWire)
  | { type: "away"; id: number; away: boolean }
  | { type: "left"; id: number }
  | { type: "drop"; by: number; id: number; kind: string; x: number; z: number; y: number; at: number }
  | ({ type: "ball" } & BallWire)
  | ({ type: "world"; offset: number } & WorldWire)
  /** The table is carried to another place: everyone's fly is set down there, where `spots` says, and its bubbles are as `bubbles` says (the picnic's; a room from before it said starts them at 0). */
  | { type: "place"; place: string; epoch: number; foods: FoodWire[]; spots: Record<number, Spot>; bubbles?: BubbleSnapshot }
  | ({ type: "happening" } & HappeningWire)
  | { type: "pop"; slot: number; cycle: number; at: number }
  | { type: "found"; food: FoodWire }
  /**
   * What is left of the food that changed, what is gone, how much this
   * player has eaten by the room's account, and the last of its bites the
   * room has counted.
   */
  | { type: "food"; ack: number; amounts: [number, number][]; gone: number[]; eaten: number };

/** Each player's colour, as a dab of paint on the thorax: bright enamels, as researchers mark flies. By player id. */
export const COLOURS = ["#ffd21f", "#2fb8ff", "#ff4fa3", "#59e05a", "#ff7a1a", "#f4f4f4", "#a466ff", "#ff2a2a"] as const;

/**
 * Food a player drops is named by its device, so its fly can eat it before
 * the room has heard of it: the player's id times this, plus the device's count.
 */
export const DROP_ID = 1_000_000;
/** Food the place puts out (a drop of juice, a crumb) is named from where it is: this plus a hash. */
export const FOUND_ID = 900_000_000;

/** Whose a dropped food is, from its id (0 if it isn't one). */
export const dropOwner = (id: number) => (id >= DROP_ID && id < FOUND_ID ? Math.floor(id / DROP_ID) : 0);

/** A found food's id, the same on every device that puts it at the same spot. */
export function foundId(name: string, x: number, z: number) {
  let h = 2166136261;
  const key = `${name}|${Math.round(x * 2)}|${Math.round(z * 2)}`;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return FOUND_ID + ((h >>> 0) % 90_000_000);
}

/** Sequence numbers wrap at 65536: whether `a` is at or after `b`. */
export const seqAtOrAfter = (a: number, b: number) => ((a - b) & 0xffff) < 0x8000;

/** A table's code: what its invitation carries. Ten letters and digits that can't be mistaken for one another (about 50 bits). */
export const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const CODE_LENGTH = 10;
export const isTableCode = (code: unknown): code is string => typeof code === "string" && code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));

/** A new table code from random bytes (crypto.getRandomValues's, in a browser or in Node). */
export function tableCode(random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array): string {
  const bytes = random(new Uint8Array(CODE_LENGTH));
  let code = "";
  // 256 is not a multiple of the alphabet's 31 letters: the few high bytes that would favour the first letters are drawn again.
  for (let i = 0; i < CODE_LENGTH; i++) {
    let b = bytes[i];
    while (b >= 248) b = random(new Uint8Array(1))[0];
    code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  }
  return code;
}

/**
 * The rooms open to everyone, which the room server keeps and nobody starts
 * (docs/online.md, "Everyone"): this many at most, each the code below. A
 * hello for any of them is a hello for whichever has room, that one first.
 */
export const EVERYONE_ROOMS = 64;
const EVERYONE_PREFIX = "222222";

/** The code of the `i`th room open to everyone: "2222222222", "2222222223", …, plainly a code where it is shown, never a word. */
export function everyoneCode(i: number): string {
  let code = "";
  for (let k = 0, n = i; k < CODE_LENGTH - EVERYONE_PREFIX.length; k++, n = Math.floor(n / CODE_ALPHABET.length)) code = CODE_ALPHABET[n % CODE_ALPHABET.length] + code;
  return EVERYONE_PREFIX + code;
}

/** Which room open to everyone a code is, or -1 if it isn't one. */
export function everyoneIndex(code: string): number {
  if (!isTableCode(code) || !code.startsWith(EVERYONE_PREFIX)) return -1;
  let i = 0;
  for (const c of code.slice(EVERYONE_PREFIX.length)) i = i * CODE_ALPHABET.length + CODE_ALPHABET.indexOf(c);
  return i < EVERYONE_ROOMS ? i : -1;
}

/** The first room open to everyone: where a device goes to be with others. */
export const EVERYONE = everyoneCode(0);

/** What the `i`th room open to everyone is called. */
export const everyoneName = (i: number) => (i === 0 ? "Everyone" : `Everyone ${i + 1}`);
