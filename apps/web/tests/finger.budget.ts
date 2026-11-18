// The JavaScript the fingertip costs a frame, in M5 Pro CPU time
// (scripts/cpuBudget.ts says why, and why npm test runs this alone): its own
// frame (where the hand has it, what is under it, carrying a fly that stands on
// it) and its touch on each of this device's flies, at the picnic with four
// flies, one of them on it. The flies' own lives are company.budget.ts's. The
// Apple TV has no JIT and pays roughly 16 times this.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Contacts, FlyBody } from "@fly/body";
import { MAX_OWN } from "@fly/net";
import { World, WORLDS } from "@fly/world";
import type { Vec3 } from "@fly/world";
import { CpuMeter, measureBudget, median } from "../../../scripts/cpuBudget.ts";
import { Finger } from "../src/tools/finger.ts";

const DT = 1 / 60;
const FRAMES = 3600;
const SAMPLES = 5;

function rig(references: number[]) {
  const world = new World(WORLDS.picnic);
  const start = world.place.start;
  const finger = new Finger(world);
  const pointer: Vec3 = { x: start.x + 20, y: 0, z: start.z };
  const bodies = Array.from({ length: MAX_OWN }, (_, i) => new FlyBody(world, { x: start.x + i * 4 - 6, z: start.z - 8, yaw: 0 }));
  finger.update(DT, true, pointer, bodies[0].position, bodies);
  finger.use();
  for (let i = 0; i < 120; i++) finger.update(DT, true, pointer, bodies[0].position, bodies);
  // One stands on it, toward its knuckle.
  bodies[1].place(finger.tip.x + Math.sin(finger.yaw) * 12, finger.tip.z + Math.cos(finger.yaw) * 12, 0);
  finger.use();
  let t = 0;
  let touched = 0;
  const contacts = new Contacts();
  // The hand going round in a slow circle, the finger lifted and carrying it.
  const frame = () => {
    t += DT;
    pointer.x = start.x + 20 + Math.cos(t * 0.5) * 15;
    pointer.z = start.z + Math.sin(t * 0.5) * 15;
    finger.update(DT, true, pointer, bodies[0].position, bodies);
    contacts.clear();
    for (const body of bodies) finger.touch(body, contacts);
    touched += contacts.count;
  };
  for (let i = 0; i < 600; i++) frame();
  return {
    sample() {
      const meter = new CpuMeter();
      for (let i = 0; i < FRAMES; i++) {
        frame();
        if (i % 600 === 599) meter.lap();
      }
      references.push(...meter.references);
      return { ms: meter.ms / FRAMES, raw: meter.rawMs / FRAMES };
    },
    carried: () => finger.carried,
    touched: () => touched,
  };
}

test("the fingertip, carrying a fly with three more about, costs little JavaScript a frame", async (t) => {
  const measured = await measureBudget(t, () => {
    const references: number[] = [];
    const r = rig(references);
    const samples = Array.from({ length: SAMPLES }, () => r.sample());
    return { value: { ms: median(samples.map((s) => s.ms)), raw: median(samples.map((s) => s.raw)), carried: r.carried() }, references, samples: [samples.map((s) => s.ms)] };
  });
  if (!measured) return;
  const { ms, raw, carried } = measured;
  console.log(`  the fingertip: ${(ms * 1000).toFixed(1)} M5 Pro CPU µs a frame (${(raw * 1000).toFixed(1)} here), carrying ${carried}`);
  assert.equal(carried, 1, "it carries the fly on it all the while");
  // 1.1 µs on an M5 Pro in Node 26: about 18 µs a frame on the Apple TV.
  assert.ok(ms < 0.005, `${(ms * 1000).toFixed(1)} M5 Pro CPU µs a frame; budget 5`);
});
