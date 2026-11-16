// What the game keeps between launches, in localStorage: the player's
// settings, and the few choices on the shelf worth coming back to. A save from
// another build, or a broken one, never stops the game: anything that isn't
// one of today's values is left at its default.

import type { WallpaperStyle } from "./camera.ts";
import { PIXEL_SIZES } from "./display.ts";
import type { PixelSize } from "./display.ts";
import { isPlaceId } from "./places/catalog.ts";
import type { PlaceId } from "./places/catalog.ts";
import { TOOLS } from "./tools/hands.ts";
import type { ToolId } from "./tools/hands.ts";

export type EyesDetail = "off" | "low" | "high";
/** When something shows over the picture: never, in the wallpaper, or while playing too. */
export type ShowWhen = "off" | "wallpaper" | "always";

export type Settings = {
  /** 0 to 10. */
  effects: number;
  ambience: number;
  pixels: PixelSize;
  /** Seconds without a press before the game becomes a wallpaper; 0 never. */
  wallpaperAfter: number;
  /** How the camera moves in the wallpaper: "follow" keeps one shot on the fly, "calm" holds long shots, "lively" changes them more often. */
  wallpaperCamera: WallpaperStyle;
  /** How finely the fly's eyes are rendered. */
  eyes: EyesDetail;
  /** What its eyes see, small in a corner. */
  eyesInset: ShowWhen;
  /** Show what the buttons do. */
  hints: boolean;
  /** Small frame-cost counters in a corner. */
  stats: boolean;
  /** Where the fly lives: one place, or each in turn (it moves on during a long wallpaper). */
  place: PlaceId | "turns";
  /** Where it was last, to come back to. */
  scene: PlaceId;
};

export const DEFAULT_SETTINGS: Settings = {
  effects: 7,
  ambience: 5,
  pixels: "classic",
  wallpaperAfter: 60,
  wallpaperCamera: "follow",
  eyes: "low",
  eyesInset: "wallpaper",
  hints: true,
  stats: false,
  place: "turns",
  scene: "picnic",
};

const volume = (v: number) => v >= 0 && v <= 10;
const showWhen = (v: ShowWhen) => ["off", "wallpaper", "always"].includes(v);

/** What a saved setting may be, where not every value of its type will do. */
const VALID: { readonly [K in keyof Settings]?: (value: Settings[K]) => boolean } = {
  effects: volume,
  ambience: volume,
  pixels: (v) => Object.hasOwn(PIXEL_SIZES, v),
  wallpaperAfter: (v) => v >= 0,
  wallpaperCamera: (v) => ["follow", "calm", "lively"].includes(v),
  eyes: (v) => ["off", "low", "high"].includes(v),
  eyesInset: showWhen,
  place: (v) => v === "turns" || isPlaceId(v),
  scene: isPlaceId,
};

const SETTINGS_KEY = "apple-tv-fly.settings";
const SHELF_KEY = "apple-tv-fly.shelf";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** A saved object, or null if there is none or it can't be read. */
function read(store: Storage | null, key: string): Record<string, unknown> | null {
  try {
    const saved: unknown = JSON.parse(store?.getItem(key) ?? "null");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? (saved as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function write(store: Storage | null, key: string, value: unknown) {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked: it lasts until the app closes.
  }
}

/** Reads the saved settings, keeping only values the game can use. */
export function loadSettings(store: Storage | null = storage()): Settings {
  const settings = { ...DEFAULT_SETTINGS };
  const saved = read(store, SETTINGS_KEY);
  if (!saved) return settings;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = saved[key];
    const valid = VALID[key] as ((value: unknown) => boolean) | undefined;
    if (typeof value === typeof DEFAULT_SETTINGS[key] && (!valid || valid(value))) (settings as Record<string, unknown>)[key] = value;
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
export const KEPT: { readonly [T in ToolId]?: { readonly for: number; readonly not?: readonly string[] } } = {
  view: { for: Infinity, not: ["eyes"] },
  light: { for: 6 * HOUR },
  weather: { for: 6 * HOUR },
};

/** A kind chosen on the shelf (its id in its tool's kinds), and when (ms since 1970). */
export type Chosen = { kind: string; at: number };
export type ShelfChoices = { [T in ToolId]?: Chosen };

/** The shelf's kept choices still in time, each a kind its tool has today. */
export function loadShelf(now: number, store: Storage | null = storage()): ShelfChoices {
  const shelf: ShelfChoices = {};
  const saved = read(store, SHELF_KEY);
  if (!saved) return shelf;
  for (const tool of TOOLS) {
    const kept = KEPT[tool.id];
    const chosen = saved[tool.id] as Partial<Chosen> | null | undefined;
    if (!kept || !chosen || typeof chosen !== "object") continue;
    const { kind, at } = chosen;
    if (typeof kind !== "string" || typeof at !== "number" || !(now - at < kept.for)) continue;
    if (kept.not?.includes(kind) || !tool.variants.some((v) => v.id === kind)) continue;
    shelf[tool.id] = { kind, at };
  }
  return shelf;
}

export function saveShelf(shelf: ShelfChoices, store: Storage | null = storage()) {
  write(store, SHELF_KEY, shelf);
}
