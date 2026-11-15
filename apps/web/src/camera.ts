// The camera: the views the player can choose between, and the wallpaper's
// slow, unhurried shots when nobody is holding the remote. It never goes
// inside anything on the table, and always eases from one place to the next.

import * as THREE from "three";
import type { FlyBody } from "@fly/body";
import type { World } from "@fly/world";

export type View = "follow" | "close" | "table" | "above";
export const VIEWS: readonly View[] = ["follow", "close", "table", "above"];
export const VIEW_NAMES: Record<View, string> = { follow: "Follow", close: "Close up", table: "Whole table", above: "From above" };

/** A camera placement, described round a focus point. */
type Shot = {
  /** Around the focus: distance (mm), height above it (mm), and the angle round it (radians, 0 behind the fly). */
  distance: number;
  height: number;
  around: number;
  /** Does `around` turn with the fly's heading? */
  relative: boolean;
  /** Around the table's centre instead of the fly. */
  table: boolean;
  /** Slow drift round the focus, rad/s. */
  orbit: number;
  fov: number;
  /** How quickly the camera follows (1/s). */
  ease: number;
};

const SHOTS: Record<View, Shot> = {
  follow: { distance: 20, height: 5, around: 0.35, relative: true, table: false, orbit: 0, fov: 40, ease: 1.6 },
  close: { distance: 11, height: 3.5, around: 1.2, relative: true, table: false, orbit: 0.05, fov: 38, ease: 2 },
  table: { distance: 520, height: 300, around: 0.25, relative: false, table: true, orbit: 0.03, fov: 40, ease: 1.2 },
  above: { distance: 6, height: 70, around: 0, relative: true, table: false, orbit: 0, fov: 40, ease: 1.6 },
};

/** The wallpaper's shots, each held a while: [shot, seconds]. */
const WALLPAPER: readonly Shot[] = [
  { distance: 26, height: 8, around: 2.4, relative: false, table: false, orbit: 0.06, fov: 36, ease: 0.5 },
  { distance: 380, height: 150, around: -0.4, relative: false, table: true, orbit: 0.02, fov: 38, ease: 0.35 },
  { distance: 14, height: 3, around: 1.4, relative: true, table: false, orbit: -0.04, fov: 34, ease: 0.6 },
  { distance: 60, height: 6, around: -2.6, relative: false, table: false, orbit: 0.03, fov: 40, ease: 0.4 },
  { distance: 40, height: 45, around: 0.6, relative: true, table: false, orbit: 0.05, fov: 38, ease: 0.45 },
  { distance: 600, height: 380, around: 0.9, relative: false, table: true, orbit: -0.015, fov: 36, ease: 0.3 },
];

const CLEARANCE = 2.5;

export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera;
  view: View = "follow";
  wallpaper = false;
  /** Lets the wallpaper change shots more often. */
  lively = false;
  #world: World;
  #position = new THREE.Vector3();
  #target = new THREE.Vector3();
  #goal = new THREE.Vector3();
  #look = new THREE.Vector3();
  #around = 0;
  #orbit = 0;
  #shot = 0;
  #shotTime = 0;
  #started = false;
  #fov = 40;
  #time = 0;

  constructor(world: World, aspect: number) {
    this.#world = world;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 4000);
  }

  setView(view: View) {
    this.view = view;
    this.#orbit = 0;
  }

  /** Moves the camera on by `dt` seconds, framing the fly. */
  update(body: FlyBody, dt: number) {
    this.#time += dt;
    let shot: Shot;
    if (this.wallpaper) {
      this.#shotTime += dt;
      const hold = this.lively ? 14 : 24;
      if (this.#shotTime > hold) {
        this.#shotTime = 0;
        this.#shot = (this.#shot + 1) % WALLPAPER.length;
        this.#orbit = 0;
      }
      shot = WALLPAPER[this.#shot];
    } else {
      shot = SHOTS[this.view];
    }
    this.#orbit += shot.orbit * dt;
    const p = body.position;
    const focus = this.#goal;
    if (shot.table) focus.set(p.x * 0.35, 10 + p.y * 0.3, p.z * 0.35);
    else focus.set(p.x, p.y + 0.8, p.z);

    // The angle round the focus: behind the fly turns with it, slowly.
    const want = (shot.relative ? body.yaw + Math.PI : 0) + shot.around + this.#orbit;
    if (!this.#started) this.#around = want;
    const delta = Math.atan2(Math.sin(want - this.#around), Math.cos(want - this.#around));
    this.#around += delta * (1 - Math.exp(-Math.min(shot.ease, 1.2) * dt));

    const eye = scratchEye;
    const around = this.#around;
    // Find a place that isn't inside anything, trying further round each way.
    for (let attempt = 0; attempt < 9; attempt++) {
      const a = around + (attempt === 0 ? 0 : ((attempt + 1) >> 1) * 0.6 * (attempt % 2 ? 1 : -1));
      eye.set(focus.x + Math.sin(a) * shot.distance, focus.y + shot.height, focus.z + Math.cos(a) * shot.distance);
      const floor = this.#world.heightAt(eye.x, eye.z);
      if (eye.y > floor + CLEARANCE || attempt === 8) {
        if (attempt > 0) this.#around = a;
        eye.y = Math.max(eye.y, floor + CLEARANCE);
        break;
      }
    }
    // A breath of movement, as if hand-held.
    eye.x += Math.sin(this.#time * 0.37) * shot.distance * 0.008;
    eye.y += Math.sin(this.#time * 0.51) * shot.distance * 0.006;

    const k = this.#started ? 1 - Math.exp(-shot.ease * dt) : 1;
    this.#position.lerp(eye, k);
    this.#target.lerp(focus, this.#started ? 1 - Math.exp(-shot.ease * 1.6 * dt) : 1);
    this.#started = true;
    // Never inside the table or what's on it, whatever the easing did.
    const floor = this.#world.heightAt(this.#position.x, this.#position.z);
    if (this.#position.y < floor + CLEARANCE) this.#position.y = floor + CLEARANCE;
    this.#fov += (shot.fov - this.#fov) * (1 - Math.exp(-2 * dt));

    const cam = this.camera;
    cam.position.copy(this.#position);
    this.#look.copy(this.#target);
    cam.lookAt(this.#look);
    if (Math.abs(cam.fov - this.#fov) > 0.01) {
      cam.fov = this.#fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  /** Starts the wallpaper on a shot that suits where the camera is. */
  startWallpaper() {
    this.wallpaper = true;
    this.#shotTime = 0;
    this.#shot = (this.#shot + 1) % WALLPAPER.length;
  }

  stopWallpaper() {
    this.wallpaper = false;
  }

  /** Jumps straight to the current shot (after a cut). */
  snap() {
    this.#started = false;
  }
}

const scratchEye = new THREE.Vector3();
