// The wire between a fly's device and the room it is at (docs/online.md has
// the whole format). Two kinds of message share one WebSocket:
//
// - Binary, for what goes many times a second: each fly's state, from its
//   device up to the room and from the room down to everyone else in one
//   batch; and the bites a fly takes, which must not be lost. Fixed layouts,
//   little-endian, quantised to what the eye and the body need.
// - JSON text, for what happens now and then: joining, the clock, food
//   dropped, a ball thrown, the weather chosen, a visitor arriving.
//
// The first message on a connection is the client's `hello` with PROTOCOL;
// the room refuses a version it doesn't speak.

import type { BubbleSnapshot } from "./bubbles.ts";

/** Bumped whenever a layout or a message changes meaning. */
export const PROTOCOL = 1;

/** Binary message types: the first byte. */
export const FLY = 1;
export const FLIES = 2;
export const BITES = 3;

/** How often a device sends its fly, and the room sends the batch, ms. */
export const SEND_EVERY = 50;

/** Flag bits in a fly's state. */
export const AIRBORNE = 1;
/** Its owner's tab is hidden or asleep: the fly isn't living, it stands still. */
export const AWAY = 2;
export const EATING = 4;
/** The player's hand is out on the table (playing, not the wallpaper): the pointer and tool follow. */
export const HANDS = 8;
/** Select is held: tickling or blowing. */
export const HOLDING = 16;
/** Someone is at the remote (not the wallpaper, a press within the last minute): the room's visitors wait. */
export const PLAYING = 32;

/** Position in 1/50 mm (±655 mm), the hand's pointer in 1/20 mm (±1.6 m), the camera in 1/10 mm (±3.3 m). */
const POS = 50;
const POINTER = 20;
const EYE = 10;
const YAW = 65536 / (Math.PI * 2);

/** Bytes of a fly's state after the type byte, without and with the hand. */
export const STATE_BYTES = 31;
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
  /** The sender's count, wrapping at 65536. */
  seq: number;
  /** Room time when the fly was here, ms. */
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
  Object.assign(to.pose, from.pose);
  Object.assign(to.hand, from.hand);
}

const i16 = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v)));
const i8 = (v: number) => Math.max(-128, Math.min(127, Math.round(v)));
const u8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Bytes a fly's state takes after the type (and, in a batch, the id) byte. */
export const stateLength = (flags: number) => STATE_BYTES + (flags & HANDS ? HANDS_BYTES : 0);

