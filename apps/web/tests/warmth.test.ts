// Holding a warming device to what it can sustain (quality.ts, Warmth), with
// a thermal state that the tests set: the steps down as it warms, frames
// first, the long wait before a step back up, and the place remembered.

import assert from "node:assert/strict";
import { test } from "node:test";
import { COOL, MAX_COOL, STEP_AFTER, STEP_EVERY, THERMAL_EVERY, TRIAL, WARM_LEVELS, Warmth } from "../src/quality.ts";

const NOMINAL = 0;
const FAIR = 1;
const SERIOUS = 2;
const CRITICAL = 3;

/** A device whose thermal state the test sets, and counts being asked. */
function device(state = NOMINAL) {
  const d = { state, reads: 0, read: () => (d.reads++, d.state) };
  return d;
}

function store(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return { items, getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) };
}

/** `seconds` of frames at 60 a second. */
function run(w: Warmth, seconds: number) {
  for (let i = Math.round(seconds * 60); i > 0; i--) w.update(1 / 60);
}

function warmth(state = NOMINAL, kept = store()) {
  const d = device(state);
  const w = new Warmth(d.read, kept);
  w.enter("restaurant");
  return { d, w, kept };
}

test("the levels lower the frame rate first, 40 and then 30, and only then coarsen the pixels", () => {
  assert.deepEqual(
    WARM_LEVELS.map((l) => `${l.fps} ${l.pixels}`),
    ["60 classic", "40 classic", "30 classic", "30 chunky", "30 chunkier"],
  );
});

test("a cool device stays at the top, and is asked how hot it is once a second, not every frame", () => {
  const { d, w } = warmth();
  run(w, 600);
  assert.equal(w.level, 0);
  assert.equal(w.current.fps, 60);
  assert.ok(Math.abs(d.reads - 600 / THERMAL_EVERY) <= 1, `${d.reads} reads in 10 minutes`);
});

test("serious steps down at once, then a step at a time while it stays, never past the bottom", () => {
  const { d, w } = warmth();
  run(w, 5);
  d.state = SERIOUS;
  run(w, THERMAL_EVERY + 0.05);
  assert.equal(w.level, 1, "40 at once");
  run(w, STEP_EVERY[SERIOUS] - 2);
  assert.equal(w.level, 1, "and it gets time to work");
  run(w, 3);
  assert.equal(w.level, 2, "30 if it didn't");
  run(w, 3600);
  assert.equal(w.level, WARM_LEVELS.length - 1);
  assert.equal(w.current.pixels, "chunkier");
});

test("fair steps down too, before serious, once it has lasted a little, and more slowly", () => {
  const { d, w } = warmth();
  d.state = FAIR;
  run(w, STEP_AFTER[FAIR] - 2);
  assert.equal(w.level, 0, "a moment of fair may pass");
  run(w, 3);
  assert.equal(w.level, 1);
  run(w, STEP_EVERY[FAIR] - 2);
  assert.equal(w.level, 1);
  run(w, 3);
  assert.equal(w.level, 2);
});

test("critical steps down fastest", () => {
  const { d, w } = warmth();
  d.state = CRITICAL;
  run(w, 1 + STEP_EVERY[CRITICAL] * 2 + 1);
  assert.equal(w.level, 3);
});

test("cooling down doesn't step back up for a long while, and then only one step", () => {
  const { d, w } = warmth();
  d.state = SERIOUS;
  run(w, STEP_EVERY[SERIOUS] + 2);
  assert.equal(w.level, 2);
  d.state = NOMINAL;
  // Warming doubled the wait.
  run(w, COOL * 2 - 5);
  assert.equal(w.level, 2, "still held while it has been cool for less than the wait");
  run(w, 10);
  assert.equal(w.level, 1, "one step up");
  run(w, TRIAL + 1);
  assert.equal(w.level, 1, "and cool through its trial, it stays there");
});

test("a step up that warms the device comes straight back down, and the next try waits twice as long", () => {
  const { d, w } = warmth();
  d.state = SERIOUS;
  run(w, 2);
  assert.equal(w.level, 1);
  d.state = NOMINAL;
  run(w, COOL * 2 + 2);
  assert.equal(w.level, 0, "tries 60 again");
  d.state = SERIOUS;
  run(w, 2);
  assert.equal(w.level, 1, "warm in its trial: back to 40 at once");
  d.state = NOMINAL;
  run(w, COOL * 4 - 5);
  assert.equal(w.level, 1, "waits twice as long this time");
  run(w, 10);
  assert.equal(w.level, 0);
});

test("the wait before a step up stops growing at MAX_COOL", () => {
  const { d, w } = warmth();
  for (let i = 0; i < 12; i++) {
    d.state = SERIOUS;
    run(w, 2);
    d.state = NOMINAL;
    run(w, MAX_COOL + 2);
    assert.equal(w.level, 0, `try ${i}: back at the top within MAX_COOL of cool`);
  }
});

test("each place starts where it was last held, kept across runs; a place that never warmed the device starts at the top", () => {
  const kept = store();
  const first = warmth(NOMINAL, kept);
  first.d.state = SERIOUS;
  run(first.w, 2);
  assert.equal(first.w.level, 1);
  first.d.state = NOMINAL;
  first.w.enter("lab");
  assert.equal(first.w.level, 0, "the lab never warmed it");
  first.w.enter("restaurant");
  assert.equal(first.w.level, 1, "the restaurant did");

  const next = new Warmth(device().read, kept);
  next.enter("restaurant");
  assert.equal(next.level, 1, "kept across runs");
  run(next, COOL * 2 - 5);
  assert.equal(next.level, 1, "with the longer wait it had earned");
  next.enter("windowsill");
  assert.equal(next.level, 0);
});

test("what was kept is read warily: nonsense starts every place at the top", () => {
  for (const junk of ["not json", JSON.stringify({ restaurant: { level: 99, cool: COOL } }), JSON.stringify({ restaurant: { level: 2, cool: -1 } }), "null"]) {
    const w = new Warmth(device().read, store({ "flies.warmth": junk }));
    w.enter("restaurant");
    assert.equal(w.level, 0, junk);
  }
  const w = new Warmth(device().read, { getItem: () => { throw new Error("no storage"); }, setItem: () => { throw new Error("no storage"); } });
  w.enter("restaurant");
  assert.equal(w.level, 0);
});

test("a change of level is counted once, for the game to apply it", () => {
  const { d, w } = warmth();
  const before = w.changes;
  run(w, 60);
  assert.equal(w.changes, before);
  d.state = SERIOUS;
  run(w, 2);
  assert.equal(w.changes, before + 1);
});
