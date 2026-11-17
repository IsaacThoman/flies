// What the fly's body feels each frame, as the brain's senses.
//
// Left and right are the fly's own. Each sense is measured from what happens
// to the body in the world; none of them is set because of what the fly is
// "supposed" to do next.

import type { BrainSenses } from "@fly/brain";
import type { Food, Pantry, Vec3, World } from "@fly/world";
import { AMBIENT_TEMPERATURE, tasteIntensity } from "@fly/world";
import { ease } from "./behavior.ts";
import { FLY_HEIGHT, FLY_LENGTH, HEAD_AHEAD, HEAD_UP, MOUTH_AHEAD, MOUTH_UP, STEP_UP } from "./motion.ts";
import type { FlyBody } from "./motion.ts";
import type { Bodies } from "./crowd.ts";
import { POINT_REACH, TOUCH_PARTS, press, pressFlat } from "./touch.ts";
import type { Contacts } from "./touch.ts";

/**
 * Something the fly could see coming: a ball of radius `r` at `position`. Its
 * looming is how fast it grows in the eye, measured each frame.
 */
export type Looming = { id: number; position: Vec3; r: number };

export type SenseInput = {
  dt: number;
  body: FlyBody;
  world: World;
  pantry: Pantry;
  /** Things that could loom. Ignored while the eyes are in use: then the eyes see them. */
  looming: readonly Looming[];
  /** What touches it from outside this frame (a feather, a raindrop, a bubble), where and how hard. */
  contacts?: Contacts;
  /** Another fly pushing against it this frame: how hard (0 to 1) and where on its body (crowd.ts). */
  pushed?: { readonly touch: number; readonly contact: Readonly<Vec3> };
  /** The air's own velocity at the fly, mm/s. */
  air: Vec3;
  /** The brain's eyes see the world: no hand-wired looming then. */
  eyesOpen: boolean;
  /** How far the proboscis reaches now (0 to 1, the feeding pose), adding to what the mouth can taste. */
  proboscis: number;
  /** Other flies' bodies, which the antennae press on as on a wall (at a table with others). */
  bodies?: Bodies;
};

/** Angular expansion (rad/s) below which nothing looms, and at which it looms fully. */
export const LOOM_MIN_RATE = 0.8;
export const LOOM_FULL_RATE = 4;
/** Only something at least this big in the eye (rad) looms. */
export const LOOM_MIN_ANGLE = 0.08;
/** A loom is held this long (s) at its peak, then fades out over LOOM_DECAY. */
export const LOOM_HOLD = 0.08;
export const LOOM_DECAY = 0.2;
/** Something within this slope of straight ahead, behind, above or below looms in both eyes. */
export const LOOM_BOTH_SLOPE = 0.35;
/** Touch and bump ease out over about this long (s) once they stop. */
export const RELEASE = 0.3;
/** Hitting something in the air at this speed (mm/s) or more is a full touch. */
export const HIT_FULL_SPEED = 400;
/** Its own speed through the air at which wind is full, mm/s. */
export const WIND_FULL_SPEED = 1000;
const WIND_SMOOTHING = 15;
/** How far ahead of the head and to each side the antennae reach, in body lengths. */
export const ANTENNA_AHEAD = 0.2;
export const ANTENNA_SIDE = 0.12;
/**
 * How far an antenna's tip has to be pushed back (mm) to drive Johnston's
 * organ's push neurons fully: zone E answered weakly below 0.04 mm of the
 * arista's displacement and most after two steps of 0.033 mm, no more after a
 * third (Yorozu et al. 2009, Nature 458:201). Anything that meets the antenna
 * at all pushes it this far (its joint and its transducers' gating springs give
 * at about 0.04 pN/nm each: Nadrowski, Albert & Göpfert 2008, Curr Biol 18:1365,
 * supplement; 0.07 mm is a few nanonewtons, against the fly's 10 µN of
 * weight), so contact is felt fully, and for as long as it lasts: zones C and
 * E answer a held deflection for as long as it is held (10 s and 8 s, the
 * longest tried: Kamikouchi et al. 2009, Nature 458:165; Yorozu et al. 2009).
 */
