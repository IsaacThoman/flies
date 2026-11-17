// What the game keeps between launches, in localStorage: the player's
// settings, the few choices on the shelf worth coming back to, what the
// button hints have already taught, and this device's key and table for
// playing with others. A save from
// another build, or a broken one, never stops the game: anything that isn't
// one of today's values is left at its default.

import { PACES } from "@fly/body";
import type { DayPace } from "@fly/body";
import { EVERYONE_SERIES, MAX_OWN } from "@fly/net";
import type { Option } from "@fly/ui";
import type { WallpaperStyle } from "./camera.ts";
import { PIXEL_SIZES } from "./display.ts";
import type { PixelSize } from "./display.ts";
import { isPlaceId } from "./places/catalog.ts";
import type { PlaceId } from "./places/catalog.ts";
import { DIALS, TOOLS, kindsOf } from "./tools/hands.ts";
import type { DialId, ToolId } from "./tools/hands.ts";

export type EyesDetail = "off" | "low" | "high";
/** When something shows over the picture: never, in the wallpaper, or while playing too. */
export type ShowWhen = "off" | "wallpaper" | "always";
/** What the stats in a corner are of: its brain at work, its day so far, both, or what goes in and out of its brain. */
export type StatsKind = "brain" | "day" | "both" | "signals";
/** How big the pictures in the corners are, and how much of the world shows through them. */
export type OverlaySize = "small" | "medium" | "large";
export type OverlayOpacity = "full" | "soft" | "faint";

/** Each size as a share of the corners' own size, which is "medium". */
export const OVERLAY_SIZES: Record<OverlaySize, number> = { small: 0.75, medium: 1, large: 1.3 };
export const OVERLAY_OPACITIES: Record<OverlayOpacity, number> = { full: 1, soft: 0.7, faint: 0.45 };

export const WALLPAPER_DELAYS: Option<number>[] = [
  { value: 15, label: "15 s" },
  { value: 30, label: "30 s" },
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
  { value: 300, label: "5 min" },
  { value: 0, label: "Never" },
];

export type Settings = {
  pixels: PixelSize;
  /** Seconds without a press before the game becomes a wallpaper; 0 never. */
  wallpaperAfter: number;
  /** How the camera moves in the wallpaper: "follow" keeps one shot on the fly, "calm" holds long shots, "lively" changes them more often, "whole" keeps the whole place in view. */
  wallpaperCamera: WallpaperStyle;
  /** How its day goes: livelier than a fly's, to watch, or as a fly's, with a long midday siesta and the night asleep (packages/body rhythm.ts). */
  pace: DayPace;
  /** How finely the fly's eyes are rendered. */
  eyes: EyesDetail;
  /** What its eyes see, small in a corner. */
  eyesInset: ShowWhen;
  /** Its nervous system at work, small in a corner. */
  nerves: ShowWhen;
  /** The fly drawn as glass with its nervous system glowing inside. */
  xray: ShowWhen;
  /** Numbers about the fly in a corner, and which. */
  statsPanel: ShowWhen;
  statsKind: StatsKind;
  /** The pictures in the corners: their size, and how solid they are. */
  overlaySize: OverlaySize;
  overlayOpacity: OverlayOpacity;
  /** Show what the buttons do. */
  hints: boolean;
  /** Feel the tools and the fly through a game pad or a phone that can vibrate. */
  rumble: boolean;
  /** Small frame-cost counters in a corner. */
  stats: boolean;
  /** On the Sky's "Now", the real weather and sunrise and sunset outside, where the Apple TV can tell them. */
  realWeather: boolean;
  /** Where the fly lives: its home, where a launch finds it and play is. */
  place: PlaceId;
  /** In the screensaver, whether it stays home or is carried to each place in turn (back home when play begins). */
  wallpaperPlaces: "home" | "turns";
  /** How many flies this device lives, each with a brain of its own: the first is the one the player follows. */
  flies: number;
  /** The series of rooms open to everyone the player has taken the fly to visit (docs/online.md), until it goes home; -1 at home. */
  visit: number;
};

