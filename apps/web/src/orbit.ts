// The camera in play: a plain orbit round the fly, on three numbers the
// player sets and nothing else does.
//
// Yaw (round the fly, in the world's terms) and pitch (up from level) turn
// by exactly as much as a drag, a stick or a key asks, eased over a few
// hundredths of a second so it doesn't feel robotic; distance multiplies by
// a wheel's click, a pinch or a scroll, eased over a tenth of a second, from
// close enough for the fly to fill the picture out to the whole place. What
// it circles is the middle of the fly's body, lightly smoothed, and the fly
// is always in the middle of the picture, through the same field of view. The
// camera goes along with the fly, but never turns by itself: not when the fly
// turns, not after a while, not to find a better side.
//
// One rule keeps it out of things. If anything is between the fly and the
// camera, or near enough the camera for the picture's near edge to cut into
// it, the camera comes in along its line of sight until it isn't: it looks
// with a thin cone of rays, where it is and where the turn and the fly are
// taking it a moment from now. It comes in quickly and goes back out gently
// once the way has been clear for a moment. Where coming in would bring it
// nearer than the player can zoom (down in a bowl, on a slope), it looks from
// higher instead, as little higher as opens the way: how low it may look
// from rises as quickly as it comes in, and comes back down as gently as it
// goes out, step by step, only where that keeps it as far out. Above that the
// player's pitch is untouched. How far out and how low it may look from are
// all it changes.
//
// The View tool's views are places on the same rig: each sets a distance and
// a pitch (Whole table and From above a yaw too), eased over a moment, and the
// player has it again at once.

import * as THREE from "three";
import { FLY_LENGTH } from "@fly/body";
import type { FlyBody } from "@fly/body";
import type { RayHit, World } from "@fly/world";
import type { SceneCamera } from "./places/types.ts";
import { damp } from "./damp.ts";
import { fieldOfView } from "./display.ts";

export type View = "close" | "follow" | "wide" | "table" | "above";
export const VIEWS: readonly View[] = ["close", "follow", "wide", "table", "above"];
export const VIEW_NAMES: Record<View, string> = { close: "Close up", follow: "Follow", wide: "Wide", table: "Whole table", above: "From above" };

