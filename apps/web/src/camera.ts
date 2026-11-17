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
// without lagging off it. It never goes inside anything, nor near enough a
// surface for the edge of the picture to cut into it, and nothing big stands
// between it and the fly: a table top over the fly, a wall behind it or a
// bottle it is turned past brings the camera in front of it, coming in
// quickly but smoothly, before it gets there, and easing back out once clear.
//
// The shots are framed for the TV's 16:9. On a wider screen the camera sees
// more to the sides; on a narrower one (a tablet, a phone held upright) it
// sees more above and below, and comes in a little, so the fly is about as
// big on the screen as it is on the TV without leaving the picture as it
// turns (fieldOfView).
//
// The player can take hold of it too. Turned round the fly by hand, it stays
// where it was put for a few seconds after the hand lets go; then the
// cameraman carries on from there, moving only when it would have anyway.
// Brought in or taken out (the wheel, a pinch, the View tool), it goes
// smoothly along one range, from the facets of the fly's eyes out to the whole
// place, and stays there: the named views are points along it. A camera a
// mouse or a trackpad has turned or zoomed is kept where it was put, at that
// angle round the fly and that height, for as long as the player likes: the
// cameraman leaves it alone. Wherever the hand has taken it, `handBack` gives
// it back to the cameraman at once, and so does choosing a named view.

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
export type WallpaperStyle = "follow" | "calm" | "lively" | "whole";

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

/**
 * The level shots round the fly that the hand zooms between, nearest first:
 * near enough for the facets of its eyes, Close up, Follow and Wide. Past
 * Wide the range goes on out to the place's whole-table shot, turning from
 * the fly to the table's middle as it goes.
 */
const LEVEL: readonly Shot[] = [{ around: "fly", distance: 2.4, height: 0.4, side: 1.15, low: -0.15, fov: 30, settle: 1.4, scout: true }, SHOTS.close, SHOTS.follow, SHOTS.wide];
/** The nearest the camera comes to the fly's middle, mm. */
export const NEAREST = Math.hypot(LEVEL[0].distance, LEVEL[0].height);
const reachOf = (shot: Shot) => Math.hypot(shot.distance, shot.height);
const elevationOf = (shot: Shot) => Math.atan2(shot.height, shot.distance);

/** Seconds the camera stays where the hand left it before the cameraman takes it again, and how long the tilt then takes to ease back (or, handed back at once, takes). */
export const HAND_HOLD = 5;
const TILT_SETTLE = 2;
const TILT_SETTLE_NOW = 0.7;
/** While the hand zooms, the camera follows it this quickly (s), rather than at the shots' unhurried pace. */
const ZOOM_SETTLE = 0.18;
/** How far the camera can be swung up or down by hand (radians of elevation). */
const LOOK_PITCH = [0.03, 1.45] as const;

