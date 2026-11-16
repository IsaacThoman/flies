// What every screen is, and what it can ask of the game.

import type { RemoteButton } from "@fly/contracts";
import type { BrainDriver } from "@fly/contracts";
import type { BrainMeter } from "../../brain/meter.ts";
import type { Life } from "../../life.ts";
import type { Settings } from "../../settings.ts";
import type { Sound } from "../../audio/sounds.ts";

/** The settings' pages, each opened from the top of the settings. */
export type SettingsPage = "wallpaper" | "sound" | "picture";
export type ScreenId = "title" | "play" | "pause" | "settings" | SettingsPage | "about" | "brain";

/** The game, as the screens see it. */
export interface Shell {
  readonly settings: Settings;
  readonly brain: BrainDriver;
  readonly meter: BrainMeter;
  readonly life: Life;
  /** Opens a screen over the current one. */
  open(screen: ScreenId): void;
  /** Back one screen (leaving the app at the root). */
  back(): void;
  /** Starts playing (from the title), or carries on (from the pause menu). */
  play(): void;
  /** Goes straight to the wallpaper. */
  watch(): void;
  /** Back to the title. */
  title(): void;
  /** The settings changed: apply and save them. */
  applySettings(): void;
  sound(sound: Sound): void;
}

export interface Screen {
  readonly id: ScreenId;
  /** The fly's life stops while this screen is open. */
  readonly pauses: boolean;
  /** Called when the screen comes to the top. */
  enter(): void;
  press(button: RemoteButton, repeat: boolean): void;
  /** Animates; returns true when it needs redrawing. */
  update(dt: number): boolean;
  draw(g: CanvasRenderingContext2D, t: number): void;
}
