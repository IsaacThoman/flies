// The fly's body in the world: where it is, which way it faces, walking on
// the table and the things on it, and flying between them.
//
// Movement starts with the brain (an Intent from behavior.ts). What the body
// adds, because the model has no way to produce it, is listed here and in the
// README:
//
// - Physics: it stays on the surface it walks on, slides along what it walks
//   into, falls off ledges, and in the air has weight, drag and its wings'
//   force. A take-off is the escape command's; its direction is the body's:
//   away from a threat it knows of, else straight ahead.
// - Staying in the world: it doesn't walk off the table, and in the air is
//   drawn back toward it near the edges of the world.
// - Turning away from a wall it has been pressed against, facing it, for
//   WALL_PATIENCE seconds. The brain feels the wall on its antennae, but
//   nothing in the model turns it away.
// - Landing: touching down on something it can stand on puts it on its feet.
// - Lining its mouth up with food the brain has already decided to eat
//   (FEED_ALIGN): stopping is the brain's doing, the last shuffle isn't.

import type { Food, Surface, Vec3, World } from "@fly/world";
import { createSurface } from "@fly/world";
import type { Intent } from "./behavior.ts";
import { ease } from "./behavior.ts";

/** The fly's length, mm. The model is 1 unit long and is scaled to this. */
export const FLY_LENGTH = 2.5;
/** Points on the body, in body lengths along its heading and up from its feet. */
export const HEAD_AHEAD = 0.42;
export const HEAD_UP = 0.3;
export const MOUTH_AHEAD = 0.5;
export const MOUTH_UP = 0.08;
/** Highest step (mm) its legs take in their stride. */
export const STEP_UP = 0.9;
/** A drop deeper than this (mm) is a ledge it falls from. */
export const STEP_DOWN = 0.9;
/** It can stand on slopes up to this steep (cosine of the angle from level). */
export const MAX_SLOPE_COS = Math.cos((65 * Math.PI) / 180);
/** Gravity, mm/s². */
export const GRAVITY = 9810;
/** Lift and forward thrust from the wings at full drive, mm/s². Wings at 0.6 hold its weight. */
export const LIFT = GRAVITY / 0.6;
export const THRUST = 3200;
/** Air drag, 1/s: a fly without its wings falls at GRAVITY / DRAG. */
export const DRAG = 7;
/** A take-off's speed, mm/s, upward and away, from the weakest to the strongest. */
export const TAKEOFF_UP = [380, 620] as const;
export const TAKEOFF_AWAY = [160, 340] as const;
/** In the air it's drawn back inside this radius around the table's middle, and below this height (mm). */
export const AIR_RADIUS = 360;
export const AIR_CEILING = 320;
/** Seconds pressed against a wall it faces before the body turns it away. */
export const WALL_PATIENCE = 2;
/** Turning away from a wall, rad/s. */
export const WALL_TURN = 2;
/** Shuffling to bring its mouth to food it is eating, mm/s, and how close (mm) is close enough. */
export const FEED_ALIGN_SPEED = 4;
export const FEED_ALIGN_SLOP = 0.25;

export type BodyMode = "standing" | "walking" | "airborne";

export type BodyEvents = {
  /** It left the ground this frame (a take-off, or walking off a ledge). */
  tookOff: boolean;
  jumped: boolean;
  landed: boolean;
  /** It hit something in the air this frame, with the speed it hit at (mm/s). */
  hit: number;
};

/** What the world does to the body this frame, besides the brain. */
export type Forces = {
  /** The air's own velocity around the fly (a breeze or a puff), mm/s. */
  air: Vec3;
  /** Where something threatening is, if anything is, so a take-off can be away from it. */
  threat: Vec3 | null;
  /** Food it is eating, to line its mouth up with. */
  meal: Food | null;
};

