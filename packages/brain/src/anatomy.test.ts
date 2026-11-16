import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { tableFromIPC } from "apache-arrow";
import { anatomicalPosition, AnatomyFormatError, cordSegments, loadAnatomy, writeAnatomy } from "./anatomy.ts";
import type { AnatomyData, AnatomyHeader } from "./anatomy.ts";
import { loadConnectome } from "./format.ts";
import { DEFAULT_CONNECTOME_PATH } from "./node.ts";
import { ANATOMY_SOURCE, packAnatomy, packAnatomyRows } from "./pack-anatomy.ts";
import type { AnnotationRow } from "./pack-anatomy.ts";
import { bufferOf, packSynthetic } from "./test-helpers.ts";

const wiring = () => bufferOf(packSynthetic([
  { superClass: "vnc_intrinsic", type: "a", side: "left" },
  { superClass: "vnc_intrinsic", type: "b", side: "center" },
  { superClass: "vnc_intrinsic", type: "c" },
  { superClass: "vnc_sensory", type: "d" },
], [])) as ArrayBuffer;
const row = (bodyId: number, extra: Partial<AnnotationRow> = {}): AnnotationRow => ({ bodyId, somaLocation: null, tosomaLocation: null, somaNeuromere: null, entryNerve: null, rootSide: null, ...extra });
const rows = () => [
  row(1003, { entryNerve: "ProLN", rootSide: "L" }),
  row(1001, { somaLocation: [30, 40, 50], tosomaLocation: [999, 999, 999], somaNeuromere: "T2" }),
  row(1000, { somaLocation: [10, 20, 30], somaNeuromere: "T1" }),
  row(1002, { tosomaLocation: [20, 30, 40] }),
];

test("annotation join, deterministic packing, quantisation, views and display helpers", async () => {
  const c = wiring();
  const bytes = await packAnatomyRows(rows(), c);
  assert.deepEqual(await packAnatomyRows(rows().reverse(), c), bytes);
  const a = await loadAnatomy(bytes.buffer, c);
  assert.equal(a.positionCodes.buffer, bytes.buffer);
  assert.equal(a.positionCodes.byteOffset % 8, 0);
  assert.deepEqual([...a.positionKind], [1, 1, 2, 0]);
  assert.deepEqual(a.position(0), [0.08, 0.16, 0.24]);
  assert.deepEqual(a.position(1), [0.24, 0.32, 0.4]);
  assert.equal(a.position(3), null);
  const out: [number, number, number] = [0, 0, 0];
  assert.equal(a.position(2, out), out);
  assert.ok(Math.abs(out[0] - 0.16) < 0.16 / 65535);
  assert.deepEqual(a.unitBox(a.position(0)!), [0, 0, 0]);
  assert.deepEqual(a.unitBox(a.position(1)!), [1, 1, 1]);
  assert.equal(a.segment(0), "T1");
  assert.equal(a.segment(2), "");
  assert.equal(a.columns.entryNerve.value(3), "ProLN");
  assert.equal(a.columns.rootSide.value(3), "left");
  assert.equal(a.columns.rootSide.code("left"), 1);
  assert.equal(a.columns.rootSide.code("absent"), -1);
  assert.deepEqual(anatomicalPosition([500, 100, 200]), [100, 200, -200]);
  assert.throws(() => a.position(-1), RangeError);
  assert.throws(() => a.segment(4), RangeError);
  assert.throws(() => a.unitBox([NaN, 0, 0]), RangeError);
  const g = cordSegments(loadConnectome(c), a);
  assert.deepEqual(g.map((v) => [v.segment, v.side, [...v.neurons]]), [["", "", [2]], ["T1", "left", [0]], ["T2", "midline", [1]]]);
});

test("empty, absent and degenerate position axes round trip", async () => {
  for (const r of [rows().map((r) => ({ ...r, somaLocation: null, tosomaLocation: null })), rows().map((r) => ({ ...r, somaLocation: [10, 10, 10] }))]) {
    const a = await loadAnatomy((await packAnatomyRows(r, wiring())).buffer, wiring());
    assert.deepEqual(a.unitBox(a.header.bounds.min), [0, 0, 0]);
  }
  const empty = bufferOf(packSynthetic([], [])) as ArrayBuffer;
  assert.equal((await loadAnatomy((await packAnatomyRows([], empty)).buffer, empty)).header.neurons, 0);
});

