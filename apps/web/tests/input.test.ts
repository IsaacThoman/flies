import assert from "node:assert/strict";
import { test } from "node:test";
import { DELIBERATE_MOVE, Devices, Gamepads, Pointers, Remote, TAP_SLOP, initialDevice, keyAction } from "../src/input.ts";
import type { Gesture, RawPointer } from "../src/input.ts";

/** A 1000×500 canvas at the page's top left, and a clock the test moves. */
function rig() {
  let now = 0;
  const devices = new Devices("mouse");
  const pointers = new Pointers(() => ({ left: 0, top: 0, width: 1000, height: 500 }), () => now, devices);
  const raw = (id: number, type: string, x: number, y: number, buttons = 1, button = 0): RawPointer => ({ pointerId: id, pointerType: type, clientX: x, clientY: y, button, buttons });
  return { pointers, devices, raw, tick: (ms: number) => (now += ms) };
}
const types = (gestures: Gesture[]) => gestures.map((g) => g.type);

test("a finger that barely moves taps; one that moves drags, and lifting it is no tap", () => {
  const { pointers, raw } = rig();
  pointers.down(raw(1, "touch", 500, 250));
  pointers.move(raw(1, "touch", 500 + TAP_SLOP.touch - 2, 250));
  pointers.up(raw(1, "touch", 500 + TAP_SLOP.touch - 2, 250, 0), false);
  assert.deepEqual(types(pointers.gestures), ["down", "drag", "up"]);
  const down = pointers.gestures[0] as Extract<Gesture, { type: "down" }>;
  assert.deepEqual([down.x, down.y, down.touch], [0.5, 0.5, true]);
  assert.equal((pointers.gestures[2] as Extract<Gesture, { type: "up" }>).tap, true);
  pointers.endFrame();

  pointers.down(raw(2, "touch", 100, 100));
  pointers.move(raw(2, "touch", 300, 100));
  pointers.up(raw(2, "touch", 300, 100, 0), false);
  assert.equal((pointers.gestures[2] as Extract<Gesture, { type: "up" }>).tap, false);
});

test("a second finger turns the press into a pinch: the first is cancelled, and nothing more until every finger is up", () => {
  const { pointers, raw } = rig();
  pointers.down(raw(1, "touch", 400, 250));
  pointers.down(raw(2, "touch", 600, 250));
  pointers.move(raw(2, "touch", 700, 250));
  pointers.move(raw(1, "touch", 300, 250));
  assert.deepEqual(types(pointers.gestures), ["down", "cancel", "pinch", "pinch"]);
  const spread = pointers.gestures.slice(2).reduce((k, g) => k * (g as Extract<Gesture, { type: "pinch" }>).scale, 1);
  assert.ok(Math.abs(spread - 2) < 1e-9, `the fingers spread to twice as far apart: ${spread}`);
  pointers.endFrame();
  pointers.up(raw(2, "touch", 700, 250, 0), false);
  // The finger left behind does nothing: no tap, no drag.
  pointers.move(raw(1, "touch", 200, 250));
  pointers.up(raw(1, "touch", 200, 250, 0), false);
  assert.deepEqual(types(pointers.gestures), ["pinchEnd"]);
  pointers.endFrame();
  pointers.down(raw(3, "touch", 500, 250));
  assert.deepEqual(types(pointers.gestures), ["down"], "and then a new press is a press again");
});

