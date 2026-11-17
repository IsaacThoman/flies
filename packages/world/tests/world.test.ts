import assert from "node:assert/strict";
import { test } from "node:test";
import { FOODS, MAX_DROPPED, PATCHES, PATCH_RECOVERY, Pantry, SOLIDS, TABLE_RADIUS, World, createPicnic, createSurface, isDropped } from "../src/index.ts";
import type { RayHit } from "../src/index.ts";

/** A bare round table this wide, with nothing on it. */
const openTable = (r: number) => new World({ floor: { kind: "circle", r }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 320 });

const world = createPicnic();
const solid = (name: string) => SOLIDS.find((s) => s.name === name)!;
const hit = (): RayHit => ({ point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, solid: -2, t: 0 });

test("the bare table is level at 0 and ends at its edge", () => {
  const s = world.surface(0, -150, createSurface());
  assert.equal(s.y, 0);
  assert.equal(s.solid, -1);
  assert.equal(s.onTable, true);
  assert.deepEqual(s.normal, { x: 0, y: 1, z: 0 });
  assert.equal(world.surface(TABLE_RADIUS + 1, 0, createSurface()).onTable, false);
});

test("flat tops stand at their height, the highest one wins where they overlap", () => {
  const lemonade = solid("lemonade").footprint as { x: number; z: number };
  assert.equal(world.heightAt(lemonade.x - 20, lemonade.z), 112);
  // The stacked sugar cube sits over the two below it.
  assert.equal(world.heightAt(126, 61), 32);
  assert.equal(world.heightAt(111, 56), 16);
});

test("domes rise to their full height in the middle and meet their base at the edge", () => {
  const cherry = solid("cherry").footprint as { x: number; z: number; r: number };
  assert.ok(Math.abs(world.heightAt(cherry.x, cherry.z) - cherry.r * 2) < 1e-9);
  const half = solid("strawberry half");
  const f = half.footprint as { x: number; z: number; rx: number; rz: number; angle: number };
  assert.ok(Math.abs(world.heightAt(f.x, f.z) - 9) < 1e-9);
  // Near the edge of its long axis it's nearly down at the table.
  const x = f.x + Math.sin(f.angle) * f.rz * 0.99;
  const z = f.z + Math.cos(f.angle) * f.rz * 0.99;
  assert.ok(world.heightAt(x, z) < 0.3);
});

test("a dome's normal leans away from its middle", () => {
  const apple = solid("apple").footprint as { x: number; z: number; r: number };
  const s = world.surface(apple.x + apple.r * 0.5, apple.z, createSurface());
  assert.ok(s.normal.x > 0.3 && s.normal.y > 0.5);
  assert.ok(Math.abs(Math.hypot(s.normal.x, s.normal.y, s.normal.z) - 1) < 1e-9);
});

test("the way out of a wall points away from it, and off the table back toward the middle", () => {
  const jam = solid("jam").footprint as { x: number; z: number; r: number };
  const n = { x: 0, y: 0, z: 0 };
  assert.equal(world.wallNormal(jam.x - jam.r + 0.5, jam.z, 1, n), true);
  assert.ok(n.x < -0.99);
  assert.equal(world.wallNormal(0, -150, 1, n), false);
  assert.equal(world.wallNormal(TABLE_RADIUS + 5, 0, 1, n), true);
  assert.ok(n.x < -0.99);
});

test("rays land on tops, sides and the table, and miss the sky", () => {
  const lemonade = solid("lemonade").footprint as { x: number; z: number };
  const down = world.raycast({ x: lemonade.x - 10, y: 400, z: lemonade.z }, { x: 0, y: -1, z: 0 }, hit());
  assert.ok(down);
  assert.ok(Math.abs(down.point.y - 112) < 1e-9);
  assert.equal(SOLIDS[down.solid].name, "lemonade");
  // Straight at the jar's side from the right.
  const side = world.raycast({ x: lemonade.x + 200, y: 40, z: lemonade.z }, { x: -1, y: 0, z: 0 }, hit());
  assert.ok(side);
  assert.ok(Math.abs(side.point.x - (lemonade.x + 34)) < 1e-6);
  assert.ok(side.normal.x > 0.99);
  const table = world.raycast({ x: 0, y: 100, z: -150 }, { x: 0, y: -1, z: 0 }, hit());
  assert.equal(table?.solid, -1);
  assert.equal(world.raycast({ x: 0, y: 100, z: 0 }, { x: 0, y: 1, z: 0 }, hit()), null);
  assert.equal(world.raycast({ x: TABLE_RADIUS + 50, y: 100, z: 0 }, { x: 0, y: -1, z: 0 }, hit()), null);
});

