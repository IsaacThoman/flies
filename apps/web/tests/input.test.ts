import assert from "node:assert/strict";
import { test } from "node:test";
import { DELIBERATE_MOVE, Devices, Gamepads, Keyboard, Pointers, Remote, TAP_SLOP, initialDevice, keyAction, keyAxis } from "../src/input.ts";
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

test("a keyboard's own keys: the numbers pick tools, R or Home hands the camera back; held, Q and E turn it and + and − zoom it", () => {
  assert.deepEqual(keyAction("Digit1", "1"), { kind: "tool", index: 0 });
  assert.deepEqual(keyAction("Numpad8", "8"), { kind: "tool", index: 7 });
  assert.deepEqual(keyAction("KeyR", "r"), { kind: "handBack" });
  assert.deepEqual(keyAction("Home", "Home"), { kind: "handBack" });
  assert.equal(keyAction("KeyA", "a"), null);
  assert.equal(keyAction("Digit0", "0"), null);
  assert.deepEqual(keyAxis("Equal", "+"), { axis: "zoom", dir: -1 });
  assert.deepEqual(keyAxis("Minus", "-"), { axis: "zoom", dir: 1 });
  assert.deepEqual(keyAxis("KeyQ", "q"), { axis: "turn", dir: -1 });
  assert.equal(keyAxis("ArrowLeft", "ArrowLeft"), null, "the arrows are the remote's");

  const devices = new Devices("mouse");
  const target = new EventTarget();
  const remote = new Remote(target as unknown as Window, () => 1, devices, "keys");
  const keyboard = new Keyboard(target as unknown as Window, remote, devices, () => 7);
  const key = (type: string, code: string, k: string, extra = {}) => target.dispatchEvent(Object.assign(new Event(type), { code, key: k, repeat: false, ...extra }));
  key("keydown", "KeyE", "e");
  key("keydown", "Equal", "=");
  assert.deepEqual([keyboard.turn, keyboard.zoom, keyboard.holding, devices.current], [1, -1, true, "keys"]);
  key("keydown", "Equal", "=", { repeat: true });
  assert.equal(keyboard.zoom, -1, "a key's repeats are the same key held");
  key("keyup", "KeyE", "e");
  assert.equal(keyboard.turn, 0);
  target.dispatchEvent(new Event("blur"));
  assert.deepEqual([keyboard.zoom, keyboard.holding], [0, false], "keys held when the window lost focus are let go");
  key("keydown", "KeyR", "r");
  key("keydown", "KeyR", "r", { repeat: true });
  key("keydown", "KeyR", "r", { ctrlKey: true });
  assert.deepEqual(keyboard.actions, [{ kind: "handBack" }], "once, and never with the browser's own shortcuts");
});

test("a second tap or click soon after the first, in the same place, is a double one; a third starts again", () => {
  const { pointers, raw, tick } = rig();
  const tapAt = (x: number) => {
    pointers.down(raw(1, "mouse", x, 100));
    pointers.up(raw(1, "mouse", x, 100, 0), false);
    const up = pointers.gestures[pointers.gestures.length - 1] as Extract<Gesture, { type: "up" }>;
    pointers.endFrame();
    return up.double;
  };
  assert.equal(tapAt(100), false);
  tick(200);
  assert.equal(tapAt(104), true);
  tick(200);
  assert.equal(tapAt(104), false, "a third starts again");
  tick(600);
  assert.equal(tapAt(104), false, "too late");
  tick(100);
  assert.equal(tapAt(300), false, "somewhere else");
});