const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export class FlyBody {
  readonly position: Vec3;
  /** Radians about +y: the fly faces (sin yaw, 0, cos yaw). Its left is (cos yaw, 0, −sin yaw). */
  yaw: number;
  /** Velocity, mm/s: through the air when airborne, over the surface when walking. */
  readonly velocity = v3();
  mode: BodyMode = "standing";
  /** The surface's normal under its feet, eased, for tilting the pose. */
  readonly up = v3(0, 1, 0);
  /** The surface it stands on. */
  readonly surface: Surface = createSurface();
  /** Pressed against something it is facing (its head is at a wall). */
  blocked = false;
  readonly events: BodyEvents = { tookOff: false, jumped: false, landed: false, hit: 0 };
  /** Speed over the ground last frame, mm/s, along its heading (negative backing). */
  groundSpeed = 0;
  /** Its yaw rate last frame, rad/s. */
  turnRate = 0;
  #world: World;
  #pressed = 0;
  #probe = createSurface();
  #wall = v3();

  constructor(world: World, start: { x: number; z: number; yaw: number }) {
    this.#world = world;
    this.position = v3(start.x, world.heightAt(start.x, start.z), start.z);
    this.yaw = start.yaw;
    world.surface(start.x, start.z, this.surface);
  }

  get onFeet() {
    return this.mode !== "airborne";
  }

  forward(out: Vec3): Vec3 {
    out.x = Math.sin(this.yaw);
    out.y = 0;
    out.z = Math.cos(this.yaw);
    return out;
  }

  /** A point on the body: `ahead` and `up` in body lengths, `left` too. */
  point(ahead: number, up: number, left: number, out: Vec3): Vec3 {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    const L = FLY_LENGTH;
    out.x = this.position.x + (s * ahead + c * left) * L;
    out.y = this.position.y + up * L;
    out.z = this.position.z + (c * ahead - s * left) * L;
    return out;
  }

  /** Puts the fly somewhere, standing. */
  place(x: number, z: number, yaw: number) {
    this.position.x = x;
    this.position.z = z;
    this.position.y = this.#world.heightAt(x, z);
    this.yaw = yaw;
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.mode = "standing";
    this.#world.surface(x, z, this.surface);
  }

  step(intent: Intent, forces: Forces, dt: number) {
    const ev = this.events;
    ev.tookOff = false;
    ev.jumped = false;
    ev.landed = false;
    ev.hit = 0;
    if (!(dt > 0)) return;
    if (this.mode !== "airborne" && intent.takeOff !== null) this.#takeOff(intent.takeOff, forces.threat);
    if (this.mode === "airborne") this.#fly(intent, forces, dt);
    else this.#walk(intent, forces, dt);
  }

  #takeOff(strength: number, threat: Vec3 | null) {
    const ev = this.events;
    let ax = Math.sin(this.yaw);
    let az = Math.cos(this.yaw);
    if (threat) {
      const dx = this.position.x - threat.x;
      const dz = this.position.z - threat.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-6) {
        ax = dx / d;
        az = dz / d;
      }
    }
    const up = TAKEOFF_UP[0] + (TAKEOFF_UP[1] - TAKEOFF_UP[0]) * strength;
    const away = TAKEOFF_AWAY[0] + (TAKEOFF_AWAY[1] - TAKEOFF_AWAY[0]) * strength;
    this.velocity.x = ax * away;
    this.velocity.y = up;
    this.velocity.z = az * away;
    this.mode = "airborne";
    ev.tookOff = true;
    ev.jumped = true;
  }

  #walk(intent: Intent, forces: Forces, dt: number) {
    const world = this.#world;
    const p = this.position;
    let speed = intent.speed;
    let yawRate = intent.yawRate;

    // Lining up with food it has decided to eat: the body's, see the top of the file.
    if (forces.meal && intent.feeding) {
      const mouth = this.point(MOUTH_AHEAD, 0, 0, scratchA);
      const dx = forces.meal.x - mouth.x;
      const dz = forces.meal.z - mouth.z;
      const gap = Math.hypot(dx, dz) - forces.meal.r * 0.5;
      if (gap > FEED_ALIGN_SLOP) {
        const fx = Math.sin(this.yaw);
        const fz = Math.cos(this.yaw);
        const along = dx * fx + dz * fz;
        speed = Math.max(-FEED_ALIGN_SPEED, Math.min(FEED_ALIGN_SPEED, along / dt));
        // Turn toward it only if it's beside or behind the mouth.
        const leftOf = dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw);
        yawRate = Math.max(-2, Math.min(2, Math.atan2(leftOf, Math.max(0.1, along)) * 4));
      } else {
        speed = 0;
        yawRate = 0;
      }
    }

    // Pressed against a wall it faces for a while: the body turns it away.
    if (this.blocked && speed > 0) this.#pressed += dt;
    else this.#pressed = 0;
    if (this.#pressed >= WALL_PATIENCE && world.wallNormal(this.point(HEAD_AHEAD + 0.2, 0, 0, scratchA).x, scratchA.z, p.y + STEP_UP, this.#wall)) {
      // Turn the way that brings its heading toward the wall's outward normal soonest.
      const leftOf = this.#wall.x * Math.cos(this.yaw) - this.#wall.z * Math.sin(this.yaw);
      yawRate = (leftOf >= 0 ? 1 : -1) * WALL_TURN;
      speed = 0;
      if (this.#pressed >= WALL_PATIENCE + 1.2) this.#pressed = 0;
    }

    this.yaw = wrap(this.yaw + yawRate * dt);
    this.turnRate = yawRate;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    let mx = fx * speed * dt;
    let mz = fz * speed * dt;
    this.blocked = false;
    if (mx !== 0 || mz !== 0) {
      const result = this.#tryMove(mx, mz);
      if (result === "blocked") {
        // Slide along what's in the way.
        const ahead = scratchA;
        ahead.x = p.x + mx;
        ahead.z = p.z + mz;
        if (world.wallNormal(ahead.x, ahead.z, p.y + STEP_UP, this.#wall)) {
          const into = mx * this.#wall.x + mz * this.#wall.z;
          if (into < 0) {
            mx -= into * this.#wall.x;
            mz -= into * this.#wall.z;
          }
          // Facing into it: the antennae are at the wall.
          this.blocked = fx * this.#wall.x + fz * this.#wall.z < -0.5 && speed > 0;
          if (this.#tryMove(mx, mz) === "blocked") {
            mx = 0;
            mz = 0;
          }
        } else {
          mx = 0;
          mz = 0;
        }
      }
    }
    const moved = (mx * fx + mz * fz) / dt;
    this.groundSpeed = Number.isFinite(moved) ? moved : 0;
    this.mode = this.mode === "airborne" ? "airborne" : Math.abs(this.groundSpeed) > 0.2 || Math.abs(yawRate) > 0.2 ? "walking" : "standing";
    if (this.mode !== "airborne") {
      this.velocity.x = mx / dt;
      this.velocity.y = 0;
      this.velocity.z = mz / dt;
      this.#easeUp(this.surface.normal, dt);
    }
  }

  /** Moves over the surface by (mx, mz) if it can: "moved", "blocked", or "fell" off a ledge. */
  #tryMove(mx: number, mz: number): "moved" | "blocked" | "fell" {
    const world = this.#world;
    const p = this.position;
    const x = p.x + mx;
    const z = p.z + mz;
    const next = world.surface(x, z, this.#probe);
    if (!next.onTable) return "blocked";
    const rise = next.y - p.y;
    if (rise > STEP_UP || (rise > 0 && next.normal.y < MAX_SLOPE_COS)) return "blocked";
    if (-rise > STEP_DOWN || next.normal.y < MAX_SLOPE_COS) {
      p.x = x;
      p.z = z;
      this.mode = "airborne";
      this.events.tookOff = true;
      return "fell";
    }
    p.x = x;
    p.y = next.y;
    p.z = z;
    copySurface(next, this.surface);
    return "moved";
  }

  #fly(intent: Intent, forces: Forces, dt: number) {
    const world = this.#world;
    const p = this.position;
    const v = this.velocity;
    this.yaw = wrap(this.yaw + intent.airYawRate * dt);
    this.turnRate = intent.airYawRate;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const w = intent.wings;
    // Weight, the wings' lift and thrust, drag through the moving air.
    let ax = fx * THRUST * w - DRAG * (v.x - forces.air.x);
    let ay = LIFT * w - GRAVITY - DRAG * (v.y - forces.air.y);
    let az = fz * THRUST * w - DRAG * (v.z - forces.air.z);
    // Drawn back into the world near its edges: the body's, see the top of the file.
    const r = Math.hypot(p.x, p.z);
    if (r > AIR_RADIUS - 40) {
      const k = (r - (AIR_RADIUS - 40)) * 40;
      ax -= (p.x / r) * k;
      az -= (p.z / r) * k;
    }
    if (p.y > AIR_CEILING) ay -= (p.y - AIR_CEILING) * 40;
    v.x += ax * dt;
    v.y += ay * dt;
    v.z += az * dt;
    const px = p.x;
    const py = p.y;
    const pz = p.z;
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;
    this.blocked = false;

    const under = world.surface(p.x, p.z, this.#probe);
    if (!under.onTable) {
      // Past the table's edge, there's nothing to land on: kept above the table's height until drawn back.
      if (p.y < 1) {
        p.y = 1;
        if (v.y < 0) v.y = 0;
      }
    } else if (p.y <= under.y) {
      const before = world.heightAt(px, pz);
      if (py >= under.y - STEP_UP || before >= under.y - 1e-6) {
        // Came down onto it from above.
        if (under.normal.y >= MAX_SLOPE_COS) {
          this.events.hit = Math.max(0, -v.y);
          p.y = under.y;
          v.x = v.y = v.z = 0;
          this.mode = "standing";
          this.events.landed = true;
          copySurface(under, this.surface);
          this.#easeUp(under.normal, 1);
          return;
        }
        // Too steep to stand on: slides off it.
        p.y = under.y;
        const n = under.normal;
        const into = v.x * n.x + v.y * n.y + v.z * n.z;
        if (into < 0) {
          v.x -= into * n.x * 1.3;
          v.y -= into * n.y * 1.3;
          v.z -= into * n.z * 1.3;
        }
        this.events.hit = Math.max(this.events.hit, -into);
      } else {
        // Flew into its side: back out, bounced off.
        p.x = px;
        p.z = pz;
        if (world.wallNormal(p.x + v.x * dt, p.z + v.z * dt, p.y, this.#wall)) {
          const into = v.x * this.#wall.x + v.z * this.#wall.z;
          if (into < 0) {
            v.x -= into * this.#wall.x * 1.4;
            v.z -= into * this.#wall.z * 1.4;
            this.events.hit = Math.max(this.events.hit, -into);
            this.blocked = fx * this.#wall.x + fz * this.#wall.z < -0.3;
          }
        } else {
          v.x *= -0.3;
          v.z *= -0.3;
        }
      }
    }
    this.groundSpeed = 0;
    // In the air its "up" follows level flight.
    this.#easeUp(levelUp, dt);
  }

  #easeUp(normal: Vec3, dt: number) {
    const k = dt >= 1 ? 1 : ease(10, dt);
    const u = this.up;
    u.x += (normal.x - u.x) * k;
    u.y += (normal.y - u.y) * k;
    u.z += (normal.z - u.z) * k;
    const l = Math.hypot(u.x, u.y, u.z) || 1;
    u.x /= l;
    u.y /= l;
    u.z /= l;
  }
}

const levelUp: Vec3 = { x: 0, y: 1, z: 0 };
const scratchA: Vec3 = { x: 0, y: 0, z: 0 };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function copySurface(from: Surface, to: Surface) {
  to.y = from.y;
  to.solid = from.solid;
  to.onTable = from.onTable;
  to.normal.x = from.normal.x;
  to.normal.y = from.normal.y;
  to.normal.z = from.normal.z;
}
