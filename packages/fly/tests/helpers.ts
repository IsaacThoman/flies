// What the tests share: poses, and the game's side of walking (moving the
// fly over the ground exactly as the pose says it moves).

import { RESTING_POSE } from "@fly/contracts";
import type { FlyPose } from "@fly/contracts";

export const pose = (values: Partial<FlyPose> = {}): FlyPose => ({ ...RESTING_POSE, ...values });

/** The fly's place on the ground, advanced the way a game would. */
export class Walker {
  x = 0;
  z = 0;
  heading = 0;

  advance(speed: number, turn: number, dt: number): void {
    this.heading += turn * dt;
    this.x += Math.sin(this.heading) * speed * dt;
    this.z += Math.cos(this.heading) * speed * dt;
  }

  /** A point in the fly's space, in world space. */
  toWorld(px: number, pz: number): [number, number] {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return [this.x + px * c + pz * s, this.z - px * s + pz * c];
  }
}
