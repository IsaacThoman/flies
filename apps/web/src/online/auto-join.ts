// Being with others by default: once the brain is awake, the game sits this
// device in a room open to everyone (docs/online.md, "Everyone"): the one for
// the place it lives in, or Everyone's, which take turns, if it lives in each
// in turn. Unless the player has disconnected, is at a room of their own, or
// is offline. It is quiet about it. A room server that can't be reached, or
// one that turns the device away, leaves the fly playing alone as if nothing
// had been tried, and it tries again later, less often each time. Choosing
// another place moves it to that place's room.

import { everyoneSeries, seriesCode } from "@fly/net";
import type { Ended } from "./online.ts";

/** Seconds a try has to be welcomed before it is given up, quietly. */
export const ATTEMPT = 10;
/** Seconds before trying again after a try came to nothing: longer each time, up to the last. */
export const RETRY = [30, 60, 120, 300];

/** What the game tells it each frame. */
export type AutoJoinNow = {
  /** The player is online (the Online menu's Disconnect turns it off). */
  enabled: boolean;
  /** The brain has woken and the menu is up. */
  awake: boolean;
  /** The device thinks it has a network (a browser that can't tell says it has). */
  network: boolean;
  /** This device is at a room, or trying one, of any kind, or at a locked one's door. */
  atRoom: boolean;
  /** The series of rooms open to everyone it belongs in: the place it lives in's, or Everyone's (`seriesFor`). */
  series: number;
  /** The series of the room open to everyone it has been let into, if it is in one by default; -1 otherwise. */
  atSeries: number;
};

/** What the game is to do: sit at a room open to everyone now, go from the one it is in to the one it belongs in, or give up the try under way, quietly. */
export type AutoJoinAction = "join" | "switch" | "abandon" | null;

export class AutoJoin {
  /** For good, this launch: opened `?alone`, another window of this device took its seat, or no room server it can sit with. */
  stopped = false;
  /** The room open to everyone this device was last in (its flies may still be there). */
  #last: string | null;
  #series = 0;
  #time = 0;
  #retryAt = 0;
  #tries = 0;
  /** A try under way, and when it began. */
  #trying = false;
  #triedAt = 0;

  /** `last`: the room this device was at when it last closed, if any. */
  constructor(last: string | null) {
    this.#last = last !== null && everyoneSeries(last) >= 0 ? last : null;
  }

  /** The room open to everyone to ask for: the one this device was last in, if it is of the series it belongs in, otherwise that series' first. */
  get code(): string {
    const last = this.#last;
    return last !== null && everyoneSeries(last) === this.#series ? last : seriesCode(this.#series);
  }

  /** A try is under way and not yet welcomed. */
  get trying() {
    return this.#trying;
  }

  /** Let into this room open to everyone: where to come back to. */
  at(code: string) {
    if (everyoneSeries(code) >= 0) this.#last = code;
  }

  /** Once a frame. `welcomed` and `reconnected`: how the try under way is going (the room has let it in; its line has had to open again). */
  update(dt: number, now: AutoJoinNow, welcomed: boolean, reconnected: boolean): AutoJoinAction {
    this.#time += dt;
    this.#series = now.series;
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
    // In another place's room than the one it belongs in now: to that one, at once.
    if (now.enabled && now.atSeries >= 0 && now.atSeries !== now.series) {
      this.begin();
      return "switch";
    }
    if (this.stopped || !now.enabled || !now.awake || !now.network || now.atRoom || this.#time < this.#retryAt) return null;
    this.begin();
    return "join";
  }

  /** A try under way now, given ATTEMPT to be welcomed: one this asked for, or a room open to everyone the player chose. */
  begin() {
    this.#trying = true;
    this.#triedAt = this.#time;
  }

  /** For good, this launch: opened `?alone`. */
  stop() {
    this.stopped = true;
    this.#trying = false;
  }

  /** The room ended this device's place there (after letting it in, or not): try again later, unless trying again can't help. */
  ended(why: Ended) {
    this.#trying = false;
    // Elsewhere: another window of this device sits there now, and two would take the seat from each other forever.
    // Unknown: a room server without rooms open to everyone. Version: a room server this build can't speak to, nor will it later.
    // Removed: nobody can be, but if it happened it would be meant.
    if (why === "elsewhere" || why === "unknown" || why === "version" || why === "removed") this.stopped = true;
    else this.#later();
  }

  /** Something may have changed for the better (the network is back, the page is shown again, the player has left a room of their own): the next try is due now. */
  hurry() {
    if (!this.#trying) this.#retryAt = Math.min(this.#retryAt, this.#time);
  }

  /** The player went online again: whatever stopped it before, it may try now. */
  resume() {
    this.stopped = false;
    this.hurry();
  }

  #later() {
    this.#retryAt = this.#time + RETRY[Math.min(this.#tries, RETRY.length - 1)];
    this.#tries++;
  }
}
