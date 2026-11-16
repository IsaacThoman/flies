// The fly's body in the world: where it is, which way it faces, walking on
// the table and the things on it (and under them), and flying between them.
//
// Where surfaces lie one above another (the floor, a chair seat, the table
// top over both), it stands on the one under its feet: walking, the highest
// within a step of them; in the air, the one it comes down onto. Its body
// takes FLY_HEIGHT of room over its feet, walking or flying: an underside
// lower than that is in its way, one higher is no obstacle.
//
// Movement starts with the brain (an Intent from behavior.ts). What the body
// adds, because the model has no way to produce it, is listed here and in the
// README:
//
// - Physics: it stays on the surface it walks on, slides along what it walks
//   into, falls off ledges, and in the air has weight, drag and its wings'
//   force, and bounces off what it flies into, an underside included. A
//   take-off is the escape command's; its direction is the body's: away
//   from a threat it knows of, else straight ahead. In the air it turns to
//   face its course (VANE_RATE).
// - Flight itself, once its feet are off the ground, is held up by the
//   tarsal reflex in behavior.ts (TARSAL_ONSET), not the brain.
// - Staying in the world: it doesn't walk off the table, and in the air is
//   drawn back toward it near the edges of the world, sliding round
//   anything standing in its way back.
// - Turning away from a wall it has been pressed against, facing it, for
//   WALL_PATIENCE seconds. The brain feels the wall on its antennae and
//   grooms them, but nothing in the model turns it away or backs it off (a
//   real fly's touched antenna drives MDN; here no route from Johnston's
//   organ to MDN is strong enough: packages/brain/README.md).
// - Landing: touching down on something it can stand on puts it on its feet.
// - Lining its mouth up with food the brain has already decided to eat
//   (FEED_ALIGN): stopping is the brain's doing, the last shuffle isn't.

import type { Food, RayHit, Surface, Vec3, World } from "@fly/world";
import { TOUCH, createSurface, sideNormal, solidBottom, topHeight } from "@fly/world";
import type { Intent } from "./behavior.ts";
import { ease } from "./behavior.ts";

/** The fly's length, mm. The model is 1 unit long and is scaled to this. */
export const FLY_LENGTH = 2.5;
/** Points on the body, in body lengths along its heading and up from its feet. */
export const HEAD_AHEAD = 0.42;
export const HEAD_UP = 0.3;
export const MOUTH_AHEAD = 0.5;
export const MOUTH_UP = 0.08;
/** The room its body takes over its feet, mm: up to its folded wings. More than a step. */
export const FLY_HEIGHT = 1.3;
/** Highest step (mm) its legs take in their stride. */
export const STEP_UP = 0.9;
/** A drop deeper than this (mm) is a ledge it falls from. */
export const STEP_DOWN = 0.9;
/** It can stand on slopes up to this steep (cosine of the angle from level). */
export const MAX_SLOPE_COS = Math.cos((65 * Math.PI) / 180);
const MAX_SLOPE_TAN = Math.tan((65 * Math.PI) / 180);
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
/**
 * In the air it turns to face the way it is going through the air, at up to
 * VANE_RATE (1/s, of the angle between) once it moves at VANE_SPEED (mm/s) or
 * more, and the brain's `turn` steers on top. A fly's thrust is along its
 * body, and it flies forwards: a take-off's jump away from a threat, which
 * leaves it facing where it faced, would otherwise have its wings carry it
 * straight back.
 */
export const VANE_RATE = 8;
export const VANE_SPEED = 150;
/** In the air, past the table's edge (or above the place's ceiling), it's drawn back this hard per mm, mm/s². */
export const AIR_PULL = 40;
/** Seconds pressed against a wall it faces before the body turns it away. */
export const WALL_PATIENCE = 2;
/** Turning away from a wall, rad/s, and how far it turns (rad). */
export const WALL_TURN = 2;
export const WALL_AWAY = 2.2;
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

/**
 * The body a flight sweeps is a hair shorter than the room it keeps (mm
 * less): stopped FLY_HEIGHT below an underside, its next sweep starts clear
 * of it rather than inside it.
 */
