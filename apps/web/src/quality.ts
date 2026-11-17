// How much picture this device can afford, in a browser. The game watches how
// long its frames take and how fast the brain runs against real time, and
// when either falls behind it draws less: first the eyes' finer detail, then
// half the frames, then bigger pixels, then the eyes refreshing half as often,
// then bigger pixels still. Never more than the player chose in Settings.
// When things have been easy for a while it tries one step back up, and if
// that goes badly it steps down again and waits longer before the next try.
//
// A brain that falls behind is given cheaper pictures only while they help
// it: on a phone whose cores share one power budget, less drawing leaves more
// for the brain, but where the brain is simply too slow for the device no
// picture will help, and if stepping all the way down didn't, the picture goes
// back to where it was. The brain is never slowed or simplified to make the
// picture smoother; one that runs slower than real time is left so, and
// the stats' real-time figure says by how much.
//
// A host can hold the picture at one level instead (globalThis.__quality,
// set before the game boots): the end-to-end tests do, so that what they
// check doesn't hang on how fast the machine running them draws.
//
// Allocates nothing per frame.

import type { PixelSize } from "./display.ts";
import type { EyesDetail } from "./settings.ts";

export type Level = {
  /** Frames a second, at most. */
  fps: 60 | 30;
  /** The biggest pixels may get no finer than this. */
  pixels: PixelSize;
  /** The eyes no finer than this. */
  eyes: "low" | "high";
  /** How often the eyes refresh, as a share of their detail's rate. */
  eyesRate: 1 | 0.5;
};

export const LEVELS: readonly Level[] = [
  { fps: 60, pixels: "classic", eyes: "high", eyesRate: 1 },
  { fps: 60, pixels: "classic", eyes: "low", eyesRate: 1 },
  { fps: 30, pixels: "classic", eyes: "low", eyesRate: 1 },
  { fps: 30, pixels: "chunky", eyes: "low", eyesRate: 1 },
  { fps: 30, pixels: "chunky", eyes: "low", eyesRate: 0.5 },
  { fps: 30, pixels: "chunkier", eyes: "low", eyesRate: 0.5 },
];

/** Seconds a judgement is made over. */
export const WINDOW = 2;
/** Bad windows in a row before a step down. */
const BAD_TO_STEP = 2;
/** Good windows in a row before trying a step up, at first; doubled each time a try fails, up to MAX_PATIENCE. */
const PATIENCE = 15;
const MAX_PATIENCE = 300;
/** Frames more than this much slower than the target, on average, are falling behind. */
const LATE = 1.2;
/** The brain running slower than this share of real time is falling behind. */
const BRAIN_BEHIND = 0.95;
/**
 * A gap this long between frames (ms) is something one-off, not this
 * device's pace; hidden time, sleep, loading and the building of a place
 * don't reach here at all (the game passes 0).
 */
const HITCH_MS = 1000;
/** Where the level it settled at is kept, to start from next time. */
const KEY = "flies.quality";

const PIXEL_ORDER: readonly PixelSize[] = ["classic", "chunky", "chunkier"];
const EYES_ORDER: readonly EyesDetail[] = ["off", "low", "high"];

/** The cheaper of what the player chose and what the device can afford. */
export const cheaperPixels = (chosen: PixelSize, cap: PixelSize) => (PIXEL_ORDER.indexOf(chosen) >= PIXEL_ORDER.indexOf(cap) ? chosen : cap);
export const cheaperEyes = (chosen: EyesDetail, cap: "low" | "high") => (EYES_ORDER.indexOf(chosen) <= EYES_ORDER.indexOf(cap) ? chosen : cap);

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

