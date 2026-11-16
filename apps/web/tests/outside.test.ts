// The real weather outside: what WeatherKit says becomes the nearest of the
// game's weathers; the real sunrise and sunset move the clock's day so the
// sun comes up and goes down when it does outside, polar days and nights
// included; and without a fresh answer everything is as it was, the change
// either way easing in.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { NativeWeatherBridge, OutsideConditions, OutsideStatus } from "@fly/contracts";
import { SCENES } from "../src/places/index.ts";
import { CLOCK_SUNRISE, CLOCK_SUNSET, TIMES, blankLight, clockLight } from "../src/scene/light.ts";
import type { Light, TimeOfDay } from "../src/scene/light.ts";
import { BLEND, Outside, STALE, SUN_STALE, SWITCH, dayHours, outsideMix, turn } from "../src/scene/outside.ts";
import type { SunTimes } from "../src/scene/outside.ts";
import { KINDS, WeatherNow, forecast, kindOf } from "../src/scene/weather.ts";
import type { Mix } from "../src/scene/weather.ts";

const NOW = Date.UTC(2026, 10, 16, 12);
const mix = (): Mix => ({ cloud: 0, mist: 0, rain: 0, wind: 0 });
const outside = (o: Partial<OutsideConditions> = {}): OutsideConditions => ({
  source: "weatherkit", observedAt: NOW - 5 * 60_000, cloudCover: 0.1, precipitation: 0, visibility: 30_000, wind: 3, condition: "clear",
  daylight: true, sunrise: 7.2, sunset: 16.4, noon: 11.8, ...o,
});
const kindFor = (o: Partial<OutsideConditions>) => kindOf(outsideMix(outside(o), mix()));

test("cloud cover is the cloud: a clear sky, a partly cloudy one, a grey one", () => {
  assert.equal(kindFor({ cloudCover: 0.05, condition: "clear" }), "clear");
  assert.equal(kindFor({ cloudCover: 0.4, condition: "partlyCloudy" }), "clear");
  assert.equal(outsideMix(outside({ cloudCover: 0.4 }), mix()).cloud, 0.4);
  assert.equal(kindFor({ cloudCover: 0.95, condition: "cloudy" }), "overcast");
});

test("fog, or seeing less than a kilometre, is mist; haze is some", () => {
  assert.equal(kindFor({ condition: "foggy", visibility: 400 }), "mist");
  assert.equal(kindFor({ condition: "cloudy", cloudCover: 0.9, visibility: 600 }), "mist");
  assert.equal(outsideMix(outside({ visibility: 20_000 }), mix()).mist, 0);
  assert.ok(outsideMix(outside({ condition: "haze", visibility: 9000 }), mix()).mist >= 0.5);
});

test("precipitation is rain, light rain at the most", () => {
  assert.equal(kindFor({ condition: "drizzle", precipitation: 0.1, cloudCover: 1 }), "rain");
  assert.equal(kindFor({ condition: "rain", precipitation: 0.8, cloudCover: 1 }), "rain");
  assert.equal(outsideMix(outside({ condition: "heavyRain", precipitation: 12 }), mix()).rain, 1);
  assert.equal(kindFor({ condition: "rain", precipitation: 0, cloudCover: 1 }), "rain", "the condition says it rains, though none is falling at that moment");
  assert.equal(outsideMix(outside({ precipitation: 0.02 }), mix()).rain, 0, "a trace isn't rain");
});

test("what the game hasn't got is the nearest it has: snow a white mist, flurries a grey sky, sleet and hail rain, thunder heavy rain", () => {
  const snow = outsideMix(outside({ condition: "snow", precipitation: 1.5, cloudCover: 0.7, visibility: 3000 }), mix());
  assert.equal(snow.rain, 0, "no rain falls in snow");
  assert.equal(kindOf(snow), "mist");
  assert.ok(snow.cloud >= 0.9);
  assert.equal(kindFor({ condition: "flurries", precipitation: 0.2, cloudCover: 0.5 }), "overcast");
  assert.equal(kindFor({ condition: "sleet", precipitation: 0.6, cloudCover: 1 }), "rain");
  assert.equal(kindFor({ condition: "hail", precipitation: 0, cloudCover: 1 }), "rain");
  assert.ok(outsideMix(outside({ condition: "thunderstorms", precipitation: 0.3, cloudCover: 1 }), mix()).rain >= 0.8);
});

