// The restaurant's one going-on: the ventilation. Now and then, while nobody
// is at the remote, it comes on for a minute or so and the air under the
// ceiling's diffusers stirs: a slow draught falling from each and spreading
// as it falls, felt where it is (Felt.air) and nowhere else. It is a field
// fixed to the room, the same whoever is in it: not aimed at the fly, not
// timed to it.

import { DINING_ROOM } from "@fly/world";
import { random } from "../../scene/build.ts";
import type { Around } from "../types.ts";

/** The diffusers in the ceiling: one over the window's tables, one over the middle of the room, one by the bar. */
export const DIFFUSERS: readonly { x: number; z: number }[] = [
  { x: -1050, z: 1900 },
  { x: 900, z: -500 },
  { x: -2000, z: -1600 },
];
/** Its throw straight under a diffuser, a metre and a half down (mm/s), and how wide it spreads there (mm). */
const THROW = 180;
const SPREAD = 450;
/** Seconds it runs, at the least and the most, and minutes between runs. */
const RUN = [50, 110] as const;
const REST = [4, 9] as const;
/** Seconds of quiet before it first comes on, and how long it takes to come up to speed and to die away. */
const FIRST = 40;
const RAMP = 8;

export class Ventilation {
  #rnd = random(71);
  #quiet = 0;
  #wait = FIRST;
  /** Seconds left of this run (0: off), and how hard it blows now, 0 to 1. */
  #left = 0;
  #on = 0;
  #time = 0;

  /** Moves it on, and adds the draught where the fly is to what it feels. */
  step(dt: number, around: Around) {
    this.#time += dt;
    if (around.quiet) this.#quiet += dt;
    else this.#quiet = 0;
    if (this.#left > 0) this.#left = Math.max(0, this.#left - dt);
    else if (this.#quiet > FIRST) {
      this.#wait -= dt;
      if (this.#wait <= 0) {
        this.#left = this.#rnd.range(RUN[0], RUN[1]);
        this.#wait = this.#rnd.range(REST[0], REST[1]) * 60;
      }
    }
    this.#on += ((this.#left > 0 ? 1 : 0) - this.#on) * Math.min(1, dt / RAMP);
    if (this.#on < 0.01) return;
    const { fly, felt } = around;
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
