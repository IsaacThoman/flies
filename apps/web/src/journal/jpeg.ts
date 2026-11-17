// A baseline JFIF encoder (4:2:0, Annex K tables, float AAN DCT). The Apple TV
// host has no canvas toDataURL or toBlob and runs JavaScript without a JIT, so
// pictures are encoded here a few MCUs per frame, in buffers kept between pictures.

const ZIGZAG = Uint8Array.of(
  0, 1, 5, 6, 14, 15, 27, 28, 2, 4, 7, 13, 16, 26, 29, 42, 3, 8, 12, 17, 25, 30, 41, 43, 9, 11, 18, 24, 31, 40, 44, 53,
  10, 19, 23, 32, 39, 45, 52, 54, 20, 22, 33, 38, 46, 51, 55, 60, 21, 34, 37, 47, 50, 56, 59, 61, 35, 36, 48, 49, 57, 58, 62, 63,
);

const LUMA_QUANT = Uint8Array.of(
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
);

const CHROMA_QUANT = Uint8Array.of(
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
);

// AAN's output scale per frequency, folded into the quantizer so the DCT has no multiplies to spare.
const AAN_SCALE = [1, 1.387039845, 1.306562965, 1.175875602, 1, 0.785694958, 0.5411961, 0.275899379];

// Each Huffman table is its DHT body: class and id, 16 code counts, then the symbols.
const DC_LUMA = Uint8Array.of(0x00, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);
const DC_CHROMA = Uint8Array.of(0x01, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);
const AC_LUMA = Uint8Array.of(
  0x10, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
);
const AC_CHROMA = Uint8Array.of(
  0x11, 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77,
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
  0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
  0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
  0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
  0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
  0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
);

interface HuffmanCodes {
  code: Uint16Array;
  size: Uint8Array;
}

function huffmanCodes(table: Uint8Array): HuffmanCodes {
  const codes = { code: new Uint16Array(256), size: new Uint8Array(256) };
  let code = 0;
  let k = 17;
  for (let length = 1; length <= 16; length++) {
    for (let n = 0; n < table[length]; n++) {
      codes.code[table[k]] = code++;
      codes.size[table[k++]] = length;
    }
    code <<= 1;
  }
  return codes;
}

const DC_LUMA_CODES = huffmanCodes(DC_LUMA);
const DC_CHROMA_CODES = huffmanCodes(DC_CHROMA);
const AC_LUMA_CODES = huffmanCodes(AC_LUMA);
const AC_CHROMA_CODES = huffmanCodes(AC_CHROMA);

// Worst case for one MCU's six blocks, every byte stuffed, with room to spare.
const MCU_BYTES = 4096;

export class JpegEncoder {
  private readonly quant = new Uint8Array(128);
  private readonly lumaScale = new Float32Array(64);
  private readonly chromaScale = new Float32Array(64);
  private readonly luma = new Float32Array(256);
  private readonly cb = new Float32Array(64);
  private readonly cr = new Float32Array(64);
  private readonly coefficients = new Int32Array(64);
  private out = new Uint8Array(16384);
  private length = 0;
  private bits = 0;
  private bitCount = 0;
  private dcY = 0;
  private dcCb = 0;
  private dcCr = 0;
  private pixels: Uint8Array | Uint8ClampedArray = new Uint8Array(0);
  private width = 0;
  private height = 0;
  private flipY = false;
  private next = 0;
  private total = 0;

  constructor(quality = 75) {
    const q = Math.min(100, Math.max(1, Math.round(quality)));
    const scale = q < 50 ? Math.floor(5000 / q) : 200 - q * 2;
    for (let i = 0; i < 64; i++) {
      this.quant[ZIGZAG[i]] = Math.min(255, Math.max(1, Math.floor((LUMA_QUANT[i] * scale + 50) / 100)));
      this.quant[64 + ZIGZAG[i]] = Math.min(255, Math.max(1, Math.floor((CHROMA_QUANT[i] * scale + 50) / 100)));
    }
    for (let i = 0; i < 64; i++) {
      const aan = AAN_SCALE[i >> 3] * AAN_SCALE[i & 7] * 8;
      this.lumaScale[i] = 1 / (this.quant[ZIGZAG[i]] * aan);
      this.chromaScale[i] = 1 / (this.quant[64 + ZIGZAG[i]] * aan);
    }
  }

  /** Whether a picture is in progress. */
  get busy() {
    return this.next < this.total;
  }

  /** The finished file (SOI..EOI) as bytes; valid after step() returned true. */
  get bytes() {
    if (this.busy || this.length === 0) throw new Error("no finished picture");
    return this.out.slice(0, this.length);
  }

