import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import { smooth } from "../../brain/src/io.ts";
import { readMat } from "../scripts/mat.ts";
import { agreement, delayed, gapThreshold, line, lowPass, median, readout, rises, spikesAbove } from "../scripts/steering-fit.ts";

/** A level 5 MAT-file holding one double column per entry, the first compressed. */
function matFile(arrays: Record<string, number[]>): Uint8Array {
  const header = new Uint8Array(128).fill(0x20);
  header.set(new TextEncoder().encode("MATLAB 5.0 MAT-file"));
  const view = new DataView(header.buffer);
  view.setUint16(124, 0x0100, true);
  view.setUint16(126, 0x4d49, true);
  const pad = (n: number) => Math.ceil(n / 8) * 8;
  const parts: Uint8Array[] = [header];
  let first = true;
  for (const [name, values] of Object.entries(arrays)) {
    const nameBytes = new TextEncoder().encode(name);
    const body = new Uint8Array(16 + 16 + 8 + pad(nameBytes.length) + 8 + values.length * 8);
    const b = new DataView(body.buffer);
    let at = 0;
    b.setUint32(at, 6, true); b.setUint32(at + 4, 8, true); b.setUint32(at + 8, 6, true); at += 16;
    b.setUint32(at, 5, true); b.setUint32(at + 4, 8, true); b.setInt32(at + 8, values.length, true); b.setInt32(at + 12, 1, true); at += 16;
    b.setUint32(at, 1, true); b.setUint32(at + 4, nameBytes.length, true); body.set(nameBytes, at + 8); at += 8 + pad(nameBytes.length);
    b.setUint32(at, 9, true); b.setUint32(at + 4, values.length * 8, true); at += 8;
    values.forEach((v, i) => b.setFloat64(at + i * 8, v, true));
    const element = new Uint8Array(8 + body.length);
    new DataView(element.buffer).setUint32(0, 14, true);
    new DataView(element.buffer).setUint32(4, body.length, true);
    element.set(body, 8);
    if (first) {
      const packed = deflateSync(element);
      const wrapped = new Uint8Array(8 + packed.length);
      new DataView(wrapped.buffer).setUint32(0, 15, true);
      new DataView(wrapped.buffer).setUint32(4, packed.length, true);
      wrapped.set(packed, 8);
      parts.push(wrapped);
      first = false;
    } else parts.push(element);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

test("reads compressed and plain double matrices by name", () => {
  const m = readMat(matFile({ yaw: [1.5, -2, 3], fwd: [4, 5] }));
  assert.deepEqual(Array.from(m.get("yaw")!.data), [1.5, -2, 3]);
  assert.deepEqual(m.get("yaw")!.dims, [3, 1]);
  assert.deepEqual(Array.from(m.get("fwd")!.data), [4, 5]);
  assert.equal(readMat(matFile({ yaw: [1], fwd: [2] }), (n) => n === "fwd").has("yaw"), false);
});

test("median is the middle value, or the mean of the middle two", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([9, 9, 1, 2, 7], 1, 4), 2);
});

/** Noise filtered as the recordings' is (they're low-passed at 5 kHz and sampled at 10), with 5 mV, 3 ms spikes at known samples. */
function trace(spikeAt: number[], length: number, seed = 1) {
  let s = seed;
  const random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const v = new Float64Array(length);
  let noise = 0;
  for (let i = 0; i < length; i++) {
    noise += ((random() - 0.5) * 1.2 - noise) * 0.3;
    v[i] = -45 + noise;
  }
  for (const t of spikeAt) for (let k = -15; k <= 15; k++) if (t + k >= 0 && t + k < length) v[t + k] += 5 * Math.exp(-((k / 6) ** 2));
  return v;
}

test("spikes stand clear of the noise at the gap, and are found where they are", () => {
  const at = Array.from({ length: 200 }, (_, i) => 500 + i * 487);
  const v = trace(at, 100_000);
  const candidates = rises(v, 30, () => true);
  const { threshold } = gapThreshold(candidates.height, 1, 15, 0.25);
  assert.ok(threshold > 1 && threshold < 4, `threshold ${threshold}`);
  const found = spikesAbove(candidates, threshold, 20);
  assert.equal(found.length, at.length);
  for (let i = 0; i < at.length; i++) assert.ok(Math.abs(found[i] - at[i]) <= 2);
  assert.equal(spikesAbove(candidates, threshold * 0.8, 20).length, at.length);
  assert.equal(spikesAbove(candidates, threshold * 1.2, 20).length, at.length);
});

test("the readout is the brain's own smoothing of the spike train", () => {
  const fs = 10_000;
  const spikes = Int32Array.from([1003, 1302, 1457, 5005]);
  const times = Float64Array.from({ length: 100 }, (_, i) => (i + 1) / 100);
  const out = readout(spikes, fs, times);
  // The brain steps in chunks: each one's spike count, as Hz, smoothed with τ 150 ms.
  let rate = 0;
  let k = 0;
  for (let i = 0; i < times.length; i++) {
    for (let ms = 0; ms < 10; ms++) {
      const end = Math.round((i * 10 + ms + 1) * fs / 1000);
      let count = 0;
      while (k < spikes.length && spikes[k] < end) {
        count++;
        k++;
      }
      rate = smooth(rate, count * 1000, 1, 150);
    }
    assert.ok(Math.abs(out[i] - rate) < 0.3, `at ${times[i]} s: ${out[i]} against ${rate}`);
  }
});

test("the fit finds a gain and delay put into made-up turning, and agreement scores it", () => {
  const n = 20_000;
  let s = 7;
  const random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) - 0.5;
  const delta = lowPass(Float64Array.from({ length: n }, () => random() * 80), 200, 100);
  const yaw = Float64Array.from(delayed(delta, 11), (v) => 6 * v + 20 + random() * 5);
  const use = new Uint8Array(n).fill(1);
  let best = { shift: -1, r2: -1, slope: 0 };
  for (let shift = 0; shift <= 30; shift++) {
    const fit = line(delta, yaw, use, shift);
    if (fit.r2 > best.r2) best = { shift, r2: fit.r2, slope: fit.slope };
  }
  assert.equal(best.shift, 11);
  assert.ok(Math.abs(best.slope - 6) < 0.05);
  const scored = agreement(Float64Array.from(delayed(delta, 11), (v) => 6 * v), yaw, use);
  assert.ok(scored.r2 > 0.95);
  assert.ok(Math.abs(scored.calibration - 1) < 0.02);
});
