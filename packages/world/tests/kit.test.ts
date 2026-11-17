import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_PIECES, PICNIC, PIECE_KINDS, RESTAURANT, World, covers, createSurface, fits, keepPieces, keptPieces, pieceAt, pieceSolid, restingHeight, topHeight, topNormal, withPieces } from "../src/index.ts";
import type { Piece, PieceKind, Place } from "../src/index.ts";

const bare: Place = { floor: { kind: "circle", r: 200 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 320 };
const base = new World(bare);
const piece = (kind: PieceKind, x: number, z: number, turns = 0, y = 0): Piece => ({ kind, x, z, turns, y });

test("every piece fits on a bare table, and each is a solid the world can stand on", () => {
  for (const kind of PIECE_KINDS) {
    const p = piece(kind, 40, 40);
    assert.ok(fits(base, [], p), kind);
    const world = new World(withPieces(bare, [p]));
    const s = world.surface(40, 40, createSurface());
    assert.equal(s.solid, 0, kind);
    assert.ok(s.y > 0.3 && s.y <= 3.01, `${kind} at ${s.y}`);
  }
});

test("pieces don't go into one another, but walls may meet end to end", () => {
  const tile = piece("tile-blue", 0, 50);
  assert.equal(fits(base, [tile], piece("tile-red", 5, 50)), false);
  assert.equal(fits(base, [tile], piece("tile-red", 14, 50)), true, "side by side");
  const wall = piece("wall", 0, 80);
  // A wall at right angles, its middle line at the first one's end: a corner.
  assert.equal(fits(base, [wall], piece("wall", 10, 90, 2)), true);
  assert.equal(fits(base, [wall], piece("wall", 0, 80, 2)), false, "crossing");
});

test("a piece doesn't go into the place's own things, off its edge, or onto a slope", () => {
  const world = new World(PICNIC);
  const jam = PICNIC.solids.find((s) => s.name === "jam")!.footprint as { x: number; z: number; r: number };
  assert.equal(fits(world, [], piece("tile-blue", jam.x + jam.r, jam.z)), false);
  assert.equal(fits(world, [], piece("tile-blue", 315, 0)), false, "over the edge");
  const apple = PICNIC.solids.find((s) => s.name === "apple")!.footprint as { x: number; z: number; r: number };
  assert.equal(restingHeight(world, apple.x + 10, apple.z, 200), null, "the apple's side is no floor");
});

test("on a slab a piece rests on it, a slab itself", () => {
  const world = new World(RESTAURANT);
  const start = RESTAURANT.start;
  const y = restingHeight(world, start.x + 30, start.z, start.y ?? Infinity);
  assert.ok(y !== null && y > 500, `on the table top: ${y}`);
  const p = piece("dish-blue", start.x + 30, start.z, 0, y);
  assert.ok(fits(world, [], p));
  assert.equal(pieceSolid(p).bottom, y);
  const built = new World(withPieces(RESTAURANT, [p]));
  const s = built.surface(p.x, p.z, createSurface(), y + 5);
  assert.equal(s.solid, RESTAURANT.solids.length);
  assert.ok(Math.abs(s.y - (y + 0.45)) < 1e-9, "in its well");
  // Under the table there is still the floor, with the air over it.
  assert.equal(built.heightAt(p.x, p.z, 10), 0);
});

test("a ramp's top rises straight along it, level across, and faces up its slope", () => {
  const p = piece("ramp", 0, 0, 2);
  const solid = pieceSolid(p);
  // Turned a quarter, its length runs along z: from its low end at +z to its high end at -z.
  const low = topHeight(solid, 0, 8.9);
  const high = topHeight(solid, 0, -8.9);
  assert.ok(low < 0.5 && high > 2.9, `${low} to ${high}`);
  assert.ok(Math.abs(topHeight(solid, 3, 0) - topHeight(solid, -3, 0)) < 1e-9, "level across");
  const n = topNormal(solid, 0, 0, { x: 0, y: 0, z: 0 });
  assert.ok(n.z > 0.1 && Math.abs(n.x) < 1e-9 && n.y > 0.95, JSON.stringify(n));
  // A ray from above lands on it at its height there.
  const world = new World(withPieces(bare, [p]));
  const hit = world.raycast({ x: 0, y: 50, z: 4 }, { x: 0, y: -1, z: 0 }, { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, solid: -2, t: 0 });
  assert.ok(hit && Math.abs(hit.point.y - topHeight(solid, 0, 4)) < 1e-4);
});

test("a piece keeps clear of the flies, of where the fly is set down, and of food it would cover; food in a dish is no bar to it", () => {
  const p = piece("tile-yellow", 30, 0);
  assert.equal(covers(p, [{ x: 30, y: 0, z: 8.5 }], bare.start, []), true, "a fly at its edge");
  assert.equal(covers(p, [{ x: 30, y: 0, z: 20 }], bare.start, []), false);
  assert.equal(covers(p, [{ x: 30, y: 40, z: 0 }], bare.start, []), false, "a fly flying high over");
  assert.equal(covers(piece("tile-yellow", 5, 0), [], bare.start, []), true, "where it starts");
  assert.equal(covers(p, [], bare.start, [{ x: 31, y: 0, z: 1, r: 1.5 }]), true, "food under it");
  const dish = piece("dish-blue", 30, 0);
  assert.equal(covers(dish, [], bare.start, [{ x: 31, y: 0.45, z: 1, r: 1.5 }]), false, "food in its well");
});

test("the piece under the hand, on it or just beside it", () => {
  const pieces = [piece("wall", 0, 50), piece("dish-blue", 40, 50)];
  assert.equal(pieceAt(pieces, 3, 3, 50, 1.5), 0, "on the wall's top");
  assert.equal(pieceAt(pieces, 3, 0, 51.5, 1.5), 0, "on the table beside it");
  assert.equal(pieceAt(pieces, 42, 0.45, 50, 1.5), 1);
  assert.equal(pieceAt(pieces, 20, 0, 50, 1.5), -1);
});

test("pieces are kept and come back as they were, and a save that doesn't fit the place loses only what doesn't", () => {
  const world = new World(PICNIC);
  const pieces = [piece("tile-blue", -60, -150), piece("wall", 20, -150, 2), piece("dish-yellow", 60, -160)];
  for (const p of pieces) assert.ok(fits(world, [], p));
  const kept = JSON.parse(JSON.stringify(keepPieces(pieces)));
  assert.deepEqual(keptPieces(kept, world), pieces);
  // Into the jam jar (a place changed by a later build), on top of another, and nonsense: dropped.
  const jam = PICNIC.solids.find((s) => s.name === "jam")!.footprint as { x: number; z: number };
  const broken = [...kept, ["wall", jam.x, jam.z, 0, 0], ["tile-red", -60, -150, 0, 0], ["sofa", 0, 0, 0, 0], ["tile-red", 0, 0, 9, 0], "x", null];
  assert.deepEqual(keptPieces(broken, world), pieces);
  assert.deepEqual(keptPieces({ nope: 1 }, world), []);
});

test("no more than the most a place keeps come back", () => {
  const many = Array.from({ length: MAX_PIECES + 10 }, (_, i) => ["tile-blue", -150 + (i % 10) * 15, -150 + Math.floor(i / 10) * 15, 0, 0]);
  assert.equal(keptPieces(many, base).length, MAX_PIECES);
});
