// The camera: the views the player can choose between, and the wallpaper's
// slow, unhurried filming of the fly when nobody is holding the remote.
//
// It works like a patient nature cameraman. Round the fly it keeps a place
// (an angle round it, a distance and a height) and moves that place only
// when it has to: when the fly has turned so that it would be seen head-on
// or from behind for a while, when something is in the way, or when there is
// a better background to one side (fruit, a jar, the lake). It never crosses
// over the fly to the other side unless it must, and every move eases in and
// out (critically damped springs, so nothing overshoots or pops). It aims a
// little ahead of where the fly is going, so it follows a walk or a jump
// without lagging off it. It never goes inside anything on the table.

import * as THREE from "three";
import { FLY_LENGTH } from "@fly/body";
import type { FlyBody } from "@fly/body";
import { topPeak } from "@fly/world";
import type { RayHit, World } from "@fly/world";

export type View = "close" | "follow" | "wide" | "table" | "above";
export const VIEWS: readonly View[] = ["close", "follow", "wide", "table", "above"];
export const VIEW_NAMES: Record<View, string> = { close: "Close up", follow: "Follow", wide: "Wide", table: "Whole table", above: "From above" };

/** A camera placement. */
export type Shot = {
  /** Round the fly, or round the table's middle. */
  around: "fly" | "table";
  /** From the fly's middle (or the table's focus), mm: along the ground, and up. */
  distance: number;
  height: number;
  /** Where the camera likes to stand, radians off the fly's heading (0 in front of it, π behind), either side. For the table, the angle round it. */
  side: number;
  /** Where the fly sits in the picture: this fraction of the half-height below the middle. */
  low: number;
  /** Vertical field of view, degrees. */
  fov: number;
  /** Seconds the camera takes to settle into a new place round the fly. */
  settle: number;
  /** Slow drift round the focus, rad/s. */
  orbit?: number;
  /** Looks round for something worth having behind the fly. */
  scout?: boolean;
  /** Where the fly sits across the picture: this fraction of the half-width to the right (negative: left). */
  across?: number;
};

/** The player's views. In ordinary play (Follow) the fly is 120 to 200 pixels long; Close up and Wide are the choices either side. */
export const SHOTS: Record<View, Shot> = {
  close: { around: "fly", distance: 6.2, height: 0.9, side: 1.25, low: -0.12, fov: 30, settle: 1.6, scout: true },
  follow: { around: "fly", distance: 11, height: 1.6, side: 1.85, low: 0.12, fov: 30, settle: 1.8, scout: true },
  wide: { around: "fly", distance: 30, height: 6, side: 2.1, low: 0.18, fov: 34, settle: 2.2, scout: true },
  table: { around: "table", distance: 560, height: 170, side: 0.25, low: 0, fov: 40, settle: 1.6, orbit: 0.03 },
  above: { around: "fly", distance: 3.2, height: 13, side: Math.PI, low: 0, fov: 34, settle: 1.4 },
};

/** Behind the loading screen and the title: the fly small and to the left, clear of the wordmark and the menu on the right. */
const TITLE: Shot = { around: "fly", distance: 18, height: 2.2, side: 1.75, low: 0.1, fov: 30, settle: 3, orbit: 0.01, scout: true, across: -0.56 };

/** How the wallpaper films: one framing that follows the fly, or a round of shots held for a long or a shorter while. */
export type WallpaperStyle = "follow" | "calm" | "lively";

/** The wallpaper that just follows the fly: one medium shot, kept to the fly's side, never changing. */
const FOLLOW: Shot = { around: "fly", distance: 11, height: 1.6, side: 1.7, low: 0.1, fov: 28, settle: 3.5, scout: true };