/** Writes a fly's state at `at` (after its type or id byte). Returns where it ends. */
export function writeState(view: DataView, at: number, s: FlyState): number {
  view.setUint8(at, s.flags & 0xff);
  view.setUint16(at + 1, s.seq & 0xffff, true);
  view.setUint32(at + 3, Math.max(0, Math.round(s.t)) >>> 0, true);
  view.setInt16(at + 7, i16(s.x * POS), true);
  view.setInt16(at + 9, i16(s.y * POS), true);
  view.setInt16(at + 11, i16(s.z * POS), true);
  const yaw = ((s.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  view.setUint16(at + 13, Math.round(yaw * YAW) & 0xffff, true);
  view.setInt8(at + 15, i8(s.upX * 127));
  view.setInt8(at + 16, i8(s.upZ * 127));
  view.setInt16(at + 17, i16(s.vx), true);
  view.setInt16(at + 19, i16(s.vy), true);
  view.setInt16(at + 21, i16(s.vz), true);
  const p = s.pose;
  view.setInt8(at + 23, i8(p.speed * 4));
  view.setInt8(at + 24, i8(p.turn * 16));
  view.setUint8(at + 25, u8(p.wings * 255));
  view.setUint8(at + 26, u8(p.groom * 255));
  view.setUint8(at + 27, u8(p.feed * 255));
  view.setUint8(at + 28, u8(p.crouch * 255));
  view.setInt8(at + 29, i8(p.pitch * 150));
  view.setInt8(at + 30, i8(p.roll * 200));
  let end = at + STATE_BYTES;
  if (s.flags & HANDS) {
    const h = s.hand;
    view.setInt16(end, i16(h.x * POINTER), true);
    view.setInt16(end + 2, i16(h.y * POINTER), true);
    view.setInt16(end + 4, i16(h.z * POINTER), true);
    view.setInt16(end + 6, i16(h.eyeX * EYE), true);
    view.setInt16(end + 8, i16(h.eyeY * EYE), true);
    view.setInt16(end + 10, i16(h.eyeZ * EYE), true);
    view.setUint8(end + 12, u8(h.tool));
    view.setUint8(end + 13, u8(h.variant));
    end += HANDS_BYTES;
  }
  return end;
}

/** Reads a fly's state at `at` into `s`. Returns where it ends, or -1 if the message is too short. */
export function readState(view: DataView, at: number, s: FlyState): number {
  if (at + STATE_BYTES > view.byteLength) return -1;
  const flags = view.getUint8(at);
  if (at + stateLength(flags) > view.byteLength) return -1;
  s.flags = flags;
  s.seq = view.getUint16(at + 1, true);
  s.t = view.getUint32(at + 3, true);
  s.x = view.getInt16(at + 7, true) / POS;
  s.y = view.getInt16(at + 9, true) / POS;
  s.z = view.getInt16(at + 11, true) / POS;
  s.yaw = view.getUint16(at + 13, true) / YAW;
  s.upX = view.getInt8(at + 15) / 127;
  s.upZ = view.getInt8(at + 16) / 127;
  s.vx = view.getInt16(at + 17, true);
  s.vy = view.getInt16(at + 19, true);
  s.vz = view.getInt16(at + 21, true);
  const p = s.pose;
  p.speed = view.getInt8(at + 23) / 4;
  p.turn = view.getInt8(at + 24) / 16;
  p.wings = view.getUint8(at + 25) / 255;
  p.groom = view.getUint8(at + 26) / 255;
  p.feed = view.getUint8(at + 27) / 255;
  p.crouch = view.getUint8(at + 28) / 255;
  p.pitch = view.getInt8(at + 29) / 150;
  p.roll = view.getInt8(at + 30) / 200;
  let end = at + STATE_BYTES;
  if (flags & HANDS) {
    const h = s.hand;
    h.x = view.getInt16(end, true) / POINTER;
    h.y = view.getInt16(end + 2, true) / POINTER;
    h.z = view.getInt16(end + 4, true) / POINTER;
    h.eyeX = view.getInt16(end + 6, true) / EYE;
    h.eyeY = view.getInt16(end + 8, true) / EYE;
    h.eyeZ = view.getInt16(end + 10, true) / EYE;
    h.tool = view.getUint8(end + 12);
    h.variant = view.getUint8(end + 13);
    end += HANDS_BYTES;
  }
  return end;
}

/** The biggest FLY message: type, state, hand. */
export const FLY_MAX = 1 + STATE_BYTES + HANDS_BYTES;

/** Encodes the device's own fly into `out` (at least FLY_MAX bytes). Returns its length. */
export function encodeFly(out: DataView, s: FlyState): number {
  out.setUint8(0, FLY);
  return writeState(out, 1, s);
}

/** A batch: type, count, then each fly's id and state. */
export function batchLength(states: readonly FlyState[], count = states.length) {
  let n = 2;
  for (let i = 0; i < count; i++) n += 1 + stateLength(states[i].flags);
  return n;
}

export function encodeFlies(out: DataView, states: readonly FlyState[], count = states.length): number {
  out.setUint8(0, FLIES);
  out.setUint8(1, count);
  let at = 2;
  for (let i = 0; i < count; i++) {
    out.setUint8(at, states[i].id);
    at = writeState(out, at + 1, states[i]);
  }
  return at;
}

/**
 * Reads a batch, calling `each` with every fly's state in turn (the same
 * `scratch` object each time: copy what you keep). Returns how many, or -1
 * if the batch is broken.
 */
export function decodeFlies(view: DataView, scratch: FlyState, each: (s: FlyState) => void): number {
  if (view.byteLength < 2 || view.getUint8(0) !== FLIES) return -1;
  const count = view.getUint8(1);
  let at = 2;
  for (let i = 0; i < count; i++) {
    if (at >= view.byteLength) return -1;
    scratch.id = view.getUint8(at);
    at = readState(view, at + 1, scratch);
    if (at < 0) return -1;
    each(scratch);
  }
  return count;
}

/** Bites a fly took: the sender's count (for the room's acknowledgement), then each food's id and how much. */
export type Bite = { food: number; amount: number };

export const bitesLength = (count: number) => 4 + count * BITE_BYTES;

export function encodeBites(out: DataView, seq: number, bites: readonly Bite[], count = bites.length): number {
  const n = Math.min(count, MAX_BITES);
  out.setUint8(0, BITES);
  out.setUint16(1, seq & 0xffff, true);
  out.setUint8(3, n);
  for (let i = 0; i < n; i++) {
    out.setUint32(4 + i * BITE_BYTES, bites[i].food >>> 0, true);
    out.setFloat32(8 + i * BITE_BYTES, bites[i].amount, true);
  }
  return bitesLength(n);
}

/** Reads bites; `each` is called with each (food id, amount). Returns the sequence number, or -1 if broken. */
export function decodeBites(view: DataView, each: (food: number, amount: number) => void): number {
  if (view.byteLength < 4 || view.getUint8(0) !== BITES) return -1;
  const n = view.getUint8(3);
  if (n > MAX_BITES || view.byteLength < bitesLength(n)) return -1;
  for (let i = 0; i < n; i++) each(view.getUint32(4 + i * BITE_BYTES, true), view.getFloat32(8 + i * BITE_BYTES, true));
  return view.getUint16(1, true);
}

// The JSON messages.

export type V3 = [number, number, number];

/** A food as it travels: id, kind ("patch", a dropped kind, or "found"), name, x, z, reach, sweetness, how much is left, a pool. */
export type FoodWire = [id: number, kind: string, name: string, x: number, z: number, r: number, sweet: number, amount: number, pool: 0 | 1];

/** A ball in flight: who threw it, when (room ms) the swoop starts, and its path. */
export type BallWire = { by: number; at: number; from: V3; via: V3; to: V3 };

/** Something the place does, reproduced on every device from its seed. */
export type HappeningWire = { kind: string; seed: number; at: number };

export type WorldWire = { light: string; weather: string };

export type ClientMessage =
  | { type: "hello"; v: number }
  | { type: "ping"; t: number }
  | { type: "drop"; id: number; kind: string; x: number; z: number; at: number }
  | ({ type: "ball" } & Omit<BallWire, "by">)
  | { type: "world"; light?: string; weather?: string }
  | { type: "pop"; slot: number; cycle: number; at: number }
  | { type: "found"; id: number; name: string; x: number; z: number; r: number; sweet: number };

export type PlayerWire = { id: number; colour: string };

export type ServerMessage =
  | {
      type: "welcome";
      v: number;
      id: number;
      colour: string;
      /** The table's seed, for its bubbles and its visitors. */
      seed: number;
      /** Room time now, ms, and the table's hour of the day then (its clock is the room's, not each player's). */
      now: number;
      hours: number;
      world: WorldWire;
      players: PlayerWire[];
      foods: FoodWire[];
      balls: BallWire[];
      happenings: HappeningWire[];
      /** Each of the table's bubbles as it stands. */
      bubbles: BubbleSnapshot;
    }
  | { type: "refused"; reason: string }
  | { type: "pong"; t: number; now: number }
  | ({ type: "joined" } & PlayerWire)
  | { type: "left"; id: number }
  | { type: "drop"; by: number; id: number; kind: string; x: number; z: number; at: number }
  | ({ type: "ball" } & BallWire)
  | ({ type: "world" } & WorldWire)
  | ({ type: "happening" } & HappeningWire)
  | { type: "pop"; slot: number; cycle: number; at: number }
  | { type: "found"; food: FoodWire }
  /**
   * What is left of the food that changed, what is gone, who has eaten how
   * much, and the last of this player's bites the room has counted.
   */
  | { type: "food"; ack: number; amounts: [number, number][]; gone: number[]; eaten: Record<number, number> };

/** Each player's colour, as a dab of paint on the thorax: bright enamels, as researchers mark flies. In joining order. */
export const COLOURS = ["#ffd21f", "#2fb8ff", "#ff4fa3", "#59e05a", "#ff7a1a", "#f4f4f4", "#a466ff", "#ff2a2a", "#22e0c8", "#c8ff3a", "#ff9ad5", "#3a5bff", "#ffb07a", "#7affb0", "#d0a0ff", "#9a9a9a"];

/** Player ids are 1 to 255 (one byte on the wire). */
export const MAX_PLAYERS = 16;

/**
 * Food a player drops is named by its device, so it can be eaten before the
 * room has heard of it: the player's id times this, plus the device's count.
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
