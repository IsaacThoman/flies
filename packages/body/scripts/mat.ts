// Reads the numeric matrices of a MATLAB level 5 MAT-file (little-endian,
// compressed or not), which is how the DNa02 recordings steering.ts fits are
// published. Structs, cells and sparse arrays are skipped: those files hold
// none that are needed.

import { inflateSync } from "node:zlib";

const MI_INT8 = 1;
const MI_UINT8 = 2;
const MI_INT16 = 3;
const MI_UINT16 = 4;
const MI_INT32 = 5;
const MI_UINT32 = 6;
const MI_SINGLE = 7;
const MI_DOUBLE = 9;
const MI_INT64 = 12;
const MI_UINT64 = 13;
const MI_MATRIX = 14;
const MI_COMPRESSED = 15;
const MX_CHAR = 4;
const MX_NUMERIC_FIRST = 6;
const MX_NUMERIC_LAST = 15;

export type MatArray = { dims: number[]; data: Float64Array };

const BYTES: Record<number, number> = { [MI_INT8]: 1, [MI_UINT8]: 1, [MI_INT16]: 2, [MI_UINT16]: 2, [MI_INT32]: 4, [MI_UINT32]: 4, [MI_SINGLE]: 4, [MI_DOUBLE]: 8, [MI_INT64]: 8, [MI_UINT64]: 8 };

type Element = { type: number; start: number; size: number; next: number };

function element(view: DataView, at: number): Element {
  const first = view.getUint32(at, true);
  // The small element format packs a payload of up to 4 bytes into the tag.
  if (first >>> 16 !== 0) return { type: first & 0xffff, start: at + 4, size: first >>> 16, next: at + 8 };
  const size = view.getUint32(at + 4, true);
  return { type: first, start: at + 8, size, next: at + 8 + Math.ceil(size / 8) * 8 };
}

function numbers(view: DataView, e: Element): Float64Array {
  const width = BYTES[e.type];
  if (!width) throw new Error(`MAT element type ${e.type} isn't numeric`);
  const out = new Float64Array(e.size / width);
  for (let i = 0, at = e.start; i < out.length; i++, at += width) {
    switch (e.type) {
      case MI_INT8: out[i] = view.getInt8(at); break;
      case MI_UINT8: out[i] = view.getUint8(at); break;
      case MI_INT16: out[i] = view.getInt16(at, true); break;
      case MI_UINT16: out[i] = view.getUint16(at, true); break;
      case MI_INT32: out[i] = view.getInt32(at, true); break;
      case MI_UINT32: out[i] = view.getUint32(at, true); break;
      case MI_SINGLE: out[i] = view.getFloat32(at, true); break;
      case MI_DOUBLE: out[i] = view.getFloat64(at, true); break;
      case MI_INT64: out[i] = Number(view.getBigInt64(at, true)); break;
      case MI_UINT64: out[i] = Number(view.getBigUint64(at, true)); break;
    }
  }
  return out;
}

function matrix(view: DataView, e: Element, into: Map<string, MatArray>, wanted: (name: string) => boolean) {
  const flags = element(view, e.start);
  const mxClass = view.getUint32(flags.start, true) & 0xff;
  const dimsElement = element(view, flags.next);
  const dims = Array.from(numbers(view, dimsElement));
  const nameElement = element(view, dimsElement.next);
  const name = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + nameElement.start, nameElement.size));
  if (!(mxClass >= MX_NUMERIC_FIRST && mxClass <= MX_NUMERIC_LAST) && mxClass !== MX_CHAR) return;
  if (!wanted(name)) return;
  const real = element(view, nameElement.next);
  // A double matrix may be stored as a narrower integer type; numbers() widens it.
  if (real.type === MI_DOUBLE) {
    into.set(name, { dims, data: new Float64Array(view.buffer.slice(view.byteOffset + real.start, view.byteOffset + real.start + real.size)) });
  } else {
    into.set(name, { dims, data: numbers(view, real) });
  }
}

/** The numeric arrays in `bytes` whose names `wanted` accepts, as doubles, by name. */
export function readMat(bytes: Uint8Array, wanted: (name: string) => boolean = () => true): Map<string, MatArray> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (new TextDecoder().decode(bytes.subarray(0, 6)) !== "MATLAB") throw new Error("not a MAT-file");
  if (view.getUint16(126, true) !== 0x4d49) throw new Error("only little-endian MAT-files are read");
  const out = new Map<string, MatArray>();
  for (let at = 128; at + 8 <= bytes.byteLength; ) {
    const e = element(view, at);
    if (e.type === MI_COMPRESSED) {
      const inner = inflateSync(bytes.subarray(e.start, e.start + e.size));
      const innerView = new DataView(inner.buffer, inner.byteOffset, inner.byteLength);
      const m = element(innerView, 0);
      if (m.type === MI_MATRIX) matrix(innerView, m, out, wanted);
      // A compressed element is not padded to 8 bytes.
      at = e.start + e.size;
    } else {
      if (e.type === MI_MATRIX) matrix(view, e, out, wanted);
      at = e.next;
    }
  }
  return out;
}