export class Quality {
  level = 0;
  /** The level it is held at whatever the frames take, or null to follow the device. */
  readonly pinned: number | null;
  /** Bumped whenever the level changes, for the game to apply it. */
  changes = 0;
  /** The last window's measures, for the stats corner and scripts. */
  frameMs = 0;
  brainSpeed = 0;
  #store: Storage | null;
  #elapsed = 0;
  #frames = 0;
  #frameTime = 0;
  #brainSum = 0;
  #brainSamples = 0;
  #bad = 0;
  #good = 0;
  #patience = PATIENCE;
  /** Stepping down for the brain: the level it started from, or -1 when not. */
  #brainFrom = -1;
  /** Windows judged at the cheapest level while stepping down for the brain. */
  #brainAtBottom = 0;
  /** Even the cheapest picture didn't let the brain keep up: don't step down for it again until the player changes the picture. */
  #brainBound = false;
  /** Just stepped up: windows left in which a bad one means the step was too far. */
  #trial = 0;

  constructor(store: Storage | null = null, pinned: number | null = null) {
    this.#store = store;
    this.pinned = pinned !== null && Number.isInteger(pinned) && pinned >= 0 && pinned < LEVELS.length ? pinned : null;
    if (this.pinned !== null) {
      this.level = this.pinned;
      return;
    }
    const saved = Number(this.#read());
    // One step better than last time: it may have been a bad moment.
    if (Number.isInteger(saved) && saved > 0 && saved < LEVELS.length) this.level = saved - 1;
  }

  get current(): Level {
    return LEVELS[this.level];
  }

  /**
   * One rendered frame: `intervalMs` since the last, the brain's speed
   * against real time (or a negative number while it isn't living: loading,
   * paused, between places).
   */
  frame(intervalMs: number, brainSpeed: number) {
    // Zero is a frame not to be judged (the game passes it while loading, paused or between places).
    if (!(intervalMs > 0) || intervalMs > HITCH_MS) {
      this.#restartWindow();
      return;
    }
    this.#elapsed += intervalMs / 1000;
    this.#frames++;
    this.#frameTime += intervalMs;
    if (brainSpeed >= 0) {
      this.#brainSum += brainSpeed;
      this.#brainSamples++;
    }
    if (this.#elapsed >= WINDOW) this.#judge();
  }

  /** The player changed a setting the levels touch: theirs is taken at its word until the device shows otherwise. */
  reset() {
    this.#set(this.pinned ?? 0);
    this.#patience = PATIENCE;
    this.#brainBound = false;
    this.#brainFrom = -1;
    this.#brainAtBottom = 0;
    this.#trial = 0;
    this.#bad = 0;
    this.#good = 0;
    this.#restartWindow();
  }

  #judge() {
    const target = 1000 / this.current.fps;
    this.frameMs = this.#frameTime / this.#frames;
    const framesBehind = this.frameMs > target * LATE;
    const brainKnown = this.#brainSamples * 2 >= this.#frames;
    this.brainSpeed = brainKnown ? this.#brainSum / this.#brainSamples : -1;
    const brainBehind = brainKnown && this.brainSpeed < BRAIN_BEHIND;
    this.#restartWindow();
    if (this.pinned !== null) return;

    // Stepping down for the brain: done once it keeps up, and that level is kept. If even the
    // cheapest picture doesn't get it there, the picture goes back to where it was: a brain on a
    // core of its own is rarely helped by less drawing, and a one-window gain is noise.
    if (this.#brainFrom >= 0 && brainKnown) {
      if (!brainBehind) {
        this.#brainFrom = -1;
        this.#save();
      } else if (this.level === LEVELS.length - 1 && ++this.#brainAtBottom >= 2) {
        const from = this.#brainFrom;
        this.#brainFrom = -1;
        this.#brainBound = true;
        if (!framesBehind) {
          this.#set(from);
          return;
        }
        this.#save();
      }
    }
    const behind = framesBehind || (brainBehind && !this.#brainBound);
    if (behind) {
      this.#good = 0;
      if (this.#trial > 0) {
        // The step up was too far: back down at once, and wait longer before the next try.
        this.#trial = 0;
        this.#patience = Math.min(MAX_PATIENCE, this.#patience * 2);
        this.#set(this.level + 1);
        return;
      }
      if (++this.#bad >= BAD_TO_STEP && this.level < LEVELS.length - 1) {
        this.#bad = 0;
        if (!framesBehind && this.#brainFrom < 0) {
          this.#brainFrom = this.level;
          this.#brainAtBottom = 0;
        }
        this.#set(this.level + 1);
      }
      return;
    }
    this.#bad = 0;
    if (this.#trial > 0) this.#trial--;
    if (++this.#good >= this.#patience && this.level > 0) {
      this.#good = 0;
      this.#trial = 3;
      this.#set(this.level - 1);
    }
  }

  #set(level: number) {
    const next = Math.max(0, Math.min(LEVELS.length - 1, level));
    if (next === this.level) return;
    this.level = next;
    this.changes++;
    // A step on the way down for the brain is kept only once it is known to have helped.
    if (this.#brainFrom < 0) this.#save();
  }

  #save() {
    // A held level says nothing about this device: what it settled at before stays for next time.
    if (this.pinned !== null) return;
    try {
      this.#store?.setItem(KEY, String(this.level));
    } catch {
      // Not kept: it starts from the top next time.
    }
  }

  #read() {
    try {
      return this.#store?.getItem(KEY) ?? null;
    } catch {
      return null;
    }
  }

  #restartWindow() {
    this.#elapsed = 0;
    this.#frames = 0;
    this.#frameTime = 0;
    this.#brainSum = 0;
    this.#brainSamples = 0;
  }
}