  /**
   * Starts encoding a picture; any picture in progress is abandoned. The pixels
   * are read as the steps go, so they must stay unchanged until it finishes.
   */
  begin(pixels: Uint8Array | Uint8ClampedArray, width: number, height: number, flipY = false) {
    if (!(Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1 && width <= 65535 && height <= 65535)) {
      throw new Error(`bad picture size ${width}x${height}`);
    }
    if (pixels.length < width * height * 4) throw new Error("too few pixels for the picture size");
    this.pixels = pixels;
    this.width = width;
    this.height = height;
    this.flipY = flipY;
    this.next = 0;
    this.total = Math.ceil(width / 16) * Math.ceil(height / 16);
    this.length = 0;
    this.bits = 0;
    this.bitCount = 0;
    this.dcY = this.dcCb = this.dcCr = 0;
    this.writeHeaders();
  }

  /** Encodes up to `mcus` more 16x16 MCUs; returns true when the picture is finished. */
  step(mcus: number) {
    if (!this.busy) return true;
    const end = Math.min(this.total, this.next + Math.max(1, mcus));
    const across = Math.ceil(this.width / 16);
    for (; this.next < end; this.next++) {
      this.reserve(MCU_BYTES);
      this.encodeMcu((this.next % across) * 16, Math.floor(this.next / across) * 16);
    }
    if (this.busy) return false;
    if (this.bitCount > 0) this.writeBits((1 << (8 - this.bitCount)) - 1, 8 - this.bitCount);
    this.reserve(2);
    this.out[this.length++] = 0xff;
    this.out[this.length++] = 0xd9;
    return true;
  }

  private encodeMcu(x0: number, y0: number) {
    const { pixels, width, height, luma, cb, cr } = this;
    cb.fill(0);
    cr.fill(0);
    for (let row = 0; row < 16; row++) {
      const y = Math.min(y0 + row, height - 1);
      const line = (this.flipY ? height - 1 - y : y) * width * 4;
      const block = (row >> 3) * 128 + (row & 7) * 8;
      const half = (row >> 1) * 8;
      for (let col = 0; col < 16; col++) {
        const p = line + Math.min(x0 + col, width - 1) * 4;
        const r = pixels[p];
        const g = pixels[p + 1];
        const b = pixels[p + 2];
        luma[block + (col >> 3) * 64 + (col & 7)] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
        cb[half + (col >> 1)] += -0.16874 * r - 0.33126 * g + 0.5 * b;
        cr[half + (col >> 1)] += 0.5 * r - 0.41869 * g - 0.08131 * b;
      }
    }
    for (let i = 0; i < 64; i++) {
      cb[i] *= 0.25;
      cr[i] *= 0.25;
    }
    for (let i = 0; i < 4; i++) this.dcY = this.encodeBlock(luma, i * 64, this.lumaScale, this.dcY, DC_LUMA_CODES, AC_LUMA_CODES);
    this.dcCb = this.encodeBlock(cb, 0, this.chromaScale, this.dcCb, DC_CHROMA_CODES, AC_CHROMA_CODES);
    this.dcCr = this.encodeBlock(cr, 0, this.chromaScale, this.dcCr, DC_CHROMA_CODES, AC_CHROMA_CODES);
  }

  /** Transforms, quantizes and writes one 8x8 block; returns its DC for the next block's prediction. */
  private encodeBlock(data: Float32Array, at: number, scale: Float32Array, previousDc: number, dc: HuffmanCodes, ac: HuffmanCodes) {
    for (let pass = 0; pass < 2; pass++) {
      const stride = pass === 0 ? 1 : 8;
      const advance = pass === 0 ? 8 : 1;
      for (let line = 0, o = at; line < 8; line++, o += advance) {
        const d0 = data[o];
        const d1 = data[o + stride];
        const d2 = data[o + 2 * stride];
        const d3 = data[o + 3 * stride];
        const d4 = data[o + 4 * stride];
        const d5 = data[o + 5 * stride];
        const d6 = data[o + 6 * stride];
        const d7 = data[o + 7 * stride];
        const t0 = d0 + d7;
        const t7 = d0 - d7;
        const t1 = d1 + d6;
        const t6 = d1 - d6;
        const t2 = d2 + d5;
        const t5 = d2 - d5;
        const t3 = d3 + d4;
        const t4 = d3 - d4;
        const e10 = t0 + t3;
        const e13 = t0 - t3;
        const e11 = t1 + t2;
        const e12 = t1 - t2;
        data[o] = e10 + e11;
        data[o + 4 * stride] = e10 - e11;
        const z1 = (e12 + e13) * 0.707106781;
        data[o + 2 * stride] = e13 + z1;
        data[o + 6 * stride] = e13 - z1;
        const o10 = t4 + t5;
        const o11 = t5 + t6;
        const o12 = t6 + t7;
        const z5 = (o10 - o12) * 0.382683433;
        const z2 = 0.5411961 * o10 + z5;
        const z4 = 1.306562965 * o12 + z5;
        const z3 = o11 * 0.707106781;
        const z11 = t7 + z3;
        const z13 = t7 - z3;
        data[o + 5 * stride] = z13 + z2;
        data[o + 3 * stride] = z13 - z2;
        data[o + stride] = z11 + z4;
        data[o + 7 * stride] = z11 - z4;
      }
    }
    const coefficients = this.coefficients;
    for (let i = 0; i < 64; i++) {
      const v = data[at + i] * scale[i];
      coefficients[ZIGZAG[i]] = v > 0 ? (v + 0.5) | 0 : (v - 0.5) | 0;
    }

    const diff = coefficients[0] - previousDc;
    this.writeValue(diff, dc, 0);
    let last = 63;
    while (last > 0 && coefficients[last] === 0) last--;
    for (let i = 1; i <= last; i++) {
      let zeros = 0;
      while (coefficients[i] === 0) {
        zeros++;
        i++;
      }
      for (; zeros >= 16; zeros -= 16) this.writeBits(ac.code[0xf0], ac.size[0xf0]);
      this.writeValue(coefficients[i], ac, zeros << 4);
    }
    if (last < 63) this.writeBits(ac.code[0], ac.size[0]);
    return coefficients[0];
  }

