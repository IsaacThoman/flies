// Rumble in the hand: what the player's tools do, and what the fly does under
// them, felt through a game pad (the Gamepad API's dual rumble) or an Android
// phone (navigator.vibrate). A tick when food is dropped and a softer one when
// it lands, a swell as the ball dives, two quick knocks when a press can't do
// anything, the feather's brushing while it is on the fly, the air while you
// blow, and a knock when the fly takes off. It is the player's: nothing here
// reaches the fly. Where there is nothing to rumble (the Apple TV's remote, a
// mouse, a keyboard, a phone without vibrate, whose own app plays haptics of
// its own) it does nothing, and it is as strong as the sound effects are loud:
// at none, none.

import type { Device } from "./input.ts";

type DualRumble = { startDelay: number; duration: number; weakMagnitude: number; strongMagnitude: number };
type PadLike = { connected: boolean; vibrationActuator?: { playEffect?: (type: "dual-rumble", params: DualRumble) => Promise<unknown> } | null };
type Vibrate = (pattern: number | number[]) => boolean;

export type Feel = "drop" | "land" | "swoop" | "blocked" | "takeoff";

/** Each one-off feel: the pad's low (strong) and high (weak) motors, 0 to 1, for how long (ms), twice if `again` (ms after the first starts). A phone vibrates for the same time. */
export const FEELS: Readonly<Record<Feel, { strong: number; weak: number; ms: number; again?: number }>> = {
  drop: { strong: 0, weak: 0.35, ms: 30 },
  land: { strong: 0, weak: 0.2, ms: 20 },
  swoop: { strong: 0.35, weak: 0.3, ms: 260 },
  blocked: { strong: 0.25, weak: 0, ms: 35, again: 90 },
  takeoff: { strong: 0.6, weak: 0.2, ms: 70 },
};

/** A held tool is felt as short pulses this often (ms), each a little longer, so they run together on a pad and brush on a phone. */
export const HOLD_EVERY = 140;
/** Designed at the Effects volume's default, 7 of 10; louder doesn't rumble harder. */
const DESIGNED_AT = 7;

export class Haptics {
  /** 0 (off) to 1, from the Effects volume. */
  #level = 1;
  #holdIn = 0;
  readonly #devices: { readonly current: Device };
  readonly #pads: () => readonly (PadLike | null)[];
  readonly #vibrate: Vibrate | null;
  /** Reused for every effect: nothing is made per pulse but the effect's own promise. */
  readonly #effect: DualRumble = { startDelay: 0, duration: 0, weakMagnitude: 0, strongMagnitude: 0 };
  readonly #twice: number[] = [0, 0, 0];
  #again = { strong: 0, weak: 0, ms: 0 };
  readonly #playAgain = () => this.#play(this.#again.strong, this.#again.weak, this.#again.ms);

  constructor(devices: { readonly current: Device }, pads: () => readonly (PadLike | null)[], vibrate: Vibrate | null) {
    this.#devices = devices;
    this.#pads = pads;
    this.#vibrate = vibrate;
  }

  /** The Effects volume, 0 to 10. */
  setVolume(effects: number) {
    this.#level = Math.min(1, Math.max(0, effects) / DESIGNED_AT);
  }

  feel(kind: Feel) {
    const f = FEELS[kind];
    this.#play(f.strong, f.weak, f.ms, f.again);
  }

  /**
   * Once a frame while playing: the feather on the fly (0, 0.4 resting, 1
   * stroking) and the air blown (0, or up to 1 for hard). Nothing between pulses.
   */
  held(feather: number, blow: number, dt: number) {
    const amount = Math.max(feather, blow);
    if (amount <= 0) {
      this.#holdIn = 0;
      return;
    }
    this.#holdIn -= dt * 1000;
    if (this.#holdIn > 0) return;
    this.#holdIn = HOLD_EVERY;
    // The feather is felt high and light, the air low.
    if (feather >= blow) this.#play(0, 0.25 * feather, feather >= 1 ? 50 : 25);
    else this.#play(0.3 * blow, 0.1 * blow, HOLD_EVERY + 40);
  }

  #play(strong: number, weak: number, ms: number, again?: number) {
    if (this.#level <= 0) return;
    const device = this.#devices.current;
    if (device === "pad") {
      const pads = this.#pads();
      for (let i = 0; i < pads.length; i++) {
        const actuator = pads[i]?.connected ? pads[i]!.vibrationActuator : null;
        if (!actuator?.playEffect) continue;
        const e = this.#effect;
        e.duration = ms;
        e.strongMagnitude = strong * this.#level;
        e.weakMagnitude = weak * this.#level;
        void actuator.playEffect("dual-rumble", e).catch(() => {});
        // A new effect cuts the one playing short, so the second knock waits for its turn.
        if (again !== undefined) {
          this.#again = { strong, weak, ms };
          setTimeout(this.#playAgain, again);
        }
        return;
      }
    } else if (device === "touch" && this.#vibrate) {
      // A phone's motor has one strength: a weak feel is a shorter buzz.
      const buzz = Math.max(8, Math.round(ms * Math.min(1, 0.4 + Math.max(strong, weak)) * this.#level));
      if (again === undefined) this.#vibrate(buzz);
      else {
        this.#twice[0] = buzz;
        this.#twice[1] = Math.max(0, again - buzz);
        this.#twice[2] = buzz;
        this.#vibrate(this.#twice);
      }
    }
  }
}