/** The views round the fly: how far out (mm from the fly's middle) and how far up (radians). In Follow the fly is about 170 pixels long; Close up is twice that, Wide about a third. Whole table is the place's own (#tableView). */
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
/** Something in the way: about how long it takes to come in, how long the way must be clear before it goes back out, and how long it takes to go back out (s). */
const PULL_IN = 0.13;
const CLEAR_FOR = 0.25;
const LET_OUT = 0.8;
/** How far ahead (s) it looks where the turn and the fly are taking it, and the most it looks round (rad). */
const LOOK_AHEAD = 0.45;
const MOST_AHEAD = 1.2;
const AHEAD_STEPS = 4;
/** The picture's near corners are this far from the eye at most, plus this margin (mm): what it keeps clear round itself. */
const MARGIN = 0.25;
/** The nearest it comes in for something in the way (mm). */
const CLOSEST = 0.3;
/** How far under its line of sight it keeps clear, as it goes out along it (mm): more than the eye keeps over what is under it. */
const UNDER = 2 * MARGIN + 0.1;
/** Looking for a higher place to look from: in steps this big (rad). */
const RISE_STEP = 0.1;

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
  readonly target = new THREE.Vector3();
  readonly #camera: THREE.PerspectiveCamera;
  readonly #world: World;
  #scene!: SceneCamera;
  /** The farthest out it goes in this place, mm: as much of it as its whole-place shot shows. */
  #farthest = 800;
  /** Where the player has put the camera: yaw, pitch, distance. */
  readonly #goal = { yaw: 0, pitch: PRESETS.follow.pitch, distance: PRESETS.follow.distance };
  /** Where it is, on its way there, and how quickly each is going (the time constant of its ease, s). */
  #yaw = 0;
  #pitch = PRESETS.follow.pitch;
  #distance = PRESETS.follow.distance;
  #yawEase = TURN_EASE;
  #pitchEase = TURN_EASE;
  #distanceEase = ZOOM_EASE;
  /** From above is chosen: behind the fly as it is when the camera next moves. */
  #behind = false;
  /** How far out the way lets it be, on a spring (Infinity: nothing is in the way), the spring's speed, the nearest the way has let it be lately, and how long the way has been clear farther out than that. */
  #arm = Infinity;
  readonly #armV = new Float64Array(1);
  #held = Infinity;
  #clearFor = 0;
  /** The lowest pitch the way lets it look from, on a spring (PITCH[0]: anywhere), the spring's speed, where the way last wanted it, how long until it looks again (s), and whether it last looked for higher and found nowhere. */
  #floor: number = PITCH[0];
  readonly #floorV = new Float64Array(1);
  #floorHeld: number = PITCH[0];
  #lookIn = 0;
  #nowhere = false;
  /** Where the turn and the fly are taking it a moment from now, this frame: the fly's velocity, how long ahead it gets (s), how far round and up the turn takes it (rad); `#ahead` < 0: neither is moving. */
  #vx = 0;
  #vy = 0;
  #vz = 0;
  #ahead = -1;
  #round = 0;
  #up = 0;
  /** Whether the eye is clear where `#fit` last left it. */
  #fits = false;
  /** Coming from the title's or the screensaver's camera: how far off the fly it was aimed, and its field of view, both easing away. */
  readonly #aimOff = new THREE.Vector3();
  #fov = PLAY_FOV;
  #started = false;
  readonly #aim = new THREE.Vector3();
  readonly #eye = new THREE.Vector3();
  readonly #corner = new THREE.Vector3();
  readonly #origin = { x: 0, y: 0, z: 0 };
  readonly #ray = { x: 0, y: 0, z: 0 };
  readonly #hit: RayHit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, solid: -1, t: 0 };

  constructor(world: World, camera: THREE.PerspectiveCamera, scene: SceneCamera) {
    this.#world = world;
    this.#camera = camera;
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

  /** How far the camera is from what it circles now, for what is in the way and on its way to the distance. */
  get reach() {
    return Math.min(this.#arm, this.#distance);
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
    this.#yawEase = TURN_EASE;
    this.#pitchEase = TURN_EASE;
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
      this.#behind = view === "above";
    }
    this.#yawEase = this.#pitchEase = this.#distanceEase = VIEW_EASE;
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
    const t = this.target.set(body.position.x, body.position.y + MIDDLE, body.position.z);
    const dx = cam.position.x - t.x;
    const dy = cam.position.y - t.y;
    const dz = cam.position.z - t.z;
    const d = Math.max(CLOSEST, Math.hypot(dx, dy, dz));
    this.#yaw = Math.atan2(dx, dz);
    this.#pitch = Math.asin(clamp(dy / d, -1, 1));
    this.#distance = d;
    this.#goal.yaw = this.#yaw;
    this.#yawEase = this.#pitchEase = this.#distanceEase = VIEW_EASE;
    cam.getWorldDirection(this.#aimOff);
    this.#aimOff.multiplyScalar(d).add(cam.position).sub(t);
    this.#fov = cam.fov;
    this.#arm = Infinity;
    this.#armV[0] = 0;
    this.#held = Infinity;
    this.#clearFor = 0;
    this.#floor = this.#floorHeld = PITCH[0];
    this.#floorV[0] = 0;
    this.#lookIn = 0;
    this.#nowhere = false;
    this.#started = true;
  }

  /** Moves the camera on by `dt` seconds. `low` puts the fly that far below the picture's middle (of its half-height), `wider` opens the field of view that much (as its half-angle's tangent): the HUD's room on this screen. */
  update(body: FlyBody, dt: number, low: number, wider: number) {
    const cam = this.#camera;
    const p = body.position;
    const v = body.velocity;
    const t = this.target;
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
      const k = 1 - Math.exp(-dt / FOLLOW_EASE);
      const lead = (dt * (1 - k)) / k;
      t.x += (p.x + v.x * lead - t.x) * k;
      t.y += (p.y + MIDDLE + v.y * lead - t.y) * k;
      t.z += (p.z + v.z * lead - t.z) * k;
    }
    const yawWas = this.#yaw;
    const pitchWas = this.#pitch;
    this.#yaw = ease(this.#yaw, goal.yaw, this.#yawEase, dt);
    this.#pitch = ease(this.#pitch, goal.pitch, this.#pitchEase, dt);
    const ratio = goal.distance / this.#distance;
    this.#distance = Math.abs(ratio - 1) < 1e-7 ? goal.distance : this.#distance * Math.pow(ratio, 1 - Math.exp(-dt / this.#distanceEase));
    const fade = 1 - Math.exp(-dt / VIEW_EASE);
    this.#aimOff.multiplyScalar(1 - fade);
    this.#fov = ease(this.#fov, fov, VIEW_EASE, dt);

    // What is in the way, where it is and a moment ahead: the one rule.
    const distance = this.#distance;
    const near = this.#nearRadius() + MARGIN;
    const turning = dt > 0 ? (Math.abs(this.#yaw - yawWas) + Math.abs(this.#pitch - pitchWas)) / dt : 0;
    const speed = Math.hypot(v.x, v.y, v.z);
    this.#ahead = -1;
    if (turning > 1e-3 || speed > 1e-3) {
      this.#round = clamp(((this.#yaw - yawWas) / dt) * LOOK_AHEAD, -MOST_AHEAD, MOST_AHEAD);
      this.#up = clamp(((this.#pitch - pitchWas) / dt) * LOOK_AHEAD, -MOST_AHEAD, MOST_AHEAD);
      // The fly gets no farther than what is in its way.
      let lead = speed * LOOK_AHEAD;
      if (lead > 0) {
        const ray = this.#ray;
        ray.x = v.x / speed;
        ray.y = v.y / speed;
        ray.z = v.z / speed;
        if (this.#world.raycast(t, ray, this.#hit, lead + near)) lead = Math.max(0, this.#hit.t - near);
      }
      this.#ahead = speed > 0 ? lead / speed : 0;
      this.#vx = v.x;
      this.#vy = v.y;
      this.#vz = v.z;
    }
    let room = this.#room(this.#floor, distance, near);
    // Nearer than the player can zoom: as little higher as opens the way, at once (and if nowhere does, not looking again for a moment). Looking from higher already: every moment, lower where that keeps it as far out, so it never trades distance for height.
    const open = Math.min(distance, NEAREST) - 1e-4;
    if (!this.#started) {
      this.#floorHeld = PITCH[0];
      this.#lookIn = 0;
      this.#nowhere = false;
    } else this.#lookIn -= dt;
    const closed = room < open;
    // Waiting to look lower again doesn't hold up looking higher: it would come in meanwhile.
    if ((this.#lookIn <= 0 || (closed && !this.#nowhere)) && (closed || this.#floorHeld > PITCH[0])) {
      const need = closed ? this.#higher(distance, near, open) : this.#lower(distance, near, room - 1e-3);
      if (need >= 0) this.#floorHeld = need;
      this.#nowhere = closed && need < 0;
      this.#lookIn = closed && need >= 0 ? 0 : CLEAR_FOR;
    }
    if (this.#floorHeld > PITCH[0] || this.#floor > PITCH[0]) {
      const fv = this.#floorV;
      if (!this.#started) this.#floor = this.#floorHeld;
      // From where it is looking, not from below it, when it has to rise.
      else if (this.#floorHeld > this.#floor && this.#floor < this.#pitch) {
        this.#floor = this.#pitch;
        fv[0] = 0;
      }
      if (Math.abs(this.#floorHeld - this.#floor) > 1e-5 || Math.abs(fv[0]) > 1e-4) this.#floor = damp(this.#floor, this.#floorHeld, fv, 0, this.#floorHeld > this.#floor ? PULL_IN : LET_OUT, dt);
      else this.#floor = this.#floorHeld;
      // Back down to where the player has it once nothing wants it higher: anywhere again.
      if (this.#floorHeld <= PITCH[0] && this.#floor <= this.#pitch) {
        this.#floor = PITCH[0];
        fv[0] = 0;
      }
      // How far out the way lets it be from where it is rising to: rising clears it, so it doesn't come in as well.
      room = this.#room(Math.max(this.#floor, this.#floorHeld), distance, near);
    }
    let pitch = Math.max(this.#pitch, this.#floor);
    // Something in the way: the nearest it has let the camera be, until it has been clear farther out for a moment, from as
    // high as it is rising to (going out on the way up and back in as the turn goes on would have it in and out).
    const clear = room >= distance - 1e-4;
    if (!this.#started) {
      this.#held = clear ? Infinity : room;
      this.#clearFor = 0;
    } else if (!clear && room <= this.#held) {
      this.#held = room;
      this.#clearFor = 0;
    } else if (this.#held !== Infinity && this.#floor >= this.#floorHeld - 1e-3 && (this.#clearFor += dt) >= CLEAR_FOR) this.#held = clear ? Infinity : room;
    const allowed = Math.min(this.#held, distance);
    let reach = Math.min(this.#arm, distance);
    const v0 = this.#armV;
    if (!this.#started) {
      reach = allowed;
      v0[0] = 0;
    } else if (Math.abs(allowed - reach) > 1e-4 || Math.abs(v0[0]) > 1e-3) {
      reach = Math.min(distance, damp(reach, allowed, v0, 0, allowed < reach ? PULL_IN : LET_OUT, dt));
      // Still coming in quickly where it has to stop: a spring would carry it past, on through the fly.
      if (reach < CLOSEST) {
        reach = CLOSEST;
        v0[0] = 0;
      }
    }
    // Faster than it could come in (a landing, something thrown in the way): in front of what it would be in, at once, and at rest there.
    if (!this.#clearAt(this.#yaw, pitch, reach, fov)) {
      reach = this.#fit(pitch, Math.min(reach, this.#free(t.x, t.y, t.z, this.#yaw, pitch, distance, near)), fov);
      v0[0] = 0;
      if (!this.#fits || reach < open) {
        // Nearer than the player can zoom, or not even nearest: as little higher as leaves it as far out as the player
        // can zoom, at once; or failing that and not even nearest, as little higher as it can be anywhere at all.
        const fitted = this.#fits;
        for (let rise = pitch + RISE_STEP; rise < PITCH[1] + RISE_STEP; rise += RISE_STEP) {
          const higher = Math.min(PITCH[1], rise);
          const there = this.#fit(higher, this.#free(t.x, t.y, t.z, this.#yaw, higher, distance, near), fov);
          if (this.#fits && (there >= open || !fitted)) {
            pitch = this.#floor = this.#floorHeld = higher;
            this.#floorV[0] = 0;
            this.#lookIn = CLEAR_FOR;
            reach = there;
            if (there >= open) break;
          }
        }
      }
    }
    if (reach >= distance - 1e-4) {
      this.#arm = Infinity;
      v0[0] = 0;
    } else this.#arm = reach;
    this.#started = true;

    const cp = Math.cos(pitch);
    const eye = this.#eye.set(t.x + Math.sin(this.#yaw) * cp * reach, t.y + Math.sin(pitch) * reach, t.z + Math.cos(this.#yaw) * cp * reach);
    cam.position.copy(eye);
    cam.lookAt(this.#aim.copy(t).add(this.#aimOff));
    if (Math.abs(cam.fov - this.#fov) > 0.01) {
      cam.fov = this.#fov;
      cam.updateProjectionMatrix();
    }
    // Tilted up a little where the HUD wants the fly lower: the same for every distance, so zooming never moves it.
    if (low !== 0) cam.rotateX(Math.atan(low * Math.tan((cam.fov * Math.PI) / 360)));
    cam.updateMatrixWorld();
  }

  /** How far out the way lets it be, looking from no lower than `floor`, where it is and (if it is going anywhere) a moment ahead, in even steps so nothing narrow is missed between them. */
  #room(floor: number, distance: number, near: number) {
    const t = this.target;
    let room = this.#free(t.x, t.y, t.z, this.#yaw, Math.max(this.#pitch, floor), distance, near);
    const ahead = this.#ahead;
    for (let i = 1; ahead >= 0 && i <= AHEAD_STEPS; i++) {
      const k = i / AHEAD_STEPS;
      const pitch = Math.max(floor, clamp(this.#pitch + this.#up * k, PITCH[0], PITCH[1]));
      room = Math.min(room, this.#free(t.x + this.#vx * ahead * k, t.y + this.#vy * ahead * k, t.z + this.#vz * ahead * k, this.#yaw + this.#round * k, pitch, distance, near, false));
    }
    return room;
  }

  /** The least it may look from, higher in steps than it is, for the way to leave it `want` mm out here and a moment ahead; -1 if nowhere does. */
  #higher(distance: number, near: number, want: number) {
    for (let rise = Math.max(this.#pitch, this.#floor) + RISE_STEP; rise < PITCH[1] + RISE_STEP; rise += RISE_STEP) {
      const floor = Math.min(PITCH[1], rise);
      if (this.#room(floor, distance, near) >= want) return floor;
    }
    return -1;
  }

  /** How low it may look from, lower in steps than it does and no lower than the first step that leaves it less than `want` mm out, so the way down is clear all along (PITCH[0]: down to the player's own pitch); -1 if not even a step. */
  #lower(distance: number, near: number, want: number) {
    let low = -1;
    for (let fall = this.#floorHeld - RISE_STEP; fall > this.#pitch - RISE_STEP; fall -= RISE_STEP) {
      const floor = Math.max(this.#pitch, fall);
      if (this.#room(floor, distance, near) < want) break;
      low = floor <= this.#pitch ? PITCH[0] : floor;
    }
    return low;
  }

  /** Coming in by steps from `reach` toward (yaw, pitch) until the eye is clear, or as near as the steps go: how far out it is, and in `#fits` whether it is clear there. */
  #fit(pitch: number, reach: number, fov: number) {
    let fits = this.#clearAt(this.#yaw, pitch, reach, fov);
    for (let i = 0; i < 6 && reach > CLOSEST && !fits; i++) {
      reach = Math.max(CLOSEST, reach * 0.7);
      fits = this.#clearAt(this.#yaw, pitch, reach, fov);
    }
    this.#fits = fits;
    return reach;
  }

  /** How far the picture's near corners are from the eye, mm. */
  #nearRadius() {
    const cam = this.#camera;
    const t = Math.tan((cam.fov * Math.PI) / 360);
    return cam.near * Math.sqrt(1 + t * t * (1 + cam.aspect * cam.aspect));
  }

  /**
   * How far out from a point toward (yaw, pitch) the eye may be, up to
   * `distance`, keeping `r` clear of everything: short of what the line of
   * sight meets (measured square to it), of what it passes just over, and of what four rays fanning out
   * from the point to `r` either side of the eye and above and below it
   * meet, so an edge beside the line of sight counts too (unless `!wide`:
   * looking ahead, the line of sight alone).
   */
  #free(x: number, y: number, z: number, yaw: number, pitch: number, distance: number, r: number, wide = true): number {
    const world = this.#world;
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    const sp = Math.sin(pitch);
    const cp = Math.cos(pitch);
    const dx = sy * cp;
    const dy = sp;
    const dz = cy * cp;
    const o = this.#origin;
    o.x = x;
    o.y = y;
    o.z = z;
    const ray = this.#ray;
    ray.x = dx;
    ray.y = dy;
    ray.z = dz;
    let free = distance;
    const hit = world.raycast(o, ray, this.#hit, distance + r);
    if (hit) free = Math.min(free, hit.t - r / Math.max(0.25, -(dx * hit.normal.x + dy * hit.normal.y + dz * hit.normal.z)));
    // What the line of sight only passes over, too near to have the eye over it: a bowl's far side, a slope looked along.
    o.y = y - UNDER;
    if (free > CLOSEST && world.raycast(o, ray, this.#hit, free)) free = this.#hit.t;
    o.y = y;
    for (let k = 0; k < (wide ? 4 : 0); k++) {
      // Across (level, square to the line of sight) and up (square to both).
      const a = k === 0 ? r : k === 1 ? -r : 0;
      const b = k === 2 ? r : k === 3 ? -r : 0;
      const ex = dx * distance + cy * a - sy * sp * b;
      const ey = dy * distance + cp * b;
      const ez = dz * distance - sy * a - cy * sp * b;
      const length = Math.hypot(ex, ey, ez);
      ray.x = ex / length;
      ray.y = ey / length;
      ray.z = ez / length;
      if (world.raycast(o, ray, this.#hit, length)) free = Math.min(free, this.#hit.t * (distance / length) - r);
    }
    return Math.max(CLOSEST, free);
  }

  /** Whether the eye that far out toward (yaw, pitch) from the target, and the corners of the picture's near edge, are out of everything and above the surface. */
  #clearAt(yaw: number, pitch: number, reach: number, fov: number) {
    const world = this.#world;
    const cam = this.#camera;
    const t = this.target;
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    const sp = Math.sin(pitch);
    const cp = Math.cos(pitch);
    const ex = t.x + sy * cp * reach;
    const ey = t.y + sp * reach;
    const ez = t.z + cy * cp * reach;
    if (world.solidAt(ex, ey, ez) >= 0 || ey < world.heightAt(ex, ez, ey) + 2 * MARGIN) return false;
    const h = cam.near * Math.tan((fov * Math.PI) / 360);
    const w = h * cam.aspect;
    const c = this.#corner;
    for (let k = 0; k < 4; k++) {
      const a = k & 1 ? w : -w;
      const b = k & 2 ? h : -h;
      // Toward the fly by the near distance, and out to the corner across and up.
      c.set(ex - sy * cp * cam.near + cy * a - sy * sp * b, ey - sp * cam.near + cp * b, ez - cy * cp * cam.near - sy * a - cy * sp * b);
      if (world.solidAt(c.x, c.y, c.z) >= 0 || c.y < world.heightAt(c.x, c.z, c.y)) return false;
    }
    return true;
  }
}
