// Each fly is one fly from launch to launch: its record comes back as it was
// saved, with the time away lived out by the body's own sums; a record from
// another build, or a broken one, never stops the game; and each fly keeps its
// own record however the others come and go.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrainDriver } from "@fly/contracts";
import { HUNGER, Rhythm, SUMMER, THIRST_START, pressureLeftAlone, usualPressure } from "@fly/body";
import { Pantry, createPicnic } from "@fly/world";
import { MirroredBrain, unmirrored } from "../src/brain/mirror.ts";
import { COMPANION_RETRIES, Company } from "../src/company.ts";
import { FLY_LIMIT, FLY_VERSION, KEEP_EVERY, LEARNED_VERSION, Remembered, fromBase64, liveAway, loadFly, mirroredFly, note, restore, saveFly, toBase64 } from "../src/fly-record.ts";
import { newDeviceKey } from "../src/online/invite.ts";
import { Life } from "../src/life.ts";
import { clockHours } from "../src/scene/light.ts";

function memory(saved: Record<string, string> = {}) {
  return {
    saved,
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => {
      saved[key] = value;
    },
  };
}

/** A brain that runs until it is told it failed. */
const brain = (): BrainDriver & { status: BrainDriver["status"] } => ({
  status: "running", error: null, neurons: 0, connections: 0, eyes: null,
  regionRates: new Float32Array(), state: null, stateAt: 0, tick() {}, dispose() {},
});

let ids = 0;
const make = () => (++ids).toString(16).padStart(32, "0");

const HOUR = 3_600_000;
/** Midday on a summer's day, local time. */
const NOON = new Date(2026, 6, 1, 12).getTime();

function life(pace: "lively" | "natural" = "lively", at = NOON) {
  const l = new Life(createPicnic(), brain());
  l.rhythm = new Rhythm(clockHours(new Date(at)), SUMMER, undefined, pace);
  return l;
}

test("a fly comes back as it was saved: its id, its body and where it stood", () => {
  const store = memory();
  const fly = loadFly(0, NOON, make, store);
  assert.equal(fly.body, null, "a new fly has lived nothing yet");
  assert.ok(store.saved["flies.fly.0"], "a new fly is saved at once, so it is the same fly from now on");
  const before = life();
  before.hunger.level = 0.31;
  before.hunger.fullness = 0.42;
  before.thirst.level = 0.64;
  before.rhythm!.pressure = 0.53;
  before.setDown(30, -20, 1.2);
  note(fly, before, "picnic", NOON);
  assert.ok(saveFly(0, fly, store));
  const saved = JSON.parse(store.saved["flies.fly.0"]);
  assert.equal(saved.v, FLY_VERSION);

  const again = loadFly(0, NOON, make, store);
  assert.deepEqual(again, { ...fly, others: {} });
  const after = life();
  restore(again, after, NOON, SUMMER, "picnic", true);
  assert.deepEqual([after.hunger.level, after.hunger.fullness, after.thirst.level, after.rhythm!.pressure], [0.31, 0.42, 0.64, 0.53]);
  assert.deepEqual([after.body.position.x, after.body.position.z, after.body.yaw], [30, -20, 1.2]);
  assert.equal(after.body.position.y, before.body.position.y);
});

