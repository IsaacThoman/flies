// QR codes, for a table's invitation on a screen a phone can scan (ISO/IEC
// 18004). Only what a link needs: bytes (byte mode), error correction level
// M (a code on a TV across a room survives some glare and a little blur), and
// versions 1 to 10, up to 213 bytes. Made once per link, so it is written
// for clarity rather than speed.

/** The largest version made: 57 modules a side, room for a link to any reasonable site. */
const MAX_VERSION = 10;
/** Level M's error correction codewords in each block, and how many blocks, by version (index 0 unused). */
const EC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
/** The format bits name level M as 00. */
const LEVEL_M = 0;

/** A QR code: `size` modules a side, row by row, 1 dark. The quiet zone round it is the drawer's to leave. */
export type QrCode = { readonly version: number; readonly size: number; readonly mask: number; readonly modules: Uint8Array };

/** The module at column x, row y: true if dark. */
export const isDark = (qr: QrCode, x: number, y: number) => qr.modules[y * qr.size + x] === 1;

/** Modules carrying data and error correction in a version, after the finders, timing, alignment, format and version areas. */
function rawModules(version: number) {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}

const dataCodewords = (version: number) => Math.floor(rawModules(version) / 8) - EC_PER_BLOCK[version] * BLOCKS[version];
/** Bytes a version holds in byte mode: 4 bits of mode, the count (8 bits, 16 from version 10), then the bytes. */
const capacity = (version: number) => Math.floor((dataCodewords(version) * 8 - 4 - (version < 10 ? 8 : 16)) / 8);

// GF(256) with the QR polynomial x⁸ + x⁴ + x³ + x² + 1.
function multiply(a: number, b: number) {
  let r = 0;
  for (let i = 7; i >= 0; i--) {
    r = (r << 1) ^ ((r >>> 7) * 0x11d);
    r ^= ((b >>> i) & 1) * a;
  }
  return r;
}

/** The Reed–Solomon generator of a degree, highest power first with its leading 1 left out. */
function generator(degree: number) {
  const g = new Uint8Array(degree);
  g[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      g[j] = multiply(g[j], root);
      if (j + 1 < degree) g[j] ^= g[j + 1];
    }
    root = multiply(root, 0x02);
  }
  return g;
}

/** The error correction codewords for a block of data: the remainder of dividing it by the generator. */
export function reedSolomon(data: ArrayLike<number>, degree: number): Uint8Array {
  const g = generator(degree);
  const r = new Uint8Array(degree);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ r[0];
    r.copyWithin(0, 1);
    r[degree - 1] = 0;
    for (let j = 0; j < degree; j++) r[j] ^= multiply(g[j], factor);
  }
  return r;
}

/** The 15 format bits for level M and a mask: BCH(15,5), then XORed so they are never all light. */
export function formatBits(mask: number) {
  const data = (LEVEL_M << 3) | mask;
  let r = data;
  for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
  return ((data << 10) | r) ^ 0x5412;
}

/** The 18 version bits (version 7 and up): BCH(18,6). */
export function versionBits(version: number) {
  let r = version;
  for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
  return (version << 12) | r;
}

/** Where alignment patterns are centred, across and down, in a version. */
function alignments(version: number, size: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const at = [6];
  for (let p = size - 7; at.length < count; p -= step) at.splice(1, 0, p);
  return at;
}

