// What the body makes of the brain's commands: thresholds, smoothing and
// hysteresis. This decides nothing by itself: every
// action starts with a command read from the fly's own neurons.

import type { BrainCommand } from "@fly/brain";

/** Older commands are treated as absent: the brain has fallen behind or stopped. */
export const COMMAND_STALE_MS = 500;
/** How quickly (1/s) the smoothed command follows the brain; it arrives at uneven intervals. */
export const COMMAND_SMOOTHING = 12;
/** Starts walking above WALK_ON and stops below WALK_OFF. */
export const WALK_ON = 0.3;
export const WALK_OFF = 0.15;
/** Walking speed, mm/s, scaled from WALK_SLOWEST at no drive to WALK_FASTEST at full drive. A fruit fly walks at 5 to 20 mm/s. */
export const WALK_SPEED = 10;
export const WALK_SLOWEST = 0.5;
export const WALK_FASTEST = 1.6;
/** Backs up when `back` passes BACK_ON and beats `walk` by BACK_MARGIN; stops below BACK_OFF or once `walk` catches up. */
export const BACK_ON = 0.3;
export const BACK_OFF = 0.15;
export const BACK_MARGIN = 0.15;
/** Backing speed, as a share of WALK_SPEED. */
export const BACK_SPEED = 0.6;
/**
 * Yaw rate (rad/s) at full `turn`. Standing still it turns at
 * STANDING_TURN of that: DNa02 steers a walking fly, and a standing one turns
 * on the spot only slowly.
 *
 * Both are chosen, as is the turn's share of COMMAND_SMOOTHING. The paired
 * DNa02 recordings of walking flies (Rayshubskiy et al. 2025, eLife 13:
 * RP102230) put the walking gain at 6.4 ± 1.5 °/s per Hz of right-minus-left
 * rate, about 110 ms later, against 4.3 here; but read through the brain's
 * rate readout they predict a held-out fly's turning too poorly to take its
 * place (docs/ethogram/steering.md, packages/body/scripts/steering.ts).
 */
export const TURN_RATE = 3;
export const STANDING_TURN = 0.35;
/** In the air, at full `turn`. */
export const AIR_TURN_RATE = 5;
/**
 * Takes off when `escape` rises past ESCAPE_ON; it has to fall below ESCAPE_REARM first to go again.
 *
 * ESCAPE_ON is where the giant fiber (DNp01, read at 200 Hz) counts as having
 * fired: 0.4, 80 Hz. The giant fiber is the fly's high-threshold escape
 * pathway, silent in ordinary life and firing for a fast, close loom (von Reyn
 * et al. 2014), so the line sits just above what DNp01 does otherwise. Measured:
 * at most 0.25 in 10 minutes at rest and under 0.3 under every other sense
 * (packages/brain/README.md), and 0.30 at most in two minutes of the game at
 * midday with the eyes open. A real loom seen through the eyes reaches 0.49 to
 * 0.87 for a dark disc (the README's battery) and 0.34 to 0.72 for the Swoop
 * tool's ball, which at 0.5 set the fly off in about half its throws at midday
 * and almost never at dusk; the hand-wired looming pulse, 1. 200 Hz for 1 is
 * the hand-wired pulse's full drive of every looming detector at once, which no
 * picture reaches.
 *
 * Which way it jumps is the brain's too: forward or backward along its
 * heading by the sign of `lean`, DNp11 (forward) minus DNp02 (backward), which
 * a loom drives by where it is (Dombrovski et al. 2023; packages/brain/README.md,
 * Which way it jumps). They carry front against behind, not left against
 * right, so it never jumps sideways.
 */