test("a slanted ray meets a dome on its surface", () => {
  const apple = solid("apple").footprint as { x: number; z: number; r: number };
  const d = { x: -Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 };
  const h = world.raycast({ x: apple.x + 200, y: 260, z: apple.z }, d, hit());
  assert.ok(h);
  assert.equal(SOLIDS[h.solid].name, "apple");
  assert.ok(Math.abs(h.point.y - world.heightAt(h.point.x, h.point.z)) < 0.01);
});

test("the pantry knows what is tasted where", () => {
  const pantry = new Pantry(world, PATCHES);
  const honey = PATCHES.find((p) => p.name === "honey")!;
  assert.equal(pantry.touching(honey.x, 0, honey.z, 0.3)?.name, "honey");
  assert.equal(pantry.touching(honey.x + honey.r + 5, 0, honey.z, 0.3), null);
  // Too far above it to taste.
  assert.equal(pantry.touching(honey.x, 10, honey.z, 0.3), null);
  const sugarTop = pantry.touching(126, 32, 61, 0.3);
  assert.equal(sugarTop?.name, "sugar");
});

test("eating takes food down, dropped food is gone when eaten, patches come back", () => {
  const pantry = new Pantry(openTable(300), [{ name: "honey", x: 0, z: 0, r: 5, sweet: 1 }]);
  const patch = pantry.foods[0];
  pantry.eat(patch, 1, 1);
  assert.ok(patch.amount < 1 && patch.amount > 0.5);
  pantry.update(PATCH_RECOVERY);
  assert.equal(patch.amount, 1);
  const sugar = pantry.drop("sugar", 50, 0);
  assert.equal(sugar.sweet, FOODS.sugar.sweet);
  for (let i = 0; i < 100; i++) pantry.eat(sugar, 1, 0.1);
  assert.equal(pantry.foods.includes(sugar), false);
  // Water is touched but isn't sweet.
  const water = pantry.drop("water", 80, 0);
  assert.equal(pantry.touching(80, 0, 0, 0.3), water);
  assert.equal(water.sweet, 0);
});

test("at most a few dropped foods at once: the oldest makes way", () => {
  const pantry = new Pantry(openTable(300));
  const first = pantry.drop("berry", 0, 0);
  for (let i = 0; i < MAX_DROPPED; i++) pantry.drop("sugar", i * 10, 0);
  assert.equal(pantry.foods.length, MAX_DROPPED);
  assert.equal(pantry.foods.includes(first), false);
});

/** The steepest slope a fly can stand on (packages/body, MAX_SLOPE_COS): 65° from level. */
const STANDABLE = Math.cos((65 * Math.PI) / 180);

/** Whether a fly could walk over every part of a solid's top, from the table up. */
function climbable(name: string) {
  return SOLIDS.filter((s) => s.name === name).every((s) => {
    const f = s.footprint as { x: number; z: number; rx: number; rz: number };
    const n = createSurface();
    for (let i = -20; i <= 20; i++) {
      for (let j = -20; j <= 20; j++) {
        const x = f.x + (i / 20) * f.rx * 1.05;
        const z = f.z + (j / 20) * f.rz * 1.05;
        if (world.surface(x, z, n).normal.y < STANDABLE) return false;
      }
    }
    return true;
  });
}

test("something the place puts out to be found is tasted where it lies, eaten up and gone, and isn't the player's", () => {
  const pantry = new Pantry(world, []);
  for (let i = 0; i < MAX_DROPPED; i++) pantry.drop("sugar", -100 + i * 5, 150);
  const juice = pantry.add("strawberry juice", 40, -200, 1.1, 0.8);
  assert.equal(juice.kind, "found");
  assert.equal(pantry.touching(40, 0, -200, 0.3), juice);
  pantry.drop("honey", 100, 150);
  assert.ok(pantry.foods.includes(juice), "dropping more food doesn't push it out");
  assert.equal(pantry.foods.filter(isDropped).length, MAX_DROPPED);
  let eaten = 0;
  for (let attempts = 0; attempts < 10 && pantry.foods.includes(juice); attempts++) eaten += pantry.eat(juice, 1, 1);
  assert.ok(!pantry.foods.includes(juice) && Math.abs(eaten - 1) < 1e-9, "eaten up, and gone");
});

