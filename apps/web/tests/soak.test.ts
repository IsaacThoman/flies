import assert from "node:assert/strict";
import { test } from "node:test";
import { trend } from "../../../scripts/webSoak.ts";

test("the soak compares disjoint windows, reports an hourly slope, and needs enough evidence", () => {
  assert.equal(trend([{ seconds: 0, value: 1 }], 0), null);
  const rows = Array.from({ length: 8 }, (_, i) => ({ seconds: i * 60, value: 100 + i * 2 }));
  assert.deepEqual(trend(rows, 0), { first: 101, last: 113, perHour: 120, verdict: "growing" });
  assert.equal(trend(rows, 12)?.verdict, "flat");
  assert.equal(trend(rows.map((r) => ({ ...r, value: -r.value })), 0)?.verdict, "falling");
});
