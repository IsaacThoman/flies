import assert from "node:assert/strict";
import { test } from "node:test";
import { JpegEncoder, encodeJpeg, jpegDataUrl } from "../src/journal/jpeg.ts";

function picture(width: number, height: number, paint: (x: number, y: number) => [number, number, number]) {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      [pixels[p], pixels[p + 1], pixels[p + 2]] = paint(x, y);
      pixels[p + 3] = 255;
    }
  }
  return pixels;
}

const gradient = (width: number, height: number) =>
  picture(width, height, (x, y) => [(x * 255) / width, (y * 255) / height, 128 + 90 * Math.sin(x / 11) * Math.cos(y / 7)]);

function noise(width: number, height: number) {
  let seed = 12345;
  const next = () => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24;
  return picture(width, height, () => [next(), next(), next()]);
}

/** The marker segments before the scan, and where the entropy-coded data starts. */
function segments(file: Uint8Array) {
  const found = new Map<number, Uint8Array>();
  let p = 2;
  for (;;) {
    assert.equal(file[p], 0xff);
    const marker = file[p + 1];
    const length = (file[p + 2] << 8) | file[p + 3];
    found.set(marker, file.subarray(p + 4, p + 2 + length));
    p += 2 + length;
    if (marker === 0xda) return { found, scan: p };
  }
}

// Natural index of each coefficient in zigzag order, walked out here rather than copied from the encoder.
const zigzag: number[] = [];
for (let s = 0; s < 15; s++) {
  for (let i = 0; i <= s; i++) {
    const row = s % 2 === 0 ? s - i : i;
    if (row < 8 && s - row < 8) zigzag.push(row * 8 + s - row);
  }
}

const cosines = new Float64Array(64);
for (let x = 0; x < 8; x++) for (let u = 0; u < 8; u++) cosines[x * 8 + u] = ((u === 0 ? Math.SQRT1_2 : 1) * Math.cos(((2 * x + 1) * u * Math.PI) / 16)) / 2;

/** A small baseline decoder (Huffman, any sampling, no restarts) to check what the encoder wrote. Returns RGB. */
function decode(file: Uint8Array) {
  const { found, scan } = segments(file);
  const quant: Int32Array[] = [];
  const dqt = found.get(0xdb)!;
  for (let p = 0; p < dqt.length; p += 65) quant[dqt[p] & 15] = Int32Array.from(dqt.subarray(p + 1, p + 65));
  const tables = new Map<number, Map<number, number>>();
  const dht = found.get(0xc4)!;
  for (let p = 0; p < dht.length; ) {
    const codes = new Map<number, number>();
    let k = p + 17;
    let code = 0;
    for (let length = 1; length <= 16; length++) {
      for (let n = 0; n < dht[p + length]; n++) codes.set((length << 16) | code++, dht[k++]);
      code <<= 1;
    }
    tables.set(dht[p], codes);
    p = k;
  }
  const sof = found.get(0xc0)!;
  const height = (sof[1] << 8) | sof[2];
  const width = (sof[3] << 8) | sof[4];
  const sos = found.get(0xda)!;
  const components = Array.from({ length: sof[5] }, (_, i) => ({
    h: sof[7 + i * 3] >> 4,
    v: sof[7 + i * 3] & 15,
    quant: quant[sof[8 + i * 3]],
    dc: tables.get(sos[2 + i * 2] >> 4)!,
    ac: tables.get(0x10 | (sos[2 + i * 2] & 15))!,
    predictor: 0,
    plane: new Float64Array(0),
    stride: 0,
  }));
  const hMax = Math.max(...components.map((c) => c.h));
  const vMax = Math.max(...components.map((c) => c.v));
  const across = Math.ceil(width / (8 * hMax));
  const down = Math.ceil(height / (8 * vMax));
  for (const c of components) {
    c.stride = across * c.h * 8;
    c.plane = new Float64Array(c.stride * down * c.v * 8);
  }

  let p = scan;
  let bits = 0;
  let count = 0;
  const bit = () => {
    if (count === 0) {
      bits = file[p++];
      if (bits === 0xff) assert.equal(file[p++], 0, "a marker inside the scan");
      count = 8;
    }
    return (bits >> --count) & 1;
  };
  const receive = (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | bit();
    return n > 0 && v < 1 << (n - 1) ? v - (1 << n) + 1 : v;
  };
  const symbol = (codes: Map<number, number>) => {
    let code = 0;
    for (let length = 1; length <= 16; length++) {
      code = (code << 1) | bit();
      const s = codes.get((length << 16) | code);
      if (s !== undefined) return s;
    }
    throw new Error("bad Huffman code");
  };
  const block = new Float64Array(64);
  const rows = new Float64Array(64);
  for (let m = 0; m < across * down; m++) {
    for (const c of components) {
      for (let by = 0; by < c.v; by++) {
        for (let bx = 0; bx < c.h; bx++) {
          block.fill(0);
          c.predictor += receive(symbol(c.dc));
          block[0] = c.predictor * c.quant[0];
          for (let k = 1; k < 64; ) {
            const rs = symbol(c.ac);
            if (rs === 0) break;
            k += rs >> 4;
            block[zigzag[k]] = receive(rs & 15) * c.quant[k];
            k++;
          }
          for (let y = 0; y < 8; y++) {
            for (let u = 0; u < 8; u++) {
              let sum = 0;
              for (let v = 0; v < 8; v++) sum += cosines[y * 8 + v] * block[v * 8 + u];
              rows[y * 8 + u] = sum;
            }
          }
          const x0 = ((m % across) * c.h + bx) * 8;
          const y0 = (Math.floor(m / across) * c.v + by) * 8;
          for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
              let sum = 0;
              for (let u = 0; u < 8; u++) sum += cosines[x * 8 + u] * rows[y * 8 + u];
              c.plane[(y0 + y) * c.stride + x0 + x] = sum + 128;
            }
          }
        }
      }
    }
  }

  const rgb = new Uint8ClampedArray(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [Y, Cb, Cr] = components.map((c) => c.plane[Math.floor((y * c.v) / vMax) * c.stride + Math.floor((x * c.h) / hMax)]);
      const o = (y * width + x) * 3;
      rgb[o] = Y + 1.402 * (Cr - 128);
      rgb[o + 1] = Y - 0.344136 * (Cb - 128) - 0.714136 * (Cr - 128);
      rgb[o + 2] = Y + 1.772 * (Cb - 128);
    }
  }
  return { width, height, rgb };
}

