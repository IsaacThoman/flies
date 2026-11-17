// What Why? costs, in M5 Pro CPU time (scripts/cpuBudget.ts says why, and why
// npm test runs this alone): keeping the followed fly's last six seconds, which
// it does every frame whether anyone asks or not, and, once when it is asked
// for, copying them out, picking what to show and working out the glow of every
// part through them. The Apple TV has no JIT and pays roughly 16 times this.

import assert from "node:assert/strict";
import { test } from "node:test";
import { REGIONS, REGION_RATE_NAMES } from "@fly/brain";
import { createIntent } from "@fly/body";
import { NERVE_PARTS, SOMA_GROUPS } from "@fly/fly";
import { CpuMeter, measureBudget, median } from "../../../scripts/cpuBudget.ts";
import { explain } from "../src/why/pick.ts";
import { CAPACITY, Clip, Recorder } from "../src/why/recorder.ts";
import type { Recorded } from "../src/why/recorder.ts";
import { glowSeries } from "../src/why/replay.ts";

const DT = 1 / 60;
const FRAMES = 120_000;
const SAMPLES = 5;
const PARTS = Math.ceil(NERVE_PARTS.length / 4) * 4;

/** A fly whose brain and senses move every frame, as a living one's do, walking and turning now and then. */
function living(): Recorded & { tick(i: number): void } {
  const rates: Record<string, number> = {};
  for (const name of REGION_RATE_NAMES) rates[name] = 0;
  for (const g of SOMA_GROUPS) rates[g.rate] = 0;
  const f = {
    regionRates: new Float32Array(REGIONS.length),
    state: { command: { walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0 }, stats: { simMs: 0, wallMs: 0, spikes: 0, active: 0, rates } },
    sensed: { loomLeft: 0, loomRight: 0, touch: 0, bumpLeft: 0, bumpRight: 0, wind: 0, sweet: 0, bitter: 0, water: 0, grounded: true, maleTaste: 0, wingbeat: 0, hunger: 0.6 },
    intent: { ...createIntent(), live: true },
    onFeet: true,
    jumped: false,
    /** Cheap, beside the recording it feeds: a region, the rates, the commands and the senses change a little each frame. */
    tick(i: number) {
      const k = (i % 60) / 60;
      f.regionRates[i % REGIONS.length] = 2 + k;
      rates.DNg100 = 10 + 20 * k;
      rates.DNp01 = i % 600 === 300 ? 180 : 3;
      const c = f.state.command;
      c.walk = 0.2 + 0.3 * k;
      c.turn = 0.6 * k - 0.3;
      c.escape = i % 600 === 300 ? 0.8 : 0.05;
      f.sensed.loomRight = i % 600 > 280 && i % 600 < 300 ? 0.6 : 0;
      f.sensed.wind = 0.1 * k;
      f.intent.walking = c.walk > 0.3;
      f.intent.yawRate = -c.turn * 3;
      f.jumped = i % 600 === 300;
    },
  };
  return f;
}

/**
 * The followed fly recorded, its first minute and a half kept unmeasured. Each `sample` keeps FRAMES more, on
 * from the last, and returns ms of this thread's CPU a frame, as an M5 Pro would spend it: a frame costs a fifth
 * of a microsecond, so a sample needs tens of thousands of them to be milliseconds of work, and a new recorder
 * each sample would leave garbage whose collection fell inside the next.
 */
function recording() {
  const recorder = new Recorder();
  const fly = living();
  let at = 0;
  const run = (n: number) => {
    for (let i = 0; i < n; i++, at++) {
      fly.tick(at);
      recorder.record(DT, fly);
    }
  };
  run(6_000);
  const sample = () => {
    const meter = new CpuMeter();
    for (let lap = 0; lap < 4; lap++) {
      run(FRAMES / 4);
      meter.lap();
    }
    return { ms: meter.ms / FRAMES, raw: meter.rawMs / FRAMES, references: meter.references };
  };
  return { recorder, sample };
}

test("keeping the last six seconds costs a fraction of a microsecond of JavaScript a frame", async (t) => {
  const recorded = recording();
  recorded.sample();
  const measured = await measureBudget(t, () => {
    const samples = Array.from({ length: SAMPLES }, recorded.sample);
    return { value: { ms: median(samples.map((s) => s.ms)), raw: median(samples.map((s) => s.raw)) }, references: samples.flatMap((s) => s.references), samples: [samples.map((s) => s.ms)] };
  });
  if (!measured) return;
  console.log(`  recording: ${(measured.ms * 1000).toFixed(2)} M5 Pro CPU µs a frame (${(measured.raw * 1000).toFixed(2)} here) with a JIT`);
  // 0.18 µs on an M5 Pro, ticking the made-up fly included (Node 26): about 3 µs a frame on the Apple TV.
  assert.ok(measured.ms < 0.00032, `${(measured.ms * 1000).toFixed(2)} M5 Pro CPU µs a frame; budget 0.32`);
});

test("asking Why? (copying the six seconds out, picking, and the glow of every part through them) costs well under a frame", async (t) => {
  const { recorder } = recording();
  const clip = new Clip();
  const series = new Float32Array(CAPACITY * PARTS);
  // Each sample tens of milliseconds of asking, after as many unmeasured, so neither the JIT nor one burst decides it.
  const asks = 200;
  const ask = () => {
    recorder.copyTo(clip);
    explain(clip);
    glowSeries(clip, series, PARTS);
  };
  for (let i = 0; i < asks; i++) ask();
  const measured = await measureBudget(t, () => {
    const times: number[] = [];
    const references: number[] = [];
    for (let s = 0; s < SAMPLES; s++) {
      const meter = new CpuMeter();
      // A lap every 40, so the samples have 30 references beside them and one slow one moves none of their percentiles.
      for (let i = 0; i < asks; i++) {
        ask();
        if (i % 40 === 39) meter.lap();
      }
      times.push(meter.ms / asks);
      references.push(...meter.references);
    }
    return { value: median(times), references, samples: [times] };
  });
  if (measured === undefined) return;
  assert.equal(clip.length, CAPACITY);
  assert.equal(explain(clip).action, "takeoff");
  console.log(`  asking: ${(measured * 1000).toFixed(0)} M5 Pro CPU µs`);
  // 0.16 ms on an M5 Pro (Node 26): under 3 ms on the Apple TV, once, when the player chooses Why?.
  assert.ok(measured < 0.28, `${(measured * 1000).toFixed(0)} M5 Pro CPU µs; budget 280`);
});
