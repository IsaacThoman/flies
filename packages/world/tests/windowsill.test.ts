// The windowsill as the fly meets it: the window it can't get through, the
// ledge at the glass's foot, the things on the sill it can climb, and the
// pools it can paddle in.

import assert from "node:assert/strict";
import { test } from "node:test";
import { ALARM_CLOCK, BANANA, BASIL_CROWN, BASIL_POT, BASIL_TIPS, FRUIT_BOWL, HONEY_JAR, PEBBLES, POSTCARD, Pantry, SILL, SILL_PATCHES, SILL_SOLIDS, WINDOW, WINDOWSILL, World, bananaAt, createSurface, inside, topHeight } from "../src/index.ts";
import type { RayHit } from "../src/index.ts";

const world = new World(WINDOWSILL);
/** The steepest slope a fly can stand on (packages/body, MAX_SLOPE_COS): 65° from level. */
const STANDABLE = Math.cos((65 * Math.PI) / 180);
const hit = (): RayHit => ({ point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, solid: -1, t: 0 });
const solid = (name: string) => SILL_SOLIDS.find((s) => s.name === name)!;

test("the glass and the walls either side of it stop a fly and a camera: from the room, a ray into the window meets the glass", () => {
  const n = { x: 0, y: 0, z: 0 };
  // At the glass, above the rail, it is a wall facing the room.
  assert.ok(world.wallNormal(-80, WINDOW.glass - 1, 100, n));
  assert.ok(n.z > 0.99, "the glass faces the room");
  const down = world.raycast({ x: -80, y: 200, z: 300 }, { x: 0, y: -0.2, z: -1 }, hit());
  assert.ok(down && Math.abs(down.point.z - WINDOW.glass) < 1e-6 && down.normal.z > 0.99, "a ray from the room stops at the glass");
  for (const side of [-1, 1]) assert.ok(world.heightAt(side * (SILL.hx + 10), 0) > WINDOWSILL.ceiling, "the wall either side stands higher than a fly flies");
  assert.ok(world.heightAt(0, WINDOW.glass - 20) > WINDOWSILL.ceiling);
});

test("at the foot of the glass is a ledge, too tall to step up onto, level to stand on", () => {
  const s = world.surface(-80, WINDOW.glass + 4, createSurface());
  assert.equal(s.y, WINDOW.rail.top);
  assert.ok(s.onTable && s.normal.y > 0.99);
});

test("the banana can be walked from its tip all along its back, where its split skin is sweet", () => {
  const p = { x: 0, z: 0 };
  const s = createSurface();
  let last = 0;
  for (let t = 0; t <= BANANA.stalk; t += 0.002) {
    bananaAt(t, p);
    world.surface(p.x, p.z, s);
    assert.ok(s.normal.y >= STANDABLE, `too steep at ${t.toFixed(3)}`);
    if (t > 0) assert.ok(Math.abs(s.y - last) < 0.9, `a step at ${t.toFixed(3)}`);
    last = s.y;
  }
  const split = SILL_PATCHES.find((f) => f.name === "banana")!;
  const pantry = new Pantry(world, SILL_PATCHES);
  assert.ok(world.heightAt(split.x, split.z) > 8, "on its back");
  assert.equal(pantry.touching(split.x, world.heightAt(split.x, split.z), split.z, 0.3)?.name, "banana");
});

test("the fruit bowl: up its side, round its rim, down inside among the fruit to plum juice", () => {
  const s = createSurface();
  let peak = 0;
  // From the sill across the bowl toward its middle, between the fruit.
  for (let r = FRUIT_BOWL.r + 2; r > 0.42 * FRUIT_BOWL.r; r -= 0.25) {
    world.surface(FRUIT_BOWL.x + r, FRUIT_BOWL.z + 6, s);
    assert.ok(s.normal.y >= STANDABLE, `too steep ${r} mm out`);
    peak = Math.max(peak, s.y);
  }
  assert.ok(peak > 25, "over the rim");
  const juice = SILL_PATCHES.find((f) => f.name === "plum juice")!;
  assert.ok(world.heightAt(juice.x, juice.z) < 8, "down in the bowl");
});

test("the basil's saucer holds water round the pot's foot, walkable from the sill", () => {
  const s = createSurface();
  for (let r = BASIL_POT.saucer + 1; r > BASIL_POT.r + 0.5; r -= 0.25) assert.ok(world.surface(BASIL_POT.x + r, BASIL_POT.z, s).normal.y >= STANDABLE, `saucer too steep ${r} mm out`);
  const water = SILL_PATCHES.find((f) => f.name === "water")!;
  assert.ok(water.pool);
  assert.equal(new Pantry(world, SILL_PATCHES).touching(water.x, world.heightAt(water.x, water.z), water.z, 0.3)?.name, "water");
});

