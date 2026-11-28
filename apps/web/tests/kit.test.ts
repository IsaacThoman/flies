// The Build tool and the kit's pieces in the game: where the hand sets one
// down, turning and taking away, keeping them, putting them away at a table,
// and drawing them in two draws with their tops where the world has them.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { MAX_PIECES, PICNIC, PIECE_KINDS, World, createSurface, footprintS2, pieceSolid, topHeight } from "@fly/world";
import type { Piece, PieceKind } from "@fly/world";
import { KitView, kitGeometries } from "../src/scene/kit.ts";
import { Daylight } from "../src/scene/light.ts";
import { WeatherNow } from "../src/scene/weather.ts";
import { Builder } from "../src/tools/build.ts";
import type { BuildAction } from "../src/tools/build.ts";
import { TOOLS } from "../src/tools/hands.ts";
import { TRAY } from "../src/tools/tray.ts";
import { picnic } from "../src/places/picnic/index.ts";

/** An open stretch of the picnic table, toward the lake. */
const OPEN = { x: -40, y: 0, z: -170 };
const FLY = { x: -40, y: 0, z: -200 };

function setup(saved: Record<string, unknown> = {}) {
  const world = new World(PICNIC);
  const kept: Record<string, unknown>[] = [];
  const builder = new Builder(world, saved, (b) => kept.push(JSON.parse(JSON.stringify(b))));
  builder.enter("picnic", PICNIC);
  const at = (action: BuildAction, x: number, z: number, following = false, fly = FLY) => builder.point(action, { x, y: world.heightAt(x, z), z }, following, fly, [fly], []);
  const build = (action: BuildAction, x: number, z: number, following = false, fly = FLY) => {
    at(action, x, z, following, fly);
    return builder.use(action);
  };
  return { world, builder, kept, at, build };
}

test("the Build tool's kinds are the kit's pieces, and the tray's Build ring has each of them", () => {
  const tool = TOOLS.find((t) => t.id === "build")!;
  assert.deepEqual(tool.variants.map((v) => v.id), [...PIECE_KINDS]);
  assert.deepEqual(TRAY.build.map((item) => item.id), [...PIECE_KINDS]);
});

test("a piece goes down where the hand is, on the grid, into the world the fly meets", () => {
  const { world, builder, build } = setup();
  assert.ok(build("tile-blue", OPEN.x + 0.4, OPEN.z - 0.3));
  assert.deepEqual(builder.pieces, [{ kind: "tile-blue", x: -40, z: -170, turns: 0, y: 0 }]);
  const s = world.surface(-40, -170, createSurface());
  assert.equal(world.solids[s.solid].name, "blue tile");
  assert.equal(s.y, 0.5);
  // Not into it again.
  assert.equal(build("tile-red", OPEN.x + 3, OPEN.z), false);
});

test("following the fly, a piece that has no room just in front of it goes on out until it has", () => {
  const { builder, build } = setup();
  const fly = { x: -40, y: 0, z: -180 };
  // The hand waits just in front of its mouth, too near for a tile.
  assert.ok(build("tile-yellow", -40, -177.5, true, fly));
  const p = builder.pieces[0];
  assert.ok(p.z - 7 >= fly.z + 2.2 - 1e-9, `clear of the fly: ${p.z}`);
  assert.equal(p.x, -40);
  // Pointed at exactly, it isn't moved: no room there, nothing built.
  assert.equal(build("tile-red", -40, -185, false, fly), false);
});

test("pieces go down turned as the one in hand is; the hand on one takes it up, and Clear takes them all away", () => {
  const { builder, build, world } = setup();
  builder.turns = 2;
  build("wall", OPEN.x, OPEN.z);
  assert.equal(builder.pieces[0].turns, 2);
  // Along z now: the hand where its end would have been is on nothing.
  assert.equal(build("remove", OPEN.x + 9, OPEN.z), false);
  build("wall", OPEN.x + 30, OPEN.z);
  assert.equal(builder.pieces[1].turns, 2);
  assert.equal(build("remove", OPEN.x + 50, OPEN.z), false, "nothing there");
  assert.ok(build("remove", OPEN.x, OPEN.z));
  assert.deepEqual(builder.pieces.map((p) => p.x), [OPEN.x + 30]);
  assert.ok(build("clear", 0, 0));
  assert.deepEqual(builder.pieces, []);
  assert.equal(world.solids.length, PICNIC.solids.length);
  assert.equal(build("clear", 0, 0), false, "nothing to clear");
});

