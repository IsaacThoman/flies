import assert from "node:assert/strict";
import { test } from "node:test";
import { distribution } from "./webPerf.ts";

test("performance summaries retain variance and average the middle pair", () => {
  assert.deepEqual(distribution([9, 1, 3, 5]), { n: 4, median: 4, min: 1, max: 9, p95: 9, samples: [9, 1, 3, 5] });
  assert.equal(distribution([7, 1, 3]).median, 3);
  assert.throws(() => distribution([]));
  assert.throws(() => distribution([NaN]));
});
