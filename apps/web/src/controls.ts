// What a pointer does in play, in one place: a mouse, a trackpad or fingers,
// told as gestures (input.ts), turned into what they mean for the fly's world
// and the camera. The game is the target: it says what is under a point and
// does what it is asked.
//
// The hand does what makes sense for what is under it and what it holds.
// Empty, held on the fly it strokes it; pressed on a piece built it takes it
// up, and a drag carries it to where it is let go; held still on the table
// it puts the fingertip down there. Holding food, the ball, a piece or the
// camera, a tap uses it where it lands. The feather and a puff are held where
// the pointer is, and the fingertip goes where a press goes and is carried by
// a drag. Anywhere else a drag turns the camera round the fly (orbit.ts), the
// same amount for the same distance every time, with whichever button; a
// mouse wheel's clicks and a pinch bring it in and take it out; a trackpad's
// two-finger scroll turns it. A double click or tap in the air takes it back
// to Follow's distance and height. Where they leave the camera it stays.
//
// With the tray open a press on it takes what it is on, and a press anywhere
// else closes it, and does nothing more.

import { sameTarget } from "@fly/ui";
import type { Hit } from "@fly/ui";
import type { Gesture } from "./input.ts";

/**
 * How the tool in hand is used on the table: the empty hand (`hand`), which
 * does what is under it; once, where a click or a tap lands (food, the ball,
 * a piece, the camera); held, where the pointer is held (the feather, the
 * air); placed, going where a press goes and carried by a drag, a tap putting
 * it down or lifting it (the fingertip); or not there at all.
 */
export type ToolUse = "hand" | "once" | "hold" | "place" | "none";

/** What is under the hand: the fly (or another), a piece built, or anything else of the world. */
export type Under = "fly" | "piece" | "world";

/** The game, as the controls see it. */
export interface PlayTarget {
  /** How the tool in hand is used. */
  tool(): ToolUse;
  /** What the HUD drew under a point (0 to 1 across and down the screen), if anything. */
  hudAt(x: number, y: number): Hit | null;
  /** Puts the hand under a point, and keeps it there (`follow`) as the camera moves; whether it is on the world rather than the air. */
  aim(x: number, y: number, follow: boolean): boolean;
  /** The pointer no longer says where the hand is: a finger lifted, the mouse left, a drag is turning the camera. */
  unaim(): void;
  /** What is under the hand where it is now. */
  under(): Under;
  /** Uses the tool in hand once, where the hand is. */
  use(): void;
  /** The empty hand takes up the piece under it; whether there was one it could. */
  grab(): boolean;
  /** The empty hand held still on the table: the fingertip comes down there. */
  offerFinger(): void;
  /** Puts what is in hand away: the hand is empty again. */
  putAway(): void;
  /** A tap on something on the HUD (or in the tray). */
  pressHud(hit: Hit): void;
  /** The tray is open; a mouse over one of its things lights it. */
  trayOpen(): boolean;
  closeTray(): void;
  hoverHud(hit: Hit | null): void;
  /** Turns the camera round the fly (radians round, and up). */
  turn(yaw: number, pitch: number): void;
  /** Brings the camera in (under 1) or takes it out, by a factor. */
  zoom(factor: number): void;
  /** The hand is on the camera, or has let go of it. */
  holdCamera(held: boolean): void;
  /** Back to Follow's distance and height, on the same side of the fly. */
  home(): void;
}

/** A drag the screen's width turns the camera this far round the fly (radians), and one its height this far up. */
export const DRAG_ROUND = 3;
export const DRAG_UP = 1.6;
/** One click of a mouse wheel brings the camera this much nearer or farther (the camera eases it in). */
export const NOTCH_ZOOM = 1.2;
/** A press on the table held this long (ms) without moving, with the hand empty, puts the fingertip down there. */
export const LONG_PRESS = 550;
/** A trackpad's pinch: how much nearer or farther per CSS pixel it reports (as a power of e). */
const PINCH_ZOOM = 0.01;
/** A trackpad's scroll: radians round, and up, per CSS pixel, in the same proportion as a drag's. */
const SCROLL_ROUND = 0.006;
const SCROLL_UP = (SCROLL_ROUND * DRAG_UP) / DRAG_ROUND;

