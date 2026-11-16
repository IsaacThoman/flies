// The pictures that sit in a corner over the world: what the fly sees, its
// nervous system at work, and its stats. They share one corner and move on
// together: the first is at the corner itself (eyes/inset.ts lays it out),
// the second next to it (nerves/panel.ts), and the stats across the screen
// from them at the same edge (stats/panel.ts), so none covers another. Each
// is laid out at every corner for every screen, so any other picture (who is
// at an online table, say) can join them as one more of these.
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

/** The corner across the screen from another, at the same edge. */
export const across = (corner: Corner): Corner =>
  corner === "top-right" ? "top-left" : corner === "top-left" ? "top-right" : corner === "bottom-left" ? "bottom-right" : "bottom-left";

/** Design units. */
export type CornerRect = { x: number; y: number; width: number; height: number };
const overlaps = (a: CornerRect, b: CornerRect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** One of the pictures: its placement, and where it is with the deck at `corner`, at `slot` there. */
export type CornerPicture = { readonly placement: CornerPlacement; at(corner: Corner, slot: number): CornerRect };

/**
 * What `picture` may do when it wants to show at `slot` of the corner the
 * deck is going to: wait (fade) while any other still shows anywhere but
 * clear of it there, still fading out of the corner they are leaving or of
 * the place this one wants. So they arrive together and never overlap, even
 * as one comes in and another goes (on a short screen a stack at a top corner
 * reaches down past a picture at the bottom corner under it).
 */
export function waitFor(wanted: CornerWanted, deck: CornerDeck, slot: number, picture: CornerPicture, all: readonly CornerPicture[]): CornerWanted {
  if (wanted !== "show") return wanted;
  const mine = picture.at(deck.goal, slot);
  for (let i = 0; i < all.length; i++) {
    const other = all[i];
    const p = other.placement;
    if (other === picture || p.alpha <= 0) continue;
    if (p.corner !== deck.goal || overlaps(other.at(p.corner, p.slot), mine)) return "fade";
  }
  return wanted;
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