test("the wind is the real speed, a fresh breeze the windiest", () => {
  assert.equal(outsideMix(outside({ wind: 0 }), mix()).wind, 0);
  assert.equal(outsideMix(outside({ wind: 3.5 }), mix()).wind, 0.35, "a gentle breeze is the clear day's wind");
  assert.equal(outsideMix(outside({ wind: 25 }), mix()).wind, 1);
});

const resolved = (id: keyof typeof SCENES) => {
  const p = SCENES[id].palettes;
  const out = {} as Record<TimeOfDay, Light>;
  for (const t of TIMES) {
    out[t] = blankLight();
    for (const c of ["zenith", "middle", "horizon", "sun", "sky", "ground", "haze", "water", "cloud"] as const) out[t][c].set(p[t][c]);
    for (const n of ["sunUp", "sunAround", "sunIntensity", "hemiIntensity", "stars", "glow", "env"] as const) out[t][n] = p[t][n];
  }
  return out;
};
const picnic = resolved("picnic");
/** The clock's light is the sun's from 5:00, when the moon has set, to 21:06, when the moon rises as the sun goes down. */
const sunsHours = (g: number) => g >= 5 && g < 21.1;
/** How high the sun is (radians) at a real hour, or -1 while the light is the moon's. */
const sunUpAt = (hours: number, sun: SunTimes) => {
  const g = dayHours(hours, sun);
  return sunsHours(g) ? clockLight(picnic, g, blankLight()).sunUp : -1;
};
const sunTimes = (sunrise: number | null, sunset: number | null, noon: number | null, daylight = true): SunTimes => ({ sunrise, sunset, noon, daylight });
/** The first minute of the day the sun is up, and the first after that it is down. */
function crossings(sun: SunTimes) {
  let rise = -1;
  let set = -1;
  let was = sunUpAt(0, sun) > 0;
  for (let m = 1; m < 24 * 60; m++) {
    const up = sunUpAt(m / 60, sun) > 0;
    if (up && !was && rise < 0) rise = m / 60;
    if (!up && was && rise >= 0 && set < 0) set = m / 60;
    was = up;
  }
  return { rise, set };
}

test("the clock's day has its sunrise and sunset where CLOCK_SUNRISE and CLOCK_SUNSET say", () => {
  const plain = { rise: -1, set: -1 };
  let was = false;
  for (let m = 1; m < 24 * 60; m++) {
    const up = sunsHours(m / 60) && clockLight(picnic, m / 60, blankLight()).sunUp > 0;
    if (up && !was) plain.rise = m / 60;
    if (!up && was) plain.set = m / 60;
    was = up;
  }
  assert.ok(Math.abs(plain.rise - CLOCK_SUNRISE) < 3 / 60, `rises at ${plain.rise.toFixed(2)}`);
  assert.ok(Math.abs(plain.set - CLOCK_SUNSET) < 3 / 60, `sets at ${plain.set.toFixed(2)}`);
});

for (const [name, rise, set] of [["a midsummer day in the north", 3.9, 22.1], ["a winter day", 8.1, 16.0], ["an equinox", 6.1, 18.2], ["a day after the clocks change", 7.4, 18.9]] as const) {
  test(`${name}: the sun comes up and goes down within a few minutes of when it does outside`, () => {
    const c = crossings(sunTimes(rise, set, (rise + set) / 2));
    assert.ok(Math.abs(c.rise - rise) < 4 / 60, `rises at ${c.rise.toFixed(2)}, outside ${rise}`);
    assert.ok(Math.abs(c.set - set) < 4 / 60, `sets at ${c.set.toFixed(2)}, outside ${set}`);
  });
}

test("a sunset before the clock's fixed one: dark outside is dark in the game", () => {
  const winter = sunTimes(8.1, 16.0, 12);
  const at = 17.5;
  assert.ok(clockLight(picnic, at, blankLight()).sunUp > 0, "the clock's day still has the sun up");
  const l = clockLight(picnic, dayHours(at, winter), blankLight());
  assert.ok(l.sunUp < 0 && l.sunIntensity < 0.05, `sun at ${l.sunUp.toFixed(2)} rad, ${l.sunIntensity.toFixed(2)}`);
  assert.ok(dayHours(12, winter) > 10.5 && dayHours(12, winter) < 15.25, "midday is midday");
});