/** The wallpaper's round of shots, in turn: medium, portrait, wide among the fruit, low across the cloth, from above. All stay on the fly: pulling out to the whole table and back reads as zooming. */
const WALLPAPER: readonly Shot[] = [
  { around: "fly", distance: 11, height: 1.6, side: 1.7, low: 0.1, fov: 28, settle: 3.5, orbit: 0.012, scout: true },
  { around: "fly", distance: 5.5, height: 0.8, side: 1.1, low: 0.05, fov: 28, settle: 3.5, orbit: -0.01, scout: true },
  { around: "fly", distance: 42, height: 7, side: 2.3, low: 0.22, fov: 32, settle: 4, orbit: 0.008, scout: true },
  { around: "fly", distance: 18, height: 1.1, side: 2.0, low: 0.16, fov: 24, settle: 4, orbit: 0.01, scout: true },
  { around: "fly", distance: 4.5, height: 15, side: Math.PI, low: 0, fov: 34, settle: 3.5, orbit: 0.02 },
];

/** How far (mm) the camera keeps above whatever is under it. */
const CLEARANCE = 1.1;
/** The fly's middle, above its feet, mm. */
const MIDDLE = 0.3 * FLY_LENGTH;
/** The furthest (mm) the camera aims ahead of a moving fly. */
const MAX_LEAD = 12;
/** How often (s) the camera reconsiders where to stand, and how long a better place must stay better before it moves there. */
const SCOUT_EVERY = 0.35;
const PATIENCE = 1.2;
/** Placings tried each side of the preferred one, and how far apart (rad). */
const TRIES = 2;
const TRY_STEP = 0.32;

