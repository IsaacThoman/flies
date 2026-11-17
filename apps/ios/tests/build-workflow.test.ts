import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "../../..");

test("Apple host changes get an unsigned simulator compile without booting devices", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/apple-compile.yml"), "utf8");
  const paths = [...workflow.matchAll(/^ {6}- '([^']+)'$/gm)].map((m) => m[1]);
  for (const file of ["apps/ios/src/App.swift", "apps/tvos/src/Host.mm", "packages/brain-native/src/brain.cpp", "scripts/ios.ts", "scripts/tvos.ts", "scripts/apple.ts", "scripts/appleConfig.ts", "scripts/iosAssets.ts", "scripts/tvosAssets.ts", "scripts/webBuild.ts", "vite.config.ts", "tsconfig.json", "package-lock.json", ".github/workflows/apple-compile.yml"]) {
    assert.ok(paths.some((glob) => path.matchesGlob(file, glob)), `${file} triggers compilation`);
  }
  assert.ok(!paths.some((glob) => path.matchesGlob("docs/web.md", glob)), "documentation alone spends no macOS minutes");
  assert.match(workflow, /runs-on: macos-/);
  assert.match(workflow, /actions\/cache@v4/);
  assert.match(workflow, /\.\/\.github\/actions\/brain/);
  assert.match(workflow, /node scripts\/ios.ts build --sim --no-sign/);
  assert.match(workflow, /node scripts\/tvos.ts build --sim/);
  assert.match(workflow, /TVOS_WEATHERKIT: 1/);
  assert.doesNotMatch(workflow, /simctl|boot|secrets\.|allowProvisioning|archive|upload/i);
});

test("unsigned iOS compilation cannot accidentally sign a device build or run tests", async () => {
  const { spawnSync } = await import("node:child_process");
  for (const args of [["--no-sign"], ["--sim", "--no-sign", "--for-testing"]]) {
    const result = spawnSync(process.execPath, ["scripts/ios.ts", "build", ...args], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--no-sign requires --sim and cannot be used with --for-testing/);
  }
});

test("draft PRs skip Apple compilation and marking them ready triggers it", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/apple-compile.yml"), "utf8");
  assert.match(workflow, /pull_request:\n {4}types: \[opened, synchronize, reopened, ready_for_review\]/);
  assert.match(workflow, /jobs:\n {2}compile:\n {4}if: github.event_name != 'pull_request' \|\| !github.event.pull_request.draft\n/);
});
