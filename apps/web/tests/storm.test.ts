import assert from "node:assert/strict";
import { test } from "node:test";
import { Daylight } from "../src/scene/light.ts";
import { WeatherNow, lightningAt } from "../src/scene/weather.ts";
import { SCENES } from "../src/places/index.ts";
import { Retina } from "../../../packages/brain/src/vision.ts";

test("lightning brightens the actual shared scene lights in every place, day and night", () => {
  for (const scene of Object.values(SCENES)) for (const time of ["noon", "night"] as const) {
    const light = new Daylight(time, scene.palettes, scene.open);
    const w = new WeatherNow(); w.choose("storm", true);
    light.update(0, w);
    const ambient = light.hemiIntensity;
    const sun = light.sunIntensity;
    const cloud = light.cloud.r;
    w.lightning = 1;
    assert.equal(light.update(0, w), true);
    assert.ok(light.hemiIntensity > ambient && light.sunIntensity > sun && light.cloud.r > cloud, `${scene.id} ${time}`);
    w.lightning = 0;
    light.update(0, w);
    assert.equal(light.hemiIntensity, ambient);
    assert.equal(light.sunIntensity, sun);
  }
});

test("the current eye model is silent on flash onset and responds to its darkening tail", () => {
  const eye = new Retina({ hex1: new Uint8Array(1), hex2: new Uint8Array(1), kind: new Uint8Array(1), l1: Int32Array.of(0), l2: Int32Array.of(1), l3: Int32Array.of(2) });
  eye.step(10, [0.2]);
  eye.step(10, [0.9]);
  assert.deepEqual([...eye.rates], [0, 0, 0]);
  for (let i = 0; i < 20; i++) eye.step(10, [0.9]);
  eye.step(10, [0.2]);
  assert.ok(eye.rates.every(r => r > 0));
});

test("lightning stays sparse, bounded and absent without an electrical storm", () => {
  let lit = 0;
  for (let t = 0; t < 600; t += 0.01) {
    const flash = lightningAt(t, 1);
    assert.ok(flash >= 0 && flash <= 1);
    assert.equal(lightningAt(t, 0), 0);
    if (flash > 0.01) lit += 0.01;
  }
  assert.ok(lit > 5 && lit < 20);
});
