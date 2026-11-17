// Footprints: what a foot carries after standing in what, how it runs out
// step by step, the ring they are drawn from, and a fly walking out of honey
// leaving a trail that is only drawn.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { FOODS, PICNIC, Pantry, World } from "@fly/world";
import type { FoodKind } from "@fly/world";
import { PLACES } from "../src/places/catalog.ts";
import { SCENES } from "../src/places/index.ts";
import { DROPPED, EVERY, FAINTEST, Footprints, INKS, InkedFeet, KEEP, PRINTS, Prints, STICKY_LIFE, WATER, WET_LIFE, inkOf } from "../src/scene/prints.ts";
import { walker } from "./walker.ts";

/** The foods that are dry, and leave nothing on a fly's feet. */
const DRY = new Set(["sugar", "spilt sugar", "biscuit crumb", "crumbs", "cake crumbs", "tart crumbs", "mints"]);
const HONEY = PICNIC.patches.find((p) => p.name === "honey")!;
const rgb = (tint: number) => [(tint >> 16) & 255, (tint >> 8) & 255, tint & 255];

test("every food in every place either leaves an ink or is dry, and water leaves wet prints", () => {
  for (const info of PLACES) {
    for (const patch of SCENES[info.id].place.patches) assert.ok(INKS[patch.name] || DRY.has(patch.name), `${info.name}: what does ${patch.name} leave?`);
  }
  // What the picnic puts out to be found.
  assert.ok(INKS["grape juice"] && INKS["strawberry juice"] && DRY.has("biscuit crumb"));
  for (const kind of Object.keys(FOODS) as FoodKind[]) assert.ok(kind in DROPPED);
  assert.equal(DROPPED.sugar, null);
  assert.equal(DROPPED.water, WATER);
  assert.ok(INKS["tomato juice"] && !INKS["tomato juice"].wet);
  assert.ok(INKS["fig flesh"] && !INKS["fig flesh"].wet);
  assert.ok(WATER.wet && !INKS.honey.wet && !DROPPED.berry!.wet);
  const [r, g, b] = rgb(INKS.honey.tint);
  assert.ok(r > g && g > b, "honey is amber");
  const [rr, rg, rb] = rgb(DROPPED.berry!.tint);
  assert.ok(rr > 2 * rg && rr > 2 * rb, "raspberry is red");
  const pantry = new Pantry(new World(PICNIC), PICNIC.patches);
  assert.equal(inkOf(pantry.drop("honey", 0, 0)), INKS.honey);
  assert.equal(inkOf(pantry.drop("sugar", 10, 0)), null);
  assert.equal(inkOf(pantry.foods.find((f) => f.name === "jam")!), INKS.jam);
});

test("a foot loaded in food prints clearly at first, then fainter and fewer, about ten steps, and food loads it again", () => {
  const feet = new InkedFeet();
  assert.equal(feet.plant(0, false, null, 0), 0, "a clean foot leaves nothing");
  assert.equal(feet.plant(0, true, INKS.honey, 0), 0, "in the honey it prints nothing");
  assert.equal(feet.load[0], 1);
  // Every step it could print (the luckiest rolls) and every step it does on the unluckiest.
  const most: number[] = [];
  for (let s = 0; s < 30; s++) most.push(feet.plant(0, false, null, 0));
  feet.plant(0, true, INKS.honey, 0);
  const fewest: number[] = [];
  for (let s = 0; s < 30; s++) fewest.push(feet.plant(0, false, null, 0.999));
  const printed = most.filter((v) => v > 0);
  assert.ok(printed.length >= 9 && printed.length <= 13, `${printed.length} steps print`);
  assert.equal(printed[0], 1);
  for (let i = 1; i < printed.length; i++) assert.ok(Math.abs(printed[i] - printed[i - 1] * KEEP) < 1e-6, "each fainter than the last");
  assert.ok(printed.at(-1)! >= FAINTEST);
  assert.ok(most.slice(printed.length).every((v) => v === 0), "then none");
  // Below EVERY, only some steps print.
  assert.ok(fewest.every((v) => v === 0 || v >= EVERY));
  assert.ok(fewest.filter((v) => v > 0).length < printed.length);
  // Sugar is dry: it neither cleans the foot nor loads it.
  feet.plant(1, true, INKS.jam, 0);
  feet.plant(1, false, null, 0);
  const load = feet.load[1];
  assert.equal(feet.plant(1, true, null, 0), 0);
  assert.equal(feet.load[1], load);
  assert.equal(feet.ink[1], INKS.jam);
  // Stepping in water, it carries water.
  feet.plant(1, true, WATER, 0);
  assert.equal(feet.ink[1], WATER);
  assert.equal(feet.load[1], 1);
  feet.clear();
  assert.ok(feet.load.every((v) => v === 0) && feet.ink.every((v) => v === null));
});

