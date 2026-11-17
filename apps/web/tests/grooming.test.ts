// How much an undisturbed fly grooms, on the real connectome (skipped without
// it: npm run brain:fetch): its whole life frame by frame, as the game runs it.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { World } from "@fly/world";
import type { Place } from "@fly/world";
import { Life } from "../src/life.ts";
import { DEFAULT_CONNECTOME_PATH } from "../../../packages/brain/src/node.ts";
import { InProcessBrain, brainData } from "../../../scripts/fuzz/brain.ts";

const skip = existsSync(DEFAULT_CONNECTOME_PATH) ? false : "run npm run brain:fetch for the real brain";
const data = skip ? null : brainData();
const DT = 1 / 60;

/** An open disc 43 mm across, as the behaviour audit's arena: nothing on it but its edge. */
const ARENA: Place = { floor: { kind: "circle", r: 21.5 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 30 };

/**
 * Solitary flies left to themselves groom 13% of their waking time (iso31) or 19%
 * (Canton-S), round the clock in their tubes (Qiao et al. 2018, eLife 7:e34497,
 * Results and Figure 4—figure supplement 1). This fly is awake throughout.
 */
const MOST_GROOMING = 0.19;

test("left to itself on an open table, it grooms no more of its time than an undisturbed fly does", { skip }, () => {
  // Two seeds, half a minute to settle and two minutes counted each; long enough to reach the edge, where
  // its antennae once counted the drop as a push and it groomed nearly all the time.
  let groomed = 0;
  let counted = 0;
  for (const seed of [1, 2]) {
    const life = new Life(new World(ARENA), new InProcessBrain(data!, seed));
    for (let t = 0; t < 30; t += DT) life.step(DT, performance.now());
    const before = life.groomed;
    for (let t = 0; t < 120; t += DT) life.step(DT, performance.now());
    groomed += life.groomed - before;
    counted += 120;
  }
  assert.ok(groomed / counted < MOST_GROOMING, `grooming ${((100 * groomed) / counted).toFixed(1)}% of the time`);
});
