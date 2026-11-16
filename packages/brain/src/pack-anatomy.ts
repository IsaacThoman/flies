// Node-only: Feather and its compression codecs never enter the game bundle.
import { compressionRegistry, CompressionType, tableFromIPC } from "apache-arrow";
import lz4 from "lz4js";
import { loadConnectome } from "./format.ts";
import { ANATOMY_CATEGORIES, sha256, writeAnatomy } from "./anatomy.ts";
import type { AnatomyCategory, AnatomyData, Bounds, Position } from "./anatomy.ts";
import { PackError } from "./pack.ts";

export const ANNOTATION_URL = "https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/body-annotations-male-cns-v1.0-minconf-0.5.feather";
export const ANNOTATION_SHA256 = "2177e246113e4cfbf1e7772ec37c6da1955ff22e8063d0b1f833101f99a9a3b2";
export const ANATOMY_SOURCE = {
  dataset: "FlyEM male CNS", institution: "Janelia Research Campus", version: "v1.0-minconf-0.5",
  license: "CC-BY 4.0", url: ANNOTATION_URL, sha256: ANNOTATION_SHA256,
};
const FIELDS = ["bodyId", "somaLocation", "tosomaLocation", "somaNeuromere", "entryNerve", "rootSide"] as const;
export type AnnotationRow = Record<(typeof FIELDS)[number], unknown>;
function fail(message: string): never { throw new PackError(message); }

function location(value: unknown, context: string): Position | null {
  if (value === null) return null;
  if (typeof value !== "object" || value === undefined || !(Symbol.iterator in value)) fail(`${context}: expected three voxel coordinates or null`);
  const p = Array.from(value as Iterable<unknown>, (v) => typeof v === "bigint" ? Number(v) : v);
  if (p.length !== 3 || !p.every((v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0)) fail(`${context}: expected three nonnegative integer voxel coordinates`);
  return (p as Position).map((v) => v * 0.008) as Position;
}

/** Joins by bodyId, never by row order; unknown bodies are allowed, missing or duplicate IDs are not. */
export async function packAnatomyRows(rows: Iterable<AnnotationRow>, connectomeBuffer: ArrayBuffer, source = ANATOMY_SOURCE): Promise<Uint8Array<ArrayBuffer>> {
  const c = loadConnectome(connectomeBuffer);
  const n = c.neurons;
  const seen = new Set<number>();
  const matched = new Uint8Array(n);
  const positions = new Float64Array(3 * n);
  const positionKind = new Uint8Array(n);
  const values = Object.fromEntries(ANATOMY_CATEGORIES.map((k) => [k, new Array<string>(n).fill("")])) as Record<AnatomyCategory, string[]>;
  const bounds: Bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let rowNumber = 0;
  for (const row of rows) {
    const context = `Annotations row ${++rowNumber}`;
    if (!row || typeof row !== "object") fail(`${context}: expected an annotation record`);
    const id = typeof row.bodyId === "bigint" ? Number(row.bodyId) : row.bodyId;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 || id > 0xffffffff) fail(`${context}: invalid bodyId`);
    if (seen.has(id)) fail(`${context}: duplicate bodyId ${id}`);
    seen.add(id);
    const soma = location(row.somaLocation, `${context} somaLocation`);
    const toward = location(row.tosomaLocation, `${context} tosomaLocation`);
    for (const field of ["somaNeuromere", "entryNerve", "rootSide"] as const) {
      if (row[field] !== null && typeof row[field] !== "string") fail(`${context}: invalid ${field}`);
    }
    const i = c.indexOf(id);
    if (i < 0) continue;
    matched[i] = 1;
    const p = soma ?? toward;
    if (p) {
      positionKind[i] = soma ? 1 : 2;
      positions.set(p, 3 * i);
      for (let k = 0; k < 3; k++) { bounds.min[k] = Math.min(bounds.min[k], p[k]); bounds.max[k] = Math.max(bounds.max[k], p[k]); }
    }
    values.neuromere[i] = row.somaNeuromere as string ?? "";
    values.entryNerve[i] = row.entryNerve as string ?? "";
    const side = row.rootSide;
    values.rootSide[i] = side === "L" ? "left" : side === "R" ? "right" : side === "M" ? "midline" : side as string ?? "";
  }
  for (let i = 0; i < n; i++) if (!matched[i]) fail(`Annotations missing connectome bodyId ${c.rootId[i]}`);
  if (!positionKind.some((v) => v !== 0)) { bounds.min = [0, 0, 0]; bounds.max = [0, 0, 0]; }
  const position = new Uint16Array(3 * n);
  for (let i = 0; i < n; i++) if (positionKind[i]) {
    for (let k = 0; k < 3; k++) {
      const span = bounds.max[k] - bounds.min[k];
      position[3 * i + k] = span === 0 ? 0 : Math.round((positions[3 * i + k] - bounds.min[k]) / span * 65535);
    }
  }
  const columns = {} as AnatomyData["columns"];
  for (const name of ANATOMY_CATEGORIES) {
    const table = [...new Set(["", ...values[name]])].sort();
    if (table.length > 256) fail(`Too many anatomy ${name} values for u8 (${table.length})`);
    const codes = new Map(table.map((s, k) => [s, k]));
    columns[name] = { table, codes: Uint8Array.from(values[name], (s) => codes.get(s)!) };
  }
  return writeAnatomy({ source, connectomeSha256: await sha256(connectomeBuffer), bounds, position, positionKind, columns });
}

/** The public Feather is pinned before decompression, including for manual packs. */
export async function packAnatomy(annotations: ArrayBuffer, connectome: ArrayBuffer): Promise<Uint8Array<ArrayBuffer>> {
  const hash = await sha256(annotations);
  if (hash !== ANNOTATION_SHA256) fail(`Annotation SHA-256 mismatch: ${hash}; expected ${ANNOTATION_SHA256}. The source changed or is incomplete; do not repin without reviewing it.`);
  compressionRegistry.set(CompressionType.LZ4_FRAME, { decode: (b) => lz4.decompress(b) });
  try {
    const table = tableFromIPC(annotations);
    for (const field of FIELDS) if (!table.getChild(field)) fail(`Annotations have no ${field} column`);
    return await packAnatomyRows(table as unknown as Iterable<AnnotationRow>, connectome);
  } catch (error) {
    if (error instanceof PackError) throw error;
    fail(`Cannot read annotation Feather: ${(error as Error).message}`);
  }
}