test("a mouse hovering moves the hand but only wakes things when moved as if meant, not nudged", () => {
  const { pointers, raw, tick, devices } = rig();
  devices.current = "keys";
  pointers.move(raw(1, "mouse", 500, 250, 0));
  pointers.endFrame();
  // A nudge: a few pixels.
  tick(16);
  pointers.move(raw(1, "mouse", 504, 251, 0));
  assert.deepEqual(types(pointers.gestures), ["hover"]);
  assert.equal(pointers.deliberate, false);
  assert.equal(devices.current, "keys", "a nudged mouse doesn't take over from the keys");
  pointers.endFrame();
  // Slowly over a long time: still not meant.
  for (let i = 0; i < 20; i++) {
    tick(1000);
    pointers.move(raw(1, "mouse", 504 + i * 3, 251, 0));
  }
  assert.equal(pointers.deliberate, false);
  // A sweep across a good part of the screen, quickly.
  const far = DELIBERATE_MOVE * Math.hypot(1000, 500);
  for (let i = 1; i <= 5; i++) {
    tick(16);
    pointers.move(raw(1, "mouse", 600 + (i * far) / 4, 251, 0));
  }
  assert.equal(pointers.deliberate, true);
  assert.equal(devices.current, "mouse");
  assert.equal(pointers.gestures.filter((g) => g.type === "hover").length, 1, "hovers in a frame come to the latest");
});

test("the wheel: a mouse's click is a notch; a trackpad's scroll is small steps; with Ctrl it is a pinch", () => {
  const { pointers } = rig();
  pointers.wheel({ clientX: 10, clientY: 10, deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false });
  pointers.wheel({ clientX: 10, clientY: 10, deltaX: 0, deltaY: 3, deltaMode: 1, ctrlKey: false });
  pointers.wheel({ clientX: 10, clientY: 10, deltaX: 2, deltaY: 4.5, deltaMode: 0, ctrlKey: false });
  pointers.wheel({ clientX: 10, clientY: 10, deltaX: 0, deltaY: -6, deltaMode: 0, ctrlKey: true });
  const wheels = pointers.gestures as Extract<Gesture, { type: "wheel" }>[];
  assert.deepEqual(wheels.map((w) => [w.notch, w.zoom]), [[true, false], [true, false], [false, false], [false, true]]);
  assert.equal(wheels[1].dy, 48, "lines, as pixels");
  assert.equal(pointers.deliberate, true);
});

test("which device is in hand: the remote on the TV, else a finger or a mouse by the screen; then whatever was used last", () => {
  assert.equal(initialDevice(true, false), "remote");
  assert.equal(initialDevice(false, true), "touch");
  assert.equal(initialDevice(false, false), "mouse");
  const devices = new Devices("mouse");
  const target = new EventTarget();
  const remote = new Remote(target as unknown as Window, () => 5, devices, "keys");
  target.dispatchEvent(Object.assign(new Event("keydown"), { key: "ArrowLeft", repeat: false }));
  assert.equal(devices.current, "keys");
  assert.equal(devices.at, 5);
  assert.deepEqual(remote.presses, [{ button: "left", repeat: false }]);
  assert.equal(devices.pointing, false);
  target.dispatchEvent(Object.assign(new Event("remotetouch"), { detail: { x: 0, y: 0, touching: true } }));
  assert.equal(devices.current, "remote", "the remote's touch surface is the remote");
  devices.use("touch", 6);
  assert.equal(devices.pointing, true);
});

test("on the TV the remote's keys are the remote's, as they always were", () => {
  const devices = new Devices("remote");
  const target = new EventTarget();
  const remote = new Remote(target as unknown as Window, () => 1, devices);
  target.dispatchEvent(Object.assign(new Event("keydown"), { key: "Enter", repeat: false }));
  target.dispatchEvent(Object.assign(new Event("keyup"), { key: "Enter" }));
  assert.equal(devices.current, "remote");
  assert.deepEqual(remote.presses, [{ button: "select", repeat: false }]);
  assert.equal(remote.held.size, 0);
});

test("a keyboard's own keys: the numbers pick tools, plus and minus bring the camera in and take it out", () => {
  assert.deepEqual(keyAction("Digit1", "1"), { kind: "tool", index: 0 });
  assert.deepEqual(keyAction("Numpad8", "8"), { kind: "tool", index: 7 });
  assert.deepEqual(keyAction("Equal", "+"), { kind: "zoom", dir: -1 });
  assert.deepEqual(keyAction("Minus", "-"), { kind: "zoom", dir: 1 });
  assert.equal(keyAction("KeyA", "a"), null);
  assert.equal(keyAction("Digit0", "0"), null);
});

