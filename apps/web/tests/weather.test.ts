// The weather: the forecast wanders slowly and believably and is the same
// every time for the same hour; a chosen weather arrives in seconds; things
// get wet in the rain and dry after it.

import assert from "node:assert/strict";
import { test } from "node:test";
import { KINDS, WEATHERS, forecast, hourOfDay } from "@fly/world";
import type { WeatherKind } from "@fly/world";
import { WeatherNow, kindOf, wetten, forecast as sceneForecast } from "../src/scene/weather.ts";

/** Some week a few years from now, in local hours since the epoch. */
const START = 500_000;
const mix = () => ({ cloud: 0, mist: 0, rain: 0, wind: 0 });

test("the forecast is the same for the same hour, whenever it is asked", () => {
  for (let h = START; h < START + 48; h += 0.37) assert.deepEqual(forecast(h, mix()), forecast(h, mix()));
});

test("it changes slowly: never more than a few hundredths in a minute, over a month", () => {
  const last = forecast(START, mix());
  const now = mix();
  for (let m = 1; m < 30 * 24 * 60; m++) {
    forecast(START + m / 60, now);
    for (const k of ["cloud", "mist", "rain", "wind"] as const) assert.ok(Math.abs(now[k] - last[k]) < 0.08, `${k} jumped at ${m} min`);
    Object.assign(last, now);
  }
});

test("over two months it wanders through every kind, clear most of all, each lasting hours", () => {
  const hours: Record<WeatherKind, number> = { clear: 0, overcast: 0, mist: 0, rain: 0 };
  let runs = 0;
  let last: WeatherKind | null = null;
  const days = 60;
  for (let m = 0; m < days * 24 * 60; m += 5) {
    const kind = kindOf(forecast(START + m / 60, mix())) as WeatherKind;
    hours[kind] += 5 / 60;
    if (kind !== last) runs++;
    last = kind;
  }
  for (const kind of WEATHERS) assert.ok(hours[kind] > 10, `${kind}: ${hours[kind].toFixed(0)} h`);
  assert.ok(hours.clear > hours.overcast && hours.clear > hours.rain && hours.clear > hours.mist, JSON.stringify(hours));
  assert.ok(hours.rain < days * 24 * 0.25, "not raining most of the time");
  assert.ok((days * 24) / runs > 2, `a spell lasts ${((days * 24) / runs).toFixed(1)} h on average`);
});

test("mist only in the early morning, rain only under cloud", () => {
  const w = mix();
  for (let m = 0; m < 30 * 24 * 60; m += 3) {
    const h = START + m / 60;
    forecast(h, w);
    if (w.mist > 0.5) assert.ok(hourOfDay(h) < 11, `mist at ${hourOfDay(h).toFixed(1)} h`);
    if (w.rain > 0.02) assert.ok(w.cloud > 0.8, `rain from a sky only ${w.cloud.toFixed(2)} cloudy`);
  }
});

test("a chosen weather arrives within a few seconds and holds", () => {
  const w = new WeatherNow();
  w.follow(START, true);
  w.choose("rain");
  for (let i = 0; i < 5 * 60; i++) w.update(1 / 60);
  assert.equal(w.kind, "rain");
  assert.equal(w.rain, KINDS.rain.rain);
  assert.equal(w.cloud, KINDS.rain.cloud);
  w.choose("clear");
  w.update(1 / 60);
  assert.ok(w.cloud > 0.9, "not all at once");
});

test("rain wets things within a minute or two, and they dry over the next half hour or so", () => {
  let wet = 0;
  for (let s = 0; s < 120; s++) wet = wetten(wet, KINDS.rain, 1);
  assert.ok(wet > 0.85, `wet after two minutes of rain: ${wet.toFixed(2)}`);
  let dry = wet;
  for (let s = 0; s < 10 * 60; s++) dry = wetten(dry, KINDS.clear, 1);
  assert.ok(dry > 0.4 && dry < 0.8, `ten minutes after: ${dry.toFixed(2)}`);
  for (let s = 0; s < 50 * 60; s++) dry = wetten(dry, KINDS.clear, 1);
  assert.ok(dry < 0.1, `an hour after: ${dry.toFixed(2)}`);
  let misty = wet;
  for (let s = 0; s < 10 * 60; s++) misty = wetten(misty, KINDS.mist, 1);
  assert.ok(misty > dry, "slower to dry in mist");
});

test("opened after rain, the table is still wet", () => {
  // Find an hour soon after a spell of rain ended.
  const w = mix();
  let after = -1;
  let raining = false;
  for (let m = 0; m < 60 * 24 * 60 && after < 0; m += 5) {
    sceneForecast(START + 180 * 24 + m / 60, w);
    if (w.rain > 0.5) raining = true;
    else if (raining && w.rain === 0) after = START + 180 * 24 + m / 60 + 0.1;
  }
  assert.ok(after > 0, "it rained in two months");
  const now = new WeatherNow();
  now.follow(after, true);
  assert.ok(now.wet > 0.3, `wet ${now.wet.toFixed(2)}`);
  assert.equal(now.rain, sceneForecast(after, mix()).rain);
});

test("precipitation phase and electrical activity clear when another kind is chosen", () => {
  const w = new WeatherNow();
  for (const kind of ["snow", "storm", "sleet", "heavyRain"] as const) {
    w.choose(kind, true);
    assert.equal(w.kind, kind);
    w.choose("clear");
    for (let i = 0; i < 301; i++) w.update(1 / 60);
    assert.equal(w.kind, "clear");
    assert.equal(w.snow, 0);
    assert.equal(w.heavy, 0);
    assert.equal(w.storm, 0);
    assert.equal(w.lightning, 0);
  }
});

test("snow settles gradually, persists after the fall, and melts into wetness", () => {
  const w = new WeatherNow();
  w.choose("snow", true);
  assert.equal(w.snowCover, 0);
  for (let i = 0; i < 1200; i++) w.update(0.1);
  assert.ok(w.snowCover > 0.8 && w.wet < 0.01);
  w.choose("clear", true);
  const cover = w.snowCover;
  w.update(1);
  assert.ok(w.snowCover < cover && w.snowCover > 0.8);
  assert.ok(w.wet > 0);
  for (let i = 0; i < 9000; i++) w.update(0.1);
  assert.ok(w.snowCover < 0.01);
});
