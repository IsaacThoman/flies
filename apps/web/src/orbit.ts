// The play camera follows the fly at the player's yaw, pitch and distance.
// Keeping that orbit through scenery makes turning and zooming predictable.

import * as THREE from "three";
import { FLY_LENGTH } from "@fly/body";
import type { FlyBody } from "@fly/body";
import type { SceneCamera } from "./places/types.ts";
import { fieldOfView } from "./display.ts";

export type View = "close" | "follow" | "wide" | "table" | "above";
export const VIEWS: readonly View[] = ["close", "follow", "wide", "table", "above"];
export const VIEW_NAMES: Record<View, string> = { close: "Close up", follow: "Follow", wide: "Wide", table: "Whole table", above: "From above" };

/** The views round the fly: how far out (mm from its middle) and how far up (radians). Whole table uses the place's own shot. */
export const PRESETS: Record<Exclude<View, "table">, { distance: number; pitch: number }> = {
  close: { distance: 6.3, pitch: 0.14 },
  follow: { distance: 11.1, pitch: 0.14 },
  wide: { distance: 30.6, pitch: 0.2 },
  above: { distance: 13.4, pitch: 1.4 },
};

/** The vertical field of view in play, degrees, framed for the TV's 16:9 (fieldOfView). */
export const PLAY_FOV = 30;
/** The nearest the camera comes to the fly's middle when zoomed (mm): the fly fills the picture. */
export const NEAREST = 2.4;
/** How far up the camera can be turned: from just above level to nearly overhead (radians). */
export const PITCH = [0.08, 1.45] as const;
/** Seconds a drag's turn, a zoom and a chosen view take to arrive (the time constant of each). */
const TURN_EASE = 0.04;
const ZOOM_EASE = 0.1;
const VIEW_EASE = 0.35;
/** Seconds the point it circles takes to follow the fly's middle: enough to smooth a stride, too little to lose a flight. */
const FOLLOW_EASE = 0.08;
/** The fly's middle, above its feet, mm. */
const MIDDLE = 0.3 * FLY_LENGTH;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** One step of an exponential ease from `x` toward `goal`, arriving exactly once it is next to nothing away. */
function ease(x: number, goal: number, seconds: number, dt: number) {
  const gap = goal - x;
  if (Math.abs(gap) < 1e-7) return goal;
  return x + gap * (1 - Math.exp(-dt / seconds));
}