test("the basil is a mound of leaves a fly lands on, from the pot's rim up, with its flowering tips standing out of it", () => {
  const { x, z, rim } = BASIL_POT;
  const s = createSurface();
  const crown = SILL_SOLIDS.filter((c) => c.name === "basil");
  const leaves = (px: number, pz: number) => Math.max(rim, ...crown.filter((c) => inside(c.footprint, px, pz)).map((c) => topHeight(c, px, pz)));
  const highest = BASIL_CROWN.reduce((a, b) => (b.top > a.top ? b : a));
  assert.ok(highest.top < WINDOWSILL.ceiling, "within a fly's reach");
  // Its top is a perch: level enough to stand on round the highest clump's crest, and smooth.
  let last = world.heightAt(x + highest.x, z + highest.z);
  assert.equal(last, highest.top);
  for (let r = 0; r < highest.r * 0.45; r += 0.25) {
    world.surface(x + highest.x + r * 0.6, z + highest.z - r * 0.8, s);
    assert.ok(s.normal.y >= STANDABLE, `too steep ${r} mm out`);
    assert.ok(Math.abs(s.y - last) < 0.9, `a step ${r} mm out`);
    last = s.y;
  }
  // It fills the pot, hiding the soil, and comes down to the rim at its edge; no wider than the pot, so the saucer round it stays open to the sky.
  assert.ok(world.heightAt(x + 20, z + 10) > rim + 50, "over the soil");
  assert.ok(Math.abs(leaves(x + BASIL_CROWN[0].r * 0.9999, z) - rim) < 2, "at the rim");
  for (const c of BASIL_CROWN) assert.ok(Math.hypot(c.x, c.z) + c.r <= BASIL_POT.r, "within the pot");
  for (const tip of BASIL_TIPS) assert.ok(world.heightAt(tip.x, tip.z) > leaves(tip.x, tip.z) + 10, "a flowering tip stands out of the leaves");
});

test("the alarm clock stands on the sill: a fly can land on its case and walk across its top, round as the drum is, and on its bells", () => {
  const { x, z, r, y, depth, bezel, bells, hammer } = ALARM_CLOCK;
  const s = createSurface();
  const curve = (u: number) => y + Math.sqrt(r * r - u * u);
  // Across the top in front of the bells, from one side to the other where it isn't too steep: level underfoot, within a third of a millimetre of the drum, in steps a fly hardly notices.
  const front = z + bells.r + 1;
  const reach = r * Math.sin((Math.atan(Math.tan((65 * Math.PI) / 180)) * 0.98));
  let last = -1;
  for (let u = -reach; u <= reach; u += 0.05) {
    world.surface(x + u, front, s);
    assert.ok(s.normal.y >= STANDABLE, `level enough ${u.toFixed(2)} mm across`);
    assert.ok(Math.abs(s.y - curve(u)) < 0.36, `on the drum ${u.toFixed(2)} mm across: ${s.y.toFixed(2)} for ${curve(u).toFixed(2)}`);
    if (last >= 0) assert.ok(Math.abs(s.y - last) < 0.9, `a step ${u.toFixed(2)} mm across`);
    last = s.y;
  }
  // Along its shoulder, past a bell, from the back to the bezel it is level: a drum, not a dome.
  const shoulder = bells.x + bells.r + 3;
  for (let w = -depth / 2 + 0.5; w < depth / 2 + bezel - 0.5; w += 0.5) assert.ok(Math.abs(world.heightAt(x + shoulder, z + w) - curve(shoulder)) < 0.36, `along its top ${w} mm`);
  assert.equal(world.heightAt(x, z + depth / 2 + bezel + 0.5), 0, "the sill in front of the bezel");
  assert.equal(world.heightAt(x, z - depth / 2 - 0.5), 0, "the sill behind it");
  // Its sides go down to its widest, as wide as it is, and no wider.
  for (const side of [-1, 1]) {
    assert.ok(world.heightAt(x + side * (r - 0.2), z) > y - 1, "its side, to its widest");
    assert.equal(world.heightAt(x + side * (r + 0.2), z), 0, "the sill beside it");
    assert.equal(world.heightAt(x + side * bells.x, z), bells.base + bells.r, "a bell's crown");
  }
  assert.equal(world.heightAt(x, z), hammer.base + hammer.r, "the hammer's head");
  assert.ok(bells.base + bells.r < WINDOWSILL.ceiling, "within a fly's reach");
  // It stands on the sill, clear of the window's ledge and of the bowl and the bottle beside it.
  assert.ok(z - depth / 2 > WINDOW.glass + WINDOW.rail.depth, "in front of the ledge");
  for (const name of ["bowl", "bottle"]) {
    const f = solid(name).footprint as { x: number; z: number; r: number };
    assert.ok(Math.abs(f.x - x) > f.r + r, `clear of the ${name}`);
  }
});