test("time away is lived out: hungrier and thirstier (to a point), the crop emptier, the sleep pressure as a fly left to itself would have it", () => {
  const store = memory();
  const fly = loadFly(0, NOON, make, store);
  const before = life();
  before.hunger.level = 0.1;
  before.hunger.fullness = 0.9;
  before.thirst.level = 0;
  before.rhythm!.pressure = 0.2;
  note(fly, before, "picnic", NOON);
  saveFly(0, fly, store);
  const later = NOON + 3 * HOUR;
  const after = life("lively", later);
  restore(loadFly(0, later, make, store), after, later, SUMMER, "picnic", true);
  assert.equal(after.hunger.level, HUNGER.start, "three hours away at hunger's pace: as hungry as a fly arrives, no more");
  assert.ok(after.hunger.fullness < 1e-6);
  assert.equal(after.thirst.level, THIRST_START, "and as thirsty as a fly arrives, no more");
  assert.equal(after.rhythm!.pressure, pressureLeftAlone(0.2, 12, 3 * 3600, SUMMER, "lively"));
  assert.ok(after.rhythm!.pressure > 0.2, "awake through a lively afternoon, it needs more sleep");

  // Away for days, it is as sleepy as the hour leaves any fly left to itself.
  const days = NOON + 5 * 24 * HOUR;
  const long = life("lively", days);
  restore(loadFly(0, days, make, store), long, days, SUMMER, "picnic", true);
  assert.ok(Math.abs(long.rhythm!.pressure - usualPressure(12, SUMMER, "lively")) < 1e-9);

  // Hidden while the game runs: the same sums, from the hour its clock stopped at.
  const hidden = life();
  hidden.rhythm!.pressure = 0.2;
  hidden.hunger.level = 0.1;
  hidden.thirst.level = 0;
  liveAway(hidden, 3 * 3600, hidden.rhythm!.hours, SUMMER);
  assert.deepEqual([hidden.hunger.level, hidden.thirst.level, hidden.rhythm!.pressure], [after.hunger.level, after.thirst.level, after.rhythm!.pressure]);

  // A fly that left thirstier than a new one comes back no less thirsty.
  const parched = life();
  parched.thirst.level = 0.9;
  liveAway(parched, 3 * 3600, 12, SUMMER);
  assert.ok(parched.thirst.level >= 0.9);
});

test("a clock gone backwards is no time away", () => {
  const store = memory();
  const fly = loadFly(0, NOON, make, store);
  const before = life();
  before.hunger.level = 0.2;
  before.hunger.fullness = 0.6;
  before.rhythm!.pressure = 0.3;
  note(fly, before, "picnic", NOON);
  saveFly(0, fly, store);
  const earlier = NOON - 5 * HOUR;
  const after = life("lively", earlier);
  restore(loadFly(0, earlier, make, store), after, earlier, SUMMER, "picnic", true);
  assert.deepEqual([after.hunger.level, after.hunger.fullness, after.rhythm!.pressure], [0.2, 0.6, 0.3]);
  const hidden = life();
  hidden.hunger.level = 0.2;
  liveAway(hidden, -3600, 12, SUMMER);
  assert.equal(hidden.hunger.level, 0.2);
});

test("its sleep pressure is kept at the pace it was built at; another pace starts as sleepy as that pace leaves it", () => {
  const store = memory();
  const fly = loadFly(0, NOON, make, store);
  const before = life("lively");
  before.rhythm!.pressure = 0.9;
  note(fly, before, "picnic", NOON);
  saveFly(0, fly, store);
  const after = life("natural");
  const usual = after.rhythm!.pressure;
  restore(loadFly(0, NOON + HOUR, make, store), after, NOON + HOUR, SUMMER, "picnic", true);
  assert.equal(after.rhythm!.pressure, usual);
});

test("where it stood only where it is again, alone, and still on the table", () => {
  const store = memory();
  const fly = loadFly(0, NOON, make, store);
  const before = life();
  before.setDown(25, 10, 0.5);
  note(fly, before, "picnic", NOON);
  const start = createPicnic().place.start;
  const at = (l: Life) => [l.body.position.x, l.body.position.z];
  for (const [here, alone] of [["kitchen", true], ["picnic", false]] as const) {
    const after = life();
    restore(fly, after, NOON, SUMMER, here, alone);
    assert.deepEqual(at(after), [start.x, start.z], `${here}, ${alone ? "alone" : "at a table"}: where the place starts it`);
  }
  fly.where = { place: "picnic", x: 1e6, y: 0, z: 0, yaw: 0 };
  const off = life();
  restore(fly, off, NOON, SUMMER, "picnic", true);
  assert.deepEqual(at(off), [start.x, start.z], "a spot off the table (a place changed since) is not stood on");
});