test("prints are a ring: the newest takes the oldest's place, they fade in time (water sooner), and none draws nothing", () => {
  const prints = new Prints(new THREE.Group());
  const geometry = prints.mesh.geometry as THREE.InstancedBufferGeometry;
  prints.update(0);
  assert.equal(prints.mesh.visible, false);
  assert.equal(prints.count(0), 0);
  for (let i = 0; i < PRINTS + 10; i++) prints.add(i, 0, 0, 0, 0, 0, 1, INKS.honey, 0);
  assert.equal(geometry.instanceCount, PRINTS);
  assert.equal(prints.count(0), PRINTS);
  const at = geometry.getAttribute("aAt").array;
  assert.equal(at[0], PRINTS, "the first slot holds a newer print");
  assert.equal(at[10 * 4], 10, "the eleventh is the oldest left");
  prints.add(0, 0, 0, 0, 0, 0, 1, WATER, 10);
  prints.update(10);
  assert.equal(prints.mesh.visible, true);
  assert.equal(prints.count(10 + WET_LIFE - 1), PRINTS);
  assert.equal(prints.count(10 + WET_LIFE + 1), PRINTS - 1, "the water dried first");
  prints.update(STICKY_LIFE + 1);
  assert.equal(prints.count(STICKY_LIFE + 1), 0);
  assert.equal(prints.mesh.visible, false, "nothing to draw once all are gone");
  prints.add(0, 0, 0, 0, 0, 0, 1, INKS.honey, 200);
  prints.clear();
  prints.update(200);
  assert.equal(prints.count(200), 0);
  assert.equal(geometry.instanceCount, 0);
  assert.equal(prints.mesh.visible, false);
});

