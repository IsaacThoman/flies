// The restaurant's one going-on: the ventilation. Now and then, while nobody
// is at the remote, it comes on for a minute or so and the air under the
// ceiling's diffusers stirs: a slow draught falling from each and spreading
// as it falls, felt where it is (Felt.air) and nowhere else. It is a field
// fixed to the room, the same whoever is in it: not aimed at the fly, not
// timed to it. When it runs is its clock's (@fly/world), at a table the
// room's.

import { DINING_ROOM, VentilationClock } from "@fly/world";
import { random } from "../../scene/build.ts";
import type { Vec3 } from "@fly/world";
import type { Around, Felt } from "../types.ts";

/** The diffusers in the ceiling: one over the window's tables, one over the middle of the room, one by the bar. */
export const DIFFUSERS: readonly { x: number; z: number }[] = [
  { x: -1050, z: 1900 },
  { x: 900, z: -500 },
  { x: -2000, z: -1600 },
];
/** Its throw straight under a diffuser, a metre and a half down (mm/s), and how wide it spreads there (mm). */
const THROW = 180;
const SPREAD = 450;
/** Seconds it takes to come up to speed and to die away. */
const RAMP = 8;

export class Ventilation {
  readonly #next = random(71).next;
  readonly #clock = new VentilationClock(this.#next);
  /** How hard it blows now, 0 to 1. */
  #on = 0;
  #time = 0;

  /** At a table, the room says a run starts now: as long as `random` says, alike on every device. */
  run(random: () => number) {
    this.#clock.start(random);
  }

  /** Moves it on, and adds the draught where the fly is to what it feels. At a table only the room starts it. */
  step(dt: number, around: Around) {
    this.#time += dt;
    if (this.#clock.tick(dt, around.quiet) && !around.shared) this.#clock.start(this.#next);
    this.#on += ((this.#clock.left > 0 ? 1 : 0) - this.#on) * Math.min(1, dt / RAMP);
    this.feel(around.fly, around.felt);
  }

  /** Adds the draught at `fly` to what it feels, as it blows now. */
  feel(fly: Readonly<Vec3>, felt: Felt) {
    if (this.#on < 0.01) return;
    const drop = Math.max(200, DINING_ROOM.height - fly.y);
    // Falling, it spreads and slows; it eddies a little.
    const spread = SPREAD * (0.4 + drop / 2500);
    const speed = THROW * this.#on * (SPREAD / spread) * (0.85 + 0.15 * Math.sin(this.#time * 1.3) * Math.sin(this.#time * 0.47 + 1));
    for (const d of DIFFUSERS) {
      const dx = fly.x - d.x;
      const dz = fly.z - d.z;
      const r = Math.hypot(dx, dz);
      const k = speed * Math.exp(-(r * r) / (2 * spread * spread));
      if (k < 0.5) continue;
      // Down under the diffuser, turning outward toward its edge.
      const out = Math.min(1.5, r / spread);
      felt.air.x += r > 1 ? (dx / r) * out * k * 0.7 : 0;
      felt.air.z += r > 1 ? (dz / r) * out * k * 0.7 : 0;
      felt.air.y -= k * (1 - Math.min(1, out) * 0.6);
    }
  }
}
