import assert from "node:assert/strict";
import { test } from "node:test";
import { REGIONS } from "@fly/brain";
import type { BrainSenses, BrainState } from "@fly/brain";
import { TURN_RATE, createIntent } from "@fly/body";
import type { Intent } from "@fly/body";
import { SOMA_GROUPS } from "@fly/fly";
import { COMMAND_ORDER } from "@fly/contracts";
import { SENSES } from "../src/stats/panel.ts";
import { ACTIONS, AT, CAPACITY, Clip, READ_COMMANDS, READ_SENSES, Recorder, SAMPLE_HZ, STRIDE, actionsOf } from "../src/why/recorder.ts";
import type { Recorded } from "../src/why/recorder.ts";
import { AFTER, BEFORE, explain } from "../src/why/pick.ts";
import { CARD_KINDS, cardLayout, cardShape, fromOnset } from "../src/why/replay.ts";
import { TV_FRAME } from "../src/display.ts";
import { hudLayout, safeRect } from "../src/ui/layout.ts";
import { frames } from "./shapes.ts";

const DT = 1 / 60;
const sense = (key: string) => SENSES.findIndex(([k]) => k === key);
const group = (rate: string) => SOMA_GROUPS.findIndex((g) => g.rate === rate);
const command = (key: string) => COMMAND_ORDER.indexOf(key as (typeof COMMAND_ORDER)[number]);

/** A fly to record: its brain's answer, what it feels and what its body does, all set by hand. */
function fly() {
  const regionRates = new Float32Array(REGIONS.length);
  const state: BrainState = { command: { walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0, lean: 0 }, stats: { simMs: 0, wallMs: 0, spikes: 0, active: 0, rates: {} } };
  const sensed: BrainSenses = { loomLeft: 0, loomRight: 0, touch: 0, bumpLeft: 0, bumpRight: 0, wind: 0, sweet: 0, bitter: 0, water: 0, grounded: true, maleTaste: 0, wingbeat: 0, hunger: 0.5 };
  const intent: Intent = { ...createIntent(), live: true };
  return { regionRates, state, sensed, intent, onFeet: true, jumped: false };
}

/** Records `seconds` of `f` as it is, a frame at a time. */
function run(recorder: Recorder, f: Recorded, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    recorder.record(DT, f);
    f.jumped = false;
  }
}

test("the recorder keeps the last six seconds at 30 samples a second, oldest first", () => {
  const recorder = new Recorder();
  const f = fly();
  const clip = new Clip();
  run(recorder, f, 1);
  recorder.copyTo(clip);
  assert.equal(clip.length, SAMPLE_HZ);
  // Ten seconds, each region's rate the time it was recorded at: only the last six are kept, in order.
  for (let t = 0; t < 10 - 1e-9; t += DT) {
    f.regionRates[3] = t;
    recorder.record(DT, f);
  }
  recorder.copyTo(clip);
  assert.equal(clip.length, CAPACITY);
  for (let i = 1; i < clip.length; i++) assert.ok(clip.at(i, AT.regions + 3) > clip.at(i - 1, AT.regions + 3), "oldest first");
  assert.ok(clip.at(0, AT.regions + 3) > 3.9 && clip.at(0, AT.regions + 3) < 4.1, "six seconds back");
  assert.ok(clip.at(CAPACITY - 1, AT.regions + 3) > 9.9, "up to now");
});

test("a sample holds each command, rate and sense at its peak since the last, so a short burst isn't missed", () => {
  const recorder = new Recorder();
  const f = fly();
  // Half a sample apart, at 60 frames a second: a giant-fiber burst and a loom one frame long.
  recorder.record(DT, f);
  f.state.command.escape = 0.8;
  f.state.stats.rates.DNp01 = 160;
  f.sensed.loomRight = 0.6;
  f.state.command.turn = -0.5;
  recorder.record(DT / 2, f);
  f.state.command.escape = 0.1;
  f.state.stats.rates.DNp01 = 20;
  f.sensed.loomRight = 0;
  f.state.command.turn = 0.2;
  recorder.record(DT, f);
  const clip = new Clip();
  recorder.copyTo(clip);
  assert.equal(clip.length, 1);
  assert.equal(clip.at(0, AT.commands + command("escape")), Math.fround(0.8));
  assert.equal(clip.at(0, AT.rates + group("DNp01")), 160);
  assert.equal(clip.at(0, AT.senses + sense("loomRight")), Math.fround(0.6));
  assert.equal(clip.at(0, AT.commands + command("turn")), -0.5, "steering keeps its sign at its largest");
  assert.equal(clip.at(0, AT.senses + sense("grounded")), 1);
  assert.equal(clip.at(0, AT.senses + sense("hunger")), 0.5);
  // The next sample starts again from what it is now.
  recorder.record(1 / SAMPLE_HZ, f);
  recorder.copyTo(clip);
  assert.equal(clip.at(1, AT.commands + command("escape")), Math.fround(0.1));
});

