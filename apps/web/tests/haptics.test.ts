import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { FEELS, HOLD_EVERY, Haptics } from "../src/haptics.ts";
import type { Device } from "../src/input.ts";

type Effect = { duration: number; weakMagnitude: number; strongMagnitude: number };

function setup(device: Device, effects = 7) {
  const devices = { current: device };
  const played: Effect[] = [];
  const buzzed: (number | number[])[] = [];
  const pad = { connected: true, vibrationActuator: { playEffect: (_type: "dual-rumble", e: Effect) => (played.push({ ...e }), Promise.resolve("complete")) } };
  const haptics = new Haptics(devices, () => [null, { connected: true, vibrationActuator: null }, pad], (p) => (buzzed.push(Array.isArray(p) ? [...p] : p), true));
  haptics.setVolume(effects);
  return { devices, played, buzzed, haptics };
}

test("nothing rumbles where nothing can: the remote, a mouse, a keyboard", () => {
  for (const device of ["remote", "mouse", "keys"] as const) {
    const { played, buzzed, haptics } = setup(device);
    for (const kind of Object.keys(FEELS) as (keyof typeof FEELS)[]) haptics.feel(kind);
    haptics.held(1, 0, 1);
    assert.equal(played.length + buzzed.length, 0, device);
  }
});

test("a pad feels each one-off on its motors, as strong as the effects are loud, and not at all with them off", () => {
  const { played, haptics } = setup("pad");
  haptics.feel("drop");
  assert.deepEqual(played, [{ startDelay: 0, duration: FEELS.drop.ms, weakMagnitude: FEELS.drop.weak, strongMagnitude: FEELS.drop.strong }]);
  haptics.setVolume(3.5);
  haptics.feel("takeoff");
  assert.equal(played[1].strongMagnitude, FEELS.takeoff.strong / 2);
  haptics.setVolume(10);
  haptics.feel("takeoff");
  assert.equal(played[2].strongMagnitude, FEELS.takeoff.strong, "louder than designed doesn't rumble harder");
  haptics.setVolume(0);
  haptics.feel("swoop");
  assert.equal(played.length, 3);
});

test("a refusal is two knocks, the second after the first has played (a new effect would cut it short)", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { played, haptics } = setup("pad");
    haptics.feel("blocked");
    assert.equal(played.length, 1);
    mock.timers.tick(FEELS.blocked.again! - 1);
    assert.equal(played.length, 1);
    mock.timers.tick(1);
    assert.equal(played.length, 2);
    assert.deepEqual(played[1], played[0]);
  } finally {
    mock.timers.reset();
  }
});

test("a phone buzzes instead, shorter for a lighter feel, and twice for a refusal", () => {
  const { buzzed, haptics } = setup("touch");
  haptics.feel("land");
  haptics.feel("takeoff");
  haptics.feel("blocked");
  assert.equal(buzzed.length, 3);
  assert.ok((buzzed[0] as number) < (buzzed[1] as number));
  const [on, off, again] = buzzed[2] as number[];
  assert.equal(on, again);
  assert.equal(on + off, FEELS.blocked.again);
});

test("a held tool pulses a few times a second, not every frame, and stops when it stops", () => {
  const { played, haptics } = setup("pad");
  for (let frame = 0; frame < 60; frame++) haptics.held(1, 0, 1 / 60);
  // A second's frames: one pulse to start and one each time HOLD_EVERY has passed, to the frame.
  const pulses = played.length;
  assert.ok(pulses >= Math.floor(1000 / HOLD_EVERY) && pulses <= Math.ceil(1000 / HOLD_EVERY), String(pulses));
  assert.ok(played.every((e) => e.strongMagnitude === 0 && e.weakMagnitude > 0), "the feather is felt high and light");
  for (let frame = 0; frame < 60; frame++) haptics.held(0, 0, 1 / 60);
  assert.equal(played.length, pulses);
  haptics.held(0, 1, 1 / 60);
  assert.equal(played.length, pulses + 1, "a new hold is felt at once");
  const air = played.at(-1)!;
  assert.ok(air.strongMagnitude > air.weakMagnitude && air.duration > HOLD_EVERY, "the air is low, and runs on between pulses");
});
