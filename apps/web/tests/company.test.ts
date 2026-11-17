import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrainDriver } from "@fly/contracts";
import { Pantry, createPicnic } from "@fly/world";
import { Company, companionSpot } from "../src/company.ts";

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