test("packer rejects incomplete joins, duplicates, malformed values and unpinned sources", async () => {
  await assert.rejects(packAnatomyRows(rows().slice(1), wiring()), /missing connectome bodyId 1003/);
  await assert.rejects(packAnatomyRows([...rows(), rows()[0]], wiring()), /row 5: duplicate bodyId/);
  for (const bad of [{ bodyId: 0 }, { bodyId: 1.5 }, { somaLocation: [1, 2] }, { somaLocation: [1, 2, NaN] }, { somaLocation: [-1, 2, 3] }, { tosomaLocation: undefined }, { entryNerve: 4 }, { rootSide: false }, { somaNeuromere: [] }]) {
    const r = rows(); r[0] = { ...r[0], ...bad };
    await assert.rejects(packAnatomyRows(r, wiring()), /Annotations row 1[: ]/);
  }
  assert.ok((await packAnatomyRows([...rows(), row(9999)], wiring())).length > 0);
  await assert.rejects(packAnatomy(new ArrayBuffer(1), wiring()), /Annotation SHA-256 mismatch/);
});

function editHeader(bytes: Uint8Array, edit: (h: AnatomyHeader) => void): ArrayBuffer {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = view.getUint32(8, true);
  const h = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + size)));
  edit(h);
  const json = new TextEncoder().encode(JSON.stringify(h));
  const oldStart = Math.ceil((12 + size) / 8) * 8;
  const start = Math.ceil((12 + json.length) / 8) * 8;
  const out = new Uint8Array(start + bytes.length - oldStart);
  out.set(bytes.subarray(0, 12));
  new DataView(out.buffer).setUint32(8, json.length, true);
  out.set(json, 12);
  out.set(bytes.subarray(oldStart), start);
  return out.buffer;
}

test("format rejects malformed headers, sections, codes, flags, truncation and mismatched wiring", async () => {
  const c = wiring();
  const bytes = await packAnatomyRows(rows(), c);
  const badHeaders: ((h: AnatomyHeader) => void)[] = [
    (h) => { h.neurons = -1; }, (h) => { h.connectomeSha256 = "bad"; },
    (h) => { h.source.sha256 = "bad"; }, (h) => { h.source.license = ""; },
    (h) => { h.units = "nm" as AnatomyHeader["units"]; },
    (h) => { h.bounds.max[0] = -1; }, (h) => { h.bounds.min = [0, 1] as never; },
    (h) => { h.sections.position.offset = 8; }, (h) => { h.sections.rootSide.offset = 0; },
    (h) => { h.sections.position.type = "u8"; }, (h) => { h.sections.neuromere.length++; },
    (h) => { h.tables.neuromere = ["", "T2", "T1"]; }, (h) => { h.tables.neuromere = ["", "T1", "T1"]; },
    (h) => { h.tables.entryNerve = []; },
  ];
  for (const edit of badHeaders) await assert.rejects(loadAnatomy(editHeader(bytes, edit), c), AnatomyFormatError);
  for (const size of [0, 11, 100, bytes.length - 1]) await assert.rejects(loadAnatomy(bytes.slice(0, size).buffer, c), AnatomyFormatError);
  const a = await loadAnatomy(bytes.buffer, c);
  for (const [offset, value] of [[0, 0], [4, 2], [a.positionKind.byteOffset, 3], [a.positionKind.byteOffset + 1, 0], [a.columns.neuromere.codes.byteOffset, 255], [a.positionKind.byteOffset + 4, 1]]) {
    const copy = bytes.slice(); copy[offset] = value;
    await assert.rejects(loadAnatomy(copy.buffer, c), AnatomyFormatError);
  }
  const changed = c.slice(0); new Uint8Array(changed)[changed.byteLength - 1] ^= 1;
  await assert.rejects(loadAnatomy(bytes.buffer, changed), /Anatomy\/connectome mismatch: SHA-256/);
  const emptyData = { source: ANATOMY_SOURCE, connectomeSha256: a.header.connectomeSha256, bounds: a.header.bounds, position: new Uint16Array(), positionKind: new Uint8Array(), columns: Object.fromEntries(Object.entries(a.columns).map(([k, v]) => [k, { table: v.table, codes: new Uint8Array() }])) as AnatomyData["columns"] };
  await assert.rejects(loadAnatomy(writeAnatomy(emptyData).buffer, c), /neuron counts differ/);
  const badCount = editHeader(bytes, (h) => { h.connectomeSha256 = "0".repeat(64); });
  await assert.rejects(loadAnatomy(badCount, c), /mismatch/);
  const data: AnatomyData = { source: ANATOMY_SOURCE, connectomeSha256: a.header.connectomeSha256, bounds: a.header.bounds, position: a.positionCodes, positionKind: a.positionKind, columns: a.columns };
  assert.deepEqual(writeAnatomy(data), bytes);
  assert.throws(() => writeAnatomy({ ...data, position: new Uint16Array(1) }), /Bad anatomy position array/);
});

