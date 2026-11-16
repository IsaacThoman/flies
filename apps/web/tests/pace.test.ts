// The picnic's goings-on are occasional and never busy, and happen only while
// nobody is using the remote.

import assert from "node:assert/strict";
import { test } from "node:test";
import { random } from "../src/scene/build.ts";
import { EVERY, FIRST, GAP, HAPPENINGS, Pace } from "../src/places/picnic/pace.ts";
import type { Happening } from "../src/places/picnic/pace.ts";

const STEP = 0.5;

function watch(hours: number, quiet: (t: number) => boolean, can: (h: Happening) => boolean = () => true, seed = 7) {
  const pace = new Pace(random(seed));
  const starts: { t: number; h: Happening }[] = [];
  for (let t = 0; t < hours * 3600; t += STEP) {
    const h = pace.tick(STEP, quiet(t), can);
    if (h) starts.push({ t: t + STEP, h });
  }
  return starts;
}

test("nothing happens while someone is using the remote", () => {
  assert.deepEqual(watch(4, () => false), []);
});

test("left alone, the first thing waits a while, and no two start close together", () => {
  const starts = watch(8, () => true);
  assert.ok(starts.length > 0);
  assert.ok(starts[0].t >= FIRST);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i].t - starts[i - 1].t >= GAP, `${starts[i - 1].h} then ${starts[i].h} ${starts[i].t - starts[i - 1].t} s apart`);
});

test("over hours, each comes about as often as it should, and all together a few times an hour", () => {
  const hours = 48;
  const starts = watch(hours, () => true);
  for (const h of HAPPENINGS) {
    const n = starts.filter((s) => s.h === h).length;
    const expected = (hours * 60) / EVERY[h];
    assert.ok(n > expected * 0.6 && n < expected * 1.4, `${h}: ${n}, expected about ${expected.toFixed(0)}`);
  }
  const perHour = starts.length / hours;
  assert.ok(perHour > 6 && perHour < 16, `${perHour.toFixed(1)} an hour`);
});

test("something that can't happen now (by the time of day or the weather) doesn't, and the rest go on", () => {
  const starts = watch(8, () => true, (h) => h !== "butterfly");
  assert.equal(starts.filter((s) => s.h === "butterfly").length, 0);
  assert.ok(starts.some((s) => s.h === "gust") && starts.some((s) => s.h === "ladybird"));
  // Butterflies only after the first three hours, as if night ended then.
  let t = 0;
  const pace = new Pace(random(5));
  let first = -1;
  for (; t < 8 * 3600 && first < 0; t += STEP) if (pace.tick(STEP, true, (h) => h !== "butterfly" || t > 3 * 3600) === "butterfly") first = t;
  assert.ok(first > 3 * 3600 && first < 3 * 3600 + 3 * EVERY.butterfly * 60, `the first butterfly once it could come: ${(first / 3600).toFixed(2)} h`);
});

test("a minute's press resets the wait for the first", () => {
  // Quiet, then a press every 40 s: never long enough for anything.
  assert.deepEqual(watch(2, (t) => t % 40 > 0.5), []);
});
