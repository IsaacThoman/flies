// Everything the player plays with, gathered between frames: the Apple TV
// remote (its buttons, with the host's key repeat, and the finger on its
// touch surface), and in a browser the keyboard, the mouse or trackpad, the
// fingers on the screen and a game pad. Each says which it was, so the game
// can show hints for the thing in the player's hand.
//
// The remote reaches the game as DOM events (packages/contracts/src/remote.ts),
// and the keyboard sends the same keys. A pointer is not a stand-in for the
// remote's touch surface: it points at the screen itself, and Pointers turns
// what it does into a few gestures (a press, a drag, a tap, a pinch, the
// wheel). A pad's buttons arrive as the remote's buttons.

import { REMOTE_KEYS, REMOTE_TOUCH_EVENT } from "@fly/contracts";
import type { RemoteButton, RemoteTouch } from "@fly/contracts";

/** What the player is holding. */
export type Device = "remote" | "keys" | "pad" | "mouse" | "touch";

/** The device used last, and when. */
export class Devices {
  current: Device;
  /** performance.now() of the last deliberate input from any of them. */
  at = 0;

  constructor(initial: Device) {
    this.current = initial;
  }

  use(device: Device, now: number) {
    this.current = device;
    this.at = now;
  }

  /** Pointed at the screen itself: no buttons to explain, the screen is the affordance. */
  get pointing() {
    return this.current === "mouse" || this.current === "touch";
  }
}

/** A device to start with before anything is used: the remote on the TV; in a browser a finger or a mouse, by its primary pointer. */
export function initialDevice(tv: boolean, coarse: boolean): Device {
  return tv ? "remote" : coarse ? "touch" : "mouse";
}

export type Press = { button: RemoteButton; repeat: boolean };

/** A finger moving this fast (surface widths per second) is swiping: arrow presses during it are the swipe's, not the ring's. */
const SWIPE_SPEED = 1.5;
/** How long after a swipe arrow presses are still taken for it, ms. */
const SWIPE_GRACE = 160;

type InputTarget = Pick<Window, "addEventListener"> & { document?: Pick<Document, "addEventListener" | "hidden"> };

/** Lost releases cannot be recovered from key events: discard them when the system takes input. */
function onInputLost(target: InputTarget, reset: () => void) {
  target.addEventListener("blur", reset);
  target.addEventListener("pagehide", reset);
  target.document?.addEventListener("visibilitychange", () => {
    if (target.document?.hidden) reset();
  });
  target.addEventListener("focusin", (event) => {
    const element = (event.composedPath?.()[0] ?? event.target) as HTMLElement | null;
    if (element?.tagName === "INPUT" || element?.tagName === "TEXTAREA" || element?.isContentEditable) reset();
  });
}

export class Remote {
  /** Presses since the last frame, oldest first. */
  readonly presses: Press[] = [];
  readonly held = new Set<RemoteButton>();
  readonly #sources = new Map<RemoteButton, Map<string, Device>>();
  /** Where the finger is, -1 to 1 with y up, and whether it's down. */
  readonly touch: RemoteTouch = { x: 0, y: 0, touching: false };
  /** How far the finger moved since the last frame, in surface units (a pad's stick adds to it too). */
  dx = 0;
  dy = 0;
  /** performance.now() of the last press, release or touch. */
  lastInputAt = 0;
  #last: { x: number; y: number; at: number } | null = null;
  #swipingUntil = 0;
  #now: () => number;
  #devices: Devices | null;
  /** What the keys are: the remote's buttons (the TV host sends them), or a keyboard's. */
  #keys: Device;

