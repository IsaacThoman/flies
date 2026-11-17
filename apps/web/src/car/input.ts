// The player's hands on the car: the keyboard (arrows or WASD), a game pad,
// or a finger dragged on the screen (across to steer, held to go, pulled
// down to brake). Enter, space, the pad's A or a tap of a finger hands the
// wheel to the fly and takes it back; driving at all takes it back too. The
// mouse does nothing: a click to bring the window forward must not hand the
// fly the wheel.

import type { Controls } from "./car.ts";

/** How quickly a key's steering comes on, and goes back to the middle, per second: a key is all or nothing, a wheel isn't. */
const KEY_STEER = 6;
const KEY_CENTRE = 10;
/** A drag this far across (a share of the screen's width) is full lock. */
const DRAG_LOCK = 0.22;
/** A press shorter and smaller than this is a tap. */
const TAP = { ms: 260, px: 12 };
const DEAD_ZONE = 0.15;

export class Hands {
  readonly controls: Controls = { steer: 0, throttle: 0, brake: 0 };
  /** Whether the player is driving this frame: steering, a pedal or a drag. */
  driving = false;
  readonly #keys = new Set<string>();
  #toggles = 0;
  #resets = 0;
  #pointer: { id: number; x: number; y: number; dx: number; dy: number; at: number; moved: boolean } | null = null;
  #padButtons: boolean[] = [];

  constructor(target: Window, canvas: HTMLElement) {
    target.addEventListener("keydown", (event) => {
      if (event.repeat) return;
      if (event.code === "Enter" || event.code === "Space" || event.code === "KeyF") {
        this.#toggles++;
        event.preventDefault();
      } else if (event.code === "KeyR") {
        this.#resets++;
      } else if (CODES.has(event.code)) {
        this.#keys.add(event.code);
        event.preventDefault();
      }
    });
    target.addEventListener("keyup", (event) => this.#keys.delete(event.code));
    target.addEventListener("blur", () => this.#keys.clear());
    canvas.addEventListener("pointerdown", (event) => {
      if (this.#pointer || event.pointerType === "mouse") return;
      canvas.setPointerCapture?.(event.pointerId);
      this.#pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, at: event.timeStamp, moved: false };
    });
    canvas.addEventListener("pointermove", (event) => {
      const p = this.#pointer;
      if (!p || p.id !== event.pointerId) return;
      p.dx = event.clientX - p.x;
      p.dy = event.clientY - p.y;
      if (Math.hypot(p.dx, p.dy) > TAP.px) p.moved = true;
    });
    const up = (event: PointerEvent) => {
      const p = this.#pointer;
      if (!p || p.id !== event.pointerId) return;
      if (!p.moved && event.timeStamp - p.at < TAP.ms && event.type === "pointerup") this.#toggles++;
      this.#pointer = null;
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  }

  /** Taps of the hand-over since the last call. */
  takeToggles() {
    const n = this.#toggles;
    this.#toggles = 0;
    return n;
  }

  takeResets() {
    const n = this.#resets;
    this.#resets = 0;
    return n;
  }

  /** Reads everything for this frame: `speed` is the car's, for the brake pedal that becomes reverse at a standstill. */
  update(speed: number, width: number, pads: readonly (Gamepad | null)[], now: number, dt: number) {
    const keys = this.#keys;
    const c = this.controls;
    const left = keys.has("ArrowLeft") || keys.has("KeyA");
    const right = keys.has("ArrowRight") || keys.has("KeyD");
    let gas = keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0;
    let stop = keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0;
    const want = (right ? 1 : 0) - (left ? 1 : 0);
    // Reversing the key straightens up first, as fast as letting go.
    let steer = want === 0 || want * c.steer < 0 ? toward(c.steer, 0, KEY_CENTRE * dt) : toward(c.steer, want, KEY_STEER * dt);
    let held = left || right;

    const p = this.#pointer;
    if (p && (p.moved || now - p.at > TAP.ms)) {
      steer = Math.max(-1, Math.min(1, p.dx / (width * DRAG_LOCK)));
      const pulled = p.dy / (width * DRAG_LOCK);
      gas = pulled > 0.35 ? 0 : 1;
      stop = pulled > 0.35 ? 1 : 0;
      held = true;
    }

    for (const pad of pads) {
      if (!pad?.connected) continue;
      const x = pad.axes[0] ?? 0;
      if (Math.abs(x) > DEAD_ZONE) {
        steer = x;
        held = true;
      }
      gas = Math.max(gas, pad.buttons[7]?.value ?? 0, pad.buttons[12]?.pressed ? 1 : 0);
      stop = Math.max(stop, pad.buttons[6]?.value ?? 0, pad.buttons[13]?.pressed ? 1 : 0);
      const a = !!pad.buttons[0]?.pressed;
      const y = !!pad.buttons[3]?.pressed;
      if (a && !this.#padButtons[0]) this.#toggles++;
      if (y && !this.#padButtons[3]) this.#resets++;
      this.#padButtons[0] = a;
      this.#padButtons[3] = y;
    }

    c.steer = steer;
    if (stop > 0 && speed > 0.5) {
      c.throttle = 0;
      c.brake = stop;
    } else if (stop > 0) {
      c.throttle = -stop;
      c.brake = 0;
    } else {
      c.throttle = gas;
      c.brake = speed < -0.5 && gas > 0 ? 1 : 0;
    }
    this.driving = held || gas > 0 || stop > 0;
  }
}

const CODES = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"]);
const toward = (from: number, to: number, step: number) => (Math.abs(to - from) <= step ? to : from + Math.sign(to - from) * step);
