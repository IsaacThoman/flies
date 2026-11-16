// The stats in a corner: the fly's day counts what really happened, once
// each, and is kept for the day; the panel says what it counts in a figure
// and a word.

import assert from "node:assert/strict";
import { test } from "node:test";
import { REGIONS } from "@fly/brain";
import type { BrainState } from "@fly/brain";
import type { BrainDriver } from "@fly/contracts";
import { World } from "@fly/world";
import { HISTORY_SAMPLES } from "../src/brain/meter.ts";
import { Life } from "../src/life.ts";
import { freshDay } from "../src/settings.ts";
import type { Day, StatsKind } from "../src/settings.ts";
import { SIGNALS, distance, drawStatsPanel, duration, figures, readSignals, statsShape } from "../src/stats/panel.ts";
import type { StatsState } from "../src/stats/panel.ts";
import { SAVE_EVERY, Tally, dayOf } from "../src/stats/tally.ts";
import { places } from "../../../scripts/fuzz/body.ts";
import { blankCanvas, writtenOn } from "./canvas.ts";

/** A brain that sends whatever command the test sets. */
class Commands implements BrainDriver {
  readonly status = "running";
  readonly error = null;
  readonly neurons = 0;
  readonly connections = 0;
  readonly eyes = null;
  readonly regionRates = new Float32Array(REGIONS.length);
  stateAt = 0;
  state: BrainState = { command: { walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0 }, stats: { simMs: 0, wallMs: 0, spikes: 0, active: 0, rates: {} } };
  tick() {
    this.stateAt = performance.now();
  }
  dispose() {}
}

const NOON = new Date(2026, 10, 16, 12).getTime();
const totals = () => ({ walked: 0, meals: 0, takeOffs: 0, flown: 0, groomed: 0 });

/** A tally kept in memory, and every save it made. */
function kept(saved: Day | null = null) {
  const saves: Day[] = [];
  return { saves, load: (date: string) => (saved?.date === date ? { ...saved } : freshDay(date)), save: (day: Day) => saves.push({ ...day }) };
}

test("the day counts what the fly did since it was last asked, once, and not what it had done before the day was counted", () => {
  const life = { ...totals(), walked: 50, meals: 2 };
  const store = kept();
  const tally = new Tally(life, NOON, store.load, store.save);
  assert.deepEqual(tally.day, freshDay("2026-11-16"), "what it did before isn't today's to count");
  life.walked += 12.5;
  life.meals++;
  life.takeOffs++;
  life.flown += 1.5;
  life.groomed += 4;
  tally.update(life, NOON + 1000, 1);
  tally.update(life, NOON + 2000, 1);
  tally.update(life, NOON + 3000, 1);
  assert.deepEqual(tally.day, { date: "2026-11-16", walked: 12.5, meals: 1, takeOffs: 1, flown: 1.5, groomed: 4 }, "asked again, nothing new: counted once");
});

test("it carries on from today's save, starts a new day at midnight, and saves while it changes, not otherwise", () => {
  const store = kept({ date: "2026-11-16", walked: 100, meals: 4, takeOffs: 3, flown: 10, groomed: 20 });
  const life = totals();
  const tally = new Tally(life, NOON, store.load, store.save);
  assert.equal(tally.day.meals, 4, "today's save");
  for (let t = 0; t < SAVE_EVERY * 3; t++) tally.update(life, NOON + t * 1000, 1);
  assert.equal(store.saves.length, 0, "nothing happened: nothing saved");
  life.walked += 5;
  tally.update(life, NOON + 1, 1);
  for (let t = 0; t < SAVE_EVERY; t++) tally.update(life, NOON + t * 1000, 1);
  assert.equal(store.saves.length, 1, "saved within the half minute");
  assert.equal(store.saves[0].walked, 105);
  tally.save();
  assert.equal(store.saves.length, 1, "nothing new since: not saved again");
  life.meals++;
  tally.update(life, NOON + 40_000, 1 / 60);
  tally.save();
  assert.equal(store.saves.length, 2, "going to sleep saves what is new");
  // Past midnight: a new day, from nothing.
  const midnight = new Date(2026, 10, 17).getTime();
  tally.update(life, midnight + 1, 1 / 60);
  assert.deepEqual(tally.day, freshDay("2026-11-17"));
  life.takeOffs++;
  tally.update(life, midnight + 20, 1 / 60);
  assert.equal(tally.day.takeOffs, 1);
  assert.equal(dayOf(new Date(2026, 0, 5)), "2026-01-05");
});