const anatomyPath = join(dirname(DEFAULT_CONNECTOME_PATH), "anatomy.bin");
const skip = !existsSync(anatomyPath) || !existsSync(DEFAULT_CONNECTOME_PATH) ? "no real anatomy/connectome pair; run npm run brain:fetch" : false;
const read = (p: string) => Uint8Array.from(readFileSync(p)).buffer;

// Each tuple: neurons, soma, fibre-only, segment, entry nerve, root side.
const COVERAGE: Record<string, number[]> = {
  ENS: [50, 1, 0, 0, 0, 0], ascending_neuron: [1846, 1812, 27, 1846, 0, 0],
  cb_efferent: [4, 4, 0, 4, 0, 0], cb_endocrine: [72, 68, 0, 2, 0, 0], cb_intrinsic: [32164, 31997, 77, 5082, 0, 0],
  cb_motor: [107, 103, 0, 20, 0, 0], cb_sensory: [4868, 0, 0, 0, 4859, 4868], cb_sensory_tbc: [14, 0, 0, 0, 8, 7],
  descending_neuron: [1314, 1308, 0, 755, 0, 0], descending_neuron_tbc: [2, 0, 0, 0, 0, 0],
  efferent_ascending: [8, 8, 0, 8, 0, 0], efferent_descending: [4, 4, 0, 0, 0, 0],
  ol_intrinsic: [89403, 81055, 630, 25, 0, 3], ol_sensory: [6098, 28, 0, 0, 0, 6091],
  sensory_ascending: [537, 0, 0, 0, 536, 536], sensory_ascending_tbc: [2, 0, 0, 0, 1, 1], sensory_descending: [12, 0, 0, 2, 12, 12],
  visual_centrifugal: [563, 563, 0, 32, 0, 0], visual_projection: [9201, 9162, 17, 46, 0, 0], visual_projection_tbc: [2, 2, 0, 0, 0, 0],
  vnc_efferent: [94, 90, 1, 93, 1, 1], vnc_endocrine: [22, 22, 0, 22, 3, 4], vnc_intrinsic: [13161, 12729, 223, 13152, 8, 2],
  vnc_motor: [708, 703, 1, 707, 0, 0], vnc_sensory: [6370, 2, 0, 0, 6355, 6357], vnc_sensory_tbc: [36, 0, 0, 0, 23, 24], vnc_tbc: [38, 1, 0, 3, 0, 0],
};

test("real anatomy coverage by every super class and cord segment", { skip }, async () => {
  const wiring = read(DEFAULT_CONNECTOME_PATH); const c = loadConnectome(wiring); const a = await loadAnatomy(read(anatomyPath), wiring);
  assert.ok(readFileSync(anatomyPath).length < 2_000_000);
  assert.deepEqual(c.columns.superClass.table.filter(Boolean), Object.keys(COVERAGE).sort());
  for (const [sc, expected] of Object.entries(COVERAGE)) {
    const ids = c.find({ superClass: sc });
    const count = (f: (i: number) => boolean) => ids.filter(f).length;
    assert.deepEqual([ids.length, count((i) => a.positionKind[i] === 1), count((i) => a.positionKind[i] === 2), count((i) => !!a.segment(i)), count((i) => !!a.columns.entryNerve.value(i)), count((i) => !!a.columns.rootSide.value(i))], expected, sc);
  }
  const groups = cordSegments(c, a);
  const total = (s: string) => groups.filter((g) => g.segment === s).reduce((n, g) => n + g.neurons.length, 0);
  const segments = { "": 9, T1: 3380, T2: 4493, T3: 3417, A1: 757, A2: 180, A3: 180, A4: 150, A5: 123, A6: 127, A7: 87, A8: 152, A9: 104, A10: 2 };
  for (const [segment, count] of Object.entries(segments)) assert.equal(total(segment), count, segment);
  const sides = (segment: string) => ["left", "right", "midline", ""].map((side) => groups.find((g) => g.segment === segment && g.side === side)?.neurons.length ?? 0);
  assert.deepEqual(sides("T1"), [1652, 1643, 85, 0]);
  assert.deepEqual(sides("T2"), [2197, 2205, 90, 1]);
  assert.deepEqual(sides("T3"), [1707, 1679, 31, 0]);
  assert.equal(groups.reduce((n, g) => n + g.neurons.length, 0), 13161);
  assert.equal(new Set(groups.flatMap((g) => [...g.neurons])).size, 13161);
  assert.deepEqual(groups.filter((g) => !g.segment).map((g) => [g.side, g.neurons.length]), [["", 7], ["left", 2]]);
});