export const DEFAULT_SETTINGS: Settings = {
  pixels: "classic",
  wallpaperAfter: 30,
  wallpaperCamera: "follow",
  pace: "lively",
  eyes: "low",
  eyesInset: "always",
  nerves: "wallpaper",
  xray: "off",
  statsPanel: "off",
  statsKind: "both",
  overlaySize: "medium",
  overlayOpacity: "full",
  hints: true,
  rumble: true,
  stats: false,
  realWeather: true,
  place: "picnic",
  wallpaperPlaces: "home",
  flies: 1,
  visit: -1,
};

const showWhen = (v: ShowWhen) => ["off", "wallpaper", "always"].includes(v);

/** What a saved setting may be, where not every value of its type will do. */
const VALID: { readonly [K in keyof Settings]?: (value: Settings[K]) => boolean } = {
  pixels: (v) => Object.hasOwn(PIXEL_SIZES, v),
  wallpaperAfter: (v) => WALLPAPER_DELAYS.some((delay) => delay.value === v),
  wallpaperCamera: (v) => ["follow", "calm", "lively", "whole"].includes(v),
  pace: (v) => Object.hasOwn(PACES, v),
  eyes: (v) => ["off", "low", "high"].includes(v),
  eyesInset: showWhen,
  nerves: showWhen,
  xray: showWhen,
  statsPanel: showWhen,
  statsKind: (v) => ["brain", "day", "both", "signals"].includes(v),
  overlaySize: (v) => Object.hasOwn(OVERLAY_SIZES, v),
  overlayOpacity: (v) => Object.hasOwn(OVERLAY_OPACITIES, v),
  place: isPlaceId,
  wallpaperPlaces: (v) => v === "home" || v === "turns",
  flies: (v) => Number.isInteger(v) && v >= 1 && v <= MAX_OWN,
  visit: (v) => Number.isInteger(v) && v >= -1 && v < EVERYONE_SERIES,
};

const SETTINGS_KEY = "flies.settings";
const SHELF_KEY = "flies.shelf";
const LEARNED_KEY = "flies.learned";
const TABLE_KEY = "flies.table";

export type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

