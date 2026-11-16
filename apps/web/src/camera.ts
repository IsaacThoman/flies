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
// without lagging off it. It never goes inside anything, and nothing big
// stands between it and the fly: a table top over the fly or a wall behind
// it brings the camera in front of it (at once), and it eases back out once
// clear.
//
// The shots are framed for the TV's 16:9. On a wider screen the camera sees
// more to the sides; on a narrower one (a tablet, a phone held upright) it
// sees more above and below, and comes in a little, so the fly is about as
// big on the screen as it is on the TV without leaving the picture as it
// turns (fieldOfView).
//
// The player can take hold of it too: look round the fly, or bring it in or
// take it out (a drag, a pinch, the wheel). Let go, it eases back to where
// the cameraman would have it.

import * as THREE from "three";
import { FLY_LENGTH } from "@fly/body";
import type { FlyBody } from "@fly/body";
import { createSurface, solidBottom, topPeak } from "@fly/world";
import type { RayHit, World } from "@fly/world";
import type { SceneCamera } from "./places/types.ts";
import { TV_ASPECT } from "./display.ts";

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

/** The player's views round the fly. In ordinary play (Follow) the fly is 120 to 200 pixels long; Close up and Wide are the choices either side. Whole table is the place's own (SceneCamera.whole). */
export const SHOTS: Record<Exclude<View, "table">, Shot> = {
  close: { around: "fly", distance: 6.2, height: 0.9, side: 1.25, low: -0.12, fov: 30, settle: 1.6, scout: true },
  follow: { around: "fly", distance: 11, height: 1.6, side: 1.85, low: 0.12, fov: 30, settle: 1.8, scout: true },
  wide: { around: "fly", distance: 30, height: 6, side: 2.1, low: 0.18, fov: 34, settle: 2.2, scout: true },
  above: { around: "fly", distance: 3.2, height: 13, side: Math.PI, low: 0, fov: 34, settle: 1.4 },
};

/** Behind the loading screen and the title: the fly small and to the left, clear of the wordmark and the menu on the right. */
const TITLE: Shot = { around: "fly", distance: 18, height: 2.2, side: 1.75, low: 0.1, fov: 30, settle: 3, orbit: 0.01, scout: true, across: -0.56 };

/** How the wallpaper films: one framing that follows the fly, or a round of shots held for a long or a shorter while. */
export type WallpaperStyle = "follow" | "calm" | "lively";

/** The wallpaper that just follows the fly: one medium shot, kept to the fly's side, never changing. */
const FOLLOW: Shot = { around: "fly", distance: 11, height: 1.6, side: 1.7, low: 0.1, fov: 28, settle: 3.5, scout: true };

/** The wallpaper's round of shots, in turn: medium, portrait, wide among the fruit, low across the cloth, from above. All stay on the fly: pulling out to the whole table and back reads as zooming. */
export const WALLPAPER: readonly Shot[] = [
  { around: "fly", distance: 11, height: 1.6, side: 1.7, low: 0.1, fov: 28, settle: 3.5, orbit: 0.012, scout: true },
  { around: "fly", distance: 5.5, height: 0.8, side: 1.1, low: 0.05, fov: 28, settle: 3.5, orbit: -0.01, scout: true },
  { around: "fly", distance: 42, height: 7, side: 2.3, low: 0.22, fov: 32, settle: 4, orbit: 0.008, scout: true },
  { around: "fly", distance: 18, height: 1.1, side: 2.0, low: 0.16, fov: 24, settle: 4, orbit: 0.01, scout: true },
  { around: "fly", distance: 4.5, height: 15, side: Math.PI, low: 0, fov: 34, settle: 3.5, orbit: 0.02 },
];

/**
 * How the shots round the fly follow a screen narrower than the TV's: the
 * share of the extra height kept as field of view. 1 would keep the TV's
 * width in the picture (the fly as small across as on the TV, with a great
 * deal of sky and table); 0.5 would keep the fly as many pixels long (and on
 * a phone held upright, too big to turn round in). Shots of the whole table
 * keep its width: it must fit.
 */
export const NARROW_KEEP = 0.7;

/** A shot's vertical field of view (degrees), framed for the TV's 16:9, on a screen of this shape. */
export function fieldOfView(fov: number, aspect: number, keep = NARROW_KEEP): number {
  if (aspect >= TV_ASPECT) return fov;
  const t = Math.tan((fov * Math.PI) / 360) * Math.pow(TV_ASPECT / aspect, keep);
  return (Math.atan(t) * 360) / Math.PI;
}

/** The views nearest first, for bringing the camera in and taking it out by hand. */
export const NEAR_TO_FAR: readonly View[] = ["close", "follow", "wide", "table"];

