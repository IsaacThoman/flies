// What a hungry fly does with the Feed tool's bitter foods, on the real
// connectome (skipped without it: npm run brain:fetch): its life frame by frame,
// as the game runs it, set down with its mouth on each. The brain decides; this
// only watches what it was sent and whether it ate.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { FLY_LENGTH, HUNGER, MOUTH_AHEAD } from "@fly/body";
import { World } from "@fly/world";
import type { FoodKind, Place } from "@fly/world";
import { Life } from "../src/life.ts";
import { DEFAULT_CONNECTOME_PATH } from "../../../packages/brain/src/node.ts";
import { InProcessBrain, brainData } from "../../../scripts/fuzz/brain.ts";

const skip = existsSync(DEFAULT_CONNECTOME_PATH) ? false : "run npm run brain:fetch for the real brain";
const data = skip ? null : brainData();
const DT = 1 / 60;
const BARE: Place = { floor: { kind: "circle", r: 200 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 300 };

/** Five seconds of a new fly's hunger with its mouth on a dropped `kind`: the most bitter it was sent, and how long it ate. */
function onIt(kind: FoodKind, seed: number) {
  const life = new Life(new World(BARE), new InProcessBrain(data!, seed));
  life.pantry.drop(kind, 0, MOUTH_AHEAD * FLY_LENGTH);
  life.hunger.level = HUNGER.start;
  let bitter = 0;
  let fed = 0;
  for (let t = 0; t < 5; t += DT) {
    life.step(DT, performance.now());
    bitter = Math.max(bitter, life.sensed.bitter);
    if (life.eating) fed += DT;
  }
  return { bitter, fed };
}

test("a hungry fly eats sugar, tastes the bitterness of sugar spoiled with coffee and leaves it, and tastes coffee without eating it", { skip }, () => {
  for (const seed of [1, 2, 3]) {
    const sugar = onIt("sugar", seed);
    const laced = onIt("laced", seed);
    const coffee = onIt("coffee", seed);
    assert.equal(sugar.bitter, 0);
    assert.ok(sugar.fed > 2, `seed ${seed}: fed on sugar for ${sugar.fed.toFixed(1)} s`);
    assert.ok(laced.bitter > 0.4, `seed ${seed}: bitter sugar sent bitter ${laced.bitter}`);
    assert.ok(laced.fed < 0.5, `seed ${seed}: fed on bitter sugar for ${laced.fed.toFixed(1)} s`);
    assert.equal(coffee.bitter, 1);
    // Nothing in it a fly eats or drinks: no sugar, and too much dissolved in it for the water neurons.
    assert.equal(coffee.fed, 0);
  }
});
