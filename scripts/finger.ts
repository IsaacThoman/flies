// Measures how often a fly walks onto a fingertip put down in front of it
// (apps/web/src/tools/finger.ts), on the real connectome, its life frame by
// frame (apps/web/src/life.ts) with the brain in process. For docs/playing.md's
// Finger.
//
//   node scripts/finger.ts [--minutes 5] [--seeds 1,2,3] [--try 60]
//
// On a bare table at 10:00, the fly is set down at the middle facing the
// finger, which lies on the table pointing at it, the edge of its tip 4 mm
// ahead of the fly's head. Each try lasts up to --try seconds: whether the fly
// stands on the finger by then, and when it first did. Then both are set back
// and another try begins, until --minutes of its life have passed.
//
// Its eyes are given a picture of the place each 1/20 s: each facet looks
// along its direction from its head and sees the finger, the table or the sky,
// at the light the game's own eyes measured for each at midday (the finger a
// little darker than the table: apps/web/e2e/finger.e2e.ts, (a)). A browser
// can't seed its brain, so the measured browser runs are in that test.

import { parseArgs } from "node:util";
import { FLY_LENGTH, HEAD_AHEAD, HEAD_UP, MOUTH_AHEAD, Rhythm, SUMMER } from "@fly/body";
import { World } from "@fly/world";
import type { Place, RayHit, Vec3 } from "@fly/world";
import { Life } from "../apps/web/src/life.ts";
import { FINGER_HALF_WIDTH, Finger } from "../apps/web/src/tools/finger.ts";
import { InProcessBrain, brainData } from "./fuzz/brain.ts";

const { values } = parseArgs({
  options: {
    minutes: { type: "string", default: "5" },
    seeds: { type: "string", default: "1,2,3" },
    try: { type: "string", default: "60" },
  },
});
const DT = 1 / 60;
const EYES_EVERY = 1 / 20;
const minutes = Number(values.minutes);
const seeds = values.seeds.split(",").map(Number);
const tryFor = Number(values.try);
const data = brainData();
const BARE: Place = { floor: { kind: "circle", r: 300 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 300 };
/** The light each facet takes in at midday (0 to 1), as the game's eyes see them. */
const TABLE = 0.65;
const SKY = 0.8;
const FINGER = 0.5;

for (const seed of seeds) {
  const brain = new InProcessBrain(data, seed);
  const world = new World(BARE);
  const life = new Life(world, brain);
  const finger = new Finger(world);
  // Ten in the morning: awake.
  life.rhythm = new Rhythm(10, SUMMER);
  const map = brain.eyes!;
  const light = { left: new Float32Array(map.left.directions.length / 3), right: new Float32Array(map.right.directions.length / 3) };
  const head: Vec3 = { x: 0, y: 0, z: 0 };
  const dir: Vec3 = { x: 0, y: 0, z: 0 };
  const hit: RayHit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, solid: -1, t: 0 };
  const see = () => {
    const body = life.body;
    body.point(HEAD_AHEAD, HEAD_UP, 0, head);
    const s = Math.sin(body.yaw);
    const c = Math.cos(body.yaw);
    for (const side of ["left", "right"] as const) {
      const d = map[side].directions;
      const out = light[side];
      for (let k = 0; k < out.length; k++) {
        // The head frame: x to its right, y ahead, z up.
        const rx = d[3 * k];
        const ay = d[3 * k + 1];
        dir.x = -rx * c + ay * s;
        dir.y = d[3 * k + 2];
        dir.z = rx * s + ay * c;
        const met = world.raycast(head, dir, hit, 400);
        out[k] = !met ? (dir.y > 0 ? SKY : TABLE) : finger.isFinger(met.solid) ? FINGER : TABLE;
      }
    }
    life.light = light;
  };
  // In front of it, pointing at it: the tip's edge 4 mm ahead of its head.
  const pointer: Vec3 = { x: 0, y: 0, z: MOUTH_AHEAD * FLY_LENGTH + 4 + FINGER_HALF_WIDTH };
  const bodies = [life.body];
  let eyes = 0;
  const frame = () => {
    finger.update(DT, true, pointer, life.body.position, bodies);
    eyes += DT;
    if (eyes >= EYES_EVERY) {
      eyes = 0;
      see();
    }
    life.stimuli.looming.length = 0;
    life.stimuli.contacts.clear();
    finger.touch(life.body, life.stimuli.contacts);
    life.step(DT, performance.now());
  };
  // Settled with the finger down in front of it.
  finger.update(DT, true, pointer, life.body.position, bodies);
  finger.use();
  for (let t = 0; t < 10; t += DT) {
    frame();
    life.setDown(0, 0, 0);
  }
  const tries: number[] = [];
  for (let lived = 0; lived < minutes * 60; ) {
    life.setDown(0, 0, 0);
    let onAt = -1;
    let t = 0;
    for (; t < tryFor && onAt < 0; t += DT) {
      frame();
      if (finger.isFinger(life.body.surface.solid) && life.body.onFeet) onAt = t;
    }
    lived += t;
    tries.push(onAt);
  }
  const on = tries.filter((t) => t >= 0);
  console.log(`seed ${seed}: walked onto it in ${on.length} of ${tries.length} tries of up to ${tryFor} s${on.length ? ` (after ${on.map((t) => t.toFixed(0)).join(", ")} s)` : ""}; walked ${life.walked.toFixed(0)} mm in all, took off ${life.takeOffs} times`);
}
