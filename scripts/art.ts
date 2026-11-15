// A tiny anti-aliased rasterizer and PNG encoder, for art drawn by script (placeholder-art.ts):
// shapes are signed distance functions in pixels, blended over an RGBA image with straight
// alpha. No dependencies beyond node:zlib.
import { deflateSync } from 'node:zlib';

export type RGBA = [number, number, number, number];
/** Signed distance from a pixel centre to a shape's edge, in pixels: negative inside. */
export type Shape = (x: number, y: number) => number;
/** A shape's colour at a pixel, for gradients. */
export type Paint = RGBA | ((x: number, y: number) => RGBA);

export const hex = (s: string, alpha = 1): RGBA => {
  const n = parseInt(s.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
};
export const mix = (a: RGBA, b: RGBA, t: number): RGBA => [0, 1, 2, 3].map((i) => a[i] + (b[i] - a[i]) * t) as RGBA;

export const circle = (cx: number, cy: number, r: number): Shape => (x, y) => Math.hypot(x - cx, y - cy) - r;
/** An ellipse turned by `angle` radians; the distance is approximate but exact enough at the edge. */
export const ellipse = (cx: number, cy: number, rx: number, ry: number, angle = 0): Shape => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return (x, y) => {
    const dx = x - cx, dy = y - cy;
    const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
    const k = Math.hypot(u, v);
    if (k < 1e-6) return -Math.min(rx, ry);
    // (k - 1) over the gradient of k, in pixels.
    return ((k - 1) * k) / Math.max(1e-9, Math.hypot(u / rx, v / ry));
  };
};
/** A line from (ax, ay) to (bx, by) with round ends, `w` wide. */
export const segment = (ax: number, ay: number, bx: number, by: number, w: number): Shape => (x, y) => {
  const px = x - ax, py = y - ay, qx = bx - ax, qy = by - ay;
  const t = Math.max(0, Math.min(1, (px * qx + py * qy) / (qx * qx + qy * qy)));
  return Math.hypot(px - qx * t, py - qy * t) - w / 2;
};
export const rect = (x0: number, y0: number, x1: number, y1: number): Shape => (x, y) => {
  const dx = Math.max(x0 - x, x - x1), dy = Math.max(y0 - y, y - y1);
  return dx > 0 && dy > 0 ? Math.hypot(dx, dy) : Math.max(dx, dy);
};
export const intersect = (a: Shape, b: Shape): Shape => (x, y) => Math.max(a(x, y), b(x, y));
export const subtract = (a: Shape, b: Shape): Shape => (x, y) => Math.max(a(x, y), -b(x, y));
/** The region below the curve y = f(x). */
export const below = (f: (x: number) => number): Shape => (x, y) => f(x) - y;

export class Image {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
  constructor(width: number, height: number) {
    this.width = width; this.height = height;
    this.data = new Float32Array(width * height * 4);
  }

  /** Paints a shape with `paint` at `opacity`, over what is there. A bounding box keeps it quick. */
  fill(shape: Shape, paint: Paint, opacity = 1, box?: [number, number, number, number]) {
    const [x0, y0, x1, y1] = box ?? [0, 0, this.width, this.height];
    const xa = Math.max(0, Math.floor(x0)), ya = Math.max(0, Math.floor(y0));
    const xb = Math.min(this.width, Math.ceil(x1)), yb = Math.min(this.height, Math.ceil(y1));
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++) {
        const cover = Math.max(0, Math.min(1, 0.5 - shape(x + 0.5, y + 0.5)));
        if (!cover) continue;
        const c = typeof paint === 'function' ? paint(x + 0.5, y + 0.5) : paint;
        this.blend(x, y, c, cover * c[3] * opacity);
      }
    }
  }

  blend(x: number, y: number, c: RGBA, a: number) {
    const i = (y * this.width + x) * 4, d = this.data;
    const da = d[i + 3], oa = a + da * (1 - a);
    if (!oa) return;
    for (let k = 0; k < 3; k++) d[i + k] = (c[k] * a + d[i + k] * da * (1 - a)) / oa;
    d[i + 3] = oa;
  }

  /** The image as a PNG (8-bit RGBA, or RGB when every pixel is opaque). */
  png() {
    const opaque = this.data.every((v, i) => i % 4 !== 3 || v >= 0.999);
    const channels = opaque ? 3 : 4, stride = this.width * channels;
    const rows = Buffer.alloc((stride + 1) * this.height);
    const prev = Buffer.alloc(stride), cur = Buffer.alloc(stride), sub = Buffer.alloc(stride), up = Buffer.alloc(stride);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = (y * this.width + x) * 4;
        for (let k = 0; k < channels; k++) cur[x * channels + k] = Math.round(Math.max(0, Math.min(1, k < 3 ? this.data[i + k] / 255 : this.data[i + 3])) * 255);
      }
      // Per row, whichever of the Sub and Up filters leaves smaller numbers to compress.
      let sumSub = 0, sumUp = 0;
      for (let j = 0; j < stride; j++) {
        sub[j] = (cur[j] - (j >= channels ? cur[j - channels] : 0)) & 255;
        up[j] = (cur[j] - prev[j]) & 255;
        sumSub += Math.min(sub[j], 256 - sub[j]); sumUp += Math.min(up[j], 256 - up[j]);
      }
      const o = y * (stride + 1);
      rows[o] = sumUp < sumSub ? 2 : 1;
      (sumUp < sumSub ? up : sub).copy(rows, o + 1);
      cur.copy(prev);
    }
    const chunk = (type: string, body: Buffer) => {
      const head = Buffer.alloc(8);
      head.writeUInt32BE(body.length, 0);
      head.write(type, 4, 'ascii');
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
      return Buffer.concat([head, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0); ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6;
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(b: Buffer) {
  let c = 0xffffffff;
  for (const byte of b) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
