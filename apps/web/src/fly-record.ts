// Each fly this device lives is one fly from launch to launch: its record,
// kept in localStorage under `flies.fly.<slot>` (its place in line, 0 the
// followed fly), says who it is (a random id, and when it first arrived) and
// what its body was when it was last seen: how hungry, how full its crop, how
// thirsty, how much sleep it needed, and where it stood. Coming back, the time
// away is lived out by the body's own sums (Hunger.away, Thirst.away,
// pressureLeftAlone), with no brain to run: what the fly did while nobody
// watched is a stand-in. Its brain is not kept; it wakes afresh, as it does at
// every launch.
//
// Only the body's own state is kept, never what the brain makes of it, so the
// record means the same whatever the brain does with hunger, thirst or sleep.
//
// The record is a JSON object with a version, `v`. What another feature keeps
// about a fly (what its brain has learned, its first moments) is one field of
// its own, versioned inside, beside `body` and `where`; `v` changes only when
// what one of this file's fields means changes, and then this file reads the
// older version into the new. A record from a newer build keeps its identity
// and every field it has, carried through each save, but none of its state is
// read: a fly from the future starts the body afresh rather than misread it.
// A record that can't be read at all is a new fly in that place in line.
//
// FLY_LIMIT bounds each record on every host: the Apple TV keeps localStorage
// in its app's NSUserDefaults, which tvOS limits to 500 KB in all, and three
// flies' records must fit there beside the settings.

import { pressureLeftAlone } from "@fly/body";
import type { DayPace, Sun } from "@fly/body";
import type { Life } from "./life.ts";
import { isPlaceId } from "./places/catalog.ts";
import type { PlaceId } from "./places/catalog.ts";
import { clockHours } from "./scene/light.ts";
import { read, storage, writeText } from "./settings.ts";
import type { Storage } from "./settings.ts";

export const FLY_VERSION = 1;
/** The most one fly's record may take, characters of JSON: a record any larger isn't saved, and the one before it stays. */
export const FLY_LIMIT = 96 * 1024;
const KEY = "flies.fly.";

/**
 * What makes its body this fly's: hunger (0 fed to 1 starved), how full its crop, thirst (0 just drunk to 1 thirsty;
 * null in a record from before the body kept it, which leaves a fly's thirst where it starts) and its sleep pressure
 * (0 to 1) with the pace it was built at.
 */
export type BodyState = { hunger: number; fullness: number; thirst: number | null; sleep: { pressure: number; pace: DayPace } | null };
/** Where it stood: the place, and the spot there (mm; yaw in radians). */
export type Where = { place: PlaceId; x: number; y: number; z: number; yaw: number };

export type FlyRecord = {
  readonly id: string;
  /** When it first arrived, and when it was last saved (ms since 1970). */
  readonly born: number;
  at: number;
  /** Null for a fly not yet lived, or one whose state this build doesn't read. */
  body: BodyState | null;
  where: Where | null;
  /** Fields this build doesn't know, kept as they were. */
  readonly others: Readonly<Record<string, unknown>>;
};

const KNOWN = ["v", "id", "born", "at", "body", "where"];

const unit = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 1;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function readBody(saved: unknown): BodyState | null {
  if (!object(saved) || !unit(saved.hunger) || !unit(saved.fullness)) return null;
  const sleep = saved.sleep;
  const kept = object(sleep) && unit(sleep.pressure) && (sleep.pace === "lively" || sleep.pace === "natural");
  return { hunger: saved.hunger, fullness: saved.fullness, thirst: unit(saved.thirst) ? saved.thirst : null, sleep: kept ? { pressure: sleep.pressure as number, pace: sleep.pace as DayPace } : null };
}

function readWhere(saved: unknown): Where | null {
  if (!object(saved) || typeof saved.place !== "string" || !isPlaceId(saved.place)) return null;
  const { x, y, z, yaw } = saved;
  return finite(x) && finite(y) && finite(z) && finite(yaw) ? { place: saved.place, x, y, z, yaw } : null;
}

/** The fly in this place in line, as saved; or, if there is none or it can't be read, a new one, saved at once so that it is the same fly from now on. */
export function loadFly(slot: number, now: number, make: () => string, store: Storage | null = storage()): FlyRecord {
  const saved = read(store, KEY + slot);
  const v = saved?.v;
  const id = saved?.id;
  if (!saved || typeof v !== "number" || !Number.isInteger(v) || v < 1 || typeof id !== "string" || !/^[0-9a-f]{8,64}$/.test(id)) {
    const fly: FlyRecord = { id: make(), born: now, at: now, body: null, where: null, others: {} };
    saveFly(slot, fly, store);
    return fly;
  }
  const others: Record<string, unknown> = {};
  for (const key of Object.keys(saved)) if (!KNOWN.includes(key)) others[key] = saved[key];
  const ours = v === FLY_VERSION;
  return {
    id,
    born: finite(saved.born) ? saved.born : now,
    // When it was last saved isn't known: no time has passed.
    at: finite(saved.at) ? saved.at : now,
    body: ours ? readBody(saved.body) : null,
    where: ours ? readWhere(saved.where) : null,
    others,
  };
}

