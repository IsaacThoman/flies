// What the journal costs in JavaScript, in M5 Pro CPU time (scripts/cpuBudget.ts
// says why, and why npm test runs this alone): watching for the fly's firsts,
// every frame, and making a picture into a JPEG, a few times in a fly's life,
// spread over frames (journal/capture.ts). The Apple TV has no JIT and pays
// roughly 16 times this.

import assert from "node:assert/strict";
import { test } from "node:test";
import { CpuMeter, measureBudget, median } from "../../../scripts/cpuBudget.ts";
import { pictureSize } from "../src/journal/capture.ts";
import { JpegEncoder, jpegDataUrl } from "../src/journal/jpeg.ts";
import { Moments } from "../src/journal/moments.ts";
import type { Lived, Moment } from "../src/journal/moments.ts";
import { SMALL } from "../src/journal/store.ts";

const SAMPLES = 5;

test("making the Apple TV's picture of a first into a JPEG costs little, all of it, and spread over frames less again", async (t) => {
  const { w, h } = pictureSize(16 / 9, SMALL.auto);
  const pixels = new Uint8Array(w * h * 4);
  // A picture with something in it: smooth light, and detail, as the world has.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    pixels[i] = (x * 255) / w;
    pixels[i + 1] = 120 + 100 * Math.sin(x * 0.3) * Math.cos(y * 0.2);
    pixels[i + 2] = (y * 255) / h;
    pixels[i + 3] = 255;
  }
  const encoder = new JpegEncoder(SMALL.quality);
  const encode = () => {
    encoder.begin(pixels, w, h, true);
    while (!encoder.step(2));
    return jpegDataUrl(encoder.bytes).length;
  };
  for (let i = 0; i < 20; i++) encode();
  const measured = await measureBudget(t, () => {
    const samples: number[] = [];
    const references: number[] = [];
    let chars = 0;
    for (let s = 0; s < SAMPLES; s++) {
      const meter = new CpuMeter();
      for (let i = 0; i < 20; i++) chars = encode();
      meter.lap();
      samples.push(meter.ms / 20);
      references.push(...meter.references);
    }
    return { value: { ms: median(samples), chars }, references, samples: [samples] };
  });
  if (!measured) return;
  console.log(`  a ${w}×${h} picture: ${(measured.ms * 1000).toFixed(0)} M5 Pro CPU µs, ${measured.chars} characters kept`);
  // About 250 µs on an M5 Pro in Node: some 4 ms on the Apple TV, over a few frames at a millisecond each.
  assert.ok(measured.ms < 0.6, `${(measured.ms * 1000).toFixed(0)} M5 Pro CPU µs; budget 600`);
  assert.ok(measured.chars < SMALL.budget.chars / SMALL.budget.pictures, "small enough for the TV to keep as many as it may");
});

test("watching for the fly's firsts costs next to nothing a frame", async (t) => {
  const life: { -readonly [K in keyof Lived]: Lived[K] } = { activity: "walking", meals: 0, takeOffs: 0, body: { mode: "walking", surface: { solid: -1 } }, world: { solids: [] }, senses: { tasting: { food: null } } };
  const found: Moment[] = [];
  const moments = new Moments(["flight", "groom", "climb", "escape", "sleep"]);
  const FRAMES = 200_000;
  const run = () => {
    for (let i = 0; i < FRAMES; i++) {
      life.activity = i % 3 ? "walking" : "grooming";
      moments.watch(life, 1 / 60, found);
    }
  };
  run();
  const measured = await measureBudget(t, () => {
    const samples: number[] = [];
    const references: number[] = [];
    for (let s = 0; s < SAMPLES; s++) {
      const meter = new CpuMeter();
      run();
      meter.lap();
      samples.push(meter.ms / FRAMES);
      references.push(...meter.references);
    }
    return { value: median(samples), references, samples: [samples] };
  });
  if (measured === undefined) return;
  console.log(`  ${(measured * 1e6).toFixed(0)} M5 Pro CPU ns a frame`);
  assert.equal(found.length, 0);
  assert.ok(measured < 0.0005, `${(measured * 1e6).toFixed(0)} M5 Pro CPU ns a frame; budget 500`);
});
