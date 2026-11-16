import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { REGIONS } from "@fly/brain";
import type { BrainCommand, BrainState } from "@fly/brain";
import type { BrainDriver } from "@fly/contracts";
import { World } from "@fly/world";
import { Life } from "../src/life.ts";
import { DEFAULT_CONNECTOME_PATH } from "../../../packages/brain/src/node.ts";
import { InProcessBrain, brainData } from "../../../scripts/fuzz/brain.ts";
import { checkBody, places } from "../../../scripts/fuzz/body.ts";
import type { PlaceId } from "../../../scripts/fuzz/body.ts";
import { checkMove, fuzzLife } from "../../../scripts/fuzz/life.ts";

class Commands implements BrainDriver {
  readonly status = "running";
  readonly error = null;
  readonly neurons = 0;
  readonly connections = 0;
  readonly eyes = null;
  readonly regionRates = new Float32Array(REGIONS.length);
  stateAt = 0;
  state: BrainState = { command: { walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0 }, stats: { simMs: 0, wallMs: 0, spikes: 0, active: 0, rates: {} } };
  tick() { this.stateAt = performance.now(); }
  dispose() {}
}

for (const id of Object.keys(places) as PlaceId[]) {
  for (const mode of ["walking", "airborne", "feeding"] as const) {
    test(`carry to ${id} during ${mode}: on new feet, old food gone`, () => {
      const brain = new Commands();
      const life = new Life(new World(places.picnic), brain);
      const command: Partial<BrainCommand> = mode === "walking" ? { walk: 1 } : mode === "feeding" ? { feed: 1 } : {};
      Object.assign(brain.state.command, command);
      if (mode === "feeding") life.pantry.drop("honey", life.body.position.x, life.body.position.z);
      life.step(1 / 60, performance.now());
      if (mode === "airborne") { brain.state.command.escape = 1; life.step(1 / 60, performance.now()); }
      if (mode === "feeding") assert.ok(life.eating);
      else assert.equal(life.body.mode, mode);
      checkMove(life, id);
      assert.equal(life.body.events.hit, 0);
    });
  }
}

const skip = existsSync(DEFAULT_CONNECTOME_PATH) ? false : "run npm run brain:fetch for real-brain fuzz tests";
const data = skip ? null : brainData();
const realBrain = data ? new InProcessBrain(data, 1) : null;
for (const id of Object.keys(places) as PlaceId[]) {
  test(`life fuzz: ${id}, real connectome, eyes shut`, { skip }, () => {
    const brain = realBrain!;
    fuzzLife(id, 1, 2, data!, undefined, brain);
    const life = new Life(new World(places[id]), brain);
    life.pantry.drop("honey", life.body.position.x, life.body.position.z);
    for (let i = 0; i < 45; i++) {
      life.step(1 / 30, performance.now());
      checkBody(life.body, life.world);
    }
    assert.ok(life.eaten > 0, "the real brain ate food it tasted");
    assert.ok(brain.regionRates.some(rate => rate > 0));
    brain.dispose();
  });
}

test("eating in the new place starts a new meal even when carried mid-meal", () => {
  const brain = new Commands();
  brain.state.command.feed = 1;
  const life = new Life(new World(places.picnic), brain);
  life.pantry.drop("honey", life.body.position.x, life.body.position.z);
  life.step(1 / 60, performance.now());
  assert.equal(life.meals, 1);
  life.move(places.lab);
  life.pantry.drop("honey", life.body.position.x, life.body.position.z);
  life.step(1 / 60, performance.now());
  assert.equal(life.meals, 2);
});
