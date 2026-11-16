import assert from "node:assert/strict";
import { test } from "node:test";
import { Audio } from "../src/audio/sounds.ts";
import type { Ambience } from "../src/audio/sounds.ts";

type FakeBuffer = { data: Float32Array; length: number; sampleRate: number; numberOfChannels: number };

/** Enough of an AudioContext to record what is scheduled: every buffer source started, and the gain it goes through. */
class FakeContext {
  state = "running";
  currentTime = 0;
  destination = {};
  started: { buffer: FakeBuffer; loop: boolean; gain: number; level: ReturnType<typeof param>; rate: number }[] = [];
  stopped = 0;
  createGain() {
    const node = { gain: param(1), out: null as unknown, connect: (to: unknown) => void (node.out = to) };
    return node;
  }
  createBuffer(channels: number, length: number, rate: number) {
    const data = new Float32Array(length);
    return { data, length, sampleRate: rate, numberOfChannels: channels, getChannelData: () => data };
  }
  createBufferSource() {
    const started = this.started;
    const source = {
      buffer: null as FakeBuffer | null,
      loop: false,
      playbackRate: param(1),
      out: null as { gain: ReturnType<typeof param> } | null,
      connect: (to: { gain: ReturnType<typeof param> }) => void (source.out = to),
      start: () => started.push({ buffer: source.buffer!, loop: source.loop, gain: source.out?.gain.value ?? 1, level: source.out?.gain ?? param(1), rate: source.playbackRate.value }),
      stop: () => void this.stopped++,
      addEventListener: () => {},
    };
    return source;
  }
}

function param(value: number) {
  return { value, target: value, setTargetAtTime(target: number) { this.target = target; }, setValueAtTime() {}, cancelScheduledValues() {} };
}

function inPlace(ambience: Ambience) {
  const ctx = new FakeContext();
  (globalThis as { AudioContext?: unknown }).AudioContext = function () {
    return ctx;
  };
  const audio = new Audio();
  audio.setAmbience(ambience);
  audio.start(10, 10);
  return { audio, ctx };
}

/** An hour of life in a place, at a given darkness and rain: the birds' chirps that were scheduled (not the loops). */
function anHour(ambience: Ambience, dark: number, rain: number) {
  const { audio, ctx } = inPlace(ambience);
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

test("the closed restaurant is quiet, low and seamless, with a complete fridge cycle", () => {
  const { audio, ctx } = inPlace("restaurant");
  const source = ctx.started.at(-1)!;
  const { data, length, sampleRate, numberOfChannels } = source.buffer;
  assert.ok(source.loop);
  assert.equal(numberOfChannels, 1, "the street and the room are mono");
  assert.equal(sampleRate, 8000, "muffled sounds need no high-rate buffer on the TV");
  assert.equal(length / sampleRate, 64, "a long loop leaves room between events");
  let peak = 0;
  for (const x of data) {
    assert.ok(Number.isFinite(x));
    peak = Math.max(peak, Math.abs(x));
  }
  const rms = Math.sqrt(energy(data));
  assert.ok(rms > 0.005 && rms < 0.025, `a quiet room, RMS ${rms}`);
  assert.ok(peak < 0.12, `no startling knocks or clipping (${peak})`);
  assert.ok(edge(data) < energy(data) * 0.08, "the counter and glass keep the top end soft");
  const seam = Math.abs(data[0] - data[length - 1]);
  const nearby = Math.sqrt((edge(data.subarray(0, 200)) + edge(data.subarray(-200))) / 2);
  assert.ok(seam < nearby * 3, `no click at the join (${seam} against nearby steps of ${nearby})`);
  const between = (from: number, to: number) => energy(data.subarray(from * sampleRate, to * sampleRate));
  const quiet = between(1, 6);
  assert.ok(between(12, 17) > quiet * 3, "the compressor settles into a low drone");
  assert.ok(between(36, 38) < quiet * 1.5, "the room quietens after the fridge clicks off");
  assert.ok(between(60, 63) > quiet * 0.5, "the building stays audible between events and across the join");

  audio.setAmbience("bar");
  audio.setAmbience("restaurant");
  assert.equal(ctx.started.at(-1)!.buffer, source.buffer, "returning reuses the buffer");
  assert.deepEqual(inPlace("restaurant").ctx.started.at(-1)!.buffer.data, data, "seeded synthesis repeats exactly");
});

test("the restaurant hears rain through its shop windows, and muffled birds only by day", () => {
  const { audio, ctx } = inPlace("restaurant");
  const rain = ctx.started.find((s) => s.loop && s.buffer.length === 5 * 22050)!;
  audio.weather(1, 0, 0);
  assert.equal(rain.level.target, 0.45 * 0.7);
  const day = anHour("restaurant", 0, 0).chirps;
  assert.ok(day.length > 150, "city birds call outside by day");
  for (const c of day) assert.equal(c.gain, 0.12, "quiet through the shop windows");
  assert.ok(anHour("restaurant", 0, 1).chirps.length < day.length * 0.3, "mostly quiet in the rain");
  assert.equal(anHour("restaurant", 1, 0).chirps.length, 0, "no birds in the closed restaurant at night");
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
