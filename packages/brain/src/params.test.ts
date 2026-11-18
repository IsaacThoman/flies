import assert from "node:assert/strict";
import { test } from "node:test";
import { CATEGORY_NAMES, loadConnectome, writeConnectome } from "./format.ts";
import type { CategoryName, ConnectomeData } from "./format.ts";
import { COLUMNAR_MIN_CELLS, columnar } from "./params.ts";

test("a columnar type's cells are counted by name, however often its table repeats the name", () => {
  // Tm1 twice in the table, its cells split between the two codes: together enough, apart neither.
  const n = COLUMNAR_MIN_CELLS;
  const tables: Record<CategoryName, string[]> = Object.fromEntries(CATEGORY_NAMES.map((name) => [name, [""]])) as Record<CategoryName, string[]>;
  tables.superClass = ["ol_intrinsic"];
  tables.side = ["left"];
  tables.type = ["", "Tm1", "Tm1"];
  const columns = {} as ConnectomeData["columns"];
  for (const name of CATEGORY_NAMES) columns[name] = { codes: name === "type" ? Uint16Array.from({ length: n }, (_, i) => (i < n / 2 ? 1 : 2)) : new Uint8Array(n), table: tables[name] };
  const data = writeConnectome({ synapses: 0, rootId: Uint32Array.from({ length: n }, (_, i) => i + 1), ptr: new Uint32Array(n + 1), post: new Uint32Array(0), count: new Uint16Array(0), ntConfidence: new Uint8Array(n), columns });
  assert.deepEqual([...columnar(loadConnectome(data.slice().buffer))], Array(n).fill(1));
});
