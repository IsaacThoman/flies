import assert from "node:assert/strict";
import { test } from "node:test";
import { RESTAURANT, RESTAURANT_START, TABLE_TOPS, World, WORLDS, createPicnic } from "@fly/world";
import { AIRBORNE, COLOURS, Leash, MAX_FLIGHT, MAX_FLIES, MAX_OWN, MAX_WALK, PASSWORD_MAX, ROOM_NAME_MAX, Rate, couldBe, createFlyState, isPassword, mayReturnTo, roomName, spawnSpot } from "../src/index.ts";

const world = createPicnic();
const start = world.place.start;

function at(x: number, z: number, t: number, flags = 0) {
  const s = createFlyState();
  s.x = x;
  s.y = world.heightAt(x, z);
  s.z = z;
  s.t = t;
  s.flags = flags;
  return s;
}

test("a fly walking at a fly's pace is taken where its device says", () => {
  const leash = new Leash();
  const last = at(start.x, start.z, 1000);
  for (let i = 1; i <= 40; i++) assert.equal(leash.admit(world, last, at(start.x + i * 0.75, start.z, 1000 + i * 50), 1000 + i * 50), "taken");
  assert.ok(Math.abs(last.x - (start.x + 30)) < 1e-9);
});

test("a jump across the table is cut short to what a fly could have walked: it is never taken where it says", () => {
  const leash = new Leash();
  const last = at(start.x, start.z, 1000);
  // A stalled device, or a lying one, says its fly is 200 mm away half a second later, again and again.
  let t = 1000;
  for (let i = 0; i < 20; i++) {
    t += 500;
    const result = leash.admit(world, last, at(start.x + 200, start.z, t), t);
    assert.ok(result !== "refused", result);
  }
  // In ten seconds it has come no further than ten seconds' walk and a second saved up.
  assert.ok(last.x - start.x <= MAX_WALK * 11 + 1, `came ${last.x - start.x} mm`);
  assert.ok(last.x - start.x < 200 || t - 1000 >= (200 / MAX_WALK) * 1000);
  // In the air it may go faster, but no faster than a fly flies.
  const flying = new Leash();
  const up = at(start.x, start.z, 0, AIRBORNE);
  up.y = 40;
  const far = at(start.x + 300, start.z, 100, AIRBORNE);
  far.y = 40;
  flying.admit(world, up, far, 100);
  assert.ok(up.x - start.x <= MAX_FLIGHT * 0.1 + 1);
});

test("a state from the future, an old one, or from somewhere a fly can't be is not taken", () => {
  const leash = new Leash();
  const last = at(start.x, start.z, 1000);
  assert.equal(leash.admit(world, last, at(start.x, start.z, 5000), 1000), "refused");
  assert.equal(leash.admit(world, last, at(start.x, start.z, 900), 1000), "refused");
  // On its feet a metre off the table: held where it was.
  const off = at(start.x, start.z, 1050);
  off.x = 2000;
  assert.equal(leash.admit(world, last, off, 1050), "held");
  assert.equal(last.x, start.x);
  assert.ok(!couldBe(world, 0, -5, 0, false), "under the table");
  assert.ok(!couldBe(world, NaN, 0, 0, true));
  assert.ok(couldBe(world, 300, 60, 300, true), "in the air past the edge");
  assert.ok(!couldBe(world, 300, 60, 300, false), "standing on nothing");
});

test("coming back, a fly may be where it walked to meanwhile, but not across the table", () => {
  assert.ok(mayReturnTo(world, [start.x + 20, start.z, 0], start.x, 0, start.z, 2));
  assert.ok(!mayReturnTo(world, [start.x + 250, start.z, 0], start.x, 0, start.z, 2));
  assert.ok(mayReturnTo(world, [start.x + 150, start.z, 0], start.x, 0, start.z, 9));
  assert.ok(!mayReturnTo(world, [start.x + 250, start.z, 0], start.x, 0, start.z, 3600), "however long it was away");
  assert.ok(!mayReturnTo(world, [5000, 0, 0], start.x, 0, start.z, 2));
});

test("every player's fly at a full table is set down on somewhere level near the place's start, apart from the others, in every place", () => {
  for (const [id, place] of Object.entries(WORLDS)) {
    const w = new World(place);
    const spots = Array.from({ length: MAX_FLIES }, (_, i) => spawnSpot(w, i + 1));
    const height = w.heightAt(place.start.x, place.start.z, place.start.y);
    assert.deepEqual(spots[0], [place.start.x, place.start.z, place.start.yaw, height], id);
    for (const [x, z, , y] of spots) {
      assert.ok(w.onTable(x, z) && couldBe(w, x, y!, z, false), `${id}: somewhere it could stand`);
      assert.ok(y! < height + 0.5 && y! > height - 50.5, `${id}: at the start's height, or a hop below it`);
      assert.ok(w.solidAt(x, y! + 1, z) < 0, `${id}: with air over it`);
    }
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) assert.ok(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]) > 2.5, `${id}: ${i + 1} and ${j + 1} apart`);
    }
  }
});

test("in the restaurant the flies are set down on the window table, not on the ceiling over it or the floor under it", () => {
  const room = new World(RESTAURANT);
  for (let id = 1; id <= MAX_FLIES; id++) assert.equal(spawnSpot(room, id)[3], TABLE_TOPS.round.top);
});

