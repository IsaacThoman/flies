// The pictures that sit in a corner over the world: what the fly sees, and its
// nervous system at work. They share one corner and move on together; the
// first is at the corner itself (eyes/inset.ts lays it out), the second next
// to it (nerves/panel.ts), so they never overlap.
//
// A picture left in one place for hours can burn into an OLED screen, so in
// the wallpaper they move to another corner each time the camera moves on to a
// new shot, and at least every CORNER_HOLD seconds (the wallpaper that follows
// the fly never changes shot). Each fades out where it is before it moves, and
// back in where it goes. Playing, they keep to the first corner: the hints
// take the others.

export type Corner = "top-right" | "bottom-left" | "top-left" | "bottom-right";
/** The corners in the order they are visited, across the screen each time. */
export const CORNERS: readonly Corner[] = ["top-right", "bottom-left", "top-left", "bottom-right"];
/** The longest the pictures stay in one corner of the wallpaper, seconds. */
export const CORNER_HOLD = 60;
/** Seconds to fade in, and out (out sooner: the controls are coming back, or it is moving on). */
const FADE_IN = 1;
const FADE_OUT = 0.5;

/** "show"; "fade": not wanted now, though nothing covers it; "hide": gone at once. */
export type CornerWanted = "show" | "fade" | "hide";

/** The corner the pictures are in or going to. */
export class CornerDeck {
  goal: Corner = CORNERS[0];
  #index = 0;
  #shotChanges = -1;
  /** Seconds shown in this corner of the wallpaper. */
  #held = 0;

  /** Once a frame, before the pictures: `showing` if any of them is wanted on screen. */
  update(dt: number, showing: boolean, wallpaper: boolean, shotChanges: number) {
    if (!wallpaper) {
      this.#index = 0;
      this.#held = 0;
    } else if (showing && this.#shotChanges >= 0 && (shotChanges !== this.#shotChanges || this.#held > CORNER_HOLD)) {
      this.#index = (this.#index + 1) % CORNERS.length;
      this.#held = 0;
    }
    this.#shotChanges = shotChanges;
    this.goal = CORNERS[this.#index];
    if (showing && wallpaper) this.#held += dt;
  }
}

/**
 * What a picture may do when it wants to show at `slot` of the corner the
 * deck is going to: wait (fade) while the other still shows anywhere but
 * beside it there, still fading out of the corner they are leaving or of the
 * place this one wants. So the two arrive together and never overlap, even as
 * one comes in and the other goes (on a short screen a stack at a top corner
 * reaches down past a picture at the bottom corner under it).
 */
export function waitFor(wanted: CornerWanted, deck: CornerDeck, slot: number, other: CornerPlacement): CornerWanted {
  return wanted === "show" && other.alpha > 0 && (other.corner !== deck.goal || other.slot === slot) ? "fade" : wanted;
}

/** One picture's place and how much of it shows. */
export class CornerPlacement {
  corner: Corner = CORNERS[0];
  /** 0 at the corner itself, 1 next to the picture there. */
  slot = 0;
  /** 0 to 1. */
  alpha = 0;

  update(dt: number, wanted: CornerWanted, goal: Corner, slot: number) {
    if (wanted === "hide") {
      this.alpha = 0;
      this.corner = goal;
      this.slot = slot;
      return;
    }
    if (wanted === "show" && this.corner === goal && this.slot === slot) this.alpha = Math.min(1, this.alpha + dt / FADE_IN);
    else this.alpha = Math.max(0, this.alpha - dt / FADE_OUT);
    if (this.alpha === 0) {
      this.corner = goal;
      this.slot = slot;
    }
  }
}
