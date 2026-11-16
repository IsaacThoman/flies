// The fly's life, frame by frame: what its body feels goes to the brain, what
// the brain answers moves the body, and food it eats goes down. No drawing
// here, so a whole life can run in a test.

import type { BrainSenses } from "@fly/brain";
import type { BrainDriver } from "@fly/contracts";
import { Behavior, FlyBody, SenseTracker } from "@fly/body";
import type { Forces, Intent, Looming } from "@fly/body";
import { Pantry } from "@fly/world";
import type { Food, Place, Vec3, World } from "@fly/world";

/** What the fly is doing, in a word, for the screen and for tests. */
export type Activity = "resting" | "walking" | "backing" | "turning" | "grooming" | "feeding" | "tasting" | "flying" | "falling" | "waiting";

export type Stimuli = {
  looming: Looming[];
  /** A feather on it: 0 to 1. */
  stroke: number;
  /** The air's velocity at the fly. */
  air: Vec3;
  /** Where the thing that loomed is, for the direction of a take-off. */
  threat: Vec3 | null;
};

export class Life {
  readonly world: World;
  readonly pantry: Pantry;
  readonly body: FlyBody;
  readonly behavior = new Behavior();
  readonly senses = new SenseTracker();
  readonly brain: BrainDriver;
  readonly stimuli: Stimuli = { looming: [], stroke: 0, air: { x: 0, y: 0, z: 0 }, threat: null };
  /** The eyes' picture for this frame, when the brain has eyes and they're open. Set by the eyes before `step`. */
  light: { left: Float32Array; right: Float32Array } | null = null;
  /** What it last ate, and how much in total (for the screen and tests). */
  eaten = 0;
  meals = 0;
  takeOffs = 0;
  /** Seconds of fly time lived. */
  time = 0;
  activity: Activity = "waiting";
  /** Eating this frame. */
  eating = false;
  #forces: Forces = { air: { x: 0, y: 0, z: 0 }, threat: null, meal: null };
  #wasEating = false;
  #proboscis = 0;
  readonly #sent: BrainSenses = { loomLeft: 0, loomRight: 0, touch: 0, bumpLeft: 0, bumpRight: 0, wind: 0, sweet: 0, grounded: true };

  constructor(world: World, brain: BrainDriver) {
    this.world = world;
    this.brain = brain;
    this.pantry = new Pantry(world, world.place.patches);
    this.body = new FlyBody(world, world.place.start);
  }

  /**
   * Carries the fly to another place: the world becomes that place, its food
   * is set out, and the fly stands where the place starts it. The brain is
   * the same brain, running on.
   */
  move(place: Place) {
    this.world.load(place);
    this.pantry.reset(place.patches);
    this.body.place(place.start.x, place.start.z, place.start.yaw);
    this.eating = false;
    this.#wasEating = false;
  }

  get intent(): Intent {
    return this.behavior.intent;
  }

  /** What went to the brain last. */
  get sensed(): BrainSenses {
    return this.#sent;
  }

  /** One frame: `dt` seconds of fly time, `now` the wall clock (ms) for the command's age. */
  step(dt: number, now: number) {
    if (!(dt > 0)) return;
    this.time += dt;
    const { body, brain, stimuli } = this;
    const eyesOpen = this.light !== null;
    const felt = this.senses.update({
      dt,
      body,
      world: this.world,
      pantry: this.pantry,
      looming: stimuli.looming,
      stroke: stimuli.stroke,
      air: stimuli.air,
      eyesOpen,
      proboscis: this.#proboscis,
    });
    const sent = this.#sent;
    sent.loomLeft = felt.loomLeft;
    sent.loomRight = felt.loomRight;
    sent.touch = felt.touch;
    sent.bumpLeft = felt.bumpLeft;
    sent.bumpRight = felt.bumpRight;
    sent.wind = felt.wind;
    sent.sweet = felt.sweet;
    sent.grounded = felt.grounded;
    if (this.light) sent.light = this.light;
    else delete sent.light;
    brain.tick(dt * 1000, sent);

    const intent = this.behavior.update(brain.state?.command ?? null, now - brain.stateAt, body.onFeet, dt);
    const food: Food | null = this.senses.tasting.food;
    const forces = this.#forces;
    forces.air = stimuli.air;
    forces.threat = stimuli.threat;
    forces.meal = intent.feeding && food && food.sweet > 0 ? food : null;
    body.step(intent, forces, dt);
    if (body.events.jumped) this.takeOffs++;

    // Eating: the brain wants to feed, and its mouthparts are on something sweet.
    this.eating = false;
    if (intent.feeding && food && food.sweet > 0 && body.onFeet && this.senses.tasting.byMouth) {
      this.eaten += this.pantry.eat(food, intent.feed, dt);
      this.eating = true;
    }
    if (this.eating && !this.#wasEating) this.meals++;
    this.#wasEating = this.eating;
    this.#proboscis += ((intent.feeding ? 1 : 0) - this.#proboscis) * Math.min(1, dt * 6);
    this.pantry.update(dt);
    this.activity = this.#describe(intent, felt.sweet);
  }

  #describe(intent: Intent, sweet: number): Activity {
    if (!intent.live) return "waiting";
    const body = this.body;
    if (body.mode === "airborne") return intent.wings > 0.15 ? "flying" : "falling";
    if (this.eating) return "feeding";
    if (intent.backing) return "backing";
    if (intent.walking) return "walking";
    if (intent.groom > 0.05) return "grooming";
    if (sweet > 0) return "tasting";
    if (Math.abs(body.turnRate) > 0.3) return "turning";
    return "resting";
  }
}