function meanError(pixels: Uint8Array, rgb: Uint8ClampedArray) {
  let sum = 0;
  for (let i = 0; i < rgb.length; i++) sum += Math.abs(rgb[i] - pixels[Math.floor(i / 3) * 4 + (i % 3)]);
  return sum / rgb.length;
}

test("a JPEG file is framed by SOI and EOI, says its size in SOF0, and stuffs every 0xFF in its scan", () => {
  const file = encodeJpeg(noise(40, 24), 40, 24, 95);
  assert.deepEqual([...file.subarray(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...file.subarray(-2)], [0xff, 0xd9]);
  const { found, scan } = segments(file);
  const sof = found.get(0xc0)!;
  assert.equal((sof[1] << 8) | sof[2], 24);
  assert.equal((sof[3] << 8) | sof[4], 40);
  let stuffed = 0;
  for (let p = scan; p < file.length - 2; p++) {
    if (file[p] !== 0xff) continue;
    assert.equal(file[p + 1], 0, `unstuffed 0xFF at ${p}`);
    stuffed++;
    p++;
  }
  assert.ok(stuffed > 0, "noise should have made at least one 0xFF to stuff");
});

test("encoding a step at a time gives the same file, and an encoder reused or interrupted gives what a fresh one does", () => {
  const pixels = gradient(37, 21);
  const once = encodeJpeg(pixels, 37, 21, 80);
  const encoder = new JpegEncoder(80);
  encoder.begin(noise(300, 200), 300, 200);
  encoder.step(Infinity);
  encoder.begin(noise(64, 64), 64, 64);
  encoder.step(3);
  assert.ok(encoder.busy);
  encoder.begin(pixels, 37, 21);
  let steps = 0;
  while (!encoder.step(1)) steps++;
  assert.equal(steps + 1, 6);
  assert.equal(encoder.busy, false);
  assert.deepEqual(encoder.bytes, once);
});

test("flipY reads the rows bottom-up", () => {
  const width = 37;
  const height = 21;
  const pixels = gradient(width, height);
  const flipped = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y++) flipped.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
  assert.deepEqual(encodeJpeg(pixels, width, height, 75, true), encodeJpeg(flipped, width, height, 75));
  assert.notDeepEqual(encodeJpeg(pixels, width, height, 75, true), encodeJpeg(pixels, width, height, 75));
});

test("a journal-sized smooth picture is small, and a single pixel works", () => {
  const smooth = picture(192, 108, (x, y) => [x + 30, y + 60, 200 - x / 2]);
  assert.ok(encodeJpeg(smooth, 192, 108, 70).length < 12 * 1024);
  const dot = decode(encodeJpeg(Uint8Array.of(200, 40, 90, 255), 1, 1, 90));
  assert.equal(dot.width, 1);
  assert.equal(dot.height, 1);
  assert.ok(meanError(Uint8Array.of(200, 40, 90, 255), dot.rgb) < 6);
});

test("decoding gives back a flat colour and a gradient closely", () => {
  const flat = picture(37, 21, () => [200, 80, 40]);
  assert.ok(meanError(flat, decode(encodeJpeg(flat, 37, 21, 90)).rgb) < 3);
  const sloped = gradient(192, 108);
  const decoded = decode(encodeJpeg(sloped, 192, 108, 90));
  assert.equal(decoded.width, 192);
  assert.equal(decoded.height, 108);
  assert.ok(meanError(sloped, decoded.rgb) < 6);
});

test("the data URL is the bytes in base64", () => {
  for (const length of [0, 1, 2, 3, 4, 5, 20000]) {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) & 255);
    assert.equal(jpegDataUrl(bytes), `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`);
  }
});