test("clicks and moves are timed by when they happened, not by when a busy frame hands them over", () => {
  const { pointers, raw, tick } = rig();
  const at = (e: RawPointer, timeStamp: number): RawPointer => ({ ...e, timeStamp });
  pointers.down(at(raw(1, "mouse", 100, 100), 1000));
  pointers.up(at(raw(1, "mouse", 100, 100, 0), 1040), false);
  pointers.endFrame();
  // A long frame: the second click, 80 ms after the first, is handed over 600 ms later.
  tick(600);
  pointers.down(at(raw(1, "mouse", 102, 100), 1080));
  pointers.up(at(raw(1, "mouse", 102, 100, 0), 1120), false);
  assert.equal((pointers.gestures[pointers.gestures.length - 1] as Extract<Gesture, { type: "up" }>).double, true);
  pointers.endFrame();

  // A mouse moved far in 100 ms is meant, however late its moves arrive.
  const { pointers: hover, raw: hraw, tick: htick } = rig();
  const step = DELIBERATE_MOVE * Math.hypot(1000, 500) * 0.6;
  hover.move(at(hraw(1, "mouse", 100, 100, 0), 5000));
  htick(500);
  hover.move(at(hraw(1, "mouse", 100 + step, 100, 0), 5050));
  htick(500);
  hover.move(at(hraw(1, "mouse", 100 + 2 * step, 100, 0), 5100));
  assert.equal(hover.deliberate, true);
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
  assert.equal(pads.zoom, -1, "the right trigger, all the way, brings the camera in");
  buttons[7].value = 0;
  buttons[6].value = 0.54;
  pads.poll(1 / 60, 840, false);
  assert.ok(pads.zoom > 0.45 && pads.zoom < 0.55, `the left, halfway, takes it out half as fast: ${pads.zoom}`);
  buttons[6].value = 0;
  buttons[11].pressed = true;
  pads.poll(1 / 60, 860, false);
  assert.equal(pads.handBack, true, "the right stick pressed in hands the camera back");
  pads.poll(1 / 60, 880, false);
  assert.equal(pads.handBack, false, "once");
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

test("release displacement counts even when the browser sends no final move", () => {
  for (const type of ["touch", "mouse"]) {
    const { pointers, raw } = rig();
    pointers.down(raw(1, type, 100, 100));
    pointers.up(raw(1, type, 180, 100, 0), false);
    assert.equal((pointers.gestures.at(-1) as Extract<Gesture, { type: "up" }>).tap, false);
  }
});

test("an extra finger can move and lift without ending the original pair's pinch", () => {
  const { pointers, raw } = rig();
  pointers.down(raw(1, "touch", 400, 250));
  pointers.down(raw(2, "touch", 600, 250));
  pointers.down(raw(3, "touch", 800, 250));
  pointers.endFrame();
  pointers.move(raw(3, "touch", 900, 250));
  pointers.up(raw(3, "touch", 900, 250, 0), false);
  assert.deepEqual(types(pointers.gestures), []);
  pointers.move(raw(2, "touch", 700, 250));
  assert.ok(Math.abs((pointers.gestures[0] as Extract<Gesture, { type: "pinch" }>).scale - 1.5) < 1e-9);
  pointers.up(raw(1, "touch", 400, 250, 0), false);
  assert.deepEqual(types(pointers.gestures), ["pinch", "pinchEnd"]);
});

test("a layout or focus interruption drops queued actions and spends all surviving fingers", () => {
  const { pointers, raw } = rig();
  pointers.down(raw(1, "touch", 100, 100));
  pointers.up(raw(1, "touch", 100, 100, 0), false);
  pointers.down(raw(2, "touch", 200, 100));
  pointers.cancel();
  pointers.move(raw(2, "touch", 250, 100));
  pointers.down(raw(3, "touch", 400, 100));
  pointers.up(raw(2, "touch", 250, 100, 0), false);
  pointers.up(raw(3, "touch", 400, 100, 0), false);
  assert.deepEqual(types(pointers.gestures), ["cancel"]);
  pointers.endFrame();
  pointers.down(raw(4, "touch", 100, 100));
  pointers.up(raw(4, "touch", 100, 100, 0), false);
  assert.equal((pointers.gestures.at(-1) as Extract<Gesture, { type: "up" }>).double, false);
});

test("focus loss forgets contacts whose releases may never reach the page", () => {
  const { pointers, raw } = rig();
  pointers.down(raw(1, "touch", 100, 100));
  pointers.cancel(true);
  pointers.endFrame();
  pointers.move(raw(1, "touch", 150, 100));
  pointers.down(raw(2, "touch", 200, 100));
  pointers.up(raw(2, "touch", 200, 100, 0), false);
  assert.deepEqual(types(pointers.gestures), ["down", "up"]);
});

test("synchronous field focus uses the recognized tap, never a cancelled or returning drag", () => {
  const { pointers, raw } = rig();
  const taps: number[][] = [];
  pointers.onTap = (...at) => taps.push(at);
  pointers.down(raw(1, "touch", 100, 100));
  pointers.move(raw(1, "touch", 300, 100));
  pointers.move(raw(1, "touch", 100, 100));
  pointers.up(raw(1, "touch", 100, 100, 0), false);
  pointers.down(raw(2, "touch", 100, 100));
  pointers.down(raw(3, "touch", 200, 100));
  pointers.up(raw(3, "touch", 200, 100, 0), false);
  pointers.up(raw(2, "touch", 100, 100, 0), false);
  pointers.down(raw(4, "touch", 100, 100));
  pointers.cancel();
  pointers.up(raw(4, "touch", 100, 100, 0), false);
  assert.deepEqual(taps, []);
  pointers.down(raw(5, "touch", 100, 100));
  pointers.up(raw(5, "touch", 104, 100, 0), false);
  assert.deepEqual(taps, [[0.104, 0.2, 0.1, 0.2]], "the callback ran in the release's own stack");
  pointers.up(raw(6, "touch", 104, 100, 0), false);
  assert.equal(taps.length, 1, "an unrelated release cannot open another field");
});

test("secondary mouse buttons cannot focus a text field", () => {
  const { pointers, raw } = rig();
  let taps = 0;
  pointers.onTap = () => { taps++; };
  for (const button of [1, 2]) {
    pointers.down(raw(1, "mouse", 100, 100, 1, button));
    pointers.up(raw(1, "mouse", 100, 100, 0, button), false);
  }
  assert.equal(taps, 0);
});

test("a resize invalidates synchronous field focus before another game frame runs", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const viewport = new EventTarget();
  const windowEvents = Object.assign(new EventTarget(), { visualViewport: viewport });
  const canvas = new EventTarget();
  Object.defineProperty(globalThis, "window", { value: windowEvents, configurable: true });
  Object.defineProperty(globalThis, "document", { value: new EventTarget(), configurable: true });
  try {
    const { pointers, raw } = rig();
    let taps = 0;
    pointers.onTap = () => { taps++; };
    pointers.attach(canvas as HTMLCanvasElement);
    for (const [target, type] of [[windowEvents, "resize"], [windowEvents, "orientationchange"], [viewport, "resize"]] as const) {
      canvas.dispatchEvent(Object.assign(new Event("pointerdown"), raw(1, "touch", 100, 100)));
      target.dispatchEvent(new Event(type));
      canvas.dispatchEvent(Object.assign(new Event("pointerup"), raw(1, "touch", 100, 100, 0)));
      assert.equal(taps, 0);
    }
    canvas.dispatchEvent(Object.assign(new Event("pointerdown"), raw(2, "touch", 100, 100)));
    canvas.dispatchEvent(Object.assign(new Event("pointerup"), raw(2, "touch", 100, 100, 0)));
    assert.equal(taps, 1);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("coalesced out-and-back travel cancels a tap while queuing only the latest drag", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true });
  Object.defineProperty(globalThis, "document", { value: new EventTarget(), configurable: true });
  try {
    for (const type of ["touch", "mouse"]) {
      const { pointers, raw } = rig();
      const canvas = new EventTarget();
      let taps = 0;
      pointers.onTap = () => { taps++; };
      pointers.attach(canvas as HTMLCanvasElement);
      canvas.dispatchEvent(Object.assign(new Event("pointerdown"), raw(1, type, 100, 100)));
      canvas.dispatchEvent(Object.assign(new Event("pointermove"), raw(1, type, 100, 100), {
        getCoalescedEvents: () => [raw(1, type, 150, 100), raw(1, type, 100, 100)],
      }));
      canvas.dispatchEvent(Object.assign(new Event("pointerup"), raw(1, type, 100, 100, 0)));
      assert.equal(taps, 0);
      assert.deepEqual(types(pointers.gestures), ["down", "drag", "up"]);
      assert.equal((pointers.gestures[1] as Extract<Gesture, { type: "drag" }>).far, true);
      assert.equal((pointers.gestures[2] as Extract<Gesture, { type: "up" }>).tap, false);
    }
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("lost focus, suspension and text focus release buttons and pending input", () => {
  const document = Object.assign(new EventTarget(), { hidden: false });
  const target = Object.assign(new EventTarget(), { document });
  const remote = new Remote(target as unknown as Window);
  const lose = [
    () => target.dispatchEvent(new Event("blur")),
    () => target.dispatchEvent(new Event("pagehide")),
    () => { document.hidden = true; document.dispatchEvent(new Event("visibilitychange")); },
    () => target.dispatchEvent(Object.assign(new Event("focusin"), { composedPath: () => [{ tagName: "INPUT" }] })),
  ];
  for (const loss of lose) {
    document.hidden = false;
    target.dispatchEvent(Object.assign(new Event("keydown"), { key: "Enter" }));
    remote.receiveTouch({ x: 0, y: 0, touching: true });
    loss();
    assert.equal(remote.held.size, 0);
    assert.equal(remote.presses.length, 0);
    assert.equal(remote.touch.touching, false);
  }
});

test("keyboard aliases and a pad release only their own holds, including disconnect and reconnect", () => {
  const target = new EventTarget();
  const devices = new Devices("keys");
  const remote = new Remote(target as unknown as Window, () => 0, devices, "keys");
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  const pad = { connected: true, mapping: "standard", buttons, axes: [0, 0, 0, 0] };
  const pads = new Gamepads(remote, devices, () => pad.connected ? [pad] : []);
  const key = (type: string, code: string) => target.dispatchEvent(Object.assign(new Event(type), { key: "Enter", code }));
  buttons[0].pressed = true;
  pads.poll(1 / 60, 0, false);
  key("keydown", "Enter");
  key("keydown", "NumpadEnter");
  key("keyup", "Enter");
  assert.equal(remote.held.has("select"), true);
  pad.connected = false;
  pads.poll(1 / 60, 1, false);
  assert.equal(remote.held.has("select"), true, "the keypad Enter is still held");
  key("keyup", "NumpadEnter");
  assert.equal(remote.held.has("select"), false);
  remote.endFrame();
  pad.connected = true;
  pads.poll(1 / 60, 2, false);
  assert.equal(remote.held.has("select"), true, "a held button on reconnection is observed again");
  assert.deepEqual(remote.presses, [{ button: "select", repeat: false }]);
  pad.connected = false;
  pads.poll(1 / 60, 3, false);
  assert.equal(remote.held.has("select"), false, "the disconnected pad's missing button-up is released");
});

test("an orphaned key repeat cannot restore a hold after input loss", () => {
  const target = new EventTarget();
  const devices = new Devices("keys");
  const remote = new Remote(target as unknown as Window, () => 0, devices, "keys");
  const keyboard = new Keyboard(target as unknown as Window, remote, devices);
  const down = (key: string, code: string, repeat: boolean) => target.dispatchEvent(Object.assign(new Event("keydown"), { key, code, repeat }));
  down("Enter", "Enter", false);
  down("q", "KeyQ", false);
  target.dispatchEvent(new Event("blur"));
  down("Enter", "Enter", true);
  down("q", "KeyQ", true);
  assert.equal(remote.held.has("select"), false);
  assert.equal(remote.presses.length, 0);
  assert.equal(keyboard.holding, false);
  down("Enter", "Enter", false);
  assert.equal(remote.held.has("select"), true, "a fresh press can hold again");
});

test("lifecycle loss cannot be undone by a stale held gamepad snapshot", () => {
  const target = new EventTarget();
  const devices = new Devices("pad");
  const remote = new Remote(target as unknown as Window);
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  const pad = { connected: true, mapping: "standard", buttons, axes: [0, 0, 0, 0] };
  const pads = new Gamepads(remote, devices, () => [pad], target as unknown as Window);
  target.dispatchEvent(new Event("gamepadconnected"));
  buttons[0].pressed = true;
  pads.poll(1 / 60, 0, false);
  target.dispatchEvent(new Event("blur"));
  pads.poll(1 / 60, 1, false);
  assert.equal(remote.held.has("select"), false);
  assert.deepEqual(remote.presses, []);
  target.dispatchEvent(new Event("focus"));
  pads.poll(1 / 60, 2, false);
  assert.equal(remote.held.has("select"), false, "returning still requires letting the old hold go");
  buttons[0].pressed = false;
  pads.poll(1 / 60, 3, false);
  buttons[0].pressed = true;
  pads.poll(1 / 60, 4, false);
  assert.equal(remote.held.has("select"), true);
});

test("disconnecting an unused controller does not repeat the selected controller's held Select", () => {
  const target = new EventTarget();
  const devices = new Devices("pad");
  const remote = new Remote(target as unknown as Window);
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  const pad = { connected: true, mapping: "standard", buttons, axes: [0, 0, 0, 0], index: 0 };
  const pads = new Gamepads(remote, devices, () => [pad], target as unknown as Window);
  target.dispatchEvent(new Event("gamepadconnected"));
  buttons[0].pressed = true;
  pads.poll(1 / 60, 0, false);
  remote.endFrame();
  target.dispatchEvent(Object.assign(new Event("gamepaddisconnected"), { gamepad: { index: 1 } }));
  pads.poll(1 / 60, 1, false);
  assert.equal(remote.held.has("select"), true);
  assert.deepEqual(remote.presses, []);
  pad.connected = false;
  target.dispatchEvent(Object.assign(new Event("gamepaddisconnected"), { gamepad: { index: 0 } }));
  assert.equal(remote.held.has("select"), false);

});