export const ESCAPE_ON = 0.4;
export const ESCAPE_REARM = 0.3;
/** Seconds after a take-off before another. */
export const ESCAPE_REFRACTORY = 1.5;
/**
 * The tarsal reflex: flight once the feet lose the ground. A body reflex
 * standing in for circuitry the model doesn't have, not the brain's choice.
 *
 * In a fly, losing contact with the ground under the feet starts the wings
 * beating and keeps them going until the feet touch something again (Fraenkel
 * 1932; a fly held by its back in the air flies for as long as its feet find
 * nothing to hold). The model has nothing that does it: leaving the ground
 * silences the legs' 13 load sensors (`grounded`) and, in a fly that was
 * walking, its legs' chordotonal and hair plate neurons (`legsLeft`,
 * `legsRight`), which changes nothing measurable (packages/brain/README.md,
 * The legs' proprioceptors), and the wings' own strain sensors (`wingbeat`,
 * FlyBody.wingbeat) feed each stroke back to the flight power motor neurons
 * too weakly to keep them going (at full power they give `wings` about 0.3).
 * After an escape seen through the eyes `wings` peaks at 0.3 to 0.5, below the
 * 0.6 that holds the fly up, and falls away (packages/brain/README.md). So the
 * body keeps a floor under the wings' drive while it is off its feet:
 *
 * - A take-off goes straight into it: the giant fiber drives the jump muscle
 *   (TTM) and, through the PSI, the wings' power muscles, so the first
 *   downstroke comes with the jump (von Reyn et al. 2014). Off its feet any
 *   other way (walking off a ledge), it starts TARSAL_ONSET after the feet
 *   leave, a stand-in for the time the flight motor takes to come up to
 *   power: a step down of a few millimetres is over before then.
 * - For FLIGHT_HOLD it holds FLIGHT_WINGS, a little over what holds the fly
 *   up, so it flies on, level or climbing a little, at about 0.28 m/s: a
 *   fruit fly cruises at about 0.3 m/s and can reach about 1 m/s (David 1978).
 * - Then it eases over FLIGHT_FADE to LAND_WINGS, short of holding it up, and
 *   the fly glides down at about 0.14 m/s until its feet touch: touching
 *   down ends the reflex, as tarsal contact does in the fly.
 *
 * What a real fly does with an escape flight, how long it stays up and where
 * it chooses to land, is decided in circuits the model doesn't reproduce
 * well enough to read (no landing command is read from it), so how long the
 * floor holds is the stand-in's: a short escape flight of a couple of
 * seconds, a few hundred millimetres. The brain still has the rest: whether
 * it takes off at all (the giant fiber), its own wing drive, which raises the
 * floor whenever it is higher (a fly kept looming at keeps flying hard), and
 * its steering in the air (`turn`).
 *
 * The wings' sensors feel the strokes the floor makes, so the brain's own
 * `wings` rises in the air (0.19 to 0.23 on average in a swoop's flight,
 * against 0.07 to 0.14 without them), but never to the floor: without it a
 * take-off is the same hop either way (README, Flight). The floor stays.
 */
export const TARSAL_ONSET = 0.05;
export const FLIGHT_WINGS = 0.62;
export const FLIGHT_HOLD = 0.7;
export const FLIGHT_FADE = 0.4;
export const LAND_WINGS = 0.54;
/** Wings and grooming below this are the brain idling, not an action: the pose gets nothing, and what's above is stretched back over 0 to 1. */
export const POSE_FLOOR = 0.2;
/**
 * A grooming bout outlasts the command that started it, fading over about
 * this long (s) once the fly is on its feet: the brain's grooming neurons fire
 * while the wind blows and fall silent as soon as it drops, where a fly cleans
 * up afterwards.
 */
export const GROOM_LINGER = 1.5;
/** Feeds when `feed` passes FEED_ON with food in reach, until it falls below FEED_OFF. */
export const FEED_ON = 0.15;
export const FEED_OFF = 0.05;
/**
 * Sings, on its feet, when `sing` passes SING_ON, until it falls below SING_OFF.
 *
 * `sing` is pIP10, the song command neuron (read at 40 Hz). Measured at rest
 * (10 minutes, seeds 1 to 3, packages/brain/README.md) it peaks at 0.08, and
 * has reached 0.16: two spikes of the pair within its smoothing, and nothing
 * a fly alone does drives it further. SING_ON is two and a half times that,
 * so a lone fly never sings; P1, the courtship neurons that drive pIP10, take
 * it to 1.
 */
export const SING_ON = 0.4;
export const SING_OFF = 0.2;

const posed = (value: number) => Math.max(0, (value - POSE_FLOOR) / (1 - POSE_FLOOR));
const clamp = (value: number, min: number, max: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0);
export const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** What the body is asked to do this frame. */
export type Intent = {
  /** There is a fresh command. Without one the fly does nothing at all. */
  live: boolean;
  /** Ground speed along its heading, mm/s: positive forwards, negative backwards. */
  speed: number;
  walking: boolean;
  backing: boolean;
  /** rad/s, positive toward the fly's left (counter-clockwise seen from above). On the ground. */
  yawRate: number;
  /** The same in the air. */
  airYawRate: number;
  /** A take-off this frame, with its strength 0 to 1; null otherwise. */
  takeOff: number | null;
  /** Which way along its heading a take-off goes: 1 forward, -1 backward (the brain's `lean`, see ESCAPE_ON). */
  takeOffAhead: 1 | -1;
  /** The flight muscles' drive, 0 to 1, for the wings' force in the air: the brain's, or the tarsal reflex's floor where that is higher. */
  wings: number;
  /** The floor the tarsal reflex (TARSAL_ONSET) keeps under `wings` now: 0 on its feet. */
  reflex: number;
  /** For the pose: how far the wings open and beat. */
  wingPose: number;
  /** For the pose: grooming, 0 to 1, shown only while it stands. */
  groom: number;
  /** It wants to feed (with food in reach, the body eats). */
  feeding: boolean;
  /** The smoothed `feed`: how eagerly. */
  feed: number;
  /** The raw latest `escape`, for display. */
  escape: number;
  /** Singing its courtship song: one wing out and vibrating. */
  singing: boolean;
  /** The smoothed `sing`: how hard. */
  sing: number;
};

export const createIntent = (): Intent => ({
  live: false,
  speed: 0,
  walking: false,
  backing: false,
  yawRate: 0,
  airYawRate: 0,
  takeOff: null,
  takeOffAhead: 1,
  wings: 0,
  reflex: 0,
  wingPose: 0,
  groom: 0,
  feeding: false,
  feed: 0,
  escape: 0,
  singing: false,
  sing: 0,
});

