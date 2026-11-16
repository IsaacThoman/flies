// The whole chain from the Swoop tool to a take-off, on the real connectome
// (skipped without it: npm run brain:fetch): the ball on its real path, what
// the fly's senses make of it, the brain's giant fiber, and the body's
// take-off. Whether the fly goes is the brain's choice, so each test throws a
// bounded number of times and counts.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { ESCAPE_ON, ESCAPE_REARM, HEAD_AHEAD, HEAD_UP } from "@fly/body";
import { BALL_RADIUS, World } from "@fly/world";
import type { Place, Vec3 } from "@fly/world";
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

type Throw = { tookOff: boolean; escape: number };

/** Throws the ball at the fly until `throws` have flown, the eyes open (seeing it) or shut (the hand-wired loom). */
function swoops(eyes: "open" | "shut", seed: number, throws = THROWS) {
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

  const frame = (use: boolean) => {
    fly.yaw = life.body.yaw;
    fly.onFeet = life.body.onFeet;
    hands.update(DT, { use, holding: use, eye }, fly, life.pantry);
    life.stimuli.looming.length = 0;
    life.stimuli.looming.push(hands.looming[0]);
    life.stimuli.threat = hands.ball.active ? hands.ball.position : null;
    if (eyes === "open") {
      see(life, hands, map, light);
      life.light = light;
    }
    life.step(DT, performance.now());
    time += DT;
  };

  const results: Throw[] = [];
  // Settled: a second at rest first.
  for (let t = 0; t < 1; t += DT) frame(false);
  for (let n = 0; n < throws; n++) {
    // Ready: on its feet, its giant fiber quiet, as long as that takes (bounded: the brain's choice).
    for (let wait = 0; wait < 10 && !(life.body.onFeet && (brain.state?.command.escape ?? 1) < ESCAPE_REARM); wait += DT) frame(false);
    const before = life.takeOffs;
    let escape = 0;
    frame(true);
    while (hands.ball.active) {
      frame(false);
      escape = Math.max(escape, brain.state?.command.escape ?? 0);
    }
    // Past the refractory time before the next.
    for (let t = 0; t < 1.6; t += DT) frame(false);
    results.push({ tookOff: life.takeOffs > before, escape });
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

const summary = (results: Throw[]) => results.map((r) => `${r.escape.toFixed(2)}${r.tookOff ? " off" : ""}`).join(", ");

test("the swoop seen through the brain's own eyes fires the giant fiber and the fly takes off, in at least 7 of 8 throws", { skip }, () => {
  const started = process.cpuUsage();
  const { results, time } = swoops("open", 1);
  const used = process.cpuUsage(started);
  const cpu = (used.user + used.system) / 1e6;
  const off = results.filter((r) => r.tookOff).length;
  console.log(`  eyes open: ${off} of ${results.length} took off (escape peaks: ${summary(results)}); ${time.toFixed(0)} s of its life in ${cpu.toFixed(1)} CPU s`);
  // Seeds 1 to 3 take off in all 8 (escape 0.44 to 0.68); 6 of seed 1's peaks reach the old line, 0.5.
  assert.ok(off >= 7, `${off} of ${results.length} took off: ${summary(results)}`);
  // Every throw that crossed the line took off: the body did what the giant fiber said.
  for (const r of results) if (r.escape >= ESCAPE_ON + 0.02) assert.ok(r.tookOff, `escape reached ${r.escape.toFixed(2)} and it stayed: ${summary(results)}`);
  // The brain takes about a fifth of a CPU second per simulated second with the eyes open (packages/brain/README.md); five times that is a fault.
  assert.ok(cpu < time, `${cpu.toFixed(1)} CPU s for ${time.toFixed(0)} s`);
});

test("with the eyes shut, the hand-wired loom of the swoop drives the giant fiber past take-off almost every throw", { skip }, () => {
  const { results } = swoops("shut", 1, 6);
  const off = results.filter((r) => r.tookOff).length;
  console.log(`  eyes shut: ${off} of ${results.length} took off (escape peaks: ${summary(results)})`);
  assert.ok(off >= results.length - 1, `${off} of ${results.length} took off: ${summary(results)}`);
});
