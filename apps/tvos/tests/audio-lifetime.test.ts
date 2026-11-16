import assert from "node:assert/strict";
import { test } from "node:test";
import type { Native } from "../runtime/native.ts";
import { Audio } from "../../web/src/audio/sounds.ts";
import type { Ambience } from "../../web/src/audio/sounds.ts";

let now = 0;
let bufferId = 0;
const starts: number[] = [];
const stops: number[] = [];
(globalThis as unknown as { __native: Partial<Native> }).__native = {
  buffers: [new ArrayBuffer(4096)], fences: new ArrayBuffer(4), config: "{}", now: () => 0,
  audio(command, ...args) {
    if (command === 1) return 22050;
    if (command === 2) return now;
    if (command === 7) starts.push(args[0] as number);
    if (command === 8) stops.push(args[0] as number);
    if (command === 14) return [++bufferId, ...Array.from({ length: args[0] as number }, () => new ArrayBuffer((args[1] as number) * 4))];
  },
};
const { AudioContextShim, audioEnded } = await import("../runtime/audio.ts");
(globalThis as { AudioContext?: unknown }).AudioContext = AudioContextShim;

function reachable(node: { _inputs: Set<unknown> }, seen = new Set<unknown>()): number {
  if (seen.has(node)) return 0;
  seen.add(node);
  let count = 1;
  for (const input of node._inputs) count += reachable(input as typeof node, seen);
  return count;
}

test("hundreds of place changes and one-shots leave only the live audio graph connected", () => {
  const audio = new Audio();
  audio.start(7, 5);
  const ctx = audio.ctx as unknown as InstanceType<typeof AudioContextShim>;
  const baseline = reachable(ctx.destination);
  assert.equal(baseline, 13, "destination, two buses, and five source/gain pairs");
  const places: Ambience[] = ["kitchen", "lab", "bar", "outdoors"];
  for (let i = 0; i < 400; i++) {
    audio.setAmbience(places[i % places.length]);
    // Before its two-second fade is over both places must remain audible.
    assert.equal(reachable(ctx.destination), baseline + 2);
    now += 3;
    for (const id of stops.splice(0)) audioEnded(id);
    assert.equal(reachable(ctx.destination), baseline, `place change ${i}`);
    const before = starts.length;
    audio.play("drop", 0.3);
    audio.play("drop");
    assert.equal(reachable(ctx.destination), baseline + 3);
    for (const id of starts.slice(before)) audioEnded(id);
    assert.equal(reachable(ctx.destination), baseline, `one-shots ${i}`);
  }
  audio.setAmbience("kitchen");
  now += 3;
  for (const id of stops.splice(0)) audioEnded(id);
  for (let i = 0; i < 200; i++) {
    const before = starts.length;
    audio.weather(0, 0, 0);
    audio.follow(0, 0, 0, 30);
    assert.equal(starts.length, before + 1, "a bird through the glass");
    assert.equal(reachable(ctx.destination), baseline + 2);
    audioEnded(starts[before]);
    assert.equal(reachable(ctx.destination), baseline, "the chirp's gain disconnects too");
  }
});

test("an hour of repeated volume settings keeps the TV automation bounded", () => {
  const audio = new Audio();
  audio.start(7, 5);
  const ctx = audio.ctx as unknown as InstanceType<typeof AudioContextShim>;
  for (let i = 0; i < 3600; i++) { now += 1; audio.setVolumes(i % 11, (i + 3) % 11); }
  for (const node of ctx.destination._inputs) {
    const gain = node as InstanceType<typeof AudioContextShim>["destination"] & { gain: { _events: unknown[] } };
    assert.equal(gain.gain._events.length, 2);
  }
});
