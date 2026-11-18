// The camera, and who has it. In play it is the player's: a plain orbit round
// the fly that moves only when they move it (orbit.ts). Behind the loading
// screen and the title, and in the screensaver, it moves itself, filming the
// fly as a patient nature cameraman would (cameraman.ts). Each takes the
// camera from wherever the other left it and eases on from there, so going
// into play and out of it is one smooth move, never a cut.

import * as THREE from "three";
import type { FlyBody } from "@fly/body";
import type { World } from "@fly/world";
import type { SceneCamera } from "./places/types.ts";
import { Cameraman } from "./cameraman.ts";
import type { Shot, WallpaperStyle } from "./cameraman.ts";
import { OrbitRig } from "./orbit.ts";
import type { View } from "./orbit.ts";

export { FOLLOW, WALLPAPER } from "./cameraman.ts";
export type { Shot, WallpaperStyle } from "./cameraman.ts";
export { NEAREST, PITCH, PLAY_FOV, PRESETS, VIEWS, VIEW_NAMES } from "./orbit.ts";
export type { View } from "./orbit.ts";

export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera;
  /** The screensaver (and behind the title, which is the screensaver's camera with the title's own shot) has the camera, not the player. */
  wallpaper = false;
  /** A finger, a button, a key or a stick is on the camera: the screensaver stays away. */
  held = false;
  /** Pins the camera (for screenshots and art): eye and target, or null to let it move. */
  pinned: { eye: THREE.Vector3Like; target: THREE.Vector3Like; fov?: number } | null = null;
  /**
   * Where the screens leave room for the fly, from their layout: in the
   * title's shot, its place across and down the picture (as a Shot's
   * `across` and `low`); playing, how much lower than the middle, and how
   * much wider the field of view (the tangent of half of it, over 1).
   */
  readonly room = { across: -0.56, low: 0.1, lower: 0, wider: 1 };
  readonly #rig: OrbitRig;
  readonly #cameraman: Cameraman;
  /** Who takes the camera from the other on the next frame, if anyone. */
  #handing: "rig" | "cameraman" | null = null;
  #started = false;

  constructor(world: World, aspect: number, scene: SceneCamera) {
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.5, 4000);
    this.#rig = new OrbitRig(this.camera, scene);
    this.#cameraman = new Cameraman(world, this.camera, scene, this.room);
    this.useScene(scene);
  }

  /** The screen changed shape. */
  setAspect(aspect: number) {
    if (aspect === this.camera.aspect) return;
    this.camera.aspect = aspect;
    // The field of view follows it on the next update.
    this.camera.updateProjectionMatrix();
  }

  /** The place's own shots, for a place the fly has just been carried to: the camera starts afresh there. */
  useScene(scene: SceneCamera) {
    this.#rig.useScene(scene);
    this.#cameraman.useScene(scene);
    this.#handing = null;
    this.camera.far = scene.reach ?? 4000;
    this.camera.updateProjectionMatrix();
  }

  /** The named view the camera is at or nearest (the View tool shows it). */
  get view(): View {
    return this.#rig.view;
  }

  /** The player's yaw round the fly, pitch and distance (mm). */
  get yaw() {
    return this.#rig.yaw;
  }

  get pitch() {
    return this.#rig.pitch;
  }

  get reach() {
    return this.#rig.distance;
  }

  get title() {
    return this.#cameraman.title;
  }

  set title(title: boolean) {
    this.#cameraman.title = title;
  }

  get wallpaperStyle(): WallpaperStyle {
    return this.#cameraman.style;
  }

  set wallpaperStyle(style: WallpaperStyle) {
    this.#cameraman.style = style;
  }

  /** How many times the screensaver has moved on to its next shot by itself. */
  get shotChanges() {
    return this.#cameraman.shotChanges;
  }

  /** The screensaver's (or the title's) shot. */
  get shot(): Shot {
    return this.#cameraman.shot;
  }

  /** Takes the player's camera to one of the named views. */
  setView(view: View) {
    if (view !== this.#rig.view) this.#rig.setView(view);
  }

  /** Back to Follow's distance and pitch, at the same yaw. */
  home() {
    this.#rig.setView("follow");
  }

  turnBy(yaw: number, pitch: number) {
    this.#rig.turnBy(yaw, pitch);
  }

  zoomBy(factor: number) {
    this.#rig.zoomBy(factor);
  }

  /** The screensaver (or the title) takes the camera, or moves on to its next shot. */
  startWallpaper() {
    const was = this.wallpaper;
    this.wallpaper = true;
    this.held = false;
    this.#cameraman.start();
    // The whole place cuts straight to its shot.
    if (!was && this.#started && this.#cameraman.style !== "whole") this.#handing = "cameraman";
  }

  /** The player has the camera again, from where the screensaver left it. */
  stopWallpaper() {
    if (!this.wallpaper) return;
    this.wallpaper = false;
    this.#handing = this.#started ? "rig" : null;
  }

  /** Moves the camera on by `dt` seconds. */
  update(body: FlyBody, dt: number) {
    const cam = this.camera;
    if (this.pinned) {
      cam.position.copy(this.pinned.eye);
      cam.lookAt(this.pinned.target.x, this.pinned.target.y, this.pinned.target.z);
      if (this.pinned.fov && cam.fov !== this.pinned.fov) {
        cam.fov = this.pinned.fov;
        cam.updateProjectionMatrix();
      }
      cam.updateMatrixWorld();
      return;
    }
    if (this.wallpaper) {
      if (this.#handing === "cameraman") this.#cameraman.enter(body);
      this.#cameraman.update(body, dt);
    } else {
      if (this.#handing === "rig") this.#rig.enter(body);
      this.#rig.update(body, dt, this.room.lower, this.room.wider);
    }
    this.#handing = null;
    this.#started = true;
  }
}
