import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { loadConnectome } from "@fly/brain";
import { packSynthetic } from "../../../packages/brain/src/test-helpers.ts";
import { WIRE_MAGIC, WireDecoder, encodeWire, unpackConnectome } from "../src/brain/wire.ts";

/** A connectome with enough rows, steps and planes to exercise every section. */
function sample() {
  const neurons = Array.from({ length: 300 }, (_, i) => ({ type: `T${i % 37}`, superClass: i % 3 ? "central" : "sensory", side: i % 2 ? "left" : "right", nt: i % 5 ? "acetylcholine" : "" }));
  const edges: [number, number, number][] = [];
  let seed = 7;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let pre = 0; pre < neurons.length; pre++) {
    const targets = new Set<number>();
    for (let k = Math.floor(random() * 12); k > 0; k--) targets.add(Math.floor(random() * neurons.length));
    for (const post of targets) edges.push([pre, post, 1 + Math.floor(random() * 3000)]);
  }
  return packSynthetic(neurons, edges);
}

const buffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

test("the wire form is the same size, marked, and comes back byte for byte", () => {
  const raw = sample();
  const wire = encodeWire(raw);
  assert.equal(wire.length, raw.length);
  assert.equal(String.fromCharCode(...wire.subarray(0, 4)), WIRE_MAGIC);
  assert.notDeepEqual(wire, raw);
  const decoder = new WireDecoder();
  decoder.write(wire);
  assert.deepEqual(new Uint8Array(decoder.finish()), raw);
});

test("it decodes however the bytes are split as they arrive", () => {
  const raw = sample();
  const wire = encodeWire(raw);
  for (const size of [1, 7, 13, 64, 1000, 4093]) {
    const decoder = new WireDecoder();
    for (let at = 0; at < wire.length; at += size) decoder.write(wire.subarray(at, at + size));
    const back = decoder.finish();
    assert.deepEqual(new Uint8Array(back), raw, `chunks of ${size}`);
    assert.doesNotThrow(() => loadConnectome(back));
  }
});

test("gzipped, it unpacks to the connectome; anything else is refused", async () => {
  const raw = sample();
  const wire = encodeWire(raw);
  assert.deepEqual(new Uint8Array(await unpackConnectome(buffer(gzipSync(wire)))), raw);
  await assert.rejects(unpackConnectome(buffer(wire)), /isn't the fly's brain/);
  await assert.rejects(unpackConnectome(buffer(gzipSync(raw))), /isn't the fly's brain/);
});

test("damaged, cut short, too long or foreign data is refused", async () => {
  const raw = sample();
  const wire = encodeWire(raw);
  const gz = gzipSync(wire);
  const cut = gz.subarray(0, gz.length - 100);
  await assert.rejects(unpackConnectome(buffer(cut)), /damaged|incomplete/);
  const flipped = gz.slice();
  flipped[Math.floor(flipped.length / 2)] ^= 0xff;
  await assert.rejects(unpackConnectome(buffer(flipped)), /damaged|incomplete|longer/);
  const long = new Uint8Array(wire.length + 8);
  long.set(wire);
  await assert.rejects(unpackConnectome(buffer(gzipSync(long))), /longer/);
  await assert.rejects(unpackConnectome(buffer(new TextEncoder().encode("<!doctype html><title>Sign in to the Wi-Fi</title>"))), /isn't the fly's brain/);
  const short = new WireDecoder();
  short.write(wire.subarray(0, wire.length - 1));
  assert.throws(() => short.finish(), /incomplete/);
});