// A device that says how hot it is (the Apple TV) is held to what it can
// sustain rather than to the most it can draw: a TV that runs a heavy place
// flat out at 60 frames a second heats up until its system slows it far below
// what a steady lower rate would have been. As it warms, the frame rate comes
// down first, to 40 and then 30, and then the pixels coarsen; each step is
// taken only while it stays warm. It steps back up only after it has been
// cool for a long while, one step at a time, and if that step warms it again
// it comes straight back down and waits twice as long before the next try.
//
// How warm a place makes the device differs by place: where each was last
// held, and how long it waits there, is kept, and a place starts from there.
// Not every device says "fair" before "serious" (the Apple TV goes straight
// from nominal to serious), so a place that has made it hot once starts where
// it stayed cool. Only the frame rate and the pixels change: the brain's time,
// its senses and the eyes are the same at any level.
//
// Allocates nothing per frame.

/** What a warming device is held to: frames a second at most, and the pixels no finer than. */
export type Warm = { fps: 60 | 40 | 30; pixels: PixelSize };

export const WARM_LEVELS: readonly Warm[] = [
  { fps: 60, pixels: "classic" },
  { fps: 40, pixels: "classic" },
  { fps: 30, pixels: "classic" },
  { fps: 30, pixels: "chunky" },
  { fps: 30, pixels: "chunkier" },
];

/** How often the device is asked how hot it is, s. */
export const THERMAL_EVERY = 1;
/** By thermal state (nominal, fair, serious, critical): how long it must have been warm before the first step down, and how long between steps while it stays so, s. */
export const STEP_AFTER: readonly number[] = [Infinity, 15, 0, 0];
export const STEP_EVERY: readonly number[] = [Infinity, 60, 45, 15];
/** Cool this long before a step back up, at first, s; doubled each time the place warms the device (once however many steps that takes), up to MAX_COOL. */
export const COOL = 10 * 60;
export const MAX_COOL = 2 * 60 * 60;
/** After a step up, warming within this long means it went too far, s. */
export const TRIAL = 10 * 60;
const WARMTH_KEY = "flies.warmth";

type Kept = { level: number; cool: number };