test("a fly walking out of the honey leaves a trail of honey prints on the table where its feet were set down, and only drawn", () => {
  const world = new World(PICNIC);
  const pantry = new Pantry(world, PICNIC.patches);
  const foods = pantry.foods.map((f) => ({ ...f }));
  const footprints = new Footprints(new THREE.Group());
  const geometry = footprints.prints.mesh.geometry as THREE.InstancedBufferGeometry;
  // In the honey, heading out of it toward +z, over the bare cloth.
  const fly = walker(world, HONEY.x, HONEY.z, 0);
  fly.pose.speed = 2;
  let time = 0;
  const run = (seconds: number, standing = true) => {
    for (let i = 0; i < seconds * 60; i++) {
      time += 1 / 60;
      fly.step(1 / 60);
      footprints.update(fly.model, standing, false, world, pantry, time);
    }
  };
  run(0.5);
  assert.equal(geometry.instanceCount, 0, "nothing printed in the honey");
  assert.ok(footprints.feet.load.every((v) => v === 1), "every foot carries honey");
  run(4);
  const count = geometry.instanceCount;
  assert.ok(count >= 30 && count <= 80, `${count} prints`);
  assert.ok(footprints.feet.load.every((v) => v < FAINTEST), "its feet are clean");
  const at = geometry.getAttribute("aAt").array;
  const ink = geometry.getAttribute("aInk").array;
  const lie = geometry.getAttribute("aLie").array;
  const [r, g, b] = rgb(INKS.honey.tint).map((v) => v / 255);
  for (let i = 0; i < count; i++) {
    const x = at[i * 4], y = at[i * 4 + 1], z = at[i * 4 + 2];
    assert.ok(Math.hypot(x - HONEY.x, z - HONEY.z) > HONEY.r, "outside the honey");
    assert.ok(z > HONEY.z && Math.abs(x - HONEY.x) < 2, "along its way");
    assert.equal(y, 0, "on the table");
    assert.ok(lie[i * 4] === 0 && lie[i * 4 + 1] === 0, "lying flat on it");
    assert.ok(Math.abs(ink[i * 4] - r) < 1e-6 && Math.abs(ink[i * 4 + 1] - g) < 1e-6 && Math.abs(ink[i * 4 + 2] - b) < 1e-6 && ink[i * 4 + 3] === STICKY_LIFE);
  }
  // The trail runs out a short way from the honey.
  let far = 0;
  for (let i = 0; i < count; i++) far = Math.max(far, at[i * 4 + 2] - HONEY.z - HONEY.r);
  assert.ok(far > 3 && far < 25, `the trail goes ${far.toFixed(1)} mm`);
  run(2);
  assert.equal(geometry.instanceCount, count, "clean feet leave nothing");
  // The pantry is as it was: the fly can't taste its prints.
  assert.deepEqual(pantry.foods.map((f) => ({ ...f, amount: 1 })), foods.map((f) => ({ ...f, amount: 1 })));
  assert.equal(footprints.prints.count(time), count);
  footprints.clear();
  assert.equal(footprints.prints.count(time), 0);
});

test("feet set down in the air, or by a fly standing in water, print nothing; walking on from the water leaves wet prints", () => {
  const world = new World(PICNIC);
  const pantry = new Pantry(world, []);
  pantry.drop("water", 0, 0);
  const footprints = new Footprints(new THREE.Group());
  const geometry = footprints.prints.mesh.geometry as THREE.InstancedBufferGeometry;
  const fly = walker(world, 0, -0.5, 0);
  fly.pose.speed = 1.5;
  let time = 0;
  const run = (seconds: number, standing: boolean) => {
    for (let i = 0; i < seconds * 60; i++) {
      time += 1 / 60;
      fly.step(1 / 60);
      footprints.update(fly.model, standing, false, world, pantry, time);
    }
  };
  run(3, false);
  assert.equal(geometry.instanceCount, 0);
  assert.ok(footprints.feet.load.every((v) => v === 0), "nothing taken up off the ground");
  const back = walker(world, 0, -0.5, 0);
  back.pose.speed = 1.5;
  for (let i = 0; i < 4 * 60; i++) {
    time += 1 / 60;
    back.step(1 / 60);
    footprints.update(back.model, true, false, world, pantry, time);
  }
  assert.ok(geometry.instanceCount > 10);
  assert.ok(footprints.prints.count(time) > 10);
  assert.equal(footprints.prints.count(time + WET_LIFE), 0, "and they dry");
});

// As the nervous system's probe does: the footprints are looked at every frame
// on the TV's JavaScript, so they must allocate nothing, even setting prints down.
test("the footprints' per-frame work allocates nothing but boxed numbers, even without a JIT", () => {
  const probe = fileURLToPath(new URL("prints-probe.ts", import.meta.url));
  const result = spawnSync(process.execPath, ["--no-opt", "--no-maglev", "--no-sparkplug", probe], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const { micros, prints, numberSize, sizes } = JSON.parse(result.stdout) as { micros: number; prints: number; numberSize: number; sizes: Record<string, string[]> };
  console.log(`  footprints: ${micros.toFixed(1)} µs a frame in V8's interpreter (no JIT), ${prints} prints set down while sampled`);
  assert.ok(prints > 0, "the sample includes prints being set down");
  const others = Object.entries(sizes).filter(([size]) => Number(size) !== numberSize);
  assert.deepEqual(others, [], `allocations other than ${numberSize}-byte numbers`);
});
