// What every screen is, and what it can ask of the game.

import type { RemoteButton } from "@fly/contracts";
import type { BrainDriver, WeatherAttribution } from "@fly/contracts";
import type { GlyphSet, Hit, HitMap } from "@fly/ui";
import type { BrainMeter } from "../../brain/meter.ts";
import type { Frame } from "../../display.ts";
import type { Life } from "../../life.ts";
import type { Settings } from "../../settings.ts";
import type { Sound } from "../../audio/sounds.ts";

/** The settings' tabs. */
export type SettingsPage = "wallpaper" | "sound" | "picture";
/** The menu (the title, at launch and from play alike), play, and what the menu opens. */
export type ScreenId = "title" | "play" | "settings" | "about" | "brain";

/** The game, as the screens see it. */
export interface Shell {
  readonly settings: Settings;
  readonly brain: BrainDriver;
  readonly meter: BrainMeter;
  readonly life: Life;
  /** The Apple TV can tell the game the weather outside (it is built with WeatherKit). */
  readonly weatherOutside: boolean;
  /** Apple Weather's attribution, for About, once the host has it. */
  weatherAttribution(): WeatherAttribution | null;
  /** The screen's shape. */
  readonly shape: Frame;
  /** Whose buttons the hints show, or null when the player is pointing at the screen (no hints; things to press instead). */
  readonly glyphs: GlyphSet | null;
  /** Opens a screen over the current one. */
  open(screen: ScreenId): void;
  /** Back one screen (leaving the app at the root). */
  back(): void;
  /** Starts playing, or carries on. */
  play(): void;
  /** Goes straight to the wallpaper. */
  watch(): void;
  /** The settings changed: apply and save them. */
  applySettings(): void;
  sound(sound: Sound): void;
}

/**
 * A pointer on a screen, in design units. `hit` is the target under it (or,
 * for a drag and the lift that ends it, the one it went down on), from what
 * the screen last drew.
 */
export type Point = {
  type: "hover" | "down" | "drag" | "up" | "cancel" | "wheel";
  x: number;
  y: number;
  /** "up": it barely moved, a tap. */
  tap: boolean;
  /** "drag" and "up": how far it has come since it went down. "wheel": how far it scrolled, down positive. */
  dx: number;
  dy: number;
  hit: Hit | null;
};

export interface Screen {
  readonly id: ScreenId;
  /** Called when the screen comes to the top. */
  enter(): void;
  /** The screen changed shape: lay out again. */
  layout(frame: Frame): void;
  press(button: RemoteButton, repeat: boolean): void;
  point(p: Point): void;
  /** Animates; returns true when it needs redrawing. */
  update(dt: number): boolean;
  /** Draws, recording what can be pointed at in `hits`. */
  draw(g: CanvasRenderingContext2D, t: number, hits: HitMap): void;
}

/** What the screens' own targets are, as recorded in the hit map. */
export const SCREEN_HITS = { back: "back", panel: "panel" } as const;
