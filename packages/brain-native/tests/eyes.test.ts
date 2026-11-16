// The eyes, built natively and as WebAssembly, against the TypeScript's: the column table is the one in
// eye-columns.ts (src/eye_columns.cpp is generated from it and must be
// current), fly_brain_eye_directions gives the very floats of the
// TypeScript's eye map, each facet's L1, L2 and L3 resolve to the same
// neurons, Math.hypot (which the directions use) is V8's, and the cell-type
// patterns that pick the columnar relays and the vision readouts match
// params.ts's and vision.ts's regular expressions.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ACCEPTANCE, buildEyes } from "../../brain/src/eyes.ts";
import { CATEGORY_NAMES, loadConnectome } from "../../brain/src/format.ts";
import { mulberry32 } from "../../brain/src/sim.ts";
import { syntheticConnectome, syntheticEyeColumns } from "../../brain/src/test-helpers.ts";
import { EYE_COLUMNS_SOURCE, eyeColumnsSource } from "../scripts/eye-columns.ts";
import { BUILDS, CONNECTOME, columnsFile, harness, hex32, hex64, readBuffer, tempFile } from "./compare.ts";
import type { Columns } from "./compare.ts";

test("src/eye_columns.cpp is eye-columns.ts's table (regenerate it with scripts/eye-columns.ts)", () => {
  assert.ok(readFileSync(EYE_COLUMNS_SOURCE, "utf8") === eyeColumnsSource(), "src/eye_columns.cpp is out of date: node packages/brain-native/scripts/eye-columns.ts");
});

/** What the harness's eyes mode prints, computed by the TypeScript. */
function expectedEyes(data: ArrayBuffer, columns?: Columns): string[] {
  const eyes = buildEyes(loadConnectome(data), columns);
  if (!eyes) return ["ready 0 0 00000000"];
  const lines = [`ready ${eyes.left.l1.length} ${eyes.right.l1.length} ${hex32(ACCEPTANCE)}`];
  for (const side of ["left", "right"] as const) {
    const d = eyes.map[side].directions;
    const cells = eyes[side];
    for (let k = 0; k < cells.l1.length; k++) lines.push(`${hex32(d[3 * k])} ${hex32(d[3 * k + 1])} ${hex32(d[3 * k + 2])} ${cells.l1[k]} ${cells.l2[k]} ${cells.l3[k]}`);
  }
  return lines;
}

