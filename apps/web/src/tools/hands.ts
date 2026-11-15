// The player's hands in the fly's world: a pointer on the table and a shelf
// of tools to use there. This is the logic only (where things are, what they
// do to the fly's world); tools/view.ts draws it. Everything a tool does
// reaches the fly through its senses: food it can taste, a ball it can see
// coming, a feather it can feel, air it can feel moving.

import type { Looming } from "@fly/body";
import { FLY_LENGTH, MOUTH_AHEAD } from "@fly/body";
import type { FoodKind, Pantry, Vec3, World } from "@fly/world";
import type { View } from "../camera.ts";
import type { TimeOfDay } from "../scene/light.ts";

export type ToolId = "feed" | "swoop" | "feather" | "blow" | "light" | "view";

export type Variant = { id: string; label: string };
export type Tool = { id: ToolId; name: string; verb: string; hold: boolean; variants: readonly Variant[] };

export const TOOLS: readonly Tool[] = [
  { id: "feed", name: "Feed", verb: "Drop", hold: false, variants: [{ id: "sugar", label: "Sugar" }, { id: "honey", label: "Honey" }, { id: "berry", label: "Raspberry" }, { id: "water", label: "Water" }] },
  { id: "swoop", name: "Swoop", verb: "Throw the ball", hold: false, variants: [{ id: "ball", label: "Beach ball" }] },
  { id: "feather", name: "Tickle", verb: "Tickle", hold: true, variants: [{ id: "feather", label: "Feather" }] },
  { id: "blow", name: "Blow", verb: "Blow", hold: true, variants: [{ id: "gentle", label: "Gently" }, { id: "strong", label: "Hard" }] },
  { id: "light", name: "Light", verb: "", hold: false, variants: [{ id: "morning", label: "Morning" }, { id: "noon", label: "Midday" }, { id: "golden", label: "Golden hour" }, { id: "dusk", label: "Dusk" }, { id: "night", label: "Night" }] },
  { id: "view", name: "View", verb: "", hold: false, variants: [{ id: "follow", label: "Follow" }, { id: "close", label: "Close up" }, { id: "table", label: "Whole table" }, { id: "above", label: "From above" }, { id: "eyes", label: "Fly's eyes" }] },
];

/** The beach ball: how big (mm), how fast it swoops (mm/s), and how long a swoop lasts (s). */
export const BALL_RADIUS = 22;
export const SWOOP_SECONDS = 1.6;
/** It passes this far (mm) above the pointer. */
export const SWOOP_CLEARANCE = 16;
/** The feather touches the fly within this distance of its middle (mm). Resting there is a light touch, stroking a full one. */
export const FEATHER_REACH = 3.2;
export const FEATHER_REST = 0.4;
/** Air speed of a puff at the pointer (mm/s), and how far round it the puff is felt (mm). */
export const PUFF_SPEED = { gentle: 450, strong: 1300 } as const;
export const PUFF_RADIUS = 30;
/** Food falls from this high (mm) and takes this long to land (s). */
export const DROP_HEIGHT = 30;
/** Seconds after the last touch before the pointer drifts back to the fly. */
export const POINTER_RETURN = 15;

export type Ball = {
  active: boolean;
  /** 0 to 1 along its path. */
  t: number;
  position: Vec3;
  from: Vec3;
  via: Vec3;
  to: Vec3;
  spin: number;
};

export type Falling = { kind: FoodKind; x: number; z: number; y: number; floor: number; vy: number };

export type HandsEvents = { dropped: FoodKind | null; landed: FoodKind | null; swooped: boolean; toolChanged: boolean; variantChanged: boolean; blocked: boolean };

/** What the hands do this frame, from the remote. */
export type HandsInput = {
  /** Select went down this frame, and whether it is held. */
  use: boolean;
  holding: boolean;
  /** Where the camera is, for the direction a puff blows. */
  eye: Vec3;
};

