import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { REGIONS } from "@fly/brain";
import type { BrainCommand, BrainSenses, BrainState } from "@fly/brain";
import type { BrainDriver } from "@fly/contracts";
import { RHYTHM, Rhythm, SUMMER } from "@fly/body";
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
  state: BrainState = { command: { walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0 }, stats: { simMs: 0, wallMs: 0, spikes: 0, active: 0, rates: {} } };
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
      if (mode === "feeding") life.pantry.drop("honey", life.body.position.x, life.body.position.z, life.body.position.y);
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
    life.pantry.drop("honey", life.body.position.x, life.body.position.z, life.body.position.y);
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
  life.pantry.drop("honey", life.body.position.x, life.body.position.z, life.body.position.y);
  life.step(1 / 60, performance.now());
  assert.equal(life.meals, 1);
  life.move(places.lab);
  life.pantry.drop("honey", life.body.position.x, life.body.position.z, life.body.position.y);
  life.step(1 / 60, performance.now());
  assert.equal(life.meals, 2);
});

test("what it eats feeds its hunger, which goes to the brain, and fills its crop", () => {
  const brain = new Commands();
  const life = new Life(new World(places.picnic), brain);
  const start = life.hunger.level;
  life.step(1 / 60, performance.now());
  assert.equal(life.sensed.hunger, start, "the brain is sent the hunger");
  assert.ok(life.hunger.level > start, "it grows hungrier while it doesn't eat");

  brain.state.command.feed = 1;
  life.pantry.drop("sugar", life.body.position.x, life.body.position.z, life.body.position.y);
  const before = life.hunger.level;
  for (let i = 0; i < 60; i++) life.step(1 / 60, performance.now());
  assert.ok(life.eaten > 0);
  assert.ok(life.hunger.level < before - 0.1, `${life.hunger.level} after eating, ${before} before`);
  assert.ok(life.hunger.fullness > 0.1);
  assert.ok(life.sensed.hunger! < before - 0.1, "and the brain is sent the lower hunger");
});

test("with a rhythm it tells the brain the clock and its sleep, and is asleep after five minutes still", () => {
  const brain = new Commands();
  const life = new Life(new World(places.picnic), brain);
  life.step(1 / 30, performance.now());
  assert.equal(life.sensed.clockSleep, undefined, "no rhythm, no internal state: the brain as it was");
  life.rhythm = new Rhythm(1, SUMMER, 0.4);
  for (let t = 0; t < RHYTHM.still - 1; t += 0.5) life.step(0.5, performance.now());
  assert.equal(life.activity, "resting");
  const last: BrainSenses = life.sensed;
  assert.equal(last.clockSleep, 1);
  assert.ok(Math.abs(last.sleepPressure! - 0.4) < 0.01, "awake so far, building slowly");
  assert.ok(last.sleepDepth! > 0.5);
  for (let t = 0; t < 2; t += 0.5) life.step(0.5, performance.now());
  assert.equal(life.activity, "sleeping");
  // The brain's walking ends it: the body only watches.
  brain.state.command.walk = 1;
  for (let k = 0; k < 10; k++) life.step(1 / 30, performance.now());
  assert.equal(life.activity, "walking");
  assert.equal(life.rhythm.depth, 0);
  assert.equal(life.rhythm.bouts, 1);
});

test("the brain is told the air's temperature at its antennae only when the fly feels it, which the game leaves off", () => {
  let told: BrainSenses | null = null;
  const brain = new (class extends Commands {
    override tick(_dt?: number, senses?: BrainSenses) { told = { ...senses! }; }
  })();
  const world = new World(places.picnic);
  const life = new Life(world, brain);
  life.step(1 / 60, performance.now());
  assert.equal(told!.temperatureLeft, undefined);
  assert.equal(told!.temperatureRight, undefined);
  assert.equal(life.senses.senses.temperatureLeft, 25, "the body still feels it");
  life.feelsTemperature = true;
  world.temperature.ambient = 31;
  life.step(1 / 60, performance.now());
  assert.equal(told!.temperatureLeft, 31);
  assert.equal(told!.temperatureRight, 31);
  life.feelsTemperature = false;
  life.step(1 / 60, performance.now());
  assert.equal(told!.temperatureLeft, undefined);
});