test("in a room the leash knows the table from the floor under it: a fly may stand on either, never inside the table", () => {
  const room = new World(RESTAURANT);
  // Beside the window table's foot, under its top.
  const x = RESTAURANT_START.x + 200;
  const z = RESTAURANT_START.z;
  const top = TABLE_TOPS.round.top;
  assert.ok(couldBe(room, x, top, z, false), "on the table");
  assert.ok(couldBe(room, x, 0, z, false), "on the floor under it");
  assert.ok(couldBe(room, x, 300, z, true), "flying under it");
  assert.ok(!couldBe(room, x, top - 10, z, true), "inside the table top");
  assert.ok(!couldBe(room, x, 300, z, false), "standing on the air under it");
  assert.ok(couldBe(room, 4400, 1500, 0, true) && !couldBe(room, 4800, 1500, 0, true), "in the air not far past the floor's edge");
  // Walking under the table, cut short, it stays on the floor.
  const leash = new Leash();
  const last = createFlyState();
  last.x = x;
  last.z = z - 100;
  last.t = 1000;
  const next = createFlyState();
  next.x = x;
  next.z = z + 100;
  next.t = 1100;
  assert.equal(leash.admit(room, last, next, 1100), "shortened");
  assert.equal(last.y, 0);
  // Coming back, it may be on the table it was on, but not on the floor under it.
  assert.ok(mayReturnTo(room, [x + 5, z, 0, top], x, top, z, 2));
  assert.ok(!mayReturnTo(room, [x + 5, z, 0, 0], x, top, z, 2));
});

test("a rate allows a few at once, then so many a minute", () => {
  const rate = new Rate(6, 2);
  assert.ok(rate.take(0));
  assert.ok(rate.take(0));
  assert.ok(!rate.take(0));
  assert.ok(!rate.take(5_000));
  assert.ok(rate.take(10_000));
});

test("a room's name is tidied to plain words, short, or refused", () => {
  assert.equal(roomName("  Sunny   crumbs "), "Sunny crumbs");
  assert.equal(roomName("Café 9 & co."), "Café 9 & co.");
  assert.equal(roomName("Café"), "Café", "composed, so it counts and compares as it shows");
  assert.equal(roomName("いえ のハエ"), "いえ のハエ");
  assert.equal(roomName("x".repeat(ROOM_NAME_MAX)), "x".repeat(ROOM_NAME_MAX));
  for (const bad of ["", "   ", "x".repeat(ROOM_NAME_MAX + 1), "a\u0000b", "tab\u0007", "evil‮txt", "zero​width", "<b>hi</b>", "fly 🪰", "a\nb\nc".repeat(40), 42, null])
    assert.equal(roomName(bad), bad === "a\nb\nc".repeat(40) ? null : null, String(bad));
  // A new line is a space, like any other.
  assert.equal(roomName("two\nlines"), "two lines");
});

test("a room's name can't look empty, hide letters that draw nothing, or pile marks over the rows round it; every script's words still can", () => {
  // Hangul fillers are letters that draw nothing; the others are invisible.
  for (const bad of ["\u3164", "\u3164\u3164 \u3164", "Fly\u3164s", "\uFFA0room", "\u115F\u1160", "soft\u00ADhyphen", "a\u034Fb", "word\u2060joiner", "Z\u0351\u0352\u0353\u0354algo", "e\u0301\u0302\u0303\u0304\u0305"])
    assert.equal(roomName(bad), null, JSON.stringify(bad));
  for (const good of ["नमस्ते दुनिया", "Phở ngon", "สวัสดี", "안녕 파리", "مرحبا", "Ελληνικά", "ກິ່ງ", "བཀྲ ཤིས"]) assert.equal(roomName(good), good.normalize("NFC"), good);
});

test("a password is anything typed, up to its length, and nothing invisible", () => {
  assert.ok(isPassword("correct horse"));
  assert.ok(isPassword("пароль ✓"));
  assert.ok(isPassword("x".repeat(PASSWORD_MAX)));
  for (const bad of ["", "x".repeat(PASSWORD_MAX + 1), "a\u0000", "line\nbreak", "zero​width", 7, undefined]) assert.ok(!isPassword(bad), String(bad));
});

test("a table holds 128 flies, a device can bring at most four, and any eight in a row have distinct colours", () => {
  assert.equal(MAX_FLIES, 128);
  assert.equal(MAX_OWN, 4);
  assert.equal(new Set(COLOURS).size, 8);
  assert.ok(MAX_FLIES < 256, "a fly's id is one byte on the wire");
});

test("a rate refills only at its stated pace and never banks more than a burst", () => {
  const rate = new Rate(6, 2);
  assert.ok(rate.take(0));
  assert.ok(rate.take(0));
  assert.equal(rate.take(9999), false);
  assert.ok(rate.take(10000));
  assert.equal(rate.take(10000), false);
  assert.ok(rate.take(600000));
  assert.ok(rate.take(600000));
  assert.equal(rate.take(600000), false);
});

test("a duplicate timestamp is refused without altering the last admitted fly; the future tolerance is inclusive", () => {
  const leash = new Leash();
  const last = at(start.x, start.z, 1000);
  const duplicate = at(start.x + 1, start.z, 1000);
  duplicate.seq = 12;
  const unchanged = structuredClone(last);
  assert.equal(leash.admit(world, last, duplicate, 1000), "refused");
  assert.deepEqual(last, unchanged);
  assert.equal(leash.admit(world, last, at(start.x, start.z, 1500), 1000), "taken");
  const admitted = structuredClone(last);
  assert.equal(leash.admit(world, last, at(start.x, start.z, 1501), 1000), "refused");
  assert.deepEqual(last, admitted);
});