  constructor(target: InputTarget, now: () => number = () => performance.now(), devices: Devices | null = null, keys: Device = "remote") {
    this.#now = now;
    this.#devices = devices;
    this.#keys = keys;
    target.addEventListener("keydown", (event) => this.#key(event as KeyboardEvent, true));
    target.addEventListener("keyup", (event) => this.#key(event as KeyboardEvent, false));
    target.addEventListener(REMOTE_TOUCH_EVENT, (event) => this.receiveTouch((event as CustomEvent<RemoteTouch>).detail));
    onInputLost(target, () => {
      this.release();
      this.presses.length = 0;
      this.touch.touching = false;
      this.#last = null;
      this.#swipingUntil = 0;
      this.dx = this.dy = 0;
    });
  }

  #key(event: KeyboardEvent, down: boolean) {
    const button = REMOTE_KEYS[event.key];
    if (!button) return;
    event.preventDefault?.();
    const source = `key:${event.code || event.key}`;
    if (down && event.repeat && !this.#sources.get(button)?.has(source)) return;
    this.button(button, down, !!event.repeat, this.#keys, source);
  }

  /** A button going down or up: the remote's, a key's, or a pad's. Letting go is not doing something new: only a press says which device is in hand. */
  button(button: RemoteButton, down: boolean, repeat: boolean, device: Device, source: string = device) {
    const now = this.#now();
    this.lastInputAt = now;
    if (down) this.#devices?.use(device, now);
    if (!down) {
      const sources = this.#sources.get(button);
      sources?.delete(source);
      if (!sources?.size) this.held.delete(button);
      return;
    }
    const arrow = button === "up" || button === "down" || button === "left" || button === "right";
    if (arrow && now < this.#swipingUntil) return;
    let sources = this.#sources.get(button);
    if (!sources) this.#sources.set(button, sources = new Map());
    sources.set(source, device);
    this.held.add(button);
    this.presses.push({ button, repeat });
  }

  /** Losing one device must not release another device's copy of the same button. */
  release(device?: Device) {
    for (const [button, sources] of this.#sources) {
      for (const [source, owner] of sources) if (!device || device === owner) sources.delete(source);
      if (!sources.size) this.held.delete(button);
    }
  }

  receiveTouch(detail: RemoteTouch) {
    if (!detail || !Number.isFinite(detail.x) || !Number.isFinite(detail.y)) return;
    const now = this.#now();
    this.lastInputAt = now;
    if (detail.touching) this.#devices?.use("remote", now);
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

/** What a pointer did, in the canvas's own terms: x and y from 0 to 1 across and down it. */
export type Gesture =
  /** The first finger, or a mouse button, went down. */
  | { type: "down"; x: number; y: number; touch: boolean; button: number }
  /** It moved while down; `far` once it has gone further than a tap may wander. */
  | { type: "drag"; x: number; y: number; far: boolean }
  /** It lifted; `tap` if it barely moved, `double` if that tap was the second of two in quick succession in one place. */
  | { type: "up"; x: number; y: number; tap: boolean; double: boolean }
  /** What it was doing is off: a second finger came down, or the system took the pointer. */
  | { type: "cancel" }
  /** A mouse moved with no button down. */
  | { type: "hover"; x: number; y: number }
  /** The mouse left the screen. */
  | { type: "leave" }
  /** Two fingers: how much further apart since the last (over 1 is spreading), and how far their middle moved. */
  | { type: "pinch"; scale: number; dx: number; dy: number }
  | { type: "pinchEnd" }
  /** The wheel or a trackpad's scroll, CSS pixels; `zoom` is a trackpad's pinch (or the wheel with Ctrl), `notch` a mouse wheel's click. */
  | { type: "wheel"; x: number; y: number; dx: number; dy: number; zoom: boolean; notch: boolean };

/** Fingers wander: one that moves less than this (CSS pixels) from where it went down is tapping. A mouse, less. */
export const TAP_SLOP = { touch: 12, mouse: 5 } as const;
/** A mouse moving this far (a share of the screen's diagonal) within MOVE_WINDOW ms means it, rather than a nudge of the desk. */
export const DELIBERATE_MOVE = 0.04;
const MOVE_WINDOW = 400;
/** A second tap this soon (ms) after the first, and this near it (CSS pixels), makes a double click or tap. */
const DOUBLE_WITHIN = 350;
const DOUBLE_NEAR = 24;

/**
 * A raw pointer event, as Pointers needs it (the DOM's, or a test's). `timeStamp` is when it
 * happened, on performance.now()'s clock: a busy frame hands events over late, and how far apart
 * two clicks were, or how quickly a mouse moved, is told from when they happened.
 */
export type RawPointer = { pointerId: number; pointerType: string; clientX: number; clientY: number; button: number; buttons: number; timeStamp?: number };
type Box = { left: number; top: number; width: number; height: number };

/**
 * Turns the canvas's pointer events into gestures. One finger or a mouse is
 * a press that drags and lifts (a tap if it barely moved); a second finger
 * turns it into a pinch, and nothing more happens until every finger has
 * lifted. A mouse moving with no button down hovers. `deliberate` says
 * something meant was done since the last frame: any press or wheel, or a
 * mouse moved far enough, fast enough.
 */
export class Pointers {
  readonly gestures: Gesture[] = [];
  /** Captures the identity under the first press, before asynchronous menu updates can replace it. */
  onDown: ((x: number, y: number) => void) | null = null;
  /** Runs during a recognized release, while WebKit still permits a touch to raise its keyboard. */
  onTap: ((x: number, y: number, fromX: number, fromY: number) => void) | null = null;
  /** Something meant since the last frame, to wake the wallpaper with. */
  deliberate = false;
  /** performance.now() of the last deliberate input. */
  lastAt = 0;
  readonly #box: () => Box;
  readonly #now: () => number;
  readonly #devices: Devices | null;
  #primary = -1;
  #touch = false;
  #button = 0;
  #start = { x: 0, y: 0 };
  #moved = 0;
  readonly #fingers = new Map<number, { x: number; y: number }>();
  #pinch: { a: number; b: number; distance: number; x: number; y: number } | null = null;
  /** A pinch ended, or the system cancelled: ignore what is left until every finger is up. */
  #spent = false;
  #travel = 0;
  #travelAt = 0;
  #hover = { x: 0, y: 0, known: false };
  /** The last tap's lift, for telling a double one. */
  #lastTap = { x: 0, y: 0, at: -Infinity };

  constructor(box: () => Box, now: () => number = () => performance.now(), devices: Devices | null = null) {
    this.#box = box;
    this.#now = now;
    this.#devices = devices;
  }

  /** Listens to the canvas, and keeps the browser's own gestures (scrolling, zooming the page, its menus) off it. */
  attach(canvas: HTMLCanvasElement) {
    const opts = { passive: false } as const;
    canvas.addEventListener("pointerdown", (e) => {
      // Compatibility mouse events must not blur a field focused on the touch's release.
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      this.down(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      // A batch can leave tap slop and return. Preserve that travel without queuing every sample.
      if (events.length > 1 && e.pointerId === this.#primary) {
        const box = this.#box();
        for (let i = 0; i < events.length - 1; i++) {
          const p = events[i];
          this.#moved = Math.max(this.#moved, Math.hypot(p.clientX - box.left - this.#start.x * box.width, p.clientY - box.top - this.#start.y * box.height));
        }
      }
      this.move(events.length ? events[events.length - 1] : e);
    });
    canvas.addEventListener("pointerup", (e) => this.up(e, false));
    canvas.addEventListener("pointercancel", (e) => this.up(e, true));
    // The system took the pointer (another window, a gesture of its own): its lift won't come.
    canvas.addEventListener("lostpointercapture", (e) => this.up(e, true));
    canvas.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse" && this.#primary !== e.pointerId) this.gestures.push({ type: "leave" });
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.wheel(e);
    }, opts);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    // Safari's own pinch and double-tap zoom, and the page's rubber band.
    for (const type of ["gesturestart", "gesturechange", "dblclick"]) document.addEventListener(type, (e) => e.preventDefault(), opts);
    document.addEventListener("touchmove", (e) => e.preventDefault(), opts);
    // Field focus happens in pointerup, before the next game frame can apply a resize.
    window.addEventListener("resize", () => this.cancel());
    window.addEventListener("orientationchange", () => this.cancel());
    window.visualViewport?.addEventListener("resize", () => this.cancel());
    window.addEventListener("blur", () => this.cancel(true));
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.cancel(true); });
  }

  /** When an event happened: its own time if it has one, else now. */
  #when(e: RawPointer) {
    return e.timeStamp !== undefined && e.timeStamp > 0 ? e.timeStamp : this.#now();
  }

  #at(e: { clientX: number; clientY: number }) {
    const box = this.#box();
    return { x: (e.clientX - box.left) / Math.max(1, box.width), y: (e.clientY - box.top) / Math.max(1, box.height) };
  }

  #meant(touch: boolean) {
    const now = this.#now();
    this.deliberate = true;
    this.lastAt = now;
    this.#devices?.use(touch ? "touch" : "mouse", now);
  }

