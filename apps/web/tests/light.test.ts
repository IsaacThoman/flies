// The light by the clock: each palette at its hour, eased between with no
// jumps, the sun up by day and the moon by night, for any place's palettes;
// and the weather over it.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { SCENES } from "../src/places/index.ts";
import { BELOW, Daylight, SETTING, TIMES, aboveHorizon, blankLight, clockLight, timeAt } from "../src/scene/light.ts";
import type { Light, Palette, Palettes, TimeOfDay } from "../src/scene/light.ts";
import { KINDS } from "@fly/world";
import type { Weather } from "../src/scene/weather.ts";

/** Palettes unlike the picnic's: a room whose "sun" is a window, high all day, and a lamp at night. */
const ROOM: Palettes = Object.fromEntries(
  TIMES.map((t, i) => [t, { zenith: "#203040", middle: "#405060", horizon: "#a0b0c0", sunUp: 0.3 + i * 0.1, sunAround: -1 + i, sun: "#ffeecc", sunIntensity: 1 - i * 0.15, sky: "#ccddee", ground: "#554433", hemiIntensity: 0.8, haze: "#99aabb", water: "#335577", cloud: "#eeeeee", stars: i === 4 ? 1 : 0, glow: 0.3, env: 1 } satisfies Palette]),
) as unknown as Palettes;

const PLACES: [string, Palettes][] = [...Object.values(SCENES).map((s) => [s.id, s.palettes] as [string, Palettes]), ["a room", ROOM]];

const COLOURS = ["zenith", "middle", "horizon", "sun", "sky", "ground", "haze", "water", "cloud"] as const;
const NUMBERS = ["sunUp", "sunAround", "sunIntensity", "hemiIntensity", "stars", "glow", "env"] as const;

const resolved = (p: Palettes) => {
  const out = {} as Record<TimeOfDay, Light>;
  for (const t of TIMES) {
    out[t] = blankLight();
    for (const c of COLOURS) out[t][c].set(p[t][c]);
    for (const n of NUMBERS) out[t][n] = p[t][n];
  }
  return out;
};

const copy = (to: Light, from: Light) => {
  for (const c of COLOURS) to[c].copy(from[c]);
  for (const n of NUMBERS) to[n] = from[n];
  return to;
};

const colourGap = (a: THREE.Color, b: THREE.Color) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
const direction = (l: Light) => new THREE.Vector3(Math.sin(l.sunAround) * Math.cos(l.sunUp), Math.sin(l.sunUp), -Math.cos(l.sunAround) * Math.cos(l.sunUp));

for (const [name, palettes] of PLACES) {
  const p = resolved(palettes);
  // Outdoors the sun goes down at dusk; indoors the evening's light may be a lamp, high and staying on.
  const setting = palettes.dusk.sunUp < SETTING;

  test(`${name}: by the clock each palette's colours are full at its hour, and the sun stands where that palette puts it`, () => {
    for (const [hour, time] of [[7.5, "morning"], [12.75, "noon"], [17.75, "golden"], [20, "dusk"]] as const) {
      const l = clockLight(p, hour, blankLight());
      assert.ok(colourGap(l.zenith, p[time].zenith) < 1e-6, `${time} zenith`);
      assert.ok(Math.abs(l.sunUp - p[time].sunUp) < 1e-9, `${time} sun's height`);
      assert.ok(Math.abs(Math.atan2(Math.sin(l.sunAround - p[time].sunAround), Math.cos(l.sunAround - p[time].sunAround))) < 1e-9, `${time} sun's bearing`);
    }
    const midday = clockLight(p, 13, blankLight());
    assert.ok(colourGap(midday.horizon, p.noon.horizon) < 1e-6, "midday holds through the early afternoon");
    const night = clockLight(p, 1, blankLight());
    assert.ok(colourGap(night.zenith, p.night.zenith) < 1e-6 && Math.abs(night.sunUp - p.night.sunUp) < 0.05, "the small hours are night, the moon high");
  });

  test(`${name}: through the whole day nothing jumps: colours, light and the sun or moon all move a little each minute`, () => {
    const last = clockLight(p, 0, blankLight());
    const now = blankLight();
    for (let m = 1; m <= 24 * 60; m++) {
      clockLight(p, m / 60, now);
      for (const c of COLOURS) assert.ok(colourGap(now[c], last[c]) < 0.025, `${c} at ${(m / 60).toFixed(2)}`);
      assert.ok(Math.abs(now.sunIntensity - last.sunIntensity) < 0.1, `light at ${(m / 60).toFixed(2)}`);
      const angle = direction(now).angleTo(direction(last));
      if (setting) {
        // The disc may only change places (sun to moon) while both are down, and then there is no light from it.
        if (angle > 0.02) {
          assert.ok(now.sunUp < BELOW + 0.06 && last.sunUp < BELOW + 0.06, `the sun or moon jumped at ${(m / 60).toFixed(2)}`);
          assert.equal(aboveHorizon(now.sunUp), 0);
        }
      } else assert.ok(angle < 0.06, `the light swung ${angle.toFixed(3)} rad in a minute at ${(m / 60).toFixed(2)}`);
      copy(last, now);
    }
  });

  if (setting) {
    test(`${name}: the sun is up through the day and down at night, when the moon is up instead`, () => {
      for (let h = 6.5; h <= 19.5; h += 0.5) assert.ok(clockLight(p, h, blankLight()).sunUp > 0, `sun up at ${h}`);
      for (const h of [21.3, 4.8]) assert.ok(clockLight(p, h, blankLight()).sunIntensity < 0.05, `dark between sun and moon at ${h}`);
      for (const h of [23, 0, 2, 3.5]) {
        const l = clockLight(p, h, blankLight());
        assert.ok(l.sunUp > 0 && l.sunIntensity > 0, `the moon is up at ${h}`);
      }
    });
  } else {
    test(`${name}: its evening light (a lamp) is on from dusk to dawn and stays where it is through the night`, () => {
      for (let h = 19; h < 31; h += 0.25) assert.ok(clockLight(p, h % 24, blankLight()).sunIntensity > 0, `lit at ${h % 24}`);
      const late = clockLight(p, 22, blankLight());
      for (const h of [23, 0, 2, 4]) {
        const l = clockLight(p, h, blankLight());
        assert.ok(Math.abs(l.sunUp - late.sunUp) < 1e-9 && Math.abs(l.sunAround - late.sunAround) < 1e-9, `still at ${h}`);
      }
    });
  }
}