const SLACK = 1e-4;

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
  /**
   * How hard its wings beat after its last step, 0 to 1, as their own strain
   * sensors feel it (the brain's `wingbeat`): in the air the drive it flew
   * with (Intent.wings); on its feet only as far as the pose opens them
   * (Intent.wingPose), so 0 with them folded; 0 in the step it lands in, as
   * tarsal contact stops a fly's wings.
   */
  wingbeat = 0;
  #world: World;
  #pressed = 0;
  #awayLeft = 0;
  #awayDir = 1;
  #probe = createSurface();
  #wall = v3();
  #inward = v3();
  #flightOrigin = v3();
  #flightDir = v3();
  #flightHit: RayHit = { point: v3(), normal: v3(), solid: -1, t: 0 };

  /** Standing at `start`: on the surface there at or below its `y` (the highest, if left out). */
  constructor(world: World, start: { x: number; z: number; yaw: number; y?: number }) {
    this.#world = world;
    world.surface(start.x, start.z, this.surface, start.y);
    this.position = v3(start.x, this.surface.y, start.z);
    this.yaw = start.yaw;
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

  /** Puts the fly somewhere, standing on the surface there at or below `y` (the highest, if left out). */
  place(x: number, z: number, yaw: number, y?: number) {
    this.#world.surface(x, z, this.surface, y);
    this.position.x = x;
    this.position.z = z;
    this.position.y = this.surface.y;
    this.yaw = yaw;
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.mode = "standing";
    this.blocked = false;
    this.groundSpeed = this.turnRate = this.wingbeat = 0;
    this.#pressed = this.#awayLeft = 0;
    this.events.tookOff = this.events.jumped = this.events.landed = false;
    this.events.hit = 0;
    this.#easeUp(this.surface.normal, 1);
  }

  step(intent: Intent, forces: Forces, dt: number) {
    const ev = this.events;
    ev.tookOff = false;
    ev.jumped = false;
    ev.landed = false;
    ev.hit = 0;
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    if (this.mode !== "airborne" && intent.takeOff !== null) this.#takeOff(intent.takeOff, forces.threat);
    const flying = this.mode === "airborne";
    // Long frames must not destabilize drag or skip a wall between samples.
    const steps = dt <= 1 / 60 ? 1 : Math.ceil(dt / (1 / 60));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (this.mode === "airborne") this.#fly(intent, forces, h);
      else this.#walk(intent, forces, h);
    }
    this.wingbeat = this.mode === "airborne" ? intent.wings : flying ? 0 : intent.wingPose;
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
    if (this.#awayLeft > 0) {
      this.#awayLeft -= dt;
      yawRate = this.#awayDir * WALL_TURN;
      speed = 0;
    } else {
      if (this.blocked && speed > 0) this.#pressed += dt;
      else this.#pressed = 0;
      if (this.#pressed >= WALL_PATIENCE && world.wallNormal(this.point(HEAD_AHEAD + 0.2, 0, 0, scratchA).x, scratchA.z, p.y + STEP_UP, this.#wall, p.y + FLY_HEIGHT)) {
        // Turn the way that brings its heading round to the wall's outward normal soonest, about a third of a turn.
        const leftOf = this.#wall.x * Math.cos(this.yaw) - this.#wall.z * Math.sin(this.yaw);
        this.#awayDir = leftOf >= 0 ? 1 : -1;
        this.#awayLeft = WALL_AWAY / WALL_TURN;
        this.#pressed = 0;
      }
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
        ahead.x = p.x + mx + fx * HEAD_AHEAD * FLY_LENGTH * Math.sign(speed);
        ahead.z = p.z + mz + fz * HEAD_AHEAD * FLY_LENGTH * Math.sign(speed);
        if (world.wallNormal(ahead.x, ahead.z, p.y + STEP_UP, this.#wall, p.y + FLY_HEIGHT)) {
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
    // The head (or the tail, backing up) mustn't go into anything either. A
    // wall is a rise of more than a step between points a third of the way
    // apart, beyond what the steepest slope it can stand on would climb; a
    // slope it can walk up is not one. An underside it fits beneath is not
    // one either, but one lower than its body is a wall, and so is the edge
    // of a slab at its head's height rather than its feet's.
    const length = Math.hypot(mx, mz);
    if (length > 0) {
      // A grazing path can enter and leave a corner between even tiny steps.
      const origin = this.#flightOrigin;
      origin.x = p.x;
      origin.y = p.y + STEP_UP + 1e-6;
      origin.z = p.z;
      const dir = this.#flightDir;
      dir.x = mx / length;
      dir.y = 0;
      dir.z = mz / length;
      const hit = world.raycast(origin, dir, this.#flightHit, length);
      if (hit && hit.normal.y === 0) return "blocked";
      const sign = mx * Math.sin(this.yaw) + mz * Math.cos(this.yaw) >= 0 ? 1 : -1;
      const reach = HEAD_AHEAD * FLY_LENGTH * sign;
      const allowed = STEP_UP + (Math.abs(reach) / 3) * MAX_SLOPE_TAN;
      let y = p.y;
      for (let k = 1; k <= 3; k++) {
        const hx = x + (Math.sin(this.yaw) * reach * k) / 3;
        const hz = z + (Math.cos(this.yaw) * reach * k) / 3;
        if (!world.onTable(hx, hz)) return "blocked";
        const ground = world.surface(hx, hz, this.#probe, y + allowed);
        if (ground.underside < Math.max(y, ground.y) + FLY_HEIGHT) return "blocked";
        if (ground.solid >= 0 && solidBottom(world.solids[ground.solid]) > y + STEP_UP) return "blocked";
        y = Math.max(y, ground.y);
      }
    }
    // What it stands on there is the highest surface within a step of its feet, with room over it for its body.
    const next = world.surface(x, z, this.#probe, p.y + STEP_UP);
    if (!next.onTable) return "blocked";
    if (next.underside < Math.max(p.y, next.y) + FLY_HEIGHT) return "blocked";
    const rise = next.y - p.y;
    if (rise > 0 && next.normal.y < MAX_SLOPE_COS) return "blocked";
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
    // Facing its course, and steered by the brain: the body's, see VANE_RATE.
    const sx = v.x - forces.air.x;
    const sz = v.z - forces.air.z;
    const course = Math.hypot(sx, sz);
    const vane = course > 1e-6 ? wrap(Math.atan2(sx, sz) - this.yaw) * VANE_RATE * Math.min(1, course / VANE_SPEED) : 0;
    const yawRate = intent.airYawRate + vane;
    this.yaw = wrap(this.yaw + yawRate * dt);
    this.turnRate = yawRate;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const w = intent.wings;
    // Weight, the wings' lift and thrust, drag through the moving air.
    let ax = fx * THRUST * w - DRAG * (v.x - forces.air.x);
    let ay = LIFT * w - GRAVITY - DRAG * (v.y - forces.air.y);
    let az = fz * THRUST * w - DRAG * (v.z - forces.air.z);
    // Drawn back into the world near its edges: the body's, see the top of the file.
    const out = world.beyond(p.x, p.z, this.#inward);
    if (out > 0) {
      ax += this.#inward.x * out * AIR_PULL;
      az += this.#inward.z * out * AIR_PULL;
    }
    const ceiling = world.place.ceiling;
    if (p.y > ceiling) ay -= (p.y - ceiling) * AIR_PULL;
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

    // Outside the floor it cannot fall below the edge while returning. Clamp
    // before sweeping, or that correction could lift it into an outside wall.
    if (!world.onTable(p.x, p.z) && p.y < 1) {
      p.y = 1;
      if (v.y < 0) v.y = 0;
    }

    // A fast fly can cross a pane between endpoints, even at normal frame times. Its
    // feet sweep the way it went, with its body over them.
    const distance = Math.hypot(p.x - px, p.y - py, p.z - pz);
    if (distance > 1e-9) {
      const origin = this.#flightOrigin;
      origin.x = px;
      origin.y = py + 1e-6;
      origin.z = pz;
      const dir = this.#flightDir;
      dir.x = (p.x - px) / distance;
      dir.y = (p.y - py) / distance;
      dir.z = (p.z - pz) / distance;
      const hit = world.raycast(origin, dir, this.#flightHit, distance, FLY_HEIGHT - SLACK);
      if (hit && hit.t <= distance) {
        if (hit.normal.y === 0) {
          p.x = px;
          p.z = pz;
          // Rolling back sideways must not leave its feet below the old surface, nor its body in what is over it.
          p.y = this.#within(px, pz, py, p.y);
          const into = v.x * hit.normal.x + v.z * hit.normal.z;
          if (into < 0) {
            v.x -= into * hit.normal.x * 1.4;
            v.z -= into * hit.normal.z * 1.4;
            this.events.hit = Math.max(this.events.hit, -into);
            this.blocked = fx * hit.normal.x + fz * hit.normal.z < -0.3;
          }
        } else if (hit.normal.y < 0) {
          // Rose into an underside: its body kept just under it, bounced back down, and on along under it
          // the rest of the way unless something stands in that way.
          const y = solidBottom(world.solids[hit.solid]) - FLY_HEIGHT;
          if (v.y > 0) {
            this.events.hit = Math.max(this.events.hit, v.y);
            v.y *= -0.4;
          }
          const hx = hit.point.x;
          const hz = hit.point.z;
          const rest = Math.hypot(p.x - hx, p.z - hz);
          if (rest > 1e-9) {
            origin.x = hx;
            origin.y = y + 1e-6;
            origin.z = hz;
            dir.x = (p.x - hx) / rest;
            dir.y = 0;
            dir.z = (p.z - hz) / rest;
            const stop = world.raycast(origin, dir, this.#flightHit, rest, FLY_HEIGHT - SLACK);
            if (stop) {
              p.x = hx;
              p.z = hz;
              const into = v.x * stop.normal.x + v.z * stop.normal.z;
              if (stop.normal.y === 0 && into < 0) {
                v.x -= into * stop.normal.x * 1.4;
                v.z -= into * stop.normal.z * 1.4;
                this.events.hit = Math.max(this.events.hit, -into);
              }
            }
          }
          p.y = y;
        } else if (hit.normal.y >= MAX_SLOPE_COS && !world.onTable(hit.point.x, hit.point.z)) {
          // Keep sliding back across an outside wall's top, without perching on it.
          p.y = Math.max(p.y, hit.point.y);
        } else if (hit.normal.y >= MAX_SLOPE_COS) {
          p.x = hit.point.x;
          p.z = hit.point.z;
          p.y = hit.solid >= 0 ? topHeight(world.solids[hit.solid], p.x, p.z) : 0;
        }
      }
    }

    // What it has come down onto: within a step under its feet, or the top of what they went into (a slope
    // too steep to stand on, or more than a step); not something over it.
    const under = world.surface(p.x, p.z, this.#probe, Math.max(p.y + STEP_UP, world.topAbove(p.x, Math.max(p.y, 2 * TOUCH), p.z)));
    const onIt = (under.onTable || under.solid >= 0) && p.y <= under.y;
    if (onIt && under.underside >= under.y + FLY_HEIGHT && (py >= under.y - STEP_UP || world.heightAt(px, pz, py + STEP_UP) >= under.y - 1e-6)) {
      // Came down onto it from above.
      if (!under.onTable && under.normal.y >= MAX_SLOPE_COS) {
        p.y = under.y;
        if (v.y < 0) v.y = 0;
        this.groundSpeed = 0;
        this.#easeUp(levelUp, dt);
        return;
      }
      if (under.normal.y >= MAX_SLOPE_COS) {
        this.events.hit = Math.max(this.events.hit, -v.y);
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
    } else if (onIt || under.underside < Math.max(p.y, under.y) + FLY_HEIGHT) {
      // Flew into its side, or its body into something over it: back out, bounced off.
      const mx = p.x - px;
      const mz = p.z - pz;
      p.x = px;
      p.z = pz;
      p.y = this.#within(px, pz, py, p.y);
      const wall = this.#wall;
      if (world.wallNormal(p.x + v.x * dt, p.z + v.z * dt, p.y, wall, p.y + FLY_HEIGHT)) {
        const into = v.x * wall.x + v.z * wall.z;
        if (into < 0) {
          v.x -= into * wall.x * 1.4;
          v.z -= into * wall.z * 1.4;
          this.events.hit = Math.max(this.events.hit, -into);
          this.blocked = fx * wall.x + fz * wall.z < -0.3;
        }
      } else {
        v.x *= -0.3;
        v.z *= -0.3;
      }
      // Beyond the floor, drawn back over it against something in the way, it slides round that rather than being held there.
      const held = world.onTable(px, pz) ? -1 : world.solidAt(px + mx, p.y + FLY_HEIGHT / 2, pz + mz);
      if (held >= 0) {
        sideNormal(world.solids[held].footprint, px, pz, wall);
        const along = mx * wall.x + mz * wall.z;
        this.#slide(mx - along * wall.x, mz - along * wall.z);
      }
    }
    this.groundSpeed = 0;
    // In the air its "up" follows level flight.
    this.#easeUp(levelUp, dt);
  }

  /** Moves it level by (mx, mz) in the air, if nothing is in the way and there is room for its body there. */
  #slide(mx: number, mz: number) {
    const world = this.#world;
    const p = this.position;
    const length = Math.hypot(mx, mz);
    if (length < 1e-9) return;
    const origin = this.#flightOrigin;
    origin.x = p.x;
    origin.y = p.y + 1e-6;
    origin.z = p.z;
    const dir = this.#flightDir;
    dir.x = mx / length;
    dir.y = 0;
    dir.z = mz / length;
    if (world.raycast(origin, dir, this.#flightHit, length, FLY_HEIGHT - SLACK)) return;
    if (world.underside(p.x + mx, p.z + mz, p.y) < p.y + FLY_HEIGHT) return;
    p.x += mx;
    p.z += mz;
  }

  /** A height at (x, z) as near `to` as the air it was in at `from` allows: on the surface under it or above, its body clear of what is over it. */
  #within(x: number, z: number, from: number, to: number) {
    const s = this.#world.surface(x, z, this.#probe, from + STEP_UP);
    return Math.max(s.y, Math.min(to, s.underside - FLY_HEIGHT));
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
  to.underside = from.underside;
}
