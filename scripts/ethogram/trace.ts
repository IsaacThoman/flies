// Exact binary observations let an independent analysis reproduce an audit without rerunning the brain.
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';

export type TraceKind = 'free' | 'escape';
export type TraceInfo = { kind: TraceKind; path: string; sha256: string; frames: number; recordBytes: number };
export type FreeInitial = { x: number; y: number; z: number; yaw: number; unwrappedYaw: number; onFeet: boolean };
export type FreeTrace = TraceInfo & { dtSeconds: number; initial: FreeInitial; floor: { kind: 'circle'; r: number } | { kind: 'rect'; hx: number; hz: number } };
const MAGIC = { free: 'FLYFREE1', escape: 'FLYESC01' } as const;
export const FREE_FLAGS = { onFeet: 1, grooming: 2, eating: 4, jumped: 8 } as const;
export const ESCAPE_FLAGS = { onFeet: 1, jumped: 2 } as const;
const fields = (kind: TraceKind) => kind === 'free' ? 4 : 7;

/** Records an index, state flags and four/seven Float64 values, all little endian. */
export class FrameWriter {
  #fd: number;
  #hash = createHash('sha256');
  #buffer: Buffer;
  #frames = 0;
  #closed: TraceInfo | null = null;
  readonly kind: TraceKind;
  readonly path: string;
  constructor(path: string, kind: TraceKind) {
    this.kind = kind; this.path = resolve(path);
    this.#buffer = Buffer.alloc(8 + fields(kind) * 8);
    this.#fd = openSync(this.path, 'wx');
    const magic = Buffer.from(MAGIC[kind]);
    writeSync(this.#fd, magic); this.#hash.update(magic);
  }
  write(flags: number, values: readonly number[]) {
    if (this.#closed) throw new Error('trace already closed');
    if (!Number.isInteger(flags) || flags < 0 || flags > (this.kind === 'free' ? 15 : 3) || values.length !== fields(this.kind) || values.some(v => !Number.isFinite(v))) throw new Error('invalid trace observation');
    this.#buffer.writeUInt32LE(this.#frames, 0);
    this.#buffer.writeUInt32LE(flags, 4);
    values.forEach((v, i) => this.#buffer.writeDoubleLE(v, 8 + i * 8));
    if (writeSync(this.#fd, this.#buffer) !== this.#buffer.length) throw new Error('short trace write');
    this.#hash.update(this.#buffer); this.#frames++;
  }
  close(): TraceInfo {
    if (!this.#closed) {
      closeSync(this.#fd);
      this.#closed = { kind: this.kind, path: this.path, sha256: this.#hash.digest('hex'), frames: this.#frames, recordBytes: this.#buffer.length };
    }
    return this.#closed;
  }
}

export function* traceFrames(info: TraceInfo) {
  if (!Object.hasOwn(MAGIC, info.kind) || !Number.isSafeInteger(info.frames) || info.frames < 0 || info.frames > 20_000_000 || info.recordBytes !== 8 + fields(info.kind) * 8) throw new Error('invalid trace descriptor');
  const data = readFileSync(info.path);
  if (data.length !== 8 + info.frames * info.recordBytes || data.subarray(0, 8).toString() !== MAGIC[info.kind] || createHash('sha256').update(data).digest('hex') !== info.sha256) throw new Error('trace length, format or digest mismatch');
  for (let frame = 0; frame < info.frames; frame++) {
    const at = 8 + frame * info.recordBytes;
    const flags = data.readUInt32LE(at + 4);
    if (data.readUInt32LE(at) !== frame || flags > (info.kind === 'free' ? 15 : 3)) throw new Error('trace index or flags invalid');
    const values = Array.from({ length: fields(info.kind) }, (_, i) => data.readDoubleLE(at + 8 + i * 8));
    if (values.some(v => !Number.isFinite(v))) throw new Error('nonfinite trace observation');
    yield { frame, flags, values };
  }
}
