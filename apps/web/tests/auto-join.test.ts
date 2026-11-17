// A launch is at home unless it is invited, or still at a room of its own, or
// on a visit; a visit waits for the brain and the network, gives up quietly,
// never goes on once the player has gone home, and follows the place chosen
// to that place's room.

import assert from "node:assert/strict";
import { test } from "node:test";
import { EVERYONE, EVERYONE_SERIES, everyoneCode, seriesCode, seriesFor } from "@fly/net";
import { ATTEMPT, AutoJoin, RETRY, launchSeat } from "../src/online/auto-join.ts";
import type { AutoJoinNow } from "../src/online/auto-join.ts";

const READY: AutoJoinNow = { enabled: true, awake: true, network: true, atRoom: false, series: 0, atSeries: -1 };
const TRYING: AutoJoinNow = { ...READY, atRoom: true };

test("at home a launch sits nowhere, however long it waits, awake and online, even with a room open to everyone it was last in", () => {
  assert.deepEqual(launchSeat(null, null), { sit: null, visit: null });
  assert.deepEqual(launchSeat(null, EVERYONE), { sit: null, visit: null }, "the room open to everyone a visit (or an older build) was last in");
  const home = { ...READY, enabled: false };
  for (const kept of [null, EVERYONE, seriesCode(seriesFor("lab"), 2)]) {
    const auto = new AutoJoin(kept);
    for (let i = 0; i < 100; i++) assert.equal(auto.update(60, home, false, false), null);
    // A network coming back, or the page shown again, doesn't start a visit either.
    auto.hurry();
    auto.resume();
    assert.equal(auto.update(0, home, false, false), null);
  }
});

test("a launch sits at a room of someone's own it is invited to or was still at, and visits a room open to everyone it is invited to", () => {
  assert.deepEqual(launchSeat("abcdefghjk", null), { sit: "abcdefghjk", visit: null });
  assert.deepEqual(launchSeat(null, "abcdefghjk"), { sit: "abcdefghjk", visit: null });
  assert.deepEqual(launchSeat("bcdefghjkm", "abcdefghjk"), { sit: "bcdefghjkm", visit: null }, "the invitation, over the room it was at");
  assert.deepEqual(launchSeat(EVERYONE, "abcdefghjk"), { sit: null, visit: EVERYONE });
  assert.deepEqual(launchSeat(seriesCode(seriesFor("kitchen")), null), { sit: null, visit: seriesCode(seriesFor("kitchen")) });
});

test("on a visit, its room comes back on a later launch, the one it was last let into", () => {
  const auto = new AutoJoin(everyoneCode(3));
  assert.equal(auto.update(0, READY, false, false), "join");
  assert.equal(auto.code, everyoneCode(3));
});

test("joining waits until the brain is awake, the setting is on, a network is available and no room is occupied", () => {
  for (const blocked of [{ awake: false }, { enabled: false }, { network: false }, { atRoom: true }]) {
    const auto = new AutoJoin(null);
    assert.equal(auto.stopped, false);
    assert.equal(auto.trying, false);
    assert.equal(auto.update(1000, { ...READY, ...blocked }, false, false), null, JSON.stringify(blocked));
    assert.equal(auto.trying, false);
    assert.equal(auto.update(0, READY, false, false), "join");
    assert.equal(auto.trying, true);
    assert.equal(auto.update(0, TRYING, false, false), null, "one try at a time");
  }
});

test("turning off joining never starts a try and abandons one already under way", () => {
  const auto = new AutoJoin(null);
  const off = { ...READY, enabled: false };
  for (let i = 0; i < 5; i++) assert.equal(auto.update(1000, off, false, false), null);
  assert.equal(auto.update(0, READY, false, false), "join");
  assert.equal(auto.update(0, { ...TRYING, enabled: false }, false, false), "abandon");
  assert.equal(auto.trying, false);
  for (let i = 0; i < 5; i++) assert.equal(auto.update(1000, off, false, false), null);
});

test("an offline device waits and joins as soon as its network is back", () => {
  const auto = new AutoJoin(null);
  const offline = { ...READY, network: false };
  assert.equal(auto.update(1000, offline, false, false), null);
  auto.hurry();
  assert.equal(auto.update(0, offline, false, false), null);
  assert.equal(auto.update(0, READY, false, false), "join");
});

test("an unreachable server is abandoned after a reconnection or an unwelcome try and retried less often up to the longest delay", () => {
  assert.equal(ATTEMPT, 10);
  assert.deepEqual(RETRY, [30, 60, 120, 300]);
  for (const failure of ["reconnected", "timeout"]) {
    const auto = new AutoJoin(null);
    assert.equal(auto.update(0, READY, false, false), "join");
    for (const wait of [...RETRY, RETRY.at(-1)!]) {
      if (failure === "timeout") assert.equal(auto.update(ATTEMPT, TRYING, false, false), null);
      assert.equal(auto.update(failure === "timeout" ? 0.25 : 0, TRYING, false, failure === "reconnected"), "abandon", failure);
      assert.equal(auto.trying, false);
      assert.equal(auto.stopped, false, "a failed try does not end joining for the launch");
      assert.equal(auto.update(wait - 0.25, READY, false, false), null, `${failure}: still waiting before ${wait} s`);
      assert.equal(auto.update(0.25, READY, false, false), "join", `${failure}: due at ${wait} s`);
    }
  }
});

