// The player's hands in the fly's world: a pointer on the table and a shelf
// of tools to use there. This is the logic only (where things are, what they
// do to the fly's world); tools/view.ts draws it. Everything a tool does
// reaches the fly through its senses: food it can taste, a ball it can see
// coming, a feather it can feel, air it can feel moving.

import type { Looming } from "@fly/body";
import { FLY_LENGTH, MOUTH_AHEAD, STEP_UP } from "@fly/body";
import { BALL_RADIUS, SWOOP_SECONDS, createSurface, swoopAt } from "@fly/world";
import type { FoodKind, Pantry, Vec3, World } from "@fly/world";
import type { View } from "../camera.ts";
import { PLACES } from "../places/catalog.ts";
import type { PlaceId } from "../places/catalog.ts";
import type { TimeOfDay } from "../scene/light.ts";
import type { WeatherKind } from "../scene/weather.ts";

export type ToolId = "feed" | "swoop" | "feather" | "blow" | "light" | "weather" | "view" | "place";

export type Variant = { id: string; label: string };
export type Tool = { id: ToolId; name: string; verb: string; hold: boolean; variants: readonly Variant[]; /** The kind chosen at the start, if not the first. */ initial?: number };

export const TOOLS: readonly Tool[] = [
  { id: "feed", name: "Feed", verb: "Drop", hold: false, variants: [{ id: "sugar", label: "Sugar" }, { id: "honey", label: "Honey" }, { id: "berry", label: "Raspberry" }, { id: "water", label: "Water" }, { id: "clear", label: "Clear dropped" }] },
  { id: "swoop", name: "Swoop", verb: "Throw the ball", hold: false, variants: [{ id: "ball", label: "Beach ball" }] },
  { id: "feather", name: "Tickle", verb: "Tickle", hold: true, variants: [{ id: "feather", label: "Feather" }] },
  { id: "blow", name: "Blow", verb: "Blow", hold: true, variants: [{ id: "gentle", label: "Gently" }, { id: "strong", label: "Hard" }] },
  // "Now" follows the clock, so the wallpaper's light changes with the day outside.
  { id: "light", name: "Light", verb: "", hold: false, variants: [{ id: "clock", label: "Now" }, { id: "morning", label: "Morning" }, { id: "noon", label: "Midday" }, { id: "golden", label: "Golden hour" }, { id: "dusk", label: "Dusk" }, { id: "night", label: "Night" }] },
  // "Now" is the weather outside where the Apple TV can tell it ("Outside"), else wanders as a forecast worked out from the clock would; the others hold.
  { id: "weather", name: "Weather", verb: "", hold: false, variants: [{ id: "now", label: "Now" }, { id: "clear", label: "Clear" }, { id: "overcast", label: "Overcast" }, { id: "mist", label: "Mist" }, { id: "rain", label: "Rain" }, { id: "heavyRain", label: "Heavy rain" }, { id: "storm", label: "Thunderstorm" }, { id: "snow", label: "Snow" }, { id: "sleet", label: "Sleet" }] },
  // Nearest first, so Up brings the camera in and Down takes it out; then through its eyes, and inside it (close up, its body as glass).
  { id: "view", name: "View", verb: "", hold: false, initial: 1, variants: [{ id: "close", label: "Close up" }, { id: "follow", label: "Follow" }, { id: "wide", label: "Wide" }, { id: "table", label: "Whole table" }, { id: "above", label: "From above" }, { id: "eyes", label: "Fly's eyes" }, { id: "inside", label: "Inside it" }] },
  // Where it lives: Up and Down choose, Select carries it there. Only when there is somewhere else to go.
  ...(PLACES.length > 1 ? [{ id: "place", name: "Place", verb: "Go", hold: false, variants: PLACES.map((p) => ({ id: p.id, label: p.name })) } satisfies Tool] : []),
];

/** The tools before this one act on the fly; from it on, they are about its world and the camera. */
export const WORLD_TOOLS = TOOLS.findIndex((t) => t.id === "light");
/** Where the Place tool is on the shelf, or -1 without one. */
export const PLACE_TOOL = TOOLS.findIndex((t) => t.id === "place");
const LIGHT_TOOL = TOOLS.findIndex((t) => t.id === "light");
const WEATHER_TOOL = TOOLS.findIndex((t) => t.id === "weather");
const VIEW_TOOL = TOOLS.findIndex((t) => t.id === "view");