test("the honey jar's lid is a perch, and the postcard propped at the end of the sill is a wall a fly can't get behind", () => {
  const s = createSurface();
  assert.ok(world.surface(HONEY_JAR.x + 5, HONEY_JAR.z - 4, s).y === HONEY_JAR.top && s.normal.y > 0.99, "the lid");
  assert.ok(HONEY_JAR.top < WINDOWSILL.ceiling);
  const n = { x: 0, y: 0, z: 0 };
  // At the card's foot it rises sheer from the sill, facing the sill's middle; behind it the wedge up to the wall is solid, higher toward the wall, as the card leans.
  assert.ok(world.wallNormal(SILL.hx - POSTCARD.foot + 0.1, POSTCARD.z, 0.5, n) && n.x < -0.99, "its face");
  let last = 0;
  for (let x = SILL.hx - POSTCARD.foot + 1.5; x < SILL.hx; x += 1) {
    const y = world.heightAt(x, POSTCARD.z + POSTCARD.width / 2 - 1);
    assert.ok(y > last, `higher toward the wall at ${x}`);
    last = y;
  }
  assert.ok(last > POSTCARD.length * 0.8, "up to its top");
  assert.equal(world.heightAt(SILL.hx - POSTCARD.foot - 0.5, POSTCARD.z), 0, "the sill in front of it");
  assert.equal(world.heightAt(SILL.hx - 4, POSTCARD.z + POSTCARD.width / 2 + 0.5), 0, "the sill beside it");
});

test("the pebbles, shells and sea glass at the back of the sill can be climbed from the sill, and are clear of everything else", () => {
  const s = createSurface();
  for (const p of PEBBLES) {
    let last = 0;
    // From the sill up its side and over its top, the long way.
    for (let u = -p.rx - 1; u <= 0; u += 0.1) {
      world.surface(p.x + u * Math.cos(p.angle), p.z - u * Math.sin(p.angle), s);
      if (s.y > 0) assert.ok(s.normal.y >= STANDABLE || s.y < 0.9, `${p.name} too steep ${u.toFixed(1)} mm out`);
      assert.ok(s.y - last < 0.9, `${p.name}: a step ${u.toFixed(1)} mm out`);
      last = s.y;
    }
    assert.equal(last, p.height);
    for (const other of SILL_SOLIDS) {
      if (other.name === p.name && other.footprint.x === p.x) continue;
      assert.ok(!inside(other.footprint, p.x, p.z) && !inside(other.footprint, p.x + p.rx, p.z) && !inside(other.footprint, p.x - p.rx, p.z), `${p.name} clear of the ${other.name}`);
    }
    // How far it reaches toward the window, turned as it lies.
    const reach = Math.hypot(p.rx * Math.sin(p.angle), p.rz * Math.cos(p.angle));
    assert.ok(p.z - reach > WINDOW.glass + WINDOW.rail.depth, `${p.name} on the sill, in front of the ledge`);
  }
});

test("the wine is a pool on the sill, and everything to eat lies within reach of the sill", () => {
  const wine = SILL_PATCHES.find((f) => f.name === "wine")!;
  assert.ok(wine.pool);
  assert.equal(world.heightAt(wine.x, wine.z), 0);
  for (const f of SILL_PATCHES) assert.ok(Math.abs(f.x) < SILL.hx && Math.abs(f.z) < SILL.hz, f.name);
});

test("the window and surrounding wall close every allowed ceiling excursion", () => {
  const highestFlight = WINDOWSILL.ceiling + 400;
  for (const s of SILL_SOLIDS.filter(s => ["glass", "wall", "jamb", "mullion", "bar"].includes(s.name))) {
    assert.ok(s.top.kind === "flat" && s.top.y > highestFlight, `${s.name} can be flown over`);
  }
  for (const x of [-319, -160, -80, 0, 160, 319]) {
    const ray = world.raycast({ x, y: highestFlight, z: 0 }, { x: 0, y: 0, z: -1 }, hit());
    assert.ok(ray && ray.normal.z > 0.99, `a high flight at x=${x} hits the room wall`);
  }
  assert.ok(world.heightAt(319.64246689820015, -127.12441457700562) > highestFlight, "the old 560 mm starting perch is no longer reachable");
});