/** Seconds a look round by hand is held after it is let go, and how long it then takes to ease back. */
const LOOK_HOLD = 0.8;
const LOOK_SETTLE = 1.6;
/** How far the camera can be swung up or down by hand (radians of elevation). */
const LOOK_PITCH = [0.03, 1.45] as const;
/** The nearest the hand can bring it to the fly (mm), and how far past the whole table's shot it can take it out. */
const ZOOM_NEAREST = 4.5;
const ZOOM_FARTHEST = 1.3;

/** How far (mm) the camera keeps above whatever is under it, and from anything in the way. */
const CLEARANCE = 1.1;
/** What stands in the line of sight but not in it from this much higher (of the eye's distance, up to a few body lengths) is a bump it grazes, not in the way. */
const RAISE = 0.15;
const RAISE_MOST = 4 * FLY_LENGTH;
/** Something this near the fly's middle (mm) is right by it: the camera goes round it rather than in to it. */
const BY_THE_FLY = 2 * FLY_LENGTH;
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
  /**
   * The player's hand on the camera: radians round the fly from where the
   * cameraman stands, radians up or down, and how much farther (over 1) or
   * nearer. `held` while a finger or a button is on it; let go, the turn
   * eases back and the zoom is left for `letGo` to settle.
   */
  readonly look = { yaw: 0, pitch: 0, zoom: 1, held: false };
  /**
   * Where the screens leave room for the fly, from their layout: in the
   * title's shot, its place across and down the picture (as a Shot's
   * `across` and `low`); playing, how much lower than the shot says, and how
   * much wider its field of view (the tangent of half of it, over 1).
   */
  readonly room = { across: -0.56, low: 0.1, lower: 0, wider: 1 };
  #world: World;
  #scene!: SceneCamera;
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
  #target = new THREE.Vector3();
  #eye = new THREE.Vector3();
  #hit: RayHit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, solid: -1, t: 0 };
  #dir = { x: 0, y: 0, z: 0 };
  #from = { x: 0, y: 0, z: 0 };
  #under = createSurface();
  /** How far from what it films the eye may be, for what is in the way (Infinity: nothing is), and that reach's spring speed. */
  #arm = Infinity;
  #armV = new Float64Array(1);
  #title: Shot = { ...TITLE };
  /** Seconds since the hand let go, and the springs easing the look back. */
  #loose = 0;
  #lookV = new Float64Array(2);

  constructor(world: World, aspect: number, scene: SceneCamera) {
    this.#world = world;
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.5, 4000);
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
    this.#scene = scene;
    this.#started = false;
  }

  setView(view: View) {
    if (view === this.view) return;
    this.view = view;
    this.#orbit = 0;
    this.#scoutIn = 0;
  }

  /** The shot being taken now. */
  get shot(): Shot {
    if (this.title) {
      this.#title.across = this.room.across;
      this.#title.low = this.room.low;
      return this.#title;
    }
    if (!this.wallpaper) return this.view === "table" ? this.#scene.whole : SHOTS[this.view];
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
      const f = this.#scene.focus;
      if (f) focus.set(f.x + p.x * f.follow, f.y + p.y * 0.3, f.z + p.z * f.follow);
      else focus.set(p.x * 0.35, 60 + p.y * 0.3, p.z * 0.35);
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
    // A room's whole view may turn toward the fly from the point it circles.
    const lean = shot.around === "table" ? (this.#scene.focus?.aim ?? 0) : 0;
    const target = this.#target.set(focus.x + (p.x - focus.x) * lean, focus.y + (p.y - focus.y) * lean, focus.z + (p.z - focus.z) * lean);

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
    // Playing, the HUD's room: the wallpaper and the title have the screen to themselves.
    const hud = !this.title && !this.wallpaper;
    if (hud && this.room.wider !== 1) fov = (Math.atan(Math.tan((fov * Math.PI) / 360) * this.room.wider) * 360) / Math.PI;
    this.#fov = damp(this.#fov, fov, s, 9, fovSettle, dt);
    this.#low = damp(this.#low, shot.low + (hud ? this.room.lower : 0), s, 10, settle * 0.8, dt);
    const look = this.#easeLook(dt);
    const view = fieldOfView(this.#fov, cam.aspect, shot.around === "table" ? 1 : NARROW_KEEP);

    const eye = this.#eye;
    const az = this.#azimuth + look.yaw;
    // The player's hand swings it up or down round the fly, and in or out.
    let reach = this.#distance * look.zoom;
    let rise = this.#height * look.zoom;
    if (look.pitch !== 0) {
      const r = Math.hypot(reach, rise);
      const up = Math.min(LOOK_PITCH[1], Math.max(LOOK_PITCH[0], Math.atan2(rise, reach) + look.pitch));
      reach = Math.cos(up) * r;
      rise = Math.sin(up) * r;
    }
    eye.set(c.x + Math.sin(az) * reach, c.y + rise, c.z + Math.cos(az) * reach);
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
      const least = Math.hypot(shot.distance, shot.height) * 0.75 * Math.min(1, look.zoom);
      if (near < least) {
        const k = least / Math.max(1e-6, near);
        eye.set(focus.x + dx * k, focus.y + dy * k, focus.z + dz * k);
      }
    }
    this.#keepInSight(focus, eye, settle, dt);

    // Aim so the fly sits `low` below the middle of the picture.
    const ground = Math.hypot(eye.x - c.x, eye.z - c.z);
    const drop = Math.atan2(eye.y - c.y, Math.max(1e-3, ground)) - Math.atan(this.#low * Math.tan((view * Math.PI) / 360));
    const lift = eye.y - c.y - ground * Math.tan(drop);
    // Aimed ahead by about what the spring lags, so a jump stays in the picture; never more than a few body lengths.
    const speed = Math.hypot(v.x, v.y, v.z);
    const lead = shot.around === "fly" && speed > 0 ? Math.min(aimSettle, MAX_LEAD / speed) : 0;
    // To put the fly to one side, aim the other way along the camera's right.
    const aside = -(shot.across ?? 0) * ground * Math.tan((view * Math.PI) / 360) * this.camera.aspect;
    const a = this.#aim;
    a.x = damp(a.x, target.x + v.x * lead + Math.cos(az) * aside, s, 3, aimSettle, dt);
    a.y = damp(a.y, target.y + lift + v.y * lead, s, 4, aimSettle, dt);
    a.z = damp(a.z, target.z + v.z * lead - Math.sin(az) * aside, s, 5, aimSettle, dt);
    this.#started = true;

    cam.position.copy(eye);
    cam.lookAt(a);
    if (Math.abs(cam.fov - view) > 0.01) {
      cam.fov = view;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  /**
   * Keeps the eye out of everything, with nothing between it and the focus.
   * Inside something, it rides up over it if the fly is in sight from there
   * (a strawberry under a wide shot), as it always has. Anything else in the
   * way (a wall behind it, a table top over the fly) brings it in front of
   * that, at once, and it eases back out once clear. But a bump the line of
   * sight only grazes (one it would clear from a little higher), and
   * something right by the fly, are left for the cameraman to go round
   * (#chooseSide) rather than coming in to the fly's side. Last, it keeps
   * clear of the surface under it and of anything over it.
   */
  #keepInSight(focus: THREE.Vector3, eye: THREE.Vector3, settle: number, dt: number) {
    const world = this.#world;
    const over = world.topAbove(eye.x, eye.y, eye.z) + CLEARANCE;
    if (over > eye.y + CLEARANCE && this.#inSight(focus, eye.x, over, eye.z) === Infinity) eye.y = over;
    const wanted = eye.distanceTo(focus);
    if (wanted > 1e-6) {
      const clear = this.#inSight(focus, eye.x, eye.y, eye.z);
      if (clear < this.#arm) {
        this.#arm = clear;
        this.#armV[0] = 0;
      } else if (this.#arm !== Infinity) {
        this.#arm = damp(this.#arm, Math.min(clear, wanted + 1), this.#armV, 0, settle * 0.5, dt);
        if (this.#arm >= Math.min(clear, wanted)) this.#arm = clear;
      }
      if (this.#arm < wanted) {
        const k = this.#arm / wanted;
        eye.set(focus.x + (eye.x - focus.x) * k, focus.y + (eye.y - focus.y) * k, focus.z + (eye.z - focus.z) * k);
      }
    }
    const s = world.surface(eye.x, eye.z, this.#under, eye.y);
    eye.y = s.underside - s.y < 2 * CLEARANCE ? (s.y + s.underside) / 2 : Math.min(s.underside - CLEARANCE, Math.max(s.y + CLEARANCE, eye.y));
  }

  /** How far toward an eye at (x, y, z) the camera can be with nothing in the way between it and the focus (see #keepInSight), or Infinity when nothing is. */
  #inSight(focus: THREE.Vector3, x: number, y: number, z: number): number {
    const world = this.#world;
    const d = this.#dir;
    const wanted = Math.hypot(x - focus.x, y - focus.y, z - focus.z);
    if (wanted < 1e-6) return Infinity;
    d.x = (x - focus.x) / wanted;
    d.y = (y - focus.y) / wanted;
    d.z = (z - focus.z) / wanted;
    const hit = world.raycast(focus, d, this.#hit, wanted + CLEARANCE);
    if (!hit) return Infinity;
    // Short of it by the clearance, measured square to it (but not without end, grazing it).
    const clear = Math.max(hit.t * 0.5, hit.t - CLEARANCE / Math.max(0.25, -(d.x * hit.normal.x + d.y * hit.normal.y + d.z * hit.normal.z)));
    if (world.solidAt(x, y, z) >= 0) return clear;
    if (hit.t < BY_THE_FLY) return Infinity;
    const graze = Math.max(CLEARANCE, Math.min(RAISE_MOST, wanted * RAISE));
    const r = this.#from;
    const length = Math.hypot(x - focus.x, y + graze - focus.y, z - focus.z);
    r.x = (x - focus.x) / length;
    r.y = (y + graze - focus.y) / length;
    r.z = (z - focus.z) / length;
    return world.raycast(focus, r, this.#hit, length) ? clear : Infinity;
  }

  /** The look by hand, eased back to nothing once let go and left a moment. */
  #easeLook(dt: number) {
    const look = this.look;
    if (look.held) {
      this.#loose = 0;
      this.#lookV.fill(0);
      return look;
    }
    this.#loose += dt;
    if (this.#loose > LOOK_HOLD) {
      look.yaw = Math.abs(look.yaw) < 1e-4 ? 0 : damp(look.yaw, 0, this.#lookV, 0, LOOK_SETTLE, dt);
      look.pitch = Math.abs(look.pitch) < 1e-4 ? 0 : damp(look.pitch, 0, this.#lookV, 1, LOOK_SETTLE, dt);
    }
    return look;
  }

  /** Turns the camera round the fly by hand (radians round, and up), no further up or down than it can go from where the shot has it, so that turning back takes effect at once. */
  turnBy(yaw: number, pitch: number) {
    const look = this.look;
    look.yaw = wrap(look.yaw + yaw);
    const up = Math.atan2(this.#height, this.#distance);
    look.pitch = Math.max(LOOK_PITCH[0] - up, Math.min(LOOK_PITCH[1] - up, look.pitch + pitch));
  }

  /** Brings the camera in (under 1) or takes it out by hand, by this factor. */
  zoomBy(factor: number) {
    const reach = Math.hypot(this.#distance, this.#height);
    const whole = this.#scene.whole;
    const look = this.look;
    look.zoom = Math.min((Math.hypot(whole.distance, whole.height) * ZOOM_FARTHEST) / reach, Math.max(ZOOM_NEAREST / reach, look.zoom * factor));
  }

  /**
   * The hand has let go of the zoom: the view nearest to where it was left
   * (null if it is still nearest the one it was in), with the camera left
   * exactly where it is, to ease from there into that view.
   */
  letGo(): View | null {
    const look = this.look;
    look.held = false;
    if (look.zoom === 1) return null;
    this.#distance *= look.zoom;
    this.#height *= look.zoom;
    const reach = Math.hypot(this.#distance, this.#height);
    look.zoom = 1;
    let best: View | null = null;
    let bestGap = Infinity;
    for (const view of NEAR_TO_FAR) {
      const shot = view === "table" ? this.#scene.whole : SHOTS[view];
      // The whole table's shot circles the table, not the fly: as far from the fly as from its middle, near enough.
      const gap = Math.abs(Math.log(reach / Math.hypot(shot.distance, shot.height)));
      if (gap < bestGap) {
        bestGap = gap;
        best = view;
      }
    }
    return best === this.view ? null : best;
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
    // Clear of the surface under it and of anything over it (not inside anything).
    const under = world.surface(ex, ez, this.#under, ey);
    if (ey < under.y + CLEARANCE || ey > under.underside - CLEARANCE) return -Infinity;
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
    // What's behind the fly from there: something standing on the table, the nearer and taller (bottom to top) the better; else the place's view.
    const gx = -d.x;
    const gz = -d.z;
    const gl = Math.hypot(gx, gz) || 1;
    d.x = gx / gl;
    d.y = 0.06;
    d.z = gz / gl;
    from.x = f.x + d.x * 3;
    from.y = f.y + 0.5;
    from.z = f.z + d.z * 3;
    let score = Math.max(0, d.x * this.#scene.vista.x + d.z * this.#scene.vista.z) * 0.15;
    const hit = world.raycast(from, d, this.#hit);
    if (hit && hit.solid >= 0 && hit.t < 400) {
      const solid = world.solids[hit.solid];
      score += Math.min(1, (topPeak(solid.top) - solidBottom(solid)) / 30) * (1 - hit.t / 500) * 0.8;
    }
    return score;
  }

  /** Puts the camera straight into the shot's place. */
  #jump(focus: THREE.Vector3, shot: Shot, distance: number, height: number) {
    this.#arm = Infinity;
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
