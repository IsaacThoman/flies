// The whole chain from the Swoop tool to a flight, on the real connectome
// (skipped without it: npm run brain:fetch): the ball on its real path, what
// the fly's senses make of it, the brain's giant fiber, the body's take-off,
// and the flight the tarsal reflex makes of it (packages/body/src/behavior.ts).
// Whether the fly goes is the brain's choice, so each test throws a bounded
// number of times and counts. It also holds the fly's life with its eyes open
// to a budget, in M5 Pro CPU time, so npm test runs it alone
// (scripts/cpuBudget.ts says why).

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { ESCAPE_ON, ESCAPE_REARM, HEAD_AHEAD, HEAD_UP } from "@fly/body";
import { BALL_RADIUS, World } from "@fly/world";
import type { Place, Vec3 } from "@fly/world";
import { CpuMeter, measureBudget } from "../../../scripts/cpuBudget.ts";
import { Hands, TOOLS } from "../src/tools/hands.ts";
import { Life } from "../src/life.ts";
import { DEFAULT_CONNECTOME_PATH } from "../../../packages/brain/src/node.ts";
import { InProcessBrain, brainData } from "../../../scripts/fuzz/brain.ts";

const skip = existsSync(DEFAULT_CONNECTOME_PATH) ? false : "run npm run brain:fetch for the real brain";
const data = skip ? null : brainData();
const DT = 1 / 60;
const THROWS = 8;
const bare: Place = { floor: { kind: "rect", hx: 500, hz: 500 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 300 };

/**
 * What the eyes see at midday, measured in the game's own eyes picture (right
 * eye, the fly at the picnic): the table and sky round the fly at 0.65, the
 * ball's dark stripes at 0.04. Here the ball is drawn as that disc on that
 * ground, from where it really is.
 */
const GROUND = 0.65;
const BALL = 0.04;

/**
 * A throw: whether it took off and how hard the giant fiber fired; and if it flew, how long, how far along its way and how
 * high, whether it came down on its feet, and how hard its wings beat on its feet after (the brain's `wingbeat`, on average).
 */
type Throw = { tookOff: boolean; escape: number; air: number; distance: number; top: number; landed: boolean; lowest: number; beatAfter: number };

/** Throws the ball at the fly until `throws` have flown, the eyes open (seeing it) or shut (the hand-wired loom), with a lap of `meter` every simulated second. */
function swoops(eyes: "open" | "shut", seed: number, throws = THROWS, meter?: CpuMeter) {
  const brain = new InProcessBrain(data!, seed);
  const world = new World(bare);
  const life = new Life(world, brain);
  const hands = new Hands(world);
  hands.tool = TOOLS.findIndex((t) => t.id === "swoop");
  const map = brain.eyes!;
  const light = { left: new Float32Array(map.left.directions.length / 3), right: new Float32Array(map.right.directions.length / 3) };
  const eye: Vec3 = { x: 0, y: 5, z: -10 };
  const fly = { position: life.body.position, yaw: 0, onFeet: true };
  let time = 0;
  let frames = 0;

  const frame = (use: boolean) => {
    fly.yaw = life.body.yaw;
    fly.onFeet = life.body.onFeet;
    hands.update(DT, { use, holding: use, eye }, fly, life.pantry);
    life.stimuli.looming.length = 0;
    life.stimuli.looming.push(hands.looming[0]);
    if (eyes === "open") {
      see(life, hands, map, light);
      life.light = light;
    }
    life.step(DT, performance.now());
    time += DT;
    if (meter && ++frames % 60 === 0) meter.lap();
  };

  const results: Throw[] = [];
  // Settled: a second at rest first.
  for (let t = 0; t < 1; t += DT) frame(false);
  for (let n = 0; n < throws; n++) {
    // Ready: on its feet, its giant fiber quiet, as long as that takes (bounded: the brain's choice).
    for (let wait = 0; wait < 10 && !(life.body.onFeet && (brain.state?.command.escape ?? 1) < ESCAPE_REARM); wait += DT) frame(false);
    // Back in the middle, facing as it was: a few flights carry it to the floor's edge, where its antennae press on the
    // world's end as on a wall, and that (a push on an antenna) would be measured instead of the swoop.
    life.body.place(0, 0, life.body.yaw);
    for (let t = 0; t < 1; t += DT) frame(false);
    const before = life.takeOffs;
    const from = { ...life.body.position };
    const last = { ...from };
    const result: Throw = { tookOff: false, escape: 0, air: 0, distance: 0, top: 0, landed: false, lowest: Infinity, beatAfter: 0 };
    const watch = () => {
      result.escape = Math.max(result.escape, brain.state?.command.escape ?? 0);
      if (life.body.onFeet) return;
      result.air += DT;
      result.distance += Math.hypot(life.body.position.x - last.x, life.body.position.z - last.z);
      last.x = life.body.position.x;
      last.z = life.body.position.z;
      result.top = Math.max(result.top, life.body.position.y - from.y);
      result.lowest = Math.min(result.lowest, life.body.position.y);
    };
    frame(true);
    while (hands.ball.active) {
      frame(false);
      watch();
    }
    // Down again (bounded: a flight the brain keeps up lasts as long as it does), and past the refractory time before the next.
    for (let t = 0; t < 8 && !life.body.onFeet; t += DT) {
      frame(false);
      watch();
      result.landed ||= life.body.events.landed;
    }
    result.landed ||= result.air > 0 && life.body.onFeet;
    let frames = 0;
    for (let t = 0; t < 1.6; t += DT, frames++) {
      frame(false);
      result.beatAfter += life.senses.senses.wingbeat;
    }
    result.beatAfter /= frames;
    result.tookOff = life.takeOffs > before;
    results.push(result);
  }
  return { results, time };
}

/** Draws the ball onto every facet as the eyes would see it from the fly's head: a dark disc its true size and direction on a bright ground. */
function see(life: Life, hands: Hands, map: NonNullable<InProcessBrain["eyes"]>, light: { left: Float32Array; right: Float32Array }) {
  const body = life.body;
  const head = body.point(HEAD_AHEAD, HEAD_UP, 0, scratch);
  const ball = hands.ball;
  let hx = 0;
  let hy = 0;
  let hz = 0;
  let cosRadius = 2;
  if (ball.active) {
    const dx = ball.position.x - head.x;
    const dy = ball.position.y - head.y;
    const dz = ball.position.z - head.z;
    const d = Math.hypot(dx, dy, dz);
    const s = Math.sin(body.yaw);
    const c = Math.cos(body.yaw);
    // The head frame: x to its right, y ahead, z up.
    hx = (-dx * c + dz * s) / d;
    hy = (dx * s + dz * c) / d;
    hz = dy / d;
    cosRadius = Math.cos(Math.asin(Math.min(1, BALL_RADIUS / d)));
  }
  for (const side of ["left", "right"] as const) {
    const dir = map[side].directions;
    const out = light[side];
    for (let k = 0; k < out.length; k++) out[k] = dir[3 * k] * hx + dir[3 * k + 1] * hy + dir[3 * k + 2] * hz >= cosRadius ? BALL : GROUND;
  }
}
const scratch: Vec3 = { x: 0, y: 0, z: 0 };

const summary = (results: Throw[]) => results.map((r) => `${r.escape.toFixed(2)}${r.tookOff ? ` flew ${r.air.toFixed(1)} s ${r.distance.toFixed(0)} mm` : ""}`).join(", ");

test("the swoop seen through the brain's own eyes fires the giant fiber and the fly takes off and flies, in at least 6 of 8 throws", { skip }, async (t) => {
  const measured = await measureBudget(t, () => {
    const meter = new CpuMeter();
    const { results, time } = swoops("open", 1, THROWS, meter);
    meter.lap();
    const cpu = meter.ms / 1000;
    const off = results.filter((r) => r.tookOff).length;
    console.log(`  eyes open: ${off} of ${results.length} took off (escape peaks: ${summary(results)}); ${time.toFixed(0)} s of its life in ${cpu.toFixed(1)} M5 Pro CPU s (${(meter.rawMs / 1000).toFixed(1)} here)`);
    // Seed 1 takes off from 7 of 8 (escape 0.44 to 0.72; the eighth peaks at 0.30), each a flight of 1.5 to 1.6 s and 375 to 402 mm along its way.
    assert.ok(off >= 6, `${off} of ${results.length} took off: ${summary(results)}`);
    // Every throw that crossed the line took off: the body did what the giant fiber said.
    for (const r of results) if (r.escape >= ESCAPE_ON + 0.02) assert.ok(r.tookOff, `escape reached ${r.escape.toFixed(2)} and it stayed: ${summary(results)}`);
    // And every take-off is a flight (the tarsal reflex: packages/body/src/behavior.ts): up for over a second, away, and down safely on its feet.
    for (const r of results.filter((r) => r.tookOff)) {
      assert.ok(r.air >= 1, `in the air for ${r.air.toFixed(2)} s: ${summary(results)}`);
      assert.ok(r.distance > 100, `flew ${r.distance.toFixed(0)} mm: ${summary(results)}`);
      assert.ok(r.top > 10, `rose ${r.top.toFixed(0)} mm`);
      assert.ok(r.landed, `didn't land: ${summary(results)}`);
      assert.ok(r.lowest >= 0, "never below the floor");
      // The wings' own sensors don't keep them going once it is down (measured, seeds 1 to 4: at most 0.03 at any moment).
      assert.ok(r.beatAfter < 0.05, `its wings beat at ${r.beatAfter.toFixed(2)} after it landed`);
    }
    return { value: { cpu, time }, references: meter.references };
  });
  if (!measured) return;
  const { cpu, time } = measured;
  // The fly's life with its eyes open to the swoop takes a fifth of an M5 Pro CPU second per simulated second.
  assert.ok(cpu < 0.34 * time, `${cpu.toFixed(1)} M5 Pro CPU s for ${time.toFixed(0)} s; budget ${(0.34 * time).toFixed(1)}`);
});

test("with the eyes shut, the hand-wired loom of the swoop drives the giant fiber past take-off almost every throw", { skip }, () => {
  const { results } = swoops("shut", 1, 6);
  const off = results.filter((r) => r.tookOff).length;
  console.log(`  eyes shut: ${off} of ${results.length} took off (escape peaks: ${summary(results)})`);
  assert.ok(off >= results.length - 1, `${off} of ${results.length} took off: ${summary(results)}`);
});
