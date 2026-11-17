// The fingertip slid at a fly whose brain has no eyes, on the real connectome
// (skipped without it: npm run brain:fetch): its tip is something that can
// loom (packages/body/src/senses.ts), as the ball is. Held where it stands
// as the finger comes, a fast approach looms fully and a slow one hardly; what
// the giant fibre makes of it is the brain's, printed. With the eyes open the eyes see the finger instead
// (apps/web/e2e/finger.e2e.ts).

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { ESCAPE_REARM, FLY_LENGTH, MOUTH_AHEAD } from "@fly/body";
import { World } from "@fly/world";
import type { Place, Vec3 } from "@fly/world";
import { Life } from "../src/life.ts";
import { FINGER_HALF_WIDTH, Finger } from "../src/tools/finger.ts";
import { DEFAULT_CONNECTOME_PATH } from "../../../packages/brain/src/node.ts";
import { InProcessBrain, brainData } from "../../../scripts/fuzz/brain.ts";

const skip = existsSync(DEFAULT_CONNECTOME_PATH) ? false : "run npm run brain:fetch for the real brain";
const DT = 1 / 60;
const bare: Place = { floor: { kind: "circle", r: 300 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 300 };

test("with its eyes shut, a finger slid at it fast looms fully, and slid slowly hardly at all", { skip }, () => {
  const brain = new InProcessBrain(brainData(), 1);
  const world = new World(bare);
  const life = new Life(world, brain);
  const finger = new Finger(world);
  const bodies = [life.body];
  // The tip's edge stops 4 mm short of its head; it comes from 70 mm ahead.
  const near = MOUTH_AHEAD * FLY_LENGTH + 4 + FINGER_HALF_WIDTH;
  const pointer: Vec3 = { x: 0, y: 0, z: 70 };
  const frame = () => {
    finger.update(DT, true, pointer, life.body.position, bodies);
    life.stimuli.looming.length = 0;
    life.stimuli.looming.push(finger.looming);
    life.stimuli.threat = finger.threat;
    life.stimuli.contacts.clear();
    finger.touch(life.body, life.stimuli.contacts);
    life.step(DT, performance.now());
  };
  finger.update(DT, true, pointer, life.body.position, bodies);
  finger.use();
  const approach = (speed: number) => {
    pointer.z = 70;
    // Ready: on its feet, its giant fibre quiet after any take-off before (bounded: the brain's choice), then held there a while.
    for (let wait = 0; wait < 10 && !(life.body.onFeet && (brain.state?.command.escape ?? 1) < ESCAPE_REARM); wait += DT) frame();
    for (let t = 0; t < 4; t += DT) {
      frame();
      life.setDown(0, 0, 0);
    }
    // Held where it stands as it comes: a fly walking at the finger would loom it by its own walking.
    let loom = 0;
    let escape = 0;
    for (let t = 0; t < 70 / speed + 0.5; t += DT) {
      pointer.z = Math.max(near, pointer.z - speed * DT);
      frame();
      life.setDown(0, 0, 0);
      loom = Math.max(loom, life.sensed.loomLeft, life.sensed.loomRight);
      escape = Math.max(escape, brain.state?.command.escape ?? 0);
    }
    return { loom, escape };
  };
  // Slow first, so nothing fast before it is still in its giant fibre; then each fast one after its giant fibre has quietened.
  const slow = [approach(15), approach(15), approach(15)];
  const fast = [approach(600), approach(600), approach(600)];
  const say = (r: { loom: number; escape: number }) => `loom ${r.loom.toFixed(2)} escape ${r.escape.toFixed(2)}`;
  console.log(`  fast: ${fast.map(say).join("; ")}\n  slow: ${slow.map(say).join("; ")}`);
  for (const r of fast) assert.ok(r.loom > 0.9, `fast: ${say(r)}`);
  for (const r of slow) assert.ok(r.loom < 0.3, `slow: ${say(r)}`);
});
