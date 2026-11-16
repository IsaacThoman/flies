// Another player's hand at the table: their pointer, its ring in their
// colour, and what their tools do in the world. It is the same Hands as this
// player's own (tools/hands.ts), driven from what their device sends rather
// than from a remote, so their ball, their feather and their puffs reach this
// fly exactly as this player's own would: the ball through its eyes, the
// feather and the air through its body. Their food falls here as it falls
// there, and lands in the table's pantry under the name they gave it.

import type * as THREE from "three";
import { HANDS, HOLDING, ballProgress } from "@fly/net";
import type { BallWire, FlyState } from "@fly/net";
import { Pantry, SWOOP_SECONDS, createSurface } from "@fly/world";
import type { FoodKind, Vec3, World } from "@fly/world";
import { DROP_HEIGHT, FALL, Hands, TOOLS, WORLD_TOOLS } from "../tools/hands.ts";
import { HandsView } from "../tools/view.ts";
import type { TablePantry } from "./table-pantry.ts";

export class OtherHand {
  readonly player: number;
  readonly hands: Hands;
  readonly view: HandsView;
  /** Their hand is out on the table. */
  out = false;
  #ball: BallWire | null = null;
  #holding = false;
  readonly #eye: Vec3 = { x: 0, y: 0, z: 0 };
  readonly #normal = { x: 0, y: 1, z: 0 };
  readonly #surface = createSurface();
  readonly #world: World;
  readonly #input = { use: false, holding: false, eye: this.#eye };
  /** Their food in the air: what it will be called when it lands. */
  readonly #falling: { id: number; kind: FoodKind }[] = [];
  /** Hands drops landed food into a pantry; theirs lands in the table's, under their name. */
  readonly #landing: Pantry;
  /** Theirs draws only what is in their hand: the table's food is drawn once, by this player's own view. */
  readonly #nothing: Pantry;

  constructor(parent: THREE.Object3D, world: World, player: number, colour: string, table: TablePantry) {
    this.player = player;
    this.#world = world;
    this.hands = new Hands(world);
    this.hands.tool = WORLD_TOOLS;
    // Their ball is a different thing coming from this player's, to a brain without eyes.
    this.hands.looming[0].id = 100 + player;
    this.view = new HandsView(parent);
    this.view.tint(colour);
    this.view.icon = false;
    this.view.opacity = 0;
    this.#nothing = new Pantry(world);
    const falling = this.#falling;
    this.#landing = new (class extends Pantry {
      drop(kind: FoodKind, x: number, z: number) {
        const i = falling.findIndex((f) => f.kind === kind);
        if (i >= 0) table.landed(falling.splice(i, 1)[0].id, kind, x, z);
        return table.foods[table.foods.length - 1];
      }
    })(world);
  }

  /** Their ball in the air, if one is. */
  get ball(): BallWire | null {
    return this.#ball;
  }

  /** What their device last said of their hand. */
  heard(state: FlyState) {
    const h = state.hand;
    this.out = !!(state.flags & HANDS);
    this.#holding = !!(state.flags & HOLDING);
    // A hand put away does nothing: the shelf's first tool about the world, which acts on no fly.
    if (!this.out) {
      this.hands.tool = WORLD_TOOLS;
      return;
    }
    this.hands.tool = Math.min(TOOLS.length - 1, h.tool);
    this.hands.variants[this.hands.tool] = Math.min(this.hands.current.variants.length - 1, h.variant);
    this.#eye.x = h.eyeX;
    this.#eye.y = h.eyeY;
    this.#eye.z = h.eyeZ;
    this.#world.surface(h.x, h.z, this.#surface);
    this.#normal.x = this.#surface.normal.x;
    this.#normal.y = this.#surface.normal.y;
    this.#normal.z = this.#surface.normal.z;
    this.hands.movePointer(h, this.#normal);
  }

  /** They threw a ball. */
  throw(ball: BallWire) {
    this.#ball = ball;
    const b = this.hands.ball;
    [b.from.x, b.from.y, b.from.z] = ball.from;
    [b.via.x, b.via.y, b.via.z] = ball.via;
    [b.to.x, b.to.y, b.to.z] = ball.to;
    b.active = true;
  }

  /** They dropped food: it falls from where it was dropped, as long ago as it was (s). */
  drop(id: number, kind: FoodKind, x: number, z: number, age: number) {
    const floor = this.#world.heightAt(x, z);
    const t = Math.max(0, age);
    this.#falling.push({ id, kind });
    this.hands.falling.push({ kind, x, z, y: Math.max(floor, floor + DROP_HEIGHT - 0.5 * FALL * t * t), floor, vy: -FALL * t });
  }

  /** The table moved: nothing of theirs is in the air any more. */
  clear() {
    this.#ball = null;
    this.#falling.length = 0;
    this.hands.clear();
  }

  /**
   * Moves it on to room time `now` (ms). `fly` is this player's fly, which
   * their feather and their puffs reach as this player's own would.
   */
  update(dt: number, now: number, fly: { position: Vec3; yaw: number; onFeet: boolean }, camera: THREE.Camera, time: number, floorAt: (x: number, z: number) => number) {
    const ball = this.hands.ball;
    // The ball where the room's clock has it, the same on every device.
    if (this.#ball) {
      const k = ballProgress(this.#ball, now);
      if (k >= 1) this.#ball = null;
      ball.t = k - dt / SWOOP_SECONDS;
    }
    // Their pointer is wherever they put it, never drifting back to this player's fly.
    this.hands.following = false;
    this.#input.holding = this.out && this.#holding;
    this.hands.update(dt, this.#input, fly, this.#landing);
    this.view.opacity += ((this.out ? 1 : 0) - this.view.opacity) * Math.min(1, dt * 5);
    this.view.update(this.hands, this.#nothing, camera, time, dt, floorAt, fly.position);
    // Read for this frame only, as the game clears this player's own.
    this.hands.clearEvents();
  }

  dispose() {
    this.view.group.removeFromParent();
  }
}
