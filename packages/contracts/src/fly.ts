// How the game poses the fly. The model (packages/fly) knows how a fly moves
// its legs, wings and mouthparts; the game says what the fly is doing.

import type { Object3D, Vector3 } from "three";

export type FlyPose = {
  /** Speed over the ground in body lengths per second: positive forwards, negative backwards. */
  speed: number;
  /** Turning in radians per second, positive toward its left (counter-clockwise seen from above). */
  turn: number;
  /** Off the ground: legs tucked, wings beating. */
  airborne: boolean;
  /** 0 to 1: how hard the wings beat. On the ground, anything above 0 opens and buzzes them. */
  wings: number;
  /** 0 to 1: grooming, rubbing its head and antennae with its front legs. */
  groom: number;
  /** 0 to 1: feeding, with the proboscis extended to what is under its head. */
  feed: number;
  /** 0 to 1: crouched and tense, as before a take-off or when startled. */
  crouch: number;
  /** In the air: nose-up pitch and roll toward its right, in radians. */
  pitch: number;
  roll: number;
  /**
   * -1 to 1: singing its courtship song, one wing held out to the side and
   * vibrating; its left wing when positive, its right when negative.
   */
  sing: number;
  /** 0 to 1: how full its crop is, 0 empty to 1 a full meal; the abdomen swells with it. Left out, 0. */
  fullness?: number;
  /** 0 to 1: asleep, still and settled lower on its legs, with no glances or fidgets. Left out, awake. */
  sleep?: number;
};

export const RESTING_POSE: FlyPose = { speed: 0, turn: 0, airborne: false, wings: 0, groom: 0, feed: 0, crouch: 0, pitch: 0, roll: 0, sing: 0, fullness: 0, sleep: 0 };

/** Points on the fly the game needs: for food, cameras, effects and the eyes' view. */
export type FlyAnchor = "mouth" | "head" | "leftEye" | "rightEye" | "back";

/**
 * The fly's nervous system, drawn inside its body: the game says how brightly
 * each part glows and how far the body has turned to glass to show it.
 */
export interface FlyNerves {
  /** Its parts, in the order of `glow`: sensory neurons, central ones, or motor and neurosecretory ones. */
  readonly parts: readonly { readonly id: string; readonly role: "sensory" | "central" | "motor" }[];
  /** How brightly each part glows, 0 to 1, a float a part (padded past the last). The game fills it in place. */
  readonly glow: Float32Array;
  /** 0, the ordinary fly, to 1: its cuticle a glassy shell with the nervous system glowing inside (the X-ray). */
  xray: number;
}

/**
 * The fly's body. In `object`'s own space the fly stands on the plane y = 0
 * with its feet on it, faces +z, has +x on its LEFT (so the space is
 * right-handed with y up), and is 1 unit long from the front of its head to
 * the tip of its abdomen, centred on the origin. The game moves, turns and
 * scales `object`; the model animates everything inside it.
 *
 * Two things the game must hold to. On the ground it moves `object` by exactly
 * the pose's `speed` and `turn`, or the feet slide. And in the air it leaves
 * pitch and roll to the model: it passes them in the pose and does not also
 * rotate `object` by them.
 */
export interface FlyModel {
  readonly object: Object3D;
  /** Advances the animation by `dt` seconds toward this pose. */
  update(pose: FlyPose, dt: number): void;
  /** Where a point on the fly is now, in world space. */
  anchor(name: FlyAnchor, out: Vector3): Vector3;
  readonly nerves: FlyNerves;
  dispose(): void;
}
