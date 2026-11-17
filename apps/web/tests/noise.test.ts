// The value noise the bar's and the restaurant's shaders read from a texture:
// each texel's four corners are the lattice's values where the shader means
// them to be, and those values are spread evenly.

import assert from "node:assert/strict";
import { test } from "node:test";
import { NOISE_SIZE, noiseGlsl, noiseTexture } from "../src/scene/noise.ts";

test("each texel holds a lattice point's value and its neighbours' along x, along y and both, wrapping round", () => {
  const texture = noiseTexture();
  assert.equal(texture, noiseTexture(), "made once and shared");
  const n = NOISE_SIZE;
  const data = texture.image.data as Uint8Array;
  assert.equal(data.length, n * n * 4);
  const value = (x: number, y: number) => data[(((y + n) % n) * n + ((x + n) % n)) * 4];
  for (const [x, y] of [[0, 0], [5, 9], [n - 1, 3], [7, n - 1], [n - 1, n - 1]]) {
    const k = (y * n + x) * 4;
    assert.deepEqual([...data.subarray(k, k + 4)], [value(x, y), value(x + 1, y), value(x, y + 1), value(x + 1, y + 1)], `texel ${x}, ${y}`);
  }
});

test("the lattice's values are spread evenly over 0 to 1", () => {
  const data = noiseTexture().image.data as Uint8Array;
  const counts = new Array(16).fill(0);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    counts[data[i] >> 4]++;
    sum += data[i];
  }
  const texels = data.length / 4;
  assert.ok(Math.abs(sum / texels / 255 - 0.5) < 0.01, `mean ${sum / texels / 255}`);
  for (const c of counts) assert.ok(Math.abs(c / texels - 1 / 16) < 0.005, `${counts}`);
});

test("the shader reads the lattice point's texel, wrapped, and mixes its corners smoothly", () => {
  const glsl = noiseGlsl("rNoise", "uNoise");
  assert.match(glsl, /uniform sampler2D uNoise;/);
  assert.match(glsl, /texelFetch\(uNoise, ivec2\(mod\(i, 512\.0\)\), 0\)/);
  assert.match(glsl, /u \* u \* \(3\.0 - 2\.0 \* u\)/);
});
