// Keeping the last seconds for Why? goes on every frame, so it must leave
// nothing for the collector. Alone in its own process: objects other tests
// make in the same shapes change how V8 stores their numbers, and a frame's
// objects here are shaped as the game's are, once.

import assert from "node:assert/strict";
import { test } from "node:test";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { REGIONS, REGION_RATE_NAMES } from "@fly/brain";
import { createIntent } from "@fly/body";
import { SOMA_GROUPS } from "@fly/fly";
import { Recorder } from "../src/why/recorder.ts";
import type { Recorded } from "../src/why/recorder.ts";

test("the recorder allocates nothing as it goes", () => {
  // The rates as the brain keeps them, every readout, region and stage of the eyes by name; fractions everywhere, as a brain gives them.
  const rates: Record<string, number> = {};
  for (const g of SOMA_GROUPS) rates[g.rate] = 12.5;
  for (const name of REGION_RATE_NAMES) rates[name] = 3.25;
  for (const stage of ["lamina", "medulla", "T4/T5", "lobula", "looming", "tangential"]) for (const side of ["left", "right"]) rates[`vision.${stage} ${side}`] = 1.5;
  const live: Recorded = {
    regionRates: new Float32Array(REGIONS.length).fill(3.25),
    state: { command: { walk: 0.41, turn: -0.12, back: 0.03, escape: 0.07, wings: 0.11, groom: 0.02, feed: 0.01, sing: 0.04, lean: 0 }, stats: { simMs: 1.5, wallMs: 0.5, spikes: 120, active: 80, rates } },
    sensed: { loomLeft: 0.13, loomRight: 0.27, touch: 0.31, bumpLeft: 0.05, bumpRight: 0.06, wind: 0.21, sweet: 0.5, bitter: 0.02, water: 0.03, grounded: true, maleTaste: 0.08, wingbeat: 0.09, hunger: 0.45, thirst: 0.35 },
    intent: { ...createIntent(), live: true, walking: true, yawRate: 0.7 },
    onFeet: true,
    jumped: false,
  };
  const recorder = new Recorder();
  // Ten minutes of frames from a fresh collection: a box a frame would be over half a megabyte.
  setFlagsFromString("--expose-gc");
  const gc = runInNewContext("gc") as () => void;
  for (let i = 0; i < 36_000; i++) recorder.record(1 / 60, live);
  gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 36_000; i++) recorder.record(1 / 60, live);
  const grew = process.memoryUsage().heapUsed - before;
  assert.ok(grew < 64 * 1024, `ten minutes of frames allocated ${(grew / 1024).toFixed(0)} kB`);
});