export const ANTENNA_FULL = 0.07;
/** How far the mouthparts reach, mm, plus the proboscis's reach when extended. */
export const MOUTH_REACH = 0.3;
export const PROBOSCIS_REACH = 0.4;
/** Where its feet are: around its middle, within this radius (mm). */
export const FOOT_SPREAD = 0.9;
/**
 * Where the front legs' tarsi rest, in body lengths ahead of its middle and to
 * each side (packages/fly's anatomy: LEGS' front foot), and how close (mm) to
 * another fly's body one has to come to touch it.
 */
export const FORELEG_AHEAD = 0.66;
export const FORELEG_SIDE = 0.27;
export const FORELEG_REACH = 0.1;
/**
 * Walking into a wall it faces, how far (mm) its head comes on past where it
 * stands: its forelegs give, its antennae come up to the wall where their
 * tarsi were (they stand ahead of the antennae's tips), and are pushed in far
 * enough to be felt fully.
 */
export const PUSH_LEAN = (FORELEG_AHEAD - HEAD_AHEAD - ANTENNA_AHEAD) * FLY_LENGTH + ANTENNA_FULL;

/** Something it would walk into at (x, z), standing with its feet at `feet`: between a step and its height over them. */
const wallAt = (world: World, x: number, z: number, feet: number) => world.onTable(x, z) && world.underside(x, z, feet + STEP_UP) < feet + FLY_HEIGHT;

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** Follows a rising target at once and eases out toward a falling one over about `seconds`. */
function release(value: number, target: number, seconds: number, dt: number) {
  if (target >= value) return target;
  const next = value + (target - value) * ease(3 / seconds, dt);
  return next - target < 0.005 ? target : next;
}

type EyeState = { value: number; hold: number };

/** The food at its mouth, or under its feet when its mouth touches nothing. */
export type Tasting = { food: Food | null; byMouth: boolean };

export class SenseTracker {
  readonly senses: BrainSenses = {
    loomLeft: 0,
    loomRight: 0,
    touch: 0,
    bumpLeft: 0,
    bumpRight: 0,
    wind: 0,
    sweet: 0,
    grounded: true,
    maleTaste: 0,
    wingbeat: 0,
    bitter: 0,
    water: 0,
    temperatureLeft: AMBIENT_TEMPERATURE,
    temperatureRight: AMBIENT_TEMPERATURE,
  };
  readonly tasting: Tasting = { food: null, byMouth: false };
  /** How large each looming thing was in the eye last frame (rad), by id. */
  #sizes = new Map<number, number>();
  #eyes: { left: EyeState; right: EyeState } = { left: { value: 0, hold: 0 }, right: { value: 0, hold: 0 } };
  /** Each part's touch as felt (TOUCH_PARTS), easing out, and this frame's. */
  readonly #touch = new Float64Array(TOUCH_PARTS.length);
  readonly #pressed = new Float64Array(TOUCH_PARTS.length);
  #touched = 0;
  #bumpLeft = 0;
  #bumpRight = 0;
  #wind = 0;
  #maleTaste = 0;
  #head: Vec3 = { x: 0, y: 0, z: 0 };
  #probe: Vec3 = { x: 0, y: 0, z: 0 };

  /** How hard the hardest thing touching it presses, wherever it is (0 to 1; the feather resting 0.4, stroking 1), easing out as each part's touch does. */
  get touched(): number {
    return this.#touched;
  }

