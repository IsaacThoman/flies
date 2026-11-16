// Display annotations stay separate from the wiring consumed by both brains.
import { loadConnectome } from "./format.ts";
import type { CategoryColumn, Connectome, SectionInfo } from "./format.ts";

export type Position = [number, number, number];
export type Bounds = { min: Position; max: Position };
export const ANATOMY_CATEGORIES = ["neuromere", "entryNerve", "rootSide"] as const;
export type AnatomyCategory = (typeof ANATOMY_CATEGORIES)[number];
export type AnatomyHeader = {
  neurons: number;
  connectomeSha256: string;
  source: { dataset: string; institution: string; version: string; license: string; url: string; sha256: string };
  frame: "male-cns-v1.0";
  units: "micrometres";
  bounds: Bounds;
  sections: Record<"position" | "positionKind" | AnatomyCategory, SectionInfo>;
  tables: Record<AnatomyCategory, string[]>;
};
export type AnatomyData = Pick<AnatomyHeader, "connectomeSha256" | "source" | "bounds"> & {
  position: Uint16Array;
  /** 0 absent, 1 somaLocation, 2 tosomaLocation (fibre point, not a soma). */
  positionKind: Uint8Array;
  columns: Record<AnatomyCategory, { codes: Uint8Array; table: readonly string[] }>;
};
export type Anatomy = {
  readonly header: AnatomyHeader;
  readonly positionCodes: Uint16Array;
  readonly positionKind: Uint8Array;
  readonly columns: Record<AnatomyCategory, CategoryColumn & { readonly codes: Uint8Array }>;
  /** Dataset coordinates in micrometres, including explicitly flagged fibre fallbacks. */
  position(i: number, out?: Position): Position | null;
  segment(i: number): string;
  /** Dataset bounding box to [0,1]^3; degenerate axes map to 0. */
  unitBox(position: readonly number[], out?: Position): Position;
};

export class AnatomyFormatError extends Error {
  override name = "AnatomyFormatError";
}
function fail(message: string): never { throw new AnatomyFormatError(message); }
const align8 = (n: number) => Math.ceil(n / 8) * 8;
const NAMES = ["position", "positionKind", ...ANATOMY_CATEGORIES] as const;
const littleEndian = () => new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const hashValid = (s: unknown) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);

export async function sha256(buffer: ArrayBuffer): Promise<string> {
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", buffer));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Serialises deterministically; validates before returning anything to write. */
export function writeAnatomy(data: AnatomyData): Uint8Array<ArrayBuffer> {
  if (!littleEndian()) fail("Writing anatomy needs a little-endian machine");
  const n = data.positionKind.length;
  const sections = {} as AnatomyHeader["sections"];
  const arrays: Record<(typeof NAMES)[number], Uint8Array | Uint16Array> = {
    position: data.position, positionKind: data.positionKind,
    ...Object.fromEntries(ANATOMY_CATEGORIES.map((k) => [k, data.columns[k].codes])) as Record<AnatomyCategory, Uint8Array>,
  };
  let offset = 0;
  for (const name of NAMES) {
    const a = arrays[name];
    const wide = name === "position";
    if (!(wide ? a instanceof Uint16Array : a instanceof Uint8Array) || a.length !== n * (wide ? 3 : 1)) fail(`Bad anatomy ${name} array`);
    sections[name] = { type: wide ? "u16" : "u8", offset, length: a.length };
    offset = align8(offset + a.byteLength);
  }
  const header: AnatomyHeader = {
    neurons: n, connectomeSha256: data.connectomeSha256, source: data.source,
    frame: "male-cns-v1.0", units: "micrometres", bounds: data.bounds, sections,
    tables: Object.fromEntries(ANATOMY_CATEGORIES.map((k) => [k, [...data.columns[k].table]])) as AnatomyHeader["tables"],
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const start = align8(12 + json.length);
  const out = new Uint8Array(start + offset);
  out.set(new TextEncoder().encode("FANA"));
  const view = new DataView(out.buffer);
  view.setUint32(4, 1, true);
  view.setUint32(8, json.length, true);
  out.set(json, 12);
  for (const name of NAMES) {
    const a = arrays[name];
    out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), start + sections[name].offset);
  }
  parseAnatomy(out.buffer);
  return out;
}

