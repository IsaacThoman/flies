// A device's reading of what the room sends. The room is the device's own
// site, but it passes on what other players said, and a server can be wrong
// or not the site's: so nothing it says is used until it has the shape the
// protocol gives it, with every list no longer than a table can hold and
// every number finite. A message that doesn't is dropped, never half-used,
// so the game can't throw on it or make something for each of a million ids.

import { MAX_PLAYERS, isTableCode } from "./protocol.ts";
import type { BallWire, FoodWire, HappeningWire, PlayerWire, Refusal, RoomWire, ServerMessage, Spot, V3 } from "./protocol.ts";
import { LISTED_MAX, roomName } from "./limits.ts";

/** The most food a table has at once: the restaurant's 25 patches, 6 dropped and 16 found, with room to spare. */
export const WIRE_FOODS_MAX = 96;
/** The most of anything else a list in a message may hold: bubbles, happenings. */
const LIST_MAX = 64;
/** The longest string a message's field may be: names, kinds, colours, places. */
const TEXT_MAX = 64;
/** Lengths on the wire are within this of the middle, mm (the room's own bound). */
const REACH = 10_000;

const REFUSALS: readonly Refusal[] = ["version", "full", "removed", "unknown", "busy", "malformed", "elsewhere", "locked"];

type Obj = Record<string, unknown>;

const obj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const int = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const text = (v: unknown): v is string => typeof v === "string" && v.length <= TEXT_MAX;
const bool = (v: unknown): v is boolean => typeof v === "boolean";
const near = (v: unknown): v is number => num(v) && Math.abs(v) < REACH;
const player = (v: unknown): v is number => int(v, 1, MAX_PLAYERS);
const list = (v: unknown, max: number, each: (x: unknown) => boolean) => Array.isArray(v) && v.length <= max && v.every((x) => each(x));

const isV3 = (v: unknown): v is V3 => Array.isArray(v) && v.length === 3 && v.every(near);
const isSpot = (v: unknown): v is Spot => Array.isArray(v) && (v.length === 3 || v.length === 4) && v.every(near);
const isPlayer = (v: unknown): v is PlayerWire => obj(v) && player(v.id) && text(v.colour) && bool(v.away);
const isBall = (v: unknown): v is BallWire => obj(v) && player(v.by) && num(v.at) && isV3(v.from) && isV3(v.via) && isV3(v.to);
const isHappening = (v: unknown): v is HappeningWire => obj(v) && text(v.kind) && num(v.seed) && num(v.at);
const isFood = (v: unknown): v is FoodWire =>
  Array.isArray(v) && (v.length === 9 || v.length === 10) && num(v[0]) && text(v[1]) && text(v[2]) && near(v[3]) && near(v[4]) && num(v[5]) && num(v[6]) && num(v[7]) &&
  (v[8] === 0 || v[8] === 1) && (v[9] === undefined || near(v[9]));
const isBubble = (v: unknown) => obj(v) && int(v.slot, 0, LIST_MAX) && int(v.cycle, 0, 2 ** 31) && num(v.t0) && num(v.poppedAt) && num(v.goneAt);
const isRoom = (v: unknown): v is RoomWire => obj(v) && isTableCode(v.code) && roomName(v.name) === v.name && text(v.place) && int(v.flies, 0, MAX_PLAYERS) && bool(v.locked);
const isAmount = (v: unknown) => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]);
const isSpots = (v: unknown) => obj(v) && Object.keys(v).length <= MAX_PLAYERS && Object.entries(v).every(([id, spot]) => player(Number(id)) && isSpot(spot));
const isWorld = (m: Obj) => text(m.light) && text(m.weather);

/** Whether `m` is the message its type says, whole: each field there and in bounds. */
function valid(m: Obj): boolean {
  switch (m.type) {
    case "welcome":
      return (
        num(m.v) && player(m.id) && text(m.colour) && int(m.starter, 0, MAX_PLAYERS) && num(m.seed) && num(m.now) && num(m.wall) && num(m.offset) && text(m.place) &&
        int(m.epoch, 0, 255) && obj(m.world) && isWorld(m.world) && list(m.players, MAX_PLAYERS, isPlayer) && list(m.foods, WIRE_FOODS_MAX, isFood) &&
        list(m.balls, MAX_PLAYERS, isBall) && list(m.happenings, LIST_MAX, isHappening) && list(m.bubbles, LIST_MAX, isBubble) && isSpot(m.at) && obj(m.room) &&
        text(m.room.name) && bool(m.room.listed) && bool(m.room.locked)
      );
    case "refused":
      return REFUSALS.includes(m.reason as Refusal) && (m.name === undefined || text(m.name));
    case "rooms":
      return Array.isArray(m.rooms) && m.rooms.length <= LISTED_MAX;
    case "pong":
      return num(m.t) && num(m.now);
    case "joined":
      return isPlayer(m);
    case "away":
      return player(m.id) && bool(m.away);
    case "left":
      return player(m.id);
    case "drop":
      return player(m.by) && num(m.id) && text(m.kind) && near(m.x) && near(m.z) && near(m.y) && num(m.at);
    case "ball":
      return isBall(m);
    case "world":
      return isWorld(m) && num(m.offset);
    case "place":
      return text(m.place) && int(m.epoch, 0, 255) && list(m.foods, WIRE_FOODS_MAX, isFood) && isSpots(m.spots) && (m.bubbles === undefined || list(m.bubbles, LIST_MAX, isBubble));
    case "happening":
      return isHappening(m);
    case "pop":
      return int(m.slot, 0, LIST_MAX) && int(m.cycle, 0, 2 ** 31) && num(m.at);
    case "found":
      return isFood(m.food);
    case "food":
      return int(m.ack, 0, 0xffff) && list(m.amounts, WIRE_FOODS_MAX, isAmount) && list(m.gone, WIRE_FOODS_MAX, num) && num(m.eaten) &&
        (m.meal === undefined || (isAmount(m.meal) && (m.meal as number[])[0]! >= 0 && (m.meal as number[])[1]! >= 0 && (m.meal as number[])[1]! <= (m.meal as number[])[0]!));
    default:
      return false;
  }
}

/**
 * The message in `data`, if it is one the protocol has, whole; null if it
 * isn't JSON, isn't a message, or any part of it is out of shape. A list of
 * rooms keeps only the rooms in it that are rooms (and named as a room may
 * be), so one bad entry doesn't empty the list.
 */
export function readServerMessage(data: string): ServerMessage | null {
  // Nothing the room sends comes near this: a welcome at its fullest is a few kilobytes.
  if (data.length > 256 * 1024) return null;
  let m: unknown;
  try {
    m = JSON.parse(data);
  } catch {
    return null;
  }
  if (!obj(m) || !valid(m)) return null;
  if (m.type === "rooms") return { type: "rooms", rooms: (m.rooms as unknown[]).filter(isRoom) };
  return m as ServerMessage;
}
