// The game as a browser tab, which it may be for days as someone's
// wallpaper: it sleeps while hidden and wakes where the clock is, keeps the
// screen on only while it is the wallpaper, starts its sound on the first
// press or tap (browsers allow no sooner), comes back from a lost graphics
// context and from the back-forward cache, tries the brain again when the
// network returns, and registers the service worker that keeps the page for
// opening offline. None of it applies on the Apple TV, whose host does these
// things itself.

import type { Game } from "./game.ts";

/**
 * A gap this long between frames (ms, by the wall clock) is the computer
 * having slept with the page showing, which no visibility event announces;
 * performance.now() may not even have moved.
 */
const SLEPT_MS = 30_000;
/** How long to wait before asking for the wake lock again after it was refused or taken back. */
const RETRY_MS = 30_000;

type WakeLockSentinel = { released: boolean; release(): Promise<void>; addEventListener(type: "release", listener: () => void): void };
type WakeLockApi = { request(type: "screen"): Promise<WakeLockSentinel> };

export class Page {
  readonly #game: Game;
  readonly #canvas: HTMLCanvasElement;
  #lock: WakeLockSentinel | null = null;
  #asking = false;
  /** Whether the screen should be kept on: the wallpaper is showing, in a tab that can be seen. */
  #wanted = false;
  #hiddenAt = 0;
  #lastFrameAt = 0;
  /** After a refusal, or the browser letting go while the wallpaper shows, don't ask again before this (Date.now()). */
  #askAgainAt = 0;

  constructor(game: Game, canvas: HTMLCanvasElement) {
    this.#game = game;
    this.#canvas = canvas;
    document.addEventListener("visibilitychange", () => (document.hidden ? this.#sleep() : this.#wake()));
    // Restored from the back-forward cache: the same page, asleep since it was left.
    window.addEventListener("pagehide", () => this.#sleep());
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) this.#wake();
    });
    const unlock = () => game.audio.unlock();
    for (const type of ["pointerdown", "pointerup", "keydown", "touchend"]) window.addEventListener(type, unlock, { capture: true, passive: true });
    canvas.addEventListener("webglcontextlost", () => game.contextLost());
    canvas.addEventListener("webglcontextrestored", () => game.contextRestored());
    window.addEventListener("online", () => game.retryBrain(true));
    game.audio.ctx?.addEventListener?.("statechange", () => this.#publish());
    // Opened in a background tab: asleep until it is first seen.
    if (document.hidden) this.#sleep();
    this.#publish();
  }

  /** The tab is hidden: no frames, so the fly's life and its brain wait. */
  get asleep() {
    return this.#hiddenAt !== 0;
  }

  /** Registers the service worker (the built site only: the dev server's files change under it). */
  static keepForOffline() {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Not over https, or from an app's own URL scheme: the page still works, it just isn't kept.
    });
    // Asked only of an installed app, whose owner expects it to keep; a browser may otherwise clear a site's storage when space runs short.
    if (matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches) void navigator.storage?.persist?.().catch(() => false);
  }

  /**
   * Once a frame, before the game's: wakes the game after the computer slept
   * with the page showing, and keeps the screen on while the wallpaper shows.
   */
  update() {
    const now = Date.now();
    if (this.#lastFrameAt && now - this.#lastFrameAt > SLEPT_MS) this.#game.wake(now - this.#lastFrameAt);
    this.#lastFrameAt = now;
    const wanted = this.#game.wallpaper && !document.hidden;
    if (wanted !== this.#wanted) {
      this.#wanted = wanted;
      if (!wanted) this.#letGo();
    }
    if (wanted && !this.#lock && !this.#asking && now >= this.#askAgainAt) void this.#hold();
  }

  async #hold() {
    const api = (navigator as { wakeLock?: WakeLockApi }).wakeLock;
    if (!api || this.#lock || this.#asking) return;
    this.#asking = true;
    try {
      const lock = await api.request("screen");
      this.#asking = false;
      if (!this.#wanted) {
        void lock.release();
        return;
      }
      this.#lock = lock;
      // The browser lets go of it itself when the tab is hidden.
      lock.addEventListener("release", () => {
        if (this.#lock === lock) this.#lock = null;
        // Let go by the browser while still wanted and showing (a battery saver): asked for again, but not straight away.
        if (this.#wanted && !document.hidden) this.#askAgainAt = Date.now() + RETRY_MS;
        this.#publish();
      });
    } catch {
      // Refused (no permission, battery saver, not focused): the screen sleeps as it normally would, and it is asked again later.
      this.#asking = false;
      this.#askAgainAt = Date.now() + RETRY_MS;
    }
    this.#publish();
  }

  #letGo() {
    const lock = this.#lock;
    this.#lock = null;
    if (lock && !lock.released) void lock.release().catch(() => {});
    this.#publish();
  }

  #sleep() {
    if (this.#hiddenAt) return;
    this.#hiddenAt = Date.now();
    this.#game.sleep();
    this.#wanted = false;
    this.#letGo();
  }

  #wake() {
    if (!this.#hiddenAt || document.hidden) return;
    const away = Date.now() - this.#hiddenAt;
    this.#hiddenAt = 0;
    this.#lastFrameAt = 0;
    this.#askAgainAt = 0;
    this.#game.wake(away);
    this.#publish();
  }

  #publish() {
    const d = this.#canvas.dataset;
    if (!d) return;
    d.hidden = String(!!this.#hiddenAt);
    d.wakeLock = this.#lock ? "held" : "none";
    d.audio = this.#game.audio.ctx?.state ?? "none";
  }
}
