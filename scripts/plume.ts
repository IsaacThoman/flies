// Gate 4 (docs/olfaction-gates-protocol.md, Part D): does smelling food help
// the fly find it? The real brain, Life, its senses and body, headless, as
// scripts/ethogram.ts runs them, with odour on and off in otherwise identical
// runs.
//
//   node scripts/plume.ts --seeds 51,52 --out <dir>      one JSON per run
//   node scripts/plume.ts --reduce --out <dir>           successes and the test
//
// The ethogram's 43 mm arena, eyes open on uniform grey, the clock at 06:00.
// 30 s of settling with no odour, then the fly is set down at the middle,
// facing across the wind, and lives 180 s. A food patch (2 mm, sweet 1) lies
// 12 mm upwind and 5 mm to the side it faces away from; mirrored, to the
// other side. With odour on, the patch gives off the five odorants at 1 each
// in the field of packages/world/src/odor.ts (STILL_DRAUGHT, blowing along +x
// from the patch to the fly). Success: the head within 3 mm (r0 + 1) of the
// patch's middle at any time in the 180 s.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Rhythm } from "@fly/body";
import { OdorField, STILL_DRAUGHT, World } from "@fly/world";
import type { Place } from "@fly/world";
import { HEAD_AHEAD, HEAD_UP } from "../packages/body/src/motion.ts";
import { Life } from "../apps/web/src/life.ts";
import { InProcessBrain, brainData } from "./fuzz/brain.ts";
import { ARENA } from "./ethogram.ts";

const { values } = parseArgs({ options: { seeds: { type: "string", default: "" }, out: { type: "string" }, reduce: { type: "boolean", default: false } } });
assert(values.out);
const out = values.out;
const DT = 0.01;
const SETTLE = 30;
const SECONDS = 180;
const R0 = 2;
const REACH = R0 + 1;
const UPWIND = 12;
const ASIDE = 5;
type Run = { seed: number; side: 1 | -1; odor: boolean; found: boolean; time: number | null; closest: number; walked: number; ate: number };

function live(data: ArrayBuffer, seed: number, side: 1 | -1, odor: boolean): Run {
  const patch = { x: -UPWIND, z: side * ASIDE };
  const place: Place = { ...ARENA, patches: [{ name: "fermenting fruit", x: patch.x, z: patch.z, r: R0, sweet: 1 }] };
  const driver = new InProcessBrain(data, seed);
  const life = new Life(new World(place), driver);
  life.rhythm = new Rhythm(6, { sunrise: 6, sunset: 18 });
  if (driver.eyes) life.light = { left: new Float32Array(driver.eyes.left.directions.length / 3).fill(0.5), right: new Float32Array(driver.eyes.right.directions.length / 3).fill(0.5) };
  const step = () => {
    life.rhythm!.setTime(6);
    life.step(DT, performance.now());
  };
  for (let t = 0; t < SETTLE; t += DT) step();
  // Set down at the middle, facing across the wind away from the patch's side: (sin yaw, 0, cos yaw) is ahead.
  const body = life.body;
  body.position.x = 0;
  body.position.z = 0;
  body.position.y = life.world.heightAt(0, 0, 0);
  body.velocity.x = body.velocity.y = body.velocity.z = 0;
  body.yaw = side === 1 ? Math.PI : 0;
  const food = life.pantry.foods[0];
  if (odor) life.odor = new OdorField([{ x: food.x, y: food.y, z: food.z, r: R0, emits: [1, 1, 1, 1, 1] }], STILL_DRAUGHT);
  const eatenBefore = life.eaten;
  const head = { x: 0, y: 0, z: 0 };
  let found = false;
  let time: number | null = null;
  let closest = Infinity;
  const walkedBefore = life.walked;
  for (let t = 0; t < SECONDS; t += DT) {
    step();
    body.point(HEAD_AHEAD, HEAD_UP, 0, head);
    const d = Math.hypot(head.x - patch.x, head.z - patch.z);
    closest = Math.min(closest, d);
    if (!found && d <= REACH) {
      found = true;
      time = t + DT;
    }
  }
  driver.dispose();
  return { seed, side, odor, found, time, closest, walked: life.walked - walkedBefore, ate: life.eaten - eatenBefore };
}

if (!values.reduce) {
  const data = brainData();
  mkdirSync(out, { recursive: true });
  for (const seed of values.seeds.split(",").filter(Boolean).map(Number)) {
    for (const side of [1, -1] as const) {
      for (const odor of [false, true]) {
        const path = join(out, `${seed}-${side === 1 ? "left" : "right"}-${odor ? "on" : "off"}.json`);
        if (existsSync(path)) continue;
        console.error(seed, side, odor);
        const run = live(data, seed, side, odor);
        writeFileSync(`${path}.part`, JSON.stringify(run));
        renameSync(`${path}.part`, path);
      }
    }
  }
} else {
  const runs: Run[] = readdirSync(out).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(out, f), "utf8")));
  assert.equal(runs.length, 80, "Part D has 80 runs: seeds 51-70, both layouts, odour on and off");
  // Wilson's 95% interval for a proportion.
  const wilson = (k: number, n: number) => {
    const z = 1.959963984540054;
    const p = k / n;
    const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
    const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
    return [centre - half, centre + half];
  };
  const on = runs.filter((r) => r.odor);
  const off = runs.filter((r) => !r.odor);
  let onlyOn = 0;
  let onlyOff = 0;
  for (const r of on) {
    const pair = off.find((o) => o.seed === r.seed && o.side === r.side)!;
    if (r.found && !pair.found) onlyOn++;
    if (!r.found && pair.found) onlyOff++;
  }
  // Exact one-sided McNemar: P(X >= onlyOn) with X ~ Binomial(onlyOn + onlyOff, 1/2).
  const n = onlyOn + onlyOff;
  let p = 0;
  const choose = (a: number, b: number) => {
    let c = 1;
    for (let k = 1; k <= b; k++) c = (c * (a - b + k)) / k;
    return c;
  };
  for (let k = onlyOn; k <= n; k++) p += choose(n, k) / 2 ** n;
  if (n === 0) p = 1;
  const found = (rs: Run[]) => rs.filter((r) => r.found).length;
  const median = (x: number[]) => (x.length ? x.toSorted((a, b) => a - b)[Math.floor((x.length - 1) / 2)] : null);
  console.log(
    JSON.stringify(
      {
        on: { found: found(on), of: on.length, wilson: wilson(found(on), on.length), medianTime: median(on.filter((r) => r.found).map((r) => r.time!)) },
        off: { found: found(off), of: off.length, wilson: wilson(found(off), off.length), medianTime: median(off.filter((r) => r.found).map((r) => r.time!)) },
        discordant: { onlyOn, onlyOff },
        mcnemarOneSidedP: p,
        helps: found(on) > found(off) && p < 0.05,
        runs: runs.toSorted((a, b) => a.seed - b.seed || a.side - b.side || Number(a.odor) - Number(b.odor)),
      },
      null,
      2,
    ),
  );
}