test("the time of day a clock hour is called", () => {
  assert.equal(timeAt(7), "morning");
  assert.equal(timeAt(12), "noon");
  assert.equal(timeAt(18), "golden");
  assert.equal(timeAt(20), "dusk");
  assert.equal(timeAt(23), "night");
  assert.equal(timeAt(3), "night");
});

const clear: Weather = { ...KINDS.clear, wet: 0, heavy: 0, storm: 0, snow: 0, snowCover: 0, lightning: 0, kind: "clear" };

test("a chosen time eases in over a couple of seconds and then is exactly its palette", () => {
  const palettes = SCENES.picnic.palettes;
  const light = new Daylight("noon", palettes);
  light.update(0, clear);
  light.set("night");
  light.update(1, clear);
  assert.ok(light.stars > 0 && light.stars < 1, "on its way");
  for (let i = 0; i < 20; i++) light.update(0.2, clear);
  assert.equal(light.stars, palettes.night.stars);
  assert.equal(`#${light.zenith.getHexString()}`, palettes.night.zenith);
  assert.equal(light.hours, null);
});

test("following the clock eases there from a chosen time, then moves with it; settled, it is there at once", () => {
  const light = new Daylight("night", SCENES.picnic.palettes);
  light.update(0, clear);
  light.follow(12.75);
  light.update(0.5, clear);
  assert.ok(light.sunIntensity < SCENES.picnic.palettes.noon.sunIntensity, "still easing from night");
  for (let i = 0; i < 20; i++) light.update(0.2, clear);
  assert.ok(Math.abs(light.sunUp - SCENES.picnic.palettes.noon.sunUp) < 1e-9);
  assert.equal(light.time, "noon");
  const settled = new Daylight("night", SCENES.picnic.palettes);
  settled.follow(7.5, true);
  settled.update(0, clear);
  assert.ok(Math.abs(settled.sunUp - SCENES.picnic.palettes.morning.sunUp) < 1e-9);
});

test("a room open to the weather only through its windows feels it less", () => {
  const out = new Daylight("noon", ROOM);
  const room = new Daylight("noon", ROOM, 0.4);
  const grey: Weather = { ...KINDS.overcast, wet: 0, heavy: 0, storm: 0, snow: 0, snowCover: 0, lightning: 0, kind: "overcast" };
  out.update(0, grey);
  room.update(0, grey);
  assert.ok(room.sunIntensity > out.sunIntensity * 2, "more of its daylight left");
  assert.ok(room.sunIntensity < ROOM.noon.sunIntensity, "but some taken");
});

