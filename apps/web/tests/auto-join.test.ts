// Sitting with everyone waits for the brain and the network, gives up quietly,
// and never undoes a player's choice to leave.

import assert from "node:assert/strict";
import { test } from "node:test";
import { EVERYONE, everyoneCode } from "@fly/net";
import { ATTEMPT, AutoJoin, RETRY } from "../src/online/auto-join.ts";
import type { AutoJoinNow } from "../src/online/auto-join.ts";

const READY: AutoJoinNow = { enabled: true, awake: true, network: true, atRoom: false };
const TRYING: AutoJoinNow = { ...READY, atRoom: true };

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

test("leaving, losing the seat to another window, an unknown room or removal stops joining for the launch", () => {
  for (const reason of ["left", "elsewhere", "unknown", "removed"] as const) {
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

test("a full or busy room is tried again later with increasing delays", () => {
  for (const reason of ["full", "busy"] as const) {
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

test("the last room is kept only if it was open to everyone", () => {
  for (const code of [EVERYONE, everyoneCode(7), everyoneCode(63)]) assert.equal(new AutoJoin(code).code, code);
  for (const code of [null, "abcdefghjk"]) assert.equal(new AutoJoin(code).code, EVERYONE);
});
