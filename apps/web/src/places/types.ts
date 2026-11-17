// What a place has to provide for the game to show it and the fly to live in
// it. The world (what the fly stands on, bumps into and eats) is exact and
// shared with the body (packages/world); everything here is how it looks,
// built from that same description so that what is drawn is what is felt.

import type * as THREE from "three";
import type { Looming } from "@fly/body";
import type { Pantry, Place, Vec3, World } from "@fly/world";
import type { Shot } from "../camera.ts";
import type { Daylight, Palettes } from "../scene/light.ts";
import type { Weather } from "../scene/weather.ts";
import type { PlaceId } from "./catalog.ts";

/** The near pass: the table top and everything on it, in millimetres, with the table's top at y = 0. */
export type SceneSet = {
  group: THREE.Group;
  /** Materials whose reflections follow the time of day (their envMapIntensity is scaled by the light's `env`). */
  materials: THREE.MeshStandardMaterial[];
  /** What the fly's eyes see of it: the big shapes, without the small details. */
  seen: THREE.Object3D[];
  /** Moves it on. The weather is for a place that shows it (rain on a pane, wet things), the camera for one that draws what is near it in more detail; one that doesn't can leave them. */
  update(time: number, light: Daylight, weather: Weather, camera: THREE.Camera): void;
  /**
   * Builds the next part of a place too big to build in one frame: true
   * while there is more. The game calls it once a frame behind the veil and
   * lifts the veil once it is done, so no one frame is long (stage.ts builds
   * all of it at once when there is no veil, at start). Optional: a place
   * left without it is built whole by `buildSet`.
   */
  more?(): boolean;
  /** Sets a ring spreading on a pool (a FoodPatch with `pool`), from a point on it, 0 to 1 strong. */
  ripple(x: number, z: number, strength: number): void;
  /**
   * The place's own goings-on, each frame the fly lives (not while paused):
   * wind, rain, visitors, things to find. Whatever reaches the fly does so
   * only through `around.felt`, which goes to its senses with the player's
   * tools; food goes into `around.pantry`, to be found by walking and
   * tasting; anything it could see is in `seen`. Optional: a place without
   * it is still.
   */
  live?(dt: number, around: Around): void;
  /**
   * At a table with others the table says when a goings-on happens, and each
   * device starts it from the same random stream (`random`), so all see the
   * same visit; the place's own pace is off (`Around.shared`). Optional.
   */
  happen?(kind: string, random: () => number): void;
};

/** What a place's goings-on are given each frame, and where they leave what the fly feels. */
export type Around = {
  /** Where the fly is (between its feet), mm. */
  readonly fly: Readonly<Vec3>;
  readonly airborne: boolean;
  readonly world: World;
  readonly pantry: Pantry;
  readonly weather: Weather;
  /**
   * Nobody has touched the remote for a while (the wallpaper, or a minute of
   * play without a press): comings and goings start only then, so that what
   * the fly does while someone plays answers what they do.
   */
  readonly quiet: boolean;
  /** Cleared by the game each frame, filled in by the place. */
  readonly felt: Felt;
  /** At a table with others (apps/web/src/online): the other flies there, as this device sees them, and the one every device plans visits round. */
  readonly shared: SharedTable | null;
};

/**
 * The others at a table, and the fly the table's visits are planned round.
 * `ownSky`: in a room open to everyone each device keeps its own light and
 * weather, so a visit the table sends that doesn't suit this device's sky
 * (a butterfly in its rain, a gull in its night) doesn't come here.
 */
export type SharedTable = { readonly others: readonly Readonly<Vec3>[]; readonly anchor: Readonly<Vec3>; ownSky: boolean };

/** What the place does to the fly this frame, all through its senses. */
export type Felt = {
  /** The air's own velocity at the fly, mm/s (a gust): felt as wind, and it carries the fly in flight as a puff does. */
  air: Vec3;
  /** Something landing on it (a raindrop), 0 to 1, this frame: felt as touch. */
  touch: number;
  /** Things it could see coming, for a brain without eyes (with eyes, it sees whatever is in `seen`). */
  looming: Looming[];
};

/** The far pass: everything beyond the table, from 200 mm out (stage.ts, FAR). */
export type SceneBackdrop = {
  scene: THREE.Scene;
  /** Keeps it round the camera and moves its light, water, clouds, whatever lives there, and its weather if it shows it. */
  update(time: number, camera: THREE.Camera, light: Daylight, weather: Weather): void;
};

/** The camera's view of the whole place (View → Whole table); the shots round the fly are every place's. */
export type SceneCamera = {
  whole: Shot;
  /**
   * The point the whole-place view circles, how much of the way it follows
   * the fly from there (and a third of the fly's height), and how much of
   * the way from it toward the fly the camera aims (0 if left out); left
   * out, a point a third of the way from the table's middle to the fly. A
   * room gives its own, so that the view stays inside it wherever the fly
   * goes, and turns to keep the fly in the picture.
   */
  focus?: { x: number; y: number; z: number; follow: number; aim?: number };
  /** How far the camera sees, mm (4,000 if not said): the near pass's reach and the fly's eyes'. A room bigger than that says so. */
  reach?: number;
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
  /**
   * How much of the weather reaches its light, 0 to 1 (1 if not said): out
   * under the sky, all of it; in a room that sees the sky through windows,
   * less, and after dark (lit by lamps) hardly any. Overcast greys the
   * palettes' sky and takes the sun, mist whitens the distance
   * (scene/light.ts), in that measure.
   */
  open?: number;
  /** Soap bubbles drifting over on the breeze (scene/bubbles.ts), and fireflies at dusk (scene/fireflies.ts): both are built for the picnic's open air and size. */
  bubbles: boolean;
  fireflies: boolean;
};
