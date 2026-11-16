import assert from "node:assert/strict";
import { test } from "node:test";
import { PIXEL_BUDGET, TV_FRAME, frameFor, pixelsPerUnit, sameFrame, worldSize } from "../src/display.ts";
import { SHAPES } from "./shapes.ts";

test("the Apple TV's frame is what it always was: 640×480, shown at 16:9, laid out 854×480", () => {
  assert.equal(TV_FRAME.width, 640);
  assert.equal(TV_FRAME.height, 480);
  assert.equal(TV_FRAME.aspect, 16 / 9);
  assert.deepEqual(TV_FRAME.design, { width: 854, height: 480 });
  assert.deepEqual(TV_FRAME.safe, { top: 0, right: 0, bottom: 0, left: 0 });
  assert.deepEqual(worldSize(TV_FRAME, "chunky"), { width: 320, height: 240 });
  assert.deepEqual(worldSize(TV_FRAME, "chunkier"), { width: 214, height: 160 });
});

test("every other screen gets the TV's number of pixels, square, in its own shape", () => {
  for (const [name, { width: w, height: h }] of Object.entries(SHAPES)) {
    const frame = frameFor(w, h);
    const pixels = frame.width * frame.height;
    assert.ok(Math.abs(pixels / PIXEL_BUDGET - 1) < 0.01, `${name}: ${frame.width}×${frame.height}`);
    assert.ok(Math.abs(frame.width / frame.height / (w / h) - 1) < 0.01, `${name}: square pixels`);
    assert.equal(frame.aspect, w / h);
  }
  assert.deepEqual([frameFor(1024, 768).width, frameFor(1024, 768).height], [640, 480], "a 4:3 screen is exactly the TV's buffer");
  assert.deepEqual([frameFor(1920, 1080).width, frameFor(1920, 1080).height], [739, 416]);
});

test("the chunkier pixel sizes are a half and a third of the frame each way, at any shape", () => {
  for (const { width: w, height: h } of Object.values(SHAPES)) {
    const frame = frameFor(w, h);
    const chunky = worldSize(frame, "chunky");
    const chunkier = worldSize(frame, "chunkier");
    assert.deepEqual(worldSize(frame, "classic"), { width: frame.width, height: frame.height });
    assert.equal(chunky.width, Math.ceil(frame.width / 2));
    assert.equal(chunkier.height, Math.ceil(frame.height / 3));
  }
});

test("design units: 480 to the shorter side, never smaller than a CSS pixel, nor than a finger needs", () => {
  const desk = frameFor(1920, 1080);
  assert.ok(Math.abs(desk.design.width - 853.33) < 0.01 && desk.design.height === 480);
  const small = frameFor(600, 400);
  assert.deepEqual(small.design, { width: 600, height: 400 });
  const phone = frameFor(393, 852, undefined, true);
  assert.equal(phone.unit, 1.25);
  assert.ok(Math.abs(phone.design.width - 314.4) < 1e-9);
  const tablet = frameFor(834, 1194, undefined, true);
  assert.ok(Math.abs(tablet.design.width - 480) < 1e-9, "a tablet's shorter side is 480 units");
});

test("the safe area comes in design units", () => {
  const frame = frameFor(393, 852, { top: 59, right: 0, bottom: 34, left: 0 }, true);
  assert.ok(Math.abs(frame.safe.top - 59 / 1.25) < 1e-9);
  assert.ok(Math.abs(frame.safe.bottom - 34 / 1.25) < 1e-9);
  assert.equal(frameFor(393, 852, { top: Number.NaN, right: -4, bottom: 0, left: 0 }).safe.top, 0, "nonsense is nothing");
});

test("a screen of the same shape is the same frame; any change is a new one", () => {
  assert.ok(sameFrame(frameFor(1280, 720), frameFor(1280, 720)));
  assert.ok(!sameFrame(frameFor(1280, 720), frameFor(1280, 721)));
  assert.ok(!sameFrame(frameFor(393, 852), frameFor(393, 852, { top: 59, right: 0, bottom: 0, left: 0 })));
  assert.deepEqual(pixelsPerUnit(TV_FRAME), { x: 640 / 854, y: 1 });
});