test("a whole life counted: steps walked, a take-off (its leap no walk), a meal from beginning to end once, time flying and grooming", () => {
  const brain = new Commands();
  const life = new Life(new World(places.picnic), brain);
  const store = kept();
  const tally = new Tally(life, NOON, store.load, store.save);
  const step = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      life.step(1 / 60, performance.now());
      tally.update(life, NOON, 1 / 60);
    }
  };
  const c = brain.state.command;
  // Walking: the distance its feet carried it, as near as the body moved it.
  const from = { ...life.body.position };
  c.walk = 1;
  step(2);
  c.walk = 0;
  step(0.5);
  const moved = Math.hypot(life.body.position.x - from.x, life.body.position.z - from.z);
  assert.ok(moved > 1, `it walked ${moved.toFixed(1)} mm`);
  assert.ok(tally.day.walked >= moved - 1e-6 && tally.day.walked < moved * 1.2 + 0.5, `counted ${tally.day.walked.toFixed(1)} mm for ${moved.toFixed(1)} mm walked`);
  assert.equal(tally.day.takeOffs, 0);
  // A take-off: counted once, and the leap and the landing aren't walking.
  const walked = tally.day.walked;
  c.escape = 1;
  c.wings = 1;
  step(0.2);
  c.escape = 0;
  step(0.8);
  assert.equal(tally.day.takeOffs, 1);
  assert.ok(tally.day.flown > 0.3, `flew ${tally.day.flown.toFixed(2)} s`);
  c.wings = 0;
  step(6);
  assert.equal(life.body.mode === "airborne", false, "landed");
  assert.ok(tally.day.walked - walked < 0.5, `in the air it walked ${(tally.day.walked - walked).toFixed(2)} mm`);
  // Grooming.
  c.groom = 1;
  step(1);
  c.groom = 0;
  step(0.2);
  assert.ok(tally.day.groomed > 0.8 && tally.day.groomed < 1.25, `as long as it groomed, easing out: groomed ${tally.day.groomed.toFixed(2)} s`);
  // A meal: honey at its feet, fed on for a while, is one meal.
  life.pantry.drop("honey", life.body.position.x, life.body.position.z);
  c.feed = 1;
  step(2);
  c.feed = 0;
  step(0.5);
  assert.equal(life.meals, 1);
  assert.equal(tally.day.meals, 1);
  // Carried to another place: not a step of it walked.
  const before = tally.day.walked;
  life.move(places.lab);
  step(0.2);
  assert.ok(tally.day.walked - before < 0.5, "being carried isn't walking");
});

test("figures in three digits, distances and times as a watcher reads them", () => {
  assert.equal(figures(0), "0");
  assert.equal(figures(412.4), "412");
  assert.equal(figures(4123), "4.12k");
  assert.equal(figures(41_234), "41.2k");
  assert.equal(figures(999_999), "1.00M");
  assert.equal(figures(1_240_000), "1.24M");
  assert.equal(figures(Number.NaN), "0");
  assert.equal(distance(142.4), "142 mm");
  assert.equal(distance(1420), "1.42 m");
  assert.equal(distance(2_500_000), "2500 m");
  assert.equal(duration(12.9), "12 s");
  assert.equal(duration(125), "2 min");
  assert.equal(duration(5400), "1.5 h");
});

