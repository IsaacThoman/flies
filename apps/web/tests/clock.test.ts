// The places' clocks: where their hands point at a given time, in any time
// zone, moving on smoothly with no jumps but at twelve.

import assert from "node:assert/strict";
import { test } from "node:test";
import { WallClock, handAngles } from "../src/scene/clock.ts";

const TAU = Math.PI * 2;
const near = (actual: number, expected: number, what: string) => assert.ok(Math.abs(actual - expected) < 1e-6, `${what}: ${actual} != ${expected}`);
/** A UTC time today, ms. */
const utc = (h: number, m: number, s = 0, ms = 0) => Date.UTC(2026, 10, 16, h, m, s, ms);

test("the hands point where a clock's do at given times", () => {
  const cases: [string, number, number, number, number][] = [
    // time, ms, hour, minute, second
    ["midnight", utc(0, 0), 0, 0, 0],
    ["noon", utc(12, 0), 0, 0, 0],
    ["three o'clock", utc(3, 0), TAU / 4, 0, 0],
    ["quarter to four in the afternoon", utc(15, 45), (3.75 / 12) * TAU, 0.75 * TAU, 0],
    ["half past six", utc(6, 30), (6.5 / 12) * TAU, TAU / 2, 0],
    ["ten past ten and thirty seconds", utc(10, 10, 30), ((10 + 10 / 60 + 30 / 3600) / 12) * TAU, (10.5 / 60) * TAU, TAU / 2],
    ["a quarter second into 11:59:59", utc(23, 59, 59, 250), ((11 + 59 / 60 + 59.25 / 3600) / 12) * TAU, ((59 + 59.25 / 60) / 60) * TAU, (59.25 / 60) * TAU],
  ];
  for (const [what, ms, hour, minute, second] of cases) {
    const a = handAngles(ms, 0);
    near(a.hour, hour, `${what}, hour hand`);
    near(a.minute, minute, `${what}, minute hand`);
    near(a.second, second, `${what}, second hand`);
  }
});

test("the hands tell the local time: the zone's offset is taken off UTC", () => {
  // 14:45 UTC is 15:45 an hour east of Greenwich (offset -60), and 9:45 five hours west (offset 300).
  const east = handAngles(utc(14, 45), -60);
  near(east.hour, (3.75 / 12) * TAU, "an hour east, hour hand");
  near(east.minute, 0.75 * TAU, "an hour east, minute hand");
  const west = handAngles(utc(14, 45), 300);
  near(west.hour, (9.75 / 12) * TAU, "five hours west, hour hand");
  // Half-hour zones move the minute hand too.
  const india = handAngles(utc(14, 45), -330);
  near(india.hour, (8.25 / 12) * TAU, "five and a half hours east, hour hand");
  near(india.minute, 0.25 * TAU, "five and a half hours east, minute hand");
});

test("the hands move on smoothly, the second hand sweeping, and jump only from twelve back to twelve", () => {
  const start = utc(11, 58);
  let last = handAngles(start, 0);
  for (let ms = start + 50; ms < utc(12, 2); ms += 50) {
    const a = handAngles(ms, 0);
    for (const [hand, perRound] of [["hour", 43200], ["minute", 3600], ["second", 60]] as const) {
      let step = a[hand] - last[hand];
      if (step < -Math.PI) step += TAU;
      near(step, (0.05 / perRound) * TAU, `${hand} hand at ${new Date(ms).toISOString()}`);
    }
    last = a;
  }
});

test("a wall clock keeps its uniform to the time it is given", () => {
  const clock = new WallClock();
  const ms = utc(10, 10, 30);
  clock.update(ms);
  const offset = new Date(ms).getTimezoneOffset();
  const a = handAngles(ms, offset);
  near(clock.hands.value.x, a.hour, "hour");
  near(clock.hands.value.y, a.minute, "minute");
  near(clock.hands.value.z, a.second, "second");
});
