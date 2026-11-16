import assert from "node:assert/strict";
import { test } from "node:test";
import { followParam } from "../../web/src/audio/follow.ts";
import type { Native } from "../runtime/native.ts";
import type { AudioContextShim } from "../runtime/audio.ts";

// Exercise the actual TV parameter timeline and the commands sent to its mixer.
let nativeEvents = 0;
(globalThis as unknown as { __native: Partial<Native> }).__native = {
  buffers: [new ArrayBuffer(4096)], fences: new ArrayBuffer(4), config: "{}", now: () => 0,
  audio(command, _node, _index, type, _value, time) {
    if (command === 6) {
      if (type === 5 && time === 0) nativeEvents = 0;
      else nativeEvents++;
    }
  },
};
const { AudioParamShim } = await import("../runtime/audio.ts");

test("an hour of per-frame audio follows stays bounded and preserves exponential smoothing", () => {
  let now = 0;
  const ctx = { get currentTime() { return now; } } as AudioContextShim;
  const param = new AudioParamShim(ctx, 1, 0, 0);
  let expected = 0;
  let target = 0;
  const smoothing = 0.05;
  for (let frame = 0; frame < 60 * 60 * 60; frame++) {
    now = frame / 60;
    if (frame > 0) expected = target + (expected - target) * Math.exp(-(1 / 60) / smoothing);
    target = Math.sin(frame / 137) * 0.4 + 0.5;
    followParam(param as unknown as AudioParam, target, now, smoothing);
    assert.ok(Math.abs(param.value - expected) < 1e-10, "retargeting does not jump the current value");
    assert.equal(param._events.length, 2, "JavaScript retains only the anchor and target");
    assert.equal(nativeEvents, 2, "the per-sample native mixer sees the same bounded timeline");
    const later = now + 1 / 120;
    assert.ok(Math.abs(param._valueAt(later) - (target + (expected - target) * Math.exp(-(later - now) / smoothing))) < 1e-10);
  }
});
