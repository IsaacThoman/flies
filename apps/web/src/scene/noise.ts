// Value noise for shaders that use a great deal of it (the bar's walnut and
// paper, the restaurant's marble, wood and floor), read from a texture.
// Worked out from a hash, each value costs four hashes, and a pixel of
// marble takes sixteen: on the Apple TV's GPU the largest part of drawing
// those rooms. Here a lattice point's random value and its three neighbours'
// (the four corners a value noise mixes between) are one texel, so a value
// is one fetch and the same smooth mix. The lattice repeats every
// NOISE_SIZE points, further than any of those patterns is seen across.

import * as THREE from "three";

export const NOISE_SIZE = 512;

let shared: THREE.DataTexture | null = null;

/** The lattice's values, made once and shared: RGBA are a point's, its neighbour's along x, along y, and along both. */
export function noiseTexture(): THREE.DataTexture {
  if (shared) return shared;
  const n = NOISE_SIZE;
  const values = new Uint8Array(n * n);
  for (let i = 0; i < values.length; i++) {
    // An integer hash of the point's index (lowbias32): even, and the same every time.
    let v = (i + 0x9e3779b9) | 0;
    v = Math.imul(v ^ (v >>> 16), 0x7feb352d);
    v = Math.imul(v ^ (v >>> 15), 0x846ca68b);
    values[i] = (v ^ (v >>> 16)) >>> 24;
  }
  // Little-endian, as every device this runs on is: R is the low byte.
  const data = new Uint8Array(n * n * 4);
  const texels = new Uint32Array(data.buffer);
  for (let y = 0; y < n; y++) {
    const row = y * n;
    const next = ((y + 1) & (n - 1)) * n;
    for (let x = 0; x < n; x++) {
      const x1 = (x + 1) & (n - 1);
      texels[row + x] = values[row + x] | (values[row + x1] << 8) | (values[next + x] << 16) | (values[next + x1] << 24);
    }
  }
  shared = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  shared.minFilter = THREE.NearestFilter;
  shared.magFilter = THREE.NearestFilter;
  shared.generateMipmaps = false;
  shared.needsUpdate = true;
  return shared;
}

/** A value noise function `name(vec2 p)`, 0 to 1, from the texture in `sampler`: smoothly mixed between the lattice's values, a lattice point to each unit of p. */
export function noiseGlsl(name: string, sampler: string) {
  return /* glsl */ `
uniform sampler2D ${sampler};
float ${name}(vec2 p) {
  vec2 i = floor(p);
  vec2 u = p - i;
  u = u * u * (3.0 - 2.0 * u);
  vec4 c = texelFetch(${sampler}, ivec2(mod(i, ${NOISE_SIZE}.0)), 0);
  return mix(mix(c.x, c.y, u.x), mix(c.z, c.w, u.x), u.y);
}`;
}
