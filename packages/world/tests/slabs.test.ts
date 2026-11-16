// Solids with air beneath them, in a small diner (./diner.ts) and in the
// restaurant.

import assert from "node:assert/strict";
import { test } from "node:test";
import { mulberry32 } from "@fly/brain";
import { Pantry, RESTAURANT, World, createSurface, topHeight } from "../src/index.ts";
import type { RayHit, Solid } from "../src/index.ts";
import { DINER } from "./diner.ts";

const world = new World(DINER);
const index = (name: string) => DINER.solids.findIndex((s) => s.name === name);
const hit = (): RayHit => ({ point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, solid: -2, t: 0 });
const unit = (x: number, y: number, z: number) => {
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
};

test("over one point are several surfaces: the one at or below a height, and the air over it", () => {
  const s = createSurface();
  // Over the plate on the table: the ceiling's top is highest; below that, the plate; under the plate, the table, buried.
  assert.equal(world.surface(20, 0, s).solid, index("ceiling"));
  assert.equal(world.surface(20, 0, s, 100).solid, index("plate"));
  assert.equal(s.y, 77);
  assert.equal(s.underside, 300);
  assert.equal(world.surface(20, 0, s, 76.5).solid, index("table"));
  assert.equal(s.underside, 76, "nothing over a table top under a plate");
  // Under the table: the floor, with the table's underside over it.
  assert.deepEqual(world.surface(-50, 0, s, 50), { y: 0, normal: { x: 0, y: 1, z: 0 }, solid: -1, onTable: true, underside: 72 });
  // Exactly on a top finds it; a hair under, not.
  assert.equal(world.heightAt(-50, 0, 76), 76);
  assert.equal(world.heightAt(-50, 0, 76 - 1e-9), 76);
  assert.equal(world.heightAt(-50, 0, 75.99), 0);
  // The chair seat under the table's edge, and the floor under that.
  assert.equal(world.heightAt(-110, 0, 74), 47 - 2 * (30 / 40) ** 2);
  assert.equal(world.heightAt(-110, 0, 44), 0);
});

test("a dish resting on a slab falls to its bottom at its edge, not to the floor; one on the floor is as it was", () => {
  const plate = DINER.solids[index("plate")];
  assert.equal(topHeight(plate, 20, 0), 77);
  assert.ok(Math.abs(topHeight(plate, 20 + 30 * 0.999, 0) - 76) < 1e-3);
  assert.ok(topHeight(plate, 20 + 30 * 0.92, 0) > 77 && topHeight(plate, 20 + 30 * 0.92, 0) < 80);
  assert.ok(world.surface(20 + 30 * 0.92, 0, createSurface(), 100).normal.x > 0.2, "its outside faces outward");
  const saucer: Solid = { name: "saucer", footprint: { kind: "circle", x: 0, z: 0, r: 10 }, top: { kind: "dish", well: 1, rim: 4, inner: 0.5, lip: 0.8 } };
  const t = (0.9 - 0.8) / 0.2;
  assert.ok(Math.abs(topHeight(saucer, 9, 0) - 4 * (1 - t * t * (3 - 2 * t))) < 1e-12);
  assert.ok(topHeight(saucer, 10 * 0.9999, 0) < 1e-4, "down to the floor");
});

test("the air over a height ends at the lowest underside, at once inside a solid, never on a top", () => {
  assert.equal(world.underside(-50, 0, 0), 72);
  assert.equal(world.underside(-50, 0, 74), 74, "inside the table top");
  assert.equal(world.underside(-50, 0, 72), 72, "touching its underside");
  assert.equal(world.underside(-50, 0, 76), 300, "standing on it");
  assert.equal(world.underside(0, 150, 200), 200, "inside the cord");
  assert.equal(world.underside(0, 150, 100), 150, "under the lamp");
  assert.equal(world.underside(250, 250, 10), 300);
  assert.equal(world.underside(500, 500, 10), Infinity, "beyond everything");
});

test("a point is inside a solid only strictly between its bottom and its top; out of it, straight up, is the top of what rests on it", () => {
  assert.equal(world.solidAt(-50, 74, 0), index("table"));
  assert.equal(world.solidAt(-50, 76, 0), -1);
  assert.equal(world.solidAt(-50, 72, 0), -1);
  assert.equal(world.solidAt(-50, 10, 0), -1);
  assert.equal(world.solidAt(20, 76.5, 0), index("plate"));
  assert.equal(world.solidAt(-90, 30, -50), index("leg"));
  assert.equal(world.topAbove(20, 74, 0), 77, "out of the table, and of the plate on it");
  assert.equal(world.topAbove(-50, 10, 0), 10);
});

test("the way out of a wall is the way out of what fills the heights between, not of what stands over them", () => {
  const n = { x: 0, y: 0, z: 0 };
  // Under the table, beside a leg: the leg is in the way, the table top over it is not.
  assert.equal(world.wallNormal(-90 + 3.5, -50, 0.9, n, 2.2), true);
  assert.ok(n.x > 0.99, "out of the leg, toward the middle");
  assert.equal(world.wallNormal(-50, 0, 0.9, n, 2.2), false);
  // Against the table top's edge, at its height.
  assert.equal(world.wallNormal(-99.5, 0, 73, n, 75), true);
  assert.ok(n.x < -0.99);
  // Over a height alone, as before: the table top rises above the floor there.
  assert.equal(world.wallNormal(-50, 0, 0.9, n), true);
});