const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export class Hands {
  tool = 0;
  readonly variants: number[] = TOOLS.map(() => 0);
  /** The pointer's place in the world and the way the surface there faces. */
  readonly pointer = v3();
  readonly normal = v3(0, 1, 0);
  /** Following the fly (just in front of its head) until the player moves the pointer. */
  following = true;
  readonly ball: Ball = { active: false, t: 0, position: v3(0, -1e4, 0), from: v3(), via: v3(), to: v3(), spin: 0 };
  readonly falling: Falling[] = [];
  /** What the fly feels from the hands: a stroke (0 to 1) and the air's velocity at it. */
  stroke = 0;
  readonly air = v3();
  /** A puff is blowing now, from `puffFrom` toward the pointer. */
  blowing = false;
  readonly puffDirection = v3(1, 0, 0);
  /** The feather is stroking now. */
  stroking = false;
  readonly looming: Looming[] = [{ id: 1, position: this.ball.position, r: BALL_RADIUS }];
  readonly events: HandsEvents = { dropped: null, landed: null, swooped: false, toolChanged: false, variantChanged: false, blocked: false };
  #idle = 0;
  #world: World;

  constructor(world: World, saved?: { tool?: number; variants?: number[] }) {
    this.#world = world;
    if (saved?.tool !== undefined && saved.tool >= 0 && saved.tool < TOOLS.length) this.tool = saved.tool;
    saved?.variants?.forEach((v, i) => {
      if (i < TOOLS.length && v >= 0 && v < TOOLS[i].variants.length) this.variants[i] = v;
    });
  }

  get current(): Tool {
    return TOOLS[this.tool];
  }

  get variant(): Variant {
    return this.current.variants[this.variants[this.tool]];
  }

  /** Steps through the tools (left and right). */
  stepTool(dir: -1 | 1) {
    this.tool = (this.tool + dir + TOOLS.length) % TOOLS.length;
    this.events.toolChanged = true;
  }

  /** Steps through the current tool's kinds (up and down); false when it has only one or is at the end. */
  stepVariant(dir: -1 | 1): boolean {
    const n = this.current.variants.length;
    const next = this.variants[this.tool] + dir;
    if (n <= 1 || next < 0 || next >= n) {
      this.events.blocked = true;
      return false;
    }
    this.variants[this.tool] = next;
    this.events.variantChanged = true;
    return true;
  }

  /** The time of day chosen on the Light tool. */
  get timeOfDay(): TimeOfDay {
    return TOOLS[4].variants[this.variants[4]].id as TimeOfDay;
  }

  /** The view chosen on the View tool ("eyes" is the fly's-eye picture). */
  get view(): View | "eyes" {
    return TOOLS[5].variants[this.variants[5]].id as View | "eyes";
  }

  /** The player moved the pointer to a new place in the world. */
  movePointer(point: Vec3, normal: Vec3) {
    this.following = false;
    this.#idle = 0;
    copy(this.pointer, point);
    copy(this.normal, normal);
  }

  /** Back to following the fly. */
  release() {
    this.following = true;
  }

  update(dt: number, input: HandsInput, fly: { position: Vec3; yaw: number; onFeet: boolean }, pantry: Pantry) {
    const ev = this.events;
    ev.dropped = null;
    ev.landed = null;
    ev.swooped = false;
    const world = this.#world;
    this.#idle += dt;
    if (!this.following && this.#idle > POINTER_RETURN) this.following = true;
    if (this.following) {
      // Just in front of its mouth, on whatever is there.
      const reach = (MOUTH_AHEAD + 0.55) * FLY_LENGTH;
      const x = fly.position.x + Math.sin(fly.yaw) * reach;
      const z = fly.position.z + Math.cos(fly.yaw) * reach;
      const k = Math.min(1, dt * 4);
      this.pointer.x += (x - this.pointer.x) * k;
      this.pointer.z += (z - this.pointer.z) * k;
      const s = world.surface(this.pointer.x, this.pointer.z, surface);
      this.pointer.y = s.y;
      copy(this.normal, s.normal);
    }

    const tool = this.current.id;
    if (input.use) {
      if (tool === "feed") this.#drop(this.variant.id as FoodKind);
      else if (tool === "swoop") this.#swoop(input.eye);
    }

    // Falling food lands and becomes food.
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.vy -= 2400 * dt;
      f.y += f.vy * dt;
      if (f.y <= f.floor) {
        this.falling.splice(i, 1);
        pantry.drop(f.kind, f.x, f.z);
        ev.landed = f.kind;
      }
    }

    // The ball along its arc.
    const ball = this.ball;
    if (ball.active) {
      ball.t += dt / SWOOP_SECONDS;
      ball.spin += dt * 8;
      if (ball.t >= 1) {
        ball.active = false;
        ball.position.y = -1e4;
      } else {
        const t = ball.t;
        const a = (1 - t) * (1 - t);
        const b = 2 * (1 - t) * t;
        const c = t * t;
        ball.position.x = a * ball.from.x + b * ball.via.x + c * ball.to.x;
        ball.position.y = a * ball.from.y + b * ball.via.y + c * ball.to.y;
        ball.position.z = a * ball.from.z + b * ball.via.z + c * ball.to.z;
      }
    }

    // The feather: resting on the fly, or stroking it while Select is held.
    this.stroking = false;
    this.stroke = 0;
    if (tool === "feather" && fly.onFeet) {
      const d = Math.hypot(this.pointer.x - fly.position.x, this.pointer.y - fly.position.y, this.pointer.z - fly.position.z);
      if (d < FEATHER_REACH) {
        this.stroking = input.holding;
        this.stroke = input.holding ? 1 : FEATHER_REST;
      }
    }

    // A puff of air: from where the player sits, through the pointer.
    this.blowing = tool === "blow" && input.holding;
    this.air.x = 0;
    this.air.y = 0;
    this.air.z = 0;
    if (this.blowing) {
      const dx = this.pointer.x - input.eye.x;
      const dz = this.pointer.z - input.eye.z;
      const d = Math.hypot(dx, dz) || 1;
      this.puffDirection.x = dx / d;
      this.puffDirection.y = -0.15;
      this.puffDirection.z = dz / d;
      const speed = PUFF_SPEED[this.variant.id as keyof typeof PUFF_SPEED] ?? PUFF_SPEED.gentle;
      const away = Math.hypot(fly.position.x - this.pointer.x, (fly.position.y - this.pointer.y) * 1.5, fly.position.z - this.pointer.z);
      const felt = Math.max(0, 1 - away / PUFF_RADIUS);
      this.air.x = this.puffDirection.x * speed * felt;
      this.air.y = this.puffDirection.y * speed * felt;
      this.air.z = this.puffDirection.z * speed * felt;
    }
  }

  /** Clears the per-frame events the screen has read. */
  clearEvents() {
    this.events.toolChanged = false;
    this.events.variantChanged = false;
    this.events.blocked = false;
  }

  #drop(kind: FoodKind) {
    const floor = this.#world.heightAt(this.pointer.x, this.pointer.z);
    this.falling.push({ kind, x: this.pointer.x, z: this.pointer.z, y: floor + DROP_HEIGHT, floor, vy: 0 });
    this.events.dropped = kind;
  }

  #swoop(eye: Vec3) {
    const ball = this.ball;
    if (ball.active) {
      this.events.blocked = true;
      return;
    }
    // In from high up beside the camera, down past the pointer, and away on the far side.
    const p = this.pointer;
    const dx = p.x - eye.x;
    const dz = p.z - eye.z;
    const d = Math.hypot(dx, dz) || 1;
    const ux = dx / d;
    const uz = dz / d;
    // A little from one side, so it is seen coming.
    const sx = -uz;
    const sz = ux;
    ball.from.x = p.x - ux * 420 + sx * 160;
    ball.from.y = p.y + 260;
    ball.from.z = p.z - uz * 420 + sz * 160;
    ball.to.x = p.x + ux * 420 - sx * 120;
    ball.to.y = p.y + 300;
    ball.to.z = p.z + uz * 420 - sz * 120;
    // The control point that puts the middle of the curve just over the pointer.
    const mid = { x: p.x, y: p.y + BALL_RADIUS + SWOOP_CLEARANCE, z: p.z };
    ball.via.x = 2 * mid.x - (ball.from.x + ball.to.x) / 2;
    ball.via.y = 2 * mid.y - (ball.from.y + ball.to.y) / 2;
    ball.via.z = 2 * mid.z - (ball.from.z + ball.to.z) / 2;
    ball.t = 0;
    ball.active = true;
    copy(ball.position, ball.from);
    this.events.swooped = true;
  }
}

const surface = { y: 0, normal: { x: 0, y: 1, z: 0 }, solid: -1, onTable: true };

function copy(to: Vec3, from: Vec3) {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
}
