// The fly's journal, kept as its life goes on: its firsts, each with a
// picture taken as it happens, and the player's own photos (the Photo tool).
//
// A first's picture is taken from a frame that shows the fly well, as the
// camera already films it (the player's camera in play, the cameraman's in the
// screensaver and behind the menu), within a few seconds of it, so it never
// interrupts play or moves the camera; with no such frame in time it is kept
// without one. The player's photo is the next frame, framed as they framed it.

import type { Picture } from "./capture.ts";
import { Photographer, pictureSize } from "./capture.ts";
import { Moments } from "./moments.ts";
import type { Lived, Moment } from "./moments.ts";
import { Journal, SMALL } from "./store.ts";
import type { Keeping, Shelf } from "./store.ts";

/** Seconds after a first within which its picture is taken, if a frame shows the fly well. */
export const MOMENT_WAIT = 10;
/** Arriving somewhere, the picture waits this long (s) for the place to be seen, and the camera to settle. */
export const ARRIVAL_DELAY = 3;
export const ARRIVAL_WAIT = 60;
/** The player's photos waiting for a frame, at most. */
const OWN_QUEUE = 2;

type Pending = { moment: Moment; at: number; place: string; due: number; until: number };

/** What `wants` says of this frame: take the player's photo, a first's, or nothing. */
export type Shot = "own" | "moment" | null;

export class Photos {
  journal: Journal | null = null;
  keeping: Keeping = SMALL;
  #moments: Moments | null = null;
  #photographer: Photographer | null = null;
  readonly #found: Moment[] = [];
  readonly #pending: Pending[] = [];
  /** Arrivals before the journal was open, to be had once it is. */
  readonly #arrivals: { place: string; name: string; time: number }[] = [];
  #own = 0;
  #shooting: Shot = null;
  /** Seconds since the player's last photo was taken, for the flash. */
  sinceShutter = Infinity;
  /** The player's photos taken, and firsts kept, since launch. */
  taken = 0;
  kept = 0;

  /** Opens the journal kept on `shelf` for `fly`. */
  constructor(where: Promise<{ shelf: Shelf; keeping: Keeping }>, fly: string) {
    void where
      .then(async ({ shelf, keeping }) => {
        this.keeping = keeping;
        this.journal = await Journal.open(shelf, fly, keeping.budget);
        this.#moments = new Moments(this.journal.entries.map((e) => e.key).filter((k) => k));
        this.#photographer = new Photographer(keeping.quality);
        for (const a of this.#arrivals.splice(0)) this.arrived(a.place, a.name, a.time);
      })
      .catch((error: unknown) => console.warn("The journal couldn't be opened", error));
  }

  /** Once a frame, after the followed fly's life has stepped `dt` (game time `time`, in `place`): its firsts, if it has any. */
  watch(life: Lived, dt: number, time: number, place: string) {
    const moments = this.#moments;
    if (!moments) return;
    const found = this.#found;
    moments.watch(life, dt, found);
    if (!found.length) return;
    for (const moment of found) this.#pending.push({ moment, at: Date.now(), place, due: time, until: time + MOMENT_WAIT });
    found.length = 0;
  }

  /** The fly is somewhere (at launch, or carried there): the first time, a first visit, pictured once it has been seen there a moment. */
  arrived(place: string, name: string, time: number) {
    const moments = this.#moments;
    if (!moments) {
      this.#arrivals.push({ place, name, time });
      return;
    }
    const found = this.#found;
    moments.arrived(place, name, found);
    for (const moment of found) this.#pending.push({ moment, at: Date.now(), place, due: time + ARRIVAL_DELAY, until: time + ARRIVAL_WAIT });
    found.length = 0;
  }

  /** The player takes a photo: false when it can't be (no journal yet, or photos still waiting). */
  snap(): boolean {
    if (!this.journal || this.#own >= OWN_QUEUE) return false;
    this.#own++;
    return true;
  }

  /**
   * Before this frame's world is drawn: whether to take a picture of it, the
   * player's whenever one is waiting, a first's only if the frame shows the
   * fly well (`good`, asked only then). Its firsts out of time are kept
   * without a picture. Once a frame: it allocates nothing.
   */
  wants(time: number, good: () => boolean): Shot {
    this.#shooting = null;
    const pending = this.#pending;
    if (!pending.length && !this.#own) return null;
    this.#expire(time);
    if (!this.#photographer || this.#photographer.busy) return null;
    if (this.#own > 0) this.#shooting = "own";
    else {
      let due = false;
      for (let i = 0; i < pending.length && !due; i++) due = pending[i].due <= time;
      if (due && good()) this.#shooting = "moment";
    }
    return this.#shooting;
  }

  /** After the world is drawn, before anything over it: takes the picture `wants` asked for, of the frame (`width` by `height` pixels, shown at `aspect`). */
  shoot(renderer: Parameters<Photographer["take"]>[0], width: number, height: number, aspect: number, time: number, place: string) {
    const shot = this.#shooting;
    const photographer = this.#photographer;
    this.#shooting = null;
    if (!shot || !photographer) return;
    if (shot === "own") {
      this.#own--;
      this.sinceShutter = 0;
      const at = Date.now();
      const { w, h } = pictureSize(aspect, Math.min(this.keeping.own, Math.max(width, height)));
      photographer.take(renderer, width, height, w, h, (picture) => {
        if (picture) void this.#keep({ kind: "photo", key: "", label: "", at, place }, picture, true);
      });
      return;
    }
    const i = this.#pending.findIndex((p) => p.due <= time);
    if (i < 0) return;
    const [p] = this.#pending.splice(i, 1);
    const { w, h } = pictureSize(aspect, this.keeping.auto);
    photographer.take(renderer, width, height, w, h, (picture) => void this.#keep({ ...p.moment, at: p.at, place: p.place }, picture, false));
  }

  /** Once a frame: a little more of a picture encoded. */
  update(dt: number) {
    this.sinceShutter += dt;
    this.#photographer?.update();
  }

  /** Pictures taken from frames so far: the only frames the journal draws anything in. */
  get shots() {
    return this.#photographer?.shots ?? 0;
  }

  /** Encoding time spent so far, ms. */
  get costMs() {
    return this.#photographer?.costMs ?? 0;
  }

  /** What there is to say of it, for scripts and tests: entries in the journal, firsts waiting for a picture, photos waiting to be taken, and whether one is being taken. */
  get state() {
    const busy = this.#photographer?.busy ? "taking" : "idle";
    return this.journal ? `${busy} pending ${this.#pending.length} own ${this.#own}` : "closed";
  }

  contextLost() {
    this.#photographer?.contextLost();
  }

  #expire(time: number) {
    const pending = this.#pending;
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (time <= p.until) continue;
      pending.splice(i, 1);
      void this.#keep({ ...p.moment, at: p.at, place: p.place }, null, false);
    }
  }

  async #keep(what: { kind: Moment["kind"] | "photo"; key: string; label: string; at: number; place: string }, picture: Picture | null, own: boolean) {
    const journal = this.journal;
    if (!journal) return;
    const kept = await journal.add({ ...what, picture });
    if (!kept) return;
    if (own) this.taken++;
    else this.kept++;
  }
}