test("the biscuit crumbs and the lemon pips are low and round enough to walk up and over", () => {
  assert.ok(SOLIDS.some((s) => s.name === "crumb") && SOLIDS.some((s) => s.name === "pip"));
  assert.ok(climbable("crumb"));
  assert.ok(climbable("pip"));
});

test("a fly can walk up the whole strawberry and over its top, where there is juice", () => {
  assert.ok(climbable("strawberry"));
  const f = solid("strawberry").footprint as { x: number; z: number };
  assert.ok(world.heightAt(f.x, f.z) > 15);
  const juice = new Pantry(world, PATCHES).touching(f.x, world.heightAt(f.x, f.z), f.z, 0.5);
  assert.ok(juice && juice.sweet > 0, "something sweet on top");
});

test("the lemonade stands in a saucer with a rim to walk along and lemonade pooled inside", () => {
  const saucer = solid("saucer");
  const f = saucer.footprint as { x: number; z: number; r: number };
  const lemonade = solid("lemonade").footprint as { r: number };
  const n = createSurface();
  // Every step from the table, up over the rim and down into the moat, can be stood on.
  let peak = 0;
  for (let r = f.r + 1; r > lemonade.r + 0.5; r -= 0.25) {
    const s = world.surface(f.x + r, f.z, n);
    assert.ok(s.normal.y >= STANDABLE, `too steep ${r} mm out`);
    peak = Math.max(peak, s.y);
  }
  assert.ok(peak > 3, "a rim");
  // The rim's crest is level enough to walk along.
  const crest = (saucer.top as { lip: number }).lip * f.r;
  assert.ok(world.surface(f.x, f.z - crest, n).normal.y > 0.99);
  // The moat is lower than the rim, and has lemonade in it.
  const pantry = new Pantry(world, PATCHES);
  const pool = PATCHES.find((p) => p.name === "lemonade")!;
  const floor = world.heightAt(pool.x, pool.z);
  assert.ok(floor < peak - 2);
  assert.ok(pantry.touching(pool.x, floor, pool.z, 0.3)?.name === "lemonade");
  // A ray from above lands in the moat.
  const down = world.raycast({ x: pool.x, y: 50, z: pool.z }, { x: 0, y: -1, z: 0 }, hit());
  assert.ok(down && Math.abs(down.point.y - floor) < 1e-4);
});

