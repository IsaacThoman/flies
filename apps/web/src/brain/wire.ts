// The packed connectome as it travels to a browser: the same bytes,
// rearranged so gzip can find their pattern, then gzipped. Sorted columns
// become the steps between neighbours (the targets of each neuron step up
// through the neuron numbers, so the steps are small), and every column of
// 16- or 32-bit numbers is split into byte planes, so the near-empty high
// bytes run together. Plain gzip makes the 40 MB file 21 MB; this makes it 14,
// a third less to download on a phone.
//
// The build encodes it (scripts/webBuild.ts); the brain's worker decodes it as
// it is decompressed (brain.worker.ts). The layout is otherwise
// packages/brain's (src/format.ts), whose loader checks the result.

/** Marks a rearranged connectome; decoding puts the format's own magic back. */
export const WIRE_MAGIC = "FLYW";
const CONNECTOME_MAGIC = "CBUG";

/** Columns sent as steps: across the whole column, or within each neuron's row of targets (rows from `ptr`). */
const STEPS: Readonly<Record<string, "column" | "rows">> = { rootId: "column", ptr: "column", post: "rows" };

const BYTES = { u8: 1, u16: 2, u32: 4 } as const;

type Section = { name: string; start: number; length: number; width: number };
type Layout = { dataStart: number; size: number; sections: Section[] };

const align8 = (n: number) => (n + 7) & ~7;
const magicOf = (bytes: Uint8Array) => String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
const writeMagic = (bytes: Uint8Array, magic: string) => {
  for (let i = 0; i < 4; i++) bytes[i] = magic.charCodeAt(i);
};

/** Where each section is, from a connectome's first bytes; null until enough of them have arrived. */
function layoutOf(head: Uint8Array): Layout | null {
  if (head.length < 12) return null;
  const headerLength = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(8, true);
  if (head.length < 12 + headerLength) return null;
  let header: { sections?: Record<string, { type: keyof typeof BYTES; offset: number; length: number }> };
  try {
    header = JSON.parse(new TextDecoder().decode(head.subarray(12, 12 + headerLength)));
  } catch {
    throw new Error("The fly's brain arrived damaged (its header can't be read).");
  }
  const dataStart = align8(12 + headerLength);
  const sections: Section[] = [];
  let size = dataStart;
  for (const [name, info] of Object.entries(header.sections ?? {})) {
    const width = BYTES[info.type];
    if (!width || !Number.isSafeInteger(info.offset) || !Number.isSafeInteger(info.length) || info.offset < 0 || info.length < 0) {
      throw new Error("The fly's brain arrived damaged (its header is wrong).");
    }
    const start = dataStart + info.offset;
    sections.push({ name, start, length: info.length, width });
    size = Math.max(size, align8(start + info.length * width));
  }
  sections.sort((a, b) => a.start - b.start);
  return { dataStart, size, sections };
}

/** Rearranges a packed connectome for the wire (not yet compressed). */
export function encodeWire(connectome: Uint8Array): Uint8Array {
  if (magicOf(connectome) !== CONNECTOME_MAGIC) throw new Error("Not a packed connectome");
  const layout = layoutOf(connectome);
  if (!layout || layout.size !== connectome.length) throw new Error("The connectome's header doesn't match its size");
  const out = connectome.slice();
  const words = (s: Section, from: Uint8Array) => new Uint32Array(from.buffer, from.byteOffset + s.start, s.length);
  const ptr = layout.sections.find((s) => s.name === "ptr");
  for (const s of layout.sections) {
    const steps = STEPS[s.name];
    if (!steps) continue;
    const values = words(s, connectome);
    const into = words(s, out);
    if (steps === "column") {
      for (let i = s.length - 1; i > 0; i--) into[i] = values[i] - values[i - 1];
    } else {
      const rows = words(ptr!, connectome);
      for (let r = 0; r + 1 < rows.length; r++) {
        for (let k = rows[r + 1] - 1; k > rows[r]; k--) into[k] = values[k] - values[k - 1];
      }
    }
  }
  for (const s of layout.sections) {
    if (s.width === 1) continue;
    const plain = out.slice(s.start, s.start + s.length * s.width);
    for (let b = 0; b < s.width; b++) {
      const plane = s.start + b * s.length;
      for (let i = 0; i < s.length; i++) out[plane + i] = plain[i * s.width + b];
    }
  }
  writeMagic(out, WIRE_MAGIC);
  return out;
}

/** Where the decoded connectome goes: given its size, the bytes to write it into. */
export type Allocate = (bytes: number) => Uint8Array<ArrayBuffer>;

