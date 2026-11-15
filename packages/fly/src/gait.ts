// Where the six feet are on the ground. The fly walks with the alternating
// tripod: front and hind legs of one side step together with the middle leg
// of the other (L1 R2 L3, then R1 L2 R3), with a small metachronal lag that
// lifts the hind leg of each tripod a moment before the front one.
//
// Feet live in the model's own space (the ground under the fly). A planted
// foot is carried backwards by exactly the motion the pose says the body
// makes, so as long as the game moves the fly at `speed` and `turn` the feet
// stay put on the ground. A global phase, advancing at the step frequency,
// only decides when each leg lifts; a swing then runs on its own clock to a
// landing point chosen so that the stance which follows is centred on the
// leg's home. Nothing jumps when the speed changes mid-step.

import { LEG_COUNT, LEGS, legPair } from "./anatomy.ts";

/** Phase offset of each leg (L1 R1 L2 R2 L3 R3) within the step cycle. */
const OFFSET = [0, 0.5, 0.5, 0, 0.04, 0.54].map((o, leg) => o - (legPair(leg) === 0 ? 0.04 : 0));
/** Radius at which turning counts as walking, for the step frequency. */
const TURN_RADIUS = 0.35;
const MOVING = 0.02;
const SETTLE = 0.012;

/** Stride length in body lengths for a body speed in body lengths per second. */
export const strideLength = (speed: number) => Math.min(0.5, 0.22 + 0.045 * speed);
/** Swing duration for a step period: insects keep the swing short and vary the stance. */
export const swingDuration = (period: number) => Math.min(0.1, Math.max(0.03, 0.4 * period));

export class Gait {
  /** Foot (claw) positions, x y z per leg, in the model's space. */
  readonly feet = new Float64Array(LEG_COUNT * 3);
  /** 0 while a foot is planted, rising to 1 at the top of its swing. */
  readonly lifted = new Float64Array(LEG_COUNT);
  readonly swinging = new Uint8Array(LEG_COUNT);
  phase = 0;
  /** Steps taken by each leg since the start: for tests and the viewer. */
  readonly steps = new Uint32Array(LEG_COUNT);
  private readonly from = new Float64Array(LEG_COUNT * 3);
  private readonly elapsed = new Float64Array(LEG_COUNT);
  private readonly duration = new Float64Array(LEG_COUNT);
  private sinceLift = 0;

  constructor(home: Float64Array) {
    this.reset(home);
  }

  /** Plants every foot at home: on landing, and at the start. */
  reset(home: Float64Array): void {
    this.feet.set(home);
    this.lifted.fill(0);
    this.swinging.fill(0);
  }

  update(speed: number, turn: number, dt: number, home: Float64Array): void {
    const feet = this.feet;
    const effective = Math.sqrt(speed * speed + turn * TURN_RADIUS * turn * TURN_RADIUS);
    const moving = effective > MOVING;
    const frequency = moving ? effective / strideLength(effective) : 0;
    const period = moving ? 1 / frequency : 0.3;
    const swing = moving ? swingDuration(period) : 0.09;
    const stanceHalf = moving ? (period - swing) / 2 : 0;
    const oldPhase = this.phase;
    this.phase = (this.phase + frequency * dt) % 64;
    this.sinceLift += dt;

    // Planted feet ride backwards with the ground.
    const a = turn * dt, c = Math.cos(a), s = Math.sin(a), forward = speed * dt;
    for (let leg = 0; leg < LEG_COUNT; leg++) {
      if (this.swinging[leg]) continue;
      const i = leg * 3, x = feet[i], z = feet[i + 2];
      feet[i] = x * c - z * s;
      feet[i + 2] = x * s + z * c - forward;
      feet[i + 1] = 0;
    }

    for (let leg = 0; leg < LEG_COUNT; leg++) {
      const i = leg * 3;
      const hx = home[i], hz = home[i + 2];
      // Where to land: ahead of home by half the coming stance's travel.
      let tx = hx + turn * hz * stanceHalf;
      let tz = hz + (speed - turn * hx) * stanceHalf;
      // Land no further out than leaves room for the stance that follows.
      const reach = LEGS[legPair(leg)].reach;
      const ox = tx - hx, oz = tz - hz, offset = Math.sqrt(ox * ox + oz * oz), limit = reach * 0.8;
      if (offset > limit) {
        tx = hx + (ox * limit) / offset;
        tz = hz + (oz * limit) / offset;
      }

      if (!this.swinging[leg]) {
        const dx = feet[i] - hx, dz = feet[i + 2] - hz, away = Math.sqrt(dx * dx + dz * dz);
        const due = moving && Math.floor(this.phase + OFFSET[leg]) !== Math.floor(oldPhase + OFFSET[leg]);
        const settle = !moving && away > SETTLE && this.sinceLift > 0.05 && !this.neighbourSwinging(leg);
        // A foot dragged to the edge of its reach lifts whatever the phase.
        if (due || settle || away > reach) this.lift(leg, swing);
        else continue;
      }

      this.elapsed[leg] += dt;
      const t = Math.min(1, this.elapsed[leg] / this.duration[leg]);
      const e = t * t * t * (t * (t * 6 - 15) + 10);
      const fx = this.from[i], fz = this.from[i + 2];
      const dx = tx - fx, dz = tz - fz;
      const height = Math.min(0.07, 0.03 + 0.25 * Math.sqrt(dx * dx + dz * dz));
      const arc = Math.sin(Math.PI * t);
      feet[i] = fx + dx * e;
      feet[i + 1] = this.from[i + 1] * (1 - e) + height * arc;
      feet[i + 2] = fz + dz * e;
      this.lifted[leg] = arc;
      if (t >= 1) {
        this.swinging[leg] = 0;
        this.lifted[leg] = 0;
        feet[i + 1] = 0;
      }
    }
  }

  /** Where leg `leg` is in the step cycle, 0 to 1, with 0 the moment it lifts. */
  legPhase(leg: number): number {
    const p = this.phase + OFFSET[leg];
    return p - Math.floor(p);
  }

  private lift(leg: number, duration: number): void {
    const i = leg * 3;
    this.from[i] = this.feet[i];
    this.from[i + 1] = this.feet[i + 1];
    this.from[i + 2] = this.feet[i + 2];
    this.elapsed[leg] = 0;
    this.duration[leg] = duration;
    this.swinging[leg] = 1;
    this.sinceLift = 0;
    this.steps[leg]++;
  }

  private neighbourSwinging(leg: number): boolean {
    const w = this.swinging;
    return w[leg ^ 1] === 1 || (leg >= 2 && w[leg - 2] === 1) || (leg < 4 && w[leg + 2] === 1);
  }
}
