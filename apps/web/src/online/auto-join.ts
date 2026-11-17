// Being with others by default: once the brain is awake, the game sits this
// device in a room open to everyone (docs/online.md, "Everyone"), unless the
// player has turned that off, opened a room's link, or is offline. It is
// quiet about it. A room server that can't be reached, or one that turns the
// device away, leaves the fly playing alone as if nothing had been tried, and
// it tries again later, less often each time. Once the player leaves a room
// or chooses one themselves, it stops until the next launch.

import { EVERYONE, everyoneIndex } from "@fly/net";
import type { Ended } from "./online.ts";

/** Seconds a try has to be welcomed before it is given up, quietly. */
export const ATTEMPT = 10;
/** Seconds before trying again after a try came to nothing: longer each time, up to the last. */
export const RETRY = [30, 60, 120, 300];

/** What the game tells it each frame. */
export type AutoJoinNow = {
  /** The player's setting (Settings → Screensaver → Join others). */
  enabled: boolean;
  /** The brain has woken and the menu is up. */
  awake: boolean;
  /** The device thinks it has a network (a browser that can't tell says it has). */
  network: boolean;
  /** This device is at a room, or trying one, of any kind. */
  atRoom: boolean;
};

/** What the game is to do: sit at a room open to everyone now, or give up the try under way, quietly. */
export type AutoJoinAction = "join" | "abandon" | null;

export class AutoJoin {
  /** The room open to everyone to ask for: where this device last was (its fly may still be there), else the first. */
  readonly code: string;
  /** For good, this launch: the player left a room or chose one, or another window of this device took its seat. */
  stopped = false;
  #time = 0;
  #retryAt = 0;
  #tries = 0;
  /** A try under way, and when it began. */
  #trying = false;
  #triedAt = 0;

  /** `last`: the room this device was at when it last closed, if any. */
  constructor(last: string | null) {
    this.code = last !== null && everyoneIndex(last) >= 0 ? last : EVERYONE;
  }

  /** A try is under way and not yet welcomed. */
  get trying() {
    return this.#trying;
  }

  /** Once a frame. `welcomed` and `reconnected`: how the try under way is going (the room has let it in; its line has had to open again). */
  update(dt: number, now: AutoJoinNow, welcomed: boolean, reconnected: boolean): AutoJoinAction {
    this.#time += dt;
    if (this.#trying) {
      if (welcomed) {
        this.#trying = false;
        this.#tries = 0;
        return null;
      }
      // Not there in time, or its line has already failed once: alone again, and later another try.
      if (!now.enabled || reconnected || this.#time - this.#triedAt > ATTEMPT) {
        this.#trying = false;
        this.#later();
        return "abandon";
      }
      return null;
    }
    if (this.stopped || !now.enabled || !now.awake || !now.network || now.atRoom || this.#time < this.#retryAt) return null;
    this.#trying = true;
    this.#triedAt = this.#time;
    return "join";
  }

  /** For good, this launch: the player chose otherwise. A try under way is the player's to end (they have left it, or gone elsewhere). */
  stop() {
    this.stopped = true;
    this.#trying = false;
  }

  /** The room ended this device's place there (after letting it in, or not): try again later, unless trying again can't help. */
  ended(why: Ended) {
    this.#trying = false;
    // Left: the player's doing. Elsewhere: another window of this device sits there now, and two would take the seat from each other forever.
    // Unknown: a room server without rooms open to everyone. Version: a room server this build can't speak to, nor will it later.
    // Removed: nobody can be, but if it happened it would be meant.
    if (why === "left" || why === "elsewhere" || why === "unknown" || why === "version" || why === "removed") this.stopped = true;
    else this.#later();
  }

  /** Something may have changed for the better (the network is back, the page is shown again): the next try is due now. */
  hurry() {
    if (!this.#trying) this.#retryAt = Math.min(this.#retryAt, this.#time);
  }

  /** The player turned it on again: whatever stopped it before, it may try now. */
  resume() {
    this.stopped = false;
    this.hurry();
  }

  #later() {
    this.#retryAt = this.#time + RETRY[Math.min(this.#tries, RETRY.length - 1)];
    this.#tries++;
  }
}
