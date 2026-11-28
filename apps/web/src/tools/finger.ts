// The player's fingertip in the fly's world (the Finger tool): a finger laid
// along the table from a hand above, solid in the world (packages/world's
// moving solids), so the fly's eyes see it, its body stands on it and bumps
// into it, and its antennae feel it as they feel any wall.
//
// It goes where the hand goes, and Select puts it down on whatever is under
// it or lifts it a little way. Nothing about it steers the fly: a fly walks
// onto it if its brain walks it there, and what a fast approach does is what
// its eyes and its brain make of it. What it does to the fly besides being
// there:
//
// - A fly standing on it goes where it goes: its feet stay where they stand
//   on it. That is the body's contact with a moving surface, not a choice.
// - Moved onto the fly, or resting on it, it is felt as a touch. It never
//   presses into a fly or into anything else: it comes to rest on the
//   highest thing under it, the fly's back included, and rides up over what
//   it is moved into.
// - Carried, the fly's own speed through the air is the finger's: it feels
//   that wind as it feels any (packages/body/src/senses.ts).
// - With the brain's eyes shut, its tip is something that can loom (as the
//   ball is); with them open, the eyes see it.
//
// The body walks up nothing steeper than 65° (packages/body/src/motion.ts),
// where a real fly's feet would climb a finger's side. So the finger's skin
// flares out where it meets the table, as a fingertip's pad spreads when it is
// pressed down, at a slope the body can walk up: a stand-in, drawn as it is felt.
// Put away (another tool, the screensaver), the finger sets down where it is
// and lifts away once nothing stands on it.

import type { Contacts, FlyBody, Looming } from "@fly/body";
import { FLY_HEIGHT, FLY_LENGTH, STEP_UP } from "@fly/body";
import { PIECE_SHAPES, createSurface, footprintRadius, inside, pieceAngle, topHeight } from "@fly/world";
import type { Piece, Solid, Surface, Vec3, World } from "@fly/world";

/** Half the finger's width, mm, and how high its skin rises over its underside: a finger 15 mm across beside a fly 2.5 mm long. */
export const FINGER_HALF_WIDTH = 7.5;
export const FINGER_THICKNESS = 9;
/**
 * The shape of its cross-section over its underside: height × (1 − s²)^power,
 * s from its middle line (0) to its edge (1). At 1.5 the skin meets the table
 * level and is steepest (61°) a third of the way up: walkable.
 */
export const FINGER_POWER = 1.5;
/** From the middle of its rounded tip back to the knuckle, where it rises toward the hand, mm. */
export const FINGER_LENGTH = 30;
/** The rising finger: its radius, how high over the finger's underside the lower part goes before the upper one, and how high the upper reaches. */
export const RISE_RADIUS = 8;
export const RISE_SPLIT = 60;
export const RISE_TOP = 160;
/** How far the rising finger leans back toward the hand (radians from straight up), and where its axis meets the table, mm back from the tip's middle. */
export const RISE_LEAN = 0.17;
export const RISE_AT = FINGER_LENGTH + RISE_RADIUS * 0.4;
/** The middle of the lower part of the rising finger, mm back from the tip's middle. */
const RISE_LOW = RISE_AT + Math.tan(RISE_LEAN) * RISE_SPLIT * 0.5;
/** How far (mm) over what is under it it is held when lifted, and comes in or goes away from. */
export const LIFT = 6;
export const AWAY = 70;
/** How fast (mm/s) it comes down, and goes up when lifted; it rises over what it is moved onto at once. */
export const LOWER_SPEED = 30;
export const RAISE_SPEED = 45;
/** How fast it follows the hand (1/s), and its fastest (mm/s). */
export const FOLLOW = 30;
export const TOP_SPEED = 900;
/** A fly is touched by it moving onto it faster than this (mm/s, fully); resting on it, lightly. */
export const MOVING_TOUCH = 5;
export const RESTING_TOUCH = 0.4;
/**
 * Pressing flat from above, it bends the bristles of what stands highest
 * under it and of whatever is within this (mm) below that: bristles about as
 * long (the notum's microchaetae, 0.1 to 0.15 mm). Moved into the fly's side,
 * its broad edge bends what is within this of where it meets it.
 */