test("a broken record is a new fly; a broken part of one is a fresh part", () => {
  for (const broken of ["{", "null", "[]", "7", JSON.stringify({ v: 1 }), JSON.stringify({ v: 0, id: "ab".repeat(16) }), JSON.stringify({ v: 1.5, id: "ab".repeat(16) }), JSON.stringify({ v: 1, id: "not hex" })]) {
    const store = memory({ "flies.fly.2": broken });
    const fly = loadFly(2, NOON, () => "c".repeat(32), store);
    assert.equal(fly.id, "c".repeat(32), broken);
    assert.equal(fly.born, NOON);
    assert.equal(JSON.parse(store.saved["flies.fly.2"]).id, "c".repeat(32), "and it is saved as that");
  }
  const id = "ab".repeat(16);
  const store = memory({
    "flies.fly.0": JSON.stringify({ v: 1, id, born: "yesterday", at: null, body: { hunger: 2, fullness: 0.5, sleep: null }, where: { place: "moon", x: 0, y: 0, z: 0, yaw: 0 } }),
    "flies.fly.1": JSON.stringify({ v: 1, id, born: NOON - HOUR, at: NOON - HOUR, body: { hunger: 0.4, fullness: 0.5, sleep: { pressure: 0.5, pace: "frantic" } }, where: { place: "picnic", x: 1, y: 0, z: "two", yaw: 0 } }),
  });
  const zero = loadFly(0, NOON, make, store);
  assert.deepEqual([zero.id, zero.born, zero.at, zero.body, zero.where], [id, NOON, NOON, null, null]);
  const one = loadFly(1, NOON, make, store);
  assert.deepEqual([one.id, one.born, one.body, one.where], [id, NOON - HOUR, { hunger: 0.4, fullness: 0.5, thirst: null, sleep: null }, null]);
});

test("a record from a newer build keeps its identity and everything it holds, but none of its state is read", () => {
  const id = "ab".repeat(16);
  const learned = { v: 3, connectome: "x", data: "AAAA" };
  const store = memory({ "flies.fly.0": JSON.stringify({ v: FLY_VERSION + 1, id, born: NOON - HOUR, at: NOON - HOUR, body: { hunger: 0.1, fullness: 0.1, sleep: null }, where: null, learned }) });
  const fly = loadFly(0, NOON, make, store);
  assert.deepEqual([fly.id, fly.born, fly.body], [id, NOON - HOUR, null]);
  note(fly, life(), "picnic", NOON);
  saveFly(0, fly, store);
  const saved = JSON.parse(store.saved["flies.fly.0"]);
  assert.deepEqual(saved.learned, learned, "what this build doesn't know is carried through its saves");
  assert.equal(saved.v, FLY_VERSION);
});

test("a record grown past its limit isn't saved, and the one before it stays", () => {
  const store = memory();
  const fly = loadFly(0, NOON, make, store);
  const before = store.saved["flies.fly.0"];
  const big = { ...fly, others: { learned: "A".repeat(FLY_LIMIT) } };
  assert.equal(saveFly(0, big, store), false);
  assert.equal(store.saved["flies.fly.0"], before);
  assert.ok(saveFly(0, { ...fly, others: { learned: "A".repeat(FLY_LIMIT - 1000) } }, store));
});