  down(e: RawPointer) {
    const touch = e.pointerType === "touch";
    const p = this.#at(e);
    this.#meant(touch);
    if (touch) {
      this.#fingers.set(e.pointerId, p);
      if (this.#fingers.size === 2 && !this.#spent) {
        if (this.#primary >= 0) this.gestures.push({ type: "cancel" });
        this.#primary = -1;
        const [aId, bId] = [...this.#fingers.keys()];
        const a = this.#fingers.get(aId)!;
        const b = this.#fingers.get(bId)!;
        this.#lastTap.at = -Infinity;
        this.#pinch = { a: aId, b: bId, distance: this.#distance(a, b), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return;
      }
      if (this.#fingers.size > 1 || this.#spent) return;
    } else if (this.#primary >= 0) {
      // Another button while one is down is the same press; the same pointer pressed again means its lift was lost (the window lost focus mid-drag): that press is over.
      if (e.pointerId !== this.#primary) return;
      this.gestures.push({ type: "cancel" });
    }
    this.#primary = e.pointerId;
    this.#touch = touch;
    this.#button = e.button;
    this.#start = p;
    this.#moved = 0;
    this.gestures.push({ type: "down", x: p.x, y: p.y, touch, button: e.button });
    this.onDown?.(p.x, p.y);
  }

  move(e: RawPointer) {
    const p = this.#at(e);
    if (e.pointerType === "touch") {
      if (!this.#fingers.has(e.pointerId)) return;
      this.#fingers.set(e.pointerId, p);
      const pinch = this.#pinch;
      if (pinch) {
        if (e.pointerId !== pinch.a && e.pointerId !== pinch.b) return;
        const a = this.#fingers.get(pinch.a)!;
        const b = this.#fingers.get(pinch.b)!;
        const distance = this.#distance(a, b);
        const x = (a.x + b.x) / 2;
        const y = (a.y + b.y) / 2;
        this.gestures.push({ type: "pinch", scale: distance / Math.max(1e-6, pinch.distance), dx: x - pinch.x, dy: y - pinch.y });
        this.#meant(true);
        pinch.distance = distance;
        pinch.x = x;
        pinch.y = y;
        return;
      }
    }
    if (e.pointerId === this.#primary) {
      const box = this.#box();
      this.#moved = Math.max(this.#moved, Math.hypot((p.x - this.#start.x) * box.width, (p.y - this.#start.y) * box.height));
      this.gestures.push({ type: "drag", x: p.x, y: p.y, far: this.#moved >= (this.#touch ? TAP_SLOP.touch : TAP_SLOP.mouse) });
      // Still playing: a held finger dragging keeps the wallpaper away.
      this.#meant(this.#touch);
      return;
    }
    if (e.pointerType === "touch" || e.buttons !== 0) return;
    // A mouse hovering: only the latest matters.
    const last = this.gestures[this.gestures.length - 1];
    if (last?.type === "hover") {
      last.x = p.x;
      last.y = p.y;
    } else this.gestures.push({ type: "hover", x: p.x, y: p.y });
    this.#hovered(p, this.#when(e));
  }

  /** A mouse moved: deliberate once it has gone far enough, quickly enough. */
  #hovered(p: { x: number; y: number }, now: number) {
    const box = this.#box();
    if (this.#hover.known) {
      // What it travelled lately, forgetting what is older than the window.
      const k = Math.max(0, 1 - (now - this.#travelAt) / MOVE_WINDOW);
      this.#travel = this.#travel * k + Math.hypot((p.x - this.#hover.x) * box.width, (p.y - this.#hover.y) * box.height);
      this.#travelAt = now;
      if (this.#travel > DELIBERATE_MOVE * Math.hypot(box.width, box.height)) {
        this.#travel = 0;
        this.#meant(false);
      }
    }
    this.#hover.x = p.x;
    this.#hover.y = p.y;
    this.#hover.known = true;
  }

  up(e: RawPointer, cancelled: boolean) {
    if (e.pointerType === "touch") {
      this.#fingers.delete(e.pointerId);
      if (this.#pinch && (e.pointerId === this.#pinch.a || e.pointerId === this.#pinch.b)) {
        this.#pinch = null;
        this.#spent = this.#fingers.size > 0;
        this.gestures.push({ type: "pinchEnd" });
        return;
      }
      if (this.#fingers.size === 0) this.#spent = false;
    }
    if (e.pointerId !== this.#primary) return;
    this.#primary = -1;
    if (cancelled) {
      this.#lastTap.at = -Infinity;
      this.gestures.push({ type: "cancel" });
      return;
    }
    const p = this.#at(e);
    const box = this.#box();
    this.#moved = Math.max(this.#moved, Math.hypot((p.x - this.#start.x) * box.width, (p.y - this.#start.y) * box.height));
    const tap = this.#moved < (this.#touch ? TAP_SLOP.touch : TAP_SLOP.mouse);
    const now = this.#when(e);
    const last = this.#lastTap;
    const double = tap && now - last.at < DOUBLE_WITHIN && Math.hypot((p.x - last.x) * box.width, (p.y - last.y) * box.height) < DOUBLE_NEAR;
    // A third tap starts again rather than making a second double.
    last.at = tap && !double ? now : -Infinity;
    last.x = p.x;
    last.y = p.y;
    this.gestures.push({ type: "up", x: p.x, y: p.y, tap, double });
    if (tap && this.#button === 0) this.onTap?.(p.x, p.y, this.#start.x, this.#start.y);
  }

  /** Geometry or focus changed: coordinates from the previous screen cannot commit an action. */
  cancel(forget = false) {
    if (forget) this.#fingers.clear();
    this.gestures.length = 0;
    this.gestures.push({ type: "cancel" });
    this.#primary = -1;
    this.#pinch = null;
    this.#spent = this.#fingers.size > 0;
    this.#lastTap.at = -Infinity;
  }

  wheel(e: { clientX: number; clientY: number; deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey?: boolean }) {
    const box = this.#box();
    // Lines and pages, as pixels.
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? box.height : 1;
    const p = this.#at(e);
    const dx = e.deltaX * k;
    const dy = e.deltaY * k;
    // A mouse wheel's click comes in lines, or in steps of a hundred or so pixels; a trackpad's scroll in small ones.
    const notch = e.deltaMode === 1 || (Math.abs(dy) >= 50 && Number.isInteger(e.deltaY) && e.deltaX === 0);
    this.#meant(false);
    this.gestures.push({ type: "wheel", x: p.x, y: p.y, dx, dy, zoom: e.ctrlKey || !!e.metaKey, notch });
  }

  #distance(a: { x: number; y: number }, b: { x: number; y: number }) {
    const box = this.#box();
    return Math.hypot((a.x - b.x) * box.width, (a.y - b.y) * box.height);
  }

  /** Called once a frame, after the frame has read the gestures. */
  endFrame() {
    this.gestures.length = 0;
    this.deliberate = false;
  }
}

/**
 * The keys a keyboard has that the remote hasn't (the arrows, Enter, Escape
 * and the space bar are the remote's): the number keys pick a tool, R or
 * Home takes the camera back to Follow's distance and height; held, Q and E
 * turn the camera round the fly, W and S up and down, and + and − bring it in
 * and take it out.
 */
export type KeyAction = { kind: "tool"; index: number } | { kind: "home" };

export function keyAction(code: string, key: string): KeyAction | null {
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (digit) return { kind: "tool", index: Number(digit[1]) - 1 };
  if (code === "KeyR" || key === "Home") return { kind: "home" };
  return null;
}

/** Which way a held key moves the camera: round (−1 left, 1 right), up (−1 lower, 1 higher) or in and out (−1 nearer, 1 farther). */
export type KeyAxis = { axis: "turn" | "tilt" | "zoom"; dir: -1 | 1 };

export function keyAxis(code: string, key: string): KeyAxis | null {
  if (code === "KeyQ") return { axis: "turn", dir: -1 };
  if (code === "KeyE") return { axis: "turn", dir: 1 };
  if (code === "KeyW") return { axis: "tilt", dir: 1 };
  if (code === "KeyS") return { axis: "tilt", dir: -1 };
  if (key === "+" || key === "=" || code === "NumpadAdd") return { axis: "zoom", dir: -1 };
  if (key === "-" || key === "_" || code === "NumpadSubtract") return { axis: "zoom", dir: 1 };
  return null;
}

export class Keyboard {
  readonly actions: KeyAction[] = [];
  /** The keys held now, by code, and the way each moves the camera. */
  readonly #held = new Map<string, KeyAxis>();
  /** Where the held keys push the camera: -1 to 1 round, up, and in (−) or out (+). */
  turn = 0;
  tilt = 0;
  zoom = 0;

  constructor(target: InputTarget, remote: Remote, devices: Devices, now: () => number = () => performance.now()) {
    target.addEventListener("keydown", (event) => {
      const e = event as KeyboardEvent;
      if (e.ctrlKey || e.metaKey || e.altKey || (e.repeat && !this.#held.has(e.code))) return;
      const action = keyAction(e.code, e.key);
      const axis = action ? null : keyAxis(e.code, e.key);
      if (!action && !axis) return;
      e.preventDefault?.();
      remote.lastInputAt = now();
      devices.use("keys", remote.lastInputAt);
      if (axis) this.#held.set(e.code, axis);
      else if (action && !e.repeat) this.actions.push(action);
      this.#sum();
    });
    target.addEventListener("keyup", (event) => {
      if (this.#held.delete((event as KeyboardEvent).code)) this.#sum();
    });
    // A key let go in another window never comes up here.
    onInputLost(target, () => {
      this.actions.length = 0;
      this.#held.clear();
      this.#sum();
    });
  }

  #sum() {
    this.turn = 0;
    this.tilt = 0;
    this.zoom = 0;
    for (const { axis, dir } of this.#held.values()) this[axis] += dir;
    this.turn = Math.max(-1, Math.min(1, this.turn));
    this.tilt = Math.max(-1, Math.min(1, this.tilt));
    this.zoom = Math.max(-1, Math.min(1, this.zoom));
  }

  /** Held keys keep the player at it: the wallpaper stays away. */
  get holding() {
    return this.#held.size > 0;
  }

  endFrame() {
    this.actions.length = 0;
  }
}

/** A stick inside this is resting. */
export const STICK_DEAD = 0.22;
/** A held direction repeats as the remote's buttons do: first after this long, then this often (ms). */
const REPEAT_FIRST = 400;
const REPEAT_EVERY = 100;

/** The standard pad's buttons that are the remote's (the W3C standard mapping): A, B, Start, the d-pad. */
const PAD_BUTTONS: readonly [number, RemoteButton][] = [
  [0, "select"],
  [1, "back"],
  [9, "playPause"],
  [12, "up"],
  [13, "down"],
  [14, "left"],
  [15, "right"],
];
/** Its shoulder buttons step through the tools, as left and right do. */
const PAD_SHOULDERS: readonly [number, RemoteButton][] = [
  [4, "left"],
  [5, "right"],
];

type PadLike = { connected: boolean; mapping: string; buttons: readonly { pressed: boolean; value: number }[]; axes: readonly number[] };

/**
 * A game pad, through the web's Gamepad API: polled once a frame, and only
 * once one has been connected. Its buttons are the remote's (A is Select, B
 * is Back, Start is Play/Pause, the d-pad the arrows, the shoulders the
 * tools); the left stick moves the hand as a finger on the touch surface
 * does, or, in a menu, steps as the arrows do; the right stick turns the
 * camera round the fly, and pressed in takes it back to Follow; the
 * triggers bring it in (right) and take it out (left), as far as they are
 * pressed.
 */
export class Gamepads {
  /** The right stick, -1 to 1 each way (y up), for looking round. */
  readonly look = { x: 0, y: 0 };
  /** The triggers: -1 (right, all the way: nearer) to 1 (left: farther). */
  zoom = 0;
  /** The right stick was pressed in since the last frame. */
  home = false;
  #active = false;
  #padIndex = -1;
  #awaitingNeutral = false;
  readonly #pressed = new Map<number, boolean>();
  readonly #repeatAt = new Map<RemoteButton, number>();
  #stickHeld: RemoteButton | null = null;
  #stickIn = false;
  readonly #remote: Remote;
  readonly #devices: Devices;
  readonly #pads: () => readonly (PadLike | null)[];

  constructor(remote: Remote, devices: Devices, pads: () => readonly (PadLike | null)[], target?: InputTarget) {
    this.#remote = remote;
    this.#devices = devices;
    this.#pads = pads;
    target?.addEventListener("gamepadconnected", () => {
      this.#active = true;
    });
    target?.addEventListener("gamepaddisconnected", (event) => {
      if ((event as GamepadEvent).gamepad?.index === this.#padIndex) this.#reset();
    });
    if (target) onInputLost(target, () => {
      this.#reset();
      this.#awaitingNeutral = true;
    });
    if (!target) this.#active = true;
  }

  #reset() {
    this.#remote.release("pad");
    this.#padIndex = -1;
    this.#pressed.clear();
    this.#repeatAt.clear();
    this.#stickHeld = null;
    this.#stickIn = false;
    this.look.x = this.look.y = this.zoom = 0;
    this.home = false;
  }

  /** Once a frame: `menus` says whether the left stick steps (a menu) or moves the hand (play). */
  poll(dt: number, now: number, menus: boolean) {
    this.look.x = 0;
    this.look.y = 0;
    this.zoom = 0;
    this.home = false;
    if (!this.#active) return;
    const available = this.#pads();
    const index = available.findIndex((p) => p?.connected && p.mapping === "standard");
    const pad = available[index];
    if (!pad) {
      if (this.#padIndex >= 0) this.#reset();
      return;
    }
    if (index !== this.#padIndex) {
      this.#reset();
      this.#padIndex = index;
    }
    // A stale pressed snapshot after blur or keyboard takeover is not a fresh press.
    if (this.#awaitingNeutral) {
      for (let i = 0; i < pad.buttons.length; i++) if (pad.buttons[i].pressed || pad.buttons[i].value > 0.08) return;
      for (let i = 0; i < pad.axes.length; i++) if (Math.abs(pad.axes[i]) >= STICK_DEAD) return;
      this.#awaitingNeutral = false;
      return;
    }
    const remote = this.#remote;
    const press = (index: number, button: RemoteButton) => {
      const down = !!pad.buttons[index]?.pressed;
      const was = this.#pressed.get(index) ?? false;
      if (down !== was) {
        this.#pressed.set(index, down);
        remote.button(button, down, false, "pad", `pad:${index}`);
        if (down) this.#repeatAt.set(button, now + REPEAT_FIRST);
      } else if (down && button !== "select" && button !== "back" && button !== "playPause" && now >= (this.#repeatAt.get(button) ?? Infinity)) {
        remote.button(button, true, true, "pad", `pad:${index}`);
        this.#repeatAt.set(button, now + REPEAT_EVERY);
      }
    };
    for (const [index, button] of PAD_BUTTONS) press(index, button);
    for (const [index, button] of PAD_SHOULDERS) press(index, button);
    const triggers = trigger(pad.buttons[6]?.value ?? 0) - trigger(pad.buttons[7]?.value ?? 0);
    const stickIn = !!pad.buttons[11]?.pressed;
    if (stickIn && !this.#stickIn) this.home = true;
    this.#stickIn = stickIn;
    if (triggers !== 0 || this.home) {
      this.zoom = triggers;
      this.#devices.use("pad", now);
      remote.lastInputAt = now;
    }
    const lx = deadzone(pad.axes[0] ?? 0);
    const ly = -deadzone(pad.axes[1] ?? 0);
    const rx = deadzone(pad.axes[2] ?? 0);
    const ry = -deadzone(pad.axes[3] ?? 0);
    if (menus) {
      // The stick as the arrows, with their repeat.
      const dir: RemoteButton | null = Math.abs(lx) > 0.5 || Math.abs(ly) > 0.5 ? (Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? "right" : "left") : ly > 0 ? "up" : "down") : null;
      if (dir !== this.#stickHeld) {
        if (this.#stickHeld) remote.button(this.#stickHeld, false, false, "pad", "pad:stick");
        if (dir) {
          remote.button(dir, true, false, "pad", "pad:stick");
          this.#repeatAt.set(dir, now + REPEAT_FIRST);
        }
        this.#stickHeld = dir;
      } else if (dir && now >= (this.#repeatAt.get(dir) ?? Infinity)) {
        remote.button(dir, true, true, "pad", "pad:stick");
        this.#repeatAt.set(dir, now + REPEAT_EVERY);
      }
    } else {
      if (this.#stickHeld) remote.button(this.#stickHeld, false, false, "pad", "pad:stick");
      this.#stickHeld = null;
      if (lx !== 0 || ly !== 0) {
        // About a screen's width a second, at full tilt; gently, finely.
        const speed = 1.1 * dt;
        remote.dx += lx * Math.abs(lx) * speed;
        remote.dy += ly * Math.abs(ly) * speed;
        remote.lastInputAt = now;
        this.#devices.use("pad", now);
      }
    }
    if (rx !== 0 || ry !== 0) {
      this.look.x = rx;
      this.look.y = ry;
      remote.lastInputAt = now;
      this.#devices.use("pad", now);
    }
  }
}

/** A trigger resting lightly is nothing. */
const trigger = (v: number) => (v < 0.08 ? 0 : (v - 0.08) / 0.92);
const deadzone = (v: number) => (Math.abs(v) < STICK_DEAD ? 0 : (v - Math.sign(v) * STICK_DEAD) / (1 - STICK_DEAD));
