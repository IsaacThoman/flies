// The fly's life, frame by frame: what its body feels goes to the brain, what
// the brain answers moves the body, and food it eats goes down. No drawing
// here, so a whole life can run in a test.

import type { BrainSenses } from "@fly/brain";
import type { BrainDriver } from "@fly/contracts";
import { Behavior, Crowd, FlyBody, Hunger, SenseTracker } from "@fly/body";
import type { Forces, Intent, Looming, Rhythm } from "@fly/body";
import { Pantry } from "@fly/world";
import type { Food, Place, Vec3, World } from "@fly/world";

/** What the fly is doing, in a word, for the screen and for tests. */
export type Activity = "resting" | "sleeping" | "walking" | "backing" | "turning" | "grooming" | "feeding" | "tasting" | "singing" | "flying" | "falling" | "waiting";

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
  /** The food it can find: its own place's, or a table's shared with others (`share`). */
  pantry: Pantry;
  readonly body: FlyBody;
  readonly behavior = new Behavior();
  readonly senses = new SenseTracker();
  /** How hungry it is and how full its crop, from what it has eaten: the brain is sent the hunger. */
  readonly hunger = new Hunger();
  /** Its brain; a companion's that failed is replaced by a new one (company.ts). */
  brain: BrainDriver;
  /** Other flies (at a table with others, and the others this device lives): bodies it can't walk through, which its antennae and its body feel. */
  readonly crowd: Crowd;
  readonly stimuli: Stimuli = { looming: [], stroke: 0, air: { x: 0, y: 0, z: 0 }, threat: null };
  /**
   * Its daily clock and need for sleep, told to the brain with the senses, or
   * null for a fly with neither (the brain as it was before them; tests, unless
   * they give it one). The game gives it one set to the real time of day.
   */
  rhythm: Rhythm | null = null;
  /** The eyes' picture for this frame, when the brain has eyes and they're open. Set by the eyes before `step`. */
  light: { left: Float32Array; right: Float32Array } | null = null;
  /** The wing it sings with: 1 its left, -1 its right, toward the nearest other fly where there is one. */
  songSide: 1 | -1 = 1;
  /** What it last ate, and how much in total (for the screen and tests). */
  eaten = 0;
  meals = 0;
  takeOffs = 0;
  /** How far its legs have carried it, mm, and seconds spent flying and grooming: all only ever counted up, as they happen. */
  walked = 0;
  flown = 0;
  groomed = 0;
  /** Seconds of fly time lived. */
  time = 0;
  activity: Activity = "waiting";
  /** Eating this frame. */
  eating = false;
  /**
   * Whether its steps move the pantry on (patches filling again): a pantry
   * shared by several flies this device lives is moved on once a frame, by
   * the one that owns it.
   */
  tendsPantry = true;
  #forces: Forces = { air: { x: 0, y: 0, z: 0 }, threat: null, meal: null };
  #wasEating = false;
  #sugar = 0;
  #proboscis = 0;
  readonly #sent: BrainSenses = { loomLeft: 0, loomRight: 0, touch: 0, bumpLeft: 0, bumpRight: 0, wind: 0, sweet: 0, grounded: true, maleTaste: 0, wingbeat: 0 };

  constructor(world: World, brain: BrainDriver) {
    this.world = world;
    this.brain = brain;
    this.pantry = new Pantry(world, world.place.patches);
    this.body = new FlyBody(world, world.place.start);
    this.crowd = new Crowd(world);
  }

  /** Food accepted by the pantry, now or in a room acknowledgement. */
  feed(amount: number, sugar: number) {
    this.eaten += amount;
    this.#sugar += sugar;
  }

  /** It eats from another pantry from now on: a table's, shared with others, or its own again. */
  share(pantry: Pantry) {
    this.pantry = pantry;
    this.eating = false;
    this.#wasEating = false;
  }

  /**
   * Carries the fly to another place: the world becomes that place, its food
   * is set out, and the fly stands where the place starts it. The brain is
   * the same brain, running on.
   */
  move(place: Place) {
    this.world.load(place);
    this.pantry.reset(place.patches);
    this.setDown(place.start.x, place.start.z, place.start.yaw, place.start.y);
  }

  /** Stands it at (x, z) facing `yaw`, on the surface at or below `y` (the highest, if left out), in the world as it is. */
  setDown(x: number, z: number, yaw: number, y?: number) {
    this.body.place(x, z, yaw, y);
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
      // Another fly pushing against it is felt as anything touching it is.
      stroke: Math.max(stimuli.stroke, this.crowd.touch),
      air: stimuli.air,
      eyesOpen,
      proboscis: this.#proboscis,
      bodies: this.crowd,
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
    sent.maleTaste = felt.maleTaste;
    sent.hunger = this.hunger.level;
    sent.wingbeat = felt.wingbeat;
    if (this.light) sent.light = this.light;
    else delete sent.light;
    const rhythm = this.rhythm;
    if (rhythm) {
      sent.clockMorning = rhythm.clock.morning;
      sent.clockEvening = rhythm.clock.evening;
      sent.clockSleep = rhythm.clock.sleep;
      sent.sleepPressure = rhythm.felt;
      sent.sleepDepth = rhythm.depth;
    } else {
      delete sent.clockMorning;
      delete sent.clockEvening;
      delete sent.clockSleep;
      delete sent.sleepPressure;
      delete sent.sleepDepth;
    }
    brain.tick(dt * 1000, sent);

    const intent = this.behavior.update(brain.state?.command ?? null, now - brain.stateAt, body.onFeet, dt);
    const food: Food | null = this.senses.tasting.food;
    const forces = this.#forces;
    forces.air = stimuli.air;
    forces.threat = stimuli.threat;
    forces.meal = intent.feeding && food && food.sweet > 0 ? food : null;
    const { x, y, z } = body.position;
    const wasOnFeet = body.onFeet;
    body.step(intent, forces, dt);
    this.crowd.resolve(body, dt);
    if (body.events.jumped) this.takeOffs++;
    // A courting male extends the wing nearer the one he courts.
    if (intent.singing) this.songSide = this.crowd.sideOf(body) || this.songSide;
    // On its feet before and after: a take-off's leap and a landing aren't walking.
    if (wasOnFeet && body.onFeet) this.walked += Math.hypot(body.position.x - x, body.position.y - y, body.position.z - z);

    // Eating: the brain wants to feed, and its mouthparts are on something sweet.
    this.eating = false;

    if (intent.feeding && food && food.sweet > 0 && body.onFeet && this.senses.tasting.byMouth) {
      const bite = this.pantry.eat(food, intent.feed, dt);
      this.feed(bite, bite * food.sweet);
      this.eating = true;
    }
    this.hunger.step(dt, this.#sugar);
    this.#sugar = 0;
    if (this.eating && !this.#wasEating) this.meals++;
    this.#wasEating = this.eating;
    this.#proboscis += ((intent.feeding ? 1 : 0) - this.#proboscis) * Math.min(1, dt * 6);
    if (this.tendsPantry) this.pantry.update(dt);
    this.activity = this.#describe(intent, felt.sweet);
    // Still is resting, or standing on food without eating it; anything else is moving. What it does is the brain's: this only watches.
    if (rhythm) {
      rhythm.step(dt, this.activity !== "resting" && this.activity !== "tasting");
      if (rhythm.asleep && this.activity === "resting") this.activity = "sleeping";
    }
    if (this.activity === "flying") this.flown += dt;
    else if (this.activity === "grooming") this.groomed += dt;
  }

  #describe(intent: Intent, sweet: number): Activity {
    if (!intent.live) return "waiting";
    const body = this.body;
    if (body.mode === "airborne") return intent.wings > 0.15 ? "flying" : "falling";
    if (this.eating) return "feeding";
    if (intent.backing) return "backing";
    if (intent.singing) return "singing";
    if (intent.walking) return "walking";
    if (intent.groom > 0.05) return "grooming";
    if (sweet > 0) return "tasting";
    if (Math.abs(body.turnRate) > 0.3) return "turning";
    return "resting";
  }
}
