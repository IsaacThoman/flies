// What a pointer does in play, in one place: a mouse, a trackpad or fingers,
// told as gestures (input.ts), turned into what they mean for the fly's world
// and the camera. The game is the target: it says what is under a point and
// does what it is asked.
//
// The conventions are a map's and a 3D viewer's, and the camera is a plain
// orbit round the fly (orbit.ts). A drag turns it round the fly and up or
// down, wherever it starts, with whichever button, by the same amount for the
// same distance dragged every time, unless the tool in hand is one that is
// held on the fly (the feather, the air), which a left-button drag over the
// table carries. The wheel, a trackpad's two-finger scroll up and down and a
// pinch bring it in and take it out, and nothing else; a trackpad's scroll
// across turns it. A click or a tap uses the tool where it lands; a double
// click or tap in the air takes the camera back to Follow's distance and
// height, still on the same side of the fly. Where they leave the camera it
// stays: nothing else moves it.

import type { Hit } from "@fly/ui";
import type { Gesture } from "./input.ts";
import { HUD_HITS } from "./ui/hud.ts";

/** How the tool in hand is used on the table: once, where a click or a tap lands (food, the ball); held, where the pointer is held (the feather, the air); or not there at all. */
export type ToolUse = "once" | "hold" | "none";

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
  /** Uses the tool in hand once, where the hand is. */
  use(): void;
  /** A tap on something on the HUD, or a swipe along its label (a step of the kind). */
  pressHud(hit: Hit): void;
  stepKind(dir: -1 | 1): void;
  /** Steps the tool on the shelf (the wheel over it). */
  stepTool(dir: -1 | 1): void;
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
/** A trackpad's scroll and pinch: how much nearer or farther per CSS pixel scrolled (as a power of e). */
const SCROLL_ZOOM = 0.004;
const PINCH_ZOOM = 0.01;
/** A trackpad's scroll across: radians round per CSS pixel. */
const SCROLL_ROUND = 0.006;
/** A swipe along the tool's label this far (design units) steps its kind; and the shelf's wheel steps a tool for this much trackpad scroll. */
export const LABEL_SWIPE = 36;
const SHELF_SCROLL = 140;
/** A scroll over the shelf left alone this long (ms) starts again from nothing. */
const SHELF_IDLE = 300;

/** What a press is doing, until it lifts. */
type Grip =
  /** Down on the HUD: a tap presses it; along the label, a swipe steps the kind. */
  | { kind: "hud"; hit: Hit; x: number; swiped: number }
  /** Down on the table with a tool used once: a tap uses it; moved, it turns the camera instead. */
  | { kind: "press"; x: number; y: number }
  /** Holding a held tool on the table. */
  | { kind: "tool" }
  /** Turning the camera. */
  | { kind: "turn"; x: number; y: number }
  /** Nothing more until it lifts (something else took it). */
  | { kind: "spent" };

export class PlayControls {
  #grip: Grip | null = null;
  /** The shelf names a tool under the pointer without selecting it. */
  previewTool = -1;
  #shelf = { scrolled: 0, at: -Infinity };
  readonly #design: () => { width: number; height: number };
  readonly #now: () => number;

  constructor(design: () => { width: number; height: number }, now: () => number = () => performance.now()) {
    this.#design = design;
    this.#now = now;
  }