/** The data codewords, then each block's error correction, interleaved as the standard lays them out. */
function codewords(bytes: Uint8Array, version: number): number[] {
  const total = dataCodewords(version);
  const bits: number[] = [];
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  // The terminator, as much of it as fits, then whole bytes, then the pad bytes in turn.
  put(0, Math.min(4, total * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0));
  for (let pad = 0xec; data.length < total; pad ^= 0xec ^ 0x11) data.push(pad);

  const blocks = BLOCKS[version];
  const ec = EC_PER_BLOCK[version];
  const raw = Math.floor(rawModules(version) / 8);
  // Some blocks are a codeword longer than the rest: the short ones come first.
  const short = blocks - (raw % blocks);
  const shortData = Math.floor(raw / blocks) - ec;
  const dataBlocks: number[][] = [];
  const ecBlocks: Uint8Array[] = [];
  for (let b = 0, at = 0; b < blocks; b++) {
    const length = shortData + (b < short ? 0 : 1);
    const block = data.slice(at, at + length);
    at += length;
    dataBlocks.push(block);
    ecBlocks.push(reedSolomon(block, ec));
  }
  const out: number[] = [];
  for (let i = 0; i <= shortData; i++) for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  for (let i = 0; i < ec; i++) for (const block of ecBlocks) out.push(block[i]);
  return out;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** A grid being built: its modules, and which of them are function patterns (never masked). */
class Grid {
  readonly size: number;
  readonly modules: Uint8Array;
  readonly fixed: Uint8Array;
  constructor(size: number) {
    this.size = size;
    this.modules = new Uint8Array(size * size);
    this.fixed = new Uint8Array(size * size);
  }
  set(x: number, y: number, dark: boolean) {
    this.modules[y * this.size + x] = dark ? 1 : 0;
    this.fixed[y * this.size + x] = 1;
  }
}

function drawFunctions(grid: Grid, version: number) {
  const size = grid.size;
  for (let i = 0; i < size; i++) {
    grid.set(6, i, i % 2 === 0);
    grid.set(i, 6, i % 2 === 0);
  }
  // The finders with their light separators, clipped at the edges.
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        grid.set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const at = alignments(version, size);
  for (let i = 0; i < at.length; i++) {
    for (let j = 0; j < at.length; j++) {
      // Not where a finder is.
      if ((i === 0 && j === 0) || (i === 0 && j === at.length - 1) || (i === at.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) grid.set(at[i] + dx, at[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  // Reserved for the format bits until the mask is chosen, and the dark module.
  drawFormat(grid, 0);
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      grid.set(a, b, dark);
      grid.set(b, a, dark);
    }
  }
}

function drawFormat(grid: Grid, mask: number) {
  const size = grid.size;
  const bits = formatBits(mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  // Round the top left finder...
  for (let i = 0; i <= 5; i++) grid.set(8, i, bit(i));
  grid.set(8, 7, bit(6));
  grid.set(8, 8, bit(7));
  grid.set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) grid.set(14 - i, 8, bit(i));
  // ...and again split between the other two.
  for (let i = 0; i < 8; i++) grid.set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) grid.set(8, size - 15 + i, bit(i));
  grid.set(8, size - 8, true);
}

/** Lays the codewords in the standard's zigzag, two columns at a time from the bottom right, skipping the timing column. */
function drawCodewords(grid: Grid, data: number[]) {
  const size = grid.size;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - v : v;
        if (grid.fixed[y * size + x]) continue;
        // Past the last codeword, the remainder bits are light.
        if (i < data.length * 8) grid.modules[y * size + x] = (data[i >>> 3] >>> (7 - (i & 7))) & 1;
        i++;
      }
    }
  }
}

function applyMask(grid: Grid, mask: number) {
  const size = grid.size;
  const f = MASKS[mask];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!grid.fixed[y * size + x] && f(x, y)) grid.modules[y * size + x] ^= 1;
}

/** The standard's penalty for a masked grid: runs, blocks, finder-like patterns and imbalance. Lower reads better. */
function penalty(grid: Grid) {
  const { size, modules } = grid;
  const at = (x: number, y: number) => modules[y * size + x];
  let score = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < size; a++) {
      let run = 0;
      let colour = -1;
      // The last 11 modules of the line, with light beyond the edge, for the 1:1:3:1:1 pattern beside four light.
      let window = 0;
      for (let b = -4; b < size + 4; b++) {
        const inside = b >= 0 && b < size;
        const c = inside ? (pass === 0 ? at(b, a) : at(a, b)) : 0;
        if (inside) {
          if (c === colour) {
            run++;
            if (run === 5) score += 3;
            else if (run > 5) score++;
          } else {
            colour = c;
            run = 1;
          }
        }
        window = ((window << 1) | c) & 0x7ff;
        if (b >= 6 && (window === 0b00001011101 || window === 0b10111010000)) score += 40;
      }
    }
  }
  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3;
    }
  }
  let dark = 0;
  for (const m of modules) dark += m;
  const total = size * size;
  score += 10 * (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1);
  return score;
}

/** The smallest version that holds this many bytes, or null if none up to version 10 does. */
export function qrVersionFor(bytes: number): number | null {
  for (let v = 1; v <= MAX_VERSION; v++) if (bytes <= capacity(v)) return v;
  return null;
}

/** A QR code for text (UTF-8, byte mode, level M), or null if it is too long for version 10. */
export function qrCode(text: string): QrCode | null {
  const bytes = new TextEncoder().encode(text);
  const version = qrVersionFor(bytes.length);
  if (version === null) return null;
  const size = version * 4 + 17;
  const base = new Grid(size);
  drawFunctions(base, version);
  drawCodewords(base, codewords(bytes, version));
  // Each mask in turn, keeping the one that reads best.
  let best: Grid | null = null;
  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < MASKS.length; mask++) {
    const grid = new Grid(size);
    grid.modules.set(base.modules);
    grid.fixed.set(base.fixed);
    applyMask(grid, mask);
    drawFormat(grid, mask);
    const score = penalty(grid);
    if (score < bestScore) {
      best = grid;
      bestMask = mask;
      bestScore = score;
    }
  }
  return { version, size, mask: bestMask, modules: best!.modules };
}