export class Warmth {
  level = 0;
  /** Bumped whenever the level changes, for the game to apply it. */
  changes = 0;
  /** The device's thermal state as last read: 0 nominal, 1 fair, 2 serious, 3 critical. */
  state = 0;
  /** The place it is holding to, as `enter` was last told. */
  place = "";
  #read: () => number;
  #store: Storage | null;
  #kept: Record<string, Kept>;
  #cool = COOL;
  #sinceRead = 0;
  #warmFor = 0;
  #coolFor = 0;
  #sinceStep = Infinity;
  /** This spell of warmth has stepped down already (and lengthened the wait). */
  #stepped = false;
  /** Seconds left in which warming means the last step up was too far; 0 when none is being tried. */
  #trial = 0;

  /** `read` says how hot the device is (THERMAL in @fly/contracts). */
  constructor(read: () => number, store: Storage | null = null) {
    this.#read = read;
    this.#store = store;
    this.#kept = this.#load();
  }

  get current(): Warm {
    return WARM_LEVELS[this.level];
  }

  /** The device is now drawing this place: it starts where the place was last held. */
  enter(place: string) {
    this.place = place;
    const kept = this.#kept[place];
    this.#cool = kept?.cool ?? COOL;
    this.#coolFor = 0;
    this.#trial = 0;
    this.#set(kept?.level ?? 0);
  }

  /** Time passing, s: asks the device how hot it is every THERMAL_EVERY and steps when it should. */
  update(dt: number) {
    this.#sinceRead += dt;
    if (this.#sinceRead < THERMAL_EVERY) return;
    const s = this.#sinceRead;
    this.#sinceRead = 0;
    const state = Math.max(0, Math.min(3, Math.round(this.#read()) || 0));
    this.state = state;
    this.#sinceStep += s;
    if (state > 0) {
      this.#coolFor = 0;
      this.#warmFor += s;
      if (this.#trial > 0) {
        // The step up was too far: back at once.
        this.#trial = 0;
        this.#down();
      } else if (this.#warmFor >= STEP_AFTER[state] && this.#sinceStep >= STEP_EVERY[state]) {
        this.#down();
      }
      return;
    }
    this.#warmFor = 0;
    this.#stepped = false;
    this.#coolFor += s;
    if (this.#trial > 0) {
      this.#trial -= s;
      // Cool all through its trial: this level holds here.
      if (this.#trial <= 0) {
        this.#trial = 0;
        this.#keep();
      }
      return;
    }
    if (this.level > 0 && this.#coolFor >= this.#cool) {
      this.#coolFor = 0;
      this.#trial = TRIAL;
      this.#set(this.level - 1);
    }
  }

  #down() {
    this.#sinceStep = 0;
    // However far down it already is, the place has warmed the device: wait longer before trying higher.
    if (!this.#stepped) this.#cool = Math.min(MAX_COOL, this.#cool * 2);
    this.#stepped = true;
    this.#set(this.level + 1);
    this.#keep();
  }

  #set(level: number) {
    const next = Math.max(0, Math.min(WARM_LEVELS.length - 1, level));
    if (next === this.level) return;
    this.level = next;
    this.changes++;
  }

  #keep() {
    if (!this.place) return;
    this.#kept[this.place] = { level: this.level, cool: this.#cool };
    try {
      this.#store?.setItem(WARMTH_KEY, JSON.stringify(this.#kept));
    } catch {
      // Not kept: each place starts at the top next time.
    }
  }

  #load(): Record<string, Kept> {
    try {
      const kept = JSON.parse(this.#store?.getItem(WARMTH_KEY) ?? "{}") as Record<string, Kept>;
      const sane: Record<string, Kept> = {};
      for (const [place, k] of Object.entries(kept ?? {})) {
        if (Number.isInteger(k?.level) && k.level >= 0 && k.level < WARM_LEVELS.length && k.cool >= COOL && k.cool <= MAX_COOL) sane[place] = { level: k.level, cool: k.cool };
      }
      return sane;
    } catch {
      return {};
    }
  }
}
