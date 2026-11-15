// The remote, as the game reads it: button presses (with the host's key
// repeat) and the finger on the touch surface, gathered between frames.
//
// In a browser the keyboard and mouse stand in for it: keys map through
// REMOTE_KEYS, and the mouse pressed over the canvas sends the same
// `remotetouch` events the Apple TV host does.

import { REMOTE_KEYS, REMOTE_TOUCH_EVENT } from "@fly/contracts";
import type { RemoteButton, RemoteTouch } from "@fly/contracts";

export type Press = { button: RemoteButton; repeat: boolean };

/** A finger moving this fast (surface widths per second) is swiping: arrow presses during it are the swipe's, not the ring's. */
const SWIPE_SPEED = 1.5;
/** How long after a swipe arrow presses are still taken for it, ms. */
const SWIPE_GRACE = 160;

export class Remote {
  /** Presses since the last frame, oldest first. */
  readonly presses: Press[] = [];
  readonly held = new Set<RemoteButton>();
  /** Where the finger is, -1 to 1 with y up, and whether it's down. */
  readonly touch: RemoteTouch = { x: 0, y: 0, touching: false };
  /** How far the finger moved since the last frame, in surface units. */
  dx = 0;
  dy = 0;
  /** performance.now() of the last press, release or touch. */
  lastInputAt = 0;
  #last: { x: number; y: number; at: number } | null = null;
  #swipingUntil = 0;
  #now: () => number;

  constructor(target: Pick<Window, "addEventListener">, now: () => number = () => performance.now()) {
    this.#now = now;
    target.addEventListener("keydown", (event) => this.#key(event as KeyboardEvent, true));
    target.addEventListener("keyup", (event) => this.#key(event as KeyboardEvent, false));
    target.addEventListener(REMOTE_TOUCH_EVENT, (event) => this.receiveTouch((event as CustomEvent<RemoteTouch>).detail));
  }

  #key(event: KeyboardEvent, down: boolean) {
    const button = REMOTE_KEYS[event.key];
    if (!button) return;
    event.preventDefault?.();
    const now = this.#now();
    this.lastInputAt = now;
    if (!down) {
      this.held.delete(button);
      return;
    }
    const arrow = button === "up" || button === "down" || button === "left" || button === "right";
    if (arrow && now < this.#swipingUntil) return;
    this.held.add(button);
    this.presses.push({ button, repeat: !!event.repeat });
  }

  receiveTouch(detail: RemoteTouch) {
    if (!detail || !Number.isFinite(detail.x) || !Number.isFinite(detail.y)) return;
    const now = this.#now();
    this.lastInputAt = now;
    if (detail.touching && this.touch.touching && this.#last) {
      const mx = detail.x - this.#last.x;
      const my = detail.y - this.#last.y;
      this.dx += mx;
      this.dy += my;
      const dt = Math.max(1, now - this.#last.at) / 1000;
      if (Math.hypot(mx, my) / dt > SWIPE_SPEED * 2) this.#swipingUntil = now + SWIPE_GRACE;
    }
    this.touch.x = detail.x;
    this.touch.y = detail.y;
    this.touch.touching = !!detail.touching;
    this.#last = detail.touching ? { x: detail.x, y: detail.y, at: now } : null;
  }

  /** Called once a frame, after the frame has read the input. */
  endFrame() {
    this.presses.length = 0;
    this.dx = 0;
    this.dy = 0;
  }
}

/** In a browser: the mouse pressed over the canvas is the touch surface. */
export function mouseAsTouch(canvas: HTMLCanvasElement) {
  if (typeof canvas.addEventListener !== "function" || typeof canvas.getBoundingClientRect !== "function") return;
  let down = false;
  const send = (event: PointerEvent, touching: boolean) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const y = 1 - ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2;
    window.dispatchEvent(new CustomEvent(REMOTE_TOUCH_EVENT, { detail: { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), touching } }));
  };
  canvas.addEventListener("pointerdown", (event) => {
    down = true;
    canvas.setPointerCapture?.(event.pointerId);
    send(event, true);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (down) send(event, true);
  });
  const up = (event: PointerEvent) => {
    if (!down) return;
    down = false;
    send(event, false);
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
}
