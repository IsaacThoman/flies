import type { LobbyStatus } from "../../online/lobby.ts";
// What every screen is, and what it can ask of the game.

import type { RemoteButton, TextEntry } from "@fly/contracts";
import type { BrainDriver, WeatherAttribution } from "@fly/contracts";
import type { RoomWire } from "@fly/net";
import type { GlyphSet, Hit, HitMap } from "@fly/ui";
import type { BrainMeter } from "../../brain/meter.ts";
import type { Frame } from "../../display.ts";
import type { Life } from "../../life.ts";
import type { Ended } from "../../online/online.ts";
import type { PlaceId } from "../../places/catalog.ts";
import type { Settings } from "../../settings.ts";

/** The settings' tabs. */
export type SettingsPage = "wallpaper" | "screen" | "picture";
/** The menu (the title, at launch and from play alike), play, and what the menu opens. */
export type ScreenId = "title" | "play" | "settings" | "about" | "online";

/** The room this device is at, as the screens show it: what it is called (once it has said), its code and link, whether this player started it, whether it is a room open to everyone, and the others there. */
export type TableNow = {
  readonly name: string | null;
  readonly code: string;
  readonly link: string;
  readonly starting: boolean;
  readonly joined: boolean;
  readonly everyone: boolean;
  /** The other devices at the table, each by its player's id, with its flies' colours. */
  readonly others: readonly { readonly id: number; readonly colours: readonly string[] }[];
};

/**
 * A locked room's door: the room chosen from the list, or one this device
 * was turned away from for want of its password. Its code and name, whether
 * a password was given and was wrong, and a count that moves on each time the
 * door is come to again.
 */
export type Knock = { readonly code: string; readonly name: string; readonly wrong: boolean; readonly seq: number };

/** A new room, as the player makes it. */
export type NewRoom = { name: string; listed: boolean; password: string; place: PlaceId };

/** The game, as the screens see it. */
export interface Shell {
  /** Optional host semantics; called only when menu state changes. */
  menuChanged?(): void;
  readonly settings: Settings;
  readonly brain: BrainDriver;
  readonly meter: BrainMeter;
  readonly life: Life;
  /** The Apple TV can tell the game the weather outside (it is built with WeatherKit). */
  readonly weatherOutside: boolean;
  /** How many flies this device can live, each with a brain of its own (1 where it can run only one). */
  readonly maxFlies: number;
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
  /** Playing with others online: whether this device can at all, and the room it is at (null alone). */
  readonly canPlayOnline: boolean;
  readonly table: TableNow | null;
  /** How the last room this device was at, or tried to sit at, ended: it left, or was turned away (full, gone, removed, too many tries). */
  readonly tableEnded: Ended | null;
  /** A locked room's door, waiting for its password, or null; `door` comes to one (from the list), or goes away from it. */
  readonly knock: Knock | null;
  door(room: { code: string; name: string } | null): void;
  /** Where the fly is now. */
  readonly here: PlaceId;
  /** The rooms anyone may join, while Online is showing them: null until the room server has said. */
  readonly lobbyStatus?: LobbyStatus;
  readonly rooms: readonly RoomWire[] | null;
  /** Typing into a field the game draws, or null where there is no way to type. */
  readonly typing: TextEntry | null;
  /** Whether a link can be handed on here: a share sheet or a clipboard (the Apple TV has neither, and shows the room's QR code for a phone instead). */
  readonly canShare: boolean;
  /** Makes a room and sits at it; sits at one by its code (with its password, if it is locked); hands its link on (from a press: the share sheet or the clipboard); takes another's fly off it (the starter); leaves it. */
  startRoom(room: NewRoom): void;
  joinRoom(code: string, password?: string): void;
  shareTable(): Promise<"shared" | "copied" | "failed">;
  removeFly(id: number): void;
  leaveTable(): void;
  /** Whether the player is online: sat with everyone in the place it lives by default (when it can be), or at a room. */
  readonly isOnline: boolean;
  /** Alone, and not sat with anyone by default until `goOnline`, this launch or a later one. */
  disconnect(): void;
  goOnline(): void;
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
  /** A tap is lifting off the row of the item at `index`, now, during the browser's own event: a field there starts being typed into, so a phone's keyboard comes up (it comes only for a field focused during the tap itself). */
  typeNow?(index: number, id: string): void;
}

/** What the screens' own targets are, as recorded in the hit map. */
export const SCREEN_HITS = { back: "back", panel: "panel" } as const;