test("rays meet tops from above, undersides from below, and sides between a slab's bottom and its top; they pass under and over", () => {
  const table = index("table");
  const up = world.raycast({ x: -50, y: 10, z: 0 }, { x: 0, y: 1, z: 0 }, hit());
  assert.ok(up && up.solid === table && up.point.y === 72 && up.normal.y === -1, "its underside, from below");
  const down = world.raycast({ x: -50, y: 200, z: 0 }, { x: 0, y: -1, z: 0 }, hit());
  assert.ok(down && down.solid === table && down.point.y === 76 && down.normal.y === 1, "its top, from above");
  const side = world.raycast({ x: -200, y: 74, z: 20 }, { x: 1, y: 0, z: 0 }, hit());
  assert.ok(side && side.solid === table && side.point.x === -100 && side.normal.x === -1, "its side, between bottom and top");
  // Along the underside's plane it touches the side; a hair under it, it passes beneath to the far wall of nothing.
  assert.equal(world.raycast({ x: -200, y: 72, z: 20 }, { x: 1, y: 0, z: 0 }, hit())?.solid, table);
  assert.equal(world.raycast({ x: -200, y: 71.999, z: 20 }, { x: 1, y: 0, z: 0 }, hit()), null);
  // Over the table top, it meets the plate's outside.
  const over = world.raycast({ x: -200, y: 77, z: 0 }, { x: 1, y: 0, z: 0 }, hit());
  assert.ok(over && over.solid === index("plate") && over.normal.x < 0 && over.normal.y > 0);
  // Slanting up under the table's edge into its underside, and slanting down past its edge to the floor.
  const slant = world.raycast({ x: -95, y: 30, z: 0 }, unit(1, 1, 0), hit());
  assert.ok(slant && slant.solid === table && slant.normal.y === -1 && Math.abs(slant.point.x + 53) < 1e-9);
  const past = world.raycast({ x: -130, y: 100, z: 0 }, unit(0, -1, 0.0001), hit());
  assert.ok(past && past.solid === index("seat"), "beside the table, down onto the seat");
});

test("a ray sweeping a body that tall meets an underside that much lower, and the sides under it", () => {
  const table = index("table");
  const up = world.raycast({ x: -50, y: 10, z: 0 }, { x: 0, y: 1, z: 0 }, hit(), Infinity, 2);
  assert.ok(up && up.solid === table && up.point.y === 70);
  const side = world.raycast({ x: -200, y: 71, z: 20 }, { x: 1, y: 0, z: 0 }, hit(), Infinity, 2);
  assert.ok(side && side.solid === table && side.normal.x === -1, "its side, lowered");
  // Columns standing on the floor are not lowered: a body over the floor is beside them, not under them.
  const leg = world.raycast({ x: -50, y: 0.5, z: -50 }, { x: -1, y: 0, z: 0 }, hit(), Infinity, 2);
  assert.ok(leg && leg.solid === index("leg") && leg.point.x === -86);
});

test("a ray from inside a solid leaves it unmet", () => {
  const out = world.raycast({ x: -50, y: 74, z: 0 }, { x: 0, y: 1, z: 0 }, hit());
  assert.ok(out && out.solid === index("ceiling") && out.point.y === 300);
});

test("nothing a ray passes before what it meets is inside a solid, and short rays agree with long ones, in a room of slabs", () => {
  const random = mulberry32(5);
  for (const place of [DINER, RESTAURANT]) {
    const w = new World(place);
    const room = place === DINER ? 300 : 4300;
    const full = hit();
    const bounded = hit();
    for (let i = 0; i < 2000; i++) {
      const origin = { x: (random() * 2 - 1) * room, y: random() * (place === DINER ? 310 : 3300), z: (random() * 2 - 1) * room };
      if (w.solidAt(origin.x, origin.y, origin.z) >= 0) continue;
      const dir = unit(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1);
      const all = w.raycast(origin, dir, full);
      const end = all ? all.t : 3000;
      for (let k = 0; k < 60; k++) {
        const t = (end * k) / 60;
        assert.equal(w.solidAt(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t), -1, `passed through a solid: ${JSON.stringify({ origin, dir, t, all })}`);
      }
      const distance = 0.1 + random() * 400;
      const short = w.raycast(origin, dir, bounded, distance);
      assert.equal(!!short, !!(all && all.t < distance), JSON.stringify({ origin, dir, distance, full, bounded }));
      if (short && all) {
        assert.equal(short.solid, all.solid);
        assert.ok(Math.abs(short.t - all.t) < 1e-4);
      }
    }
  }
});

test("a place's food, and food dropped or put out, lies on the surface at or below the height it is given", () => {
  const pantry = new Pantry(world, DINER.patches);
  assert.deepEqual(pantry.foods.map((f) => [f.name, f.y]), [["jam", 77], ["grape", 0]]);
  assert.equal(pantry.drop("sugar", -50, 0, 30).y, 0, "under the table, on the floor");
  assert.equal(pantry.drop("honey", -50, 0, 80).y, 76, "on the table");
  assert.equal(pantry.add("crumb", -50, 0, 1, 0.5, 76).y, 76);
  assert.equal(pantry.touching(-50, 0, 0, 0.3)?.name, "Sugar");
});

test("the restaurant's start and food lie where they say", () => {
  const w = new World(RESTAURANT);
  const { x, z, y } = RESTAURANT.start;
  assert.equal(w.heightAt(x, z, y), y);
  const pantry = new Pantry(w, RESTAURANT.patches);
  for (const food of pantry.foods) {
    const patch = RESTAURANT.patches.find((p) => p.name === food.name && p.x === food.x && p.z === food.z)!;
    assert.ok(food.y <= patch.y! + 1e-6 && food.y > patch.y! - 40, `${food.name} at ${food.y}, said ${patch.y}`);
    assert.ok(w.underside(food.x, food.z, food.y) > food.y + 1.3, `${food.name} has room over it for a fly`);
  }
});