test("the recorder records nothing before the brain answers, and reads the senses and commands in their order", () => {
  const quiet = new Recorder();
  run(quiet, { ...fly(), state: null }, 1);
  assert.equal(quiet.length, 0);
  assert.equal(STRIDE, REGIONS.length + SOMA_GROUPS.length + COMMAND_ORDER.length + SENSES.length + 1);
  assert.deepEqual(READ_SENSES, SENSES.map(([key]) => key), "the senses are read in the In bars' order");
  assert.deepEqual(READ_COMMANDS, [...COMMAND_ORDER], "the commands in the brain's order");
});

test("what the body is doing is read from its intent: a take-off once, steering either way past the threshold", () => {
  const intent = { ...createIntent(), live: true };
  const bit = (a: string) => 1 << ACTIONS.indexOf(a as (typeof ACTIONS)[number]);
  assert.equal(actionsOf(intent, true, true), bit("takeoff"));
  intent.walking = true;
  intent.yawRate = 0.5 * TURN_RATE;
  assert.equal(actionsOf(intent, true, false), bit("walk") | bit("turnLeft"));
  intent.yawRate = -0.2 * TURN_RATE;
  assert.equal(actionsOf(intent, true, false), bit("walk"), "a small correction is no turn");
  intent.walking = false;
  intent.airYawRate = -4;
  assert.equal(actionsOf(intent, false, false), bit("turnRight"), "in the air, its air steering");
  // A long frame: the take-off is in the first sample it spans only.
  const recorder = new Recorder();
  const f = fly();
  f.jumped = true;
  recorder.record(3 / SAMPLE_HZ + 1e-6, f);
  const clip = new Clip();
  recorder.copyTo(clip);
  assert.equal(clip.length, 3);
  assert.deepEqual([0, 1, 2].map((i) => clip.doing(i, 0)), [true, false, false]);
});

test("a loom, then the giant fiber, then a take-off: Why? picks the take-off, its DNp01 and flight neurons, and the loom before it", () => {
  const recorder = new Recorder();
  const f = fly();
  // Walking about, then a ball looming on its right, the giant fiber firing, and away.
  f.intent.walking = true;
  run(recorder, f, 2);
  f.intent.walking = false;
  run(recorder, f, 0.5);
  f.sensed.loomRight = 0.7;
  f.sensed.loomLeft = 0.05;
  run(recorder, f, 0.3);
  f.state.command.escape = 0.9;
  f.state.stats.rates.DNp01 = 180;
  f.jumped = true;
  run(recorder, f, 0.1);
  f.onFeet = false;
  f.sensed.grounded = false;
  f.sensed.wingbeat = 1;
  f.sensed.loomRight = 0;
  run(recorder, f, 0.6);
  // Then turning in the air, which is less striking: the take-off is still what it plays.
  f.intent.airYawRate = 3;
  run(recorder, f, 0.5);
  const clip = new Clip();
  recorder.copyTo(clip);
  const why = explain(clip);
  assert.equal(why.action, "takeoff");
  assert.deepEqual(why.groups.map((g) => SOMA_GROUPS[g].rate), ["DNp01", "flight"]);
  assert.deepEqual(why.commands.map((c) => COMMAND_ORDER[c]), ["escape", "wings"]);
  assert.deepEqual(why.senses.map((s) => SENSES[s][0]), ["loomRight"], "the loom rose before it; the wingbeat and the loss of ground came after");
  assert.ok(clip.doing(why.onset, ACTIONS.indexOf("takeoff")));
  assert.equal(why.from, why.onset - BEFORE * SAMPLE_HZ);
  assert.equal(why.to, Math.min(clip.length, why.onset + AFTER * SAMPLE_HZ + 1));
});

