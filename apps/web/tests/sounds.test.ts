import assert from "node:assert/strict";
import { test } from "node:test";
import { Audio } from "../src/audio/sounds.ts";
import type { Ambience } from "../src/audio/sounds.ts";

/** Enough of an AudioContext to record what is scheduled: every buffer source started, and the gain it goes through. */
class FakeContext {
  state = "running";
  currentTime = 0;
  destination = {};
  started: { buffer: { data: Float32Array }; loop: boolean; gain: number; rate: number }[] = [];
  stopped = 0;
  createGain() {
    const node = { gain: param(1), out: null as unknown, connect: (to: unknown) => void (node.out = to) };
    return node;
  }
  createBuffer(_channels: number, length: number, rate: number) {
    const data = new Float32Array(length);
    return { data, length, sampleRate: rate, getChannelData: () => data };
  }
  createBufferSource() {
    const started = this.started;
    const source = {
      buffer: null as { data: Float32Array } | null,
      loop: false,
      playbackRate: param(1),
      out: null as { gain: { value: number } } | null,
      connect: (to: { gain: { value: number } }) => void (source.out = to),
      start: () => started.push({ buffer: source.buffer!, loop: source.loop, gain: source.out?.gain.value ?? 1, rate: source.playbackRate.value }),
      stop: () => void this.stopped++,
    };
    return source;
  }
}

function param(value: number) {
  return { value, setTargetAtTime() {}, setValueAtTime() {}, cancelScheduledValues() {} };
}

/** An hour of life in a place, at a given darkness and rain: the birds' chirps that were scheduled (not the loops). */
function anHour(ambience: Ambience, dark: number, rain: number) {
  const ctx = new FakeContext();
  (globalThis as { AudioContext?: unknown }).AudioContext = function () {
    return ctx;
  };
  const audio = new Audio();
  audio.setAmbience(ambience);
  audio.start(10, 10);
  const loops = ctx.started.length;
  for (let frame = 0; frame < 3600 * 10; frame++) {
    audio.weather(rain, 0, dark);
    audio.follow(0, 0, 0, 0.1);
  }
  return { chirps: ctx.started.slice(loops), loop: ctx.started.find((s) => s.loop && s.buffer.data.length === 12 * 22050)?.buffer.data };
}

function energy(data: Float32Array) {
  let sum = 0;
  for (const x of data) sum += x * x;
  return sum / data.length;
}

/** How much of a sound is high (above a few kHz): the energy of its first differences, per sample. */
function edge(data: Float32Array) {
  let sum = 0;
  for (let i = 1; i < data.length; i++) sum += (data[i] - data[i - 1]) ** 2;
  return sum / data.length;
}

test("at the picnic the birds call by day, mostly keep quiet in the rain, and are silent at night", () => {
  const day = anHour("outdoors", 0, 0).chirps;
  assert.ok(day.length > 150, `${day.length} chirps in an hour of a clear day`);
  for (const c of day) assert.equal(c.gain, 1, "out among them, at full loudness");
  const rain = anHour("outdoors", 0, 1).chirps.length;
  assert.ok(rain > 0 && rain < day.length * 0.3, `${rain} in the rain against ${day.length}`);
  assert.equal(anHour("outdoors", 1, 0).chirps.length, 0, "at night");
  const dusk = anHour("outdoors", 0.3, 0).chirps.length;
  assert.ok(dusk > 0 && dusk < day.length * 0.6, `${dusk} at dusk against ${day.length}`);
});

test("at the windowsill the birds are the garden's, muffled by the glass, and keep the same hours and weather", () => {
  const { chirps: day, loop } = anHour("kitchen", 0, 0);
  assert.ok(day.length > 150, `${day.length} chirps in an hour of a clear day`);
  const outside = anHour("outdoors", 0, 0).chirps;
  for (const c of day) assert.ok(c.gain < 0.5, "quieter through the glass");
  // The calls are high, so taking the top off them leaves much less of them.
  const behindGlass = Math.max(...day.map((c) => energy(c.buffer.data)));
  const outdoors = Math.min(...outside.map((c) => energy(c.buffer.data)));
  assert.ok(behindGlass < outdoors * 0.5, `the glass takes the top off them (${behindGlass.toExponential(2)} against ${outdoors.toExponential(2)})`);
  assert.ok(anHour("kitchen", 0, 1).chirps.length < day.length * 0.3, "in the rain");
  assert.equal(anHour("kitchen", 1, 0).chirps.length, 0, "at night");
  // The kitchen's own loop is the room alone: no bird in it, at any hour.
  assert.ok(loop, "the kitchen's loop plays");
  // Its top end is the room's steady hush, with no call standing out of it in any 25 ms.
  const levels: number[] = [];
  for (let w = 0; w + 551 <= loop.length; w += 551) levels.push(edge(loop.subarray(w, w + 551)));
  levels.sort((x, y) => x - y);
  const usual = levels[levels.length >> 1];
  const most = levels[levels.length - 1];
  assert.ok(most < usual * 4, `no calls in the kitchen's loop (its top end peaks at ${(most / usual).toFixed(1)} times its usual)`);
});

test("indoors without a window the birds aren't heard", () => {
  assert.equal(anHour("lab", 0, 0).chirps.length, 0);
  assert.equal(anHour("bar", 0, 0).chirps.length, 0);
});

test("a held tool is heard from when it starts to when it stops, and nothing is made in between", () => {
  const ctx = new FakeContext();
  (globalThis as { AudioContext?: unknown }).AudioContext = function () {
    return ctx;
  };
  const audio = new Audio();
  audio.start(10, 10);
  const loops = ctx.started.length;
  audio.held(0, 0);
  assert.equal(ctx.started.length, loops, "nothing while nothing is held");
  for (let frame = 0; frame < 120; frame++) audio.held(1, 0);
  assert.equal(ctx.started.length, loops + 1, "the feather's rustle, once");
  assert.ok(ctx.started.at(-1)!.loop);
  for (let frame = 0; frame < 60; frame++) audio.held(0, 0);
  assert.equal(ctx.stopped, 1, "let go when it stops");
  audio.held(0, 0.55);
  audio.held(0, 0.55);
  audio.held(0, 0);
  audio.held(0, 1);
  const [gentle, hard] = ctx.started.slice(-2);
  assert.equal(ctx.started.length, loops + 3);
  assert.ok(hard.rate > gentle.rate, "blowing hard is higher and brighter than blowing gently");
  assert.ok(energy(gentle.buffer.data) > 0 && edge(ctx.started[loops].buffer.data) > edge(gentle.buffer.data), "the feather hisses higher than the breath");
});
