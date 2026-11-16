import assert from "node:assert/strict";
import { test } from "node:test";
import { LEVELS, Quality, WINDOW, cheaperEyes, cheaperPixels } from "../src/quality.ts";

/** Runs `seconds` of frames `ms` apart, the brain at `speed` (negative: not living). */
function run(q: Quality, seconds: number, ms: number, speed = 1) {
  for (let t = 0; t < seconds * 1000; t += ms) q.frame(ms, speed);
}

function store(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return { items, getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) };
}

test("a device that keeps up stays at the top", () => {
  const q = new Quality();
  run(q, 120, 1000 / 60);
  assert.equal(q.level, 0);
});

test("frames that fall behind step the picture down, a step at a time, never past the bottom", () => {
  const q = new Quality();
  run(q, WINDOW * 2 + 0.1, 30);
  assert.equal(q.level, 1);
  run(q, 120, 60);
  assert.equal(q.level, LEVELS.length - 1);
  assert.equal(q.current.fps, 30);
  assert.equal(q.current.pixels, "chunkier");
});

test("30 fps that holds is fine at a level that asks for 30", () => {
  const q = new Quality();
  run(q, 60, 1000 / 30);
  assert.equal(q.current.fps, 30, "60 was too much, 30 holds");
  const level = q.level;
  run(q, 20, 1000 / 30);
  assert.equal(q.level, level);
});

test("after a long easy spell it tries a step up, and backs off for longer if that goes badly", () => {
  const q = new Quality();
  // Whole windows of frames at 30 a second (a hair over 2 s each, so each closes one window).
  const windows = (n: number) => run(q, n * WINDOW + 0.001, (WINDOW * 1000 + 1) / (WINDOW * 30));
  windows(4);
  const settled = q.level;
  assert.equal(LEVELS[settled].fps, 30, "60 was too much");
  windows(14);
  assert.equal(q.level, settled, "not yet");
  windows(1);
  assert.equal(q.level, settled - 1, "tried a step up");
  windows(1);
  assert.equal(q.level, settled, "and came back at once");
  windows(29);
  assert.equal(q.level, settled, "the next try waits twice as long");
  windows(1);
  assert.equal(q.level, settled - 1);
});

test("a slow brain steps the picture down only while that helps it", () => {
  const helped = new Quality();
  let speed = 0.7;
  for (let t = 0; t < 60_000; t += 16) helped.frame(16, (speed = helped.level >= 3 ? 1 : 0.7 + helped.level * 0.05));
  assert.ok(helped.level >= 3, `stepped down until the brain kept up (${helped.level}, ${speed})`);

  // Nothing changes for the brain until the eyes refresh half as often (level 4), for a player whose eyes were already Low.
  const late = new Quality();
  for (let t = 0; t < 90_000; t += 16) late.frame(16, late.level >= 4 ? 1 : 0.7);
  assert.equal(late.level, 4, "it kept looking past the steps that changed nothing");

  const saved = store();
  const bound = new Quality(saved);
  run(bound, 60, 16, 0.6);
  assert.equal(bound.level, 0, "a brain no cheaper picture helps is left as it is, and the picture with it");
  assert.equal(saved.items.get("flies.quality") ?? "0", "0", "the way down isn't remembered");
  run(bound, 120, 16, 0.6);
  assert.equal(bound.level, 0, "and it doesn't try again");

  // A little faster at the bottom, with noise from window to window, isn't keeping up: for twenty minutes it stays where it was.
  let seed = 9;
  const noise = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5) * 0.12;
  const noisy = new Quality();
  for (let t = 0; t < 20 * 60_000; t += 16) noisy.frame(16, (noisy.level === LEVELS.length - 1 ? 0.66 : 0.6) + noise());
  assert.equal(noisy.level, 0);
});

test("time the fly isn't living (paused, loading) and long gaps are not held against the device; a steady 3 frames a second is", () => {
  const q = new Quality();
  run(q, 60, 16, -1);
  for (let i = 0; i < 50; i++) q.frame(5000, 1);
  for (let i = 0; i < 5000; i++) q.frame(0, 1);
  assert.equal(q.level, 0);
  run(q, 10, 300);
  assert.ok(q.level > 0, "a device that only manages 3 frames a second steps down");
});

test("the player's own choice starts afresh: no trial or half-judged window left over", () => {
  const q = new Quality();
  run(q, 8, 1000 / 30);
  run(q, 15 * WINDOW + 1, 1000 / 30);
  q.reset();
  run(q, WINDOW + 0.1, 1000 / 30);
  assert.equal(q.level, 0, "one bad window after a reset is not yet a step");
});

test("it starts a step better than where it settled last time, and the player's own choice resets it", () => {
  const saved = store({ "flies.quality": "4" });
  const q = new Quality(saved);
  assert.equal(q.level, 3);
  run(q, 120, 60);
  assert.equal(saved.items.get("flies.quality"), String(LEVELS.length - 1));
  q.reset();
  assert.equal(q.level, 0);
});

test("the picture is the cheaper of the player's choice and the device's", () => {
  assert.equal(cheaperPixels("classic", "chunky"), "chunky");
  assert.equal(cheaperPixels("chunkier", "chunky"), "chunkier");
  assert.equal(cheaperEyes("high", "low"), "low");
  assert.equal(cheaperEyes("off", "high"), "off");
});
