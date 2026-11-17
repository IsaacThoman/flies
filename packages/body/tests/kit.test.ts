// The building kit's pieces as the fly's body meets them: a wall stops it, a
// ramp takes it up to a wall's top, it steps onto a tile and walks into a
// dish's well, and it can't walk through a twig.

import assert from "node:assert/strict";
import { test } from "node:test";
import { World, withPieces } from "@fly/world";
import type { Piece, PieceKind, Place } from "@fly/world";
import { FlyBody, createIntent } from "../src/index.ts";
import type { Forces, Intent } from "../src/index.ts";

const bare: Place = { floor: { kind: "circle", r: 200 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 320 };
const DT = 1 / 60;
const still: Forces = { air: { x: 0, y: 0, z: 0 }, threat: null, meal: null };
const walk: Intent = { ...createIntent(), live: true, speed: 8, walking: true };
const piece = (kind: PieceKind, x: number, z: number, turns = 0): Piece => ({ kind, x, z, turns, y: 0 });

/** A fly walking straight ahead (+z) from z = -20 into what is built, for so long. */
function walkInto(pieces: Piece[], seconds: number, x = 0) {
  const body = new FlyBody(new World(withPieces(bare, pieces)), { x, z: -20, yaw: 0 });
  let highest = 0;
  for (let t = 0; t < seconds; t += DT) {
    body.step(walk, still, DT);
    highest = Math.max(highest, body.position.y);
  }
  return { body, highest };
}

test("a wall stops a walking fly at its face", () => {
  // Along x, across the way: its near face at z = -0.75.
  const { body } = walkInto([piece("wall", 0, 0)], 4);
  assert.ok(body.onFeet);
  assert.equal(body.position.y, 0);
  assert.ok(body.position.z < -0.75, `never through it: ${body.position.z}`);
  assert.ok(body.blocked || Math.abs(Math.sin(body.yaw)) > 0.2, "held at it, or turned along it");
});

test("a ramp takes it up to a wall's height", () => {
  // Turned so that it rises the way the fly walks (+z): its low end at z = -9.
  const { body, highest } = walkInto([piece("ramp", 0, 0, 6)], 3.4);
  assert.ok(highest > 2.4, `up the ramp: ${highest}`);
  assert.ok(body.onFeet);
});

test("it steps onto a tile, and down off it", () => {
  const { body, highest } = walkInto([piece("tile-blue", 0, 0)], 6);
  assert.ok(Math.abs(highest - 0.5) < 1e-6, `stood on the tile: ${highest}`);
  assert.ok(body.position.z > 8, "over it");
  assert.equal(body.position.y, 0);
});

test("it walks up a dish's side and into its well", () => {
  const body = new FlyBody(new World(withPieces(bare, [piece("dish-blue", 0, 0)])), { x: 0, z: -20, yaw: 0 });
  for (let t = 0; t < 2.6; t += DT) body.step(walk, still, DT);
  assert.ok(Math.abs(body.position.z) < 6.6, `in the well: ${body.position.z}`);
  assert.ok(Math.abs(body.position.y - 0.45) < 1e-6, `at the well's floor: ${body.position.y}`);
});

test("a twig is a rail it can't walk through", () => {
  const { body } = walkInto([piece("twig", 0, 0)], 4);
  assert.ok(body.position.z < -1, `${body.position.z}`);
});