test("a rectangular top: over it inside its edges, and the way back from beyond them", () => {
  const sill = new World({ floor: { kind: "rect", hx: 200, hz: 40 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 200 });
  assert.equal(sill.onTable(199, 39), true);
  assert.equal(sill.onTable(0, 41), false);
  assert.equal(sill.onTable(201, 0), false);
  const inward = { x: 0, y: 0, z: 0 };
  // Beyond the long edge, straight back across it.
  assert.equal(sill.beyond(0, 50, inward), 10);
  assert.ok(inward.x === 0 && inward.z === -1);
  // Beyond a corner, diagonally back toward it.
  assert.ok(Math.abs(sill.beyond(203, -44, inward) - 5) < 1e-9);
  assert.ok(Math.abs(inward.x + 0.6) < 1e-9 && Math.abs(inward.z - 0.8) < 1e-9);
  // Inside, negative: how far in from the nearest edge.
  assert.equal(sill.beyond(0, 30, inward), -10);
  // Walls: off the top, back over it.
  const n = { x: 0, y: 0, z: 0 };
  assert.equal(sill.wallNormal(0, 45, 1, n), true);
  assert.ok(n.x === 0 && n.z === -1);
  // Rays land on the top only inside its edges.
  assert.ok(sill.raycast({ x: 150, y: 50, z: 30 }, { x: 0, y: -1, z: 0 }, hit()));
  assert.equal(sill.raycast({ x: 150, y: 50, z: 45 }, { x: 0, y: -1, z: 0 }, hit()), null);
});

test("a circle's way back from beyond its edge points to the middle", () => {
  const inward = { x: 0, y: 0, z: 0 };
  assert.ok(Math.abs(world.beyond(TABLE_RADIUS + 30, 0, inward) - 30) < 1e-9);
  assert.ok(inward.x === -1 && inward.z === 0);
});

test("the world can become another place, and the pantry sets out that place's food", () => {
  const w = createPicnic();
  const pantry = new Pantry(w, PATCHES);
  pantry.drop("sugar", 10, 10);
  const shelf = { floor: { kind: "rect", hx: 100, hz: 30 }, solids: [{ name: "pot", footprint: { kind: "circle", x: 50, z: 0, r: 10 }, top: { kind: "flat", y: 40 } }], patches: [{ name: "jam", x: -20, z: 0, r: 4, sweet: 1 }], start: { x: 0, z: 0, yaw: 0 }, ceiling: 150 } as const;
  w.load(shelf);
  pantry.reset(shelf.patches);
  assert.equal(w.heightAt(50, 0), 40);
  assert.equal(w.heightAt(SOLIDS[1].footprint.x, SOLIDS[1].footprint.z), 0);
  assert.equal(w.onTable(0, 31), false);
  assert.deepEqual(pantry.foods.map((f) => f.name), ["jam"]);
});

test("a bounded ray stops at its segment end, for both the floor and a solid", () => {
  const w = new World({ floor: { kind: "rect", hx: 100, hz: 100 }, solids: [{ name: "pane", footprint: { kind: "box", x: 0, z: 0, hx: 0.5, hz: 20, angle: 0 }, top: { kind: "flat", y: 100 } }], patches: [], start: { x: -10, z: 0, yaw: 0 }, ceiling: 100 });
  assert.equal(w.raycast({ x: -10, y: 20, z: 0 }, { x: 1, y: 0, z: 0 }, hit(), 9), null);
  assert.equal(w.raycast({ x: -10, y: 20, z: 0 }, { x: 1, y: 0, z: 0 }, hit(), 10)?.t, 9.5);
  assert.equal(w.raycast({ x: -10, y: 20, z: 0 }, { x: 0, y: -1, z: 0 }, hit(), 19), null);
  assert.equal(w.raycast({ x: -10, y: 20, z: 0 }, { x: 0, y: -1, z: 0 }, hit(), 20)?.t, 20);
});

test("taste follows a food's circular reach and its remaining sweetness", () => {
  const pantry = new Pantry(openTable(300));
  const honey = pantry.drop("honey", 0, 0);
  const berry = pantry.drop("berry", 0, 0);
  assert.equal(pantry.touching(1.5, 0, 0, 0), honey, "inside the radius, outside its square root");
  assert.equal(pantry.touching(1.5, 0, 1.5, 0), null, "outside the circle even though each axis is within reach");
  pantry.eat(honey, 1, 2);
  assert.equal(pantry.touching(0, 0, 0, 0), berry, "a nearly eaten sweeter food loses to a whole berry");
});

test("eating clamps appetite and elapsed time, never creates food or eats more than remains", () => {
  const pantry = new Pantry(openTable(300));
  const food = pantry.drop("honey", 0, 0);
  assert.equal(pantry.eat(food, -1, 1), 0);
  assert.equal(pantry.eat(food, 1, -1), 0);
  assert.equal(food.amount, 1);
  const reference = pantry.drop("honey", 10, 0);
  assert.equal(pantry.eat(food, 10, 1), pantry.eat(reference, 1, 1));
  const remaining = food.amount;
  assert.equal(pantry.eat(food, 1, 100), remaining);
  assert.equal(food.amount, 0);
  assert.equal(pantry.touching(0, 0, 0, 0), null);
});

test("removing a food that is already gone leaves the others on the table", () => {
  const pantry = new Pantry(openTable(300));
  const gone = pantry.drop("sugar", 0, 0);
  const kept = pantry.drop("water", 10, 0);
  pantry.remove(gone);
  pantry.remove(gone);
  assert.deepEqual(pantry.foods, [kept]);
});