test("no more than the most a place keeps", () => {
  const { builder, build } = setup();
  let n = 0;
  for (let i = 0; i < 8 && n < MAX_PIECES + 2; i++) for (let k = 0; k < 8 && n < MAX_PIECES + 2; k++, n++) build("tile-blue", -100 + i * 15, -250 + k * 15);
  assert.equal(builder.pieces.length, MAX_PIECES);
});

test("what is built is kept for its place, comes back with it, and a place's own pieces stay its own", () => {
  const { kept, build } = setup();
  build("dish-blue", OPEN.x, OPEN.z);
  build("ramp", OPEN.x + 30, OPEN.z);
  const saved = kept.at(-1)!;
  const again = setup(saved);
  assert.deepEqual(again.builder.pieces.map((p) => p.kind), ["dish-blue", "ramp"]);
  assert.equal(again.world.solids.length, PICNIC.solids.length + 2);
  // Elsewhere, nothing built yet.
  const elsewhere = new Builder(new World(PICNIC), saved, () => {});
  elsewhere.enter("windowsill", PICNIC);
  assert.deepEqual(elsewhere.pieces, []);
});

test("at a table the pieces are put away, out of the world, and nothing can be built; alone again, they are back", () => {
  const { world, builder, build } = setup();
  build("wall", OPEN.x, OPEN.z);
  builder.setActive(false);
  assert.equal(world.solids.length, PICNIC.solids.length);
  assert.equal(build("tile-red", OPEN.x + 40, OPEN.z), false);
  assert.equal(builder.pieces.length, 1, "still kept");
  builder.setActive(true);
  assert.equal(world.solids.length, PICNIC.solids.length + 1);
});

test("the pieces are drawn in two draws however many there are, and a ghost only while building", () => {
  const { builder, build } = setup();
  for (let i = 0; i < 6; i++) build(PIECE_KINDS[i % PIECE_KINDS.length], -100 + i * 30, -170);
  const scene = new THREE.Scene();
  const view = new KitView(scene);
  const light = new Daylight("noon", picnic.palettes);
  const weather = new WeatherNow();
  view.update(builder, null, 1, 0, light, weather, true);
  const drawn = () => {
    const meshes: THREE.Object3D[] = [];
    scene.traverseVisible((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o);
    });
    return meshes.length;
  };
  assert.equal(drawn(), 2);
  const aim = builder.point("crumb", { x: 0, y: 0, z: -230 }, false, FLY, [FLY], []);
  view.update(builder, aim, 1, 0, light, weather, true);
  assert.equal(drawn(), 3);
  builder.setActive(false);
  view.update(builder, null, 1, 0, light, weather, true);
  assert.equal(drawn(), 0);
});

test("each piece is drawn on the world's shape of it: nothing drawn stands above its top, or rises off the table outside it", () => {
  for (const [kind, geometry] of kitGeometries()) {
    const piece: Piece = { kind: kind as PieceKind, x: 0, z: 0, turns: 0, y: 0 };
    const solid = pieceSolid(piece);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      // On its edge counts as in it.
      if (footprintS2(solid.footprint, x, z) <= 1 + 1e-4) assert.ok(y <= topHeight(solid, x * 0.9999, z * 0.9999) + 0.06, `${kind}: drawn at ${y.toFixed(3)} over its top ${topHeight(solid, x, z).toFixed(3)} at ${x.toFixed(2)}, ${z.toFixed(2)}`);
      // Outside it only what is flat enough not to matter to a fly (a leaf's stalk).
      else assert.ok(y < 0.5, `${kind}: drawn ${y.toFixed(2)} high outside its shape at ${x.toFixed(2)}, ${z.toFixed(2)}`);
    }
  }
});