/** Where the ball comes from, radians round from straight ahead toward the fly's right. */
export const SWOOP_BEARING = 0.9;
/**
 * When the ball can't come in over what stands in its way, or get away past
 * it (a window, a wall), it comes from further round the fly's right instead,
 * as far as behind it, then from round its left: these turns (radians) from
 * SWOOP_BEARING, in order, until both are clear.
 */
export const SWOOP_TURNS = [0, 0.4, 0.8, 1.2, 1.6, 2, 2.4, 2.8, -0.4, -0.8, -1.2, -1.6, -2, -2.4];
/** The dive stops with the ball's surface this far (mm) from the spot. */
export const SWOOP_CLEARANCE = 2;
/** The feather touches the fly within this distance of its middle (mm). Resting there is a light touch, stroking a full one. */
export const FEATHER_REACH = 3.2;
export const FEATHER_REST = 0.4;
/** Air speed of a puff at the pointer (mm/s), and how far round it the puff is felt (mm). */
export const PUFF_SPEED = { gentle: 450, strong: 1300 } as const;
export const PUFF_RADIUS = 30;
/** Food falls from this high (mm), and falls this fast (mm/s²). */
export const DROP_HEIGHT = 30;
export const FALL = 2400;
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
  readonly variants: number[] = TOOLS.map((t) => t.initial ?? 0);
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
  /** Where the last food landed, and the way the surface there faces. */
  readonly landedAt = v3();
  readonly landedNormal = v3(0, 1, 0);
  /** What the fly stands on where it is now ("table", "sill"), for the name of the whole-place view. */
  surface = "table";
  /** The Weather tool's "Now" is the real weather outside: it is called "Outside". */
  outside = false;
  /** Tools whose kind can't be changed now: at a table with others, the light, the weather and the place are the starter's to choose. */
  fixed: ReadonlySet<ToolId> = new Set();
  #idle = 0;
  #world: World;

  /** `start`: a kind to start on for some tools, by id; any the shelf doesn't have are passed over. */
  constructor(world: World, start: { readonly [T in ToolId]?: { readonly kind: string } } = {}) {
    this.#world = world;
    TOOLS.forEach((tool, i) => {
      const kind = tool.variants.findIndex((v) => v.id === start[tool.id]?.kind);
      if (kind >= 0) this.variants[i] = kind;
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

  /** Picks a tool by its place on the shelf (a tap on it, a number key); false if it is already in hand or there is none. */
  chooseTool(index: number): boolean {
    if (index < 0 || index >= TOOLS.length || index === this.tool) return false;
    this.tool = index;
    this.events.toolChanged = true;
    return true;
  }

  /** Steps through the current tool's kinds (up and down, or round and round with `wrap`); false when it has only one or is at the end. */
  stepVariant(dir: -1 | 1, wrap = false): boolean {
    const n = this.current.variants.length;
    if (this.fixed.has(this.current.id)) {
      this.events.blocked = true;
      return false;
    }
    let next = this.variants[this.tool] + dir;
    if (wrap && n > 1) next = (next + n) % n;
    if (n <= 1 || next < 0 || next >= n) {
      this.events.blocked = true;
      return false;
    }
    this.variants[this.tool] = next;
    this.events.variantChanged = true;
    return true;
  }

  /** The time of day chosen on the Light tool: one of the five, or the time outside by the clock. */
  get timeOfDay(): TimeOfDay | "clock" {
    return TOOLS[LIGHT_TOOL].variants[this.variants[LIGHT_TOOL]].id as TimeOfDay | "clock";
  }

  /** The weather chosen on the Weather tool: a kind, or the forecast's ("now"). */
  get weather(): WeatherKind | "now" {
    return TOOLS[WEATHER_TOOL].variants[this.variants[WEATHER_TOOL]].id as WeatherKind | "now";
  }

  /** The kind's name as shown: the whole-place view is named for what the fly stands on there, and "Now" for where the weather comes from. */
  get label(): string {
    const v = this.variant;
    if (this.current.id === "view" && v.id === "table") return `Whole ${this.surface}`;
    return this.current.id === "weather" && v.id === "now" && this.outside ? "Outside" : v.label;
  }

  /** The place chosen on the Place tool. */
  get place(): PlaceId {
    return (PLACE_TOOL < 0 ? PLACES[0].id : TOOLS[PLACE_TOOL].variants[this.variants[PLACE_TOOL]].id) as PlaceId;
  }

  /** Shows a place as chosen on the Place tool (where the fly is now). */
  choosePlace(id: PlaceId) {
    if (PLACE_TOOL >= 0) this.variants[PLACE_TOOL] = Math.max(0, PLACES.findIndex((p) => p.id === id));
  }

  /** The view chosen on the View tool ("eyes" is the fly's-eye picture; "inside", close up with its body as glass). */
  get view(): View | "eyes" | "inside" {
    return TOOLS[VIEW_TOOL].variants[this.variants[VIEW_TOOL]].id as View | "eyes" | "inside";
  }

  /** Chooses a view on the View tool (the camera brought in or taken out by hand). */
  chooseView(view: View | "eyes") {
    const i = TOOLS[VIEW_TOOL].variants.findIndex((v) => v.id === view);
    if (i >= 0) this.variants[VIEW_TOOL] = i;
  }

  /** The player moved the pointer to a new place in the world. */
  movePointer(point: Vec3, normal: Vec3) {
    this.following = false;
    this.#idle = 0;
    copy(this.pointer, point);
    copy(this.normal, normal);
  }

  /** The pointer kept under a cursor that hasn't moved while the camera has: not the player's doing, so it doesn't stop it drifting back. */
  slidePointer(point: Vec3, normal: Vec3) {
    if (this.following) return;
    copy(this.pointer, point);
    copy(this.normal, normal);
  }

  /** Back to following the fly. */
  release() {
    this.following = true;
  }

  /** Lets go of everything: the fly has been carried somewhere else, and what was falling or flying there is gone. */
  clear() {
    this.release();
    this.falling.length = 0;
    this.ball.active = false;
    this.ball.position.y = -1e4;
    this.stroke = 0;
    this.blowing = false;
    this.stroking = false;
  }

  update(dt: number, input: HandsInput, fly: { position: Vec3; yaw: number; onFeet: boolean }, pantry: Pantry) {
    const ev = this.events;
    const world = this.#world;
    this.#idle += dt;
    if (!this.following && this.#idle > POINTER_RETURN) this.following = true;
    if (this.following) {
      // Just in front of its mouth, on whatever is there at its feet (within a step) or below them.
      const reach = (MOUTH_AHEAD + 0.55) * FLY_LENGTH;
      const x = fly.position.x + Math.sin(fly.yaw) * reach;
      const z = fly.position.z + Math.cos(fly.yaw) * reach;
      const k = Math.min(1, dt * 4);
      this.pointer.x += (x - this.pointer.x) * k;
      this.pointer.z += (z - this.pointer.z) * k;
      const s = world.surface(this.pointer.x, this.pointer.z, surface, fly.position.y + STEP_UP);
      this.pointer.y = s.y;
      copy(this.normal, s.normal);
    }

    const tool = this.current.id;
    if (input.use) {
      if (tool === "feed") {
        if (this.variant.id === "clear") {
          if (pantry.clearDropped()) this.falling.length = 0;
        } else this.#drop(this.variant.id as FoodKind);
      }
      else if (tool === "swoop") this.#swoop(fly.yaw);
    }

    // Falling food lands and becomes food.
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.vy -= FALL * dt;
      f.y += f.vy * dt;
      if (f.y <= f.floor) {
        this.falling.splice(i, 1);
        pantry.drop(f.kind, f.x, f.z, f.floor);
        ev.landed = f.kind;
        const s = world.surface(f.x, f.z, surface, f.floor);
        this.landedAt.x = f.x;
        this.landedAt.y = s.y;
        this.landedAt.z = f.z;
        copy(this.landedNormal, s.normal);
      }
    }

    // The ball: diving at the spot, faster and faster, then veering away.
    const ball = this.ball;
    if (ball.active) {
      ball.t += dt / SWOOP_SECONDS;
      ball.spin += dt * 8;
      if (ball.t >= 1) {
        ball.active = false;
        ball.position.y = -1e4;
      } else swoopAt(ball.from, ball.via, ball.to, ball.t, ball.position);
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
    this.events.dropped = null;
    this.events.landed = null;
    this.events.swooped = false;
    this.events.toolChanged = false;
    this.events.variantChanged = false;
    this.events.blocked = false;
  }

  #drop(kind: FoodKind) {
    // Onto the surface the pointer is on (under a table, the floor there, not the table top), from under whatever is over it.
    const s = this.#world.surface(this.pointer.x, this.pointer.z, surface, this.pointer.y);
    const floor = s.y;
    this.falling.push({ kind, x: this.pointer.x, z: this.pointer.z, y: Math.max(floor, Math.min(floor + DROP_HEIGHT, s.underside - 1)), floor, vy: 0 });
    this.events.dropped = kind;
  }

  #swoop(yaw: number) {
    const ball = this.ball;
    if (ball.active) {
      this.events.blocked = true;
      return;
    }
    // In low from ahead of the fly and to its right, diving at the spot until just short
    // of it, then away up past it. Low, it is seen against the bright table and horizon
    // (a fly's eyes answer darkening); the fly's looming pathway is strongest on its right
    // (packages/brain/README.md, The eyes); and a fly sees little behind it.
    const clear = SWOOP_TURNS.some((turn) => {
      const a = yaw - SWOOP_BEARING - turn;
      return this.#dive(a) && this.#away(a);
    });
    // Nowhere clear all the way (the fly among fruit by a window): the first way whose far reaches are clear, grazing only what is right by the fly; failing that, the usual way.
    if (!clear) {
      const open = SWOOP_TURNS.some((turn) => {
        const a = yaw - SWOOP_BEARING - turn;
        this.#dive(a);
        this.#away(a);
        return this.#farClear(ball.from, ball.via) && this.#farClear(ball.to, ball.via);
      });
      if (!open) {
        this.#dive(yaw - SWOOP_BEARING);
        this.#away(yaw - SWOOP_BEARING);
      }
    }
    ball.t = 0;
    ball.active = true;
    copy(ball.position, ball.from);
    this.events.swooped = true;
  }

  /** Sets the ball's dive in along this heading (radians, as the fly's yaw), coming in higher over anything standing in its way, rather than through it. Whether it found a way in. */
  #dive(a: number): boolean {
    const ball = this.ball;
    const p = this.pointer;
    ball.from.x = p.x + Math.sin(a) * 330;
    ball.from.y = p.y + 70;
    ball.from.z = p.z + Math.cos(a) * 330;
    for (let tries = 0; ; tries++) {
      // Where the dive ends: its surface SWOOP_CLEARANCE short of the spot, along the way it came.
      const fx = ball.from.x - p.x;
      const fy = ball.from.y - (p.y + 2);
      const fz = ball.from.z - p.z;
      const fl = Math.hypot(fx, fy, fz);
      const stop = BALL_RADIUS + SWOOP_CLEARANCE;
      ball.via.x = p.x + (fx / fl) * stop;
      ball.via.y = p.y + 2 + (fy / fl) * stop;
      ball.via.z = p.z + (fz / fl) * stop;
      if (!this.#through(ball.from, ball.via)) return true;
      if (tries === 8) return false;
      ball.from.y += 40;
    }
  }

  /** Sets the ball's getaway from the end of a dive that came in along this heading: away up and over to the side it came from; or the other side, or back the way it came, if that is clear. Whether one was. */
  #away(a: number): boolean {
    const ball = this.ball;
    const p = this.pointer;
    const ux = Math.sin(a);
    const uz = Math.cos(a);
    for (const side of [1, -1, 0]) {
      ball.to.x = p.x + ux * 200 + uz * 160 * side;
      ball.to.y = p.y + 400;
      ball.to.z = p.z + uz * 200 - ux * 160 * side;
      if (!this.#through(ball.via, ball.to)) return true;
    }
    return false;
  }

  /** Whether the ball's path between `far` and the end of its dive is clear but for its last fifth, by the fly. */
  #farClear(far: Vec3, near: Vec3): boolean {
    lerp(partway, far, near, 0.8);
    return !this.#through(far, partway);
  }

  /** Whether the ball, going straight from `a` to `b`, would pass through anything at the height of its middle, there or most of its radius round it. */
  #through(a: Vec3, b: Vec3) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 8);
    const r = BALL_RADIUS * 0.8;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const x = a.x + (b.x - a.x) * k;
      const y = a.y + (b.y - a.y) * k;
      const z = a.z + (b.z - a.z) * k;
      for (let j = 0; j < RING.length; j += 2) if (this.#world.solidAt(x + RING[j] * r, y, z + RING[j + 1] * r) >= 0) return true;
    }
    return false;
  }
}

const surface = createSurface();
const partway = v3();
/** The ball's middle and eight points round it, as x, z pairs of unit length or less. */
const RING = [0, 0, ...Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)]).flat()];

function lerp(out: Vec3, a: Vec3, b: Vec3, k: number) {
  out.x = a.x + (b.x - a.x) * k;
  out.y = a.y + (b.y - a.y) * k;
  out.z = a.z + (b.z - a.z) * k;
}

function copy(to: Vec3, from: Vec3) {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
}
