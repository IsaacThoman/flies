// The other flies this device lives, beside the one the player follows
// (Settings → Flies). Each is a whole fly of its own: its own brain (a
// BrainDriver of its own: a worker in a browser, a thread on the Apple TV),
// body and senses, in the same world, off the same food. They meet one
// another and the followed fly as bodies (Life.crowd) and see each other with
// their own eyes (eyes/eyes.ts), as every fly meets and sees another player's
// fly at a table; the player's tools reach them through the world, as they
// reach another player's fly. Nothing else passes between them. The camera,
// the pointer, the pictures in the corners and the stats are the followed
// fly's; these are drawn among the other flies (online/others.ts). A
// companion whose brain fails is given a new one a couple of times, and then
// taken off: a fly with no brain is never left standing as if it lived.

import type { Rhythm } from "@fly/body";
import type { BrainDriver, FlyPose } from "@fly/contracts";
import { RESTING_POSE } from "@fly/contracts";
import type { Pantry, Vec3, World } from "@fly/world";
import { COLOURS, spawnSpot } from "@fly/net";
import type { Spot } from "@fly/net";
import { poseOf } from "./fly-view.ts";
import { Life } from "./life.ts";
import type { Felt } from "./places/types.ts";

export type Companion = {
  readonly life: Life;
  /** How it is posed this frame, for drawing it and for the table. */
  readonly pose: FlyPose;
  /** Its dab of enamel: its fly's colour at a table; alone, the colour of its place in line. */
  colour: string;
  /** Its fly's id at a table, once the table has seated it (0 alone). */
  id: number;
  /** What the place's goings-on do to it this frame, and the air at it. */
  readonly felt: Felt;
  readonly air: Vec3;
  /** New brains it has been given after its brain failed, and when it gets the next (game seconds; -1 until its brain has failed). */
  tries: number;
  retryAt: number;
};

/** A companion whose brain has failed gets a new one after each of these waits, seconds; once they are spent, it is taken off. */
export const COMPANION_RETRIES = [5, 30] as const;

/** Where a device's flies stand when it has them alone, by their place in line: the followed fly where the place starts it, the others round it as a table would set them down. */
export const companionSpot = (world: World, index: number): Spot => spawnSpot(world, index + 2);

export class Company {
  readonly list: Companion[] = [];
  /** Flies taken off because their brains wouldn't run: the device lives that many fewer until the player asks for another count. */
  lost = 0;
  readonly #world: World;
  readonly #newBrain: () => BrainDriver;
  readonly #newRhythm: () => Rhythm | null;

  /** `newRhythm`: each new fly's clock and sleep, as the followed fly's is kept. */
  constructor(world: World, newBrain: () => BrainDriver, newRhythm: () => Rhythm | null = () => null) {
    this.#world = world;
    this.#newBrain = newBrain;
    this.#newRhythm = newRhythm;
  }

  /**
   * Makes it `n` flies: the last go first, their brains stopped; each new one
   * gets a brain of its own (waking, as the first did) and stands where
   * `spot` says (`companionSpot` alone), eating from `pantry`.
   */
  resize(n: number, pantry: Pantry, spot: (index: number) => Spot = (i) => companionSpot(this.#world, i)) {
    while (this.list.length > n) this.list.pop()!.life.brain.dispose();
    while (this.list.length < n) {
      const i = this.list.length;
      const life = new Life(this.#world, this.#newBrain());
      life.share(pantry);
      life.tendsPantry = false;
      life.rhythm = this.#newRhythm();
      const [x, z, yaw, y] = spot(i);
      life.setDown(x, z, yaw, y);
      this.list.push({ life, pose: { ...RESTING_POSE }, colour: COLOURS[(i + 1) % COLOURS.length], id: 0, felt: { air: { x: 0, y: 0, z: 0 }, touch: 0, looming: [] }, air: { x: 0, y: 0, z: 0 }, tries: 0, retryAt: -1 });
    }
  }

  /**
   * Each frame, at game time `time` (s): a companion whose brain has failed
   * (a worker out of memory, a download that failed offline) is given a new
   * one after a wait, as many times as COMPANION_RETRIES says; after that it is
   * taken off, and counted in `lost`. Returns whether any was taken off.
   */
  tend(time: number): boolean {
    let changed = false;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      const brain = c.life.brain;
      if (brain.status !== "failed") continue;
      if (c.retryAt < 0) {
        if (c.tries < COMPANION_RETRIES.length) c.retryAt = time + COMPANION_RETRIES[c.tries];
        else {
          brain.dispose();
          this.list.splice(i, 1);
          this.lost++;
          changed = true;
        }
        continue;
      }
      if (time < c.retryAt) continue;
      brain.dispose();
      c.life.brain = this.#newBrain();
      c.tries++;
      c.retryAt = -1;
    }
    return changed;
  }

  /** Every one eats from this pantry from now on: a table's, or their own again. */
  share(pantry: Pantry) {
    for (const c of this.list) c.life.share(pantry);
  }

  /** Poses each from what it did this frame. */
  pose() {
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      const life = c.life;
      poseOf(life.body, life.intent, life.eating, life.hunger.fullness, life.songSide, life.activity === "sleeping", c.pose);
    }
  }

  dispose() {
    for (const c of this.list) c.life.brain.dispose();
    this.list.length = 0;
  }
}
