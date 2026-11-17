// The fly at the wheel. It stands on a ball on the dashboard, the way a fly
// walks on an air-supported ball in a lab, looking out through the windscreen.
// Its brain gets what it sees and what the car's front feels; its walking
// and turning on the ball are read the way the fly game reads them
// (@fly/body's Behavior) and, when the player hands over, drive the car.
//
// The brain decides: speed comes from its walking drive, scaled from body
// lengths to car lengths, and steering from its turning, as far as the
// wheels' lock allows at that speed. Two stand-ins, labelled as such: the car
// brakes for as long as a take-off would keep the fly in the air when its
// giant fiber fires (it can't leap out of a car), and the front corners
// pressed against something are felt as its antennae pushed back.

import type { BrainCommand, BrainSenses } from "@fly/brain";
import { Behavior, ESCAPE_REFRACTORY, FLY_LENGTH } from "@fly/body";
import type { Intent } from "@fly/body";
import { CAR, steerLimit } from "./car.ts";
import type { Contact, Controls } from "./car.ts";

/** How quickly a hit fades from the fly's touch, 1/s: a knock is felt for a moment, not held. */
const TOUCH_FADE = 4;
/** Below this speed (m/s) the steering is worked out as if at it: a turn from a standstill still turns the wheels. */
const CREEP = 2;
/** The car's turning for the fly's: see `Pilot.turnGain`. */
export const TURN_GAIN = 0.2;
/** How firmly the car is held to the fly's speed: throttle or brake per m/s off it. */
const SPEED_GAIN = 0.35;
/**
 * The most it brakes when the fly stands still: the car rolls to a stop over
 * a few seconds instead of halting as a fly does, so that a pause between
 * walking bouts is a slowing, not an emergency stop.
 */
const COAST_BRAKE = 0.12;

export class Pilot {
  readonly behavior = new Behavior();
  /** What went to the brain last. */
  readonly senses: BrainSenses = { loomLeft: 0, loomRight: 0, touch: 0, bumpLeft: 0, bumpRight: 0, wind: 0, sweet: 0, grounded: true, maleTaste: 0, wingbeat: 0 };
  /** What the fly would have the car do, whether or not it has the wheel. */
  readonly controls: Controls = { steer: 0, throttle: 0, brake: 0 };
  /** The speed it walks at, scaled to the car: m/s, negative backing. */
  wanted = 0;
  /** Seconds left of braking after its giant fiber fired. */
  startled = 0;
  /**
   * How the car's turning answers the fly's: 1 turns the car as fast as the
   * fly turns on its ball. A rig's setting, as in a lab's virtual reality for
   * a fly on a ball, where the experimenter chooses how far the world turns
   * for a turn of the ball; the brain still chooses which way and when.
   * At 1 its turning bouts swing the car into the rails or round to face the
   * way it came; at 0.2 it went about half again as far (docs/drive.md).
   */
  turnGain = TURN_GAIN;
  /** Take-offs it would have made: times the giant fiber fired. */
  escapes = 0;
  #touch = 0;

  /** The car's contact this frame and the eyes' latest picture (null with them shut) become the senses for this frame's brain tick. */
  sense(contact: Contact, light: { left: Float32Array; right: Float32Array } | null, dt: number): BrainSenses {
    const senses = this.senses;
    this.#touch = Math.max(contact.impact, this.#touch * Math.exp(-TOUCH_FADE * dt));
    senses.touch = this.#touch;
    senses.bumpLeft = contact.frontLeft ? 1 : 0;
    senses.bumpRight = contact.frontRight ? 1 : 0;
    if (light) senses.light = light;
    else delete senses.light;
    return senses;
  }

  /** The brain's latest command (`ageMs` old) into what the car would do, at the car's `speed` now. */
  update(command: BrainCommand | null, ageMs: number, speed: number, dt: number): Intent {
    const intent = this.behavior.update(command, ageMs, true, dt);
    if (intent.takeOff !== null) {
      this.startled = ESCAPE_REFRACTORY;
      this.escapes++;
    }
    this.startled = Math.max(0, this.startled - dt);
    const controls = this.controls;
    this.wanted = intent.live && this.startled === 0 ? (intent.speed / FLY_LENGTH) * CAR.length : 0;
    const off = this.wanted - speed;
    if (this.startled > 0 || !intent.live) {
      controls.throttle = 0;
      controls.brake = 1;
    } else if (this.wanted === 0) {
      controls.throttle = 0;
      controls.brake = Math.min(COAST_BRAKE, Math.abs(speed) * SPEED_GAIN);
    } else if (Math.sign(off) === Math.sign(this.wanted) || Math.sign(speed) !== Math.sign(this.wanted)) {
      // Speeding up the way it walks (or still rolling the other way: it drives through that).
      controls.throttle = Math.max(-1, Math.min(1, off * SPEED_GAIN));
      controls.brake = Math.sign(speed) !== Math.sign(this.wanted) && Math.abs(speed) > 0.5 ? 1 : 0;
    } else {
      controls.throttle = 0;
      controls.brake = Math.min(1, Math.abs(off) * SPEED_GAIN);
    }
    controls.steer = steering(intent.live ? intent.yawRate * this.turnGain : 0, speed);
    return intent;
  }
}

/** The steering (−1 left to 1 right) that turns the car at `yawRate` (rad/s, positive left) at `speed`, as far as its lock allows. */
export function steering(yawRate: number, speed: number) {
  const v = Math.abs(speed) < CREEP ? (speed < 0 ? -CREEP : CREEP) : speed;
  // The car turns at −(v / wheelbase) tan(wheel), with the wheel positive right.
  const wheel = Math.atan((-yawRate * CAR.wheelbase) / v);
  const limit = steerLimit(Math.abs(speed));
  return Math.max(-1, Math.min(1, wheel / limit));
}