export function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** A saved object, or null if there is none or it can't be read. */
export function read(store: Storage | null, key: string): Record<string, unknown> | null {
  try {
    const saved: unknown = JSON.parse(store?.getItem(key) ?? "null");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? (saved as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function write(store: Storage | null, key: string, value: unknown) {
  writeText(store, key, JSON.stringify(value));
}

/** Saves what is already JSON. */
export function writeText(store: Storage | null, key: string, text: string) {
  try {
    store?.setItem(key, text);
  } catch {
    // Full or blocked: it lasts until the app closes.
  }
}

/**
 * Reads the saved settings, keeping only values the game can use. A save
 * from before the fly had a home lived "each in turn" (then the default) and
 * was online by default: it lives where it was last, still goes round the
 * places in the screensaver, and is at home, as every launch now is until the
 * player takes it to visit. Being online then was the default, never a
 * choice, so there is no visit to keep.
 */
export function loadSettings(store: Storage | null = storage()): Settings {
  const settings = { ...DEFAULT_SETTINGS };
  const saved = read(store, SETTINGS_KEY);
  if (!saved) return settings;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = saved[key];
    const valid = VALID[key] as ((value: unknown) => boolean) | undefined;
    if (typeof value === typeof DEFAULT_SETTINGS[key] && (!valid || valid(value))) (settings as Record<string, unknown>)[key] = value;
  }
  if (saved.place === "turns") {
    if (typeof saved.scene === "string" && isPlaceId(saved.scene)) settings.place = saved.scene;
    if (saved.wallpaperPlaces === undefined) settings.wallpaperPlaces = "turns";
  }
  return settings;
}

export function saveSettings(settings: Settings, store: Storage | null = storage()) {
  write(store, SETTINGS_KEY, settings);
}

const HOUR = 3_600_000;

/**
 * The shelf's choices a launch comes back to, and for how long after each was
 * made (ms). A way of watching is the player's to keep. A time of day or a
 * weather is for now: a few hours on, a launch is back to following the clock,
 * as the wallpaper is meant to. Looking through its eyes isn't kept, as a
 * launch would open on no fly at all. Everything else starts fresh, on Feed
 * with sugar: one press of Select and the fly has something to find.
 */
export const KEPT: { readonly [D in DialId]: { readonly for: number; readonly not?: readonly string[] } } = {
  view: { for: Infinity, not: ["eyes"] },
  light: { for: 6 * HOUR },
  weather: { for: 6 * HOUR },
};

/** A kind chosen on the shelf (its id in its dial's kinds), and when (ms since 1970). */
export type Chosen = { kind: string; at: number };
/**
 * Saved by the dial it was chosen on ("light" and "weather" are the Sky's two,
 * by the names of the tools they were before the Sky had both, so a choice
 * made then comes back on the Sky).
 */
export type ShelfChoices = { [D in DialId]?: Chosen };

/** The shelf's kept choices still in time, each a kind its dial has today. */
export function loadShelf(now: number, store: Storage | null = storage()): ShelfChoices {
  const shelf: ShelfChoices = {};
  const saved = read(store, SHELF_KEY);
  if (!saved) return shelf;
  for (const id of Object.keys(KEPT) as DialId[]) {
    const kept = KEPT[id];
    const tool = TOOLS.find((t) => t.id === DIALS[id].tool);
    const chosen = saved[id] as Partial<Chosen> | null | undefined;
    if (!tool || !chosen || typeof chosen !== "object") continue;
    const { kind, at } = chosen;
    if (typeof kind !== "string" || typeof at !== "number" || !(now - at < kept.for)) continue;
    if (kept.not?.includes(kind) || !kindsOf(tool, DIALS[id].dial).some((v) => v.id === kind)) continue;
    shelf[id] = { kind, at };
  }
  return shelf;
}

export function saveShelf(shelf: ShelfChoices, store: Storage | null = storage()) {
  write(store, SHELF_KEY, shelf);
}

/**
 * What a hint teaches: going along the shelf ("tools"), or what Select does
 * with a tool (by its id). Once the player has done it, its hint goes, and a
 * later launch doesn't teach it again.
 */
export type Lesson = "arrival" | "tools" | "hand" | ToolId;
export type Learned = { [L in Lesson]?: true };

/** What the hints have taught, of the lessons this build has. The Sky is learned by one who used both the tools it was before, Light and Weather. */
export function loadLearned(store: Storage | null = storage()): Learned {
  const learned: Learned = {};
  const saved = read(store, LEARNED_KEY);
  if (!saved) return learned;
  for (const lesson of ["arrival", "tools", "hand", ...TOOLS.map((t) => t.id)] as Lesson[]) if (saved[lesson] === true) learned[lesson] = true;
  if (saved.light === true && saved.weather === true) learned.sky = true;
  return learned;
}

export function saveLearned(learned: Learned, store: Storage | null = storage()) {
  write(store, LEARNED_KEY, learned);
}

/** This device at tables with others: its own key, made the first time and kept (a returning player is known by it), and the table it is at, if any. */
export type TableSeat = { key: string; table: string | null };

export function loadTableSeat(make: () => string, store: Storage | null = storage()): TableSeat {
  const saved = read(store, TABLE_KEY);
  const key = typeof saved?.key === "string" && saved.key.length >= 16 ? saved.key : make();
  const table = typeof saved?.table === "string" ? saved.table : null;
  if (saved?.key !== key) write(store, TABLE_KEY, { key, table });
  return { key, table };
}

export function saveTableSeat(seat: TableSeat, store: Storage | null = storage()) {
  write(store, TABLE_KEY, seat);
}

/** What the fly has done on `date` (the local day, as YYYY-MM-DD): mm walked, meals begun, take-offs, and seconds flying and grooming. */
export type Day = { date: string; walked: number; meals: number; takeOffs: number; flown: number; groomed: number };
export const DAY_COUNTS = ["walked", "meals", "takeOffs", "flown", "groomed"] as const;
const DAY_KEY = "flies.day";

/** A day with nothing done in it yet. */
export const freshDay = (date: string): Day => ({ date, walked: 0, meals: 0, takeOffs: 0, flown: 0, groomed: 0 });

/** Today's tally as saved, or a fresh one if the save is of another day; a count that isn't one starts again from nothing. */
export function loadDay(date: string, store: Storage | null = storage()): Day {
  const day = freshDay(date);
  const saved = read(store, DAY_KEY);
  if (!saved || saved.date !== date) return day;
  for (const key of DAY_COUNTS) {
    const value = saved[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) day[key] = value;
  }
  return day;
}

export function saveDay(day: Day, store: Storage | null = storage()) {
  write(store, DAY_KEY, day);
}