test("hurrying makes a waiting try due at once without replacing a try already under way", () => {
  const auto = new AutoJoin(null);
  assert.equal(auto.update(0, READY, false, false), "join");
  auto.hurry();
  assert.equal(auto.update(0, TRYING, false, false), null);
  assert.equal(auto.update(0, TRYING, false, true), "abandon");
  assert.equal(auto.update(0, READY, false, false), null);
  auto.hurry();
  assert.equal(auto.update(0, READY, false, false), "join");
});

test("a welcome ends the try and resets the next failure to the shortest delay", () => {
  const auto = new AutoJoin(null);
  assert.equal(auto.update(0, READY, false, false), "join");
  for (const wait of RETRY.slice(0, 2)) {
    assert.equal(auto.update(0, TRYING, false, true), "abandon");
    assert.equal(auto.update(wait, READY, false, false), "join");
  }
  assert.equal(auto.update(1, TRYING, true, true), null, "a welcome wins even if the line has reopened");
  assert.equal(auto.trying, false);
  assert.equal(auto.update(1000, TRYING, true, false), null, "already at the room");
  auto.ended("busy");
  assert.equal(auto.update(RETRY[0] - 0.25, READY, false, false), null);
  assert.equal(auto.update(0.25, READY, false, false), "join");
});

test("losing the seat to another window, an unknown room or removal stops joining for the launch", () => {
  for (const reason of ["elsewhere", "unknown", "removed"] as const) {
    const auto = new AutoJoin(null);
    assert.equal(auto.update(0, READY, false, false), "join");
    auto.ended(reason);
    assert.equal(auto.trying, false, reason);
    assert.equal(auto.stopped, true, reason);
    assert.equal(auto.update(1000, READY, false, false), null, reason);
    auto.hurry();
    assert.equal(auto.update(1000, READY, false, false), null, "hurrying cannot undo a stop");
  }
});

test("a full or busy room, or one left, is tried again later with increasing delays", () => {
  for (const reason of ["full", "busy", "left"] as const) {
    const auto = new AutoJoin(null);
    assert.equal(auto.update(0, READY, false, false), "join");
    for (const wait of RETRY.slice(0, 2)) {
      auto.ended(reason);
      assert.equal(auto.trying, false, reason);
      assert.equal(auto.stopped, false, reason);
      assert.equal(auto.update(wait - 0.25, READY, false, false), null, reason);
      assert.equal(auto.update(0.25, READY, false, false), "join", reason);
    }
  }
});

test("resuming after a stop permits an immediate try while still respecting the setting and network", () => {
  const auto = new AutoJoin(null);
  assert.equal(auto.update(0, READY, false, false), "join");
  auto.ended("busy");
  auto.ended("left");
  auto.resume();
  assert.equal(auto.stopped, false);
  assert.equal(auto.update(0, { ...READY, enabled: false }, false, false), null);
  assert.equal(auto.update(0, { ...READY, network: false }, false, false), null);
  assert.equal(auto.update(0, READY, false, false), "join");
});

test("the last room is kept only if it was open to everyone, and only for its own series", () => {
  for (const code of [EVERYONE, everyoneCode(7), everyoneCode(63)]) assert.equal(new AutoJoin(code).code, code);
  for (const code of [null, "abcdefghjk"]) assert.equal(new AutoJoin(code).code, EVERYONE);
  const auto = new AutoJoin(everyoneCode(7));
  const lab = seriesFor("lab");
  assert.ok(lab > 0 && lab < EVERYONE_SERIES);
  assert.equal(auto.update(0, { ...READY, series: lab }, false, false), "join");
  assert.equal(auto.code, seriesCode(lab), "another place's: the first of its rooms");
  auto.at(seriesCode(lab, 3));
  assert.equal(auto.code, seriesCode(lab, 3), "where it was let in, to come back to");
  auto.at("abcdefghjk");
  assert.equal(auto.code, seriesCode(lab, 3), "a room of someone's own is not where it comes back to by default");
  assert.equal(seriesFor("turns"), 0);
});

test("a device in another place's room than the one it lives in goes to its own at once, as a try, and never while disconnecting", () => {
  const auto = new AutoJoin(null);
  const lab = seriesFor("lab");
  const kitchen = seriesFor("kitchen");
  assert.equal(auto.update(0, READY, false, false), "join");
  assert.equal(auto.update(0, TRYING, true, false), null);
  const there = { ...TRYING, atSeries: 0 };
  assert.equal(auto.update(1, there, true, false), null, "where it belongs");
  assert.equal(auto.update(0, { ...there, series: lab }, true, false), "switch");
  assert.equal(auto.code, seriesCode(lab));
  assert.equal(auto.trying, true);
  // On the way: not welcomed yet, so in no room's series.
  assert.equal(auto.update(0, { ...TRYING, series: lab }, false, false), null);
  assert.equal(auto.update(0, { ...TRYING, series: lab, atSeries: lab }, true, false), null);
  assert.equal(auto.trying, false);
  assert.equal(auto.update(0, { ...TRYING, series: kitchen, atSeries: lab, enabled: false }, true, false), null);
  // A switch that isn't let in in time is given up like any try.
  assert.equal(auto.update(0, { ...TRYING, series: kitchen, atSeries: lab }, true, false), "switch");
  assert.equal(auto.update(ATTEMPT + 0.25, { ...TRYING, series: kitchen }, false, false), "abandon");
  assert.equal(auto.update(RETRY[0] - 0.25, { ...READY, series: kitchen }, false, false), null);
  assert.equal(auto.update(0.25, { ...READY, series: kitchen }, false, false), "join");
});