test("each companion keeps its own record as others come and go", () => {
  const world = createPicnic();
  const pantry = new Pantry(world);
  const store = memory();
  const remembered = new Remembered(make, store);
  const company = new Company(
    world,
    brain,
    (c) => {
      c.life.rhythm = new Rhythm(12, SUMMER, undefined, "lively");
      remembered.arrive(c.slot, c.life, NOON, SUMMER, "picnic", true);
    },
    (c) => remembered.leave(c.slot, c.life, "picnic", NOON),
  );
  company.resize(3, pantry);
  assert.deepEqual(company.list.map((c) => c.slot), [1, 2, 3]);
  const id = (slot: number) => JSON.parse(store.saved[`flies.fly.${slot}`]).id as string;
  const [one, two, three] = [1, 2, 3].map(id);
  company.list[1].life.hunger.level = 0.05;
  // The middle one goes (its brain, and each new one, wouldn't run): the third moves up in line but stays the third fly.
  const middle = company.list[1];
  for (let time = 0; company.list.includes(middle); time += 100) {
    (unmirrored(middle.life.brain) as ReturnType<typeof brain>).status = "failed";
    company.tend(time);
  }
  assert.deepEqual(company.list.map((c) => c.slot), [1, 3]);
  assert.equal(JSON.parse(store.saved["flies.fly.2"]).body.hunger, 0.05, "the fly that went is kept as it went");
  for (const c of company.list) remembered.save(c.slot, c.life, "picnic", NOON);
  assert.deepEqual([1, 2, 3].map(id), [one, two, three], "no fly is saved over another");
  assert.equal(remembered.get(2), undefined);
  // More again: the fly that went comes back, as it was.
  company.resize(3, pantry);
  assert.deepEqual(company.list.map((c) => c.slot), [1, 3, 2]);
  assert.equal(remembered.get(2)?.id, two);
  assert.equal(company.list[2].life.hunger.level, 0.05);
  // Fewer: the last goes first, kept.
  company.resize(1, pantry);
  assert.deepEqual(company.list.map((c) => c.slot), [1]);
  assert.equal(remembered.get(3), undefined);
  assert.equal(id(3), three);
});

test("the flies are saved every half a minute while the game runs", () => {
  const remembered = new Remembered(make, memory());
  let saves = 0;
  for (let t = 0; t < 4 * KEEP_EVERY; t += 0.5) if (remembered.due(0.5)) saves++;
  assert.equal(saves, 4);
});

test("base64 goes both ways at every length, and anything else isn't read", () => {
  for (let n = 0; n < 7; n++) {
    const bytes = Uint8Array.from({ length: n }, (_, k) => (k * 97 + 255) & 255);
    const text = toBase64(bytes);
    assert.equal(text, Buffer.from(bytes).toString("base64"));
    assert.deepEqual(fromBase64(text), bytes);
  }
  for (const bad of ["abc", "ab!d", "a=bc", "===="]) assert.equal(fromBase64(bad), null);
});

test("what its brain learned is kept with the fly: given back as it arrives, taken again at each save", async () => {
  const store = memory();
  const taken: Uint8Array[] = [];
  let learned = Uint8Array.of(1, 2, 3);
  const learner = () => ({ ...brain(), importMemory: async (m: Uint8Array) => (taken.push(m), true), exportMemory: async () => learned });
  const remembered = new Remembered(make, store);
  const first = new Life(createPicnic(), learner());
  remembered.arrive(0, first, NOON, SUMMER, "picnic", true);
  assert.equal(taken.length, 0, "a new fly has nothing to give back");
  remembered.save(0, first, "picnic", NOON);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const saved = JSON.parse(store.saved["flies.fly.0"]);
  assert.deepEqual(saved.learned, { v: LEARNED_VERSION, data: toBase64(learned) }, "saved again once the brain answered");

  learned = Uint8Array.of(9);
  const again = new Remembered(make, store);
  const second = new Life(createPicnic(), learner());
  again.arrive(0, second, NOON + HOUR, SUMMER, "picnic", true);
  assert.deepEqual(taken, [Uint8Array.of(1, 2, 3)], "the brain is given what it had learned");

  // A brain with no memory to give (a stand-in, or one not running) leaves what was kept.
  const plain = new Remembered(make, store);
  const third = new Life(createPicnic(), brain());
  plain.arrive(0, third, NOON + 2 * HOUR, SUMMER, "picnic", true);
  plain.save(0, third, "picnic", NOON + 2 * HOUR);
  assert.deepEqual(JSON.parse(store.saved["flies.fly.0"]).learned, saved.learned);
});

