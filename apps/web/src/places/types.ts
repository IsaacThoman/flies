// What a place has to provide for the game to show it and the fly to live in
// it. The world (what the fly stands on, bumps into and eats) is exact and
// shared with the body (packages/world); everything here is how it looks and
// sounds, built from that same description so that what is drawn is what is
// felt.

import type * as THREE from "three";
import type { Place } from "@fly/world";
import type { Ambience } from "../audio/sounds.ts";
import type { Shot } from "../camera.ts";
import type { Daylight, Palettes } from "../scene/light.ts";
import type { PlaceId } from "./catalog.ts";

/** The near pass: the table top and everything on it, in millimetres, with the table's top at y = 0. */
export type SceneSet = {
  group: THREE.Group;
  /** Materials whose reflections follow the time of day (their envMapIntensity is scaled by the light's `env`). */
  materials: THREE.MeshStandardMaterial[];
  /** What the fly's eyes see of it: the big shapes, without the small details. */
  seen: THREE.Object3D[];
  update(time: number, light: Daylight): void;
  /** Sets a ring spreading on a pool (a FoodPatch with `pool`), from a point on it, 0 to 1 strong. */
  ripple(x: number, z: number, strength: number): void;
};

/** The far pass: everything beyond the table, from 200 mm out (stage.ts, FAR). */
export type SceneBackdrop = {
  scene: THREE.Scene;
  /** Keeps it round the camera and moves its light, water, clouds, whatever lives there. */
  update(time: number, camera: THREE.Camera, light: Daylight): void;
};

/** The shots of the whole place: View → Whole table, and the wallpaper's two wide shots between its shots of the fly. */
export type SceneCamera = {
  whole: Shot;
  wide: readonly [Shot, Shot];
  /** Which way the best of the view lies, on the ground (a unit vector): with nothing standing behind the fly, the camera likes to have it there. */
  vista: { x: number; z: number };
};

export type Scene = {
  id: PlaceId;
  place: Place;
  palettes: Palettes;
  buildSet(): SceneSet;
  buildBackdrop(light: Daylight): SceneBackdrop;
  camera: SceneCamera;
  ambience: Ambience;
  /** Soap bubbles drifting over on the breeze (scene/bubbles.ts), and fireflies at dusk (scene/fireflies.ts): both are built for the picnic's open air and size. */
  bubbles: boolean;
  fireflies: boolean;
};
