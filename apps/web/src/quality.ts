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
// "Inside its brain" says by how much.
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

  constructor(store: Storage | null = null) {
    this.#store = store;
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
    this.#set(0);
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