export class OrbitRig {
  /** The named view the camera is at or nearest (the View tool shows it). */
  view: View = "follow";
  /** What it circles: the fly's middle, lightly smoothed. */
  readonly #target = new THREE.Vector3();
  readonly #camera: THREE.PerspectiveCamera;
  #scene: SceneCamera;
  /** The farthest out it goes in this place, mm: as much of it as its whole-place shot shows. */
  #farthest = 800;
  /** Where the player has put the camera: yaw, pitch, distance. */
  readonly #goal = { yaw: 0, pitch: PRESETS.follow.pitch, distance: PRESETS.follow.distance };
  /** Where it is, on its way there, and how quickly each is going (the time constant of its ease, s). */
  #yaw = 0;
  #pitch = PRESETS.follow.pitch;
  #distance = PRESETS.follow.distance;
  #turnEase = TURN_EASE;
  #distanceEase = ZOOM_EASE;
  /** From above is chosen: behind the fly as it is when the camera next moves. */
  #behind = false;
  /** Coming from the title's or the screensaver's camera: how far off the fly it was aimed, and its field of view, both easing away. */
  readonly #aimOff = new THREE.Vector3();
  #fov = PLAY_FOV;
  #started = false;
  readonly #aim = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, scene: SceneCamera) {
    this.#camera = camera;
    this.#scene = scene;
    this.useScene(scene);
  }

  /** The player's yaw, pitch and distance: where the camera is going. */
  get yaw() {
    return wrap(this.#goal.yaw);
  }

  get pitch() {
    return this.#goal.pitch;
  }

  get distance() {
    return this.#goal.distance;
  }

  /** A new place: as far out as it goes there, starting afresh. */
  useScene(scene: SceneCamera) {
    this.#scene = scene;
    const whole = scene.whole;
    this.#farthest = Math.hypot(whole.distance, whole.height) * (Math.tan((whole.fov * Math.PI) / 360) / Math.tan((PLAY_FOV * Math.PI) / 360));
    this.#goal.distance = this.view === "table" ? this.#farthest : Math.min(this.#goal.distance, this.#farthest);
    this.#started = false;
  }

  /** Turns the camera round the fly (radians round, and up), exactly that much. */
  turnBy(yaw: number, pitch: number) {
    const goal = this.#goal;
    goal.yaw += yaw;
    // However far a long session turns it, the same multiple of a turn off both, so neither notices.
    if (Math.abs(goal.yaw) > 64 * Math.PI) {
      const turns = Math.round(goal.yaw / (2 * Math.PI)) * 2 * Math.PI;
      goal.yaw -= turns;
      this.#yaw -= turns;
    }
    goal.pitch = clamp(goal.pitch + pitch, PITCH[0], PITCH[1]);
    this.#turnEase = TURN_EASE;
    this.#behind = false;
  }

  /** Brings the camera in (under 1) or takes it out, by this factor; the View tool's name follows it. */
  zoomBy(factor: number) {
    const goal = this.#goal;
    goal.distance = clamp(goal.distance * factor, NEAREST, this.#farthest);
    this.#distanceEase = ZOOM_EASE;
    this.view = this.#nearest();
  }

  /** Takes the camera to one of the named views: its distance and pitch (and for some, a yaw), over a moment. */
  setView(view: View) {
    this.view = view;
    const goal = this.#goal;
    this.#behind = view === "above";
    if (view === "table") {
      const whole = this.#scene.whole;
      goal.distance = this.#farthest;
      goal.pitch = clamp(Math.atan2(whole.height, whole.distance), PITCH[0], PITCH[1]);
      // From the place's own side of it, the way round the screensaver films it.
      goal.yaw = this.#yaw + wrap(whole.side - this.#yaw);
    } else {
      goal.distance = Math.min(PRESETS[view].distance, this.#farthest);
      goal.pitch = PRESETS[view].pitch;
      goal.yaw = this.#yaw + wrap(goal.yaw - this.#yaw);
    }
    this.#turnEase = this.#distanceEase = VIEW_EASE;
  }

  /** The named view nearest the distance: From above while it still looks down. */
  #nearest(): View {
    if (this.view === "above" && this.#goal.pitch > 1) return "above";
    let best: View = "follow";
    let gap = Infinity;
    for (const view of VIEWS) {
      if (view === "above") continue;
      const g = Math.abs(Math.log(this.#goal.distance / (view === "table" ? this.#farthest : PRESETS[view].distance)));
      if (g < gap) {
        gap = g;
        best = view;
      }
    }
    return best;
  }

  /**
   * Takes the camera from wherever it is now (the title's or the
   * screensaver's), going on from that yaw to the player's distance and
   * pitch, its aim and its field of view easing over to the rig's.
   */
  enter(body: FlyBody) {
    const cam = this.#camera;
    const t = this.#target.set(body.position.x, body.position.y + MIDDLE, body.position.z);
    const dx = cam.position.x - t.x;
    const dy = cam.position.y - t.y;
    const dz = cam.position.z - t.z;
    const d = Math.hypot(dx, dy, dz) || cam.near;
    this.#yaw = Math.atan2(dx, dz);
    this.#pitch = Math.asin(clamp(dy / d, -1, 1));
    this.#distance = d;
    this.#goal.yaw = this.#yaw;
    this.#turnEase = this.#distanceEase = VIEW_EASE;
    cam.getWorldDirection(this.#aimOff);
    this.#aimOff.multiplyScalar(d).add(cam.position).sub(t);
    this.#fov = cam.fov;
    this.#started = true;
  }

  /** Moves the camera on by `dt` seconds. `low` puts the fly that far below the picture's middle (of its half-height), `wider` opens the field of view that much (as its half-angle's tangent): the HUD's room on this screen. */
  update(body: FlyBody, dt: number, low: number, wider: number) {
    const cam = this.#camera;
    const p = body.position;
    const v = body.velocity;
    const t = this.#target;
    const goal = this.#goal;
    const fov = (Math.atan(Math.tan((fieldOfView(PLAY_FOV, cam.aspect) * Math.PI) / 360) * wider) * 360) / Math.PI;
    if (this.#behind) {
      goal.yaw = this.#yaw + wrap(body.yaw + Math.PI - this.#yaw);
      this.#behind = false;
    }
    if (!this.#started) {
      t.set(p.x, p.y + MIDDLE, p.z);
      this.#yaw = goal.yaw;
      this.#pitch = goal.pitch;
      this.#distance = goal.distance;
      this.#aimOff.set(0, 0, 0);
      this.#fov = fov;
    } else {
      // Led by the fly's own speed, just enough that smoothing a stride never leaves it behind a steady walk or flight.
      const decay = Math.exp(-dt / FOLLOW_EASE);
      const follow = 1 - decay;
      const lead = dt * decay;
      t.x += (p.x - t.x) * follow + v.x * lead;
      t.y += (p.y + MIDDLE - t.y) * follow + v.y * lead;
      t.z += (p.z - t.z) * follow + v.z * lead;
    }
    this.#yaw = ease(this.#yaw, goal.yaw, this.#turnEase, dt);
    this.#pitch = ease(this.#pitch, goal.pitch, this.#turnEase, dt);
    const ratio = goal.distance / this.#distance;
    this.#distance = Math.abs(ratio - 1) < 1e-7 ? goal.distance : this.#distance * Math.pow(ratio, 1 - Math.exp(-dt / this.#distanceEase));
    const fade = 1 - Math.exp(-dt / VIEW_EASE);
    this.#aimOff.multiplyScalar(1 - fade);
    this.#fov = ease(this.#fov, fov, VIEW_EASE, dt);

    this.#started = true;

    const flat = Math.cos(this.#pitch) * this.#distance;
    cam.position.set(t.x + Math.sin(this.#yaw) * flat, t.y + Math.sin(this.#pitch) * this.#distance, t.z + Math.cos(this.#yaw) * flat);
    cam.lookAt(this.#aim.copy(t).add(this.#aimOff));
    if (Math.abs(cam.fov - this.#fov) > 0.01) {
      cam.fov = this.#fov;
      cam.updateProjectionMatrix();
    }
    // Tilted up a little where the HUD wants the fly lower: the same for every distance, so zooming never moves it.
    if (low !== 0) cam.rotateX(Math.atan(low * Math.tan((cam.fov * Math.PI) / 360)));
    cam.updateMatrixWorld();
  }
}