  update(input: SenseInput): BrainSenses {
    const dt = Number.isFinite(input.dt) ? Math.max(0, input.dt) : 0;
    const { body, world, pantry } = input;
    const out = this.senses;
    const head = body.point(HEAD_AHEAD, HEAD_UP, 0, this.#head);

    // Looming: how fast something grows in each eye.
    let loomLeft = 0;
    let loomRight = 0;
    if (!input.eyesOpen) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      for (const thing of input.looming) {
        const dx = thing.position.x - head.x;
        const dy = thing.position.y - head.y;
        const dz = thing.position.z - head.z;
        const d = Math.max(thing.r * 1.0001, Math.hypot(dx, dy, dz));
        const size = 2 * Math.asin(Math.min(1, thing.r / d));
        const before = this.#sizes.get(thing.id);
        this.#sizes.set(thing.id, size);
        if (before === undefined || dt <= 0 || size < LOOM_MIN_ANGLE) continue;
        const rate = (size - before) / dt;
        const loom = clamp01((rate - LOOM_MIN_RATE) / (LOOM_FULL_RATE - LOOM_MIN_RATE));
        if (loom <= 0) continue;
        // In the fly's frame: its left is (cos yaw, 0, -sin yaw), ahead is (sin yaw, 0, cos yaw).
        const left = dx * cos - dz * sin;
        const ahead = dx * sin + dz * cos;
        const rest = Math.hypot(ahead, dy);
        const both = Math.abs(left) <= LOOM_BOTH_SLOPE * rest;
        if (both || left > 0) loomLeft = Math.max(loomLeft, loom);
        if (both || left < 0) loomRight = Math.max(loomRight, loom);
      }
      // (Things that stop looming keep their last size: the list is small and fixed.)
    } else {
      this.#sizes.clear();
    }
    this.#eye(this.#eyes.left, loomLeft, dt);
    this.#eye(this.#eyes.right, loomRight, dt);

    // Touch, where it lands: whatever touches it, another fly pushing it, and what it hits flying or landing.
    const pressed = this.#pressed;
    pressed.fill(0);
    const contacts = input.contacts;
    if (contacts) for (let k = 0; k < contacts.count; k++) press(body, contacts.x[k], contacts.y[k], contacts.z[k], contacts.reach[k], contacts.strength[k], pressed);
    const pushed = input.pushed;
    if (pushed && pushed.touch > 0) press(body, pushed.contact.x, pushed.contact.y, pushed.contact.z, POINT_REACH, clamp01(pushed.touch), pressed);
    const hit = clamp01(body.events.hit / HIT_FULL_SPEED);
    if (hit > 0) pressFlat(body, body.events.hitFrom.x, body.events.hitFrom.y, body.events.hitFrom.z, POINT_REACH, hit, pressed);
    for (let k = 0; k < pressed.length; k++) this.#touch[k] = release(this.#touch[k], pressed[k], RELEASE, dt);
    const strongest = Math.max(contacts?.strongest ?? 0, pushed ? clamp01(pushed.touch) : 0, hit);
    this.#touched = release(this.#touched, strongest, RELEASE, dt);

    // Antennae: just ahead of the head, one each side. Each feels what pushes it back.
    this.#bumpLeft = release(this.#bumpLeft, this.#pressing(body, world, 1, input.bodies) ? 1 : 0, RELEASE, dt);
    this.#bumpRight = release(this.#bumpRight, this.#pressing(body, world, -1, input.bodies) ? 1 : 0, RELEASE, dt);

    // Wind: its own speed through the air.
    const v = body.velocity;
    const airspeed = Math.hypot(v.x - input.air.x, v.y - input.air.y, v.z - input.air.z);
    this.#wind += (clamp01(airspeed / WIND_FULL_SPEED) - this.#wind) * ease(WIND_SMOOTHING, dt);
    if (this.#wind < 0.005) this.#wind = 0;

    // A male's taste: another fly's body under a front leg's tarsus, where a
    // male's pheromone-sensing taste bristles are. Every other fly is a male.
    const foreleg = body.onFeet && (this.#foreleg(body, 1, input.bodies) || this.#foreleg(body, -1, input.bodies));
    this.#maleTaste = release(this.#maleTaste, foreleg ? 1 : 0, RELEASE, dt);

    // Taste: with the feet and the mouthparts, while it stands.
    const tasting = this.tasting;
    tasting.food = null;
    tasting.byMouth = false;
    let sweet = 0;
    let water = 0;
    let bitter = 0;
    if (body.onFeet) {
      const mouth = body.point(MOUTH_AHEAD, MOUTH_UP, 0, this.#probe);
      const reach = MOUTH_REACH + PROBOSCIS_REACH * clamp01(input.proboscis);
      // The head goes down to the ground under it: on a rise it could step onto (up a fruit's curve) that is
      // where its mouth is, not level with its feet, where the surface found would be the table under the fruit.
      const feet = body.position.y;
      const atMouth = pantry.touching(mouth.x, Math.max(feet, world.heightAt(mouth.x, mouth.z, feet + STEP_UP)), mouth.z, reach);
      const underfoot = pantry.touching(body.position.x, body.position.y, body.position.z, FOOT_SPREAD);
      // Stronger foot taste must not prevent eating a food already at the mouth.
      tasting.food = atMouth ?? underfoot;
      tasting.byMouth = atMouth !== null;
      sweet = Math.max(atMouth ? tasteIntensity(atMouth) : 0, underfoot ? tasteIntensity(underfoot) : 0);
      water = Math.max(atMouth ? tasteIntensity(atMouth, "water") : 0, underfoot ? tasteIntensity(underfoot, "water") : 0);
      bitter = Math.max(atMouth ? tasteIntensity(atMouth, "bitter") : 0, underfoot ? tasteIntensity(underfoot, "bitter") : 0);
    }

    out.loomLeft = clamp01(this.#eyes.left.value);
    out.loomRight = clamp01(this.#eyes.right.value);
    // It knows where it is touched, so nothing touches it everywhere at once.
    out.touch = 0;
    for (let k = 0; k < TOUCH_PARTS.length; k++) out[TOUCH_PARTS[k]] = clamp01(this.#touch[k]);
    out.bumpLeft = clamp01(this.#bumpLeft);
    out.bumpRight = clamp01(this.#bumpRight);
    out.wind = clamp01(this.#wind);
    out.sweet = clamp01(sweet);
    out.grounded = body.onFeet;
    out.maleTaste = clamp01(this.#maleTaste);
    // Its own wings, as they beat in its last step: their strain sensors feel each stroke.
    out.wingbeat = clamp01(body.wingbeat);
    out.bitter = clamp01(bitter);
    out.water = clamp01(water);
    // The air's temperature at each arista, as it is: the brain's thermoreceptors make of it what they do.
    out.temperatureLeft = this.#temperature(body, world, 1);
    out.temperatureRight = this.#temperature(body, world, -1);
    return out;
  }

  /** The air's temperature at that antenna's tip, where its arista's thermoreceptors are, at the arista's base (Gallio et al. 2011). */
  #temperature(body: FlyBody, world: World, side: 1 | -1) {
    const arista = body.point(HEAD_AHEAD + ANTENNA_AHEAD, HEAD_UP, side * ANTENNA_SIDE, this.#probe);
    return world.temperature.at(arista.x, arista.y, arista.z);
  }

  #foreleg(body: FlyBody, side: 1 | -1, bodies: Bodies | undefined) {
    if (!bodies) return false;
    const tarsus = body.point(FORELEG_AHEAD, 0, side * FORELEG_SIDE, this.#probe);
    return bodies.inside(tarsus.x, tarsus.y, tarsus.z, FORELEG_REACH);
  }

  /**
   * Something pushes this antenna back: its tip is inside another fly's body, or in the air inside something.
   * On its feet, a wall (something between a step and its height over its feet) at the tip, unless that
   * side's foreleg stands against the wall too and holds its head off it; or, walking into a wall it faces,
   * one at the tip as its head comes on (PUSH_LEAN). Past the table's edge there is nothing to touch.
   */
  #pressing(body: FlyBody, world: World, side: 1 | -1, bodies: Bodies | undefined) {
    const tip = body.point(HEAD_AHEAD + ANTENNA_AHEAD, HEAD_UP, side * ANTENNA_SIDE, this.#probe);
    if (bodies?.inside(tip.x, tip.y, tip.z, 0)) return true;
    if (!body.onFeet) return world.onTable(tip.x, tip.z) && world.solidAt(tip.x, tip.y, tip.z) >= 0;
    const feet = body.position.y;
    const wall = wallAt(world, tip.x, tip.z, feet);
    if (body.blocked) return wall || wallAt(world, tip.x + Math.sin(body.yaw) * PUSH_LEAN, tip.z + Math.cos(body.yaw) * PUSH_LEAN, feet);
    if (!wall) return false;
    // Its foreleg's tarsus stands further ahead than the antenna's tip: on a wall, it keeps the antenna off it.
    const tarsus = body.point(FORELEG_AHEAD, 0, side * FORELEG_SIDE, this.#probe);
    return world.solidAt(tarsus.x, feet + STEP_UP, tarsus.z) < 0;
  }

  #eye(state: EyeState, seen: number, dt: number) {
    if (seen >= state.value && seen > 0) {
      state.value = seen;
      state.hold = LOOM_HOLD;
    } else if (state.hold > 0) {
      state.hold = Math.max(0, state.hold - dt);
    } else {
      state.value = Math.max(seen, state.value - dt / LOOM_DECAY);
    }
  }
}