  /** A held tool is being held on the table. */
  get holding() {
    return this.#grip?.kind === "tool";
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
    this.previewTool = -1;
    if (this.#grip) this.#grip = { kind: "spent" };
  }

  /** Lets go of everything at once, without acting. */
  reset() {
    this.previewTool = -1;
    this.#grip = null;
  }

  gesture(g: Gesture, target: PlayTarget, mouse: boolean) {
    const grip = this.#grip;
    if (grip?.kind === "spent") {
      if (g.type === "up" || g.type === "cancel") this.#grip = null;
      return;
    }
    const design = this.#design();
    switch (g.type) {
      case "hover": {
        const hit = target.hudAt(g.x, g.y);
        this.previewTool = hit?.kind === HUD_HITS.tool ? hit.index : -1;
        if (mouse) target.aim(g.x, g.y, !hit);
        return;
      }
      case "leave":
        this.previewTool = -1;
        target.unaim();
        return;
      case "down": {
        const hit = target.hudAt(g.x, g.y);
        this.previewTool = hit?.kind === HUD_HITS.tool ? hit.index : -1;
        if (hit) {
          this.#grip = { kind: "hud", hit: { ...hit }, x: g.x * design.width, swiped: 0 };
          return;
        }
        // The right and middle buttons turn the camera wherever they are pressed.
        if (g.button !== 0) {
          this.#turn(g.x, g.y, target);
          return;
        }
        const onWorld = target.aim(g.x, g.y, true);
        if (onWorld && target.tool() === "hold") this.#grip = { kind: "tool" };
        else if (onWorld) this.#grip = { kind: "press", x: g.x, y: g.y };
        else this.#turn(g.x, g.y, target);
        return;
      }
      case "drag":
        if (!grip) return;
        if (grip.kind === "tool") target.aim(g.x, g.y, true);
        else if (grip.kind === "press") {
          if (!g.far) return;
          // Moved past a tap: it is turning the camera, from where it went down.
          this.#turn(grip.x, grip.y, target);
          this.gesture(g, target, mouse);
        } else if (grip.kind === "turn") {
          target.turn(-(g.x - grip.x) * DRAG_ROUND, (g.y - grip.y) * DRAG_UP);
          grip.x = g.x;
          grip.y = g.y;
        } else if (grip.kind === "hud" && (grip.hit.kind === HUD_HITS.kind || grip.hit.kind === HUD_HITS.label)) {
          // Swiped along the label: the kinds go by as a carousel's would, the next coming from the right.
          const steps = Math.trunc((g.x * design.width - grip.x) / LABEL_SWIPE) - grip.swiped;
          grip.swiped += steps;
          for (let i = 0; i < Math.abs(steps); i++) target.stepKind(steps < 0 ? 1 : -1);
        }
        return;
      case "up":
        this.previewTool = -1;
        this.#grip = null;
        if (!grip) return;
        if (grip.kind === "hud") {
          if (g.tap && grip.swiped === 0) target.pressHud(grip.hit);
        } else if (grip.kind === "press") {
          if (target.tool() === "once") target.use();
          if (!mouse) target.unaim();
        } else if (grip.kind === "tool") {
          if (!mouse) target.unaim();
        } else if (grip.kind === "turn") {
          target.holdCamera(false);
          // A double click or tap in the air: back to Follow.
          if (g.double) target.home();
          if (mouse) target.aim(g.x, g.y, !target.hudAt(g.x, g.y));
        }
        return;
      case "cancel":
        this.previewTool = -1;
        if (grip?.kind === "turn") target.holdCamera(false);
        this.#grip = null;
        target.unaim();
        return;
      case "pinch":
        this.previewTool = -1;
        // Two fingers: spread or pinched, nearer or farther; moved together, round.
        if (grip?.kind === "turn") target.holdCamera(false);
        this.#grip = null;
        target.zoom(1 / Math.max(0.2, g.scale));
        target.turn(-g.dx * DRAG_ROUND, g.dy * DRAG_UP);
        return;
      case "pinchEnd":
        return;
      case "wheel":
        this.#wheel(g, target);
        return;
    }
  }

  #turn(x: number, y: number, target: PlayTarget) {
    this.#grip = { kind: "turn", x, y };
    target.unaim();
    target.holdCamera(true);
  }

  /** The wheel, or a trackpad's two fingers: over the shelf, the tools; over the label, the kinds; else the camera, nearer or farther (and, scrolled across, round). */
  #wheel(g: Extract<Gesture, { type: "wheel" }>, target: PlayTarget) {
    const hit = target.hudAt(g.x, g.y);
    if (hit) {
      // A step for each click of a mouse wheel, or each so much a trackpad scrolls (with its momentum, dozens of small events); a pinch or a sideways scroll over them, nothing.
      if (g.zoom || g.dy === 0) return;
      const shelf = this.#shelf;
      const now = this.#now();
      if (now - shelf.at > SHELF_IDLE) shelf.scrolled = 0;
      shelf.at = now;
      shelf.scrolled += g.notch ? Math.sign(g.dy) * SHELF_SCROLL : g.dy;
      if (Math.abs(shelf.scrolled) < SHELF_SCROLL) return;
      const dir = shelf.scrolled > 0 ? 1 : -1;
      shelf.scrolled = 0;
      if (hit.kind === HUD_HITS.tool) target.stepTool(dir);
      else if (hit.kind === HUD_HITS.kind || hit.kind === HUD_HITS.label) target.stepKind(dir);
      return;
    }
    if (g.zoom) target.zoom(Math.exp(g.dy * PINCH_ZOOM));
    else if (g.notch) target.zoom(Math.pow(NOTCH_ZOOM, Math.sign(g.dy)));
    else {
      if (g.dy !== 0) target.zoom(Math.exp(g.dy * SCROLL_ZOOM));
      if (g.dx !== 0) target.turn(g.dx * SCROLL_ROUND, 0);
    }
  }
}
