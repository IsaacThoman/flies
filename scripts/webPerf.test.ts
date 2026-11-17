import assert from "node:assert/strict";
import { test } from "node:test";
import { distribution } from "./webPerf.ts";

test("performance summaries retain variance and average the middle pair", () => {
  assert.deepEqual(distribution([9, 1, 3, 5]), { n: 4, median: 4, min: 1, max: 9, p95: 9, samples: [9, 1, 3, 5] });
  assert.equal(distribution([7, 1, 3]).median, 3);
  assert.throws(() => distribution([]));
  assert.throws(() => distribution([NaN]));
});

test("transfer accounting includes completed GET bodies, ranges and no HEAD body", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { serveSite } = await import("./serve.ts");
  const dir = mkdtempSync(join(tmpdir(), "fly-perf-transfer-"));
  writeFileSync(join(dir, "index.html"), "hello");
  const sizes: number[] = [];
  const site = await serveSite({ dir, transferred: (_file, bytes) => sizes.push(bytes) });
  try {
    assert.equal(await (await fetch(site.url)).text(), "hello");
    assert.equal(await (await fetch(site.url, { headers: { Range: "bytes=1-3" } })).text(), "ell");
    await fetch(site.url, { method: "HEAD" });
    assert.deepEqual(sizes, [5, 3]);
  } finally { await site.close(); rmSync(dir, { recursive: true, force: true }); }
});