function nativeEyes(build: string, path: string, columns?: Columns): string[] {
  if (!columns) return harness(build, ["eyes", path], "");
  const dir = mkdtempSync(join(tmpdir(), "fly-brain-native-"));
  try {
    writeFileSync(join(dir, "columns"), columnsFile(columns));
    return harness(build, ["eyes", path, "--columns", join(dir, "columns")], "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const noData = existsSync(CONNECTOME) ? false : "no packages/brain/data/connectome.bin (npm run brain:fetch)";

for (const target of BUILDS) {
  test(`on the real connectome every facet looks where the TypeScript's does, to the bit, through the same cells (${target.name})`, { skip: target.skip || noData }, () => {
    const expected = expectedEyes(readBuffer(CONNECTOME));
    assert.equal(expected[0], `ready 880 892 ${hex32(ACCEPTANCE)}`);
    assert.deepEqual(nativeEyes(target.dir(), CONNECTOME), expected);
  });

  test(`the synthetic eye looks where the TypeScript's does, and a connectome without the columns has no eyes (${target.name})`, { skip: target.skip }, () => {
    const synthetic = syntheticConnectome();
    const file = tempFile(synthetic.bytes);
    try {
      const columns = syntheticEyeColumns(synthetic);
      const expected = expectedEyes(synthetic.bytes.slice().buffer, columns);
      assert.equal(expected.length, 9);
      assert.deepEqual(nativeEyes(target.dir(), file.path, columns), expected);
      assert.deepEqual(nativeEyes(target.dir(), file.path), ["ready 0 0 00000000"]);
    } finally {
      file.remove();
    }
  });

  test(`Math.hypot is V8's to the bit (${target.name})`, { skip: target.skip }, () => {
    const random = mulberry32(5);
    const pairs: [number, number][] = [];
    // The lattice offsets the directions are computed from, and around them.
    const radians = (d: number) => (d * Math.PI) / 180;
    for (let q = -40; q <= 40; q++) {
      for (let p = -40; p <= 40; p++) pairs.push([radians(((q - p) * Math.sqrt(3) * 5) / 2), radians(((q + p) * 5) / 2)]);
    }
    const view = new DataView(new ArrayBuffer(8));
    const anyDouble = () => {
      view.setUint32(0, Math.floor(random() * 2 ** 32), true);
      view.setUint32(4, Math.floor(random() * 2 ** 32), true);
      return view.getFloat64(0, true);
    };
    for (let k = 0; k < 30000; k++) pairs.push([random() * 4 - 2, random() * 4 - 2], [anyDouble(), anyDouble()], [random() * 1e-3, random() * 1e3]);
    const specials = [0, -0, 1, -1, 5e-324, 1e308, 1.7976931348623157e308, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN];
    for (const x of specials) for (const y of specials) pairs.push([x, y]);
    const lines = harness(target.dir(), ["hypot"], pairs.map(([x, y]) => `${hex64(x)} ${hex64(y)}`).join("\n") + "\n");
    const differences = pairs.filter(([x, y], k) => {
      const expected = Math.hypot(x, y);
      return Number.isNaN(expected) ? !/^(7ff|fff)/.test(lines[k]) : lines[k] !== hex64(expected);
    });
    assert.equal(lines.length, pairs.length);
    assert.deepEqual(differences.slice(0, 5), []);
  });

  test(`the columnar classes and the vision readouts' patterns match the TypeScript's regular expressions (${target.name})`, { skip: target.skip }, () => {
    const types = new Set<string>();
    const synthetic = loadConnectome(syntheticConnectome().bytes.slice().buffer);
    for (const name of CATEGORY_NAMES) for (const value of synthetic.columns[name].table) types.add(value);
    if (existsSync(CONNECTOME)) {
      const real = loadConnectome(readBuffer(CONNECTOME));
      for (const value of real.columns.type.table) types.add(value);
    }
    // Near misses of every alternative, and random strings of the characters they use.
    for (const each of ["", "L", "L0", "L1", "L5", "L6", "L1a", "C1", "C2", "C3", "C23", "T", "T1", "T5", "T6", "T4a", "T4d", "T4e", "T4A", "T4ab", "Tm", "Tm1", "Tm20", "Tm5Y",
      "Tm5a", "Tm5ab", "Tm5_a", "TmY", "TmY5", "TmY5a", "TmY5A", "TmY5a1", "Y", "Y1", "Y12", "Y1a", "Mi", "Mi1", "Mi15", "Mi1a", "mi1", " L1", "L1 ", "L1\n", "LC", "LC4", "LC10a",
      "LPLC2", "LPLC", "LLPC1", "LPC1", "LPCx", "LC4 ", "xLC4", "Tm1é", "T4é", "LC١"]) {
      types.add(each);
    }
    const random = mulberry32(9);
    const alphabet = "LCTmYiPab12345dzA_ é";
    for (let k = 0; k < 20000; k++) {
      let s = "";
      const length = Math.floor(random() * 6);
      for (let c = 0; c < length; c++) s += alphabet[Math.floor(random() * alphabet.length)];
      types.add(s);
    }
    // Line-based input: types with a newline can't be passed, and none occur.
    const list = [...types].filter((t) => !t.includes("\n"));
    const columnar = /^(L[1-5]|C[23]|T[1-5][a-d]?|Tm\d+[a-zA-Z]*|TmY\d+[a-z]*|Y\d+|Mi\d+)$/;
    const lines = harness(target.dir(), ["patterns"], list.join("\n") + "\n");
    const expected = list.map((t) => [columnar.test(t), /^T[45][a-d]$/.test(t), /^(LC|LPLC|LLPC|LPC)\d/.test(t)].map(Number).join(" "));
    const wrong = list.filter((_, k) => lines[k] !== expected[k]).map((t) => JSON.stringify(t));
    assert.deepEqual(wrong.slice(0, 10), []);
    assert.ok(lines.filter((line) => line.startsWith("1")).length > 50);
  });
}