/** Saves it, unless it has grown past FLY_LIMIT: whether it was saved. */
export function saveFly(slot: number, fly: FlyRecord, store: Storage | null = storage()) {
  const text = JSON.stringify({ ...fly.others, v: FLY_VERSION, id: fly.id, born: fly.born, at: fly.at, body: fly.body, where: fly.where });
  if (text.length > FLY_LIMIT) return false;
  writeText(store, KEY + slot, text);
  return true;
}

/** Takes down what its life is now, in `place`, at `now` (ms since 1970). */
export function note(fly: FlyRecord, life: Life, place: PlaceId, now: number) {
  const r = life.rhythm;
  const { position, yaw } = life.body;
  fly.at = now;
  fly.body = { hunger: life.hunger.level, fullness: life.hunger.fullness, thirst: life.thirst.level, sleep: r ? { pressure: r.pressure, pace: r.pace } : null };
  fly.where = { place, x: position.x, y: position.y, z: position.z, yaw };
}

/**
 * `seconds` away, from the hour `from`: its crop empties and it grows hungry
 * and thirsty (each to a point), and its need for sleep goes as a fly left to itself would
 * have it. A clock gone backwards is no time at all.
 */
export function liveAway(life: Life, seconds: number, from: number, sun: Sun) {
  if (!(seconds > 0)) return;
  life.hunger.away(seconds);
  life.thirst.away(seconds);
  const r = life.rhythm;
  if (r) r.pressure = pressureLeftAlone(r.pressure, from, seconds, sun, r.pace);
}

/**
 * Gives a newly made life the body it had, with the time since lived out,
 * at `now` (ms since 1970) under `sun`. Where it stood, if it is in that place
 * again, alone (a table sets its flies down itself) and the spot is still on
 * the table. Its sleep pressure is kept only at the pace it was built at: a
 * fly given another pace starts as sleepy as that pace leaves it, as when the
 * pace changes while it lives (Rhythm.setTime).
 */
export function restore(fly: FlyRecord, life: Life, now: number, sun: Sun, here: PlaceId, alone: boolean) {
  const body = fly.body;
  if (body) {
    const seconds = (now - fly.at) / 1000;
    life.hunger.level = body.hunger;
    life.hunger.fullness = body.fullness;
    life.hunger.away(seconds);
    if (body.thirst !== null) life.thirst.level = body.thirst;
    life.thirst.away(seconds);
    const r = life.rhythm;
    if (r && body.sleep?.pace === r.pace) r.pressure = pressureLeftAlone(body.sleep.pressure, clockHours(new Date(fly.at)), seconds, sun, r.pace);
  }
  const where = fly.where;
  if (alone && where && where.place === here && life.world.onTable(where.x, where.z)) life.setDown(where.x, where.z, where.yaw, where.y);
}

/** Seconds between saves while the game runs: an app closed without warning loses no more than this. */
export const KEEP_EVERY = 30;

/** The records of the flies living now, by place in line, saved now and then and as each goes. */
export class Remembered {
  readonly #flies = new Map<number, FlyRecord>();
  readonly #make: () => string;
  readonly #store: Storage | null;
  #sinceSave = 0;

  /** `make`: a new fly's id. */
  constructor(make: () => string, store: Storage | null = storage()) {
    this.#make = make;
    this.#store = store;
  }

  /** The fly in `slot` arrives in `life`, given the body it had (`restore`). */
  arrive(slot: number, life: Life, now: number, sun: Sun, here: PlaceId, alone: boolean) {
    const fly = loadFly(slot, now, this.#make, this.#store);
    restore(fly, life, now, sun, here, alone);
    this.#flies.set(slot, fly);
  }

  /** The fly in `slot`, while it lives. */
  get(slot: number) {
    return this.#flies.get(slot);
  }

  /** Saves the fly in `slot` as `life` is now. */
  save(slot: number, life: Life, here: PlaceId, now: number) {
    const fly = this.#flies.get(slot);
    if (!fly) return;
    note(fly, life, here, now);
    saveFly(slot, fly, this.#store);
  }

  /** It goes (fewer flies, or a brain that wouldn't run): saved, to come back as it was when there are more again. */
  leave(slot: number, life: Life, here: PlaceId, now: number) {
    this.save(slot, life, here, now);
    this.#flies.delete(slot);
  }

  /** Once a frame: whether it is time to save them all. */
  due(dt: number) {
    this.#sinceSave += dt;
    if (this.#sinceSave < KEEP_EVERY) return false;
    this.#sinceSave = 0;
    return true;
  }
}