test("a pad's buttons are the remote's, held directions repeat as the remote's do, and its sticks move the hand and look round", () => {
  const devices = new Devices("mouse");
  const remote = new Remote(new EventTarget() as unknown as Window, () => 0, devices);
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const axes = [0, 0, 0, 0];
  const pad = { connected: true, mapping: "standard", buttons, axes };
  const pads = new Gamepads(remote, devices, () => [pad]);
  buttons[0].pressed = true;
  pads.poll(1 / 60, 0, false);
  assert.deepEqual(remote.presses, [{ button: "select", repeat: false }]);
  assert.ok(remote.held.has("select"), "A held is Select held: tickling, blowing");
  assert.equal(devices.current, "pad");
  buttons[0].pressed = false;
  pads.poll(1 / 60, 16, false);
  assert.ok(!remote.held.has("select"));
  remote.endFrame();

  buttons[15].pressed = true;
  pads.poll(1 / 60, 100, false);
  pads.poll(1 / 60, 300, false);
  assert.deepEqual(remote.presses.map((p) => [p.button, p.repeat]), [["right", false]]);
  pads.poll(1 / 60, 520, false);
  pads.poll(1 / 60, 630, false);
  assert.deepEqual(remote.presses.map((p) => [p.button, p.repeat]), [["right", false], ["right", true], ["right", true]]);
  buttons[15].pressed = false;
  pads.poll(1 / 60, 640, false);
  remote.endFrame();

  axes[0] = 1;
  pads.poll(0.5, 700, false);
  assert.ok(remote.dx > 0.4, `the left stick moves the hand: ${remote.dx}`);
  remote.endFrame();
  axes[0] = 0;
  axes[3] = -1;
  pads.poll(1 / 60, 720, false);
  assert.equal(pads.look.y, 1, "the right stick, pushed up, looks up");

  axes[3] = 0;
  axes[1] = 1;
  pads.poll(1 / 60, 800, true);
  assert.deepEqual(remote.presses.map((p) => p.button), ["down"], "in a menu the stick steps");
  buttons[7].value = 1;
  pads.poll(1 / 60, 820, false);
  assert.equal(pads.zoom, -1, "the right trigger brings the camera in");
});

test("a mouse whose lift was lost (the window lost focus mid-drag) can press again: the old press is cancelled", () => {
  const { pointers, raw } = rig();
  pointers.down(raw(1, "mouse", 100, 100));
  pointers.down(raw(1, "mouse", 300, 200));
  assert.deepEqual(types(pointers.gestures), ["down", "cancel", "down"]);
  pointers.endFrame();
  pointers.down(raw(1, "mouse", 300, 200, 3, 2));
  assert.deepEqual(types(pointers.gestures), ["cancel", "down"]);
  pointers.endFrame();
  pointers.up(raw(1, "mouse", 300, 200, 0, 2), true);
  pointers.up(raw(1, "mouse", 300, 200, 0, 2), false);
  assert.deepEqual(types(pointers.gestures), ["cancel"], "a lost capture is a cancel, and the lift after it nothing");
});

test("a finger dragging or pinching is input still, to keep the wallpaper away; a button let go says nothing about the device", () => {
  const { pointers, raw, tick } = rig();
  pointers.down(raw(1, "touch", 100, 100));
  pointers.endFrame();
  tick(5000);
  pointers.move(raw(1, "touch", 104, 100));
  assert.equal(pointers.deliberate, true);
  assert.equal(pointers.lastAt, 5000);
  const devices = new Devices("touch");
  const remote = new Remote(new EventTarget() as unknown as Window, () => 9, devices, "keys");
  remote.button("select", false, false, "keys");
  assert.equal(devices.current, "touch");
  assert.equal(devices.at, 0);
  assert.equal(remote.lastInputAt, 9, "though it was input");
});
