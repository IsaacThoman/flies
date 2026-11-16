// The restaurant as drawn, beyond what the world says: the shop front's door
// leaf and the lights above its transom, the wainscot, the kitchen past the
// pass, where each lamp's light comes from. All of it is either flush with
// what the world has (a wall's face, the glass's plane), behind it, or out of
// the fly's reach (above its ceiling, more than 300 mm past the back wall).

import { DINING_ROOM, PASS, PENDANTS, RESTAURANT, SHOPFRONT, WALL_THINGS, ZINC_BAR } from "@fly/world";
import { DOOR_RAIL } from "./street/layout.ts";

const { hx, hz, height } = DINING_ROOM;

/** The shop front: where its glass is, how far its big panes run, and the door. */
export const FRONT = {
  z: SHOPFRONT.glass,
  /** The glazed run, from the left wall to the door's left post. */
  x0: -hx,
  x1: SHOPFRONT.door.x0 - SHOPFRONT.mullion.half,
  sill: SHOPFRONT.ledge.top,
  transom: { y0: SHOPFRONT.transom.y - SHOPFRONT.transom.half, y1: SHOPFRONT.transom.y + SHOPFRONT.transom.half },
  head: SHOPFRONT.head,
  /** The posts and mullions between the panes, their half-width. */
  bars: [...SHOPFRONT.mullions, SHOPFRONT.door.x0, SHOPFRONT.door.x1] as readonly number[],
  bar: SHOPFRONT.mullion.half,
  /** The small panes above the transom: glazing bars this far apart, behind the glass. */
  pane: 375,
  /** The door between its posts: a glazed leaf just beyond the glass's plane, stiles and rails round its glass. */
  door: { x0: SHOPFRONT.door.x0 + SHOPFRONT.mullion.half, x1: SHOPFRONT.door.x1 - SHOPFRONT.mullion.half, stile: 70, bottom: DOOR_RAIL, top: 2200, z0: SHOPFRONT.glass + 4, z1: SHOPFRONT.glass + 50 },
};

/** The wainscot round the walls: its rail's height, and the skirting's. */
export const WAINSCOT = { rail: 1000, skirt: 160 };

/** The kitchen past the pass, dim, out of the fly's reach: its floor, its far wall, the line along it. */
export const KITCHEN = { z0: -DINING_ROOM.hz - DINING_ROOM.wall, z1: -6200, x0: PASS.x0 - 1600, x1: PASS.door.x1 + 600, floor: 0, ceiling: 2800, line: { z: -5600, top: 900, depth: 700 } };

/** Where the lit pendant's light leaves it: the diffuser closing the shade underneath, and its radius. */
export const PENDANT_LIGHT = { x: PENDANTS.x, y: PENDANTS.bottom + 4, z: PENDANTS.zs[PENDANTS.lit], r: PENDANTS.r - 25 };

/** The drinks fridge's glass doors in the back bar's face: the glowing rectangle (x is the face). */
export const FRIDGE = { x: ZINC_BAR.back.x1, z0: ZINC_BAR.fridge.z0 + 30, z1: ZINC_BAR.fridge.z1 - 30, y0: 120, y1: ZINC_BAR.back.top - 90 };

/** The exit sign's lit face, toward the room. */
export const EXIT = { x0: WALL_THINGS.exit.x - WALL_THINGS.exit.hx + 14, x1: WALL_THINGS.exit.x + WALL_THINGS.exit.hx - 14, y0: WALL_THINGS.exit.bottom + 16, y1: WALL_THINGS.exit.top - 16, z: WALL_THINGS.exit.z - WALL_THINGS.exit.hz };

/** The heat lamps under the pass's head: their glowing undersides. */
export const HEAT = { x0: PASS.shelf.x - PASS.lamps.hx + 20, x1: PASS.shelf.x + PASS.lamps.hx - 20, z0: PASS.lamps.z0 + 15, z1: PASS.lamps.z1 - 15, y: PASS.lamps.bottom };

/** Above this the fly never flies (the place's ceiling): what hangs higher (fans, the cornice) is out of its reach. */
export const OUT_OF_REACH = RESTAURANT.ceiling;

/** The ceiling fans, still for the night, hanging below the tin. */
export const FANS = [
  { x: -700, z: 1400 },
  { x: 1400, z: -400 },
].map((f) => ({ ...f, y: height - 520, r: 640 }));

/**
 * The clock over the bar, high on the left wall above the mirror's cornice
 * and out of the fly's reach: its dial (scene/clock.ts) facing the room, the
 * case's depth and the bezel's width.
 */
export const CLOCK = {
  dial: { centre: { x: -DINING_ROOM.hx + 62, y: 2770, z: -550 }, up: { x: 0, y: 1, z: 0 }, right: { x: 0, y: 0, z: -1 }, radius: 196 },
  depth: 62,
  bezel: 22,
};

/** The room's corners, for whatever needs the room's size. */
export const ROOM = { x0: -hx, x1: hx, z0: -hz, z1: hz, height };