  /** Writes a value as its Huffman-coded size category (plus `run` in the high nibble) and then its bits. */
  private writeValue(value: number, codes: HuffmanCodes, run: number) {
    const magnitude = value < 0 ? -value : value;
    const category = magnitude === 0 ? 0 : 32 - Math.clz32(magnitude);
    this.writeBits(codes.code[run | category], codes.size[run | category]);
    if (category > 0) this.writeBits((value < 0 ? value - 1 : value) & ((1 << category) - 1), category);
  }

  private writeBits(value: number, count: number) {
    // Bits above the pending count are left as garbage; only the low ones are ever read out.
    this.bits = (this.bits << count) | value;
    this.bitCount += count;
    while (this.bitCount >= 8) {
      this.bitCount -= 8;
      const byte = (this.bits >>> this.bitCount) & 0xff;
      this.out[this.length++] = byte;
      if (byte === 0xff) this.out[this.length++] = 0;
    }
  }

  private writeHeaders() {
    this.reserve(1024);
    this.writeBytes(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0));
    this.writeBytes(Uint8Array.of(0xff, 0xdb, 0, 132, 0));
    this.writeBytes(this.quant.subarray(0, 64));
    this.out[this.length++] = 1;
    this.writeBytes(this.quant.subarray(64));
    const { width: w, height: h } = this;
    this.writeBytes(Uint8Array.of(0xff, 0xc0, 0, 17, 8, h >> 8, h & 0xff, w >> 8, w & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1));
    const dhtLength = 2 + DC_LUMA.length + AC_LUMA.length + DC_CHROMA.length + AC_CHROMA.length;
    this.writeBytes(Uint8Array.of(0xff, 0xc4, dhtLength >> 8, dhtLength & 0xff));
    this.writeBytes(DC_LUMA);
    this.writeBytes(AC_LUMA);
    this.writeBytes(DC_CHROMA);
    this.writeBytes(AC_CHROMA);
    this.writeBytes(Uint8Array.of(0xff, 0xda, 0, 12, 3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0));
  }

  private writeBytes(bytes: Uint8Array) {
    this.out.set(bytes, this.length);
    this.length += bytes.length;
  }

  private reserve(bytes: number) {
    if (this.length + bytes <= this.out.length) return;
    let size = this.out.length * 2;
    while (size < this.length + bytes) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.out.subarray(0, this.length));
    this.out = grown;
  }
}

/** Encodes at once (tests, and hosts where time doesn't matter). */
export function encodeJpeg(pixels: Uint8Array | Uint8ClampedArray, width: number, height: number, quality = 75, flipY = false) {
  const encoder = new JpegEncoder(quality);
  encoder.begin(pixels, width, height, flipY);
  encoder.step(Infinity);
  return encoder.bytes;
}

const BASE64 = Uint8Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", (c) => c.charCodeAt(0));

/** "data:image/jpeg;base64,..." built straight from the bytes: JavaScriptCore hosts may have neither btoa nor Buffer. */
export function jpegDataUrl(bytes: Uint8Array) {
  const ascii = new Uint8Array(Math.ceil(bytes.length / 3) * 4);
  let o = 0;
  for (let i = 0; i < bytes.length; i += 3) {
    const rest = bytes.length - i;
    const n = (bytes[i] << 16) | ((rest > 1 ? bytes[i + 1] : 0) << 8) | (rest > 2 ? bytes[i + 2] : 0);
    ascii[o++] = BASE64[n >> 18];
    ascii[o++] = BASE64[(n >> 12) & 63];
    ascii[o++] = rest > 1 ? BASE64[(n >> 6) & 63] : 61;
    ascii[o++] = rest > 2 ? BASE64[n & 63] : 61;
  }
  let text = "data:image/jpeg;base64,";
  // In pieces, since a call takes a limited number of arguments.
  for (let i = 0; i < ascii.length; i += 8192) text += String.fromCharCode(...ascii.subarray(i, i + 8192));
  return text;
}