export const PRESS_DEPTH = 0.12;
export const EDGE_REACH = 0.5;
/** Faster than this (mm/s) the followed fly's eyes look every frame. */
export const FAST = 60;

/** A fly's body, as the finger meets it: its middle's half width (packages/body/src/crowd.ts), and the underside of its thorax over its feet. */
const BODY_HALF_WIDTH = 0.3 * FLY_LENGTH;
const BODY_LOW = 0.18 * FLY_LENGTH;
/** A fly seen from above, in body lengths ahead and to its left: its head, thorax and abdomen, along its middle and either side. */
const OUTLINE = [0.45, 0, 0.4, 0.12, 0.4, -0.12, 0.15, 0, 0.15, 0.12, 0.15, -0.12, -0.15, 0, -0.15, 0.12, -0.15, -0.12, -0.45, 0, -0.35, 0.1, -0.35, -0.1];
/** The middle of its body over its feet (packages/body/src/crowd.ts). */
const BODY_UP = 0.3 * FLY_LENGTH;

/** How many solids it is made of: its tip, its length, and the lower and upper finger rising toward the hand. */
const SOLIDS = 4;

/** At most this many flies stand on it at once (the flies this device lives). */
const MAX_CARRIED = 8;

/** The height (mm) of the finger's skin over its underside at `along` its length from its tip's middle (negative: round the tip) and `lateral` across, or -1 past its edge (the rising part aside). */
export function fingerHeight(along: number, lateral: number): number {
  const w = FINGER_HALF_WIDTH;
  if (along > FINGER_LENGTH) return -1;
  const s2 = (along < 0 ? along * along + lateral * lateral : lateral * lateral) / (w * w);
  return s2 >= 1 ? -1 : FINGER_THICKNESS * Math.pow(1 - s2, FINGER_POWER);
}

export type FingerState = "away" | "raised" | "down";

export class Finger {
  /** In the world now. */
  present = false;
  /** Put down (Select), rather than lifted. */
  down = false;
  /** The middle of its rounded tip, at its underside. */
  readonly tip: Vec3 = { x: 0, y: 0, z: 0 };
  /** The way from its tip back along it, toward the hand (radians, as the fly's yaw: (sin, cos)). */
  yaw = 0;
  /** How it moved over its last frame, mm/s. */
  readonly velocity: Vec3 = { x: 0, y: 0, z: 0 };
  speed = 0;
  /** The highest thing under it, as it last looked (its underside rests there when down). */
  floor = 0;
  /** Flies standing on it after its last frame. */
  carried = 0;
  /** The tip, for a brain without eyes: something that can loom (as the ball does). Far away while it isn't here. */
  readonly looming: Looming = { id: 3, position: { x: 0, y: -1e4, z: 0 }, r: FINGER_HALF_WIDTH };
  readonly solids: Solid[];
  readonly #world: World;
  readonly #on: (FlyBody | null)[] = new Array<FlyBody | null>(MAX_CARRIED).fill(null);
  readonly #surface = createSurface();
  #inHand = false;
  /** Asked to be down before it has come in: it comes in down. */
  #downOnArrival = false;
  /** The surface the hand was last on: the finger rests on nothing more than RISE_SPLIT over it (a jar beside it, not the jar's top far above). */
  #ground = 0;

  constructor(world: World) {
    this.#world = world;
    const w = FINGER_HALF_WIDTH;
    this.solids = [
      { name: "fingertip", footprint: { kind: "circle", x: 0, z: 0, r: w }, top: { kind: "dome", base: 0, height: FINGER_THICKNESS, power: FINGER_POWER }, bottom: 0 },
      { name: "finger", footprint: { kind: "box", x: 0, z: 0, hx: w, hz: FINGER_LENGTH / 2, angle: 0 }, top: { kind: "vault", base: 0, height: FINGER_THICKNESS, power: FINGER_POWER }, bottom: 0 },
      { name: "finger rising", footprint: { kind: "circle", x: 0, z: 0, r: RISE_RADIUS }, top: { kind: "flat", y: RISE_SPLIT }, bottom: 0 },
      { name: "finger rising", footprint: { kind: "circle", x: 0, z: 0, r: RISE_RADIUS }, top: { kind: "flat", y: RISE_TOP }, bottom: RISE_SPLIT },
    ];
    world.addMoving(this.solids);
    world.movingPresent = false;
  }

