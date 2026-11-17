import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { PACES, RHYTHM, Rhythm, SUMMER, clockAt, pressureAfter, usualPressure } from "../src/rhythm.ts";

const at = (hours: number, sun = SUMMER) => clockAt(hours, sun);

test("the morning oscillator is up at dawn and the evening one at dusk, each from three hours before", () => {
  assert.equal(at(SUMMER.sunrise).morning, 1);
  assert.equal(at(SUMMER.sunset).evening, 1);
  assert.ok(at(SUMMER.sunrise - 2).morning > 0, "anticipating dawn");
  assert.ok(at(SUMMER.sunset - 2).evening > 0, "anticipating dusk");
  assert.equal(at(SUMMER.sunrise - PACES.natural.spread).morning, 0);
  assert.equal(at(13).morning, 0);
  assert.equal(at(13).evening, 0);
});

test("the clock pushes toward sleep at night, less at midday, and not at its peaks", () => {
  assert.equal(at(1).sleep, 1);
  assert.equal(at(13).sleep, PACES.natural.daylight);
  assert.equal(at(SUMMER.sunrise).sleep, 0);
  assert.equal(at(SUMMER.sunset).sleep, 0);
  for (let h = 0; h < 24; h += 0.25) {
    const c = at(h);
    for (const v of [c.morning, c.evening, c.sleep]) assert.ok(v >= 0 && v <= 1, `${h}: ${v}`);
  }
});

test("it keeps to the real sun: a winter day's peaks move with its sunrise and sunset", () => {
  const winter = { sunrise: 8, sunset: 16.5 };
  assert.equal(at(8, winter).morning, 1);
  assert.equal(at(16.5, winter).evening, 1);
  assert.equal(at(4.5, winter).morning, 0);
  // Late in the summer evening it is night by winter's sun.
  assert.equal(at(21, winter).sleep, 1);
});

test("a lively day has longer peaks and a lighter push toward sleep, day and night", () => {
  const lively = (hours: number) => clockAt(hours, SUMMER, undefined, "lively");
  for (let h = 0; h < 24; h += 0.25) {
    const [l, n] = [lively(h), at(h)];
    assert.ok(l.sleep <= n.sleep, `${h}: ${l.sleep} > ${n.sleep}`);
    assert.ok(Math.max(l.morning, l.evening) >= Math.max(n.morning, n.evening), `${h}`);
  }
  assert.equal(lively(13).sleep, PACES.lively.daylight);
  assert.equal(lively(1).sleep, PACES.lively.night);
  assert.ok(lively(SUMMER.sunrise - PACES.lively.spread + 0.5).morning > 0, "anticipating dawn from further off");
  // A winter's day is as long as a summer's: its evening peak at a summer dusk, not at a winter one.
  const winter = { sunrise: 7.5, sunset: 16.5 };
  assert.equal(clockAt(SUMMER.sunset, winter, undefined, "lively").evening, 1);
  assert.equal(clockAt(SUMMER.sunrise, winter, undefined, "lively").morning, 1);
  assert.equal(clockAt(18, winter, undefined, "lively").sleep, clockAt(18, SUMMER, undefined, "lively").sleep);
  // But not shorter than the real one.
  const midsummer = { sunrise: 4, sunset: 22.5 };
  assert.equal(clockAt(22.5, midsummer, undefined, "lively").evening, 1);
  // A fly that sleeps less by day comes to the evening sleepier.
  assert.ok(usualPressure(SUMMER.sunset, SUMMER, "lively") > usualPressure(SUMMER.sunset, SUMMER));
});

test("a fly's clock takes a new pace when it is put right, as sleepy as that pace leaves it at the hour", () => {
  const r = new Rhythm(13, SUMMER, 0.3);
  assert.equal(r.pace, "natural");
  r.setTime(13, SUMMER);
  assert.equal(r.pressure, 0.3, "the same pace keeps its need for sleep");
  r.setTime(13, SUMMER, "lively");
  assert.equal(r.pace, "lively");
  assert.equal(r.clock.sleep, PACES.lively.daylight);
  assert.equal(r.pressure, usualPressure(13, SUMMER, "lively"));
  assert.equal(r.felt, r.pressure * PACES.lively.need);
  r.step(1, true);
  assert.equal(r.clock.sleep, PACES.lively.daylight, "and keeps it as it runs on");
  assert.equal(new Rhythm(13, SUMMER, undefined, "lively").pressure, usualPressure(13, SUMMER, "lively"));
});

test("sleep pressure builds while awake and discharges faster while asleep", () => {
  const hour = 3600;
  const built = pressureAfter(0, RHYTHM.build * hour, false);
  assert.ok(Math.abs(built - (1 - Math.exp(-1))) < 1e-12);
  assert.ok(pressureAfter(0.5, hour, false) > 0.5);
  assert.ok(pressureAfter(0.5, hour, true) < 0.5);
  assert.ok(0.5 - pressureAfter(0.5, hour, true) > pressureAfter(0.5, hour, false) - 0.5, "faster down than up");
  // A fly left to itself is sleepier after the evening's wakefulness than before dawn, after the night's sleep.
  assert.ok(usualPressure(SUMMER.sunset + 2, SUMMER) > 2 * usualPressure(SUMMER.sunrise - 2, SUMMER));
});

test("five minutes still is sleep; stillness deepens it; moving ends it", () => {
  const r = new Rhythm(1, SUMMER, 0.5);
  const step = 0.5;
  for (let t = 0; t < RHYTHM.still - 1; t += step) r.step(step, false);
  assert.equal(r.asleep, false);
  const before = r.depth;
  assert.ok(before > 0.5, "most of the way down by the time it counts as sleep");
  for (let t = 0; t < 2; t += step) r.step(step, false);
  assert.equal(r.asleep, true);
  assert.equal(r.bouts, 1);
  for (let t = 0; t < 600; t += step) r.step(step, false);
  assert.ok(r.depth > before && r.depth < 1);
  assert.ok(r.pressure < 0.5, "discharging");
  const slept = r.slept;
  assert.ok(slept > 600 && slept < 603);
  r.step(step, true);
  assert.equal(r.asleep, false);
  assert.equal(r.depth, 0);
  const awake = r.pressure;
  r.step(60, true);
  assert.ok(r.pressure > awake, "building again");
  assert.equal(r.slept, slept);
});

test("the clock runs on between settings and is put right by them", () => {
  const r = new Rhythm(23.9, SUMMER, 0);
  r.step(0.2 * 3600, false);
  assert.ok(Math.abs(r.hours - 0.1) < 1e-9, `${r.hours}`);
  r.setTime(SUMMER.sunrise);
  assert.equal(r.clock.morning, 1);
  r.setTime(12, { sunrise: 12, sunset: 20 });
  assert.equal(r.clock.morning, 1);
});

test("a step allocates nothing but boxed numbers, even without a JIT", () => {
  const probe = fileURLToPath(new URL("rhythm-allocation-probe.ts", import.meta.url));
  const result = spawnSync(process.execPath, ["--no-opt", "--no-maglev", "--no-sparkplug", probe], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const { numberSize, sizes } = JSON.parse(result.stdout) as { numberSize: number; sizes: Record<string, string[]> };
  const others = Object.entries(sizes).filter(([size]) => Number(size) !== numberSize);
  assert.deepEqual(others, [], `allocations other than ${numberSize}-byte numbers`);
});