test("sugar under its feet, then feeding: Why? picks feeding and MN9, with sweet before it", () => {
  const recorder = new Recorder();
  const f = fly();
  run(recorder, f, 1);
  f.sensed.sweet = 0.6;
  run(recorder, f, 0.4);
  f.intent.feeding = true;
  f.state.command.feed = 0.4;
  run(recorder, f, 1);
  const clip = new Clip();
  recorder.copyTo(clip);
  const why = explain(clip);
  assert.equal(why.action, "feed");
  assert.deepEqual(why.groups.map((g) => SOMA_GROUPS[g].rate), ["MN9"]);
  assert.deepEqual(why.senses.map((s) => SENSES[s][0]), ["sweet"]);
});

test("among actions of the same kind, the latest; a turn's side is its own DNa02; something under way since before is shown without a run-up", () => {
  const recorder = new Recorder();
  const f = fly();
  run(recorder, f, 0.5);
  f.intent.yawRate = -2;
  run(recorder, f, 0.5);
  f.intent.yawRate = 0;
  run(recorder, f, 0.5);
  f.intent.yawRate = 2;
  run(recorder, f, 0.5);
  const clip = new Clip();
  recorder.copyTo(clip);
  const turned = explain(clip);
  assert.equal(turned.action, "turnLeft", "positive yaw turns it toward its left");
  assert.deepEqual(turned.groups.map((g) => SOMA_GROUPS[g].rate), ["DNa02 left"]);
  assert.deepEqual(turned.senses, []);

  // Grooming the whole time it was recorded: no onset, the last three seconds.
  const grooming = new Recorder();
  const g = fly();
  g.intent.groom = 0.8;
  run(grooming, g, 5);
  grooming.copyTo(clip);
  const ongoing = explain(clip);
  assert.equal(ongoing.action, "groom");
  assert.equal(ongoing.onset, -1);
  assert.equal(ongoing.to - ongoing.from, (BEFORE + AFTER) * SAMPLE_HZ);
  assert.deepEqual(ongoing.groups.map((i) => SOMA_GROUPS[i].rate), ["DNg12"]);

  // Resting throughout: nothing to show but what was recorded.
  const resting = new Recorder();
  run(resting, fly(), 2);
  resting.copyTo(clip);
  const nothing = explain(clip);
  assert.equal(nothing.action, null);
  assert.deepEqual([nothing.groups, nothing.senses], [[], []]);
  assert.equal(nothing.to, clip.length);
});

test("the card fits between the caption and the tool's label on every screen, as large as any of its shapes can, its picture over the bars on a narrow one", () => {
  for (const [name, frame] of [["the TV", TV_FRAME] as const, ...frames()]) {
    const hud = hudLayout(frame);
    const a = safeRect(frame);
    const { rect, scale, shape } = cardLayout(frame, hud);
    assert.ok(rect.x >= a.x - 1e-6 && rect.x + rect.width <= a.x + a.w + 1e-6, `${name}: across`);
    assert.ok(rect.y >= hud.captionY + 23 - 1e-6 && rect.y + rect.height <= hud.labelY - 29 + 1e-6, `${name}: down`);
    // The smallest phone upright, short for seventeen senses in a column, is the least (0.54).
    assert.ok(scale > 0.53, `${name}: readable (${scale.toFixed(2)})`);
    for (const kind of CARD_KINDS) {
      const other = cardShape(kind);
      assert.ok(scale >= Math.min(1.6, (a.w * 0.84) / other.width, (Math.min(a.y + a.h * 0.73, hud.labelY - 29) - Math.max(a.y + a.h * 0.11, hud.captionY + 23)) / other.height) - 1e-9, `${name}: none larger than ${kind}`);
    }
    if (name === "a phone upright") assert.ok(shape.height > shape.width, `${name}: one over the other`);
  }
  assert.equal(fromOnset(-0.4), "−0.40 s");
  assert.equal(fromOnset(0), "0.00 s");
  assert.equal(fromOnset(0.25), "+0.25 s");
});