test("a memory this build can't read is carried through saves as it was; the largest this brain can learn fits in a record", () => {
  const store = memory();
  const fly = loadFly(0, NOON, make, store);
  store.saved["flies.fly.0"] = JSON.stringify({ ...JSON.parse(store.saved["flies.fly.0"]), learned: { v: 99, data: "future" } });
  const back = loadFly(0, NOON, make, store);
  assert.equal(back.learned, null);
  assert.ok(saveFly(0, back, store));
  assert.deepEqual(JSON.parse(store.saved["flies.fly.0"]).learned, { v: 99, data: "future" });
  // Every one of its 33,496 learning synapses changed: the memory's dense form, 24 bytes and one a synapse.
  fly.learned = { v: LEARNED_VERSION, data: toBase64(new Uint8Array(24 + 33_496).fill(200)) };
  fly.body = { hunger: 0.5, fullness: 0.5, thirst: 0.5, sleep: { pressure: 0.5, pace: "natural" } };
  fly.where = { place: "picnic", x: 1, y: 2, z: 3, yaw: 4 };
  assert.ok(saveFly(0, fly, store));
  assert.ok(store.saved["flies.fly.0"].length < FLY_LIMIT / 2);
});

test("half the flies are the traced fly's mirror image, each by its id from launch to launch; a fly from before keeps everything it has", async () => {
  let mirrored = 0;
  const n = 20_000;
  for (let i = 0; i < n; i++) if (mirroredFly(newDeviceKey())) mirrored++;
  // Within 3 standard deviations of half (0.35% at this many).
  assert.ok(Math.abs(mirrored / n - 0.5) < 0.0106, `${mirrored} of ${n}`);

  // A fly saved before there were mirrored flies, its id's last digit odd: everything it had, and nothing added.
  const store = memory();
  const old = { v: 1, id: "0123456789abcdef0123456789abcdef", born: NOON - HOUR, at: NOON - HOUR, body: { hunger: 0.2, fullness: 0.3, thirst: 0.4, sleep: null }, where: null, learned: { v: LEARNED_VERSION, data: toBase64(Uint8Array.of(7, 8)) } };
  store.saved["flies.fly.0"] = JSON.stringify(old);
  const taken: Uint8Array[] = [];
  const own = { ...brain(), importMemory: async (m: Uint8Array) => (taken.push(m), true), exportMemory: async () => Uint8Array.of(7, 8) };
  const fly = new Life(createPicnic(), own);
  const remembered = new Remembered(make, store);
  remembered.arrive(0, fly, NOON, SUMMER, "picnic", true);
  assert.ok(fly.mirrored);
  assert.ok(fly.brain instanceof MirroredBrain);
  assert.equal(unmirrored(fly.brain), own);
  assert.deepEqual(taken, [Uint8Array.of(7, 8)], "what it learned still loads: the wiring is the same");
  remembered.save(0, fly, "picnic", NOON);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const saved = JSON.parse(store.saved["flies.fly.0"]);
  assert.deepEqual(Object.keys(saved).sort(), Object.keys(old).sort());
  assert.equal(saved.id, old.id);
  assert.deepEqual(saved.learned, old.learned);
  const again = new Life(createPicnic(), brain());
  new Remembered(make, store).arrive(0, again, NOON + HOUR, SUMMER, "picnic", true);
  assert.ok(again.mirrored, "the same fly, mirrored again");

  // One whose id's last digit is even isn't.
  store.saved["flies.fly.1"] = JSON.stringify({ ...old, id: "0123456789abcdef0123456789abcdee" });
  const plain = brain();
  const other = new Life(createPicnic(), plain);
  remembered.arrive(1, other, NOON, SUMMER, "picnic", true);
  assert.ok(!other.mirrored);
  assert.equal(other.brain, plain);
});

test("a mirrored companion whose brain failed gets its new brain behind the mirror too", () => {
  const world = createPicnic();
  const company = new Company(world, brain, (c) => c.life.mirror(true));
  company.resize(1, new Pantry(world));
  const c = company.list[0];
  const first = unmirrored(c.life.brain);
  (first as ReturnType<typeof brain>).status = "failed";
  company.tend(0);
  company.tend(COMPANION_RETRIES[0]);
  assert.notEqual(unmirrored(c.life.brain), first);
  assert.ok(c.life.brain instanceof MirroredBrain);
});