test("overcast greys the sky and takes the sun away; mist whitens the horizon; clear changes nothing", () => {
  const palettes = SCENES.picnic.palettes;
  const look = (w: Weather) => {
    const light = new Daylight("noon", palettes);
    light.update(0, w);
    return light;
  };
  const sunny = look(clear);
  assert.equal(`#${sunny.zenith.getHexString()}`, palettes.noon.zenith);
  assert.equal(sunny.sunIntensity, palettes.noon.sunIntensity);
  const grey = look({ ...clear, ...KINDS.overcast, kind: "overcast" });
  const saturation = (c: THREE.Color) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  assert.ok(saturation(grey.zenith) < saturation(sunny.zenith) * 0.4, "the sky goes grey");
  assert.ok(grey.sunIntensity < sunny.sunIntensity * 0.35, "the sun goes behind it");
  assert.ok(grey.glow < sunny.glow * 0.3);
  const misty = look({ ...clear, ...KINDS.mist, kind: "mist" });
  assert.ok(saturation(misty.horizon) < saturation(sunny.horizon) && misty.haze.getHSL({ h: 0, s: 0, l: 0 }).l >= sunny.haze.getHSL({ h: 0, s: 0, l: 0 }).l * 0.95, "the distance whitens");
  for (const l of [grey, misty]) for (const c of [l.zenith, l.middle, l.horizon, l.haze, l.skyColor]) assert.ok(c.r <= 1.0001 && c.g <= 1.0001 && c.b <= 1.0001 && c.r >= 0 && c.g >= 0 && c.b >= 0);
});

test("the clock's light repeats across positive and negative days, including midnight", () => {
  const p = resolved(ROOM);
  for (const hour of [0, 4, 6, 12, 20, 23.5]) {
    const expected = clockLight(p, hour, blankLight());
    for (const offset of [-48, -24, 24, 48]) {
      const actual = clockLight(p, hour + offset, blankLight());
      for (const c of COLOURS) assert.ok(colourGap(actual[c], expected[c]) < 1e-9, `${c} at ${hour + offset}`);
      for (const n of NUMBERS) assert.ok(Math.abs(actual[n] - expected[n]) < 1e-9, `${n} at ${hour + offset}`);
    }
  }
});

test("time-of-day names include the first instant of each part of the day", () => {
  for (const [hour, name] of [[5.5, "morning"], [9, "noon"], [16.5, "golden"], [19, "dusk"], [21, "night"]] as const) {
    assert.equal(timeAt(hour), name);
    assert.equal(timeAt(hour - 24), name);
  }
});

test("a light crossing the azimuth seam takes the short way instead of swinging across the room", () => {
  const palettes: Palettes = { ...ROOM, morning: { ...ROOM.morning, sunAround: 3.1 }, noon: { ...ROOM.noon, sunAround: -3.1 } };
  const light = new Daylight("morning", palettes);
  light.follow(9, true);
  light.update(0, { ...KINDS.clear, wet: 0, kind: "clear" });
  assert.ok(light.sunDirection.z > 0.8, "halfway between the bearings still faces the same wall");
});

test("a dusk light at the lamp threshold stays on through the night", () => {
  const p = resolved({ ...ROOM, dusk: { ...ROOM.dusk, sunUp: SETTING } });
  const light = clockLight(p, 22, blankLight());
  assert.equal(light.sunUp, ROOM.night.sunUp);
  assert.equal(light.sunIntensity, ROOM.night.sunIntensity);
});

test("rain changing by itself updates the light and darkens an overcast room", () => {
  const light = new Daylight("noon", ROOM);
  const weather: Weather = { cloud: 0.6, mist: 0, rain: 0, wet: 0, wind: 0, kind: "overcast" };
  light.update(0, weather);
  const middle = light.middle.clone();
  const ambient = light.hemiIntensity;
  assert.equal(light.update(0, { ...weather, rain: 0.8 }), true);
  assert.ok(light.middle.r < middle.r && light.hemiIntensity < ambient);
  assert.equal(light.update(0, { ...weather, rain: 0.8 }), false);
});

test("mist changing by itself updates the haze, then holds until the weather changes again", () => {
  const light = new Daylight("noon", ROOM);
  const weather: Weather = { ...KINDS.clear, kind: "clear", wet: 0 };
  light.update(0, weather);
  const haze = light.haze.clone();
  assert.equal(light.update(0, { ...weather, mist: 0.8 }), true);
  assert.ok(colourGap(light.haze, haze) > 0.01, "mist reaches the distance even when cloud and rain hold");
  assert.equal(light.update(0, { ...weather, mist: 0.8 }), false);
});