/**
 * Puts a wire connectome back together as its bytes arrive, writing each
 * straight to its place, so nothing but the result is held in memory. The
 * place is a buffer of its own, or what `allocate` gives (the WebAssembly
 * brain's memory, so the connectome never exists twice).
 */
export class WireDecoder {
  #head: Uint8Array = new Uint8Array(0);
  #layout: Layout | null = null;
  #out: Uint8Array<ArrayBuffer> | null = null;
  #at = 0;
  readonly #allocate: Allocate;

  constructor(allocate: Allocate = (bytes) => new Uint8Array(bytes)) {
    this.#allocate = allocate;
  }

  /** Bytes taken so far. */
  get received() {
    return this.#at;
  }

  write(chunk: Uint8Array) {
    if (!this.#layout) {
      const head = new Uint8Array(this.#head.length + chunk.length);
      head.set(this.#head);
      head.set(chunk, this.#head.length);
      this.#head = head;
      if (head.length >= 4 && magicOf(head) !== WIRE_MAGIC) throw new Error("This isn't the fly's brain.");
      this.#layout = layoutOf(head);
      if (!this.#layout) return;
      this.#out = this.#allocate(this.#layout.size);
      this.#head = new Uint8Array(0);
      chunk = head;
    }
    const out = this.#out!;
    if (this.#at + chunk.length > out.length) throw new Error("The fly's brain arrived longer than it should be.");
    let from = 0;
    while (from < chunk.length) {
      const at = this.#at + from;
      const s = this.#sectionAt(at);
      // Outside the split sections (the header, padding, single bytes): as it is.
      if (!s || s.width === 1) {
        const end = Math.min(chunk.length, from + (s ? s.start + s.length - at : this.#nextStart(at) - at));
        out.set(chunk.subarray(from, end), at);
        from = end;
        continue;
      }
      const offset = at - s.start;
      const plane = Math.floor(offset / s.length);
      const first = offset - plane * s.length;
      const count = Math.min(s.length - first, chunk.length - from);
      let to = s.start + first * s.width + plane;
      for (let k = 0; k < count; k++, to += s.width) out[to] = chunk[from + k];
      from += count;
    }
    this.#at += chunk.length;
  }

  /** The packed connectome, once every byte has arrived. */
  finish(): Uint8Array<ArrayBuffer> {
    const layout = this.#layout;
    const out = this.#out;
    if (!layout || !out || this.#at !== out.length) throw new Error("The fly's brain arrived incomplete.");
    const words = (s: Section) => new Uint32Array(out.buffer, out.byteOffset + s.start, s.length);
    const ptr = layout.sections.find((s) => s.name === "ptr");
    for (const name of ["rootId", "ptr", "post"]) {
      const s = layout.sections.find((x) => x.name === name);
      if (!s) continue;
      const values = words(s);
      if (STEPS[name] === "column") {
        for (let i = 1; i < values.length; i++) values[i] += values[i - 1];
      } else {
        const rows = words(ptr!);
        for (let r = 0; r + 1 < rows.length; r++) {
          const end = Math.min(rows[r + 1], values.length);
          for (let k = rows[r] + 1; k < end; k++) values[k] += values[k - 1];
        }
      }
    }
    writeMagic(out, CONNECTOME_MAGIC);
    this.#out = null;
    return out;
  }

  #sectionAt(at: number): Section | null {
    for (const s of this.#layout!.sections) if (at >= s.start && at < s.start + s.length * s.width) return s;
    return null;
  }

  #nextStart(at: number) {
    for (const s of this.#layout!.sections) if (s.start > at) return s.start;
    return this.#out!.length;
  }
}

/** The packed connectome from the gzipped wire form, decoded as it is unzipped (into `allocate`'s bytes, if given). */
export async function unpackConnectome(data: ArrayBuffer, allocate?: Allocate): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = new Uint8Array(data);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error("This isn't the fly's brain.");
  if (typeof DecompressionStream === "undefined") throw new Error("This browser can't unpack the fly's brain (it has no DecompressionStream).");
  const decoder = new WireDecoder(allocate);
  // Fed a megabyte at a time, views not copies, so no browser hands back all 40 MB in one piece.
  let fed = 0;
  const input = new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      if (fed >= bytes.length) return controller.close();
      const end = Math.min(bytes.length, fed + (1 << 20));
      controller.enqueue(bytes.subarray(fed, end));
      fed = end;
    },
  });
  const reader = input.pipeThrough(new DecompressionStream("gzip")).getReader();
  for (;;) {
    let next: ReadableStreamReadResult<Uint8Array>;
    try {
      next = await reader.read();
    } catch {
      throw new Error("The fly's brain arrived damaged (it doesn't unzip).");
    }
    if (next.done) break;
    decoder.write(next.value);
  }
  return decoder.finish();
}