function parseAnatomy(buffer: ArrayBuffer): Anatomy {
  if (!littleEndian()) fail("Anatomy needs a little-endian machine");
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12 || new TextDecoder().decode(bytes.subarray(0, 4)) !== "FANA") fail("Not anatomy: expected FANA magic");
  const view = new DataView(buffer);
  if (view.getUint32(4, true) !== 1) fail("Unsupported anatomy version (expected 1)");
  const end = 12 + view.getUint32(8, true);
  if (end > bytes.length) fail("Truncated anatomy header");
  let h: AnatomyHeader;
  try { h = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(12, end))); }
  catch { fail("Corrupt anatomy JSON header"); }
  if (!h || typeof h !== "object" || !Number.isSafeInteger(h.neurons) || h.neurons < 0) fail("Bad anatomy neuron count");
  if (!hashValid(h.connectomeSha256)) fail("Bad anatomy connectome SHA-256");
  if (!h.source || !["dataset", "institution", "version", "license", "url"].every((k) => typeof h.source[k as keyof typeof h.source] === "string" && h.source[k as keyof typeof h.source].length > 0) || !hashValid(h.source.sha256)) fail("Missing anatomy source provenance");
  if (h.frame !== "male-cns-v1.0" || h.units !== "micrometres") fail("Unsupported anatomy coordinate frame or units");
  const bounds = h.bounds;
  if (!bounds || ![bounds.min, bounds.max].every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)) || bounds.min.some((v, k) => v > bounds.max[k])) fail("Bad anatomy bounding box");
  const start = align8(end);
  let offset = 0;
  const arrays = {} as Record<(typeof NAMES)[number], Uint8Array | Uint16Array>;
  for (const name of NAMES) {
    const wide = name === "position";
    const s = h.sections?.[name];
    const length = h.neurons * (wide ? 3 : 1);
    if (!s || s.type !== (wide ? "u16" : "u8") || s.length !== length || s.offset !== offset) fail(`Bad anatomy ${name} section (type, length or offset)`);
    const stop = start + offset + length * (wide ? 2 : 1);
    if (!Number.isSafeInteger(stop) || stop > bytes.length) fail(`Truncated anatomy ${name} section`);
    arrays[name] = wide ? new Uint16Array(buffer, start + offset, length) : new Uint8Array(buffer, start + offset, length);
    offset = align8(offset + length * (wide ? 2 : 1));
  }
  if (start + offset !== bytes.length) fail("Bad anatomy file length");
  for (let k = end; k < start; k++) if (bytes[k] !== 0) fail("Nonzero anatomy header padding");
  for (const name of NAMES) {
    const s = h.sections[name];
    const stop = start + s.offset + s.length * (name === "position" ? 2 : 1);
    for (let k = stop; k < align8(stop); k++) if (bytes[k] !== 0) fail(`Nonzero anatomy ${name} padding`);
  }
  const columns = {} as Anatomy["columns"];
  for (const name of ANATOMY_CATEGORIES) {
    const table = h.tables?.[name];
    if (!Array.isArray(table) || table.length > 256 || table[0] !== "" || !table.every((v, k) => typeof v === "string" && (k === 0 || v > table[k - 1]))) fail(`Bad anatomy ${name} string table`);
    const codes = arrays[name] as Uint8Array;
    for (const code of codes) if (code >= table.length) fail(`Anatomy ${name} code out of range`);
    columns[name] = { codes, table, value: (i) => table[codes[i]], code: (s) => table.indexOf(s) };
  }
  const positionCodes = arrays.position as Uint16Array;
  const positionKind = arrays.positionKind as Uint8Array;
  for (let i = 0; i < h.neurons; i++) {
    if (positionKind[i] > 2) fail(`Bad anatomy position kind at neuron ${i}`);
    if (!positionKind[i] && positionCodes.subarray(3 * i, 3 * i + 3).some((v) => v !== 0)) fail(`Absent anatomy position has coordinates at neuron ${i}`);
  }
  const index = (i: number) => { if (!Number.isInteger(i) || i < 0 || i >= h.neurons) throw new RangeError(`Anatomy neuron ${i} out of range`); };
  return {
    header: h, positionCodes, positionKind, columns,
    position(i, out = [0, 0, 0]) {
      index(i);
      if (!positionKind[i]) return null;
      for (let k = 0; k < 3; k++) out[k] = bounds.min[k] + positionCodes[3 * i + k] / 65535 * (bounds.max[k] - bounds.min[k]);
      return out;
    },
    segment(i) { index(i); return columns.neuromere.value(i); },
    unitBox(p, out = [0, 0, 0]) {
      if (p.length !== 3 || !p.every(Number.isFinite)) throw new RangeError("Expected a finite 3D position");
      for (let k = 0; k < 3; k++) out[k] = bounds.max[k] === bounds.min[k] ? 0 : (p[k] - bounds.min[k]) / (bounds.max[k] - bounds.min[k]);
      return out;
    },
  };
}

/** Validates the actual wiring bytes, including their hash, before exposing any views. */
export async function loadAnatomy(buffer: ArrayBuffer, connectomeBuffer: ArrayBuffer): Promise<Anatomy> {
  const anatomy = parseAnatomy(buffer);
  if (await sha256(connectomeBuffer) !== anatomy.header.connectomeSha256) fail("Anatomy/connectome mismatch: SHA-256 differs; run npm run brain:fetch to get a matching pair");
  if (loadConnectome(connectomeBuffer).neurons !== anatomy.header.neurons) fail("Anatomy/connectome mismatch: neuron counts differ");
  return anatomy;
}

/** +x left, +y dorsal, +z anterior, µm; an orientation, not a live-body registration. */
export function anatomicalPosition(p: readonly number[], out: Position = [0, 0, 0]): Position {
  out[0] = p[0] - 400;
  out[1] = 300 - p[1];
  out[2] = -p[2];
  return out;
}

export type CordSegment = { segment: string; side: string; neurons: Uint32Array };
/** A proposed catalog view only: leaves REGIONS and all simulation readouts alone. */
export function cordSegments(connectome: Connectome, anatomy: Anatomy): CordSegment[] {
  if (connectome.neurons !== anatomy.header.neurons) fail("Cord segment view needs matching neuron counts");
  const groups = new Map<string, { segment: string; side: string; neurons: number[] }>();
  for (const i of connectome.find({ superClass: "vnc_intrinsic" })) {
    const segment = anatomy.segment(i);
    const somaSide = connectome.columns.side.value(i);
    const side = somaSide === "center" ? "midline" : somaSide;
    const key = `${segment}/${side}`;
    if (!groups.has(key)) groups.set(key, { segment, side, neurons: [] });
    groups.get(key)!.neurons.push(i);
  }
  return [...groups.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, g]) => ({ ...g, neurons: Uint32Array.from(g.neurons) }));
}
