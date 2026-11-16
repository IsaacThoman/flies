import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { loadConnectome } from "./format.ts";
import { packSynthetic } from "./test-helpers.ts";

const script = fileURLToPath(new URL("../scripts/fetch.ts", import.meta.url));

for (const failure of ["offline", "http", "changed", "interrupted", "fully-offline"]) {
  test(`brain:fetch leaves usable wiring and explains how to recover when annotations are ${failure}`, () => {
    const dir = mkdtempSync(join(tmpdir(), "fly-anatomy-fetch-"));
    try {
      const bytes = packSynthetic([{ superClass: "cb_intrinsic", type: "test" }], []);
      const input = join(dir, "input.bin");
      const out = join(dir, "connectome.bin");
      const mock = join(dir, "fetch.mjs");
      writeFileSync(input, bytes);
      if (failure === "fully-offline") writeFileSync(out, bytes);
      writeFileSync(mock, `
        import { readFileSync } from 'node:fs';
        globalThis.fetch = async (url) => {
          if (${JSON.stringify(failure)} === "fully-offline") throw new TypeError("offline before any download");
          if (url === 'https://example.invalid/connectome.bin') return new Response(readFileSync(${JSON.stringify(input)}));
          switch (${JSON.stringify(failure)}) {
            case 'offline': throw new TypeError('fetch failed: offline');
            case 'http': return new Response('', { status: 503, statusText: 'Service Unavailable' });
            case 'changed': return new Response('source changed');
            case 'interrupted': return new Response(new ReadableStream({ start(controller) { controller.error(new Error('download interrupted')); } }));
          }
        };
      `);
      const result = spawnSync(process.execPath, ["--import", mock, script, "--url", "https://example.invalid/connectome.bin", "--out", out], { encoding: "utf8", timeout: 30_000 });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1, result.stderr);
      assert.deepEqual(readFileSync(out), Buffer.from(bytes));
      assert.equal(loadConnectome(Uint8Array.from(readFileSync(out)).buffer).neurons, 1);
      assert.equal(existsSync(join(dir, "anatomy.bin")), false);
      assert.equal(result.stderr.trim().split("\n").length, 1, result.stderr);
      if (failure === "fully-offline") {
        assert.match(result.stderr, /existing connectome.bin is still usable/);
        assert.match(result.stderr, /anatomy.bin was not refreshed/);
      } else {
        assert.match(result.stderr, /anatomy.bin was not written/);
        assert.match(result.stderr, /usable connectome.bin/);
        assert.match(result.stderr, /manual annotation route/);
      }
      assert.match(result.stderr, /Retry npm run brain:fetch/);
      if (failure === "changed") assert.match(result.stderr, /SHA-256 mismatch/);
      if (failure === "offline") assert.match(result.stderr, /offline/);
      if (failure === "http") assert.match(result.stderr, /503 Service Unavailable/);
      if (failure === "interrupted") assert.match(result.stderr, /download interrupted/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