/** A critically damped spring on one number: no overshoot, continuous speed. Returns the new value and leaves the speed in `v[i]`. */
function damp(current: number, target: number, v: Float64Array, i: number, settle: number, dt: number) {
  const omega = 2 / Math.max(1e-3, settle);
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (v[i] + omega * change) * dt;
  v[i] = (v[i] - omega * temp) * decay;
  return target + (change + temp) * decay;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera;
  view: View = "follow";
  wallpaper = false;
  wallpaperStyle: WallpaperStyle = "follow";
  /** On the loading screen and the title, which have their own shot. */
  title = false;
  /** How many times the wallpaper has moved on to its next shot by itself, for things that move with it. */
  shotChanges = 0;
  /**
   * Where to stand when something is about to happen that should be seen
   * from there (the ball's dive, seen past the fly): the camera's angle round
   * the fly less the fly's heading. Null to choose freely.
   */
  prefer: number | null = null;
  /** Pins the camera (for screenshots and art): eye and target, or null to let it move. */
  pinned: { eye: THREE.Vector3Like; target: THREE.Vector3Like; fov?: number } | null = null;
  #world: World;
  /** The camera's place: the point it circles (smoothed), its angle round it, distance, height, and where it aims. */
  #center = new THREE.Vector3();
  #aim = new THREE.Vector3();
  #azimuth = 0;
  #distance = 10;
  #height = 2;
  #fov = 30;
  #low = 0;
  /** Spring speeds: center xyz, aim xyz, azimuth, distance, height, fov, low. */
  #v = new Float64Array(11);
  /** The angle round the fly the camera is making for, and one it is considering. */
  #goal = 0;
  #pending = 0;
  #pendingFor = 0;
  #scoutIn = 0;
  #orbit = 0;
  #shot = 0;
  #shotTime = 0;
  #started = false;
  #time = 0;
  #focus = new THREE.Vector3();
  #eye = new THREE.Vector3();
  #hit: RayHit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, solid: -1, t: 0 };
  #dir = { x: 0, y: 0, z: 0 };
  #from = { x: 0, y: 0, z: 0 };

  constructor(world: World, aspect: number) {
    this.#world = world;
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.5, 4000);
  }

  setView(view: View) {
    if (view === this.view) return;
    this.view = view;
    this.#orbit = 0;
    this.#scoutIn = 0;
  }

  /** The shot being taken now. */
  get shot(): Shot {
    if (this.title) return TITLE;
    if (!this.wallpaper) return SHOTS[this.view];
    return this.wallpaperStyle === "follow" ? FOLLOW : WALLPAPER[this.#shot];
  }

  /** Moves the camera on by `dt` seconds, framing the fly. */
  update(body: FlyBody, dt: number) {
    this.#time += dt;
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
    if (this.wallpaper && !this.title && this.wallpaperStyle !== "follow") {
      this.#shotTime += dt;
      if (this.#shotTime > (this.wallpaperStyle === "lively" ? 14 : 24)) {
        this.#shotTime = 0;
        this.#shot = (this.#shot + 1) % WALLPAPER.length;
        this.#orbit = 0;
        this.#scoutIn = 0;
        this.shotChanges++;
      }
    }
    const shot = this.shot;
    this.#orbit += (shot.orbit ?? 0) * dt;
    const airborne = body.mode === "airborne";
    const p = body.position;
    const v = body.velocity;

    // What the camera circles, and how quickly it keeps up: a fly in the air moves a hundred times faster than one walking.
    const focus = this.#focus;
    let distance = shot.distance;
    let height = shot.height;
    let settle = shot.settle;
    let fov = shot.fov;
    let fovSettle = settle * 0.8;
    let follow: number;
    let aimSettle: number;
    if (shot.around === "table") {
      focus.set(p.x * 0.35, 60 + p.y * 0.3, p.z * 0.35);
      this.#goal = shot.side + this.#orbit;
      follow = settle;
      aimSettle = settle * 0.8;
    } else {
      focus.set(p.x, p.y + MIDDLE, p.z);
      if (airborne) {
        // Pulled back to keep a jump in the picture, and quick to follow it; aimed ahead by what the springs would lag.
        distance = Math.max(distance * 2.8, 22);
        height = Math.max(height * 2, 4);
        follow = 0.35;
        aimSettle = 0.06;
        settle = 1.2;
        fov = Math.max(fov, 52);
        fovSettle = 0.25;
      } else {
        follow = 0.9;
        aimSettle = 0.35;
      }
      this.#chooseSide(body, shot, distance, height, dt);
    }
    if (!this.#started) this.#jump(focus, shot, distance, height);

    const s = this.#v;
    const c = this.#center;
    // Walking, it keeps pace a little ahead, as the spring would otherwise trail by the fly's speed times its settling time.
    const pace = Math.hypot(v.x, v.z);
    const ahead = shot.around === "fly" && !airborne && pace > 0 ? Math.min(follow, (MAX_LEAD * 0.5) / pace) : 0;
    c.x = damp(c.x, focus.x + v.x * ahead, s, 0, follow, dt);
    c.y = damp(c.y, focus.y, s, 1, follow, dt);
    c.z = damp(c.z, focus.z + v.z * ahead, s, 2, follow, dt);
    const goal = this.#azimuth + wrap(this.#goal - this.#azimuth);
    this.#azimuth = wrap(damp(this.#azimuth, goal, s, 6, settle, dt));
    this.#distance = damp(this.#distance, distance, s, 7, settle * 0.8, dt);
    this.#height = damp(this.#height, height, s, 8, settle * 0.8, dt);
    this.#fov = damp(this.#fov, fov, s, 9, fovSettle, dt);
    this.#low = damp(this.#low, shot.low, s, 10, settle * 0.8, dt);

    const eye = this.#eye;
    const az = this.#azimuth;
    eye.set(c.x + Math.sin(az) * this.#distance, c.y + this.#height, c.z + Math.cos(az) * this.#distance);
    // A breath of movement in the wallpaper's long shots, as if the camera were on a sandbag rather than a tripod.
    if (this.wallpaper) {
      eye.x += Math.sin(this.#time * 0.23) * this.#distance * 0.006;
      eye.y += Math.sin(this.#time * 0.31) * this.#distance * 0.004;
    }
    // However the springs lag (a landing, a sudden turn), never closer to the fly than most of the shot's distance.
    if (shot.around === "fly") {
      const dx = eye.x - focus.x;
      const dy = eye.y - focus.y;
      const dz = eye.z - focus.z;
      const near = Math.hypot(dx, dy, dz);
      const least = Math.hypot(shot.distance, shot.height) * 0.75;
      if (near < least) {
        const k = least / Math.max(1e-6, near);
        eye.set(focus.x + dx * k, focus.y + dy * k, focus.z + dz * k);
      }
    }
    const floor = this.#world.heightAt(eye.x, eye.z);
    if (eye.y < floor + CLEARANCE) eye.y = floor + CLEARANCE;

    // Aim so the fly sits `low` below the middle of the picture.
    const ground = Math.hypot(eye.x - c.x, eye.z - c.z);
    const drop = Math.atan2(eye.y - c.y, Math.max(1e-3, ground)) - Math.atan(this.#low * Math.tan((this.#fov * Math.PI) / 360));
    const lift = eye.y - c.y - ground * Math.tan(drop);
    // Aimed ahead by about what the spring lags, so a jump stays in the picture; never more than a few body lengths.
    const speed = Math.hypot(v.x, v.y, v.z);
    const lead = shot.around === "fly" && speed > 0 ? Math.min(aimSettle, MAX_LEAD / speed) : 0;
    // To put the fly to one side, aim the other way along the camera's right.
    const aside = -(shot.across ?? 0) * ground * Math.tan((this.#fov * Math.PI) / 360) * this.camera.aspect;
    const a = this.#aim;
    a.x = damp(a.x, focus.x + v.x * lead + Math.cos(az) * aside, s, 3, aimSettle, dt);
    a.y = damp(a.y, focus.y + lift + v.y * lead, s, 4, aimSettle, dt);
    a.z = damp(a.z, focus.z + v.z * lead - Math.sin(az) * aside, s, 5, aimSettle, dt);
    this.#started = true;

    cam.position.copy(eye);
    cam.lookAt(a);
    if (Math.abs(cam.fov - this.#fov) > 0.01) {
      cam.fov = this.#fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  /**
   * Where round the fly to stand: the shot's preferred angle off its heading,
   * on the side the camera is already on, unless it is better elsewhere for
   * long enough. Better is: not blocked, not inside anything, near the
   * preferred angle, near where the camera is, with something behind the fly.
   */
  #chooseSide(body: FlyBody, shot: Shot, distance: number, height: number, dt: number) {
    if (body.mode === "airborne") return;
    this.#scoutIn -= dt;
    if (this.#scoutIn > 0 && this.#started) return;
    const elapsed = SCOUT_EVERY - this.#scoutIn;
    this.#scoutIn = SCOUT_EVERY;
    const heading = body.yaw;
    const facing = Math.sin(this.#azimuth - heading) >= 0 ? 1 : -1;
    let best = -Infinity;
    let bestAngle = this.#goal;
    const preferring = this.prefer !== null && !this.wallpaper && !this.title && shot.side !== Math.PI;
    const side = preferring ? Math.abs(this.prefer!) : shot.side;
    for (let sideSign = -1; sideSign <= 1; sideSign += 2) {
      // Straight behind or in front there's only one side; a preferred side is one side.
      if (sideSign === 1 && (side === Math.PI || side === 0)) continue;
      if (preferring && sideSign !== Math.sign(this.prefer!)) continue;
      for (let k = -TRIES; k <= TRIES; k++) {
        const angle = wrap(heading + sideSign * (side + k * TRY_STEP) + this.#orbit);
        let score = this.#score(angle, distance, height, shot);
        if (score === -Infinity) continue;
        score -= Math.abs(k) * 0.2;
        if (this.#started && !preferring) {
          if (sideSign !== facing) score -= 0.5;
          score -= Math.abs(wrap(angle - this.#azimuth)) * 0.25;
        }
        if (score > best) {
          best = score;
          bestAngle = angle;
        }
      }
    }
    if (!this.#started) {
      this.#goal = bestAngle;
      return;
    }
    // Stay put while where it is making for still works and nothing is much better.
    const current = this.#score(this.#goal, distance, height, shot);
    const offPreferred = Math.abs(Math.abs(wrap(this.#goal - heading - this.#orbit)) - side);
    // Making for a preferred side: go now, if where it's headed isn't already on it.
    if (preferring && Math.abs(wrap(this.#goal - heading - this.prefer!)) > TRY_STEP * (TRIES + 0.5)) {
      this.#goal = bestAngle;
      this.#pendingFor = 0;
      return;
    }
    const currentScore = current - (offPreferred / TRY_STEP) * 0.2 - Math.abs(wrap(this.#goal - this.#azimuth)) * 0.25;
    if (current === -Infinity) {
      this.#goal = bestAngle;
      this.#pendingFor = 0;
      return;
    }
    if (best < currentScore + 0.3) {
      this.#pendingFor = 0;
      return;
    }
    if (Math.abs(wrap(bestAngle - this.#pending)) > 0.4) this.#pendingFor = 0;
    this.#pending = bestAngle;
    this.#pendingFor += elapsed;
    if (this.#pendingFor >= PATIENCE) {
      this.#goal = bestAngle;
      this.#pendingFor = 0;
    }
  }

  /** How good a place round the fly is: -Infinity if the camera can't stand there or can't see the fly from it. */
  #score(angle: number, distance: number, height: number, shot: Shot): number {
    const world = this.#world;
    const f = this.#focus;
    const ex = f.x + Math.sin(angle) * distance;
    const ez = f.z + Math.cos(angle) * distance;
    const ey = f.y + height;
    if (world.heightAt(ex, ez) + CLEARANCE > ey) return -Infinity;
    // Can it see the fly?
    const d = this.#dir;
    const from = this.#from;
    const length = Math.hypot(ex - f.x, ey - f.y, ez - f.z);
    d.x = (ex - f.x) / length;
    d.y = (ey - f.y) / length;
    d.z = (ez - f.z) / length;
    from.x = f.x + d.x * 0.5;
    from.y = f.y + d.y * 0.5;
    from.z = f.z + d.z * 0.5;
    if (world.raycast(from, d, this.#hit) && this.#hit.t < length - 0.5) return -Infinity;
    if (!shot.scout) return 0;
    // What's behind the fly from there: something standing on the table, the nearer and taller the better; else the lake.
    const gx = -d.x;
    const gz = -d.z;
    const gl = Math.hypot(gx, gz) || 1;
    d.x = gx / gl;
    d.y = 0.06;
    d.z = gz / gl;
    from.x = f.x + d.x * 3;
    from.y = f.y + 0.5;
    from.z = f.z + d.z * 3;
    let score = Math.max(0, -d.z) * 0.15;
    const hit = world.raycast(from, d, this.#hit);
    if (hit && hit.solid >= 0 && hit.t < 400) {
      const solid = world.solids[hit.solid];
      score += Math.min(1, topPeak(solid.top) / 30) * (1 - hit.t / 500) * 0.8;
    }
    return score;
  }

  /** Puts the camera straight into the shot's place. */
  #jump(focus: THREE.Vector3, shot: Shot, distance: number, height: number) {
    this.#center.copy(focus);
    this.#aim.copy(focus);
    this.#azimuth = this.#goal;
    this.#distance = distance;
    this.#height = height;
    this.#fov = shot.fov;
    this.#low = shot.low;
    this.#v.fill(0);
  }

  /** Starts the wallpaper on the next of its shots. */
  startWallpaper() {
    this.wallpaper = true;
    this.#shotTime = 0;
    this.#shot = (this.#shot + 1) % WALLPAPER.length;
    this.#scoutIn = 0;
  }

  stopWallpaper() {
    this.wallpaper = false;
    this.#scoutIn = 0;
  }

  /** Jumps straight to the current shot (after a cut). */
  snap() {
    this.#started = false;
  }
}
