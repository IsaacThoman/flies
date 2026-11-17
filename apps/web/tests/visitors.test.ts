// The picnic's visitors treat every fly this device lives as they treat the
// other players' flies at a table: they keep clear of whichever is nearest,
// and a falling leaf brushes any of them.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Pantry, World, WORLDS } from "@fly/world";
import type { Vec3 } from "@fly/world";
import { Goings } from "../src/places/picnic/life.ts";
import { Butterfly, Ladybird, Leaves } from "../src/places/picnic/visitors.ts";
import type { Around, Felt } from "../src/places/types.ts";
import type { Weather } from "../src/scene/weather.ts";

const gradient = { addColorStop() {} };
const context = new Proxy({}, { get: () => () => gradient });
(globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => context }) };
(globalThis as { Path2D?: unknown }).Path2D = class { addPath() {} moveTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} };

const felt = (): Felt => ({ air: { x: 0, y: 0, z: 0 }, touch: 0, looming: [] });

function around(fly: Vec3, company: Vec3[], others: Vec3[] | null): Around {
  const world = new World(WORLDS.picnic);
  const weather = { wind: 0, rain: 0, cloud: 0, mist: 0, wet: 0 } as unknown as Weather;
  return { fly, airborne: false, world, pantry: new Pantry(world), weather, quiet: false, felt: felt(), company, shared: others && { others, anchor: fly, ownSky: false } };
}

test("alone, the butterfly and the ladybird keep clear of whichever of this device's flies is nearest them, as of another player's at a table", (t) => {
  const butterfly = t.mock.method(Butterfly.prototype, "step");
  const ladybird = t.mock.method(Ladybird.prototype, "step");
  const goings = new Goings(() => {});
  // Both visitors are where they wait, over the table's middle.
  const followed = { x: 200, y: 0, z: 200 };
  const near = { x: 3, y: 0, z: 2 };
  const far = { x: -150, y: 0, z: 40 };
  goings.live(1 / 60, around(followed, [far, near], null));
  assert.equal(butterfly.mock.calls[0].arguments[3], near);
  assert.equal(ladybird.mock.calls[0].arguments[3], near);
  // At a table, another player's fly nearer still is the one.
  const theirs = { x: 1, y: 0, z: 1 };
  goings.live(1 / 60, around(followed, [far, near], [theirs]));
  assert.equal(butterfly.mock.calls[1].arguments[3], theirs);
  // With nobody else, the followed fly.
  goings.live(1 / 60, around(followed, [], null));
  assert.equal(butterfly.mock.calls[2].arguments[3], followed);
});

/** A leaf come down to the moment it is `k` of the way along its fall. */
function falling(k: number) {
  const world = new World(WORLDS.picnic);
  const leaves = new Leaves();
  let seed = 1;
  leaves.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const nowhere = { x: 1e4, y: 0, z: 1e4 };
  assert.ok(leaves.start(world, nowhere, { x: 300, z: 0, strength: 0.5 }));
  const gust = { x: 300, z: 0, strength: 0.5 };
  for (let t = 0; leaves.state === "falling" && t < k * 2.6; t += 1 / 60) leaves.step(1 / 60, t, world, nowhere, gust);
  return { world, leaves, gust, nowhere };
}

test("a falling leaf brushes each fly it passes once, any of this device's flies", () => {
  const { leaves } = falling(0.5);
  assert.equal(leaves.state, "falling");
  const p = leaves.loose.position;
  const a = { x: p.x, y: p.y - 0.8, z: p.z };
  const b = { x: p.x + 1, y: p.y - 0.8, z: p.z };
  assert.equal(leaves.brush(a), 0.4);
  assert.equal(leaves.brush(a), 0, "once a fall");
  assert.equal(leaves.brush(b), 0.4, "another fly there is brushed too");
  assert.equal(leaves.brush({ x: p.x + 50, y: p.y, z: p.z }), 0, "not one it doesn't pass");
});

test("a leaf landing on a fly brushes it and slides off it, whichever fly it is", () => {
  // Where it lands: a twin with the same chances, let land.
  const twin = falling(0.8);
  for (let t = 0; twin.leaves.state === "falling" && t < 10; t += 1 / 60) twin.leaves.step(1 / 60, t, twin.world, twin.nowhere, twin.gust);
  const landing = { x: twin.leaves.loose.position.x, y: 0, z: twin.leaves.loose.position.z };
  const { world, leaves, gust, nowhere } = falling(0.8);
  assert.equal(leaves.state, "falling");
  let touched = 0;
  for (let t = 0; leaves.state === "falling" && t < 10; t += 1 / 60) {
    leaves.step(1 / 60, t, world, nowhere, gust);
    if (leaves.state !== "falling") touched = leaves.brush(landing);
  }
  assert.equal(touched, 0.4);
  assert.equal(leaves.state, "sliding");
});

test("the picnic's falling leaf brushes a companion it passes, once, through feel()", () => {
  const followed = { x: 400, y: 0, z: 400 };
  const companion = { x: 0, y: 0, z: 0 };
  const a = around(followed, [companion], []);
  const goings = new Goings(() => {});
  goings.live(1 / 60, a);
  let seed = 3;
  goings.happen("leaf", () => ((seed = (seed * 16807) % 2147483647) / 2147483647));
  const loose = goings.seen[3];
  assert.ok(loose.visible, "a leaf is coming down");
  const touches: number[] = [];
  for (let frame = 0; frame < 600; frame++) {
    goings.live(1 / 60, a);
    // The companion stands just under the leaf as it falls.
    companion.x = loose.position.x;
    companion.y = loose.position.y - 0.8;
    companion.z = loose.position.z;
    const f = felt();
    goings.feel(1 / 60, companion, f);
    if (f.touch > 0) touches.push(f.touch);
  }
  assert.deepEqual(touches, [0.4]);
});
