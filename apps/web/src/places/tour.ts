// Going round the places in the screensaver (Settings → Screensaver →
// Places: Each in turn): after so long watched in one place, the fly is
// carried to the next, the whole place built behind the veil. Only while it
// is watched and at home: in play it stays in the place it lives (and is
// carried back there when play begins), and on a visit or at a table the
// room has the place.

import { nextPlace } from "./catalog.ts";
import type { PlaceId } from "./catalog.ts";

/** Seconds watched in one place before the fly is carried on. */
export const PLACE_TURN = 20 * 60;

export class Tour {
  /** Seconds watched where it is now, at home. */
  stayed = 0;
  /** Seconds in each place before the next (scripts make it shorter). */
  turn = PLACE_TURN;

  /** It has been set down somewhere: its time there starts again. */
  arrived() {
    this.stayed = 0;
  }

  /**
   * `dt` seconds on, in `here`: where to carry it now, if anywhere.
   * `watching`: the screensaver is up; `home`: alone, not on a visit or at a
   * table; `turns`: the player chose to go round the places.
   */
  next(dt: number, here: PlaceId, watching: boolean, home: boolean, turns: boolean): PlaceId | null {
    if (!watching || !home) return null;
    this.stayed += dt;
    if (!turns || this.stayed <= this.turn) return null;
    const next = nextPlace(here);
    return next === here ? null : next;
  }
}
