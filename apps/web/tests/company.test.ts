import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrainDriver } from "@fly/contracts";
import { Pantry, createPicnic } from "@fly/world";
import { COMPANION_RETRIES, Company, companionSpot } from "../src/company.ts";

test("company grows at companion spots with independent brains sharing a pantry, and retires the last brains first", (t) => {
  const world = createPicnic();
  const pantry = new Pantry(world);
  const retired: number[] = [];
  const brains: (BrainDriver & { disposed: number })[] = [];
  const company = new Company(world, () => {
    const id = brains.length;
    const brain = {
      status: "running" as const, error: null, neurons: 0, connections: 0, eyes: null,
      regionRates: new Float32Array(), state: null, stateAt: 0, disposed: 0,
      tick() {}, dispose() { this.disposed++; retired.push(id); },
    };
    brains.push(brain);
    return brain;
  });
  company.resize(3, pantry);
  const first = company.list[0];
  assert.equal(new Set(company.list.map((c) => c.life.brain)).size, 3);
  const updates = t.mock.method(pantry, "update");
  for (const [i, c] of company.list.entries()) {
    const [x, z, yaw, y] = companionSpot(world, i);
    assert.deepEqual([c.life.body.position.x, c.life.body.position.z, c.life.body.yaw], [x, z, yaw]);
    assert.equal(c.life.body.position.y, y);
    assert.equal(c.life.pantry, pantry);
    assert.equal(c.life.tendsPantry, false);
    c.life.step(1 / 60, 0);
  }
  assert.equal(updates.mock.calls.length, 0, "only the followed fly advances shared food");
  company.resize(3, pantry);
  assert.equal(brains.length, 3, "unchanged count creates no brains");
  company.resize(1, pantry);
  assert.equal(company.list[0], first, "a surviving fly keeps its life and brain");
  assert.deepEqual(brains.map((b) => b.disposed), [0, 1, 1]);
  assert.deepEqual(retired, [2, 1]);
  company.resize(2, pantry, () => [20, 30, 0.7]);
  assert.deepEqual([company.list[1].life.body.position.x, company.list[1].life.body.position.z], [20, 30]);
  assert.equal(company.list[1].life.body.yaw, 0.7);
  const shared = new Pantry(world);
  company.share(shared);
  assert.ok(company.list.every((c) => c.life.pantry === shared && !c.life.tendsPantry));
  company.dispose();
  company.dispose();
  assert.equal(company.list.length, 0);
  assert.deepEqual(brains.map((b) => b.disposed), [1, 1, 1, 1]);
});

test("a companion whose brain fails is given a new one after each wait, and taken off once they are spent; the others keep theirs", () => {
  const world = createPicnic();
  const pantry = new Pantry(world);
  type Fake = BrainDriver & { status: BrainDriver["status"]; disposed: number };
  const brains: Fake[] = [];
  const company = new Company(world, () => {
    const brain: Fake = {
      status: "loading", error: null, neurons: 0, connections: 0, eyes: null,
      regionRates: new Float32Array(), state: null, stateAt: 0, disposed: 0,
      tick() {}, dispose() { this.disposed++; },
    };
    brains.push(brain);
    return brain;
  });
  company.resize(2, pantry);
  const [steady, failing] = company.list;
  (steady.life.brain as Fake).status = "running";
  const position = { ...failing.life.body.position };
  let time = 0;
  (failing.life.brain as Fake).status = "failed";
  for (let i = 0; i < COMPANION_RETRIES.length; i++) {
    const old = failing.life.brain as Fake;
    assert.equal(company.tend(time), false);
    time += COMPANION_RETRIES[i] - 0.1;
    company.tend(time);
    assert.equal(failing.life.brain, old, "not before its wait");
    time += 0.2;
    assert.equal(company.tend(time), false);
    assert.notEqual(failing.life.brain, old, "a new brain once it has waited");
    assert.equal(old.disposed, 1);
    assert.equal(failing.tries, i + 1);
    assert.deepEqual({ ...failing.life.body.position }, position, "the same fly, where it stood");
    (failing.life.brain as Fake).status = "failed";
  }
  assert.equal(company.tend(time), true, "its tries spent, it is taken off");
  assert.deepEqual(company.list, [steady]);
  assert.equal((brains.at(-1) as Fake).disposed, 1);
  assert.equal(company.lost, 1);
  assert.equal(steady.life.brain, brains[0]);
  assert.equal(brains[0].disposed, 0);
  assert.equal(company.tend(time + 100), false);
  assert.equal(brains.length, 2 + COMPANION_RETRIES.length);
});

test("a companion whose new brain runs keeps it", () => {
  const world = createPicnic();
  const brains: (BrainDriver & { status: BrainDriver["status"] })[] = [];
  const company = new Company(world, () => {
    const brain = { status: "failed" as BrainDriver["status"], error: null, neurons: 0, connections: 0, eyes: null, regionRates: new Float32Array(), state: null, stateAt: 0, tick() {}, dispose() {} };
    brains.push(brain);
    return brain;
  });
  company.resize(1, new Pantry(world));
  company.tend(0);
  company.tend(COMPANION_RETRIES[0]);
  brains[1].status = "running";
  for (let t = 0; t < 600; t += 10) assert.equal(company.tend(COMPANION_RETRIES[0] + t), false);
  assert.equal(company.list.length, 1);
  assert.equal(company.list[0].life.brain, brains[1]);
});