/** What a press is doing, until it lifts. */
type Grip =
  /** Down on the HUD: a tap presses it. */
  | { kind: "hud"; hit: Hit; valid: boolean; over: boolean }
  /** Down on the table: a tap uses what is in hand; moved, it turns the camera instead; held still with the hand empty, the fingertip comes down. */
  | { kind: "press"; x: number; y: number; at: number }
  /** Holding a held tool on the table, or the empty hand on the fly. */
  | { kind: "tool" }
  /** Down on the table with a placed tool: a drag carries it, and a tap puts it down or lifts it (`tap`; not when the press itself put it down). */
  | { kind: "place"; tap: boolean }
  /** A piece the empty hand took up: a drag carries it, and where it is let go it is set down. */
  | { kind: "carry" }
  /** Turning the camera. */
  | { kind: "turn"; x: number; y: number }
  /** Nothing more until it lifts (something else took it). */
  | { kind: "spent" };

export class PlayControls {
  #grip: Grip | null = null;
  readonly #now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.#now = now;
  }

  /** The provisional HUD target; no action occurs until an eligible release. */
  get preview(): Readonly<Hit> | null {
    const grip = this.#grip;
    return grip?.kind === "hud" && grip.valid && grip.over ? grip.hit : null;
  }

  /** A held tool, or the empty hand, is being held on the table. */
  get holding() {
    return this.#grip?.kind === "tool";
  }

  /** A piece the hand took up is being carried by a drag. */
  get carrying() {
    return this.#grip?.kind === "carry";
  }

  /** The camera is being turned by a drag. */
  get turning() {
    return this.#grip?.kind === "turn";
  }

  /** Something is pressed and not yet let go. */
  get pressed() {
    return this.#grip !== null;
  }

  /** Whatever is pressed now does nothing more until it lifts (the wallpaper took over, a menu opened). */
  spend() {
    if (this.#grip) this.#grip = { kind: "spent" };
  }

  /** Lets go of everything at once, without acting. */
  reset() {
    this.#grip = null;
  }

  /** Each frame: a press on the table held still long enough with the hand empty puts the fingertip down there. */
  tick(target: PlayTarget) {
    const grip = this.#grip;
    if (grip?.kind !== "press" || target.tool() !== "hand" || this.#now() - grip.at < LONG_PRESS) return;
    target.offerFinger();
    // Already down: letting go leaves it there.
    this.#grip = { kind: "place", tap: false };
  }

  gesture(g: Gesture, target: PlayTarget, mouse: boolean) {
    const grip = this.#grip;
    if (grip?.kind === "spent") {
      if (g.type === "up" || g.type === "cancel") this.#grip = null;
      return;
    }
    switch (g.type) {
      case "hover": {
        const hit = target.hudAt(g.x, g.y);
        target.hoverHud(hit);
        if (mouse && !target.trayOpen()) target.aim(g.x, g.y, !hit);
        return;
      }
      case "leave":
        target.hoverHud(null);
        target.unaim();
        return;
      case "down": {
        const hit = target.hudAt(g.x, g.y);
        if (hit) {
          this.#grip = { kind: "hud", hit: { ...hit }, valid: true, over: true };
          return;
        }
        // Open, the tray is all there is: a press anywhere else puts it away.
        if (target.trayOpen()) {
          target.closeTray();
          this.#grip = { kind: "spent" };
          return;
        }
        // The right and middle buttons turn the camera wherever they are pressed.
        if (g.button !== 0) {
          this.#turn(g.x, g.y, target);
          return;
        }
        const onWorld = target.aim(g.x, g.y, true);
        const tool = target.tool();
        if (!onWorld) this.#turn(g.x, g.y, target);
        else if (tool === "hold") this.#grip = { kind: "tool" };
        else if (tool === "place") this.#grip = { kind: "place", tap: true };
        else if (tool === "hand") {
          const under = target.under();
          if (under === "fly") this.#grip = { kind: "tool" };
          else if (under === "piece" && target.grab()) this.#grip = { kind: "carry" };
          else this.#grip = { kind: "press", x: g.x, y: g.y, at: this.#now() };
        } else this.#grip = { kind: "press", x: g.x, y: g.y, at: this.#now() };
        return;
      }
      case "drag":
        if (!grip) return;
        if (grip.kind === "tool" || grip.kind === "place" || grip.kind === "carry") target.aim(g.x, g.y, true);
        else if (grip.kind === "press") {
          if (!g.far) return;
          // Moved past a tap: it is turning the camera, from where it went down.
          this.#turn(grip.x, grip.y, target);
          this.gesture(g, target, mouse);
        } else if (grip.kind === "turn") {
          target.turn(-(g.x - grip.x) * DRAG_ROUND, (g.y - grip.y) * DRAG_UP);
          grip.x = g.x;
          grip.y = g.y;
        } else if (grip.kind === "hud") {
          if (g.far) grip.valid = false;
          grip.over = sameTarget(grip.hit, target.hudAt(g.x, g.y));
        }
        return;
      case "up":
        this.#grip = null;
        if (!grip) return;
        if (grip.kind === "hud") {
          const hit = target.hudAt(g.x, g.y);
          if (g.tap && grip.valid && sameTarget(grip.hit, hit)) target.pressHud(grip.hit);
        } else if (grip.kind === "press") {
          if (g.tap && target.tool() === "once" && !target.hudAt(g.x, g.y) && target.aim(g.x, g.y, true)) target.use();
          if (!mouse) target.unaim();
        } else if (grip.kind === "tool") {
          if (!mouse) target.unaim();
        } else if (grip.kind === "place") {
          if (grip.tap && g.tap && !target.hudAt(g.x, g.y)) target.use();
          if (!mouse) target.unaim();
        } else if (grip.kind === "carry") {
          // Carried and let go, it goes down there; let go over the buttons at the foot, it is put away. A tap only took it up: it stays in hand.
          if (!g.tap && target.hudAt(g.x, g.y)) target.putAway();
          else if (!g.tap && target.aim(g.x, g.y, true)) target.use();
          if (!mouse) target.unaim();
        } else if (grip.kind === "turn") {
          target.holdCamera(false);
          // A double click or tap in the air: back to Follow.
          if (g.double) target.home();
          if (mouse) target.aim(g.x, g.y, !target.hudAt(g.x, g.y));
        }
        return;
      case "cancel":
        if (grip?.kind === "turn") target.holdCamera(false);
        this.#grip = null;
        target.unaim();
        return;
      case "pinch":
        // Two fingers: spread or pinched, nearer or farther; moved together, round.
        if (grip?.kind === "turn") target.holdCamera(false);
        if (grip?.kind !== "carry") this.#grip = null;
        target.zoom(1 / Math.max(0.2, g.scale));
        target.turn(-g.dx * DRAG_ROUND, g.dy * DRAG_UP);
        return;
      case "pinchEnd":
        return;
      case "wheel":
        if (target.hudAt(g.x, g.y) || target.trayOpen()) return;
        if (g.zoom) target.zoom(Math.exp(g.dy * PINCH_ZOOM));
        else if (g.notch) target.zoom(Math.pow(NOTCH_ZOOM, Math.sign(g.dy)));
        // The page's content follows the fingers, so the camera turns as a drag the same way would.
        else target.turn(g.dx * SCROLL_ROUND, -g.dy * SCROLL_UP);
        return;
    }
  }

  #turn(x: number, y: number, target: PlayTarget) {
    this.#grip = { kind: "turn", x, y };
    target.unaim();
    target.holdCamera(true);
  }
}