  /** Whether a solid (an index in the world's) is part of the finger. */
  isFinger(solid: number) {
    const from = this.#world.movingFrom;
    return this.present && solid >= from && solid < from + SOLIDS;
  }

  get state(): FingerState {
    return !this.present ? "away" : this.down ? "down" : "raised";
  }

  /** Select with the finger in hand: put it down, or lift it. */
  use() {
    this.down = !this.down;
  }

  /** Down where the hand is, whether it is there yet or still to come in (the empty hand held still on the table). */
  putDown() {
    if (this.present) this.down = true;
    else this.#downOnArrival = true;
  }

  /** Gone at once, with nothing on it: the fly has been carried to another place. */
  clear() {
    this.present = false;
    this.down = false;
    this.#downOnArrival = false;
    this.carried = 0;
    this.#on.fill(null);
    this.#world.movingPresent = false;
    this.looming.position.y = -1e4;
    this.velocity.x = this.velocity.y = this.velocity.z = this.speed = 0;
  }

  /**
   * Its frame, before the flies live theirs: `inHand` while it is the tool in
   * hand in play; it goes toward `pointer` (the hand on the table), pointing
   * at `toward` (the followed fly: the hand reaches in from beyond the tip, so
   * the finger never lies across the fly or the camera behind it), and
   * carries those of `bodies` standing on it.
   */
  update(dt: number, inHand: boolean, pointer: Vec3, toward: Vec3, bodies: readonly FlyBody[]) {
    if (!(dt > 0)) return;
    const world = this.#world;
    const tip = this.tip;
    // Who stands on it now, before it moves.
    let on = 0;
    if (this.present) for (const body of bodies) if (on < MAX_CARRIED && this.#standsOn(body)) this.#on[on++] = body;
    for (let i = on; i < MAX_CARRIED; i++) this.#on[i] = null;
    this.#inHand = inHand;
    if (inHand) {
      // The world's own surface there, the finger left out: a hand found on the finger itself would lift it by its own height, again and again.
      const present = world.movingPresent;
      world.movingPresent = false;
      this.#ground = world.heightAt(pointer.x, pointer.z, pointer.y + 1e-3);
      world.movingPresent = present;
    }
    if (!this.present) {
      if (!inHand) return;
      // Coming in from above, pointing at the fly.
      this.present = true;
      this.down = this.#downOnArrival;
      this.#downOnArrival = false;
      tip.x = pointer.x;
      tip.z = pointer.z;
      if (Math.hypot(tip.x - toward.x, tip.z - toward.z) > FINGER_HALF_WIDTH) this.yaw = Math.atan2(tip.x - toward.x, tip.z - toward.z);
      this.#place();
      tip.y = this.#lookUnder(bodies, this.#ground) + AWAY;
      this.#place();
      world.movingPresent = true;
      world.moved();
    }
    const x0 = tip.x;
    const y0 = tip.y;
    const z0 = tip.z;
    const yaw0 = this.yaw;

    // Toward the hand, as fast as it is moved but no faster than a hand goes; put away, it stays where it is.
    if (inHand) {
      let dx = (pointer.x - tip.x) * (1 - Math.exp(-FOLLOW * dt));
      let dz = (pointer.z - tip.z) * (1 - Math.exp(-FOLLOW * dt));
      const step = Math.hypot(dx, dz);
      if (step > TOP_SPEED * dt) {
        dx *= (TOP_SPEED * dt) / step;
        dz *= (TOP_SPEED * dt) / step;
      }
      tip.x += dx;
      tip.z += dz;
      // Lifted with nothing on it, it comes round to point at the fly; down, or carrying, it holds still in the hand.
      if (!this.down && on === 0 && tip.y - this.floor > LIFT * 0.5 && Math.hypot(tip.x - toward.x, tip.z - toward.z) > FINGER_HALF_WIDTH) {
        this.yaw += wrap(Math.atan2(tip.x - toward.x, tip.z - toward.z) - this.yaw) * (1 - Math.exp(-4 * dt));
      }
    }
    this.#place();
    const floor = this.#lookUnder(bodies, this.#ground);
    this.floor = floor;
    const target = inHand ? floor + (this.down ? 0 : LIFT) : on > 0 ? floor : floor + AWAY;
    if (floor > tip.y) tip.y = floor;
    else if (target < tip.y) tip.y = Math.max(target, tip.y - LOWER_SPEED * dt);
    else tip.y = Math.min(target, tip.y + RAISE_SPEED * dt);
    this.#place();
    // Put away with nothing on it, and gone up out of the way: it is gone.
    if (!inHand && on === 0 && tip.y >= floor + AWAY - 1e-6) {
      this.clear();
      world.moved();
      return;
    }
    world.moved();

    const vx = (tip.x - x0) / dt;
    const vy = (tip.y - y0) / dt;
    const vz = (tip.z - z0) / dt;
    this.velocity.x = vx;
    this.velocity.y = vy;
    this.velocity.z = vz;
    this.speed = Math.hypot(vx, vy, vz);
    this.looming.position.x = tip.x;
    this.looming.position.y = tip.y + FINGER_THICKNESS / 2;
    this.looming.position.z = tip.z;

    // Those standing on it go with it: turned with it about its tip, moved with it, on its skin where they were.
    const turn = wrap(this.yaw - yaw0);
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    for (let i = 0; i < on; i++) {
      const body = this.#on[i]!;
      const p = body.position;
      const rx = p.x - x0;
      const rz = p.z - z0;
      // Turning by `turn` about +y: the same as a yaw's (sin, cos) heading.
      p.x = tip.x + rx * c + rz * s;
      p.z = tip.z - rx * s + rz * c;
      p.y += tip.y - y0;
      body.yaw = wrap(body.yaw + turn);
      world.surface(p.x, p.z, this.#surface, p.y + STEP_UP);
      if (this.isFinger(this.#surface.solid)) {
        p.y = this.#surface.y;
        copySurface(this.#surface, body.surface);
      }
    }
    this.carried = on;
  }

  /** Whether a fly was standing on it, and went with it, in its last frame. */
  carries(body: FlyBody) {
    for (let i = 0; i < this.carried; i++) if (this.#on[i] === body) return true;
    return false;
  }

  /** Moving fast near a fly (`at`, within `reach` mm), whose eyes should look every frame. */
  urgent(at: Vec3, reach = 80) {
    return this.present && this.speed > FAST && Math.hypot(at.x - this.tip.x, at.z - this.tip.z) < reach;
  }

  /**
   * Where the finger touches a fly, into `contacts` (packages/body/src/touch.ts):
   * resting on it or moving over it, it presses flat from above wherever it
   * covers the fly (its back, or its head if the tip is on it), lightly at
   * rest and fully moving; moved into its side, it presses where its edge
   * meets it, fully. A fly walking up to it, or standing on it, is not
   * touched by it: its antennae and its feet meet it as they meet anything else.
   */
  touch(body: FlyBody, contacts: Contacts) {
    if (!this.present || this.carries(body)) return;
    const p = body.position;
    const bottom = this.tip.y;
    // Under it, or beside it within the fly's half width.
    const along = this.#along(p.x, p.z);
    const lateral = this.#lateral(p.x, p.z);
    const side = Math.abs(lateral);
    const reach = along < 0 ? Math.max(0, Math.hypot(along, side) - BODY_HALF_WIDTH) : Math.max(0, side - BODY_HALF_WIDTH);
    const height = along < 0 ? fingerHeight(-reach, 0) : fingerHeight(Math.min(along, FINGER_LENGTH), reach);
    if (height < 0 || bottom + height <= p.y + BODY_LOW || bottom > p.y + FLY_HEIGHT + 0.05) return;
    // Its speed against the fly's own: a fly walking into a still finger isn't touched by it.
    const v = body.velocity;
    const moving = Math.hypot(this.velocity.x - v.x, this.velocity.y - (body.onFeet ? 0 : v.y), this.velocity.z - v.z) > MOVING_TOUCH;
    // Its underside on the fly's back or its head: a flat press from above, if anything of the fly is under it.
    if (bottom >= p.y + FLY_HEIGHT * 0.5) {
      if (this.#over(body)) contacts.addFlat(this, PRESS_DEPTH, moving ? 1 : RESTING_TOUCH);
      return;
    }
    if (!moving) return;
    // Its edge nearest the fly, at the height of the fly's middle.
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    let ex: number;
    let ez: number;
    if (along < 0) {
      const d = Math.hypot(along, lateral) || 1;
      ex = this.tip.x + (s * along + c * lateral) * (FINGER_HALF_WIDTH / d);
      ez = this.tip.z + (c * along - s * lateral) * (FINGER_HALF_WIDTH / d);
    } else {
      const at = Math.min(along, FINGER_LENGTH);
      const edge = Math.sign(lateral || 1) * FINGER_HALF_WIDTH;
      ex = this.tip.x + s * at + c * edge;
      ez = this.tip.z + c * at - s * edge;
    }
    contacts.add(ex, p.y + BODY_UP, ez, EDGE_REACH, 1);
  }

  /** Whether it covers anything of a fly, seen from above: its head, its thorax or its abdomen, along its middle or either side. */
  #over(body: FlyBody) {
    const p = body.position;
    const s = Math.sin(body.yaw);
    const c = Math.cos(body.yaw);
    for (let i = 0; i < OUTLINE.length; i += 2) {
      const ahead = OUTLINE[i] * FLY_LENGTH;
      const left = OUTLINE[i + 1] * FLY_LENGTH;
      if (this.covers(p.x + s * ahead + c * left, p.z + c * ahead - s * left)) return true;
    }
    return false;
  }

  /** How far a point is along it from its tip's middle, toward the hand (mm). */
  #along(x: number, z: number) {
    return (x - this.tip.x) * Math.sin(this.yaw) + (z - this.tip.z) * Math.cos(this.yaw);
  }

  /** How far a point is from its middle line, to the tip's left facing along it (mm). */
  #lateral(x: number, z: number) {
    return (x - this.tip.x) * Math.cos(this.yaw) - (z - this.tip.z) * Math.sin(this.yaw);
  }

  /**
   * The highest thing under it where it is now: the place's surfaces and what
   * stands on them (the kit's pieces too) under its footprint, the finger
   * itself left out, up to RISE_SPLIT over `from` (the surface the hand is
   * on), which it rides up over; and any fly under it that isn't
   * standing on it, whose back it would rest on rather than press into.
   * Everything near is looked at over the whole footprint, finely enough for
   * the narrowest thing (a wall of the kit), so it never comes down inside one.
   */
  #lookUnder(bodies: readonly FlyBody[], from: number): number {
    const world = this.#world;
    const tip = this.tip;
    const present = world.movingPresent;
    world.movingPresent = false;
    const below = from + RISE_SPLIT;
    let floor = world.heightAt(tip.x, tip.z, below);
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    // The footprint's box, seen from above: from round its tip back over the rising finger's foot.
    const far = RISE_LOW + RISE_RADIUS;
    const across = Math.max(FINGER_HALF_WIDTH, RISE_RADIUS);
    const cx = tip.x + s * ((far - FINGER_HALF_WIDTH) / 2);
    const cz = tip.z + c * ((far - FINGER_HALF_WIDTH) / 2);
    const reach = Math.hypot((far + FINGER_HALF_WIDTH) / 2, across);
    const near = world.gather(cx, cz, reach, -Infinity, below);
    for (let k = 0; k < near; k++) {
      const i = world.gathered(k);
      if (i >= world.movingFrom) continue;
      const solid = world.solids[i];
      const f = solid.footprint;
      const r = footprintRadius(f);
      // As fine as half its narrowest side, so a wall is found however it lies.
      const step = Math.max(0.4, Math.min(3, (f.kind === "circle" ? f.r : f.kind === "ellipse" ? Math.min(f.rx, f.rz) : Math.min(f.hx, f.hz)) / 2));
      const x0 = Math.max(f.x - r, cx - reach);
      const x1 = Math.min(f.x + r, cx + reach);
      const z0 = Math.max(f.z - r, cz - reach);
      const z1 = Math.min(f.z + r, cz + reach);
      for (let x = x0; x <= x1 + 1e-9; x += step) {
        for (let z = z0; z <= z1 + 1e-9; z += step) {
          if (!inside(f, x, z) || !this.covers(x, z)) continue;
          const h = topHeight(solid, x, z);
          if (h > floor && h <= below) floor = h;
        }
      }
    }
    world.movingPresent = present;
    // A fly under it (not on it): its back. Under is its feet under the finger's skin: one that walks up to the finger stands on
    // it as soon as its feet are over it, and one beside it is kept out of it by its own body (packages/body/src/motion.ts).
    for (const body of bodies) {
      if (this.#standsOn(body)) continue;
      const p = body.position;
      // In the air it is under the finger only wholly below its underside: one over its skin, landing or taking off, the body keeps out of it.
      if (!body.onFeet && p.y + FLY_HEIGHT > tip.y) continue;
      if (p.y + FLY_HEIGHT < floor) continue;
      const along = this.#along(p.x, p.z);
      const lateral = this.#lateral(p.x, p.z);
      const skin = fingerHeight(along, lateral);
      // Or, coming down from above it, over any of it: the tip on its head.
      const under = (skin >= 0 ? p.y < tip.y + skin : Math.hypot(along - RISE_LOW, lateral) < RISE_RADIUS && p.y < tip.y + RISE_SPLIT) || (p.y < tip.y - 1e-3 && this.#over(body));
      if (under) floor = Math.max(floor, p.y + FLY_HEIGHT);
    }
    return floor;
  }

  /** Whether a point is under the finger, seen from above: under its skin, or the foot of the finger rising from it. */
  covers(x: number, z: number): boolean {
    const along = this.#along(x, z);
    const lateral = this.#lateral(x, z);
    return fingerHeight(along, lateral) >= 0 || Math.hypot(along - RISE_LOW, lateral) < RISE_RADIUS;
  }

  /**
   * Whether a piece of the kit (packages/world/src/kit.ts) set down there
   * would be in the finger: under its footprint and as high as its underside.
   * The finger rests on pieces and rides up over them; a piece is never built
   * into it, or onto it.
   */
  blocks(piece: Piece): boolean {
    if (!this.present) return false;
    const shape = PIECE_SHAPES[piece.kind];
    if (piece.y + shape.height <= this.tip.y + 1e-6) return false;
    const f = shape.footprint(piece.x, piece.z, pieceAngle(piece));
    const r = footprintRadius(f);
    for (let x = f.x - r; x <= f.x + r + 1e-9; x += 0.5) for (let z = f.z - r; z <= f.z + r + 1e-9; z += 0.5) if (inside(f, x, z) && this.covers(x, z)) return true;
    return false;
  }

  /**
   * A fly on its feet on the finger's skin, wherever the world has filed the
   * finger's solids: its feet within a step of the skin there, as the body
   * stands on a surface. One whose feet are lower is under it, or in it.
   */
  #standsOn(body: FlyBody) {
    if (!this.present || !body.onFeet) return false;
    const p = body.position;
    const skin = fingerHeight(this.#along(p.x, p.z), this.#lateral(p.x, p.z));
    return skin >= 0 && Math.abs(p.y - (this.tip.y + skin)) < STEP_UP;
  }

  /** Sets its solids where it is now: the tip, the length of it back to the knuckle, and the finger rising from there toward the hand. */
  #place() {
    const [tipSolid, shaft, low, high] = this.solids;
    const t = this.tip;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    const fp = tipSolid.footprint as { x: number; z: number };
    fp.x = t.x;
    fp.z = t.z;
    (tipSolid.top as { base: number }).base = t.y;
    tipSolid.bottom = t.y;
    const sf = shaft.footprint as { x: number; z: number; angle: number };
    sf.x = t.x + s * (FINGER_LENGTH / 2);
    sf.z = t.z + c * (FINGER_LENGTH / 2);
    sf.angle = this.yaw;
    (shaft.top as { base: number }).base = t.y;
    shaft.bottom = t.y;
    const lean = Math.tan(RISE_LEAN);
    const lowBack = RISE_LOW;
    const highBack = RISE_AT + lean * (RISE_SPLIT + RISE_TOP) * 0.5;
    const lf = low.footprint as { x: number; z: number };
    lf.x = t.x + s * lowBack;
    lf.z = t.z + c * lowBack;
    (low.top as { y: number }).y = t.y + RISE_SPLIT;
    low.bottom = t.y;
    const hf = high.footprint as { x: number; z: number };
    hf.x = t.x + s * highBack;
    hf.z = t.z + c * highBack;
    (high.top as { y: number }).y = t.y + RISE_TOP;
    high.bottom = t.y + RISE_SPLIT;
  }

  /** In hand last frame. */
  get inHand() {
    return this.#inHand;
  }
}

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
