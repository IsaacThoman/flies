import assert from "node:assert/strict";
import { test } from "node:test";
import { BAR, LAB, PICNIC, WINDOWSILL, World, createPicnic } from "@fly/world";
import { AIRBORNE, Leash, MAX_FLIGHT, MAX_PLAYERS, MAX_WALK, Rate, couldBe, createFlyState, mayReturnTo, spawnSpot } from "../src/index.ts";

const world = createPicnic();
const start = world.place.start;

function at(x: number, z: number, t: number, flags = 0) {
  const s = createFlyState();
  s.x = x;
  s.y = world.heightAt(x, z);
  s.z = z;
  s.t = t;
  s.flags = flags;
  return s;
}

test("a fly walking at a fly's pace is taken where its device says", () => {
  const leash = new Leash();
  const last = at(start.x, start.z, 1000);
  for (let i = 1; i <= 40; i++) assert.equal(leash.admit(world, last, at(start.x + i * 0.75, start.z, 1000 + i * 50), 1000 + i * 50), "taken");
  assert.ok(Math.abs(last.x - (start.x + 30)) < 1e-9);
});

test("a jump across the table is cut short to what a fly could have walked: it is never taken where it says", () => {
  const leash = new Leash();
  const last = at(start.x, start.z, 1000);
  // A stalled device, or a lying one, says its fly is 200 mm away half a second later, again and again.
  let t = 1000;
  for (let i = 0; i < 20; i++) {
    t += 500;
    const result = leash.admit(world, last, at(start.x + 200, start.z, t), t);
    assert.ok(result !== "refused", result);
  }
  // In ten seconds it has come no further than ten seconds' walk and a second saved up.
  assert.ok(last.x - start.x <= MAX_WALK * 11 + 1, `came ${last.x - start.x} mm`);
  assert.ok(last.x - start.x < 200 || t - 1000 >= (200 / MAX_WALK) * 1000);
  // In the air it may go faster, but no faster than a fly flies.
  const flying = new Leash();
  const up = at(start.x, start.z, 0, AIRBORNE);
  up.y = 40;
  const far = at(start.x + 300, start.z, 100, AIRBORNE);
  far.y = 40;
  flying.admit(world, up, far, 100);
  assert.ok(up.x - start.x <= MAX_FLIGHT * 0.1 + 1);
});

test("a state from the future, an old one, or from somewhere a fly can't be is not taken", () => {
  const leash = new Leash();
  const last = at(start.x, start.z, 1000);
  assert.equal(leash.admit(world, last, at(start.x, start.z, 5000), 1000), "refused");
  assert.equal(leash.admit(world, last, at(start.x, start.z, 900), 1000), "refused");
  // On its feet a metre off the table: held where it was.
  const off = at(start.x, start.z, 1050);
  off.x = 2000;
  assert.equal(leash.admit(world, last, off, 1050), "held");
  assert.equal(last.x, start.x);
  assert.ok(!couldBe(world, 0, -5, 0, false), "under the table");
  assert.ok(!couldBe(world, NaN, 0, 0, true));
  assert.ok(couldBe(world, 300, 60, 300, true), "in the air past the edge");
  assert.ok(!couldBe(world, 300, 60, 300, false), "standing on nothing");
});

test("coming back, a fly may be where it walked to meanwhile, but not across the table", () => {
  assert.ok(mayReturnTo(world, [start.x + 20, start.z, 0], start.x, start.z, 2));
  assert.ok(!mayReturnTo(world, [start.x + 250, start.z, 0], start.x, start.z, 2));
  assert.ok(mayReturnTo(world, [start.x + 150, start.z, 0], start.x, start.z, 9));
  assert.ok(!mayReturnTo(world, [start.x + 250, start.z, 0], start.x, start.z, 3600), "however long it was away");
  assert.ok(!mayReturnTo(world, [5000, 0, 0], start.x, start.z, 2));
});

test("every player's fly is set down on somewhere level near the place's start, apart from the others, in every place", () => {
  for (const place of [PICNIC, WINDOWSILL, LAB, BAR]) {
    const w = new World(place);
    const spots = Array.from({ length: MAX_PLAYERS }, (_, i) => spawnSpot(w, i + 1));
    assert.deepEqual(spots[0], [place.start.x, place.start.z, place.start.yaw]);
    for (const [x, z] of spots) assert.ok(w.onTable(x, z) && couldBe(w, x, w.heightAt(x, z), z, false));
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) assert.ok(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]) > 2.5, `${i + 1} and ${j + 1} apart`);
    }
  }
});

test("a rate allows a few at once, then so many a minute", () => {
  const rate = new Rate(6, 2);
  assert.ok(rate.take(0));
  assert.ok(rate.take(0));
  assert.ok(!rate.take(0));
  assert.ok(!rate.take(5_000));
  assert.ok(rate.take(10_000));
});