test("the day moves on without jumping, through every day length from a short winter's to a white night's", () => {
  for (const [rise, set] of [[9.5, 14.5], [7, 17], [4, 21], [2.6, 23.3], [0.9, 23.5], [-0.4, 23.9]]) {
    const sun = sunTimes(rise, set, (rise + set) / 2);
    // A night of under an hour and a half is taken as none: the day then swings to and fro.
    const polar = 24 - (set - rise) < 1.5;
    let last = dayHours(0, sun);
    for (let m = 1; m <= 24 * 60; m++) {
      const g = dayHours(m / 60, sun);
      const short = turn(last, g);
      if (!polar) assert.ok(short >= 0, `day ${rise}–${set}: backwards at ${(m / 60).toFixed(2)}`);
      // Never more than about ten minutes of the clock's day in a real minute.
      assert.ok(Math.abs(short) < 11 / 60, `day ${rise}–${set}: ${short.toFixed(3)} h at ${(m / 60).toFixed(2)}`);
      last = g;
    }
  }
});

test("polar day: the sun never sets, highest at the real noon", () => {
  const sun = sunTimes(null, null, 12.6, true);
  let lowest = Infinity;
  let highestAt = 0;
  let highest = -Infinity;
  for (let m = 0; m < 24 * 60; m += 5) {
    const up = sunUpAt(m / 60, sun);
    lowest = Math.min(lowest, up);
    if (up > highest) {
      highest = up;
      highestAt = m / 60;
    }
  }
  assert.ok(lowest > 0.05, `lowest ${lowest.toFixed(2)} rad`);
  assert.ok(Math.abs(highestAt - 12.6) < 1.5, `highest at ${highestAt}`);
});

test("polar night: the sun never rises, and it is darkest twelve hours from noon", () => {
  const sun = sunTimes(null, null, null, false);
  for (let m = 0; m < 24 * 60; m += 5) assert.ok(sunUpAt(m / 60, sun) < 0, `sun up at ${m / 60}`);
  assert.ok(dayHours(0, sun) < 2, "deep night at midnight");
  assert.equal(clockLight(picnic, dayHours(0, sun), blankLight()).stars, 1);
  // A day of under an hour and a half is taken as none.
  for (let m = 0; m < 24 * 60; m += 5) assert.ok(sunUpAt(m / 60, sunTimes(11.6, 12.4, 12)) < 0);
});

/** A host whose answers the test sets. */
class FakeBridge implements NativeWeatherBridge {
  started = 0;
  stopped = 0;
  current: OutsideConditions | null = null;
  answers = 0;
  status(): OutsideStatus {
    return this.current ? "ok" : "locating";
  }
  start() {
    this.started++;
  }
  stop() {
    this.stopped++;
  }
  error() {
    return "";
  }
  version() {
    return this.answers;
  }
  conditions() {
    return this.current && { ...this.current };
  }
  attribution() {
    return null;
  }
  answer(c: OutsideConditions) {
    this.current = c;
    this.answers++;
  }
}

/** Runs it on as the game does, every two seconds. */
const run = (o: Outside, from: number, seconds: number, each?: (o: Outside, t: number) => void) => {
  for (let t = 2; t <= seconds; t += 2) {
    o.update(from + t * 1000);
    each?.(o, from + t * 1000);
  }
  return from + seconds * 1000;
};

test("without a host it is the made-up weather and the clock's day, as before", () => {
  const o = new Outside(null);
  o.update(NOW, true);
  assert.equal(o.state, "none");
  assert.equal(o.available, false);
  assert.equal(o.following, false);
  const f = forecast(500_000, mix());
  assert.deepEqual(o.blend({ ...f }), f);
  for (let h = 0; h < 24; h += 0.25) assert.equal(o.lightHours(h), h);
});