type Channel = "walk" | "turn" | "back" | "wings" | "groom" | "feed" | "sing";
const CHANNELS: readonly Channel[] = ["walk", "turn", "back", "wings", "groom", "feed", "sing"];

/** Turns the brain's latest command into what the body is asked to do. Allocates nothing per frame. */
export class Behavior {
  readonly intent = createIntent();
  #smoothed: Record<Channel, number> = { walk: 0, turn: 0, back: 0, wings: 0, groom: 0, feed: 0, sing: 0 };
  #fresh = false;
  #grooming = 0;
  #armed = false;
  #refractory = 0;
  #aloft = 0;

  /**
   * `command` is the latest from the brain (null if none), `ageMs` how old it
   * is, `onFeet` whether the fly stands, `dt` seconds since the last call.
   */
  update(command: BrainCommand | null, ageMs: number, onFeet: boolean, dt: number): Intent {
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const out = this.intent;
    this.#refractory = Math.max(0, this.#refractory - step);
    this.#aloft = onFeet ? 0 : this.#aloft + step;
    out.takeOff = null;
    if (!command || !(ageMs <= COMMAND_STALE_MS)) {
      this.#fresh = false;
      this.#grooming = 0;
      this.#armed = false;
      for (const channel of CHANNELS) this.#smoothed[channel] = 0;
      Object.assign(out, createIntent());
      return out;
    }
    const s = this.#smoothed;
    const k = this.#fresh ? ease(COMMAND_SMOOTHING, step) : 1;
    this.#fresh = true;
    s.walk += (clamp(command.walk, 0, 1) - s.walk) * k;
    s.turn += (clamp(command.turn, -1, 1) - s.turn) * k;
    s.back += (clamp(command.back, 0, 1) - s.back) * k;
    s.wings += (clamp(command.wings, 0, 1) - s.wings) * k;
    s.groom += (clamp(command.groom, 0, 1) - s.groom) * k;
    s.feed += (clamp(command.feed, 0, 1) - s.feed) * k;
    s.sing += (clamp(command.sing, 0, 1) - s.sing) * k;

    out.live = true;
    out.walking = out.walking ? s.walk >= WALK_OFF : s.walk > WALK_ON;
    out.backing = out.backing ? s.back >= BACK_OFF && s.back >= s.walk : s.back > BACK_ON && s.back > s.walk + BACK_MARGIN;
    out.feeding = out.feeding ? s.feed >= FEED_OFF : s.feed > FEED_ON;
    out.feed = s.feed;
    // Males sing standing or walking, not in the air.
    out.singing = onFeet && (out.singing ? s.sing >= SING_OFF : s.sing > SING_ON);
    out.sing = s.sing;
    out.speed = out.backing
      ? -WALK_SPEED * BACK_SPEED
      : out.walking
        ? WALK_SPEED * (WALK_SLOWEST + (WALK_FASTEST - WALK_SLOWEST) * s.walk)
        : 0;
    // turn is positive toward the fly's right; yaw is positive toward its left.
    out.yawRate = -s.turn * TURN_RATE * (out.walking || out.backing ? 1 : STANDING_TURN);
    out.airYawRate = -s.turn * AIR_TURN_RATE;
    // The tarsal reflex: a floor under the wings' drive while its feet are off the ground (see TARSAL_ONSET).
    const flying = this.#aloft - TARSAL_ONSET;
    const held = flying <= FLIGHT_HOLD ? 1 : Math.max(0, 1 - (flying - FLIGHT_HOLD) / FLIGHT_FADE);
    out.reflex = onFeet || flying < 0 ? 0 : LAND_WINGS + (FLIGHT_WINGS - LAND_WINGS) * held;
    out.wings = Math.max(s.wings, out.reflex);
    out.wingPose = posed(out.wings);

    const asked = posed(s.groom);
    if (asked >= this.#grooming) this.#grooming = asked;
    else if (onFeet) this.#grooming += (asked - this.#grooming) * ease(3 / GROOM_LINGER, step);
    if (this.#grooming < 0.01) this.#grooming = 0;
    out.groom = this.#grooming;

    // Escape is a brief burst from the giant fiber, so it's read unsmoothed.
    const escape = clamp(command.escape, 0, 1);
    out.escape = escape;
    if (escape < ESCAPE_REARM) this.#armed = true;
    if (onFeet && this.#armed && this.#refractory <= 0 && escape >= ESCAPE_ON) {
      this.#armed = false;
      this.#refractory = ESCAPE_REFRACTORY;
      out.takeOff = clamp((escape - ESCAPE_ON) / (1 - ESCAPE_ON), 0, 1);
      // Backward only when DNp02 outweighs DNp11; a fly whose posture hasn't shifted jumps forward.
      out.takeOffAhead = command.lean < 0 ? -1 : 1;
      // Into flight with the jump (see TARSAL_ONSET).
      this.#aloft = TARSAL_ONSET;
    }
    return out;
  }
}