/** How far (mm) the camera keeps above whatever is under it, and from anything in the way: more than the near edge of the picture is from the eye. */
const CLEARANCE = 1.1;
/** Inside something whose top is no more than this (mm) over it, the eye rises over it rather than coming in. */
const RISE = CLEARANCE;
/** In something all the same, it goes out over it rather than in front of it if its top is no higher than this over it (of its distance from the fly). */
const CLIMB = 0.5;
/** Seconds the eye takes to come in before something in the way (quick, but over several frames), and to go back out once the way has been clear for a moment (s). */
const PULL_IN = 0.1;
const LET_OUT = 0.9;
const CLEAR_FOR = 0.35;
/** How much farther out the way must be clear (of the eye's distance) before it goes back out. */
const SLACK = 0.06;
/** The feelers either side of the line of sight reach out this far at the eye (of its distance), and as far again as it is going sideways in this long (s). */
const FEEL = 0.25;
const FEEL_AHEAD = 0.4;
/** Feelers: one behind the eye, the rest ahead of it. */
const FEELERS = 4;
/** What stands in the line of sight but not in it from this much higher (of the eye's distance, up to a few body lengths) is a bump it grazes, not in the way. */
const RAISE = 0.15;
const RAISE_MOST = 4 * FLY_LENGTH;
/** Something this near the fly's middle (mm) is right by it: the camera goes round it rather than in to it. */
const BY_THE_FLY = 2 * FLY_LENGTH;
/** The fly's middle, above its feet, mm. */
const MIDDLE = 0.3 * FLY_LENGTH;
/** The furthest (mm) the camera aims ahead of a moving fly. */
const MAX_LEAD = 12;
/** How far ahead of a flying fly (mm) the camera's middle may be led, coming in between these times (s) in the air. */
const FLIGHT_LEAD = 120;
const FLIGHT_LEAD_AFTER = [0.25, 0.6] as const;
/** How often (s) the camera reconsiders where to stand, and how long a better place must stay better before it moves there. */
const SCOUT_EVERY = 0.35;
const PATIENCE = 1.2;
/** Placings tried each side of the preferred one, and how far apart (rad). */
const TRIES = 2;
const TRY_STEP = 0.32;
/** How much the place's view is worth behind the fly: as much as something tall standing on the table some 280 mm behind it. */
const VISTA = 0.35;

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
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera;
  /** The named view the camera is at, or nearest to (the View tool shows it). */
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
   * The player's hand on the camera: `held` while a finger, a button, a key
   * or a stick is turning it; `pitch`, how far (radians) it has been swung up
   * or down from the shot's height; `kept`, put somewhere by a mouse or a
   * trackpad, which orbit freely, and left there until it is handed back.
   */
  readonly hand = { held: false, pitch: 0, kept: false };
  /**
   * Where the screens leave room for the fly, from their layout: in the
   * title's shot, its place across and down the picture (as a Shot's
   * `across` and `low`); playing, how much lower than the shot says, and how
   * much wider its field of view (the tangent of half of it, over 1).
   */
  readonly room = { across: -0.56, low: 0.1, lower: 0, wider: 1 };
  #world: World;
  #scene!: SceneCamera;
  /** How far out the range goes in this place: the whole-table shot's reach. */
  #farthest = 600;
  /** The camera's place: the point it circles (smoothed), its angle round it, distance, height, and where it aims. */
  #center = new THREE.Vector3();
  #aim = new THREE.Vector3();
  #azimuth = 0;
  #distance = 10;
  #height = 2;
  #fov = 30;
  #low = 0;
  /** Where the fly sits across the picture, eased: the title's menu fading into the wallpaper brings it from the side to the middle, and back. */
  #across = 0;
  /** Spring speeds: center xyz, aim xyz, azimuth, distance, height, fov, low, across. */
  #v = new Float64Array(12);
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
  #sight = new THREE.Vector3();
  #eye = new THREE.Vector3();
  #hit: RayHit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, solid: -1, t: 0 };
  #dir = { x: 0, y: 0, z: 0 };
  #from = { x: 0, y: 0, z: 0 };
  #under = createSurface();
  /** How far from what it films the eye may be, for what is in the way (Infinity: nothing is), that reach's spring speed, how long the way has been clear farther out, and the nearest it has had to be since. */
  #arm = Infinity;
  #armV = new Float64Array(1);
  #clearFor = 0;
  #held = Infinity;
  /** Just cut to a new shot: the reach is what the way allows, at once. */
  #fresh = true;
  /** Where the eye was meant to be last frame, for which way it is going. */
  #was = new THREE.Vector3();
  /** A feeler's way, and how far the line of sight is clear for what it meets, whatever that is. */
  #ray = { x: 0, y: 0, z: 0 };
  #raw = Infinity;
  #title: Shot = { ...TITLE };
  /** Where the player has the camera along the range (mm from the focus), and whether it looks straight down (From above) or across. */
  #reach = reachOf(SHOTS.follow);
  #above = false;
  /** The shot at that reach, worked out each frame. */
  #made: Shot = { ...SHOTS.follow };
  /** Seconds the camera stays where the hand left it; seconds it follows a zoom quickly; the hand's turn of the whole-table shot. */
  #handFor = 0;
  #zooming = 0;
  #tableTurn = 0;
  #tableDrift = 0;
  /** Seconds the fly has been in the air, 0 on its feet. */
  #aloft = 0;
  /** Handed back: take the best place at once, and ease the tilt back quickly. */
  #rechoose = false;
  #tiltSettle = TILT_SETTLE;
  #handV = new Float64Array(2);

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
    this.#farthest = reachOf(scene.whole);
    this.#reach = this.view === "table" ? this.#farthest : Math.min(this.#reach, this.#farthest);
    this.#started = false;
    this.camera.far = scene.reach ?? 4000;
    this.camera.updateProjectionMatrix();
  }

  /** Takes the camera to one of the named views, at the shots' own unhurried pace: a view chosen is the cameraman's shot, so the hand lets go of it. */
  setView(view: View) {
    if (view === this.view) return;
    this.view = view;
    this.#above = view === "above";
    this.#reach = this.#reachOfView(view);
    this.#orbit = 0;
    this.handBack(true);
  }

  #reachOfView(view: View) {
    return view === "table" ? this.#farthest : reachOf(SHOTS[view]);
  }

  /** How far the camera is along the range, mm from what it circles: what the hand zooms. */
  get reach() {
    return this.#reach;
  }

  /** The shot being taken now. */
  get shot(): Shot {
    if (this.title) {
      this.#title.across = this.room.across;
      this.#title.low = this.room.low;
      return this.#title;
    }
    if (!this.wallpaper) return this.#made;
    if (this.wallpaperStyle === "whole") return this.#scene.whole;
    return this.wallpaperStyle === "follow" ? FOLLOW : WALLPAPER[this.#shot];
  }

  /** The player has the camera, or had it a moment ago: the cameraman leaves it where it is. */
  get handled() {
    return this.hand.held || this.hand.kept || this.#handFor > 0 || Math.abs(this.hand.pitch) > 0.01;
  }

  /**
   * The shot the player has along the range: between the level shots (or
   * from above, at that reach); past Wide, toward the whole place's. Leaves it
   * in #made, and returns how far toward the whole place it is, 0 to 1.
   */
  #shape(reach: number): number {
    const out = this.#made;
    const wide = LEVEL[LEVEL.length - 1];
    const whole = this.#scene.whole;
    let elevation: number;
    if (this.#above) {
      const above = SHOTS.above;
      elevation = elevationOf(above);
      out.side = above.side;
      out.low = above.low;
      out.fov = above.fov;
      out.settle = above.settle;
      out.scout = false;
    } else {
      // The two level shots either side, by how far between them it is on a log scale (as a zoom feels).
      let i = 0;
      while (i < LEVEL.length - 2 && reach > reachOf(LEVEL[i + 1])) i++;
      const a = LEVEL[i];
      const b = LEVEL[i + 1];
      const k = Math.max(0, Math.min(1, Math.log(reach / reachOf(a)) / Math.log(reachOf(b) / reachOf(a))));
      elevation = mix(elevationOf(a), elevationOf(b), k);
      out.side = mix(a.side, b.side, k);
      out.low = mix(a.low, b.low, k);
      out.fov = mix(a.fov, b.fov, k);
      out.settle = mix(a.settle, b.settle, k);
      out.scout = true;
    }
    const start = reachOf(wide);
    const raw = reach <= start ? 0 : Math.min(1, Math.log(reach / start) / Math.log(this.#farthest / start));
    const t = raw * raw * (3 - 2 * raw);
    if (t > 0) {
      elevation = mix(elevation, elevationOf(whole), t);
      out.low = mix(out.low, whole.low, t);
      out.fov = mix(out.fov, whole.fov, t);
      out.settle = mix(out.settle, whole.settle, t);
    }
    out.distance = reach * Math.cos(elevation);
    out.height = reach * Math.sin(elevation);
    return t;
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
    if (this.wallpaper && !this.title && (this.wallpaperStyle === "calm" || this.wallpaperStyle === "lively")) {
      this.#shotTime += dt;
      if (this.#shotTime > (this.wallpaperStyle === "lively" ? 14 : 24)) {
        this.#shotTime = 0;
        this.#shot = (this.#shot + 1) % WALLPAPER.length;
        this.#orbit = 0;
        this.#scoutIn = 0;
        this.shotChanges++;
      }
    }
    // The player's own shot, along the range; the title's and the wallpaper's are their own.
    const own = !this.title && !this.wallpaper;
    const table = own ? this.#shape(this.#reach) : !this.title && this.wallpaperStyle === "whole" ? 1 : 0;
    const shot = this.shot;
    this.#orbit += (shot.orbit ?? 0) * dt;
    this.#tableDrift += own && table > 0 ? (this.#scene.whole.orbit ?? 0) * dt : 0;
    this.#easeHand(dt);
    const airborne = body.mode === "airborne";
    const p = body.position;
    const v = body.velocity;

    // What the camera circles, and how quickly it keeps up: a fly in the air moves a hundred times faster than one walking.
    const focus = this.#focus.set(p.x, p.y + MIDDLE, p.z);
    let distance = shot.distance;
    let height = shot.height;
    let settle = shot.settle;
    let fov = shot.fov;
    let fovSettle = settle * 0.8;
    let follow = 0.9;
    let aimSettle = 0.35;
    if (airborne) {
      // Pulled back to keep a jump in the picture, and quick to follow it; aimed ahead by what the springs would lag. Not from the whole table, which has it all in the picture already.
      const k = 1 - table;
      distance = mix(distance, Math.max(distance * 2.8, 22), k);
      height = mix(height, Math.max(height * 2, 4), k);
      follow = 0.35;
      aimSettle = 0.06;
      settle = mix(1.2, settle, table);
      fov = mix(Math.max(fov, 52), fov, table);
      fovSettle = mix(0.25, fovSettle, table);
    }
    if (table < 1) this.#chooseSide(body, shot, distance, height, dt);
    // Toward the whole table: circling its middle (a room's own point), from its own angle, at its own pace. What it circles moves over last, so the fly stays in the picture all the way out.
    const whole = this.#scene.whole;
    const room = this.#scene.focus;
    const middle = table * table * table;
    const wx = room ? room.x + p.x * room.follow : p.x * 0.35;
    let wy = (room ? room.y : 60) + p.y * 0.3;
    const wz = room ? room.z + p.z * room.follow : p.z * 0.35;
    // A whole-place focus can fall inside scenery as the fly moves. Rays must start outside it.
    const inside = this.#world.solidAt(wx, wy, wz);
    if (inside >= 0) wy = topPeak(this.#world.solids[inside].top) + CLEARANCE;
    const tx = mix(focus.x, wx, middle);
    const ty = mix(focus.y, wy, middle);
    const tz = mix(focus.z, wz, middle);
    // A room's whole view turns toward the fly from the point it circles.
    const lean = room?.aim ?? 0;
    const target = this.#target.set(mix(focus.x, mix(wx, p.x, lean), middle), mix(focus.y, mix(wy, p.y, lean), middle), mix(focus.z, mix(wz, p.z, lean), middle));
    follow = mix(follow, whole.settle, table);
    aimSettle = mix(aimSettle, whole.settle * 0.8, table);
    const goal = this.#goal + wrap(whole.side + (own ? this.#tableDrift + this.#tableTurn : 0) - this.#goal) * table;
    if (this.#zooming > 0) {
      this.#zooming -= dt;
      settle = Math.min(settle, ZOOM_SETTLE / 0.8);
      fovSettle = Math.min(fovSettle, ZOOM_SETTLE);
    }
    if (!this.#started) this.#jump(tx, ty, tz, goal, shot, distance, height);

    const s = this.#v;
    const c = this.#center;
    // It keeps pace a little ahead, as the spring would otherwise trail by the fly's speed times its settling time: walking,
    // by no more than half MAX_LEAD; flying on (not a hop, over in a quarter of a second), by up to FLIGHT_LEAD, or a
    // flight of a second or two at a quarter of a metre a second would leave the fly a speck far from the picture's middle.
    this.#aloft = airborne ? this.#aloft + dt : 0;
    const pace = Math.hypot(v.x, v.z);
    const flying = Math.min(1, Math.max(0, (this.#aloft - FLIGHT_LEAD_AFTER[0]) / (FLIGHT_LEAD_AFTER[1] - FLIGHT_LEAD_AFTER[0])));
    const most = airborne ? FLIGHT_LEAD * flying : MAX_LEAD * 0.5;
    const ahead = pace > 0 ? Math.min(follow, most / pace) * (1 - table) : 0;
    c.x = damp(c.x, tx + v.x * ahead, s, 0, follow, dt);
    c.y = damp(c.y, ty, s, 1, follow, dt);
    c.z = damp(c.z, tz + v.z * ahead, s, 2, follow, dt);
    this.#azimuth = wrap(damp(this.#azimuth, this.#azimuth + wrap(goal - this.#azimuth), s, 6, settle, dt));
    this.#distance = damp(this.#distance, distance, s, 7, settle * 0.8, dt);
    this.#height = damp(this.#height, height, s, 8, settle * 0.8, dt);
    // Playing, the HUD's room: the wallpaper and the title have the screen to themselves.
    if (own && this.room.wider !== 1) fov = (Math.atan(Math.tan((fov * Math.PI) / 360) * this.room.wider) * 360) / Math.PI;
    this.#fov = damp(this.#fov, fov, s, 9, fovSettle, dt);
    this.#low = damp(this.#low, shot.low + (own ? this.room.lower : 0), s, 10, settle * 0.8, dt);
    this.#across = damp(this.#across, shot.across ?? 0, s, 11, settle * 0.8, dt);
    const view = fieldOfView(this.#fov, cam.aspect, mix(NARROW_KEEP, 1, table));

    const eye = this.#eye;
    const az = this.#azimuth;
    // The player's hand swings it up or down round what it circles.
    let reach = this.#distance;
    let rise = this.#height;
    const pitch = own ? this.hand.pitch : 0;
    if (pitch !== 0) {
      const r = Math.hypot(reach, rise);
      const up = Math.min(LOOK_PITCH[1], Math.max(LOOK_PITCH[0], Math.atan2(rise, reach) + pitch));
      reach = Math.cos(up) * r;
      rise = Math.sin(up) * r;
    }
    eye.set(c.x + Math.sin(az) * reach, c.y + rise, c.z + Math.cos(az) * reach);
    // A breath of movement in the wallpaper's long shots, as if the camera were on a sandbag rather than a tripod.
    if (this.wallpaper) {
      eye.x += Math.sin(this.#time * 0.23) * this.#distance * 0.006;
      eye.y += Math.sin(this.#time * 0.31) * this.#distance * 0.004;
    }
    // However the springs lag (a landing, a sudden turn), never closer to the fly than most of where the camera is meant to be.
    if (table < 0.5) {
      const dx = eye.x - focus.x;
      const dy = eye.y - focus.y;
      const dz = eye.z - focus.z;
      const near = Math.hypot(dx, dy, dz);
      const least = Math.min(Math.hypot(shot.distance, shot.height), Math.hypot(this.#distance, this.#height)) * 0.75;
      if (near < least) {
        const k = least / Math.max(1e-6, near);
        eye.set(focus.x + dx * k, focus.y + dy * k, focus.z + dz * k);
      }
    }
    // What it keeps in sight is what it circles: the fly, or on the way out to the whole place the point that turns into.
    this.#keepInSight(this.#sight.set(tx, ty, tz), eye, dt);

    // Aim so the fly sits `low` below the middle of the picture.
    const ground = Math.hypot(eye.x - c.x, eye.z - c.z);
    const drop = Math.atan2(eye.y - c.y, Math.max(1e-3, ground)) - Math.atan(this.#low * Math.tan((view * Math.PI) / 360));
    const lift = eye.y - c.y - ground * Math.tan(drop);
    // Aimed ahead by about what the spring lags, so a jump stays in the picture; never more than a few body lengths.
    const speed = Math.hypot(v.x, v.y, v.z);
    const lead = speed > 0 ? Math.min(aimSettle, MAX_LEAD / speed) * (1 - table) : 0;
    // To put the fly to one side, aim the other way along the camera's right.
    const aside = -this.#across * ground * Math.tan((view * Math.PI) / 360) * this.camera.aspect;
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
   * Keeps the eye out of everything, with nothing between it and the focus,
   * moving it only along its line of sight to the focus, so a camera turned
   * by hand stays on the arc it is turned along. Rays find how far out the
   * way is clear (#clear): the line of sight, and feelers round the eye's arc,
   * one behind it and the rest ahead, as far as it will go in a moment, so it
   * comes in before it gets to what it would go into or what would come
   * between it and the fly. It comes in quickly but over several frames,
   * never in one, and goes back out slowly, once the way has been clear by a
   * margin for a moment, so an edge it is at does not flip it in and out.
   * Only if it is inside something all the same (turned faster than it could
   * come in) does it go out over it, if that is not far, or in front of it,
   * at once. Last it keeps clear of a side beside it and of the surface under
   * and over it, so the near edge of the picture never cuts into a surface.
   */
  #keepInSight(focus: THREE.Vector3, eye: THREE.Vector3, dt: number) {
    const world = this.#world;
    const wanted = eye.distanceTo(focus);
    if (wanted > 1e-6) {
      const d = this.#dir;
      d.x = (eye.x - focus.x) / wanted;
      d.y = (eye.y - focus.y) / wanted;
      d.z = (eye.z - focus.z) / wanted;
      // Across the line of sight, level.
      const across = Math.hypot(d.x, d.z);
      const sx = across > 1e-6 ? d.z / across : 1;
      const sz = across > 1e-6 ? -d.x / across : 0;
      const was = this.#was;
      const sideways = this.#fresh ? 0 : ((eye.x - was.x) * sx + (eye.z - was.z) * sz) / Math.max(1e-3, dt);
      was.copy(eye);
      const now = Math.min(this.#arm, wanted);
      const hold = this.handled;
      let free = this.#clear(focus, eye.x, eye.y, eye.z, now, hold, true);
      const centre = this.#raw;
      // The feelers are where the eye would be a little way round its arc either way, and farther the way it is going.
      const dx = eye.x - focus.x;
      const dz = eye.z - focus.z;
      const round = Math.max(1e-3, Math.hypot(dx, dz));
      const reach = Math.max(CLEARANCE, now * FEEL);
      const going = sideways >= 0 ? 1 : -1;
      const coming = Math.abs(sideways) * FEEL_AHEAD;
      const ahead = Math.min(round, reach + coming);
      for (let i = 0; i < FEELERS; i++) {
        // Behind it, the least way round; ahead, out to where it will be in a moment, in even steps, so nothing narrow is missed between them.
        const arc = i === 0 ? reach : (ahead * i) / (FEELERS - 1);
        const a = ((i === 0 ? -going : going) * arc) / round;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        // What will be in the way where it is going counts already: coming in only once it is, it would come in through it.
        free = Math.min(free, this.#clear(focus, focus.x + dx * cos + dz * sin, eye.y, focus.z + dz * cos - dx * sin, now, hold, i > 0 && arc <= coming));
      }
      // The nearest it has had to be lately: farther only once the way has been clear by a margin for a moment.
      const v = this.#armV;
      if (this.#fresh || free < this.#held) {
        this.#held = free;
        this.#clearFor = 0;
      } else if (free < this.#held + SLACK * wanted) this.#clearFor = 0;
      else if ((this.#clearFor += dt) >= CLEAR_FOR) this.#held = free;
      const goal = Math.min(this.#held, wanted);
      if (this.#fresh) {
        this.#arm = goal < wanted ? goal : Infinity;
        v[0] = 0;
      } else if (goal < now - 1e-6) this.#arm = damp(now, goal, v, 0, PULL_IN, dt);
      else if (goal > now + 1e-6) {
        // Aimed past where it may go, so it gets there rather than creeping up on it.
        this.#arm = damp(now, goal + SLACK * wanted, v, 0, LET_OUT, dt);
        if (this.#arm >= goal) {
          this.#arm = goal < wanted ? goal : Infinity;
          v[0] = 0;
        }
      } else {
        this.#arm = goal < wanted ? goal : Infinity;
        v[0] = 0;
      }
      const reachNow = Math.min(this.#arm, wanted);
      eye.set(focus.x + d.x * reachNow, focus.y + d.y * reachNow, focus.z + d.z * reachNow);
      if (world.solidAt(eye.x, eye.y, eye.z) >= 0) {
        // In something all the same: out over the top of it, if that is not far (as over the surface under it); else in front of it, at once.
        const top = world.topAbove(eye.x, eye.y, eye.z) - eye.y;
        if (top <= Math.max(RISE, reachNow * CLIMB)) eye.y += top + CLEARANCE;
        else if (centre < reachNow) {
          eye.set(focus.x + d.x * centre, focus.y + d.y * centre, focus.z + d.z * centre);
          this.#arm = centre;
          v[0] = 0;
        }
      }
      // Clear of a side it is beside: the line of sight is clear, but a wall along it could be under the picture's edge.
      this.#beside(eye, sx, sz);
    }
    this.#fresh = false;
    const s = world.surface(eye.x, eye.z, this.#under, eye.y);
    eye.y = s.underside - s.y < 2 * CLEARANCE ? (s.y + s.underside) / 2 : Math.min(s.underside - CLEARANCE, Math.max(s.y + CLEARANCE, eye.y));
  }

  /**
   * How far out toward a point the eye may be (Infinity: as far as it likes)
   * for what a ray from the focus to it meets, short of it by the clearance.
   * What the point is in, or the eye would be in that far along the ray
   * (`near`, where it is now), counts: the eye is there or about to be.
   * Something merely in the way counts only on the line of sight and where
   * the eye is about to be (`sight`), and for the cameraman not a bump it
   * only grazes (one it would clear from a little higher). Nor does anything
   * right by the fly for the cameraman, who goes round it instead
   * (#chooseSide). It is never nearer than the nearest the hand brings it.
   * Leaves in #raw how far it may be for what the ray met, whatever that is.
   */
  #clear(focus: THREE.Vector3, x: number, y: number, z: number, near: number, hold: boolean, sight: boolean): number {
    const world = this.#world;
    const r = this.#ray;
    const length = Math.hypot(x - focus.x, y - focus.y, z - focus.z);
    this.#raw = Infinity;
    if (length < 1e-6) return Infinity;
    r.x = (x - focus.x) / length;
    r.y = (y - focus.y) / length;
    r.z = (z - focus.z) / length;
    const hit = world.raycast(focus, r, this.#hit, length + CLEARANCE);
    if (!hit) return Infinity;
    // Short of it by the clearance, measured square to it (but not without end, grazing it).
    const clear = Math.max(hit.t * 0.5, hit.t - CLEARANCE / Math.max(0.25, -(r.x * hit.normal.x + r.y * hit.normal.y + r.z * hit.normal.z)));
    this.#raw = clear;
    if (!hold && hit.t < BY_THE_FLY) return Infinity;
    if (this.#inside(x, y, z)) return Math.max(clear, NEAREST);
    if (near < length) {
      const k = near / length;
      if (this.#inside(focus.x + (x - focus.x) * k, focus.y + (y - focus.y) * k, focus.z + (z - focus.z) * k)) return Math.max(clear, NEAREST);
    }
    if (!sight) return Infinity;
    if (hold) return Math.max(clear, NEAREST);
    const graze = Math.max(CLEARANCE, Math.min(RAISE_MOST, length * RAISE));
    const g = this.#from;
    const raised = Math.hypot(x - focus.x, y + graze - focus.y, z - focus.z);
    g.x = (x - focus.x) / raised;
    g.y = (y + graze - focus.y) / raised;
    g.z = (z - focus.z) / raised;
    return world.raycast(focus, g, this.#hit, raised) ? Math.max(clear, NEAREST) : Infinity;
  }

  /** Whether an eye there would be inside something, and not something low it rises over (#keepInSight). */
  #inside(x: number, y: number, z: number) {
    return this.#world.solidAt(x, y, z) >= 0 && this.#world.topAbove(x, y, z) - y > RISE;
  }

  /** Moves the eye away from a steep side it is nearer than the clearance to, either way across the line of sight (but not into something else). */
  #beside(eye: THREE.Vector3, sx: number, sz: number) {
    const world = this.#world;
    const r = this.#ray;
    r.y = 0;
    let push = 0;
    for (let sign = -1; sign <= 1; sign += 2) {
      r.x = sx * sign;
      r.z = sz * sign;
      // A side, not the slope of something low under it, which the eye rises over.
      if (world.raycast(eye, r, this.#hit, CLEARANCE) && Math.abs(this.#hit.normal.y) < 0.5) push -= sign * (CLEARANCE - this.#hit.t);
    }
    if (push === 0 || world.solidAt(eye.x + sx * push, eye.y, eye.z + sz * push) >= 0) return;
    eye.x += sx * push;
    eye.z += sz * push;
  }

  /** While the hand is on the camera, or has kept it, it stays put; let go a while, the tilt and the turn of the whole table ease back. */
  #easeHand(dt: number) {
    const hand = this.hand;
    if (hand.held || hand.kept) {
      this.#handFor = HAND_HOLD;
      this.#handV.fill(0);
      return;
    }
    if (this.#handFor > 0) {
      this.#handFor -= dt;
      return;
    }
    hand.pitch = Math.abs(hand.pitch) < 1e-4 ? 0 : damp(hand.pitch, 0, this.#handV, 0, this.#tiltSettle, dt);
    this.#tableTurn = Math.abs(this.#tableTurn) < 1e-4 ? 0 : damp(this.#tableTurn, 0, this.#handV, 1, this.#tiltSettle, dt);
  }

  /** Turns the camera round by hand, at once (radians round, and up), no further up or down than it can go from where the shot has it, so that turning back takes effect at once. It stays there until the hand has been off it a while. */
  turnBy(yaw: number, pitch: number) {
    this.#azimuth = wrap(this.#azimuth + yaw);
    this.#goal = wrap(this.#goal + yaw);
    this.#tableTurn += yaw;
    this.#v[6] = 0;
    const hand = this.hand;
    const up = Math.atan2(this.#height, this.#distance);
    hand.pitch = Math.max(LOOK_PITCH[0] - up, Math.min(LOOK_PITCH[1] - up, hand.pitch + pitch));
    this.#handFor = HAND_HOLD;
    this.#tiltSettle = TILT_SETTLE;
  }

  /** Brings the camera in (under 1) or takes it out by hand, by this factor, along the range; the View tool's name follows it. */
  zoomBy(factor: number) {
    const reach = Math.min(this.#farthest, Math.max(NEAREST, this.#reach * factor));
    if (reach === this.#reach) return;
    this.#reach = reach;
    this.#zooming = 0.4;
    this.view = this.#nearest(reach);
    if (this.view === "table") this.#above = false;
  }

  /** The named view nearest a reach: Whole table once it is more the table's shot than the fly's. */
  #nearest(reach: number): View {
    const start = reachOf(SHOTS.wide);
    if (reach > start && Math.log(reach / start) / Math.log(this.#farthest / start) >= 0.7) return "table";
    if (this.#above) return "above";
    let best: View = "follow";
    let gap = Infinity;
    for (const view of ["close", "follow", "wide"] as const) {
      const g = Math.abs(Math.log(reach / reachOf(SHOTS[view])));
      if (g < gap) {
        gap = g;
        best = view;
      }
    }
    return best;
  }

  /** Gives the camera back to the cameraman now: it takes the best place round the fly at once, the tilt eases back, and (unless `keepZoom`) the zoom goes to the named view it is nearest. */
  handBack(keepZoom = false) {
    this.hand.held = false;
    this.hand.kept = false;
    this.#handFor = 0;
    this.#rechoose = true;
    this.#scoutIn = 0;
    this.#tiltSettle = TILT_SETTLE_NOW;
    if (!keepZoom) this.#reach = this.#reachOfView(this.view);
  }

  /**
   * Where round the fly to stand: the shot's preferred angle off its heading,
   * on the side the camera is already on, unless it is better elsewhere for
   * long enough. Better is: not blocked, not inside anything, near the
   * preferred angle, near where the camera is, with something behind the fly.
   */
  #chooseSide(body: FlyBody, shot: Shot, distance: number, height: number, dt: number) {
    // Left where the hand put it, for now.
    if (body.mode === "airborne" || (this.handled && !this.#rechoose)) return;
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
    if (!this.#started || this.#rechoose) {
      this.#goal = bestAngle;
      this.#rechoose = false;
      this.#pendingFor = 0;
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
    let score = Math.max(0, d.x * this.#scene.vista.x + d.z * this.#scene.vista.z) * VISTA;
    const hit = world.raycast(from, d, this.#hit);
    // A wall or a window standing past the table's edge is no better a background than the view beyond it.
    if (hit && hit.solid >= 0 && hit.t < 400 && world.onTable(hit.point.x - hit.normal.x * 0.5, hit.point.z - hit.normal.z * 0.5)) {
      const solid = world.solids[hit.solid];
      score += Math.min(1, (topPeak(solid.top) - solidBottom(solid)) / 30) * (1 - hit.t / 500) * 0.8;
    }
    return score;
  }

  /** Puts the camera straight into the shot's place. */
  #jump(x: number, y: number, z: number, azimuth: number, shot: Shot, distance: number, height: number) {
    this.#arm = Infinity;
    this.#fresh = true;
    this.#center.set(x, y, z);
    this.#aim.set(x, y, z);
    this.#azimuth = azimuth;
    this.#distance = distance;
    this.#height = height;
    this.#fov = shot.fov;
    this.#low = shot.low;
    this.#across = shot.across ?? 0;
    this.#v.fill(0);
  }

  /** Starts the wallpaper on the next of its shots. */
  startWallpaper() {
    this.handBack(true);
    this.wallpaper = true;
    if (this.wallpaperStyle === "whole") this.snap();
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