test("the host is asked once the game begins it, and only while it is wanted", () => {
  const bridge = new FakeBridge();
  const o = new Outside(bridge);
  o.enabled = false;
  o.begin();
  assert.equal(bridge.started, 0);
  assert.equal(o.state, "off");
  o.enabled = true;
  assert.equal(bridge.started, 1);
  o.begin();
  assert.equal(bridge.started, 1, "once");
  o.enabled = false;
  assert.equal(bridge.stopped, 1);
});

test("a fresh answer eases in over a minute, and the weather on Now becomes it", () => {
  const bridge = new FakeBridge();
  const o = new Outside(bridge);
  o.update(NOW, true);
  assert.equal(o.following, false, "no answer yet");
  bridge.answer(outside({ observedAt: NOW, condition: "rain", precipitation: 0.6, cloudCover: 1 }));
  let last = o.weight;
  const end = run(o, NOW, SWITCH + 4, (x) => {
    assert.ok(x.weight - last <= 2 / SWITCH + 1e-9, "no jump");
    last = x.weight;
  });
  assert.equal(o.weight, 1);
  assert.equal(o.following, true);
  assert.equal(o.state, "ok");
  const w = new WeatherNow();
  w.follow(500_000, true, o);
  for (let i = 0; i < 10 * 60; i++) w.update(1 / 60);
  assert.equal(w.kind, "rain");
  assert.ok(Math.abs(w.cloud - 1) < 1e-9);
  // The next observation, clear, comes in over minutes, not at once.
  bridge.answer(outside({ observedAt: end, condition: "clear", cloudCover: 0, precipitation: 0 }));
  run(o, end, 10);
  const halfway = o.blend(mix());
  assert.ok(halfway.cloud > 0.9, `cloud ${halfway.cloud.toFixed(2)} after 10 s`);
  run(o, end + 10_000, BLEND);
  assert.ok(o.blend(mix()).cloud < 1e-9);
});

test("an answer too old to be the weather now isn't used, but its sunrise and sunset are for a day or two", () => {
  const bridge = new FakeBridge();
  bridge.answer(outside({ observedAt: NOW - STALE - 60_000 }));
  const o = new Outside(bridge);
  o.update(NOW, true);
  assert.equal(o.following, false);
  assert.equal(o.weight, 0);
  const f = forecast(500_000, mix());
  assert.deepEqual(o.blend({ ...f }), f);
  assert.equal(o.sunFollowing, true);
  assert.ok(Math.abs(o.lightHours(16.4) - CLOCK_SUNSET) < 1e-9, "the real sunset is the clock's");
  bridge.answer(outside({ observedAt: NOW - SUN_STALE - 60_000 }));
  o.update(NOW, true);
  assert.equal(o.sunFollowing, false);
  assert.equal(o.lightHours(16.4), 16.4);
});

test("going stale while in use, it eases back to the made-up weather", () => {
  const bridge = new FakeBridge();
  bridge.answer(outside({ observedAt: NOW, cloudCover: 1 }));
  const o = new Outside(bridge);
  o.update(NOW, true);
  assert.equal(o.weight, 1);
  run(o, NOW + STALE, SWITCH / 2);
  assert.ok(o.weight > 0.4 && o.weight < 0.6, `half way after half a minute: ${o.weight.toFixed(2)}`);
  assert.equal(o.following, false, "the tool says so at once");
  run(o, NOW + STALE + (SWITCH / 2) * 1000, SWITCH);
  assert.equal(o.weight, 0);
});

test("turned off, it goes back to the made-up weather and the clock's day; on again, back to the real", () => {
  const bridge = new FakeBridge();
  bridge.answer(outside({ observedAt: NOW }));
  const o = new Outside(bridge);
  o.begin();
  o.update(NOW, true);
  o.enabled = false;
  assert.equal(o.state, "off");
  run(o, NOW, SWITCH + 2);
  assert.equal(o.weight, 0);
  assert.equal(o.sunWeight, 0);
  assert.equal(o.lightHours(16.4), 16.4);
  o.enabled = true;
  assert.equal(bridge.started, 2);
  run(o, NOW + (SWITCH + 2) * 1000, SWITCH + 2);
  assert.equal(o.weight, 1);
});

