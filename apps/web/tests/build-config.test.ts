import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { resolveConfig } from "vite";
import { brain } from "../../../scripts/webBuild.ts";

const root = path.join(import.meta.dirname, "../../..");

test("a web build without its connectome fails with a fetch instruction, in any mode", async (t) => {
  const exists = fs.existsSync;
  t.mock.method(fs, "existsSync", (file: fs.PathLike) => String(file).endsWith("/data/connectome.bin") ? false : exists(file));
  for (const mode of ["production", "development"]) {
    await assert.rejects(resolveConfig({ configFile: false, mode, plugins: [brain()] }, "build"), /connectome.*npm run brain:fetch/);
  }
});

test("development can still start without a connectome", async (t) => {
  const exists = fs.existsSync;
  t.mock.method(fs, "existsSync", (file: fs.PathLike) => String(file).endsWith("/data/connectome.bin") ? false : exists(file));
  const config = await resolveConfig({ configFile: false, plugins: [brain()] }, "serve");
  assert.equal(config.define?.__FLY_BRAIN__, "null");
});

test("a tvOS archive rejects an inherited diagnostic entry before preparing an app", () => {
  const result = spawnSync(process.execPath, ["scripts/tvos.ts", "archive", "--version", "1.2.3"], {
    cwd: root, encoding: "utf8", env: { ...process.env, ROOMS_URL: "", TVOS_ENTRY: "apps/tvos/tests/scene.ts" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /archive.*TVOS_ENTRY/);
});

test("a tvOS diagnostic build can still select its entry", async (t) => {
  const entry = process.env.TVOS_ENTRY;
  process.env.TVOS_ENTRY = "apps/tvos/tests/scene.ts";
  t.after(() => { if (entry === undefined) delete process.env.TVOS_ENTRY; else process.env.TVOS_ENTRY = entry; });
  const config = await resolveConfig({ configFile: path.join(root, "apps/tvos/vite.config.ts") }, "build");
  assert.equal(config.build.rolldownOptions.input, "apps/tvos/tests/scene.ts");
});
