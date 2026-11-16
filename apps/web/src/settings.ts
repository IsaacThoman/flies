// The player's settings, kept in localStorage.

import type { WallpaperStyle } from "./camera.ts";
import type { PixelSize } from "./display.ts";
import type { PlaceId } from "./places/catalog.ts";

export type EyesDetail = "off" | "low" | "high";
/** When the small picture of what its eyes see shows in a corner. */
export type EyesInsetMode = "off" | "wallpaper" | "always";

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
  /** What its eyes see, small in a corner: never, in the wallpaper, or while playing too. */
  eyesInset: EyesInsetMode;
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

const KEY = "apple-tv-fly.settings";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Reads the saved settings, keeping only values of the right kind. */
export function loadSettings(store: Storage | null = storage()): Settings {
  const settings = { ...DEFAULT_SETTINGS };
  try {
    const saved = JSON.parse(store?.getItem(KEY) ?? "null") as Partial<Record<keyof Settings, unknown>> | null;
    if (saved && typeof saved === "object") {
      for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
        if (typeof saved[key] === typeof DEFAULT_SETTINGS[key]) (settings as Record<string, unknown>)[key] = saved[key];
      }
    }
  } catch {
    // Unreadable: the defaults.
  }
  return settings;
}

export function saveSettings(settings: Settings, store: Storage | null = storage()) {
  try {
    store?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Full or blocked: they last until the app closes.
  }
}