test("real anatomy has correct handedness, outer optic lobes, posterior cord and ordered leg neuromeres", { skip }, async () => {
  const wiring = read(DEFAULT_CONNECTOME_PATH); const c = loadConnectome(wiring); const a = await loadAnatomy(read(anatomyPath), wiring);
  const mean = (ids: Uint32Array, axis: number) => {
    const points = Array.from(ids, (i) => a.position(i)).filter((p) => p !== null).map((p) => anatomicalPosition(p));
    assert.ok(points.length > 0);
    return points.reduce((sum, p) => sum + p[axis], 0) / points.length;
  };
  for (const superClass of ["ol_intrinsic", "cb_intrinsic", "vnc_intrinsic"]) {
    assert.ok(mean(c.find({ superClass, side: "left" }), 0) > 0, superClass);
    assert.ok(mean(c.find({ superClass, side: "right" }), 0) < 0, superClass);
  }
  assert.ok(mean(c.find({ superClass: "ol_intrinsic", side: "left" }), 0) > mean(c.find({ superClass: "cb_intrinsic", side: "left" }), 0) + 100);
  assert.ok(mean(c.find({ superClass: "ol_intrinsic", side: "right" }), 0) < mean(c.find({ superClass: "cb_intrinsic", side: "right" }), 0) - 100);
  assert.ok(mean(c.find({ superClass: "vnc_intrinsic" }), 2) < mean(c.find({ superClass: "cb_intrinsic" }), 2) - 400);
  const z = (segment: string) => mean(c.filter((i) => a.segment(i) === segment && c.columns.superClass.value(i) === "vnc_intrinsic"), 2);
  assert.ok(z("T1") > z("T2") + 100);
  assert.ok(z("T2") > z("T3") + 100);
  // Every decoded position remains inside the recorded dataset box.
  for (let i = 0; i < c.neurons; i++) {
    const p = a.position(i); if (!p) continue;
    assert.ok(a.unitBox(p).every((v) => v >= -1e-12 && v <= 1 + 1e-12));
  }
});

const annotationsPath = join(dirname(DEFAULT_CONNECTOME_PATH), "annotations.feather");
test("real pinned Feather reproduces the sidecar and preserves positions within half a quantisation step", { skip: skip || (!existsSync(annotationsPath) && "no local annotations.feather; download the README source") }, async () => {
  const wiring = read(DEFAULT_CONNECTOME_PATH);
  const annotationBytes = read(annotationsPath);
  const packed = await packAnatomy(annotationBytes, wiring);
  assert.deepEqual(packed, new Uint8Array(read(anatomyPath)));
  const a = await loadAnatomy(packed.buffer, wiring);
  const c = loadConnectome(wiring);
  const table = tableFromIPC(annotationBytes);
  let matched = 0;
  for (const row of table) {
    const i = c.indexOf(Number(row.bodyId));
    if (i < 0) continue;
    matched++;
    const raw = row.somaLocation ?? row.tosomaLocation;
    const p = a.position(i);
    if (!raw) { assert.equal(p, null); continue; }
    assert.ok(p);
    const original = Array.from(raw as Iterable<bigint>, Number);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(p[k] - original[k] * 0.008) <= (a.header.bounds.max[k] - a.header.bounds.min[k]) / 65535 / 2 + 1e-9);
  }
  assert.equal(matched, 166700);
});