test("the panel shows what it is doing over its day, and its brain's numbers, each with a word, nothing else", () => {
  const history = new Float32Array(HISTORY_SAMPLES).fill(250_000);
  const day: Day = { date: "2026-11-16", walked: 1420, meals: 3, takeOffs: 7, flown: 42, groomed: 130 };
  const sensed = { loomLeft: 0.4, loomRight: 0, touch: 1, bumpLeft: 0, bumpRight: 0.2, wind: 0, sweet: 0, grounded: true, maleTaste: 0, wingbeat: 0 };
  const state: StatsState = { activity: "grooming", spikes: 1_240_000, active: 41_234, speed: 0.98, history, head: 3, day, sensed, brain: null };
  const written = (kind: StatsKind, cols = 3, side = false) => {
    const g = blankCanvas();
    drawStatsPanel(g, statsShape(kind, cols, side), state);
    return writtenOn(g).map((w) => w.text);
  };
  assert.deepEqual(written("brain"), ["Its brain", "1.24M", "spikes/s", "41.2k", "active", "0.98×", "real time"]);
  assert.deepEqual(written("signals", 2, true), ["Grooming", "In", "Loom L", "Loom R", "Touch", "Antenna L", "Antenna R", "Wind", "Sweet", "On legs", "Male taste", "Wingbeat", "Light", "Hunger", "Out", "Hz", "Walk", "0", "Steer", "0·0", "Back up", "0", "Escape", "0", "Wings", "0", "Groom", "0", "Feed", "0", "Sing", "0"]);
  assert.deepEqual(written("day"), ["Grooming", "1.42", "m", "walked", "3", "meals", "7", "take-offs", "42", "s", "flying", "2", "min", "grooming"]);
  for (const [cols, side] of [[3, false], [2, false], [3, true]] as const) assert.equal(written("both", cols, side).length, 1 + 2 * 8 + 3, `${cols} across${side ? ", side by side" : ""}`);
  // Every cell inside the panel, in every arrangement.
  for (const kind of ["brain", "day", "both", "signals"] as const) {
    const arrangements = kind === "signals" ? ([[2, true], [1, false], [3, true]] as const) : ([[3, false], [2, false], ...(kind === "both" ? [[3, true] as const] : [])] as const);
    for (const [cols, side] of arrangements) {
      const shape = statsShape(kind, cols, side);
      const g = blankCanvas();
      drawStatsPanel(g, shape, state);
      // Where each starts, whichever way it is aligned.
      const all = writtenOn(g).map((w) => (w.align === "right" ? { ...w, x: w.x - w.width } : w));
      // Nothing written over anything else on its line.
      for (const a of all) for (const b of all) if (a !== b && a.y === b.y) assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x, `${kind}, ${cols} across: "${a.text}" and "${b.text}"`);
      for (const w of all) assert.ok(w.x >= 0 && w.x + w.width <= shape.width - 4 && w.y > 0 && w.y <= shape.height - 4, `${kind}, ${cols} across${side ? ", side by side" : ""}: "${w.text}" at ${w.x.toFixed(0)},${w.y.toFixed(0)} in ${shape.width}×${shape.height}`);
    }
  }
});

test("in and out are the senses as sent and the commands as answered, each to the step it is drawn in, with the rates of the neurons each is read from", () => {
  const sensed = { loomLeft: 0.5, loomRight: 0.004, touch: 0, bumpLeft: 0, bumpRight: 0, wind: 0.25, sweet: 1, grounded: false, maleTaste: 0.75, hunger: 0.3, wingbeat: 0.5, light: { left: [0.2, 0.4], right: [0.6, 0.8] } };
  const brain: BrainState = {
    command: { walk: 0.8, turn: -0.5, back: 0, escape: 0, wings: 1, groom: 0, feed: 0.25, sing: 0 },
    stats: { simMs: 0, wallMs: 0, spikes: 0, active: 0, rates: { DNg100: 41.6, "DNa02 left": 30.2, "DNa02 right": 12.7, flight: 180, MN9: 3.4, pIP10: 0.2 } },
  };
  const state: StatsState = { activity: "walking", spikes: 0, active: 0, speed: 1, history: new Float32Array(HISTORY_SAMPLES), head: 0, day: freshDay("2026-11-16"), sensed, brain };
  const v = Array.from(readSignals(state, new Float32Array(SIGNALS)), (x) => Number(x.toFixed(2)));
  assert.deepEqual(v.slice(0, 12), [0.5, 0, 0, 0, 0, 0.25, 1, 0, 0.75, 0.5, 0.5, 0.3], "the senses: the light is the mean over every facet, a sense too small to show is none; then hunger");
  assert.deepEqual(v.slice(12, 20), [0.8, -0.5, 0, 0, 1, 0, 0.25, 0], "the commands, steering signed");
  assert.deepEqual(v.slice(20), [42, 30, 13, 0, 0, 180, 0, 3, 0], "each command's neurons, in whole Hz; a rate the brain doesn't report is none");
  const g = blankCanvas();
  drawStatsPanel(g, statsShape("signals", 1, false), state);
  const words = writtenOn(g).map((w) => w.text);
  assert.ok(words.includes("Walking") && words.includes("42") && words.includes("30·13") && words.includes("180"), words.join(" "));
});