test("the light moves to the real sunrise and sunset without jumping, however it is switched", () => {
  const bridge = new FakeBridge();
  const o = new Outside(bridge);
  o.update(NOW, true);
  bridge.answer(outside({ observedAt: NOW, sunrise: 8.1, sunset: 16.0, noon: 12 }));
  let last = o.lightHours(15);
  run(o, NOW, SWITCH + 2, (x) => {
    const h = x.lightHours(15);
    assert.ok(Math.abs(turn(last, h)) < 0.5, `${last.toFixed(2)} to ${h.toFixed(2)}`);
    last = h;
  });
  assert.ok(Math.abs(o.lightHours(16) - CLOCK_SUNSET) < 1e-9);
  // A new day's times (or a polar day's) come in over minutes.
  bridge.answer(outside({ observedAt: NOW + 70_000, sunrise: null, sunset: null, noon: 12 }));
  last = o.lightHours(16);
  run(o, NOW + 70_000, BLEND, (x) => {
    const h = x.lightHours(16);
    assert.ok(Math.abs(turn(last, h)) < 0.1);
    last = h;
  });
});

test("a script can feed it conditions in a browser, and take them away", () => {
  const o = new Outside(null);
  o.update(NOW, true);
  o.feed(outside({ observedAt: Date.now(), condition: "foggy", visibility: 300 }));
  assert.equal(o.state, "fed");
  assert.equal(o.following, true);
  assert.equal(o.weight, 1);
  assert.equal(kindOf(o.blend({ ...KINDS.clear })), "mist");
  o.feed(null);
  assert.equal(o.state, "none");
  assert.equal(o.following, false);
  assert.equal(o.weight, 0);
});

test("opened with a fresh answer kept from the last run, it is the weather from the start", () => {
  const bridge = new FakeBridge();
  bridge.answer(outside({ observedAt: NOW - 30 * 60_000, condition: "rain", precipitation: 0.5, cloudCover: 1 }));
  const o = new Outside(bridge);
  o.update(NOW, true);
  const w = new WeatherNow();
  w.follow(500_000, true, o);
  assert.equal(w.kind, "rain");
  assert.ok(w.wet > 0.8, `wet ${w.wet.toFixed(2)}`);
});

test("a polar day turning to night between observations eases across without the light jumping", () => {
  for (let h0 = 0; h0 < 24; h0 += 0.25) {
    const bridge = new FakeBridge();
    const o = new Outside(bridge);
    bridge.answer(outside({ observedAt: NOW, sunrise: null, sunset: null, noon: 12, daylight: true }));
    o.update(NOW, true);
    bridge.answer(outside({ observedAt: NOW, sunrise: null, sunset: null, noon: 12, daylight: false }));
    let last = o.lightHours(h0);
    run(o, NOW, BLEND + 4, (x, t) => {
      const h = x.lightHours(h0 + (t - NOW) / 3_600_000);
      assert.ok(Math.abs(turn(last, h)) < 0.1, `from ${h0}: ${last.toFixed(2)} to ${h.toFixed(2)}`);
      last = h;
    });
  }
});

test("day after day of observations, the light only ever moves on, and never far at once", () => {
  const bridge = new FakeBridge();
  const o = new Outside(bridge);
  const midnight = NOW - 12 * 3_600_000;
  // A winter week, the days drawing in by three minutes each: an observation every 20 minutes, as the TV asks.
  const sunOn = (t: number) => {
    const day = Math.floor((t - midnight) / 86_400_000);
    return { sunrise: 7.9 + day * 0.03, sunset: 16.2 - day * 0.03, noon: 12.05 };
  };
  bridge.answer(outside({ observedAt: midnight, ...sunOn(midnight) }));
  o.update(midnight, true);
  let last = o.lightHours(0);
  for (let t = midnight + 2000; t < midnight + 7 * 86_400_000; t += 2000) {
    if ((t - midnight) % (20 * 60_000) === 0) bridge.answer(outside({ observedAt: t, ...sunOn(t) }));
    o.update(t);
    const h = o.lightHours((((t - midnight) / 3_600_000) % 24));
    const step = turn(last, h);
    assert.ok(step >= -1e-9 && step < 0.05, `${((t - midnight) / 3_600_000).toFixed(3)} h in: ${last.toFixed(3)} to ${h.toFixed(3)}`);
    last = h;
  }
});
